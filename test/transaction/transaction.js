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

  var testPrevTx = 'a477af6b2667c29670467e4e0728b685ee07b240235771862318e29ddbe58458';
  var testOwner = '02dfe18e62ab4d1b5cef8a1e90cc010acfa15f08840efe3aca5dd8256a3a01f725';

  it('can instantiate from constructor and builders', function() {
    var tx = new Transaction()
      .from(testPrevTx)
      .to(testOwner)
      .colored(0xff0000ff)
      .at(20, -10);
    tx.version.should.equal(Transaction.CURRENT_VERSION);
    tx.previous.toString('hex').should.equal(testPrevTx);
    tx.owner.toString().should.equal(testOwner);
    tx.color.should.equal(0xff0000ff);
    tx.position.x.should.equal(20);
    tx.position.y.should.equal(-10);
  });

  it('should serialize and deserialize correctly a built transaction', function() {
    var tx = new Transaction()
      .from(testPrevTx)
      .to(testOwner)
      .colored(0xaabbccff)
      .at(2, 3);
    tx.uncheckedSerialize()
    .toString('hex').should.equal(
      '01' + // version
      testPrevTx + // previous
      '02000000' +
      '03000000' +
      'ffccbbaa' + 
      testOwner + 
      ''
    );
  });

  it('can be signed with a private key', function() {
    var prevOwner = new PrivateKey('690821300cad086e19dce9b7a6eb5278e8fcb33d658fb6663f191d12412239aa');
    var prevPublic = prevOwner.publicKey;

    var tx = new Transaction()
      .from(testPrevTx)
      .to(testOwner)
      .colored(0xaabbccff)
      .at(2, 3)
      .sign(prevOwner);

    tx.isFullySigned().should.equal(true);
    var sig = tx.getSignature();
    tx.isValidSignature(sig, prevOwner);
  });



  it('should serialize and deserialize correctly a given transaction', function() {
    var hex = '01';
    var transaction = new Transaction(hex);
    transaction.uncheckedSerialize().should.equal(hex);
  });

  it('fails if an invalid parameter is passed to constructor', function() {
    expect(function() {
      return new Transaction(1);
    }).to.throw(errors.InvalidArgument);
  });


  it('can serialize to a plain javascript object', function() {
    var object = testTransaction.toObject();
    object.inputs[0].output.satoshis.should.equal(testAmount);
    object.inputs[0].output.script.should.equal(testScriptHex);
    object.inputs[0].prevTxId.should.equal(testPrevTx);
    object.inputs[0].outputIndex.should.equal(0);
    object.outputs[0].satoshis.should.equal(testAmount - 10000);
  });

  it('will not accept NaN as an amount', function() {
    (function() {
      var stringTx = new Transaction().to('mrU9pEmAx26HcbKVrABvgL7AwA5fjNFoDc', NaN);
    }).should.throw('Amount is expected to be a positive integer');
  });

  it('returns the fee correctly', function() {
    testTransaction.getFee().should.equal(10000);
  });

  it('serialize to Object roundtrip', function() {
    new Transaction(testTransaction.toObject()).uncheckedSerialize()
      .should.equal(testTransaction.uncheckedSerialize());
  });

  it('constructor returns a shallow copy of another transaction', function() {
    var transaction = new Transaction(tx_1_hex);
    var copy = new Transaction(transaction);
    copy.uncheckedSerialize().should.equal(transaction.uncheckedSerialize());
  });

  it('should display correctly in console', function() {
    var transaction = new Transaction(tx_1_hex);
    transaction.inspect().should.equal('<Transaction: ' + tx_1_hex + '>');
  });

  it('standard hash of transaction should be decoded correctly', function() {
    var transaction = new Transaction(tx_1_hex);
    transaction.id.should.equal(tx_1_id);
  });

  it('serializes an empty transaction', function() {
    var transaction = new Transaction();
    transaction.uncheckedSerialize().should.equal(tx_empty_hex);
  });

  it('serializes and deserializes correctly', function() {
    var transaction = new Transaction(tx_1_hex);
    transaction.uncheckedSerialize().should.equal(tx_1_hex);
  });

  describe('serialization', function() {
    it('stores the change address correctly', function() {
      var serialized = new Transaction()
        .toObject();
      var deserialized = new Transaction(serialized);
      expect(deserialized.getChangeOutput()).to.equal(null);
    });
    it('can avoid checked serialize', function() {
      var transaction = new Transaction();
      expect(function() {
        return transaction.serialize();
      }).to.throw();
      expect(function() {
        return transaction.serialize(true);
      }).to.not.throw();
    });
    it('stores the fee set by the user', function() {
      var fee = 1000000;
      var serialized = new Transaction()
        .fee(fee)
        .toObject();
      var deserialized = new Transaction(serialized);
      expect(deserialized._fee).to.equal(fee);
    });
  });

  describe('checked serialize', function() {
    it('fails if no change address was set', function() {
      var transaction = new Transaction()
        .from(simpleUtxoWith1BTC)
        .to(toAddress, 1);
      expect(function() {
        return transaction.serialize();
      }).to.throw(errors.Transaction.ChangeAddressMissing);
    });
    it('fails if a high fee was set', function() {
      var transaction = new Transaction()
        .from(simpleUtxoWith1BTC)
        .change(changeAddress)
        .fee(50000000)
        .to(toAddress, 40000000);
      expect(function() {
        return transaction.serialize();
      }).to.throw(errors.Transaction.FeeError.TooLarge);
    });
    it('fails if a dust output is created', function() {
      var transaction = new Transaction()
        .from(simpleUtxoWith1BTC)
        .to(toAddress, 545)
        .change(changeAddress)
        .sign(privateKey);
      expect(function() {
        return transaction.serialize();
      }).to.throw(errors.Transaction.DustOutputs);
    });
    it('doesn\'t fail if a dust output is not dust', function() {
      var transaction = new Transaction()
        .from(simpleUtxoWith1BTC)
        .to(toAddress, 546)
        .change(changeAddress)
        .sign(privateKey);
      expect(function() {
        return transaction.serialize();
      }).to.not.throw(errors.Transaction.DustOutputs);
    });
    it('doesn\'t fail if a dust output is an op_return', function() {
      var transaction = new Transaction()
        .from(simpleUtxoWith1BTC)
        .addData('not dust!')
        .change(changeAddress)
        .sign(privateKey);
      expect(function() {
        return transaction.serialize();
      }).to.not.throw(errors.Transaction.DustOutputs);
    });
    it('fails when outputs and fee don\'t add to total input', function() {
      var transaction = new Transaction()
        .from(simpleUtxoWith1BTC)
        .to(toAddress, 99900000)
        .fee(99999)
        .sign(privateKey);
      expect(function() {
        return transaction.serialize();
      }).to.throw(errors.Transaction.FeeError.Different);
    });
    describe('skipping checks', function() {
      var buildSkipTest = function(builder, check) {
        return function() {
          var transaction = new Transaction();
          transaction.from(simpleUtxoWith1BTC);
          builder(transaction);

          var options = {};
          options[check] = true;

          expect(function() {
            return transaction.serialize(options);
          }).not.to.throw();
          expect(function() {
            return transaction.serialize();
          }).to.throw();
        };
      };
      it('can skip the check for too much fee', buildSkipTest(
        function(transaction) {
          return transaction
            .fee(50000000)
            .change(changeAddress)
            .sign(privateKey);
        }, 'disableLargeFees'));
      it('can skip the check for a fee that is too small', buildSkipTest(
        function(transaction) {
          return transaction
            .fee(1)
            .change(changeAddress)
            .sign(privateKey);
        }, 'disableSmallFees'));
      it('can skip the check that prevents dust outputs', buildSkipTest(
        function(transaction) {
          return transaction
            .to(toAddress, 100)
            .change(changeAddress)
            .sign(privateKey);
        }, 'disableDustOutputs'));
      it('can skip the check that prevents unsigned outputs', function() {
        var transaction = new Transaction();
        transaction.from(simpleUtxoWith1BTC);
        transaction.to(toAddress, 10000);
        transaction.change(changeAddress);
        var options = {};
        options.disableIsFullySigned = true;
        expect(function() {
          return transaction.serialize(options);
        }).not.to.throw(errors.Transaction.MissingSignatures);
        expect(function() {
          return transaction.serialize();
        }).to.throw(errors.Transaction.MissingSignatures);
      });
      it('can skip the check that avoids spending more bitcoins than the inputs for a transaction', function() {
        var transaction = new Transaction();
        transaction.from(simpleUtxoWith1BTC);
        transaction.to(toAddress, 10000000000000);
        transaction.change(changeAddress);
        expect(function() {
          return transaction.serialize({
            disableSmallFees: true,
            disableIsFullySigned: true,
            disableMoreOutputThanInput: true
          });
        }).not.to.throw(errors.Transaction.InvalidOutputAmountSum);
        expect(function() {
          return transaction.serialize({
            disableIsFullySigned: true,
            disableSmallFees: true
          });
        }).to.throw(errors.Transaction.InvalidOutputAmountSum);
      });
    });
  });

  describe('#verify', function() {

    it('not if _satoshis and _satoshisBN have different values', function() {
      var tx = new Transaction()
        .from({
          'txId': testPrevTx,
          'outputIndex': 0,
          'script': testScript,
          'satoshis': testAmount
        }).to('mrU9pEmAx26HcbKVrABvgL7AwA5fjNFoDc', testAmount - 10000);

      tx.outputs[0]._satoshis = 100;
      tx.outputs[0]._satoshisBN = new BN('fffffffffffffff', 16);
      var verify = tx.verify();
      verify.should.equal('transaction txout 0 satoshis is invalid');
    });

    it('not if _satoshis is negative', function() {
      var tx = new Transaction()
        .from({
          'txId': testPrevTx,
          'outputIndex': 0,
          'script': testScript,
          'satoshis': testAmount
        }).to('mrU9pEmAx26HcbKVrABvgL7AwA5fjNFoDc', testAmount - 10000);

      tx.outputs[0]._satoshis = -100;
      tx.outputs[0]._satoshisBN = new BN(-100, 10);
      var verify = tx.verify();
      verify.should.equal('transaction txout 0 satoshis is invalid');
    });

    it('not if transaction is greater than max block size', function() {

      var tx = new Transaction()
        .from({
          'txId': testPrevTx,
          'outputIndex': 0,
          'script': testScript,
          'satoshis': testAmount
        }).to('mrU9pEmAx26HcbKVrABvgL7AwA5fjNFoDc', testAmount - 10000);

      tx.toBuffer = sinon.stub().returns({
        length: 10000000
      });

      var verify = tx.verify();
      verify.should.equal('transaction over the maximum block size');

    });

  });

  describe('to and from JSON', function() {
    it('takes a string that is a valid JSON and deserializes from it', function() {
      var simple = new Transaction();
      expect(new Transaction(simple.toJSON()).uncheckedSerialize()).to.equal(simple.uncheckedSerialize());
      var complex = new Transaction()
        .from(simpleUtxoWith100000Satoshis)
        .to(toAddress, 50000)
        .change(changeAddress)
        .sign(privateKey);
      var cj = complex.toJSON();
      var ctx = new Transaction(cj);
      expect(ctx.uncheckedSerialize()).to.equal(complex.uncheckedSerialize());

    });
    it('serializes the `change` information', function() {
      var transaction = new Transaction();
      transaction.change(changeAddress);
      expect(JSON.parse(transaction.toJSON()).changeScript).to.equal(Script.fromAddress(changeAddress).toString());
      expect(new Transaction(transaction.toJSON()).uncheckedSerialize()).to.equal(transaction.uncheckedSerialize());
    });
    it('serializes correctly p2sh multisig signed tx', function() {
      var t = new Transaction(tx2hex);
      expect(t.toString()).to.equal(tx2hex);
      var r = new Transaction(t);
      expect(r.toString()).to.equal(tx2hex);
      var j = new Transaction(t.toObject());
      expect(j.toString()).to.equal(tx2hex);
    });
  });

  describe('serialization of inputs', function() {
    it('can serialize and deserialize a P2PKH input', function() {
      var transaction = new Transaction()
        .from(simpleUtxoWith1BTC);
      var deserialized = new Transaction(transaction.toObject());
      expect(deserialized.inputs[0] instanceof Transaction.Input.PublicKeyHash).to.equal(true);
    });
    it('can serialize and deserialize a P2SH input', function() {
      var transaction = new Transaction()
        .from({
          txId: '0000', // Not relevant
          outputIndex: 0,
          script: Script.buildMultisigOut([public1, public2], 2).toScriptHashOut(),
          satoshis: 10000
        }, [public1, public2], 2);
      var deserialized = new Transaction(transaction.toObject());
      expect(deserialized.inputs[0] instanceof Transaction.Input.MultiSigScriptHash).to.equal(true);
    });
  });

  describe('checks on adding inputs', function() {
    var transaction = new Transaction();
    it('fails if no output script is provided', function() {
      expect(function() {
        transaction.addInput(new Transaction.Input());
      }).to.throw(errors.Transaction.NeedMoreInfo);
    });
    it('fails if no satoshi amount is provided', function() {
      var input = new Transaction.Input();
      expect(function() {
        transaction.addInput(input);
      }).to.throw(errors.Transaction.NeedMoreInfo);
      expect(function() {
        transaction.addInput(new Transaction.Input(), Script.empty());
      }).to.throw(errors.Transaction.NeedMoreInfo);
    });
    it('allows output and transaction to be feed as arguments', function() {
      expect(function() {
        transaction.addInput(new Transaction.Input(), Script.empty(), 0);
      }).to.not.throw();
    });
    it('does not allow a threshold number greater than the amount of public keys', function() {
      expect(function() {
        transaction = new Transaction();
        return transaction.from({
          txId: '0000000000000000000000000000000000000000000000000000000000000000',
          outputIndex: 0,
          script: Script(),
          satoshis: 10000
        }, [], 1);
      }).to.throw('Number of required signatures must be greater than the number of public keys');
    });
    it('will add an empty script if not supplied', function() {
      transaction = new Transaction();
      var outputScriptString = 'OP_2 21 0x038282263212c609d9ea2a6e3e172de238d8c39' +
        'cabd5ac1ca10646e23fd5f51508 21 0x038282263212c609d9ea2a6e3e172de23' +
        '8d8c39cabd5ac1ca10646e23fd5f51508 OP_2 OP_CHECKMULTISIG OP_EQUAL';
      transaction.addInput(new Transaction.Input({
        prevTxId: '0000000000000000000000000000000000000000000000000000000000000000',
        outputIndex: 0,
        script: new Script()
      }), outputScriptString, 10000);
      transaction.inputs[0].output.script.should.be.instanceof(bitcore.Script);
      transaction.inputs[0].output.script.toString().should.equal(outputScriptString);
    });
  });

  describe('removeInput and removeOutput', function() {
    it('can remove an input by index', function() {
      var transaction = new Transaction()
        .from(simpleUtxoWith1BTC);
      transaction.inputs.length.should.equal(1);
      transaction.inputAmount.should.equal(simpleUtxoWith1BTC.satoshis);
      transaction.removeInput(0);
      transaction.inputs.length.should.equal(0);
      transaction.inputAmount.should.equal(0);
    });
    it('can remove an input by transaction id', function() {
      var transaction = new Transaction()
        .from(simpleUtxoWith1BTC);
      transaction.inputs.length.should.equal(1);
      transaction.inputAmount.should.equal(simpleUtxoWith1BTC.satoshis);
      transaction.removeInput(simpleUtxoWith1BTC.txId, simpleUtxoWith1BTC.outputIndex);
      transaction.inputs.length.should.equal(0);
      transaction.inputAmount.should.equal(0);
    });
    it('fails if the index provided is invalid', function() {
      var transaction = new Transaction()
        .from(simpleUtxoWith1BTC);
      expect(function() {
        transaction.removeInput(2);
      }).to.throw(errors.Transaction.InvalidIndex);
    });
    it('an output can be removed by index', function() {
      var transaction = new Transaction()
        .to(toAddress, 40000000)
        .to(toAddress, 40000000);
      transaction.outputs.length.should.equal(2);
      transaction.outputAmount.should.equal(80000000);
      transaction.removeOutput(0);
      transaction.outputs.length.should.equal(1);
      transaction.outputAmount.should.equal(40000000);
    });
  });

  describe('handling the nLockTime', function() {
    var MILLIS_IN_SECOND = 1000;
    var timestamp = 1423504946;
    var blockHeight = 342734;
    var date = new Date(timestamp * MILLIS_IN_SECOND);
    it('handles a null locktime', function() {
      var transaction = new Transaction();
      expect(transaction.getLockTime()).to.equal(null);
    });
    it('handles a simple example', function() {
      var future = new Date(2025, 10, 30); // Sun Nov 30 2025
      var transaction = new Transaction()
        .lockUntilDate(future);
      transaction.nLockTime.should.equal(future.getTime() / 1000);
      transaction.getLockTime().should.deep.equal(future);
    });
    it('accepts a date instance', function() {
      var transaction = new Transaction()
        .lockUntilDate(date);
      transaction.nLockTime.should.equal(timestamp);
      transaction.getLockTime().should.deep.equal(date);
    });
    it('accepts a number instance with a timestamp', function() {
      var transaction = new Transaction()
        .lockUntilDate(timestamp);
      transaction.nLockTime.should.equal(timestamp);
      transaction.getLockTime().should.deep.equal(new Date(timestamp * 1000));
    });
    it('accepts a block height', function() {
      var transaction = new Transaction()
        .lockUntilBlockHeight(blockHeight);
      transaction.nLockTime.should.equal(blockHeight);
      transaction.getLockTime().should.deep.equal(blockHeight);
    });
    it('fails if the block height is too high', function() {
      expect(function() {
        return new Transaction().lockUntilBlockHeight(5e8);
      }).to.throw(errors.Transaction.BlockHeightTooHigh);
    });
    it('fails if the date is too early', function() {
      expect(function() {
        return new Transaction().lockUntilDate(1);
      }).to.throw(errors.Transaction.LockTimeTooEarly);
      expect(function() {
        return new Transaction().lockUntilDate(499999999);
      }).to.throw(errors.Transaction.LockTimeTooEarly);
    });
    it('fails if the block height is negative', function() {
      expect(function() {
        return new Transaction().lockUntilBlockHeight(-1);
      }).to.throw(errors.Transaction.NLockTimeOutOfRange);
    });
  });

  it('handles anyone-can-spend utxo', function() {
    var transaction = new Transaction()
      .from(anyoneCanSpendUTXO)
      .to(toAddress, 50000);
    should.exist(transaction);
  });

  it('handles unsupported utxo in tx object', function() {
    var transaction = new Transaction();
    transaction.fromJSON.bind(transaction, unsupportedTxObj)
      .should.throw('Unsupported input script type: OP_1 OP_ADD OP_2 OP_EQUAL');
  });

  describe('inputAmount + outputAmount', function() {
    it('returns correct values for simple transaction', function() {
      var transaction = new Transaction()
        .from(simpleUtxoWith1BTC)
        .to(toAddress, 40000000);
      transaction.inputAmount.should.equal(100000000);
      transaction.outputAmount.should.equal(40000000);
    });
    it('returns correct values for transaction with change', function() {
      var transaction = new Transaction()
        .from(simpleUtxoWith1BTC)
        .change(changeAddress)
        .to(toAddress, 1000);
      transaction.inputAmount.should.equal(100000000);
      transaction.outputAmount.should.equal(99990000);
    });
    it('returns correct values for coinjoin transaction', function() {
      // see livenet tx c16467eea05f1f30d50ed6dbc06a38539d9bb15110e4b7dc6653046a3678a718
      var transaction = new Transaction(txCoinJoinHex);
      transaction.outputAmount.should.equal(4191290961);
      expect(function() {
        var ia = transaction.inputAmount;
      }).to.throw('No previous output information');
    });
  });

  describe('output ordering', function() {

    var transaction, out1, out2, out3, out4;

    beforeEach(function() {
      transaction = new Transaction()
        .from(simpleUtxoWith1BTC)
        .to(toAddress, tenth)
        .to(toAddress, fourth)
        .to(toAddress, half)
        .change(changeAddress);
      out1 = transaction.outputs[0];
      out2 = transaction.outputs[1];
      out3 = transaction.outputs[2];
      out4 = transaction.outputs[3];
    });

    it('allows the user to sort outputs according to a criteria', function() {
      var sorting = function(array) {
        return [array[3], array[2], array[1], array[0]];
      };
      transaction.sortOutputs(sorting);
      transaction.outputs[0].should.equal(out4);
      transaction.outputs[1].should.equal(out3);
      transaction.outputs[2].should.equal(out2);
      transaction.outputs[3].should.equal(out1);
    });

    it('allows the user to randomize the output order', function() {
      var shuffle = sinon.stub(_, 'shuffle');
      shuffle.onFirstCall().returns([out2, out1, out4, out3]);

      transaction._changeIndex.should.equal(3);
      transaction.shuffleOutputs();
      transaction.outputs[0].should.equal(out2);
      transaction.outputs[1].should.equal(out1);
      transaction.outputs[2].should.equal(out4);
      transaction.outputs[3].should.equal(out3);
      transaction._changeIndex.should.equal(2);

      _.shuffle.restore();
    });

    it('fails if the provided function does not work as expected', function() {
      var sorting = function(array) {
        return [];
      };
      expect(function() {
        transaction.sortOutputs(sorting);
      }).to.throw(errors.Transaction.InvalidSorting);
    });



  });

  describe('clearOutputs', function() {

    it('removes all outputs and maintains the transaction in order', function() {
      var tx = new Transaction()
        .from(simpleUtxoWith1BTC)
        .to(toAddress, tenth)
        .to(toAddress, fourth)
        .to(toAddress, half)
        .change(changeAddress);
      tx.clearOutputs();
      tx.outputs.length.should.equal(1);
      tx.to(toAddress, tenth);
      tx.outputs.length.should.equal(2);
      tx.outputs[0].satoshis.should.equal(10000000);
      tx.outputs[0].script.toAddress().toString().should.equal(toAddress);
      tx.outputs[1].satoshis.should.equal(89990000);
      tx.outputs[1].script.toAddress().toString().should.equal(changeAddress);
    });

  });
});

