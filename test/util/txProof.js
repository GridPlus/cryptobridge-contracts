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
    // console.log('block', block);
    async.map(block.transactions, (siblingTx, cb) => {
      // console.log('siblingTx', siblingTx)
      let path = rlp.encode(siblingTx.transactionIndex);
      const signedSiblingTx = new EthereumTx(squanchTx(siblingTx));
      // console.log('signedSiblingTx.raw', signedSiblingTx.raw);
      // console.log('rlpencoded', rlp.encode(signedSiblingTx.raw).toString('hex'));
      const rawSignedSiblingTx = signedSiblingTx.serialize();
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
          value: rawTxNode.value,
        }
        // const proof = {
        //   path: '0x00' + prf.path.toString('hex'),
        //   parentNodes: '0x' + rlp.encode(prf.parentNodes).toString('hex'),
        //   value: '0x' + rlp.encode(prf.value).toString('hex'),
        // }
        // console.log('proof', proof)
        // console.log('tx.transactionIndex', tx.transactionIndex)
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
  tx.gas = '0x' + parseInt(tx.gas).toString(16);
  tx.gasPrice = '0x' + parseInt(tx.gasPrice).toString(16);
  tx.value = '0x' + parseInt(tx.value).toString(16) || '0';
  tx.data = tx.input;
  console.log(tx)
  return tx;
}

var rawStack = (input) => {
  output = []
  for (var i = 0; i < input.length; i++) {
    output.push(input[i].raw)
  }
  return output
}
