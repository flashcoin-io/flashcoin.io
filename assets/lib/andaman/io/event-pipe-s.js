var events = require('events'),
	machina = require('machina'),	
	CurveClient = require('./curvews-client-s'),
	Cmd = require('../def/evt').Cmd,
	Err = require('../def/evt').Err,
	EVP_PATH = require('../def/evt').EVP_PATH,
	FLAG_ACK = require('../def/evt').FLAG_ACK,
	DEFAULT_NSP = require('../def/evt').DEFAULT_NSP;

var EVP_VER = require('../def/evt').EVP_VER,
	HEADER_MIN_LEN = require('../def/evt').HEADER_MIN_LEN,
	Off = require('../def/evt').Off,
	OBJ_TYPE = require('../def/evt').OBJ_TYPE,
	FLAG_ACK = require('../def/evt').FLAG_ACK;

var read_header = require('./evt-util').read_header,
	write_header = require('./evt-util').write_header,
	read_event = require('./evt-util').read_event,
	write_event = require('./evt-util').write_event;

const DEFAULT_HB_INTERVAL = 15000;
const DEFAULT_HB_TMO = 46000;
const RECONNECT_WAIT = 300;
const OPEN_RETRY = 3;
const OPEN_WAIT = 1000;
const XFER_TMO = 10000;

// large object or file transfer chunk size
const XFER_CHUNK_SIZE = 48*1024;
const MAX_GET_FILE_SIZE = 32*1024*1024;
var txn_num = 0;

function event_client(opts) {
	return new EventPipe(opts);
}

function EventPipe(opts) {
	this.delegate = new events.EventEmitter();
	if ( ! opts.buf instanceof Buffer )
		throw 'backing buffee needs to be Buffer';	
	this.buf = opts.buf;
	this.namespace = (opts.namespace ? opts.namespace : DEFAULT_NSP);	
	this.fsm = this._fsm(opts);
	this.fsm.handle('start');
	this.seqno = 0;
}

EventPipe.prototype.emit = function(e, payload) {
	if ( ! this.ready ) {
		console.log('websocket not ready');
		return;
	}
	
	var ptr = write_header(this.buf, 0, ++this.seqno, 0, Cmd.event);
	var len = write_event(this.buf, ptr, e, payload);	
	var send_buf = this.buf.slice(0, ptr+len);
	this.ws.send(send_buf, {binary: true});
};

EventPipe.prototype.on = function(e, fn) {	
	this.delegate.on(e, fn);
};

EventPipe.prototype.once = function(e, fn) {	
	this.delegate.once(e, fn);
};


EventPipe.prototype.removeListener = function(e, fn) {	
	this.delegate.removeListener(e, fn);
};

EventPipe.prototype.removeAllListeners = function(e) {	
	this.delegate.removeAllListeners(e);
};


EventPipe.prototype.once = function(e, fn) {	
	this.delegate.once(e, fn);
};

EventPipe.prototype.join = function(channel) {
	if ( ! this.ready ) {
		console.log('not ready');
		return;
	}
	var p = write_header(this.buf, 0, ++this.seqno, 0, Cmd.join, channel);
	this.ws.send(this.buf.slice(0, p));	
}

EventPipe.prototype._send_complete = function(txn, context, rx_error, cb) {
	if ( rx_error.e )
		return;
	
	var reg = xfer_end_ack(txn);
	var timer;
	var self = this;
	
	var listener = function() {
		if ( timer )
			clearTimeout(timer);
		console.log('xfer', txn, 'peer has acked end');
		cb()
	};
		
	timer = setTimeout(function() {
		self.delegate.removeListener(reg, listener);
		cb('end timeout');
	}, 1000);
	
	this.delegate.once(reg, listener);
	
	var p = write_header(this.buf, 0, ++this.seqno, txn, Cmd.xfer_end, context);
	this.ws.send(this.buf.subarray(0, p));
}

