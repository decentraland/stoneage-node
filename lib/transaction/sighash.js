'use strict';

var BufferReader = require('../encoding/bufferreader');
var Hash = require('../crypto/hash');
var ECDSA = require('../crypto/ecdsa');
var PublicKey = require('../publickey');
var $ = require('../util/preconditions');

/**
 * Returns a buffer of length 32 bytes with the hash that needs to be signed
 * for OP_CHECKSIG.
 *
 * @name Signing.sighash
 * @param {Transaction} transaction the transaction to sign
 */
var sighash = function sighash(tx) {
  var Transaction = require('./transaction');
  var tx2 = new Transaction(tx.toString());
  tx2.signature = null;
  var hash = Hash.sha256sha256(tx2.toBuffer());
  return new BufferReader(hash).readReverse();
};

/**
 * Create a signature
 *
 * @name Signing.sign
 * @param {Transaction} transaction
 * @param {PrivateKey} privateKey
 * @param {number} sighash
 * @return {Signature}
 */
function sign(transaction, privateKey) {
  var hashbuf = sighash(transaction);
  var sig = ECDSA.sign(hashbuf, privateKey, 'little');
  return sig;
}

/**
 * Verify a signature
 *
 * @name Signing.verify
 * @param {Transaction} transaction
 * @param {Signature} signature
 * @param {PublicKey} publicKey
 * @return {boolean}
 */
function verify(transaction, signature, publicKey) {
  var Transaction = require('./transaction');
  var Signature = require('../crypto/signature');
  $.checkArgument(transaction instanceof Transaction, 'transaction must be a Transaction');
  $.checkArgument(signature instanceof Signature, 'signature must be a Signature');
  $.checkArgument(publicKey instanceof PublicKey, 'publicKey must be a PublicKey');
  var hashbuf = sighash(transaction);
  return ECDSA.verify(hashbuf, signature, publicKey, 'little');
}

/**
 * @namespace Signing
 */
module.exports = {
  sighash: sighash,
  sign: sign,
  verify: verify
};
