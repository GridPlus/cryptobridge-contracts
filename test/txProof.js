// Taken from eth-proof (https://github.com/zmitton/eth-proof/blob/master/buildProof.js)
// which I can't get to work with web3 1.0
const Promise = require('bluebird').Promise;
const Trie = require('merkle-patricia-tree');
const rlp = require('rlp');
const EthereumTx = require('ethereumjs-tx');
const EthereumBlock = require('ethereumjs-block/from-rpc')
const async = require('async');

exports.build = build;

function build(tx, block) {
  return new Promise((resolve, reject) => {
    let txTrie = new Trie();
    async.map(block.transactions, (siblingTx, cb) => {
      let path = rlp.encode(siblingTx.transactionIndex);
      const rawSignedSiblingTx = new EthereumTx(squanchTx(siblingTx)).serialize();
      txTrie.put(path, rawSignedSiblingTx, (err) => {
        if (err) { cb(err, null); }
        cb(null, true);
      })
    }, (err, r) => {
      if (err) { return reject(err); }
      txTrie.findPath(rlp.encode(tx.transactionIndex), (err, rawTxNode, reminder, stack) => {
        const prf = {
          blockHash: Buffer.from(tx.blockHash.slice(2), 'hex'),
          header: getRawHeader(block),
          parentNodes: rawStack(stack),
          path: rlp.encode(tx.transactionIndex),
          value: rlp.decode(rawTxNode.value),
        }
        return resolve(prf)
      })
    })
  })

}

var getRawHeader = (_block) => {
  if(typeof _block.difficulty != 'string'){
    _block.difficulty = '0x' + _block.difficulty.toString(16)
  }
  var block = new EthereumBlock(_block)
  return block.header.raw
}

var squanchTx = (tx) => {
  tx.gasPrice = '0x' + tx.gasPrice.toString(16)
  tx.value = '0x' + tx.value.toString(16)
  return tx;
}

var rawStack = (input) => {
  output = []
  for (var i = 0; i < input.length; i++) {
    output.push(input[i].raw)
  }
  return output
}
