'use strict';

var blockchain = module.exports;

// module information
blockchain.version = 'v' + require('./package.json').version;

// crypto
blockchain.crypto = {};
blockchain.crypto.BN = require('./lib/crypto/bn');
blockchain.crypto.ECDSA = require('./lib/crypto/ecdsa');
blockchain.crypto.Hash = require('./lib/crypto/hash');
blockchain.crypto.Random = require('./lib/crypto/random');
blockchain.crypto.Point = require('./lib/crypto/point');
blockchain.crypto.Signature = require('./lib/crypto/signature');

// encoding
blockchain.encoding = {};
blockchain.encoding.Base58 = require('./lib/encoding/base58');
blockchain.encoding.Base58Check = require('./lib/encoding/base58check');
blockchain.encoding.BufferReader = require('./lib/encoding/bufferreader');
blockchain.encoding.BufferWriter = require('./lib/encoding/bufferwriter');
blockchain.encoding.Varint = require('./lib/encoding/varint');

// utilities
blockchain.util = {};
blockchain.util.buffer = require('./lib/util/buffer');
blockchain.util.js = require('./lib/util/js');
blockchain.util.preconditions = require('./lib/util/preconditions');

// errors thrown by the library
blockchain.errors = require('./lib/errors');

// main bitcoin library
blockchain.Block = require('./lib/block');
blockchain.BlockHeader = require('./lib/block/blockheader');
blockchain.HDPrivateKey = require('./lib/hdprivatekey.js');
blockchain.HDPublicKey = require('./lib/hdpublickey.js');
blockchain.Networks = require('./lib/networks');
blockchain.PrivateKey = require('./lib/privatekey');
blockchain.PublicKey = require('./lib/publickey');
blockchain.Transaction = require('./lib/transaction');

// dependencies, subject to change
blockchain.deps = {};
blockchain.deps.bnjs = require('bn.js');
blockchain.deps.bs58 = require('bs58');
blockchain.deps.Buffer = Buffer;
blockchain.deps.elliptic = require('elliptic');
blockchain.deps._ = require('lodash');

// Internal usage, exposed for testing/advanced tweaking
blockchain.Transaction.sighash = require('./lib/transaction/sighash');
