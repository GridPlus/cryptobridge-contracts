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


// Get a range of headers. More efficient than pulling them individually.
function getHeaders(start, end, web3, headers=[], i=null, parentRes=null) {
  return new Promise((resolve, reject) => {
    let lastBlock = 1;
    let lastHeader = null;
    if (!i) {
      i = start;
    } else {
      lastBlock = i - 1;
      lastHeader = headers[headers.length - 1];
    }
    if (!parentRes) { parentRes = resolve; }
    if (i == end + 1) { return parentRes(headers); }
    else {
      return getHeader(i, web3, lastBlock, lastHeader)
      .then((header) => {
        headers.push(header);
        i++;
        return getHeaders(start, end, web3, headers, i, parentRes);
      })
      .catch((err) => { return reject(err); })
    }
  })
}

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
        i++;
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

function forceMine(n, account, web3, i=0, outerResolve=null, outerReject=null) {
  return new Promise((resolve, reject) => {
    console.log('i', i)
    if (i == 0) { outerResolve = resolve; outerReject = reject; }
    if (i == n) { return outerResolve(true); }
    else {
      web3.eth.sendTransaction({ from: account, to: account, value: 1})
      .then(() => { forceMine(n, account, web3, i+1, outerResolve, outerReject); })
      .catch((err) => { return outerReject(err); })
    }
  })
}

// Return the most recent power of two
function getLastPowTwo(n) {
  return Math.pow(2, Math.floor(Math.log(n) / Math.log(2)))
}

// Return the next power of two
function getNextPowTwo(n) {
  return Math.pow(2, Math.ceil(Math.log(n) / Math.log(2)))
}


function _hashHeader(block, prevHeader, genesis=false) {
  if (genesis) { return sha3(0, 1, block.timestamp, block.transactionsRoot); }
  else { return sha3(prevHeader, block.number, block.timestamp, block.transactionsRoot, block.receiptsRoot); }
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

exports.getLastPowTwo = getLastPowTwo;
exports.getNextPowTwo = getNextPowTwo;
exports.getHeader = getHeader;
exports.getHeaders = getHeaders;
exports.getRoot = getRoot;
exports.forceMine = forceMine;
