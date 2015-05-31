'use strict';

var Transaction = require('../transaction');
var Block = require('./block');
var $ = require('../util/preconditions');
var EventEmitter = require('events').EventEmitter;
var util = require('util');



/**
 * block mining utility
 *
 * Events:
 *  - block: new valid block was found! :)
 */
var Miner = function(opts) {
  $.checkArgument(opts, 'opts is required');
  this.updateCoinbase(opts.coinbase);
  this.updatePrevious(opts.previous);

  // for testing
  this.time = opts.time;
  this.bits = opts.bits;
  this.nonce = opts.nonce;
  this._updateTemplate();

};
util.inherits(Miner, EventEmitter);

Miner.prototype._updateTemplate = function() {
  $.checkState(this.previous, 'previous must be set');
  $.checkState(this.coinbase, 'coinbase must be set');
  var header = {
    height: this.previous.header.height + 1,
    prevHash: this.previous.id,
    nonce: this.nonce || 0,
    time: this.time,
    bits: this.bits
  };
  this.template = Block.fromCoinbase(this.coinbase, header);
};

Miner.prototype.updateCoinbase = function(coinbase) {
  $.checkArgument(coinbase, 'coinbase is required');
  $.checkArgument(coinbase instanceof Transaction, 'coinbase needs to be a Transaction');
  $.checkArgument(coinbase.isCoinbase(), 'coinbase needs to be a coinbase Transaction');
  this.coinbase = coinbase;
  if (this.previous) {
    this._updateTemplate();
  }
};

Miner.prototype.updatePrevious = function(previous) {
  $.checkArgument(previous, 'previous block is required');
  $.checkArgument(previous instanceof Block, 'previous needs to be a Block');
  this.previous = previous;
  if (this.coinbase) {
    this._updateTemplate();
  }
};


Miner.prototype.run = function() {
  this.running = true;
  //console.log('running towards difficulty ', this.template.header.getTargetDifficulty());
  while (this.running) {
    this.work();
  }
};

Miner.prototype.stop = function() {
  this.running = false;
};

// do one unit of work
Miner.prototype.work = function() {
  this.template.header.increaseNonce();
  //console.log(this.template.header.nonce, this.template.header.id);
  if (this.template.header.validProofOfWork()) {
    this.emit('block', this.template);
    // we need to receive a new coinbase to continue
    this.stop();
    return this.template;
  }
};


// inform the miner of a new tip
// block: new blockchain tip
// coinbase (optional): new coinbase to try mining
Miner.prototype.newTip = function(block, coinbase) {
  this.updatePrevious(block);
  if (coinbase) {
    this.updateCoinbase(coinbase);
  }
};

// add a new transaction to the working block
Miner.prototype.addTransaction = function(tx) {
  $.checkArgument(tx instanceof Transaction, 'tx is a required Transaction');
  this.template.addTransaction(tx);
};

module.exports = Miner;
