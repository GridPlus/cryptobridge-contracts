pragma solidity ^0.4.18;

import "./Merkle.sol";
import "tokens/Token.sol";  // truffle package (install with `truffle install tokens`)
import "tokens/HumanStandardToken.sol";

contract Relay {

  // ===========================================================================
  // GLOBAL VARIABLES
  // ===========================================================================

  // This maps the start block and end block for a given chain to an epoch
  // index (i) and provides the root.
  event HeaderRoot(address indexed chain, uint256 indexed start,
    uint256 indexed end, bytes32 root, uint256 i, address proposer);
  event Deposit(address indexed user, address indexed toChain,
    address indexed token, uint256 amount);
  event TokenAdded(address indexed fromChain, address indexed origToken,
    address indexed newToken);

  // Admin has the ability to add tokens to the relay
  address admin;

  // The reward function, which is of form (reward = base + a*t + b*t^2)
  // where t is measured in seconds since the last epoch
  struct Reward {
    uint256 base,
    uint256 a,
    uint256 b
  }
  Reward proposalReward;

  // Reward for successfully contesting a headerRoot
  uint256 public bountyWei;

  // The randomness seed of the epoch. This is used to determine the proposer
  // and the validator pool
  bytes32 epochSeed = block.header;

  // Global pool of stakers - indexed by address leading to stake size
  mapping(address => uint256) stakes;
  address[] stakers;

  // The root of a Merkle tree made of consecutive block headers.
  // These are indexed by the chainId of the Relay contract on the
  // sidechain. This also serves as the identity of the chain itself.
  // The associatin between address-id and chain-id is stored off-chain but it
  // must be 1:1 and unique.
  mapping(address => bytes32[]) headerRoots;

  // Tokens need to be associated between chains. For now, only the admin can
  // create and map tokens on the sidechain to tokens on the main chain
  // fromChainId => (oldTokenAddr => newTokenAddr)
  mapping(address => (mapping(address => address))) tokens;

  // ===========================================================================
  // STATE UPDATING FUNCTIONS
  // ===========================================================================

  // Save a hash to an append-only array of headerRoots associated with the
  // given origin chain address-id.
  function proposeRoot(bytes32 root, address chain, uint256 start, uint256 end,
  bytes sigs) public onlyProposer() {
    assert(checkValidators(root, chain, start, end, sigs) == true);
    headerRoots[chain].push(root);
    HeaderRoot(chain, start, end, root, headerRoots[origin].length, msg.sender);
  }

  // Map a token (or ether) to a token on the original chain
  function addToken(address newToken, address origToken, address fromChain)
  public payable onlyAdmin() {
    // Ether is represented as address(1). We don't need to map the entire supply
    // because actors need ether to do anything on this chain. We'll assume
    // the accounting is managed off-chain.
    if (newToken != address(1)) {
      // Adding ERC20 tokens is stricter. We need to map the total supply.
      assert(newToken != address(0));
      Token t = Token(newToken);
      t.transferFrom(address(this), msg.sender, t.totalSupply);
      tokens[fromChain][origToken] = newToken;
    }
    TokenAdded(fromChain, origToken, newToken);
  }

  // Any user may make a deposit bound for a particular chainId (address of
  // relay on the destination chain).
  // Only tokens for now, but ether may be allowed later.
  function deposit(address token, address toChain, uint amount) public payable {
    assert(tokens[toChain][token] != address(0));
    Token t = Token(token);
    t.transferFrom(address(this), msg.sender, amount);
    Deposit(msg.sender, toChain, address(this), amount);
  }

  // To withdraw a token, the user needs to perform three proofs:
  // 1. Prove that the transaction was included in a transaction Merkle tree
  // 2. Prove that the tx Merkle root went in to forming a block header
  // 3. Prove that the block header went into forming the header root of an epoch
  // Data is of form: [txTreeDepth, txProof, block header data, headerTreeDepth,
  // headerProof]
  //
  // Note: Because the history is based on social consensus, the block headers
  // can actually be different than what exists in the canonical blockchain.
  // We can vastly simplify the block data!
  // TODO: Implement :)
  function withdraw(address fromChain, uint256 idx, bytes data) {
    // 1. Transaction proof
    // First 8 bytes are txTreeDepth
    uint8 txTreeDepth = getUint16(0, data);
    uint16 offset = 8;
    bytes32[txTreeDepth] txProof;
    // Now fill in the Merkle proof for transactions
    for (uint16 tx = 0; tx < txTreeDepth; tx++) {
      // Location of the item in the proof. Offset is 8 bytes
      uint16 loc = offset + tx * 32;
      txProof[tx] = getBytes32(loc, data);
    }
    offset += (txTreeDepth - 1) * 32;
    // Do the transaction proof
    //makeProof(txProof)

    // 2. Form the block header
    // Block metadata: [prevHash, timestamp(uint256), blockNum, txRoot]
    // This is a modified block which is meant to be the bare minimum required
    // for a trustworthy relay.
    uint[3] block;
    block[0] = getBytes32(offset, data);
    block[1] = getUint256(offset + 32, data);
    block[2] = getUint256(offset + 64, data);
    // txRoot is the last item in the txProof;
    offset += 96;
    bytes32 blockHeader = sha3(block[0], block[1], block[2], txProof[txTreeDepth - 1]);

    // 3. Prove block header root
  }

  // ===========================================================================
  // UTILITY FUNCTIONS
  // ===========================================================================

  // Get the proposer from the randomness.
  // TODO: This should be proportional to the size of stake.
  function getProposer() internal constant returns (address) {
    uint256 i = uint256(epochSeed);
    return stakers[i];
  }

  // Check the signatures to see if the hash matches up in at least the requisite
  // number of signatures (2/3 by default)
  // TODO: implement :)
  function checkValidators(bytes32 root, address chain, uint256 start, uint256 end,
  bytes sigs) internal constant returns (bool) {
    bytes32 h = sha3(root, chain, start, end);
    return true;
  }

  // Get 32 bytes and cast to byes32
  function getBytes32(uint16 start, bytes data) internal constant
  returns (bytes32) {
    bytes newData;
    for (uint16 i = start; i < start + 32; i++) {
      newData[i - start] = data[i];
    }
    return bytes32(newData);
  }

  // Get 32 bytes and cast to uint256
  function getUint256(uint16 start, bytes data) internal constant
  returns (uint256) {
    bytes newData;
    for (uint16 i = start; i < start + 32; i++) {
      newData[i - start] = data[i];
    }
    return uint256(newData);
  }

  // Get 8 bytes and cast to uint8
  function getUint16(uint16 start, bytes data) internal constant
  returns (uint16) {
    bytes newData;
    for (uint16 i = start; i < start + 8; i++) {
      newData[i - start] = data[i];
    }
    return uint16(newData);
  }

  function TrustedRelay() {
    admin = msg.sender;
  }

  modifier onlyProposer() {
    require(msg.sender == getProposer());
    _;
  }

  modifier onlyAdmin() {
    require(msg.sender == admin);
    _;
  }

}
