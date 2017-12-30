library Merkle {

  // Get the hash of a transaction given the data that went into it.
  function getTxHash() public constant returns (bytes32) {

  }

  // Get the has of a header given the data that went into it
  function getHeaderHash() public constant returns (bytes32) {
    
  }

  // Return the root of a Merkle tree. Two leaves are included, which must be
  // consecutive. Nodes are included, which are bytes32 hahses. The nodes must
  // be ordered such that the first is on the lowest branch, e.g:
  //
  //             X
  //       n2         |
  //     |    |   n1     |
  //    | |  | | |  |  l1 l2
  //
  // In this example we provide l1 and l2 (ordered from right to left) and are
  // able to prove X. n1 (node 1) is in the lowest level, followed by n2.
  // These would be included as [n1, n2].
  //
  // Here, txIndex is 3 because it is in the fourth set of the lowest level.
  // (0-indexed) If the txs had been on the left side, txIndex would be 0.
  function getRoot(bytes32[2] leaves, uint256 i, bytes nodes)
  public constant returns (bytes32) {
    // 1. Determine which side the leaves are on.
    bytes32 current = sha3(leaves[0], leaves[1]);

    // 2. Traverse the tree
    for (uint256 j = 0; j < nodes.length / 32 - 1; j++) {
      if (i % 2 == 0 || ) {
        // node is on the left side
        current = keccak256(nodes[j * 32 : j * 32 + 32], current);
      } else {
        // node is on the right side
        current = keccak256(current, nodes[j * 32 : j * 32 + 32]);
      }
      // Divide i by 2 and round down to get the new index
      i /= 2;
    }
    // 3. Return the root
    return current;
  }
}





/*

Figure for understanding getTxRoot()

                 |                                      |


        |        0          |                   |        1          |

   |    0    |         |    1     |       |   2      |        |    3     |

| 0  |    |  1  |   | 2   |    |  3 |  |  4  |   |  5  |   |  6  |    | 7   |


*/
