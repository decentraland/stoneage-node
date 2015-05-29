'use strict';

var events = require('events');
var util = require('util');
var _ = require('lodash');

var $ = require('./util/preconditions');

var Sighash = require('./transaction/sighash');
var BlockStore = require('./store/block');
var TransactionStore = require('./store/transaction');

var errors = require('./errors');

var NULL = '0000000000000000000000000000000000000000000000000000000000000000';

var MAX_REWIND = 100;

var neighbors = function(pos) {
  return [
    {x: pos.x -1, y: pos.y},
    {x: pos.x +1, y: pos.y},
    {x: pos.x, y: pos.y - 1},
    {x: pos.x, y: pos.y + 1}
  ];
};

var posToString = function(pos) {
  return pos.x + '_' + pos.y;
};

function Blockchain() {
  events.EventEmitter.call(this);
  this.tip = NULL;
  this.work = {};
  this.work[NULL] = 0;
  this.height = {};
  this.height[NULL] = -1;
  this.hashByHeight = {
    '-1': NULL
  };
  this.next = {};
  this.prev = {};

  this.pixels = {};

  this.blockStore = new BlockStore();
  this.txStore = new TransactionStore();
}
util.inherits(Blockchain, events.EventEmitter);

Blockchain.NULL = NULL;

Blockchain.fromObject = function(obj) {
  var blockchain = new Blockchain();
  blockchain.tip = obj.tip;
  blockchain.work = obj.work;
  blockchain.hashByHeight = obj.hashByHeight;
  blockchain.height = obj.height;
  blockchain.next = obj.next;
  blockchain.prev = obj.prev;
  return blockchain;
};

var getWork = function(hash) {
  // TODO: Calculate work
  return 1;
};

Blockchain.prototype.addHashReferences = function(block) {

  var self = this;
  var prevHash = block.prevHash;
  var hash = block.hash;

  this.work[hash] = this.work[prevHash] + getWork(hash);
  this.prev[hash] = prevHash;
};

Blockchain.prototype.saveBlockToStore = function(block) {
  this.blockStore.set(block);
  this.saveTxToStore(block);
};

Blockchain.prototype.saveTxToStore = function(block) {
  var self = this;
  block.transactions.map(function(tx) {
    self.txStore.set(tx);
  });
};

Blockchain.prototype.isValidBlock = function(block) {
  try {
    this.checkValidBlock(block);
  } catch (e) {
    return false;
  }
  return true;
};

Blockchain.prototype.checkValidBlock = function(block) {
  if (_.isUndefined(this.work[block.prevHash])) {
    throw new errors.Blockchain.MissingParent(block.hash, block.prevHash);
  }
  var coinbase = block.transactions[0];
  var coinbasePos = posToString(coinbase.position);
  if (this.pixels[coinbasePos]) {
    throw new errors.Blockchain.PixelMined(coinbasePos);
  }
  var neighborList = neighbors(coinbase.position);
  var adjacent = block.height === 0;
  for (var i = 0; i < neighborList.length; i++) {
    if (this.pixels[posToString(neighborList[i])]) {
      adjacent = true;
    }
  }
  if (!adjacent) {
    throw new errors.Blockchain.NotAdjacent();
  }
  var prevTx = {};
  prevTx[coinbasePos] = coinbase;
  for (var i = 1; i < block.transactions.length; i++) {
    var tx = block.transactions[i];
    var pos = posToString(tx.position);
    if (!prevTx[pos]) {
      prevTx[pos] = this.pixels[pos];
    }
    if (!Sighash.verify(tx, tx.signature, prevTx[pos].owner)) {
      throw new errors.Blockchain.SignatureMismatch(tx, block.hash, i);
    }
    prevTx[pos] = tx;
  }
  return true;
};

Blockchain.prototype._appendNewBlock = function(hash) {
  var toUnconfirm = [];
  var toConfirm = [];
  var self = this;

  // console.log('Appending new block' + hash);

  var pointer = hash;
  while (_.isUndefined(this.height[pointer])) {
    toConfirm.push(pointer);
    pointer = this.prev[pointer];
  }
  var commonAncestor = pointer;

  pointer = this.tip;
  while (pointer !== commonAncestor) {
    toUnconfirm.push(pointer);
    pointer = this.prev[pointer];
  }

  toConfirm.reverse();
  toUnconfirm.map(function(hash) {
    self.unconfirm(this.blockStore.get(hash));
  }, this);
  try {
    toConfirm.map(function(hash) {
      var block = this.blockStore.get(hash);
      $.checkArgument(this.isValidBlock(block));
      self.confirm(block);
    }, this);
  } catch (e) {
    // console.log('Rollback: ' + e.message);
    toUnconfirm.reverse();
    toUnconfirm.map(function(hash) {
      self.confirm(this.blockStore.get(hash));
    }, this);

    throw e;
  }
  return {
    unconfirmed: toUnconfirm,
    confirmed: toConfirm
  };
};

