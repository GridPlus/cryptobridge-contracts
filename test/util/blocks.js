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

/*
// This was fun, but I actually don't need it :|
// Keeping for reference

function getProof(headers, i) {
  console.log('headers', headers)
  console.log('i', i);
  let nodes = headers;
  let hashes = [];
  let levelCounter = 0;
  // Get the tree of hashes
  while (nodes.length > 1) {
    let tmpNodes = [];
    for (let j = 0; j < Math.floor(nodes.length / 2); j++) {
      const node = sha3(nodes[j], nodes[j+1]);
      tmpNodes.push(node);
      hashes.push(node);
    }
    nodes = tmpNodes;
    levelCounter++;
  }
  console.log('hashes', hashes)
  let proof = [];
  // Get leaves
  if (i % 2 == 0) {
    // Left leaf
    proof.push(headers[i]);
    proof.push(headers[i+1]);
  } else {
    // Right leaf
    proof.push(headers[i-1]);
    proof.push(headers[i]);
  }
  // Start at the first level
  i = Math.floor(i / 2);
  console.log('new i', i)
  let offset = 0;
  // Go through each level and grab the partner hash
  for (let k = 1; k < levelCounter; k++) {
    console.log('offset', offset)
    if (i % 2 == 0) {
      proof.push(hashes[offset + i]);
    } else {
      proof.push(hashes[offset + i - 1]);
    }
    // Push the length of this tree level onto the offset
    offset += nodes.length / 2 ** k;
  }
  return proof;
}

// Prove that a
function prove(proof, i, headerRoot, start, end) {
  let h = '0x0000000000000000000000000000000000000000000000000000000000000000';
  for (let j = 1; j < nodes.length; j++) {
    let remaining = nodes.length - j;
    while (remaining > 0 && i % 2 == 1 && i > 2 ** remaining) {
      i = Math.floor(i / 2) + 1;
    }
    if (i % 2 == 0) {
      h = sha3(nodes[i], h);
    } else {
      h = sha3(h, nodes[i]);
      i = Math.floor(i / 2) + 1;
    }
  }
  return h;
}
*/

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
exports.getHeaders = getHeaders;
// exports.getProof = getProof;
exports.getRoot = getRoot;
