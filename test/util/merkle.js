// Merkle trees, proofs, headers
// Solidity hashes things strangely, so I'm building my own Merkle tools
const sha3 = require('solidity-sha3').default;

exports.buildTree = buildTree;
exports.checkProof = checkProof;
exports.getProof = getProof;
exports.getProofStr = getProofStr;
// Builds a 2D array Merkle tree with:
// layers[0] = leaves
// layers[N] = root
function buildTree(nodes, layers=[]) {
  layers.push(nodes);
  if (nodes.length < 2) { return layers; }
  let newNodes = [];
  for (let i = 0; i < nodes.length - 1; i += 2) {
    newNodes.push(hash(nodes[i], nodes[i+1]));
  }
  return buildTree(newNodes, layers);
}

// Form a Merkle proof on a 2D array Merkle tree.
// If the tree is formed incorrectly, this will return null (indicates root
// does not match up)
function getProof(i, tree) {
  let proof = [];
  let currentHash;
  for (let L = 0; L < tree.length - 1; L ++) {
    // If this index is on the left, return true
    const partnerIsRight = i % 2 == 0;
    let partner;
    let _proof = [ partnerIsRight ];
    // Get partner node
    if (partnerIsRight) {
      partner = tree[L][i + 1];
      currentHash = hash(tree[L][i], partner);
    } else {
      partner = tree[L][i - 1];
      currentHash = hash(partner, tree[L][i]);
    }
    _proof.push(partner);
    proof.push(_proof);
    i = Math.floor(i / 2);
  }
  if (currentHash != tree[tree.length - 1]) { return null; }
  else { return proof; }
}

function checkProof(leaf, proof, targetHash) {
  let currentHash = leaf;
  proof.forEach((partner) => {
    if (partner[0] == true) {
      // partner node is on the right
      currentHash = hash(currentHash, partner[1]);
    } else {
      currentHash = hash(partner[1], currentHash);
    }
  })
  return currentHash == targetHash;
}

// Convert the proof to a string consumable by solidity function
// Is of form 0x${partnerIsRight_i}${hash_i}
function getProofStr(proof) {
  let proofStr = '0x';
  proof.forEach((p) => {
    proofStr += p[0] == true ? '01' : '00';
    proofStr += p[1].slice(2);
  })
  return proofStr;
}


function hash(left, right) {
  return sha3(`0x${left.slice(2)}${right.slice(2)}`);
}
