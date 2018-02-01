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
const leftPad = require('left-pad');

// Get a range of headers. More efficient than pulling them individually.
// NOTE: This is kinda cheating, since it references the genesis block as the
// "previousHeader" for all ranges. That's fine for thse test cases, but will
// not fly for production systems. PreviousHeaders should be saved in persistant
// storage
function getHeaders(start, end, web3, headers=[], i=null, parentRes=null) {
  return new Promise((resolve, reject) => {
    let lastBlock = 1;
    let lastHeader = null;
    if (!i) { i = start; }
    else { lastBlock = i - 1; }
    if (headers.length > 0) { lastHeader = headers[headers.length - 1]; }

    if (!parentRes) { parentRes = resolve; }
    if (end <= start || !end) { return resolve([]); }
    if (i == end + 1) { return parentRes(headers); }
    else {
      return getHeader(i, web3, lastHeader)
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
function getHeader(N, web3, lastHeader) {
  return new Promise((resolve, reject) => {
    web3.eth.getBlock(N)
    .then((block) => {
      const header = hashHeader(block, lastHeader, N==0);
      return resolve(header);
    })
    .catch((err) => { return reject(err); })
  });
}

// Get the root
function getRoot(headers) {
  let nodes = headers;
  if (!isPowTwo(headers.length)) { return null; }
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


function hashHeader(block, prevHeader, genesis=false) {
  const n = leftPad(parseInt(block.number).toString(16), 64, '0');
  const ts = leftPad(parseInt(block.timestamp).toString(16), 64, '0');
  let str;
  if (genesis) {
    const emptyHeader = leftPad(0, 64, '0');
    const genesisN = leftPad(1, 64, '0');
    str = `0x${emptyHeader}${ts}${genesisN}${block.transactionsRoot.slice(2)}${block.receiptsRoot.slice(2)}`;
  }
  else {
    str = `0x${prevHeader.slice(2)}${ts}${n}${block.transactionsRoot.slice(2)}${block.receiptsRoot.slice(2)}`;
  }
  return sha3(str);
}

function isPowTwo(n) {
  n = Math.floor(n);
  if (n == 0) return false;
  while (n != 1) {
    if (n % 2 != 0) return 0;
    n = Math.floor(n / 2);
  }
  return true;
}

exports.hashHeader = hashHeader;
exports.getLastPowTwo = getLastPowTwo;
exports.getNextPowTwo = getNextPowTwo;
exports.getHeader = getHeader;
exports.getHeaders = getHeaders;
exports.getRoot = getRoot;
exports.forceMine = forceMine;
exports.isPowTwo = isPowTwo;
