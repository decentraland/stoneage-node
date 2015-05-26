var Promise = require('bluebird');

function BlockStore() {
  this.block = {};
}

BlockStore.prototype.get = function(hash) {
  return this.block[hash];
};

BlockStore.prototype.set = function(block) {
  return this.block[block.hash] = block;
};

module.exports = BlockStore;