EventPipe.prototype._send_chunk = function(txn, file, remaining, offset, rx_error, cb, size) {
	if ( rx_error.e ) {
		console.log('xfer:send_chunk', txn, 'peer error, bailing out');
		return;
	}
	var chunk_size;
	if ( size ) 
		chunk_size = Math.min(Math.max(XFER_CHUNK_SIZE, size), remaining);
	else
		chunk_size = Math.min(XFER_CHUNK_SIZE, remaining);
    var reader = new FileReader();
    var chunk = file.slice(offset, offset+chunk_size);
    console.log('request to read', chunk_size, 'bytes');
    var self = this;
    reader.onload = function(evt) { 
        remaining -= chunk_size;
        console.log('xfer', txn,'send_chunk: offset', offset, 'read', evt.target.result.byteLength, 'remaining', remaining);
    	var p = write_header(self.buf, 0, ++self.seqno, txn, Cmd.xfer, new Uint8Array(evt.target.result));
    	self.ws.send(self.buf.subarray(0, p));        
        offset += chunk_size;       
    	var once_timer;
    	self.delegate.once(xfer_req_ack(txn), function() {
    		if ( once_timer )
    			clearTimeout(once_timer);
        	cb(undefined, offset);
        	if ( remaining > 0 )
        		self._send_chunk(txn, file, remaining, offset, rx_error, cb, size);
    	});
    	once_timer = setTimeout(function(){
    		console.log('xfer', txn, 'timeout at offset', offset);
    		self.delegate.removeAllListeners(xfer_req_ack(txn));
    		cb('timeout at offset' + offset);
    	}, 3000);            
    }
    reader.onerror = function(err) {
        console.log('xfer', txn, 'send_chunk:err', err);
        cb(err);
    };
    reader.readAsArrayBuffer(chunk);
}

/**
 * send a file. 
 * @context is the context in json format.
 * @file the file handle.
 * @cb a callback that takes 1. error and 2. percentage
 * @size the suggested chunk size
 */
EventPipe.prototype.sendfile = function(context, file, cb, size) {
	if ( ! this.ready ) {
		console.log('not ready');
		cb('not ready');
		return;
	}	

	var txn = next_txn();
	console.log('xfer: start with txn', txn, file.name, 'type', file.type, 'size', file.size);	
	var reg = xfer_start_ack(txn);
	var timer;
	var self = this;
	var rx_error = {};
	
	var listener = function() {
		if ( timer )
			clearTimeout(timer);
		console.log('xfer:peer has acked start', txn);
		self._send_chunk(txn, file, file.size, 0, rx_error, function(err, offset) {
			if ( ! err ) {
				var p = Math.floor((offset/file.size)*100);
				cb(Err.again, p);
				if ( p === 100 ) {
					console.log('xfer:chunk send completed', txn);
					self._send_complete(txn, context, rx_error, function(err) {
						if ( ! err ) {
							console.log('xfer:send complete', txn);
							self.delegate.removeAllListeners(xfer_err(txn));
							cb(Err.ok);
						}
						else {
							console.log('xfer:send complte err', err);
							self.delegate.removeAllListeners(xfer_err(txn));
							cb(err);
						}
					});
				}
			}
			else {
				console.log('chunk sending error', err);
				self.delegate.removeAllListeners(xfer_err(txn));
				cb(err);
			}
		}, size);
	};
		
	timer = setTimeout(function() {
		self.delegate.removeListener(reg, listener);
		if ( cb )
			cb('start timeout');
	}, 2000);
	
	this.delegate.once(reg, listener);
	var self = this;
	this.delegate.once(xfer_err(txn), function(message) {
		console.log('xfer', txn, 'peer error', message);
		rx_error.e = true;
		self.delegate.removeAllListeners(xfer_start_ack(txn));
		self.delegate.removeAllListeners(xfer_end_ack(txn));
		cb('peer error');
	});
	
	var p = write_header(this.buf, 0, ++this.seqno, txn, Cmd.xfer_start, {size: file.size, type: file.type});
	this.ws.send(this.buf.subarray(0, p));
}

/**
 * get file from peer
 * @token is the token used to identify peer's local file.
 * @cb the callback function that takes
 *     1. err: if error occurs
 *     2. percentage
 *     3. result: {size (file size in bytes), type (file type:string), result (blob:Uint8Array), context (any context information, json formatted)}      
 */
