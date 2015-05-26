var Promise = require('bluebird');

function TransactionStore() {
  this.txs = {};
}

TransactionStore.prototype.get = function(hash) {
  return this.txs[hash];
};

TransactionStore.prototype.set = function(tx) {
  return this.txs[tx.hash] = tx;
};

module.exports = TransactionStore;
