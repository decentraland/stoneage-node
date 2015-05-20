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
  this.inputs = [];
  this.outputs = [];
  this._inputAmount = undefined;
  this._outputAmount = undefined;

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
var DEFAULT_NLOCKTIME = 0;
var MAX_BLOCK_SIZE = 1000000;

// Minimum amount for an output for it not to be considered a dust output
Transaction.DUST_AMOUNT = 546;

// Margin of error to allow fees in the vecinity of the expected value but doesn't allow a big difference
Transaction.FEE_SECURITY_MARGIN = 15;

// max amount of satoshis in circulation
Transaction.MAX_MONEY = 21000000 * 1e8;

// nlocktime limit to be considered block height rather than a timestamp
Transaction.NLOCKTIME_BLOCKHEIGHT_LIMIT = 5e8;

// Max value for an unsigned 32 bit value
Transaction.NLOCKTIME_MAX_VALUE = 4294967295;

// Value used for fee estimation (satoshis per kilobyte)
Transaction.FEE_PER_KB = 10000;

// Safe upper bound for change address script size in bytes
Transaction.CHANGE_OUTPUT_MAX_SIZE = 20 + 4 + 34 + 4;
Transaction.MAXIMUM_EXTRA_SIZE = 4 + 9 + 9 + 4;

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

var ioProperty = {
  configurable: false,
  enumerable: true,
  get: function() {
    return this._getInputAmount();
  }
};
Object.defineProperty(Transaction.prototype, 'inputAmount', ioProperty);
ioProperty.get = function() {
  return this._getOutputAmount();
};
Object.defineProperty(Transaction.prototype, 'outputAmount', ioProperty);

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
 * * `disableSmallFees`: disable checking for fees that are too small
 * * `disableLargeFees`: disable checking for fees that are too large
 * * `disableNotFullySigned`: disable checking if all inputs are fully signed
 * * `disableDustOutputs`: disable checking if there are no outputs that are dust amounts
 * * `disableMoreOutputThanInput`: disable checking if the transaction spends more bitcoins than the sum of the input amounts
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

Transaction.prototype.invalidSatoshis = function() {
  var invalid = false;
  for (var i = 0; i < this.outputs.length; i++) {
    if (this.outputs[i].invalidSatoshis()) {
      invalid = true;
    }
  }
  return invalid;
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

  return this._isInvalidSatoshis() ||
      this._hasFeeError(opts) ||
      this._hasDustOutputs(opts) ||
      this._isMissingSignatures(opts) ||
      this._hasMoreOutputThanInput(opts);
};

Transaction.prototype._isInvalidSatoshis = function() {
  if (this.invalidSatoshis()) {
    return new errors.Transaction.InvalidSatoshis();
  }
};

Transaction.prototype._hasFeeError = function(opts) {
  return this._isFeeDifferent() ||
      this._isFeeTooLarge(opts) ||
      this._isFeeTooSmall(opts);
};

Transaction.prototype._isFeeDifferent = function() {
  if (!_.isUndefined(this._fee)) {
    var fee = this._fee;
    var unspent = this._getUnspentValue();
    if (fee !== unspent) {
      return new errors.Transaction.FeeError.Different('Unspent value is ' + unspent + ' but specified fee is ' + fee);
    }
  }
};

