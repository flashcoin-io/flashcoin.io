/**
 * long poll client socket implementation
 */
var events = require('events'),
	Consts = require('./poll-common'),
	machina = require('machina'),
	BufferView = require('./buffer-view'),
	util = require('util');


const OPEN_TMO = 5000;
const RETRY_INTERVAL = 5000;
const WAIT_TERM_TMO = 5000;

function write_header(cmd, id, data, buf) {
	buf.reset();
	buf.writeUInt8(Consts.VER);
	buf.writeUInt8(cmd);
	if ( id ) {
		buf.writeUInt16(id);
		if ( data )
			buf.append(data)
	}
	return buf.offset;
}

function read_header(buf) {
	var ver = buf.readUInt8();
	var cmd = buf.readUInt8();
	var id = undefined;
	var data = undefined;
	if ( buf.length() >= 4) {
		id = buf.readUInt16();
		if ( buf.length() > 4 )
			data = buf.slice(buf.offset, buf.length());
	}
	return {ver: ver, cmd: cmd, id: id, b: data};
}

var fsm;
function PollSocket(opts) {
	this.url = opts.url;
	
	//this has to be more than two times of the server ping interval
	this.ping_tmo = opts.ping_tmo;	
	fsm = this.create_fsm(this);
}

util.inherits(PollSocket, events.EventEmitter);

// data has to be a Uint8Array
PollSocket.prototype.send = function(data) {
	fsm.handle('send', data);
}

PollSocket.prototype.addEventListener = function(event, listener) {
	this.on(event, listener);
}

PollSocket.prototype.error = function(id) {
	console.log('error xhr ', id);
	fsm.handle('error', id);
}

PollSocket.prototype.result = function(id, buf) {
	var p = read_header(buf);		
	var cmd = p.cmd;
	var data = p.b;
	switch ( cmd ) {
		case Consts.CONN_SYNC_ACK:
			fsm.handle('conn_sync_ack', id, p.id);
			break;
		case Consts.PING:
			fsm.handle('ping', id, p.id);
			break;
		case Consts.TERM:
			fsm.handle('term', id, p.id);
			break;
		case Consts.EVT:
			fsm.handle('event', id, p.id, data);
			break;
		default:
			console.log('unknown command', cmd);
	}	
}

var xhr_id = 0;
function create_xhr(fsm, err_cb, res_cb) {
	fsm.prev_id = fsm.id;
	fsm.prev_xhr = fsm.xhr;
	fsm.id = ++xhr_id;
	console.log('creating xhr with id', fsm.id);
	var xhr = new XMLHttpRequest();	
	var x_id = fsm.id;
	xhr.addEventListener('error', function() {
		console.log('xhr', x_id, 'error', arguments);
		err_cb(x_id);
	});
	
	xhr.onreadystatechange = function() {
		if ( xhr.readyState == 4 ) {
			if ( xhr.status == 200 ) {
				var bv = new BufferView(new Uint8Array(xhr.response));
				res_cb(x_id, bv);
			}
			else {
				console.log('xhr', x_id, 'error status', xhr.status);
				err_cb(x_id);
			}
		}
	};
	
	xhr.responseType = "arraybuffer";
	fsm.xhr = xhr;	
}

function xhr_send(xhr, url, buf, cmd, id, data) {
	xhr.open('POST', url);
	var len = write_header(cmd, id, data, buf);
	xhr.setRequestHeader('Content-Type', 'application/octet-stream');
	xhr.send(buf.slice(0, len));	
}

