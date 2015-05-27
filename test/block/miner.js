'use strict';

var chai = require('chai');
var should = chai.should();

var bitcore = require('../..');
var Block = bitcore.Block;
var Transaction = bitcore.Transaction;
var Miner = bitcore.Miner;
var PrivateKey = bitcore.PrivateKey;

describe.only('Miner', function() {

  var id = new PrivateKey('ecf4fd8e3c6b7cebeb028ceada16a24e266869e352e80971438bbb03db1c54e4');
  var opts = {};
  var coinbases = [];
  for (var i = 0; i < 100; i++) {
    coinbases.push(new Transaction()
      .at(0, i + 1)
      .to(id.publicKey)
      .colored(0xff0000ff)
    );
  }
  opts.coinbase = coinbases[0];
  opts.previous = Block.genesis;
  opts.time = 1432594281;
  var blockchain = [];
  blockchain.push(Block.genesis);


  it('initializes', function() {
    var miner = new Miner(opts);
    should.exist(miner);
  });

  it('mines ' + coinbases.length + ' blocks in a row without txs', function(cb) {
    var miner = new Miner(opts);
    var n = 0;
    miner.on('block', function(block) {
      n += 1;
      //console.log('block', block.header.height, block.id, block.header.nonce);
      block.header.validProofOfWork().should.equal(true);
      blockchain.push(block);
      block.header.height.should.equal(n);
      block.transactions.length.should.equal(1);
      if (n === coinbases.length) {
        cb();
        return;
      }

      miner.newTip(block, coinbases[n]);
      process.nextTick(miner.run.bind(miner));
    });
    miner.run();
  });

  it('mines first block without transactions', function(cb) {
    var miner = new Miner(opts);
    miner.on('block', function(block) {
      block.header.validProofOfWork().should.equal(true);
      cb();
    });
    miner.run();
  });

  it('mines second block without transactions', function(cb) {
    var opts1 = JSON.parse(JSON.stringify(opts));
    opts1.previous = blockchain[0];
    opts1.coinbase = coinbases[1];
    var miner = new Miner(opts1);
    miner.on('block', function(block) {
      block.header.validProofOfWork().should.equal(true);
      cb();
    });
    miner.run();
  });

  it('mines second block with a transaction', function(cb) {
    var opts1 = JSON.parse(JSON.stringify(opts));
    opts1.previous = blockchain[0];
    opts1.coinbase = coinbases[1];
    var miner = new Miner(opts1);
    miner.on('block', function(block) {
      block.header.validProofOfWork().should.equal(true);
      block.transactions.length.should.equal(2);
      cb();
    });
    var tx = new Transaction()
      .from(coinbases[1])
      .to(id.publicKey)
      .colored(0x00ff00ff)
      .sign(id);
    miner.addTransaction(tx);
    miner.run();
  });

  it('mines ' + coinbases.length + ' blocks in a row with txs spending prev coinbase', function(cb) {
    var opts2 = JSON.parse(JSON.stringify(opts));
    opts2.previous = blockchain[1];
    opts2.coinbase = coinbases[2];
    var miner = new Miner(opts2);
    var n = 1;
    miner.on('block', function(block) {
      n += 1;
      //console.log('block', block.header.height, block.id, block.header.nonce);
      block.header.validProofOfWork().should.equal(true);
      blockchain.push(block);
      block.header.height.should.equal(n);
      block.transactions.length.should.equal(2);
      if (n === coinbases.length) {
        cb();
        return;
      }

      miner.newTip(block, coinbases[n]);

      var tx = new Transaction()
        .from(coinbases[n])
        .to(id.publicKey)
        .colored(0x00ff00ff)
        .sign(id);
      miner.addTransaction(tx);
      process.nextTick(miner.run.bind(miner));
    });
    var tx = new Transaction()
      .from(coinbases[1])
      .to(id.publicKey)
      .colored(0x00ff00ff)
      .sign(id);
    miner.addTransaction(tx);
    miner.run();
  });

  it('mines first block without transactions and higher difficutly', function(cb) {
    var miner = new Miner(opts);
    opts.difficulty = 2;
    miner.on('block', function(block) {
      block.header.validProofOfWork().should.equal(true);
      cb();
    });
    miner.run();
  });


});
