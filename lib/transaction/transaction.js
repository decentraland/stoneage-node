'use strict';

var _ = require('lodash');
var $ = require('../util/preconditions');
var buffer = require('buffer');

var errors = require('../errors');
var BufferUtil = require('../util/buffer');
var JSUtil = require('../util/js');
var BufferReader = require('../encoding/bufferreader');
var BufferWriter = require('../encoding/bufferwriter');
var Hash = require('../crypto/hash');
var Signature = require('../crypto/signature');
var Sighash = require('./sighash');

var PrivateKey = require('../privatekey');
var PublicKey = require('../publickey');


/**
 *
 * @param {*} serialized
 * @constructor
 */
function Transaction(serialized) {
  if (!(this instanceof Transaction)) {
    return new Transaction(serialized);
  }
  if (serialized) {
    if (serialized instanceof Transaction) {
      return Transaction.shallowCopy(serialized);
    } else if (JSUtil.isHexa(serialized)) {
      this.fromString(serialized);
    } else if (JSUtil.isValidJSON(serialized)) {
      this.fromJSON(serialized);
    } else if (BufferUtil.isBuffer(serialized)) {
      this.fromBuffer(serialized);
    } else if (_.isObject(serialized)) {
      this.fromObject(serialized);
    } else {
      throw new errors.InvalidArgument('Must provide an object or string to deserialize a transaction');
    }
  } else {
    this._newTransaction();
  }
}

var CURRENT_VERSION = 1;
var MAX_BLOCK_SIZE = 1000000;

/* Constructors and Serialization */

/**
 * Create a 'shallow' copy of the transaction, by serializing and deserializing
 *
 * @param {Transaction} transaction
 * @return {Transaction}
 */
Transaction.shallowCopy = function(transaction) {
  var copy = new Transaction(transaction.toBuffer());
  return copy;
};

var hashProperty = {
  configurable: false,
  enumerable: true,
  get: function() {
    return new BufferReader(this._getHash()).readReverse().toString('hex');
  }
};
Object.defineProperty(Transaction.prototype, 'hash', hashProperty);
Object.defineProperty(Transaction.prototype, 'id', hashProperty);

/**
 * Retrieve the little endian hash of the transaction (used for serialization)
 * @return {Buffer}
 */
Transaction.prototype._getHash = function() {
  return Hash.sha256sha256(this.toBuffer());
};

/**
 * Retrieve a hexa string that can be used with bitcoind's CLI interface
 * (decoderawtransaction, sendrawtransaction)
 *
 * @param {Object|boolean=} unsafe if true, skip all tests. if it's an object,
 *   it's expected to contain a set of flags to skip certain tests:
 * * `disableAll`: disable all checks
 * @return {string}
 */
Transaction.prototype.serialize = function(unsafe) {
  if (true === unsafe || unsafe && unsafe.disableAll) {
    return this.uncheckedSerialize();
  } else {
    return this.checkedSerialize(unsafe);
  }
};

Transaction.prototype.uncheckedSerialize = Transaction.prototype.toString = function() {
  return this.toBuffer().toString('hex');
};

/**
 * Retrieve a hexa string that can be used with bitcoind's CLI interface
 * (decoderawtransaction, sendrawtransaction)
 *
 * @param {Object} opts allows to skip certain tests. {@see Transaction#serialize}
 * @return {string}
 */
Transaction.prototype.checkedSerialize = function(opts) {
  var serializationError = this.getSerializationError(opts);
  if (serializationError) {
    serializationError.message += ' Use Transaction#uncheckedSerialize if you want to skip security checks. ' +
      'See http://bitcore.io/guide/transaction.html#Serialization for more info.';
    throw serializationError;
  }
  return this.uncheckedSerialize();
};

/**
 * Retrieve a possible error that could appear when trying to serialize and
 * broadcast this transaction.
 *
 * @param {Object} opts allows to skip certain tests. {@see Transaction#serialize}
 * @return {bitcore.Error}
 */
Transaction.prototype.getSerializationError = function(opts) {
  opts = opts || {};
  return this._isMissingSignatures(opts);
};

Transaction.prototype._isMissingSignatures = function(opts) {
  if (opts.disableIsFullySigned) {
    return;
  }
  if (!this.isFullySigned()) {
    return new errors.Transaction.MissingSignatures();
  }
};

Transaction.prototype.inspect = function() {
  return '<Transaction: ' + this.uncheckedSerialize() + '>';
};