PollSocket.prototype.create_fsm = function(socket) {
	var buf = new BufferView(new Uint8Array(64*1024));
	var m = new machina.Fsm({
		initialState : "init",
		
		states : {
			init : {
				_onEnter : function() {
					this.connected = false;
					this.handle('restart');
				},
				
				restart : function() {
					create_xhr(this, socket.error, socket.result);
					xhr_send(this.xhr, socket.url, buf, Consts.CONN_SYNC);
					var self = this;
					this.open_timer = setTimeout(function() {
						console.log('open timeout for xhr', self.id);
						self.xhr.abort();
						setTimeout(function() {
							console.log('retry connection');
							self.handle('restart');
						}, RETRY_INTERVAL);
					}, OPEN_TMO);
				},
				
				conn_sync_ack : function(xhr_id, reg_id) {
					//validate this is the response we are waiting for
					if ( xhr_id == this.id ) {
						console.log('received conn_sync_ack with reg id', reg_id);
						socket.id = reg_id;
						clearTimeout(this.open_timer);
						create_xhr(this, socket.error, socket.result);	
						xhr_send(this.xhr, socket.url, buf, Consts.CONN_ACK, reg_id);						
						this.transition('connected');
					}
					else
						console.log('received conn_sync_ack with wrong xhr id, expected', this.id, 'incommning', xhr_id);
				},
				
				error : function(xhr_id) {
					// let open timer takes care of restart
					// or emit an error
				}
			},
			
			connected : {
				_onEnter: function() {
					var self = this;
					this.ping_timer = setTimeout(function() {
						self.handle('tmo');
					}, socket.ping_tmo);
					if ( ! this.connected ) {
						socket.emit('open', socket);
						this.connected = true;
					}
				},
				
				tmo : function() {
					console.log('server ping timeout');
					this.handle('error', 'na');
				},
				
				ping : function(xhr_id, reg_id) {
					if ( xhr_id == this.id && socket.id == reg_id) {
						console.log('received ping');
						clearTimeout(this.ping_timer);						
						create_xhr(this, socket.error, socket.result);	
						xhr_send(this.xhr, socket.url, buf, Consts.PING_ACK, reg_id);
						console.debug('sent PING_ACK for ' + reg_id);
						var self = this;
						this.ping_timer = setTimeout(function() {
							self.handle('tmo');
						}, socket.ping_tmo);
					}
					else
						console.log('received ping with wrong xhr id or reg id, expected:', this.id, socket.id, 'incommning', xhr_id, reg_id);					
				},
				
				send : function(data) {
					console.debug('creating new xhr for sending');
					create_xhr(this, socket.error, socket.result);					
					xhr_send(this.xhr, socket.url, buf, Consts.EVT, socket.id, data);
					clearTimeout(this.ping_timer);					
					this.transition('wait_term');
				},
				
				event : function(xhr_id, reg_id, data) {
					if ( xhr_id == this.id && socket.id == reg_id) {
						console.debug('received event');
						clearTimeout(this.ping_timer);						
						create_xhr(this, socket.error, socket.result);	
						xhr_send(this.xhr, socket.url, buf, Consts.RECONN, reg_id);
						console.debug('sent RECONN for ' + reg_id);
						var self = this;
						this.ping_timer = setTimeout(function() {
							self.handle('tmo');
						}, socket.ping_tmo);
						socket.emit('message', {data: data});
					}
					else
						console.log('received event with wrong xhr id or reg id, expected:', this.id, socket.id, 'incommning', xhr_id, reg_id);					
				},				
				
				error : function(xhr_id) {
					console.log('xhr error in connected state');
					this.xhr.abort();
					clearTimeout(this.ping_timer);
					if ( this.connected ) {
						this.connected = false;
						socket.emit('close', socket);
					}					
				}				
			},
			
			wait_term : {
				_onEnter : function() {
					var self = this;
					this.wait_term_tmr = setTimeout(function() {
						console.log('timeout waiting for term');
						self.handle('error');
					},WAIT_TERM_TMO); 
				},
								
				term : function(xhr_id, reg_id) {
					if ( xhr_id == this.prev_id && socket.id == reg_id) {
						console.log('received term');
						clearTimeout(this.wait_term_tmr);
						this.transition('connected');
					}
					else
						console.log('received term with wrong xhr id or reg id, expected:', this.prev_id, socket.id, 'incommning', xhr_id, reg_id);										
				},
				
				error : function(xhr_id) {
					console.log('xhr error in wait-term state, connected');
					this.prev_xhr.abort();
					this.xhr.abort();
					if ( this.connected ) {
						this.connected = false;
						socket.emit('close');
					}					
				}
			}
		}
	});
	return m;	
};
PollSocket.prototype.close = function() {

};

module.exports = PollSocket;