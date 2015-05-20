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
var BN = require('../crypto/bn');


/**
 * Represents a transaction, a set of inputs and outputs to change ownership of tokens
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
 * it dropping any additional information that inputs and outputs may have hold
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
  writer.writeReverse(this.prevTxId);
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
  this.prevTxId = reader.readReverse(32);
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
  var inputs = [];
  this.inputs.forEach(function(input) {
    inputs.push(input.toObject());
  });
  var outputs = [];
  this.outputs.forEach(function(output) {
    outputs.push(output.toObject());
  });
  var obj = {
    version: this.version,
    inputs: inputs,
    outputs: outputs,
  };
  if (this._changeScript) {
    obj.changeScript = this._changeScript.toString();
  }
  if (!_.isUndefined(this._changeIndex)) {
    obj.changeIndex = this._changeIndex;
  }
  if (!_.isUndefined(this._fee)) {
    obj.fee = this._fee;
  }
  return obj;
};

Transaction.prototype.fromObject = function(transaction) {
  var self = this;
  if (transaction instanceof Transaction) {
    transaction = transaction.toObject();
  }
  _.each(transaction.inputs, function(input) {
    if (!input.output || !input.output.script) {
      self.uncheckedAddInput(new Input(input));
      return;
    }
    input.output.script = new Script(input.output.script);
    var txin;
    if (input.output.script.isPublicKeyHashOut()) {
      txin = new Input.PublicKeyHash(input);
    } else if (input.output.script.isScriptHashOut() && input.publicKeys && input.threshold) {
      txin = new Input.MultiSigScriptHash(
        input, input.publicKeys, input.threshold, input.signatures
      );
    } else {
      throw new errors.Transaction.Input.UnsupportedScript(input.output.script);
    }
    self.addInput(txin);
  });
  _.each(transaction.outputs, function(output) {
    self.addOutput(new Output(output));
  });
  if (transaction.changeIndex) {
    this._changeIndex = transaction.changeIndex;
  }
  if (transaction.changeScript) {
    this._changeScript = new Script(transaction.changeScript);
  }
  if (transaction.fee) {
    this.fee(transaction.fee);
  }
  this.version = transaction.version;
  this._checkConsistency();
  return this;
};

Transaction.prototype._checkConsistency = function() {
  if (!_.isUndefined(this._changeIndex)) {
    $.checkState(this._changeScript);
    $.checkState(this.outputs[this._changeIndex]);
    $.checkState(this.outputs[this._changeIndex].script.toString() ===
      this._changeScript.toString());
  }
  // TODO: add other checks
};

Transaction.prototype.toJSON = function toJSON() {
  return JSON.stringify(this.toObject());
};

Transaction.prototype.fromString = function(string) {
  this.fromBuffer(new buffer.Buffer(string, 'hex'));
};

Transaction.prototype._newTransaction = function() {
  this.version = CURRENT_VERSION;
  this.prevTxId = BufferUtil.emptyBuffer(32);
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
  this.prevTxId = txid;
  return this;
};

/**
 * Add an output to the transaction.
 *
 * Beware that this resets all the signatures for inputs (in further versions,
 * SIGHASH_SINGLE or SIGHASH_NONE signatures will not be reset).
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
  _.each(this.inputs, function(input) {
    input.clearSignatures();
  });
};

/* Signature handling */

/**
 * Sign the transaction using one or more private keys.
 *
 * It tries to sign each input, verifying that the signature will be valid
 * (matches a public key).
 *
 * @param {Array|String|PrivateKey} privateKey
 * @param {number} sigtype
 * @return {Transaction} this, for chaining
 */
Transaction.prototype.sign = function(privateKey, sigtype) {
  $.checkState(this.hasAllUtxoInfo());
  var self = this;
  if (_.isArray(privateKey)) {
    _.each(privateKey, function(privateKey) {
      self.sign(privateKey, sigtype);
    });
    return this;
  }
  _.each(this.getSignatures(privateKey, sigtype), function(signature) {
    self.applySignature(signature);
  });
  return this;
};

Transaction.prototype.getSignatures = function(privKey, sigtype) {
  privKey = new PrivateKey(privKey);
  sigtype = sigtype || Signature.SIGHASH_ALL;
  var transaction = this;
  var results = [];
  var hashData = Hash.sha256ripemd160(privKey.publicKey.toBuffer());
  _.each(this.inputs, function forEachInput(input, index) {
    _.each(input.getSignatures(transaction, privKey, index, sigtype, hashData), function(signature) {
      results.push(signature);
    });
  });
  return results;
};

/**
 * Add a signature to the transaction
 *
 * @param {Object} signature
 * @param {number} signature.inputIndex
 * @param {number} signature.sigtype
 * @param {PublicKey} signature.publicKey
 * @param {Signature} signature.signature
 * @return {Transaction} this, for chaining
 */
Transaction.prototype.applySignature = function(signature) {
  this.inputs[signature.inputIndex].addSignature(this, signature);
  return this;
};

Transaction.prototype.isFullySigned = function() {
  _.each(this.inputs, function(input) {
    if (input.isFullySigned === Input.prototype.isFullySigned) {
      throw new errors.Transaction.UnableToVerifySignature(
        'Unrecognized script kind, or not enough information to execute script.' +
        'This usually happens when creating a transaction from a serialized transaction'
      );
    }
  });
  return _.all(_.map(this.inputs, function(input) {
    return input.isFullySigned();
  }));
};

Transaction.prototype.isValidSignature = function(signature) {
  var self = this;
  if (this.inputs[signature.inputIndex].isValidSignature === Input.prototype.isValidSignature) {
    throw new errors.Transaction.UnableToVerifySignature(
      'Unrecognized script kind, or not enough information to execute script.' +
      'This usually happens when creating a transaction from a serialized transaction'
    );
  }
  return this.inputs[signature.inputIndex].isValidSignature(self, signature);
};

/**
 * @returns {bool} whether the signature is valid for this transaction input
 */
Transaction.prototype.verifySignature = function(sig, pubkey, nin, subscript) {
  return Sighash.verify(this, sig, pubkey, nin, subscript);
};

/**
 * Check that a transaction passes basic sanity tests. If not, return a string
 * describing the error. This function contains the same logic as
 * CheckTransaction in bitcoin core.
 */
Transaction.prototype.verify = function() {
  // Size limits
  if (this.toBuffer().length > MAX_BLOCK_SIZE) {
    return 'transaction over the maximum block size';
  }
  return true;
};

Transaction.prototype.isCoinbase = function() {
  return this.prevTxId === BufferUtil.NULL_HASH;
};


module.exports = Transaction;
