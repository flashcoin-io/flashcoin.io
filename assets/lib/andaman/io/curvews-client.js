/**
 * A secure client implementing CurveZMQ on top of websocket
 */
var events = require('events'),
	machina = require('machina'),
	nacl = require('tweetnacl'),
	nacl_util = require('tweetnacl-util'),
	BufferView = require('./buffer-view'),
	PollSocket = require('./poll-socket'),
	util = require('util');

function CurveWebSocket(opts) {
	this.srv_pub_p = nacl_util.decodeBase64(opts.server_publicKey);
	var keys = nacl.box.keyPair();
	this.pub_t = keys.publicKey;
	this.priv_t = keys.secretKey;
	
	// for the time being we have no permanent
	this.pub_p = this.pub_t;
	this.priv_p = this.priv_t;
	this.message_buf = new BufferView(new Uint8Array(64*1024));
	this.fsm = this._fsm(opts);
}

util.inherits(CurveWebSocket, events.EventEmitter);

CurveWebSocket.prototype.encode_hello = function() {
	var pkt_hello = new BufferView(new Uint8Array(215+16));
	pkt_hello.fill(0);
	pkt_hello.rewind();
	pkt_hello.writeUTF8('HELLO');
	pkt_hello.writeUInt8(1);
	pkt_hello.writeUInt8(0);
	pkt_hello.fill(0, pkt_hello.offset, pkt_hello.offset+72);
	pkt_hello.skip(72);
	pkt_hello.append(this.pub_t);

	var nonce = gen_nonce('CurveZMQHELLO---', 8);
	var zeros = new Uint8Array(64);
	var box = nacl.box(zeros, nonce, this.srv_pub_p, this.priv_t);
	pkt_hello.append(nonce);
	pkt_hello.append(new Uint8Array(box.buffer));
	
	return {pkt: pkt_hello.buffer, s_nonce: nonce.subarray(16)};
}

CurveWebSocket.prototype.decode_welcome = function(pkt) {
	if ( pkt.length() !== (183+32) ) 
		return {err: 'wrong length'};
	
	var cmd = pkt.readUTF8(7);
	if ( cmd !== 'WELCOME' )
		return { err: 'wrong cmd' };	
	
	var welcome_nonce = pkt.slice(pkt.offset, pkt.offset+24);
	pkt.skip(24);
	var welcome = nacl.box.open(pkt.slice(pkt.offset+16), welcome_nonce, this.srv_pub_p, this.priv_t);
	if ( ! welcome )
		return {err : 'authentication fails'};
	var srv_pub_t = welcome.subarray(0,32);
	
	var cookie = welcome.subarray(32);
	return {c:cookie, sk: srv_pub_t};
}

CurveWebSocket.prototype.decode_ready = function(pkt) {
	if ( pkt.length() < 46 ) 
		return {err: 'wrong length'};
	
	var cmd = pkt.readUTF8(5);
	if ( cmd !== 'READY' )
		return { err: 'wrong cmd' };
	
	var ready_nonce = pkt.slice(pkt.offset, pkt.offset+24);
	pkt.skip(24);
		
	var ready = nacl.box.open(pkt.slice(pkt.offset+16), ready_nonce, this.srv_pub_t, this.priv_t);
	if ( ! ready )
		return {err : 'authentication fails'};
	// no need to check meta data for the time being
	return {s_nonce: ready_nonce.subarray(16)};
}

CurveWebSocket.prototype.send = function(data) {
	increment_nonce(this.fsm.short_nonce);
	var msg = this.encode_message(data, this.message_buf, this.fsm.short_nonce);
	this.ws.send(msg.pkt);
}

CurveWebSocket.prototype.close = function() {
	if ( this.fsm.ws )
		this.fsm.ws.close();
}

CurveWebSocket.prototype.encode_message = function(payload, pkt_message, short_nonce) {
	pkt_message.rewind();
	pkt_message.writeUTF8('MESSAGE');
	
	var mark = pkt_message.offset;
	pkt_message.writeUTF8('CurveZMQMESSAGE-');
	pkt_message.append(short_nonce);
	var message_nonce = pkt_message.slice(mark, pkt_message.offset);
	
	mark = pkt_message.offset;	
	pkt_message.append(payload);
	
	var box = nacl.box(pkt_message.slice(mark, pkt_message.offset), message_nonce, this.srv_pub_t, this.priv_t);
	var b = new Uint8Array(box.buffer);
	pkt_message.append(b, mark);
	pkt_message.set(mark+b.byteLength);
	return {pkt: pkt_message.buffer.subarray(0, pkt_message.offset) };	
}

CurveWebSocket.prototype.decode_message = function(pkt, short_nonce) {
	if ( pkt.length() < 49 ) 
		return {err: 'wrong length'};
		
	var cmd = pkt.readUTF8(7);
	if ( cmd !== 'MESSAGE' )
		return { err: 'wrong cmd' };
		
	var message_nonce = pkt.slice(pkt.offset, pkt.offset+24);
	pkt.skip(24);
	
	var expected_nonce = new BufferView(new Uint8Array(24));
	expected_nonce.writeUTF8('CurveZMQMESSAGE-');
	expected_nonce.append(short_nonce);
	
	var err = comp(expected_nonce.buffer, message_nonce);
	if ( err )
		return {err: 'wrong nonce'};
	var message = nacl.box.open(pkt.slice(pkt.offset+16), message_nonce, this.srv_pub_t, this.priv_t);
	if ( ! message )
		return {err : 'authentication fails'};
	
	return {data: message};
}

