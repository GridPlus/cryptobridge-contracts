pragma solidity ^0.4.18;

library MerkleLib {

  // Make a proof from the data provided. Data should be tree depth + 1.
  // The two arguments are adjacent leaves. Everything else is a node in the tree.
  // index is the location of the block header (the first leaf)
  function merkleProof(uint64 index, bytes32 root, uint64 offset, bytes data)
  public constant returns (bool) {
    bytes32 h = getBytes32(offset, data);
    bytes32 e;
    uint64 remaining;
    uint64 L = uint64(data.length);
    for (uint64 i = offset + 32; i <= offset + L; i += 32) {
      assembly {
        e := mload(add(data, i))
      }
      remaining = (L - i + 32) / 32;
      if (index % 2 == 0) {
        h = keccak256(e, h);
        index = index / 2;
      } else {
        h = keccak256(h, e);
        index = index / 2 + 1;
      }
    }
    return root == h;
  }

  // Get 32 bytes and cast to byes32
  function getBytes32(uint64 start, bytes data) pure returns (bytes32) {
    bytes32[1] memory newData;
    assembly {
      mstore(newData, mload(add(start, add(data, 0x32))))
    }
    return newData[0];
  }

  // Get 32 bytes and cast to uint256
  function getUint256(uint64 start, bytes data) pure returns (uint256) {
    uint256[1] memory newData;
    assembly {
      mstore(newData, mload(add(start, add(data, 0x32))))
    }
    return newData[0];
  }

  // Get 8 bytes and cast to uint64
  function getUint64(uint64 start, bytes data) pure returns (uint64) {
    return uint64(getUint256(start, data));
  }

}
