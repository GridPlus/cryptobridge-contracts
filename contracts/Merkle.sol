library Merkle {

  // Get the hash of a transaction given the data that went into it.
  function getTxHash() public constant returns (bytes32) {

  }

  // Return the root of a Merkle tree. Two leaves are included, which must be
  // consecutive. Nodes are included, which are bytes32 hahses. The nodes must
  // be ordered such that the first is on the lowest branch, e.g:
  //
  //             X
  //       n2         |
  //     |    |   n1    |
  //    | |  | | | |  l1 l2
  //
  // In this example we provide l1 and l2 (ordered from right to left) and are
  // able to prove X. n1 (node 1) is in the lowest level, followed by n2.
  // These would be included as [n1, n2].
  //
  // Here, txIndex is 3 because it is in the fourth set of the lowest level.
  // (0-indexed) If the txs had been on the left side, txIndex would be 0.
  function getTxRoot(bytes32[2] leaves, bytes[] nodes, uint256 i)
    public constant returns (bytes32) {

  }
}
