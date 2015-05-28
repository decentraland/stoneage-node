'use strict';

var chai = require('chai');
var should = chai.should();

var bitcore = require('../');
var Block = bitcore.Block;
var Transaction = bitcore.Transaction;
var PrivateKey = bitcore.PrivateKey;
var Blockchain = bitcore.Blockchain;
var Miner = bitcore.Miner;

describe.only('Blockchain', function() {

  it('Creates a blockchain with the genesis block', function() {
    var blockchain = new Blockchain();
    blockchain.proposeNewBlock(Block.genesis);
    blockchain.tip.should.equal(Block.genesis.hash);
  });

  var privKey = new PrivateKey('ecf4fd8e3c6b7cebeb028ceada16a24e266869e352e80971438bbb03db1c54e4');
  var mineBlock = function(blockchain, transactions, callback) {
    var opts = {};
    opts.coinbase = new Transaction()
      .at(0, blockchain.getTipBlock().height + 1)
      .to(privKey.publicKey)
      .colored(0xff0000ff);
    opts.previous = blockchain.getTipBlock();
    opts.time = 1432594281;
    var miner = new Miner(opts);
    transactions.map(function(tx) {
      miner.addTransaction(tx);
    });
    miner.on('block', callback);
    miner.run();
  };

  it('Makes a simple reorg: Append to tip', function(cb) {
    var blockchain = new Blockchain();
    blockchain.proposeNewBlock(Block.genesis);

    mineBlock(blockchain, [], function(block) {
      blockchain.proposeNewBlock(block);
      blockchain.tip.should.equal(block.hash);
      cb();
    });

  });

  describe('transaction validation', function() {

    it('validates a transaction that spends a previous coinbase', function(cb) {
      var blockchain = new Blockchain();
      blockchain.proposeNewBlock(Block.genesis);

      var block1, block2;
      mineBlock(blockchain, [], function(block) {
        block1 = block;
        blockchain.proposeNewBlock(block);

        var tx = new Transaction()
          .from(block1.transactions[0])
          .to(privKey.publicKey)
          .colored(0x00fff0ff)
          .sign(privKey);

        mineBlock(blockchain, [tx], function(block) {
          block2 = block;
          blockchain.proposeNewBlock(block);
          blockchain.tip.should.equal(block2.hash);

          cb();
        });
      })

    });

    it('doesnt allow a transaction with invalid signature', function(cb) {
      var blockchain = new Blockchain();
      blockchain.proposeNewBlock(Block.genesis);

      var block1, block2;
      mineBlock(blockchain, [], function(block) {
        block1 = block;
        blockchain.proposeNewBlock(block);

        var tx = new Transaction()
          .from(block1.transactions[0])
          .to(privKey.publicKey)
          .colored(0x00fff0ff)
          .sign(privKey);

        // Corrupt signature
        tx.signature.r.words[1]++;

        mineBlock(blockchain, [tx], function(block) {
          block2 = block;
          (function() {
            blockchain.proposeNewBlock(block);
          }).should.throw('Invalid Argument');

          cb();
        });
      })

    });
  });
});