EventPipe.prototype.getfile = function(token, cb) {
	if ( ! this.ready ) {
		console.log('not ready');
		cb('not ready');
		return;
	}
	
	var self = this;
	var txn = next_txn();	
	var listener = function(err, ack) {
		if ( ! err ) {
			var txn = ack.txn;
			console.log('get file acked with txn', txn);
			var wait_start = function(err, txn, file) {
				if ( ! err ) {
					console.log('peer send file txn started');
					self._create_xfer_receiver(txn, file, cb);					
				}
				else
					cb(err);
			}
		    once(self.delegate, xfer_start(txn), 1000, wait_start);
		}
		else
			cb(err);
	};
		
    once(this.delegate, xfer_getfile_ack(txn), 1000, listener);
	
	var p = write_header(this.buf, 0, ++this.seqno, txn, Cmd.get_file, token);
	this.ws.send(this.buf.subarray(0, p));	
}

EventPipe.prototype._create_xfer_receiver = function(txn, file, cb) {
	var pipe = this;
	var fsm;
	new machina.Fsm({
		
		initialState: 'init',
		
		tmo : function() {
			console.log('xfer fsm', txn, 'timeout');
			this.transition('stop');
			this.handle('result', 'timeout');
		},
		
		io_err : function(err) {
			console.log('xfer', txn, 'io err', err.message);
			this.transition('stop');
			this.handle('result', err.message);			
		},
		
		states: {
			init : {
				_onEnter : function() {
					fsm = this;
					console.log('start xfer fsm', txn, ' with file type', file.type, 'size', file.size);
					if ( file.size > MAX_GET_FILE_SIZE ) {
						fsm.transition('stop');
						fsm.handle('result', 'file too large');
						return;
					}
					this.type = file.type;
					this.size = file.size;
					this.offset = 0;
					this.res_buf = new Uint8Array(file.size);
					pipe.delegate.on(xfer_req(txn), function(length, buffer) {
						fsm.handle('data', length, buffer);
					});
					pipe.delegate.once(xfer_end_req(txn), function(context) {
						fsm.handle('end', context);
					});
					var len = write_header(pipe.buf, FLAG_ACK, ++pipe.seqno, txn, Cmd.xfer_start);
					console.log('sending xfer start ack, txn', txn);
					pipe.ws.send(pipe.buf.subarray(0, len));

					this.transition('wait_data');
				}
			},
			
			wait_data : {
				_onEnter : function() {
					this.timer = setTimeout(this.tmo, XFER_TMO);
					var self = this;
				},
				
				data : function(chunk_size, buffer) {					
					// append the chunk
					this.res_buf.set(buffer, this.offset);
					clearTimeout(this.timer);
					this.timer = setTimeout(this.tmo, XFER_TMO);
					this.offset += chunk_size;
					var remaining = this.size-this.offset;

					// ack the chunk
					var len = write_header(pipe.buf, FLAG_ACK, ++pipe.seqno, txn, Cmd.xfer);
					pipe.ws.send(pipe.buf.subarray(0, len));
					var p = Math.floor((fsm.offset*100.0/fsm.size));
					cb(undefined, p);
				},
				
				end : function(context) {
					console.log('end xfer fsm', txn, 'context', context);
					clearTimeout(this.timer);
					this.transition('stop');
					this.handle('result', undefined, context);
				}
			},
			
			stop : {
				result : function(err, context) {
					pipe.delegate.removeAllListeners(xfer_req(txn));
					pipe.delegate.removeAllListeners(xfer_end_req(txn));
					if ( ! err ) {
						console.log('xfer', txn, 'end', context);
						var len = write_header(pipe.buf, FLAG_ACK, ++pipe.seqno, txn, Cmd.xfer_end);
						console.log('sending xfer end ack, txn', txn);
						pipe.ws.send(pipe.buf.subarray(0, len));
						cb(undefined, 100, {size: this.size, type: this.type, result: this.res_buf, context: context});
					}
					else {
						var len = write_header(pipe.buf, 0, ++pipe.seqno, txn, Cmd.xfer_err, err);
						console.log('sending xfer err, txn', txn);
						pipe.ws.send(pipe.buf.subarray(0, len));
						cb(err);
					}
				}
			}
		}		
	});
}

EventPipe.prototype.leave = function(channel) {
	if ( ! this.ready ) {
		console.log('not ready');
		return;
	}	
	var p = write_header(this.buf, 0, ++this.seqno, 0, Cmd.leave, channel);
	this.ws.send(this.buf.slice(0, p));	
}

