'use strict';

var BN = require('./crypto/bn');
var Point = require('./crypto/point');
var Hash = require('./crypto/hash');
var JSUtil = require('./util/js');
var Network = require('./networks');
var _ = require('lodash');
var $ = require('./util/preconditions');
var BufferWriter = require('./encoding/bufferwriter');
var BufferReader = require('./encoding/bufferreader');

/**
 * Instantiate a PublicKey from a {@link PrivateKey}, {@link Point}, `string`, or `Buffer`.
 *
 * @example
 * ```javascript
 * // instantiate from a private key
 * var key = PublicKey(privateKey);
 *
 * // export to as a DER hex encoded string
 * var exported = key.toString();
 *
 * // import the public key
 * var imported = PublicKey.fromString(exported);
 * ```
 *
 * @param {string} data - The encoded data in various formats
 * @param {Object} extra - additional options
 * @param {Network=} extra.network - Which network should the address for this public key be for
 * @returns {PublicKey} A new valid instance of an PublicKey
 * @constructor
 */
var PublicKey = function PublicKey(data, extra) {

  if (!(this instanceof PublicKey)) {
    return new PublicKey(data, extra);
  }

  $.checkArgument(data, new TypeError('First argument is required, please include public key data.'));

  if (data instanceof PublicKey) {
    // Return copy, but as it's an immutable object, return same argument
    return data;
  }
  extra = extra || {};

  var info = this._classifyArgs(data, extra);

  // validation
  info.point.validate();

  JSUtil.defineImmutable(this, {
    point: info.point,
    network: info.network || Network.defaultNetwork
  });

  return this;
};

/**
 * Internal function to differentiate between arguments passed to the constructor
 * @param {*} data
 * @param {Object} extra
 */
PublicKey.prototype._classifyArgs = function(data, extra) {
  /* jshint maxcomplexity: 10 */
  var info = {};

  // detect type of data
  if (data instanceof Point) {
    info.point = data;
  } else if (PublicKey._isJSON(data)) {
    info = PublicKey._transformJSON(data);
  } else if (typeof(data) === 'string') {
    info = PublicKey._transformBuffer(new Buffer(data, 'hex'));
  } else if (PublicKey._isBuffer(data)) {
    info = PublicKey._transformBuffer(data);
  } else if (PublicKey._isPrivateKey(data)) {
    info = PublicKey._transformPrivateKey(data);
  } else {
    throw new TypeError('First argument is an unrecognized data format.');
  }
  if (!info.network) {
    info.network = _.isUndefined(extra.network) ? undefined : Network.get(extra.network);
  }
  return info;
};

/**
 * Internal function to detect if an object is a {@link PrivateKey}
 *
 * @param {*} param - object to test
 * @returns {boolean}
 * @private
 */
PublicKey._isPrivateKey = function(param) {
  var PrivateKey = require('./privatekey');
  return param instanceof PrivateKey;
};

/**
 * Internal function to detect if an object is a Buffer
 *
 * @param {*} param - object to test
 * @returns {boolean}
 * @private
 */
PublicKey._isBuffer = function(param) {
  return (param instanceof Buffer) || (param instanceof Uint8Array);
};

/**
 * Internal function to detect if a param is a JSON string or plain object
 *
 * @param {*} json - value to test
 * @returns {boolean}
 * @private
 */
PublicKey._isJSON = function(json) {
  return !!(JSUtil.isValidJSON(json) || (json.x && json.y));
};

/**
 * Internal function to transform a private key into a public key point
 *
 * @param {PrivateKey} privkey - An instance of PrivateKey
 * @returns {Object} An object with keys: point
 * @private
 */
PublicKey._transformPrivateKey = function(privkey) {
  $.checkArgument(PublicKey._isPrivateKey(privkey),
    new TypeError('Must be an instance of PrivateKey'));
  var info = {};
  info.point = Point.getG().mul(privkey.bn);
  info.network = privkey.network;
  return info;
};

/**
 * Internal function to transform DER into a public key point
 *
 * @param {Buffer} buf - An hex encoded buffer
 * @param {bool=} strict - if set to false, will loosen some conditions
 * @returns {Object} An object with keys: point
 * @private
 */
PublicKey._transformBufferReader = function(reader) {
  var info = {};

  var header = reader.readUInt8();
  $.checkArgument(header === 0x02 || header === 0x03, 'Invalid DER format compressed public key');
  var xbuf = reader.read(32);
  var x = new BN(xbuf);
  info = PublicKey._transformX(header === 0x03, x);
  return info;
};

/**
 * Internal function to transform X into a public key point
 *
 * @param {Boolean} odd - If the point is above or below the x axis
 * @param {Point} x - The x point
 * @returns {Object} An object with keys: point
 * @private
 */
PublicKey._transformX = function(odd, x) {
  $.checkArgument(typeof odd === 'boolean',
    new TypeError('Must specify whether y is odd or not (true or false)'));
  var info = {};
  info.point = Point.fromX(odd, x);
  return info;
};

/**
 * Instantiate a PublicKey from JSON
 *
 * @param {string} json - A JSON string
 * @returns {PublicKey} A new valid instance of PublicKey
 */
PublicKey.fromJSON = function(json) {
  $.checkArgument(PublicKey._isJSON(json),
    new TypeError('Must be a valid JSON string or plain object'));
  return new PublicKey(json);
};

PublicKey.fromObject = PublicKey.fromJSON; // TODO: fix this