Blockchain.prototype.proposeNewBlock = function(block) {
  var prevHash = block.prevHash;
  var hash = block.hash;

  $.checkState(this.hasData(prevHash), 'No previous data to estimate work');
  this.saveBlockToStore(block);
  this.addHashReferences(block);

  var work = this.work[hash];
  var tipWork = this.work[this.tip];
  $.checkState(!_.isUndefined(work), 'No work found for ' + hash);
  $.checkState(!_.isUndefined(tipWork), 'No work found for tip ' + this.tip);

  // console.log('Tip has ' + tipWork + '(hash ' + this.tip + '); new block has '+work+' (hash '+hash+')');
  if (work > tipWork) {
    return this._appendNewBlock(hash);
  }
  return {
    unconfirmed: [],
    confirmed: []
  };
};

Blockchain.prototype.confirm = function(block) {
  var hash = block.hash;
  var prevHash = this.prev[hash];
  $.checkState(
    prevHash !== NULL || prevHash === this.tip,
    'Attempting to confirm a non-contiguous block.'
  );

  this.tip = hash;
  var height = this.height[prevHash] + 1;
  this.next[prevHash] = hash;
  this.hashByHeight[height] = hash;
  this.height[hash] = height;

  for (var i = 0; i < block.transactions.length; i++) {
    var tx = block.transactions[i];
    var pos = posToString(tx.position);
    // console.log('Update: pixel pos' + pos + ' set to ' + block.hash + ':' + i);
    this.pixels[pos] = tx;
  }
};

Blockchain.prototype.unconfirm = function(block) {
  var hash = block.hash;
  var prevHash = this.prev[hash];
  $.checkState(hash === this.tip, 'Attempting to unconfirm a non-tip block');

  this.tip = prevHash;
  var height = this.height[hash];
  delete this.next[prevHash];
  delete this.hashByHeight[height];
  delete this.height[hash];

  for (var i = block.transactions.length - 1; i > 0; i--) {
    var tx = block.transactions[i];
    var prevTx = this.txStore.get(tx.input);
    this.pixels[posToString(prevTx.position)] = prevTx;
  }
  delete this.pixels[posToString(block.transactions[0].position)];
};

Blockchain.prototype.hasData = function(hash) {
  if (hash === NULL) {
    return true;
  }
  return !_.isUndefined(this.work[hash]);
};

Blockchain.prototype.prune = function() {
  var self = this;
  _.each(this.prev, function(key) {
    if (!self.height[key]) {
      delete self.prev[key];
      delete self.work[key];
    }
  });
};

Blockchain.prototype.toObject = function() {
  return {
    tip: this.tip,
    work: this.work,
    next: this.next,
    hashByHeight: this.hashByHeight,
    height: this.height,
    prev: this.prev
  };
};

Blockchain.prototype.toJSON = function() {
  return JSON.stringify(this.toObject());
};

Blockchain.prototype.getBlockLocator = function() {
  $.checkState(this.tip);
  $.checkState(!_.isUndefined(this.height[this.tip]));

  var result = [];
  var currentHeight = this.getCurrentHeight();
  var exponentialBackOff = 1;
  for (var i = 0; i < 10; i++) {
    if (currentHeight >= 0) {
      result.push(this.hashByHeight[currentHeight--]);
    }
  }
  while (currentHeight > 0) {
    result.push(this.hashByHeight[currentHeight]);
    currentHeight -= exponentialBackOff;
    exponentialBackOff *= 2;
  }
  return result;
};

Blockchain.prototype.getCurrentHeight = function() {
  return this.height[this.tip];
};

Blockchain.prototype.getBlock = function(hash) {
  return this.blockStore.get(hash);
};

Blockchain.prototype.getTransaction = function(hash) {
  return this.txStore.get(hash);
};

Blockchain.prototype.getTipBlock = function() {
  return this.blockStore.get(this.tip);
};

module.exports = Blockchain;
