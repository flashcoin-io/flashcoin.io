/**
 * Helper class for a array buffer backing usually by an Uint8Array
 */
var utf8 = require('tweetnacl-util');

function BufferView(b) {
	if (!b instanceof Uint8Array)
		throw 'backing buffer needs to be Uint8Array';
	this.view = new DataView(b.buffer, b.byteOffset, b.byteLength);
	this.offset = 0;
	this.mark = 0;
	this.buffer = b;
}

BufferView.prototype.readUInt8 = function(offset) {
	if (!offset) {
		var res = this.view.getUint8(this.offset, false);
		this.offset += 1;
		return res;
	} else
		return this.view.getUint8(offset, false);
}

BufferView.prototype.readInt8 = function(offset) {
	if (!offset) {
		var res = this.view.getInt8(this.offset, false);
		this.offset += 1;
		return res;
	} else
		return this.view.getInt8(offset, false);
}

BufferView.prototype.readUInt16 = function(offset) {
	if (!offset) {
		var res = this.view.getUint16(this.offset, false);
		this.offset += 2;
		return res;
	} else
		return this.view.getUint16(offset, false);
}

BufferView.prototype.readUInt32 = function(offset) {
	if (!offset) {
		var res = this.view.getUint32(this.offset, false);
		this.offset += 4;
		return res;
	} else
		return this.view.getUint32(offset, false);
}

BufferView.prototype.readInt32 = function(offset) {
	if (!offset) {
		var res = this.view.getInt32(this.offset, false);
		this.offset += 4;
		return res;
	} else
		return this.view.getInt32(offset, false);
}

BufferView.prototype.reset = function() {
	this.offset = this.mark;
}

BufferView.prototype.rewind = function() {
	this.offset = this.mark = 0;
}

BufferView.prototype.set = function(offset) {
	this.offset = offset;
}

BufferView.prototype.skip = function(s) {
	this.offset += s;
}

BufferView.prototype.mark = function() {
	this.mark = offset;
}

BufferView.prototype.slice = function(start, end) {
	if (!end)
		end = this.buffer.byteLength;
	var res = this.buffer.subarray(start, end);
	return res;
}

BufferView.prototype.writeUInt8 = function(v, offset) {
	if (!offset) {
		this.view.setUint8(this.offset, v)
		this.offset += 1;
	} else
		this.view.setUint8(offset, v)
}

BufferView.prototype.writeInt8 = function(v, offset) {
	if (!offset) {
		this.view.setInt8(this.offset, v)
		this.offset += 1;
	} else
		this.view.setInt8(offset, v)
}

BufferView.prototype.writeUInt16 = function(v, offset) {
	if (!offset) {
		this.view.setUint16(this.offset, v, false)
		this.offset += 2;
	} else
		this.view.setUint16(offset, v, false)
}

BufferView.prototype.writeUInt32 = function(v, offset) {
	if (!offset) {
		this.view.setUint32(this.offset, v, false)
		this.offset += 4;
	} else
		this.view.setUint32(offset, v, false)
}

BufferView.prototype.writeInt32 = function(v, offset) {
	if (!offset) {
		this.view.setInt32(this.offset, v, false)
		this.offset += 4;
	} else
		this.view.setInt32(offset, v, false)
}

/**
 * estimate the UTF8 array
 * @param string
 * @returns the encoded UTF8 array
 */
BufferView.prototype.decodeUTF8 = function(string) {
	var a = utf8.decodeUTF8(string);
	return a;
}

BufferView.prototype.writeUTF8 = function(string, offset) {
	var a = utf8.decodeUTF8(string);
	var pos = (offset ? offset : this.offset);
	if (pos + a.byteLength > this.buffer.byteLength)
		throw 'range error';

	for (var i = 0; i < a.byteLength; i++)
		this.buffer[pos + i] = a[i];
	if (!offset)
		this.offset += a.byteLength;

	return a.byteLength;
}

BufferView.prototype.append = function(buf, offset) {
	if (!buf instanceof Uint8Array)
		throw 'buffer needs to be Uint8Array';
	var pos = (offset ? offset : this.offset)

	if (pos + buf.byteLength > this.buffer.byteLength)
		throw 'range error';

	this.buffer.set(buf, pos);
	if (!offset)
		this.offset += buf.byteLength;
}

BufferView.prototype.readUTF8 = function(length, offset) {
	var pos = (offset ? offset : this.offset);
	if (pos + length > this.buffer.byteLength)
		throw 'range error';
	var sub = this.buffer.subarray(pos, pos + length);
	var res = utf8.encodeUTF8(sub);
	if (!offset)
		this.offset += length;
	return res;
}

BufferView.prototype.fill = function(v, start, end) {
	var use_offset = false;
	if (!start) {
		start = 0;
		end = this.buffer.byteLength;
		use_offset = true;
	}

	for (var i = start; i < end; i++)
		this.buffer[i] = v;
	if (use_offset)
		this.offset += (end - start);
}

BufferView.prototype.length = function() {
	return this.buffer.byteLength;
}

BufferView.prototype.toString = function() {
	return 'offset:' + this.offset + 'buf.length:' + this.buffer.byteLength;
}

module.exports = BufferView;