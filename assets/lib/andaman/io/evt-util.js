var EVP_VER = require('../def/evt').EVP_VER,
    HEADER_MIN_LEN = require('../def/evt').HEADER_MIN_LEN,
	Off = require('../def/evt').Off,
	OBJ_TYPE = require('../def/evt').OBJ_TYPE,
	FLAG_ACK = require('../def/evt').FLAG_ACK;

var log = require('log4js').getLogger('evt-util');

var read_header = function(buf) {
	var v = buf.readUInt8(0);
	var flag = buf.readUInt16BE(Off.FLAG);
	var seqno = buf.readUInt32BE(Off.SEQNO);
	var txn = buf.readUInt16BE(Off.TXN);
	var c = buf.readUInt8(Off.CMD);
	var ext_len = buf.readUInt16BE(Off.EXT_LEN);
	var ext = undefined;
	var hdr_len = HEADER_MIN_LEN;
	if ( ext_len > 0 ) {
		hdr_len = HEADER_MIN_LEN + ext_len + 1;
		var ext_type = buf.readUInt8(Off.EXT_TYPE);
		if ( ext_type === OBJ_TYPE.string )
			ext = buf.toString('utf8', Off.EXT, Off.EXT+ext_len);
		else if ( ext_type === OBJ_TYPE.json )
			ext = JSON.parse(buf.toString('utf8', Off.EXT, Off.EXT+ext_len));
		else if ( ext_type === OBJ_TYPE.blob )
			ext = buf.slice(Off.EXT, Off.EXT+ext_len);
		else
			//FIXME: bail out
			log.warn('unknown ext type', ext_type);		
	}

	return {ver : v, flag: flag, seq: seqno, txn: txn, cmd: c, ext: ext, ext_len: ext_len, hlen: hdr_len};
};

var write_header = function(buf, flag, seq, txn, cmd, ext) {
	buf.writeUInt8(EVP_VER, 0);
	buf.writeUInt16BE(flag, Off.FLAG);
	buf.writeUInt32BE(seq, Off.SEQNO);
	buf.writeUInt16BE(txn, Off.TXN);	
	buf.writeUInt8(cmd, Off.CMD);
	var ext_len = 0;
	var hdr_len = HEADER_MIN_LEN;
	if ( ! ext ) {
		buf.writeUInt16BE(0, Off.EXT_LEN);
	}
	else {
		if ( ext.constructor === String ) {
			ext_len = Buffer.byteLength(ext);
			buf.writeUInt16BE(ext_len, Off.EXT_LEN);
			if ( ext_len > 0 ) {
				buf.writeUInt8(OBJ_TYPE.string, Off.EXT_TYPE);					
				buf.write(ext, Off.EXT, ext_len);
				hdr_len = HEADER_MIN_LEN + ext_len + 1;
			}
			else
				log.warn('write_header:ext', ext, 'length=0');
		}
		else if ( Buffer.isBuffer(ext) ) {
			ext_len = ext.length;
			buf.writeUInt16BE(ext_len, Off.EXT_LEN);
			if ( ext_len > 0 ) {
				buf.writeUInt8(OBJ_TYPE.blob, Off.EXT_TYPE);	
				ext.copy(buf, Off.EXT, 0, ext_len);
				hdr_len = HEADER_MIN_LEN + ext_len + 1;				
			}
			else
				log.warn('write_header:ext', ext, 'length=0');
		}
		else {
			// a json object
			var json_string = JSON.stringify(ext);
			ext_len = Buffer.byteLength(json_string);
			buf.writeUInt16BE(ext_len, Off.EXT_LEN);
			if ( ext_len > 0 ) {
				buf.writeUInt8(OBJ_TYPE.json, Off.EXT_TYPE);
				buf.write(json_string, Off.EXT, ext_len);
				hdr_len = HEADER_MIN_LEN + ext_len + 1;				
			}
			else
				log.warn('write_header:ext', ext, 'length=0');
		}
	}
	
	return hdr_len;
};

var read_event = function(buf) {
	var ptr = 0;
	var event = buf.readUInt16BE(ptr);
	var data = undefined;
	ptr += 2;
	var len = buf.readUInt32BE(ptr);
	ptr += 4;
	if ( len > 0 ) {
		var type = buf.readUInt8(ptr);
		ptr += 1;
		switch ( type ) {
		case OBJ_TYPE.string:			
			data = buf.toString('utf8', ptr, ptr +len);
			break;
		case OBJ_TYPE.blob:
			data = new Buffer(len);
			buf.copy(data, 0, ptr, ptr+len);
			break;
		case OBJ_TYPE.json:
			data = buf.toString('utf8', ptr, ptr +len);
			data = JSON.parse(data);
			break;
		default:
			//FIXME: bail out
			log.warn('unknow data type', type);
		}
	}
	
	log.debug('read_event', event, 'data', JSON.stringify(data));
	
	return {event: event, data: data};
};

var write_event = function(buf, ptr, event, payload) {
	var start = ptr;
	buf.writeUInt16BE(event, ptr);
	ptr += 2;
	var len = 0;
	if ( payload ) {
		if ( payload.constructor === String ) {
			len = Buffer.byteLength(payload);
			buf.writeUInt32BE(len, ptr);
			ptr += 4;
			if ( len > 0 ) {
				buf.writeUInt8(OBJ_TYPE.string, ptr);
				ptr += 1;
				buf.write(payload, ptr, len);
				ptr += len;			
			}
		}
		else if ( Buffer.isBuffer(payload) ) {
			len = payload.length;
			buf.writeUInt32BE(len, ptr);
			ptr += 4;
			if ( len > 0 ) {
				buf.writeUInt8(OBJ_TYPE.blob, ptr);
				ptr += 1;
				payload.copy(buf, ptr, 0, len);
				ptr += len;
			}
		}
		else {
			// a json object
			var json_string = JSON.stringify(payload);
			len = Buffer.byteLength(json_string);
			buf.writeUInt32BE(len, ptr);
			ptr += 4;
			if ( len > 0 ) {
				buf.writeUInt8(OBJ_TYPE.json, ptr);
				ptr += 1;
				buf.write(json_string, ptr, len);
				ptr += len;
			}
		}		
	}
	else {
		buf.writeUInt32BE(0, ptr);
		ptr += 4;
	}	
	return ptr-start;
}

module.exports = {
    read_header : read_header,
    write_header : write_header,
    read_event : read_event,
    write_event : write_event
}