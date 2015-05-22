'use strict';

/* jshint unused: false */
/* jshint latedef: false */
var should = require('chai').should();
var expect = require('chai').expect;
var _ = require('lodash');
var sinon = require('sinon');

var bitcore = require('../..');
var BN = bitcore.crypto.BN;
var Transaction = bitcore.Transaction;
var PrivateKey = bitcore.PrivateKey;
var Script = bitcore.Script;
var Address = bitcore.Address;
var Networks = bitcore.Networks;
var errors = bitcore.errors;

describe('Transaction', function() {

  it('can instantiate from constructor', function() {
    var tx = new Transaction();
    should.exist(tx);
  });

  var testPrevTxID = 'a477af6b2667c29670467e4e0728b685ee07b240235771862318e29ddbe58458';
  var testOwner = '02dfe18e62ab4d1b5cef8a1e90cc010acfa15f08840efe3aca5dd8256a3a01f725';
  var testTransaction = new Transaction()
    .from(testPrevTxID)
    .to(testOwner)
    .colored(0xaabbccff)
    .at(2, 3);

  it('can instantiate from constructor and builders', function() {
    var tx = new Transaction()
      .from(testPrevTxID)
      .to(testOwner)
      .colored(0xff0000ff)
      .at(20, -10);
    tx.version.should.equal(Transaction.CURRENT_VERSION);
    tx.input.toString('hex').should.equal(testPrevTxID);
    tx.owner.toString().should.equal(testOwner);
    tx.color.should.equal(0xff0000ff);
    tx.position.x.should.equal(20);
    tx.position.y.should.equal(-10);
  });

  it('should serialize and deserialize correctly a built transaction', function() {
    var tx = new Transaction()
      .from(testPrevTxID)
      .to(testOwner)
      .colored(0xaabbccff)
      .at(2, 3);
    var hex = tx.uncheckedSerialize();
    hex.toString('hex').should.equal(
      '01' + // version
      testPrevTxID + // previous
      '02000000' +
      '03000000' +
      'ffccbbaa' +
      testOwner +
      ''
    );
    (new Transaction(hex)).uncheckedSerialize().toString('hex').should.equal(hex);
  });

  describe('sign', function() {
    it('cant be signed without previous tx info', function() {
      var prevOwner = new PrivateKey('690821300cad086e19dce9b7a6eb5278e8fcb33d658fb6663f191d12412239aa');

      var fails = function() {
        return new Transaction()
          .from(testPrevTxID)
          .to(testOwner)
          .colored(0xaabbccff)
          .at(2, 3)
          .sign(prevOwner);
      };
      fails.should.throw('No previous transaction information');

    });

    it('first two transactions for a coordinate', function() {
      var x = 4;
      var y = 5;
      var firstOwner = new PrivateKey('690821300cad086e19dce9b7a6eb5278e8fcb33d658fb6663f191d12412239aa');
      var secondOwner = new PrivateKey('b78ccb0e9dc8b623db160a1241e3a42461801938f0983a4461219834848dc80a');

      var coinbase = new Transaction()
        .at(x, y)
        .to(firstOwner.toPublicKey());
      var tx = new Transaction()
        .from(coinbase)
        .to(secondOwner.toPublicKey())
        .sign(firstOwner);

      tx.isFullySigned().should.equal(true);
      var sig = tx.getSignature();
      tx.isValidSignature(sig, firstOwner.publicKey);
    });
  });


  describe('isAdjacent', function() {
    it('recognizes all adjacent coordinates', function() {
      var x = -1;
      var y = 7;
      var tx = new Transaction()
        .at(x, y);
      var up = {
        x: x,
        y: y + 1
      };
      var down = {
        x: x,
        y: y - 1
      };
      var right = {
        x: x + 1,
        y: y
      };
      var left = {
        x: x - 1,
        y: y
      };
      tx.isAdjacent([up]).should.deep.equal(up);
      tx.isAdjacent([down]).should.deep.equal(down);
      tx.isAdjacent([left]).should.deep.equal(left);
      tx.isAdjacent([right]).should.deep.equal(right);
      tx.isAdjacent([up, down, left, right]).should.deep.equal(up);
    });
    it('recognizes non adjacent coordinates', function() {
      var x = 4;
      var y = -2;
      var tx = new Transaction()
        .at(x, y);
      tx.isAdjacent([{
        x: 5,
        y: -1
      }]).should.deep.equal(false);
      tx.isAdjacent([{
        x: 4,
        y: 0
      }]).should.deep.equal(false);
      tx.isAdjacent([{
        x: 6,
        y: -2
      }]).should.deep.equal(false);
    });
  });

  it('should serialize and deserialize correctly a coinbase transaction', function() {
    var hex = '010000000000000000000000000000000000000000000000000000000000000000040000000500000000000000028bf7ee49d293d9517e8e98c05d2eb4f2649abb1d97d089c1717b986312781163';
    var transaction = new Transaction(hex);
    transaction.uncheckedSerialize().should.equal(hex);
  });
  it('should serialize and deserialize correctly a regular transaction', function() {
    var hex = '0138f7c7c01db041b613f492bb577030960bf520c3fdcb1204c07eaf90c7df98b304000000050000000000000002230a6509ec6649bc2b31fd197bac7e5f8eb12393e2676ec28ed3046cf43e72ab';
    var transaction = new Transaction(hex);
    transaction.uncheckedSerialize().should.equal(hex);
  });

  it('fails if an invalid parameter is passed to constructor', function() {
    expect(function() {
      return new Transaction(1);
    }).to.throw(errors.InvalidArgument);
  });


  it('serialize to Object roundtrip', function() {
    new Transaction(testTransaction.toObject()).uncheckedSerialize()
      .should.equal(testTransaction.uncheckedSerialize());
  });

  it('constructor returns a shallow copy of another transaction', function() {
    var transaction = new Transaction(testTransaction);
    var copy = new Transaction(transaction);
    copy.uncheckedSerialize().should.equal(transaction.uncheckedSerialize());
  });

  it('should display correctly in console', function() {
    var transaction = new Transaction(testTransaction);
    transaction.inspect().should.equal('<Transaction: ' + testTransaction.uncheckedSerialize() + '>');
  });

  describe('to and from JSON', function() {
    it('takes a string that is a valid JSON and deserializes from it', function() {
      var simple = new Transaction(testTransaction);
      expect(new Transaction(simple.toJSON()).uncheckedSerialize()).to.equal(simple.uncheckedSerialize());
    });
  });

});
