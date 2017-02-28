/**
 * Server-to-server curvews client
 */
var events = require('events'),
	machina = require('machina'),
	webSocket = require('ws'),
	sodium = require('sodium').api,
	log = require('log4js').getLogger('cws'),
	// PollSocket = require('./poll-socket'),
	util = require('util');

function CurveClient(opts) {
	this.srv_pub_p = new Buffer(opts.srv_publicKey, 'base64');
	this.pub_p = new Buffer(opts.publicKey, 'base64');
	this.priv_p = new Buffer(opts.secretKey, 'base64');
	this.path = opts.path;
	this.poll = opts.poll;
	var keys = sodium.crypto_box_keypair();
	this.pub_t = keys.publicKey;
	this.priv_t = keys.secretKey;
	this.message_buf = new Buffer(64*1024);
}

util.inherits(CurveClient, events.EventEmitter);

CurveClient.prototype.start = function(host, port) {
	this.fsm = this.create_fsm(host, port);
};

CurveClient.prototype.encode_hello = function() {
	var pkt_hello = new Buffer(215+16);

	var p = 0;
	var len = pkt_hello.write('HELLO');
	p += len;

	pkt_hello.writeUInt8(1, p);
	p += 1;
	pkt_hello.writeUInt8(0, p);
	p += 1;

	pkt_hello.fill(0, p, p+72);
	p += 72;

	this.pub_t.copy(pkt_hello, p);
	p += 32;

	var nonce = gen_nonce('CurveZMQHELLO---', 8);
	var zeros = new Buffer(64);
	zeros.fill(0);

	var box = sodium.crypto_box(zeros, nonce, this.srv_pub_p, this.priv_t);

	nonce.copy(pkt_hello, p);
	p += 24;

	box.copy(pkt_hello, p);
	p += box.length;


	return {pkt: pkt_hello, s_nonce: nonce.slice(16)};
};

CurveClient.prototype.decode_welcome = function(pkt) {
	if ( pkt.length !== (183+32) ) 
		return {err: 'wrong length'};

	var p = 0;
	var cmd = pkt.toString('utf8', 0, 7);
	if ( cmd !== 'WELCOME' )
		return { err: 'wrong cmd' };
	p += 7;

	var welcome_nonce = pkt.slice(p, p+24);
	p += 24;

	var welcome = sodium.crypto_box_open(pkt.slice(p), welcome_nonce, this.srv_pub_p, this.priv_t);
	if ( ! welcome )
		return {err : 'authentication fails'};

	var srv_pub_t = welcome.slice(0,32);

	var cookie = welcome.slice(32);
	return {c:cookie, sk: srv_pub_t};
};

CurveClient.prototype.decode_ready = function(pkt) {
	if ( pkt.length < 46 ) 
		return {err: 'wrong length'};

	var p = 0;
	var cmd = pkt.toString('utf8', 0, 5);
	if ( cmd !== 'READY' )
		return { err: 'wrong cmd' };
	p += 5;

	var ready_nonce = pkt.slice(p, p+24);
	p += 24;

	var ready = sodium.crypto_box_open(pkt.slice(p), ready_nonce, this.srv_pub_t, this.priv_t);
	if ( ! ready )
		return {err : 'failed to open ready box'};
	// no need to check meta data for the time being
	return {s_nonce: ready_nonce.slice(16)};
};

CurveClient.prototype.send = function(data) {
	if ( ! this.fsm.connected ) {
		log.error('not connected');
		return false;
	}
	increment_nonce(this.fsm.short_nonce);
	var payload = to_buf(data);
	var msg = this.encode_message(payload, this.message_buf, this.fsm.short_nonce);
	this.fsm.ws.send(msg.pkt);
	return true;
};

CurveClient.prototype.stop = function() {
	if ( this.fsm.connected )
		this.fsm.ws.close();
};

CurveClient.prototype.encode_message = function(payload, pkt_message, short_nonce) {
	var p = 0;
	var len = pkt_message.write('MESSAGE');
	p += len;
	var mark = p;
	len = pkt_message.write('CurveZMQMESSAGE-', p);
	p += len;
	short_nonce.copy(pkt_message, p);
	p += short_nonce.length;

	var message_nonce = pkt_message.slice(mark, p);
	var box = sodium.crypto_box(payload, message_nonce, this.srv_pub_t, this.priv_t);
	box.copy(pkt_message, p);
	p += box.length;

	return {pkt: pkt_message.slice(0, p)};
};

CurveClient.prototype.decode_message = function(pkt, short_nonce) {

	if ( pkt.length < 49 ) 
		return {err: 'wrong length'};

	var p = 0;
	var cmd = pkt.toString('utf8', 0, 7);
	if ( cmd !== 'MESSAGE' )
		return { err: 'wrong cmd' };

	p += 7; 
	var message_nonce = pkt.slice(p, p+24);
	p += 24;

	var expected_nonce = new Buffer(24);
	expected_nonce.write('CurveZMQMESSAGE-');
	short_nonce.copy(expected_nonce, 16);

	var err = comp(expected_nonce, message_nonce);
	if ( err )
		return {err: 'wrong nonce'};

	var message = sodium.crypto_box_open(pkt.slice(p), message_nonce, this.srv_pub_t, this.priv_t);
	if ( ! message )
		return {err : 'authentication fails'};

	return {data: message};
};

