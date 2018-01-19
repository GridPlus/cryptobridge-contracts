// Modified version of Sam Mayo's library.
pragma solidity ^0.4.18;
import "./BytesLib.sol";

/// @title RLP Encoding Library for Solidity
/// @author Sam Mayo (sammayo888@gmail.com)
/// @dev Library for rlp encoding arbitrary bytes or lists.

library RLPEncode {
    uint8 constant STRING_SHORT_PREFIX = 0x80;
    uint8 constant STRING_LONG_PREFIX = 0xb7;
    uint8 constant LIST_SHORT_PREFIX = 0xc0;
    uint8 constant LIST_LONG_PREFIX = 0xf7;

    /// @dev Rlp encodes a bytes
    /// @param self The bytes to be encoded
    /// @return The rlp encoded bytes
	function encodeBytes(bytes memory self) internal constant returns (bytes) {
    bytes memory encoded;
    if(self.length == 1 && uint(self[0]) < 0x80) {
      encoded = new bytes(1);
      encoded = self;
    } else {
      encoded = BytesLib.concat(encodeLength(self.length, 128), self);
		}
    return encoded;
  }

  /// @dev Rlp encodes a bytes[]. Note that the items in the bytes[] will not automatically be rlp encoded.
  /// @param self The bytes[] to be encoded
  /// @return The rlp encoded bytes[]
  function encodeList(bytes[] memory self) internal constant returns (bytes) {
    bytes memory encoded;
    for (uint i=0; i < self.length; i++) {
      encoded = BytesLib.concat(encoded, encodeBytes(self[i]));
    }
    return BytesLib.concat(encodeLength(encoded.length, 192), encoded);
  }

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

  function encode(bytes memory self, uint8 prefix1, uint8 prefix2) private constant returns (bytes) {
  	uint selfPtr;
    assembly { selfPtr := add(self, 0x20) }

    bytes memory encoded;
    uint encodedPtr;

  	uint len = self.length;
    uint lenLen;
    uint i = 0x1;
    while(len/i != 0) {
      lenLen++;
      i *= 0x100;
    }

    if(len <= 55) {
	    encoded = new bytes(len+1);

      // length encoding byte
	    encoded[0] = byte(prefix1+len);

      // string/list contents
      assembly { encodedPtr := add(encoded, 0x21) }
      memcpy(encodedPtr, selfPtr, len);
    } else {
      // 1 is the length of the length of the length
	    encoded = new bytes(1+lenLen+len);

      // length of the length encoding byte
	    encoded[0] = byte(prefix2+lenLen);

      // length bytes
	    for(i=1; i<=lenLen; i++) {
	      encoded[i] = byte((len/(0x100**(lenLen-i)))%0x100);
	    }

      // string/list contents
      assembly { encodedPtr := add(add(encoded, 0x21), lenLen) }
      memcpy(encodedPtr, selfPtr, len);
    }
    return encoded;
  }


  /// This function is from Nick Johnson's string utils library
  function memcpy(uint dest, uint src, uint len) private {
    // Copy word-length chunks while possible
    for(; len >= 32; len -= 32) {
      assembly {
        mstore(dest, mload(src))
      }
      dest += 32;
      src += 32;
    }

    // Copy remaining bytes
    uint mask = 256 ** (32 - len) - 1;
    assembly {
      let srcpart := and(mload(src), not(mask))
      let destpart := and(mload(dest), mask)
      mstore(dest, or(destpart, srcpart))
    }
  }
}
