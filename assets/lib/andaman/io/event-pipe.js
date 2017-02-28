var events = require('events'),
	machina = require('machina'),
	WebSocket = require('ws'),
	ByteBuffer = require('bytebuffer'),
	CurveWebSocket = require('./curvews-client'),
	read_header = require('./evt-util').read_header,
	write_header = require('./evt-util').write_header,
	read_event = require('./evt-util').read_event,
	write_event = require('./evt-util').write_event,	
	Cmd = require('../def/evt').Cmd,
	EVP_PATH = require('../def/evt').EVP_PATH,
	FLAG_ACK = require('../def/evt').FLAG_ACK,
	DEFAULT_NSP = require('../def/evt').DEFAULT_NSP;

var browser_mode = ( typeof window !== 'undefined' );
var log;
if ( browser_mode) {
	log = {
	    warn: function() {
	    	console.log.call(console, arguments);
	    },
	    info: function() {
	    	console.log.call(console, arguments);
	    },
	    debug: function() {
	    	console.log.call(console, arguments);
	    }
	};
	WebSocket.prototype.on = WebSocket.prototype.addEventListener;
}
else {
	log = require('log4js').getLogger('evp');
}

const DEFAULT_HB_INTERVAL = 15000;
const DEFAULT_HB_TMO = 46000;
const RECONNECT_WAIT = 300;
const OPEN_RETRY = 3;
const OPEN_WAIT = 1000;

function event_client(opts) {
	return new EventPipe(opts);
}

function EventPipe(opts) {
	this.delegate = new events.EventEmitter();
	this.buf = opts.buf;
	this.server_url = opts.proto + '://' + opts.host + ':' + opts.port + EVP_PATH;
	this.namespace = (opts.namespace ? opts.namespace : DEFAULT_NSP);
	this.srv_pub = opts.server_publicKey;	
	this.fsm = this._fsm(opts);
	this.fsm.handle('start');
}

EventPipe.prototype.emit = function(e, payload) {
	if ( ! this.ready ) {
		log.warn('websocket not ready');
		return;
	}
	
	var ptr = write_header(this.buf, 0, Cmd.event);
	var len = write_event(this.buf, ptr, e, payload);
	
	this.ws.send(this.buf.slice(0, ptr+len), {binary: true});
};

EventPipe.prototype.on = function(e, fn) {	
	this.delegate.on(e, fn);
};

EventPipe.prototype.join = function(channel) {
	if ( ! this.ready ) {
		log.warn('not ready');
		return;
	}
	var p = write_header(this.buf, 0, Cmd.join, channel);
	this.ws.send(this.buf.slice(0, p));	
}

EventPipe.prototype.leave = function(channel) {
	if ( ! this.ready ) {
		log.warn('not ready');
		return;
	}	
	var p = write_header(this.buf, 0, Cmd.leave, channel);
	this.ws.send(this.buf.slice(0, p));	
}

EventPipe.prototype._dispatch_event = function(buf) {
	var event = read_event(buf);
	if ( event.data )
		this.delegate.emit(event.event, event.data)
	else
		this.delegate.emit(event.event);
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
	default:
		log.warn('unknown command', hdr.cmd);
	    data.printDebug();
		break;
	}	
}

EventPipe.prototype._ping = function() {
	var p = write_header(this.buf, 0, Cmd.ping);
	this.ws.send(this.buf.slice(0, p));	
};

EventPipe.prototype._fsm = function(opts) {
	var evp = this;
	var fsm = new machina.Fsm({				
		initialState : "init",		
		
		open : function() {
			var p = write_header(evp.buf, 0, Cmd.open, evp.namespace);
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
					log.debug('try connection', evp.server_url, 'attemp', this.connect_attempt);
					evp.ready = false;
					//evp.ws = new WebSocket(evp.server_url);
					//evp.ws.binaryType = "arraybuffer";
					evp.ws = new CurveWebSocket({url: evp.server_url, server_publicKey: evp.srv_pub});
					var self = this;
					evp.ws.on('open', function() {
						self.connect_attempt = 1;
						if ( self.reconnect_timer )
							clearTimeout(self.reconnect_timer);
						    evp.ws.on('message', function(data) {
							if ( browser_mode ) {
								console.log('msg event data length', data.byteLength, ':', data[0], data[1], data[2], data[3], data[4], data[5], data[6], data[7]);																
								evp._dispatch(new ByteBuffer.wrap(data, 'utf8', false, false));								
							}
							else
								evp._dispatch(data);
						});
						
						evp.ws.on('close', function() {
							log.info('connection closed');
							self.transition('disconnected');
						});
						
						evp.ws.on('error', function() {
							log.warn('ws error, state',  evp.ws.readyState);
							self.transition('disconnected');
						});

						self.open_retry = 0;
						self.transition('wait_open');
					});

					var rec_tmo = this.gen_interval(this.connect_attempt);
					rec_tmo = 10 * 1000;
					log.info('connection timeout in', rec_tmo, "ms");
					this.reconnect_timer = setTimeout(function() {
						self.connect_attempt++;
						log.info('connection timeout');
						self.transition('disconnected');
					}, rec_tmo);
				}
			},
			
			wait_open : { 
				_onEnter: function() {
					if ( this.open_retry > OPEN_RETRY ) {
						log.warn('open reached max retry');
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
					log.info('pipe opened with id', pipe_id);
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
					log.info('tear down connection');
					this.transition("disconnected");
				},
				
				"tmo" : function () {
					log.warn('server may have disconnected');
					this.transition("disconnected");
				}
			},
			
			disconnected : {
				_onEnter : function() {
					log.debug('socket disconnected or fail to connect');
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

module.exports = event_client;