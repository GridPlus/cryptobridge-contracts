// Functions for forming proofs from blocks. These are modified block headers
// which only contain the following data:
// 1. Previous modified block header
// 2. Block number
// 3. Timestamp
// 4. Transaction root hash
// These data are hashed as tightly packed hex arguments in 256 bit words
// in the above order.
// NOTE: This means the verification is: block.modHeader == prevBlock.modHeader
// This verification is done in solidity, so it is ignored
const sha3 = require('solidity-sha3').default;

// Get a modified header for block N. This requires we look through the entire
// history to modify headers
function getHeader(N, web3, i=1, header=null, parentRes=null) {
  return new Promise((resolve, reject) => {
    if (!parentRes) { parentRes = resolve; };
    if (i == N) { return parentRes(header); }
    else {
      return web3.eth.getBlock(i)
      .then((block) => {
        header = _hashHeader(block, header, i==1);
        i += 1;
        return getHeader(N, web3, i, header, parentRes);
      })
      .catch((err) => { return reject(err); })
    }
  });
}

// Get the root
function getRoot(headers) {
  let nodes = headers;
  if (!_isPowTwo(headers.length)) { return null; }
  while (nodes.length > 1) {
    let tmpNodes = [];
    for (let i = 0; i < nodes.length / 2; i++) {
      tmpNodes.push(sha3(nodes[i], nodes[i + 1]));
    }
    nodes = tmpNodes;
  }
  return nodes[0];
}

function _hashHeader(block, prevHeader, genesis=false) {
  if (genesis) { return sha3(0, 1, block.timestamp, block.transactionsRoot); }
  else { return sha3(prevHeader, block.number, block.timestamp, block.transactionsRoot); }
}

function _isPowTwo(n) {
  n = Math.floor(n);
  if (n == 0) return false;
  while (n != 1) {
    if (n % 2 != 0) return 0;
    n = Math.floor(n / 2);
  }
  return true;

}

exports.getHeader = getHeader;
exports.getRoot = getRoot;