EventPipe.prototype._dispatch_event = function(buf) {
	var event = read_event(buf);
	if ( event.data )
		this.delegate.emit(event.event, event.data)
	else
		this.delegate.emit(event.event);
}

EventPipe.prototype._up = function(e) {
	this.delegate.emit(e);
}

EventPipe.prototype._dispatch = function(data) {
	//read the command
	var hdr = read_header(data);
	switch ( hdr.cmd ) {
	case Cmd.open :
		if ( hdr.flag & FLAG_ACK )
			this.fsm.handle('open_ack', hdr.ext);	
		break;
	case Cmd.ping :
		if ( hdr.flag & FLAG_ACK )
			this.fsm.handle('pong');
		break;
	case Cmd.close:
		this.fsm.handle('close');
		break;
	case Cmd.event:
		var ebuf = data.slice(hdr.hlen);
		this._dispatch_event(ebuf);
		break;
	case Cmd.xfer_start:
		if ( hdr.flag & FLAG_ACK )
			this.delegate.emit(xfer_start_ack(hdr.txn));
		else
			this.delegate.emit(xfer_start(hdr.txn), hdr.txn, hdr.ext);
		break;
	case Cmd.xfer_err:
		this.delegate.emit(xfer_err(hdr.txn), hdr.ext);
		break;
	case Cmd.xfer:
		if ( hdr.flag & FLAG_ACK )
			this.delegate.emit(xfer_req_ack(hdr.txn));
		else
			this.delegate.emit(xfer_req(hdr.txn), hdr.ext_len, hdr.ext);
		break;		
	case Cmd.xfer_end:
		if ( hdr.flag & FLAG_ACK )
			this.delegate.emit(xfer_end_ack(hdr.txn));
		else
			this.delegate.emit(xfer_end_req(hdr.txn), hdr.ext);
		break;
	case Cmd.get_file:
		if ( hdr.flag & FLAG_ACK )
			this.delegate.emit(xfer_getfile_ack(hdr.txn), hdr.ext);
		break;
	default:
		console.log('unknown command, header:', data[0],data[1],data[2],data[3],data[4],data[5],data[6],data[7], data[8]);
		break;
	}	
}

EventPipe.prototype._ping = function() {
	var p = write_header(this.buf, 0, ++this.seqno, 0, Cmd.ping);
	this.ws.send(this.buf.slice(0, p));	
};

