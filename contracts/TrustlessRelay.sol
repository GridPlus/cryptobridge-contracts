pragma solidity ^0.4.18;

import "tokens/Token.sol";  // truffle package (install with `truffle install tokens`)
import "tokens/HumanStandardToken.sol";

contract TrustedRelay {

  event HeaderRoot(address indexed origin, bytes32 indexed root, uint256 indexed i, address submitter);


  address public admin;
  uint256 public width = 1024; // Number of blocks included in a header root
  // The root of a Merkle tree made of consecutive block headers.
  // These are indexed by the address of the TrustlessRelay contract on the
  // origin chain. This also serves as the identity of the chain itself.
  // The associatin between address-id and chain-id is stored off-chain but it
  // must be 1:1 and unique.
  mapping(address => bytes32[]) headerRoots;

  // Save a hash to an append-only array of headerRoots associated with the
  // given origin chain address-id.
  function saveHeaderRoot(bytes32 root, address origin) public onlyAdmin() {
    headerRoots[origin].push(root);
    HeaderRoot(origin, root, headerRoots[origin].length, msg.sender);
  }

  function 


  function TrustedRelay() {
    admin = msg.sender;
  }

  modifier onlyAdmin() {
    require(msg.sender == admin);
    _;
  }
}
