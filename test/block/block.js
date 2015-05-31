'use strict';

var chai = require('chai');

var bitcore = require('../..');
var Block = bitcore.Block;
var BlockHeader = bitcore.BlockHeader;
var should = chai.should();
var Transaction = bitcore.Transaction;

describe('Block', function() {

  var version = 23;
  var prevblockidbuf = '000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f';
  var merklerootbuf = '0000000000000000000000000000000000000000000000000000000000000000';
  var time = 123456;
  var bits = 0x207fffff; // genesis bitcoin: 486604799
  var nonce = 1926;
  var height = 300200;
  var bh = new BlockHeader({
    version: version,
    height: height,
    prevHash: prevblockidbuf,
    merkleRoot: merklerootbuf,
    time: time,
    bits: bits,
    nonce: nonce
  });
  var txs = [];
  var testBlock = new Block({
    header: bh,
    transactions: txs
  });

  it('should not make an empty block', function() {
    (function() {
      return new Block();
    }).should.throw('Unrecognized argument for Block');
  });

  describe('#constructor', function() {

    it('should set these known values', function() {
      var b = new Block(testBlock);
      should.exist(b.header);
      should.exist(b.transactions);
    });

  });


  describe('#toBuffer', function() {

    it('should recover a block from this known buffer', function() {
      var block = new Block(testBlock);
      block.toBuffer().toString('hex')
        .should.equal('17000000a894040040e20100ffff7f206fe28c0ab6f1b372c1a6a246ae63f74f931e8365e15a089c68d619000000000000000000000000000000000000000000000000000000000000000000000000008607000000');
    });

  });
  describe('#toObject', function() {

    it('roundtrips correctly', function() {
      var block = new Block(testBlock);
      var obj = block.toObject();
      var block2 = Block.fromObject(obj);
      block2.toObject().should.deep.equal(block.toObject());
    });

  });

  describe('#hash', function() {

    it('should return the correct hash of the genesis block', function() {
      var genesis = Block.genesis;
      var genesisTx = genesis.transactions[0];

      genesisTx.id.should.equal('810ea4614b44d9c9e006393c9a1c42afaa1cd83055b04894d1367fc3b1cc29cd');

      genesis.validMerkleRoot().should.equal(true);
      genesis.header.validProofOfWork().should.equal(true);
      genesis.id.should.equal('000006411a7d6bace415af53374feee3adae7ff05f8f899b5829a17c8ef782d9');
    });
  });

  describe('#inspect', function() {

    it('should return the correct inspect of the genesis block', function() {
      var block = new Block(testBlock);
      console.log(block.hash);
      block.inspect().should.equal('<Block ' + testBlock.id + '>');
    });

  });

  describe('#merkleRoot', function() {

    it('should describe as valid merkle root', function() {
      var x = new Block(testBlock);
      var valid = x.validMerkleRoot();
      valid.should.equal(true);
    });

    it('should describe as invalid merkle root', function() {
      var x = new Block(testBlock);
      x.transactions.push(new Transaction());
      var valid = x.validMerkleRoot();
      valid.should.equal(false);
    });

    it('should get a null hash merkle root', function() {
      var x = new Block(testBlock);
      x.transactions = []; // empty the txs
      var mr = x.getMerkleRoot();
      mr.should.deep.equal(Block.Values.NULL_HASH);
    });

  });

});
