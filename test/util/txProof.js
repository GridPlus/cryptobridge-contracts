// Merkle-Patricia tree checks taken from eth-proof
// (https://github.com/zmitton/eth-proof/blob/master/buildProof.js)
// which I can't get to work with web3 1.0
//
// This is modified to exclude header checks. These relays modify the headers
// for easier storage, so all we need to prove from the tx is its inclusion
// in the txHash. The txHash is proven through a different mechanism (standard
// Merkle tree)
const Promise = require('bluebird').Promise;
const Trie = require('merkle-patricia-tree');
const rlp = require('rlp');
const EthereumTx = require('ethereumjs-tx');
const EthereumBlock = require('ethereumjs-block/from-rpc')
const async = require('async');
const sha3 = require('js-sha3').keccak256;

exports.build = build;
exports.verifyTx = verifyTx;

function build(tx, block) {
  return new Promise((resolve, reject) => {
    let txTrie = new Trie();
    async.map(block.transactions, (siblingTx, cb) => {
      let path = rlp.encode(siblingTx.transactionIndex);
      const signedSiblingTx = new EthereumTx(squanchTx(siblingTx));
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
          value: rlp.decode(rawTxNode.value),
        }
        return resolve(prf)
      })
    })
  })
}

// From eth-proof (VerifyProof.trieValue)
// Checks that the path of the tx (value) is correct
// `value` is rlp decoded
function verifyTx(proof) {
  const path  = proof.path.toString('hex');
  const value = proof.value;
  const parentNodes = proof.parentNodes;
  const header = proof.header;
  const blockHash = proof.blockHash;
  const txRoot = header[4]; // txRoot is the 4th item in the header Array
  try{
    var currentNode;
    var len = parentNodes.length;
    var rlpTxFromPrf = parentNodes[len - 1][parentNodes[len - 1].length - 1];
    var nodeKey = txRoot;
    var pathPtr = 0;

    for (var i = 0 ; i < len ; i++) {
      currentNode = parentNodes[i];
      const encodedNode = Buffer.from(sha3(rlp.encode(currentNode)),'hex');
      if(!nodeKey.equals(encodedNode)){
        return false;
      }
      if(pathPtr > path.length){
        return false
      }
      switch(currentNode.length){
        case 17://branch node
          if(pathPtr == path.length){
            if(currentNode[16] == rlp.encode(value)){
              return true;
            }else{
              return false
            }
          }
          nodeKey = currentNode[parseInt(path[pathPtr],16)] //must == sha3(rlp.encode(currentNode[path[pathptr]]))
          pathPtr += 1
          break;
        case 2:
          pathPtr += nibblesToTraverse(currentNode[0].toString('hex'), path, pathPtr)
          if(pathPtr == path.length){//leaf node
            if(currentNode[1].equals(rlp.encode(value))){
              return true
            }else{
              return false
            }
          }else{//extension node
            nodeKey = currentNode[1]
          }
          break;
        default:
          console.log("all nodes must be length 17 or 2");
          return false
      }
    }
  }catch(e){ console.log(e); return false }
  return false
}

var nibblesToTraverse = (encodedPartialPath, path, pathPtr) => {
  if(encodedPartialPath[0] == 0 || encodedPartialPath[0] == 2){
    var partialPath = encodedPartialPath.slice(2)
  }else{
    var partialPath = encodedPartialPath.slice(1)
  }

  if(partialPath == path.slice(pathPtr, pathPtr + partialPath.length)){
    return partialPath.length
  }else{
    throw new Error("path was wrong")
  }
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
  return tx;
}

var rawStack = (input) => {
  output = []
  for (var i = 0; i < input.length; i++) {
    output.push(input[i].raw)
  }
  return output
}
