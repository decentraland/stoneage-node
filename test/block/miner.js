'use strict';

var chai = require('chai');
var should = chai.should();

var bitcore = require('../..');
var Block = bitcore.Block;
var BlockHeader = bitcore.BlockHeader;
var Transaction = bitcore.Transaction;
var Miner = bitcore.Miner;
var PrivateKey = bitcore.PrivateKey;
describe.only('Miner', function() {

  var id = new PrivateKey('ecf4fd8e3c6b7cebeb028ceada16a24e266869e352e80971438bbb03db1c54e4');
  var opts = {};
  var coinbases = [];
  for (var i = 0; i < 10; i++) {
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

  it('mines first block without transactions', function(cb) {
    var miner = new Miner(opts);
    miner.on('block', function(block) {
      block.header.validProofOfWork().should.equal(true);
      blockchain.push(block);
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

  it.skip('mines first block with a transaction', function(cb) {
    var miner = new Miner(opts);
    miner.on('block', function(block) {
      block.header.validProofOfWork().should.equal(true);
      cb();
    });
    miner.addTransaction();
    miner.run();
  });

});
