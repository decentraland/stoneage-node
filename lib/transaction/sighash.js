'use strict';

var BufferReader = require('../encoding/bufferreader');
var Hash = require('../crypto/hash');
var ECDSA = require('../crypto/ecdsa');
var $ = require('../util/preconditions');
var _ = require('lodash');

/**
 * Returns a buffer of length 32 bytes with the hash that needs to be signed
 * for OP_CHECKSIG.
 *
 * @name Signing.sighash
 * @param {Transaction} transaction the transaction to sign
 */
var sighash = function sighash(tx) {
  var hash = Hash.sha256sha256(tx.toBuffer());
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
  $.checkArgument(!_.isUndefined(transaction));
  $.checkArgument(!_.isUndefined(signature));
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