CurveWebSocket.prototype.encode_initiate = function(cookie, short_nonce) {
	var vouch = new BufferView(new Uint8Array(120));
	var vouch_nonce = gen_nonce('VOUCH---', 16);
	vouch.append(vouch_nonce);
	vouch.append(this.pub_t);
	vouch.append(this.srv_pub_p);
	var vouch_box = nacl.box(vouch.slice(24, 24+64), vouch_nonce, this.srv_pub_t, this.priv_p);
	vouch.append(new Uint8Array(vouch_box.buffer), 24);
	
	var len = 8+cookie.byteLength+24+32+vouch.length()+32;
	var pkt_initiate = new BufferView(new Uint8Array(len));
	pkt_initiate.writeUTF8('INITIATE');
	pkt_initiate.append(cookie);
	var mark = pkt_initiate.offset;
	pkt_initiate.writeUTF8('CurveZMQINITIATE');
	pkt_initiate.append(short_nonce);
	var initiate_nonce = pkt_initiate.slice(mark, pkt_initiate.offset);
	mark = pkt_initiate.offset;	
	pkt_initiate.append(this.pub_p);
	pkt_initiate.append(vouch.buffer);
	var init_box = nacl.box(pkt_initiate.slice(mark, pkt_initiate.offset), initiate_nonce, this.srv_pub_t, this.priv_t);
	pkt_initiate.append(new Uint8Array(init_box.buffer), mark);

	return pkt_initiate.buffer;
}

CurveWebSocket.prototype._fsm = function(opts) {
	var owner = this;
	var m = new machina.Fsm({
		initialState : "init",

		states : {
			init : {
				_onEnter : function() {
					if ( opts.poll ) {
						this.ws = new PollSocket(opts);
					}
					else {
						this.ws = new WebSocket(opts.url);
						this.ws.binaryType = "arraybuffer";						
					}
					var self = this;
					this.ws.addEventListener('open', function() {
						console.log('connected websocket with', opts.url);
						self.ws.addEventListener('message', function(data) {
							self.handle('data', new BufferView(new Uint8Array(data.data)));
						});
						self.ws.addEventListener('close', function() {
							console.log('backing ws closed', self.ws.readyState);							
							owner.emit('close');
						});
						self.ws.addEventListener('error', function() {
							console.log('backing ws error', self.ws.readyState);
							owner.emit('error');
						});
						self.transition('hello');
					});
				}
			},
			
			hello : {
				_onEnter : function() {
					var hello = owner.encode_hello();
					this.short_nonce = hello.s_nonce;
					console.log('sending hello');
				    this.ws.send(hello.pkt);
				    this.transition('wait_welcome');
				}				
			},
			
			wait_welcome : {
				data : function(buffer) {
					var welcome = owner.decode_welcome(buffer);
					if ( ! welcome.err ) {
						owner.srv_pub_t = welcome.sk;
						increment_nonce(this.short_nonce);
						var pkt = owner.encode_initiate(welcome.c, this.short_nonce);
						console.log('received welcome, sennding initiate');
						this.ws.send(pkt);
						this.transition('wait_ready');
					}
					else {
						owner.emit('err', welcome.err);
						this.ws.close();
					}					
				}
			},
			
			wait_ready : {
				data : function(buffer) {
					var ready = owner.decode_ready(buffer);
					if ( ! ready.err ) {
						console.log('channel ready');
						owner.ws = this.ws;
						owner.emit('open');
						this.srv_short_nonce = ready.s_nonce;
						this.transition('wait_message');
					}
					else {
						owner.emit('err', ready.err);
						this.ws.close();
					}
				}
			},
			
			wait_message : {
				data : function(buffer) {
					increment_nonce(this.srv_short_nonce);
					var message = owner.decode_message(buffer, this.srv_short_nonce);
					if ( ! message.err )
						owner.emit('message', message.data);
					else {
						owner.emit('err', message.err);
						this.ws.close();
					}					
				}
			}
		}
	});
	return m;
};

module.exports = CurveWebSocket;

const MAX_INT = Math.pow(2, 32); 
function increment_nonce(n) {
	var hi = (n[0] << 24 & 0xffffffff) | (n[1] << 16 & 0xffffff) | (n[2] << 8 & 0xffff ) | (n[3] & 0xff);
	var lo = (n[4] << 24 & 0xffffffff) | (n[5] << 16 & 0xffffff) | (n[6] << 8 & 0xffff ) | (n[7] & 0xff);
	lo += 1;
	if ( lo >= MAX_INT ) {
		lo -= MAX_INT;
		hi += 1;
	}
	n[0] = (hi >>> 24 & 0xff);
	n[1] = (hi >>> 16 & 0xff);
	n[2] = (hi >>> 8 & 0xff);
	n[3] = (hi & 0xff);
	n[4] = (lo >>> 24 & 0xff);
	n[5] = (lo >>> 16 & 0xff);
	n[6] = (lo >>> 8 & 0xff);
	n[7] = (lo & 0xff);
};

function comp(a, b) {
	if ( a.byteLength == b.byteLength ) {
		for ( var i = 0; i < a.byteLength; i++ )
			if ( a[i] != b[i] )
				return i+':' + a[i] + '<->' + b[i];
	}
	else
		return 'len<>';
}

function gen_nonce(prefix, len) {
	var b = new Uint8Array(24);
	var buf = new BufferView(b);
	var start = buf.offset;
	buf.writeUTF8(prefix);
	var rnd = nacl.randomBytes(len);
	buf.append(rnd);
	return b;
}