/**
 * Internal function to transform a JSON into a public key point
 *
 * @param {String|Object} json - a JSON string or plain object
 * @private
 */
PublicKey._transformJSON = function(json) {
  if (JSUtil.isValidJSON(json)) {
    json = JSON.parse(json);
  }
  var x = new BN(json.x, 'hex');
  var y = new BN(json.y, 'hex');
  var point = new Point(x, y);
  return new PublicKey(point);
};

/**
 * Instantiate a PublicKey from a PrivateKey
 *
 * @param {PrivateKey} privkey - An instance of PrivateKey
 * @returns {PublicKey} A new valid instance of PublicKey
 */
PublicKey.fromPrivateKey = function(privkey) {
  $.checkArgument(PublicKey._isPrivateKey(privkey), new TypeError('Must be an instance of PrivateKey'));
  var info = PublicKey._transformPrivateKey(privkey);
  return new PublicKey(info.point, {
    network: info.network
  });
};

/**
 * Instantiate a PublicKey from a Buffer
 * @param {Buffer} buf - A DER hex buffer
 * @param {bool=} strict - if set to false, will loosen some conditions
 * @returns {PublicKey} A new valid instance of PublicKey
 */
PublicKey.fromDER = PublicKey.fromBuffer = function(buf) {
  $.checkArgument(PublicKey._isBuffer(buf),
    new TypeError('Must be a hex buffer of DER encoded public key'));
  return PublicKey.fromBufferReader(BufferReader(buf));
};

PublicKey._transformBuffer = function(buf) {
  return PublicKey._transformBufferReader(BufferReader(buf));
};

PublicKey.fromBufferReader = function(reader) {
  var info = PublicKey._transformBufferReader(reader);
  return new PublicKey(info.point);
};

/**
 * Instantiate a PublicKey from a Point
 *
 * @param {Point} point - A Point instance
 * @returns {PublicKey} A new valid instance of PublicKey
 */
PublicKey.fromPoint = function(point) {
  $.checkArgument(point instanceof Point,
    new TypeError('First argument must be an instance of Point.'));
  return new PublicKey(point);
};

/**
 * Instantiate a PublicKey from a DER hex encoded string
 
 * @param {string} str - A DER hex string
 * @param {String=} encoding - The type of string encoding
 * @returns {PublicKey} A new valid instance of PublicKey
 */
PublicKey.fromString = function(str, encoding) {
  var buf = new Buffer(str, encoding || 'hex');
  var info = PublicKey._transformBuffer(buf);
  return new PublicKey(info.point);
};

/**
 * Instantiate a PublicKey from an X Point
 *
 * @param {Boolean} odd - If the point is above or below the x axis
 * @param {Point} x - The x point
 * @returns {PublicKey} A new valid instance of PublicKey
 */
PublicKey.fromX = function(odd, x) {
  var info = PublicKey._transformX(odd, x);
  return new PublicKey(info.point);
};

/**
 * Check if there would be any errors when initializing a PublicKey
 *
 * @param {string} data - The encoded data in various formats
 * @returns {null|Error} An error if exists
 */
PublicKey.getValidationError = function(data) {
  var error;
  try {
    /* jshint nonew: false */
    new PublicKey(data);
  } catch (e) {
    error = e;
  }
  return error;
};

/**
 * Check if the parameters are valid
 *
 * @param {string} data - The encoded data in various formats
 * @returns {Boolean} If the public key would be valid
 */
PublicKey.isValid = function(data) {
  return !PublicKey.getValidationError(data);
};

/**
 * @returns {Object} A plain object of the PublicKey
 */
PublicKey.prototype.toObject = function toObject() {
  return {
    x: this.point.getX().toString('hex', 2),
    y: this.point.getY().toString('hex', 2),
  };
};

/**
 * @returns {string} A JSON string of the PublicKey
 */
PublicKey.prototype.toJSON = function toJSON() {
  return JSON.stringify(this.toObject());
};

/**
 * Will output the PublicKey to a DER Buffer
 *
 * @returns {Buffer} A DER hex encoded buffer
 */
PublicKey.prototype.toBuffer = PublicKey.prototype.toDER = function() {
  return this.toBufferWriter().toBuffer();
};

PublicKey.prototype.toBufferWriter = function(writer) {
  if (!writer) {
    writer = new BufferWriter();
  }
  var x = this.point.getX();
  var y = this.point.getY();

  var xbuf = x.toBuffer({
    size: 32
  });
  var ybuf = y.toBuffer({
    size: 32
  });

  var odd = ybuf[ybuf.length - 1] % 2;
  writer.writeUInt8(odd ? 0x03 : 0x02);
  writer.write(xbuf);

  return writer;
};

/**
 * Will return a sha256 + ripemd160 hash of the serialized public key
 * @see https://github.com/bitcoin/bitcoin/blob/master/src/pubkey.h#L141
 * @returns {Buffer}
 */
PublicKey.prototype._getID = function _getID() {
  return Hash.sha256ripemd160(this.toBuffer());
};

/**
 * Will output the PublicKey to a DER encoded hex string
 *
 * @returns {string} A DER hex encoded string
 */
PublicKey.prototype.toString = function() {
  return this.toDER().toString('hex');
};

/**
 * Will return a string formatted for the console
 *
 * @returns {string} Public key
 */
PublicKey.prototype.inspect = function() {
  return '<PublicKey: ' + this.toString() + '>';
};

module.exports = PublicKey;