Transaction.prototype.toBuffer = function() {
  var writer = new BufferWriter();
  return this.toBufferWriter(writer).toBuffer();
};

Transaction.prototype.toBufferWriter = function(writer) {
  writer.writeUInt32LE(this.version);
  writer.writeReverse(this.previous);
  writer.writeUInt32LE(this.color);
  this.owner.toBufferWriter(writer);
  return writer;
};

Transaction.prototype.fromBuffer = function(buffer) {
  var reader = new BufferReader(buffer);
  return this.fromBufferReader(reader);
};

Transaction.prototype.fromBufferReader = function(reader) {
  $.checkArgument(!reader.finished(), 'No transaction data received');
  this.version = reader.readUInt32LE();
  this.previous = reader.readReverse(32);
  this.color = reader.readUInt32LE();
  this.owner = PublicKey.fromBufferReader(reader);

  return this;
};

Transaction.prototype.fromJSON = function(json) {
  if (JSUtil.isValidJSON(json)) {
    json = JSON.parse(json);
  }
  return this.fromObject(json);
};

Transaction.prototype.toObject = function toObject() {
  var obj = {
    version: this.version,
    previous: this.previous.toString('hex'),
    color: this.color,
    owner: this.owner.toObject(),
  };
  return obj;
};

Transaction.prototype.fromObject = function(transaction) {
  if (transaction instanceof Transaction) {
    transaction = transaction.toObject();
  }
  this.version = transaction.version;
  this.previous = new Buffer(transaction.previous, 'hex');
  this.color = transaction.color;
  this.owner = PublicKey.fromObject(transaction.owner);
  this._checkConsistency();
  return this;
};

Transaction.prototype._checkConsistency = function() {};

Transaction.prototype.toJSON = function toJSON() {
  return JSON.stringify(this.toObject());
};

Transaction.prototype.fromString = function(string) {
  this.fromBuffer(new buffer.Buffer(string, 'hex'));
};

Transaction.prototype._newTransaction = function() {
  this.version = CURRENT_VERSION;
  this.previous = BufferUtil.emptyBuffer(32);
  this.color = 0;
  this.owner = null;
};

/* Transaction creation interface */

/**
 *
 * @param {Object} txid 
 */
Transaction.prototype.from = function(txid) {
  if (_.isString(txid)) {
    txid = new Buffer(txid, 'hex');
  }
  $.checkArgument(txid, 'txid is required');
  this.previous = txid;
  return this;
};

/**
 * Add an output to the transaction.
 *
 * @param {string|PublicKey} owner
 * @return {Transaction} this, for chaining
 */
Transaction.prototype.to = function(owner) {
  if (_.isString(owner)) {
    owner = new PublicKey(owner);
  }
  $.checkArgument(owner instanceof PublicKey, 'owner is required and must be a PublicKey');
  this.owner = owner;
  return this;
};

Transaction.prototype._clearSignatures = function() {
  this.signature = null;
};

/* Signature handling */

/**
 * Sign the transaction using one or more private keys.
 *
 * @param {Array|String|PrivateKey} privateKey
 * @return {Transaction} this, for chaining
 */
Transaction.prototype.sign = function(privateKey) {
  $.checkState(this.hasAllSigningInfo());
  var self = this;
  if (_.isArray(privateKey)) {
    var keys = privateKey;
    _.each(keys, function(pk) {
      self.sign(pk);
    });
    return this;
  }
  var signature = this.getSignature(privateKey);
  self.applySignature(signature, privateKey.toPublicKey());
  return this;
};

Transaction.prototype.getSignature = function(privateKey) {
  privateKey = new PrivateKey(privateKey);
  var transaction = this;
  return Sighash.sign(transaction, privateKey);
};

/**
 * Add a signature to the transaction
 *
 * @param {Signature} signature
 * @return {Transaction} this, for chaining
 */
Transaction.prototype.applySignature = function(signature, publicKey) {
  $.checkArgument(signature, 'signature is required');
  $.checkArgument(publicKey, 'publicKey is required');
  $.checkArgument(this.isValidSignature(signature, publicKey), 'invalid signature for this transaction');
  this.signature = signature;
  return this;
};

Transaction.prototype.isFullySigned = function() {
  return !!this.signature;
};

Transaction.prototype.isValidSignature = function(signature, publicKey) {
  return Sighash.verify(this, signature, publicKey);
};

Transaction.prototype.isCoinbase = function() {
  return this.previous === BufferUtil.NULL_HASH;
};


module.exports = Transaction;
