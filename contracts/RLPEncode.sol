// Library for RLP encoding a list of bytes arrays.
// Modeled after ethereumjs/rlp (https://github.com/ethereumjs/rlp)
// [Very] modified version of Sam Mayo's library.
pragma solidity ^0.4.18;
import "./BytesLib.sol";

library RLPEncode {

  // Encode an item (bytes)
	function encodeItem(bytes memory self) internal constant returns (bytes) {
    bytes memory encoded;
    if(self.length == 1 && uint(self[0]) < 0x80) {
      encoded = new bytes(1);
      encoded = self;
    } else {
      encoded = BytesLib.concat(encodeLength(self.length, 128), self);
		}
    return encoded;
  }

  // Encode a list of items
  function encodeList(bytes[] memory self) internal constant returns (bytes) {
    bytes memory encoded;
    for (uint i=0; i < self.length; i++) {
      encoded = BytesLib.concat(encoded, encodeItem(self[i]));
    }
    return BytesLib.concat(encodeLength(encoded.length, 192), encoded);
  }

  // Generate the prefix for an item or the entire list based on RLP spec
  function encodeLength(uint256 L, uint256 offset) internal constant returns (bytes) {
    if (L < 56) {
      bytes memory prefix = new bytes(1);
      prefix[0] = byte(L + offset);
      return prefix;
    } else {
      // lenLen is the length of the hex representation of the data length
      uint lenLen;
      uint i = 0x1;
      while(L/i != 0) {
        lenLen++;
        i *= 0x100;
      }
      bytes memory firstByte = new bytes(1);
      firstByte[0] = byte(offset + 55 + lenLen);
      bytes memory second = new bytes(1);
      second[0] = byte(L);
      return BytesLib.concat(firstByte, second);
    }
  }
}
