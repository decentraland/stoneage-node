'use strict';

var bitcore = require('../..');
var BufferUtil = bitcore.util.buffer;
var BufferReader = bitcore.encoding.BufferReader;
var BufferWriter = bitcore.encoding.BufferWriter;

var BlockHeader = bitcore.BlockHeader;
var should = require('chai').should();

describe('BlockHeader', function() {

  var version = 23;
  var prevblockidbuf = '000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f';
  var merklerootbuf = '4a5e1e4baab89f3a32518a88c31bc87f618f76673e2cc77ab2127b7afdeda33b';
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
  var bhbuf = bh.toBuffer();
  var bhhex = bhbuf.toString('hex');

  it('should make a new blockheader', function() {
    BlockHeader(bhbuf).toBuffer().toString('hex').should.equal(bhhex);
  });

  it('should not make an empty block', function() {
    (function() {
      BlockHeader();
    }).should.throw('Unrecognized argument for BlockHeader');
  });

  describe('#constructor', function() {

    it('should set all the variables', function() {
      var bh2 = new BlockHeader({
        version: version,
        prevHash: prevblockidbuf,
        merkleRoot: merklerootbuf,
        time: time,
        bits: bits,
        nonce: nonce,
        height: height,
      });
      should.exist(bh2.version);
      bh2.version.should.equal(version);
      should.exist(bh2.height);
      bh2.height.should.equal(height);
      should.exist(bh2.prevHash);
      BufferUtil.reverse(bh2.prevHash).toString('hex').should.equal(prevblockidbuf.toString('hex'));
      should.exist(bh2.merkleRoot);
      BufferUtil.reverse(bh2.merkleRoot).toString('hex').should.equal(merklerootbuf.toString('hex'));
      should.exist(bh2.time);
      bh2.time.should.equal(time);
      should.exist(bh2.bits);
      bh2.bits.should.equal(bits);
      should.exist(bh2.nonce);
      bh2.nonce.should.equal(nonce);
    });

  });

  describe('#fromJSON', function() {

    it('should set all the variables', function() {
      var bh = BlockHeader.fromJSON(JSON.stringify({
        version: version,
        prevHash: prevblockidbuf.toString('hex'),
        merkleRoot: merklerootbuf.toString('hex'),
        time: time,
        bits: bits,
        nonce: nonce
      }));
      should.exist(bh.version);
      should.exist(bh.prevHash);
      should.exist(bh.merkleRoot);
      should.exist(bh.time);
      should.exist(bh.bits);
      should.exist(bh.nonce);
    });

  });

  describe('#toJSON', function() {

    it('should set all the variables', function() {
      var json = JSON.parse(bh.toJSON());
      should.exist(json.version);
      should.exist(json.prevHash);
      should.exist(json.merkleRoot);
      should.exist(json.time);
      should.exist(json.bits);
      should.exist(json.nonce);
    });

  });

  describe('#fromJSON', function() {

    it('should parse this known json string', function() {

      var jsonString = JSON.stringify({
        version: version,
        prevHash: prevblockidbuf,
        merkleRoot: merklerootbuf,
        time: time,
        bits: bits,
        nonce: nonce
      });

      var json = new BlockHeader(jsonString);
      should.exist(json.version);
      should.exist(json.prevHash);
      should.exist(json.merkleRoot);
      should.exist(json.time);
      should.exist(json.bits);
      should.exist(json.nonce);
    });

  });

  describe('#fromString/#toString', function() {

    it('should output/input a block hex string', function() {
      var b = BlockHeader.fromString(bhhex);
      b.toString().should.equal(bhhex);
    });

  });

  describe('#fromBuffer', function() {

    it('should parse this known buffer', function() {
      BlockHeader.fromBuffer(bhbuf).toBuffer().toString('hex').should.equal(bhhex);
    });

  });

  describe('#fromBufferReader', function() {

    it('should parse this known buffer', function() {
      BlockHeader.fromBufferReader(BufferReader(bhbuf)).toBuffer().toString('hex').should.equal(bhhex);
    });

  });

  describe('#toBuffer', function() {

    it('should output this known buffer', function() {
      BlockHeader.fromBuffer(bhbuf).toBuffer().toString('hex').should.equal(bhhex);
    });

  });

  describe('#toBufferWriter', function() {

    it('should output this known buffer', function() {
      BlockHeader.fromBuffer(bhbuf).toBufferWriter().concat().toString('hex').should.equal(bhhex);
    });

    it('doesn\'t create a bufferWriter if one provided', function() {
      var writer = new BufferWriter();
      var blockHeader = BlockHeader.fromBuffer(bhbuf);
      blockHeader.toBufferWriter(writer).should.equal(writer);
    });

  });

  describe('#validTimestamp', function() {

    var x = BlockHeader(bh);

    it('should validate timpstamp as true', function() {
      var valid = x.validTimestamp(x);
      valid.should.equal(true);
    });


    it('should validate timestamp as false', function() {
      x.time = Math.round(new Date().getTime() / 1000) + BlockHeader.Constants.MAX_TIME_OFFSET + 100;
      var valid = x.validTimestamp(x);
      valid.should.equal(false);
    });

  });

  describe('#validProofOfWork', function() {

    it('should validate proof-of-work as true', function() {
      var x = BlockHeader(bh);
      var valid = x.validProofOfWork(x);
      valid.should.equal(true);
    });

    it('should validate proof of work as false because incorrect proof of work', function() {
      var x = new BlockHeader(bh);
      x.nonce -= 1;
      var valid = x.validProofOfWork(x);
      valid.should.equal(false);
    });

  });

  it('coverage: caches the "_id" property', function() {
    var blockHeader = new BlockHeader(bh);
    blockHeader.id.should.equal(blockHeader.id);
  });

  it('create', function() {
    var data = {
      prevHash: bh.id,
      height: 2000,
      time: 123455678,
      merkleRoot: '0000000000000000000000000000000000000000000000000000000000000000'
    };
    var header = BlockHeader.create(data);
    header.validProofOfWork().should.equal(true);
    header.version.should.equal(BlockHeader.Constants.CURRENT_VERSION);
    header.height.should.equal(2000);
    header.time.should.equal(123455678);
    header.merkleRoot.toString('hex')
      .should.equal('0000000000000000000000000000000000000000000000000000000000000000');
    header.bits.should.equal(545259519);
    header.nonce.should.equal(0);
  });

});