Transaction.prototype._isFeeTooLarge = function(opts) {
  if (opts.disableLargeFees) {
    return;
  }
  var fee = this._getUnspentValue();
  var maximumFee = Math.floor(Transaction.FEE_SECURITY_MARGIN * this._estimateFee());
  if (fee > maximumFee) {
    if (this._missingChange()) {
      return new errors.Transaction.ChangeAddressMissing('Fee is too large and no change address was provided');
    }
    return new errors.Transaction.FeeError.TooLarge('expected less than ' + maximumFee + ' but got ' + fee);
  }
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

Transaction.prototype.writeOutput = function(writer) {
  this.writeColor(writer);
  this.owner.toBufferWriter(writer);
};

Transaction.prototype.writeColor = function(writer) {
  writer.writeUInt8(this.color.r);
  writer.writeUInt8(this.color.g);
  writer.writeUInt8(this.color.b);
  writer.writeUInt8(this.color.a);
};

Transaction.prototype.toBufferWriter = function(writer) {
  writer.writeUInt32LE(this.version);
  // input
  writer.writeReverse(this.prevTxId);
  // output
  this.writeOutput(writer);
  return writer;
};

Transaction.prototype.fromBuffer = function(buffer) {
  var reader = new BufferReader(buffer);
  return this.fromBufferReader(reader);
};

Transaction.prototype.fromBufferReader = function(reader) {
  $.checkArgument(!reader.finished(), 'No transaction data received');
  var i, sizeTxIns, sizeTxOuts;

  this.version = reader.readUInt32LE();
  sizeTxIns = reader.readVarintNum();
  for (i = 0; i < sizeTxIns; i++) {
    var input = Input.fromBufferReader(reader);
    this.inputs.push(input);
  }
  sizeTxOuts = reader.readVarintNum();
  for (i = 0; i < sizeTxOuts; i++) {
    this.outputs.push(Output.fromBufferReader(reader));
  }
  this.nLockTime = reader.readUInt32LE();
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
    nLockTime: this.nLockTime
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
  this.nLockTime = transaction.nLockTime;
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

/**
 * Sets nLockTime so that transaction is not valid until the desired date(a
 * timestamp in seconds since UNIX epoch is also accepted)
 *
 * @param {Date | Number} time
 * @return {Transaction} this
 */
Transaction.prototype.lockUntilDate = function(time) {
  $.checkArgument(time);
  if (_.isNumber(time) && time < Transaction.NLOCKTIME_BLOCKHEIGHT_LIMIT) {
    throw new errors.Transaction.LockTimeTooEarly();
  }
  if (_.isDate(time)) {
    time = time.getTime() / 1000;
  }
  this.nLockTime = time;
  return this;
};

/**
 * Sets nLockTime so that transaction is not valid until the desired block
 * height.
 *
 * @param {Number} height
 * @return {Transaction} this
 */
Transaction.prototype.lockUntilBlockHeight = function(height) {
  $.checkArgument(_.isNumber(height));
  if (height >= Transaction.NLOCKTIME_BLOCKHEIGHT_LIMIT) {
    throw new errors.Transaction.BlockHeightTooHigh();
  }
  if (height < 0) {
    throw new errors.Transaction.NLockTimeOutOfRange();
  }
  this.nLockTime = height;
  return this;
};


Transaction.prototype.toJSON = function toJSON() {
  return JSON.stringify(this.toObject());
};

Transaction.prototype.fromString = function(string) {
  this.fromBuffer(new buffer.Buffer(string, 'hex'));
};

Transaction.prototype._newTransaction = function() {
  this.version = CURRENT_VERSION;
  this.nLockTime = DEFAULT_NLOCKTIME;
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
  // Basic checks that don't depend on any context
  if (this.inputs.length === 0) {
    return 'transaction txins empty';
  }

  if (this.outputs.length === 0) {
    return 'transaction txouts empty';
  }

  // Check for negative or overflow output values
  var valueoutbn = new BN(0);
  for (var i = 0; i < this.outputs.length; i++) {
    var txout = this.outputs[i];

    if (txout.invalidSatoshis()) {
      return 'transaction txout ' + i + ' satoshis is invalid';
    }
    if (txout._satoshisBN.gt(new BN(Transaction.MAX_MONEY, 10))) {
      return 'transaction txout ' + i + ' greater than MAX_MONEY';
    }
    valueoutbn = valueoutbn.add(txout._satoshisBN);
    if (valueoutbn.gt(new BN(Transaction.MAX_MONEY))) {
      return 'transaction txout ' + i + ' total output greater than MAX_MONEY';
    }
  }

  // Size limits
  if (this.toBuffer().length > MAX_BLOCK_SIZE) {
    return 'transaction over the maximum block size';
  }

  // Check for duplicate inputs
  var txinmap = {};
  for (i = 0; i < this.inputs.length; i++) {
    var txin = this.inputs[i];

    var inputid = txin.prevTxId + ':' + txin.outputIndex;
    if (!_.isUndefined(txinmap[inputid])) {
      return 'transaction input ' + i + ' duplicate input';
    }
    txinmap[inputid] = true;
  }

  var isCoinbase = this.isCoinbase();
  if (isCoinbase) {
    var buf = this.inputs[0]._scriptBuffer;
    if (buf.length < 2 || buf.length > 100) {
      return 'coinbase transaction script size invalid';
    }
  } else {
    for (i = 0; i < this.inputs.length; i++) {
      if (this.inputs[i].isNull()) {
        return 'transaction input ' + i + ' has null input';
      }
    }
  }
  return true;
};

/**
 * Analagous to bitcoind's IsCoinBase function in transaction.h
 */
Transaction.prototype.isCoinbase = function() {
  return (this.inputs.length === 1 && this.inputs[0].isNull());
};


module.exports = Transaction;