CurveClient.prototype.encode_initiate = function(cookie, short_nonce) {
	var vouch = new Buffer(120);
	var vouch_nonce = gen_nonce('VOUCH---', 16);
	var p = 0;
	vouch_nonce.copy(vouch, p);
	p += 24;
	this.pub_t.copy(vouch, p);
	p += 32;
	this.srv_pub_p.copy(vouch, p);
	p += 32;

	var vouch_box = sodium.crypto_box(vouch.slice(24, 24+64), vouch_nonce, this.srv_pub_t, this.priv_p);
	vouch_box.copy(vouch, 24);

	var len = 8+cookie.length+24+32+vouch.length+32;
	var pkt_initiate = new Buffer(len);
	p = 0;
	len = pkt_initiate.write('INITIATE');
	p += len;
	cookie.copy(pkt_initiate, p);
	p += cookie.length;
	var mark = p;
	len = pkt_initiate.write('CurveZMQINITIATE', p);
	p += len;
	short_nonce.copy(pkt_initiate, p);
	p += short_nonce.length;
	var initiate_nonce = pkt_initiate.slice(mark, p);
	mark = p;
	this.pub_p.copy(pkt_initiate, p);
	p += 32;
	vouch.copy(pkt_initiate, p);
	p += vouch.length;
	var init_box = sodium.crypto_box(pkt_initiate.slice(mark, p), initiate_nonce, this.srv_pub_t, this.priv_t);
	init_box.copy(pkt_initiate, mark);
	p = mark + init_box.length;
	return pkt_initiate.slice(0, p);
};

// exponential backoff interval calculation
var gen_interval = function(k) {
	  var base = (Math.pow(2, k) - 1) * 30;
	  
	  if ( base > 45000 )
		 base = 45000; // If the generated interval is more than 45 seconds, truncate it down to 45 seconds.
	  if ( base < 0 )
		  base = 0;
	  
	  // generate the interval to a random number between 500 ms and the maxInterval determined from above
	  return Math.random() * 1000 + 300 + base; 
};

CurveClient.prototype.restart = function(host, port) {
	var self = this;
	var rec_tmo = gen_interval(this.connect_attempt);
	rec_tmo = 10 * 1000;
	log.debug('reconnecting in', rec_tmo, 'ms');
	setTimeout(function() {
		self.connect_attempt++;
		log.debug('connect attempt', self.connect_attempt);
		self.fsm = self.create_fsm(host, port);
	}, rec_tmo);
};

CurveClient.prototype.close = function() {
	if ( this.fsm.ws )
		this.fsm.ws.close();
}

CurveClient.prototype.create_fsm = function(host, port) {
	var owner = this;
	var m = new machina.Fsm({
		initialState : 'init',

		err : function(err) {
			log.error(err);
			if ( this.connected ) {
				this.ws.close();
				this.connected = false;
				owner.emit('close', err);
			}
		},

		states : {
			init : {
				_onEnter : function() {
					var self = this;
					this.connected = false;
					/*if (owner.poll ) {
						log.debug('creating polling client');
						this.ws = new PollSocket({url: 'http://' + host + ':' + port + owner.path, ping_tmo: 60000});
					} else {
						log.debug('creating ws');
						this.ws = new webSocket('ws://' + host + ':' + port + owner.path);
					}*/
					log.debug('creating ws');
					this.ws = new webSocket('ws://' + host + ':' + port + owner.path);

					this.ws.on('open', function() {
						owner.connect_attempt = 1;
						self.connected = true;
						self.transition('hello');
						self.ws.on('message', function(msg) {
							self.handle('data', msg);
						});
					});
					this.ws.on('error', function(error) {
						if ( ! self.connected ) {
							log.warn('failed to connect', error);
							self.err(error);
						}
						else
							self.err(error);
					});
					this.ws.on('close', function() {
						log.warn('server has closed the connection');
						self.err('server has closed the connection');
					});
				}
			},

			hello : {
				_onEnter : function() {
					var hello = owner.encode_hello();
					this.short_nonce = hello.s_nonce;
					log.debug('sending hello');
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
						log.debug('received welcome, sennding initiate with length', pkt.length);
						this.ws.send(pkt);
						this.transition('wait_ready');
					}
					else
						this.err(welcome.err);
				}
			},

			wait_ready : {
				data : function(buffer) {
					log.debug('decoding ready');
					var ready = owner.decode_ready(buffer);
					if ( ! ready.err ) {
						log.debug('channel ready');
						this.srv_short_nonce = ready.s_nonce;
						this.transition('wait_message');
						owner.emit('open');
					}
					else
						this.err(ready.err);
				}
			},

			wait_message : {
				data : function(buffer) {
					increment_nonce(this.srv_short_nonce);
					var message = owner.decode_message(buffer, this.srv_short_nonce);
					if ( ! message.err )
						owner.emit('message', message.data);
					else
						this.err(message.err);
				}
			}
		}
	});
	return m;
};

module.exports = CurveClient;

var MAX_INT = Math.pow(2, 32); 
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
}

function comp(a, b) {
	if ( a.length === b.length ) {
		for ( var i = 0; i < a.byteLength; i++ )
			if ( a[i] !== b[i] )
				return i+':' + a[i] + '<->' + b[i];
	}
	else
		return 'len<>';
}

function gen_nonce(prefix, len) {
	var res = new Buffer(24);
	var pre_len = res.write(prefix);
	var b = new Buffer(len);
	sodium.randombytes_buf(b);
	b.copy(res, pre_len);
	return res;
}

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
}

function to_buf(object) {
	if ( object instanceof Buffer )
		return object;

	if ( object.constructor.name === 'String' )
		return new Buffer(object);

	return new Buffer(object.toString());
}