EventPipe.prototype._fsm = function(opts) {
	var evp = this;
	var fsm = new machina.Fsm({				
		initialState : "init",		
		
		open : function() {
			var p = write_header(evp.buf, 0, ++evp.seqno, 0, Cmd.open, evp.namespace);
			evp.ws.send(evp.buf.slice(0, p));
		},
		
		// exponential backoff interval calculation
		gen_interval : function(k) {
			  var base = (Math.pow(2, k) - 1) * 30;
			  
			  if ( base > 30000 )
				 base = 30000; // If the generated interval is more than 30 seconds, truncate it down to 30 seconds.
			  if ( base < 0 )
				  base = 0;
			  
			  // generate the interval to a random number between 500 ms and the maxInterval determined from above
			  return Math.random() * 1000 + 300 + base; 
		},
		
		states : {
			init : { 
				_onEnter: function() {
					evp.ready = false;
				},
				
				"start" : function() {
					this.connect_attempt = 1;
					this.transition("connecting");
				}
			},
			
			connecting : {
				_onEnter : function() {					
					evp.ws = new CurveClient({srv_publicKey: opts.srv_publicKey, 
						publicKey: opts.publicKey, secretKey: opts.secretKey, path: EVP_PATH, poll: opts.poll});
					var self = this;
					evp.ws.on('open', function() {
						self.connect_attempt = 1;
						if ( self.reconnect_timer )
							clearTimeout(self.reconnect_timer);
						    evp.ws.on('message', function(data) {
								//console.log('msg event data length', data.byteLength, ':', data[0], data[1], data[2], data[3], data[4], data[5], data[6], data[7]);																
								evp._dispatch(data);								
						    });
						
						evp.ws.on('close', function() {
							console.log('connection closed');
							self.transition('disconnected');
							evp._up('close');
						});
						
						evp.ws.on('error', function() {
							console.log('ws error, state',  evp.ws.readyState);
							self.transition('disconnected');
							evp._up('error');							
						});

						self.open_retry = 0;
						self.transition('wait_open');
					});
					
					server_url = 'ws://' + opts.host + ':' + opts.port + EVP_PATH;
					console.log('try connection', server_url, 'attemp', this.connect_attempt);
					evp.ready = false;
					evp.ws.start(opts.host, opts.port);

					var rec_tmo = this.gen_interval(this.connect_attempt);
					rec_tmo = 10 * 1000;
					console.log('connection timeout in', rec_tmo, "ms");
					this.reconnect_timer = setTimeout(function() {
						self.connect_attempt++;
						console.log('connection timeout');
						self.transition('disconnected');
					}, rec_tmo);
				}
			},
			
			wait_open : { 
				_onEnter: function() {
					if ( this.open_retry > OPEN_RETRY ) {
						console.log('open reached max retry');
						if ( this.open_timer )
							clearTimeout(this.open_timer);
						this.handle('disconnected');
					}
					else {
						this.open_retry++;
						this.open();
						if ( this.open_timer )
							clearTimeout(this.open_timer);
						var self = this;
						this.open_timer = setTimeout(function() {
							self.transition('wait_open');
						}, OPEN_WAIT);
					}
				},
				
				"open_ack" : function(pipe_id) {
					// sanity check for the heartbeat generation
					console.log('pipe opened with id', pipe_id);
					clearTimeout(this.open_timer);
					evp.id = pipe_id;
					evp.ready = true;
					var hb_interval = (opts.hb_int ? opts.hb_int : DEFAULT_HB_INTERVAL);
					this.tx_timer = setInterval(function() {
						evp._ping();
					}, hb_interval);
					// emit local event
					evp.delegate.emit('connect');					
					this.transition("connected");
				}				
			},			
			connected : {
				_onEnter : function() {
					var self = this;
					// register a timer to monitor heartbeat
					this.hb_tmo = (opts.hb_tmo ? opts.hb_tmo : DEFAULT_HB_TMO);
					this.rx_timer = setTimeout(function() {
						self.handle("tmo");
					}, self.hb_tmo);
				},
				
				"pong" : function() {
					clearTimeout(this.rx_timer);
					var self = this;
					this.rx_timer = setTimeout(function() {
						self.handle("tmo");
					}, self.hb_tmo);					
				},
				
				"close" : function() {
					console.log('tear down connection');
					this.transition("disconnected");
				},
				
				"tmo" : function () {
					console.log('server may have disconnected');
					this.transition("disconnected");
				}
			},
			
			disconnected : {
				_onEnter : function() {
					console.log('socket disconnected or fail to connect');
					if ( evp.ws )
						evp.ws.close();
					clearTimeout(this.rx_timer);
					clearInterval(this.tx_timer);
					var self = this;
					// setup a timer to reconnect
					setTimeout(function() {
						self.transition("connecting");
					}, RECONNECT_WAIT);
				}
			}
		}
	});
	return fsm;	
}

var xfer_start = function(txn) {
	return '_xfer_start_' + txn;
}

var xfer_start_ack = function(txn) {
	return '_xfer_start_ack_' + txn;
}

var xfer_end_ack = function(txn) {
	return '_xfer_end_ack_' + txn;
}

var xfer_end_req = function(txn) {
	return '_xfer_end_req_' + txn;
}

var xfer_getfile_ack = function(txn) {
	return '_xfer_getfile_ack_' + txn;
}

var xfer_err = function(txn) {
	return '_xfer_err_' + txn;
}

var xfer_req = function(txn) {
	return '_xfer_req_' + txn;
}

var xfer_req_ack = function(txn) {
	return '_xfer_ack_' + txn;
}

var next_txn = function() {
	return ++txn_num;
}

var once = function(source, evt, tmo, cb) {
	var timer;
	var listener = function() {
		if ( timer )
			clearTimeout(timer);
		if ( arguments.length > 0 ) {
			var args = [undefined].concat(Array.prototype.slice.call(arguments));
			cb.apply(this,args);
		}
		else
			cb();
	}
	source.once(evt, listener)
	timer = setTimeout(function() {
		source.removeListener(evt, listener);
		cb('timeout');
	}, tmo);
}

module.exports = event_client;