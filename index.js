'use strict';

var core = module.exports;

// module information
core.version = 'v' + require('./package.json').version;

// crypto
core.crypto = {};
core.crypto.BN = require('./lib/crypto/bn');
core.crypto.ECDSA = require('./lib/crypto/ecdsa');
core.crypto.Hash = require('./lib/crypto/hash');
core.crypto.Random = require('./lib/crypto/random');
core.crypto.Point = require('./lib/crypto/point');
core.crypto.Signature = require('./lib/crypto/signature');

// encoding
core.encoding = {};
core.encoding.Base58 = require('./lib/encoding/base58');
core.encoding.Base58Check = require('./lib/encoding/base58check');
core.encoding.BufferReader = require('./lib/encoding/bufferreader');
core.encoding.BufferWriter = require('./lib/encoding/bufferwriter');
core.encoding.Varint = require('./lib/encoding/varint');

// utilities
core.util = {};
core.util.buffer = require('./lib/util/buffer');
core.util.js = require('./lib/util/js');
core.util.preconditions = require('./lib/util/preconditions');

// errors thrown by the library
core.errors = require('./lib/errors');

// main bitcoin library
core.Block = require('./lib/block');
core.Blockchain = require('./lib/blockchain');
core.BlockHeader = require('./lib/block/blockheader');
core.Miner = require('./lib/block/miner');
core.HDPrivateKey = require('./lib/hdprivatekey.js');
core.HDPublicKey = require('./lib/hdpublickey.js');
core.Networks = require('./lib/networks');
core.PrivateKey = require('./lib/privatekey');
core.PublicKey = require('./lib/publickey');
core.Transaction = require('./lib/transaction');

// dependencies, subject to change
core.deps = {};
core.deps.bnjs = require('bn.js');
core.deps.bs58 = require('bs58');
core.deps.Buffer = Buffer;
core.deps.elliptic = require('elliptic');
core.deps._ = require('lodash');

// Internal usage, exposed for testing/advanced tweaking
core.Transaction.sighash = require('./lib/transaction/sighash');
