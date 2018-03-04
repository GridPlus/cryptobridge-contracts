pragma solidity ^0.4.18;

import "./MerklePatriciaProof.sol";
import './RLPEncode.sol';
import "./BytesLib.sol";
import "tokens/contracts/eip20/EIP20.sol";

contract Bridge {
  //helpers
  function toBytes(address a) constant returns (bytes b) {
      assembly {
        let m := mload(0x40)
        mstore(add(m, 20), xor(0x140000000000000000000000000000000000000000, a))
        mstore(0x40, add(m, 52))
        b := m
      }
  }

  function toBytes(uint256 x) returns (bytes b) {
    b = new bytes(32);
    assembly { mstore(add(b, 32), x) }
  }

  function encodeAddress(address a) returns(bytes) {
    return BytesLib.concat(new bytes(12) , toBytes(a));
  }

  // ===========================================================================
  // GLOBAL VARIABLES
  // ===========================================================================

  // This maps the start block and end block for a given chain to an epoch
  // index (i) and provides the root.
  event RootStorage(address indexed chain, uint256 indexed start,
    uint256 indexed end, bytes32 headerRoot, uint256 i, address proposer);
  event Deposit(address indexed user, address indexed toChain,
    address indexed depositToken, address fromChain, uint256 amount);
  event Withdraw(address indexed user, address indexed fromChain,
    address indexed withdrawToken, uint256 amount);
  event TokenAdded(address indexed fromChain, address indexed origToken,
    address indexed newToken);
  event TokenAssociated(address indexed toChain, address indexed fromToken,
    address indexed toToken);


  // Admin has the ability to add tokens to the bridge
  address public admin;

  // The reward function, which is of form (reward = base + a*n)
  // where n is the number of blocks proposed in the header (end-start)
  struct Reward {
    uint256 base;
    uint256 a;
  }
  Reward reward;
  uint256 public maxReward;

  // Reward for successfully contesting a headerRoot
  uint256 public bountyWei;

  // The randomness seed of the epoch. This is used to determine the proposer
  // and the validator pool
  bytes32 public epochSeed = keccak256(block.difficulty + block.number + now);

  // Global pool of stakers - indexed by address leading to stake size
  struct Stake {
    uint256 amount;
    address staker;
  }
  mapping(address => uint256) stakers;
  Stake[] stakes;
  uint256 public stakeSum;
  address public stakeToken;
  uint256 public validatorThreshold = 0;

  // Pending withdrawals. The user prepares a withdrawal with tx data and then
  // releases it with a withdraw. It can be overwritten by the user and gets wiped
  // upon withdrawal.
  struct Withdrawal {
    address withdrawToken;          // Token to withdraw (i.e. the one mapped to deposit)
    address fromChain;
    uint256 amount;         // Number of atomic units to withdraw
    bytes32 txRoot;         // Transactions root for the block housing this tx
    bytes32 txHash;         // Hash of this tx
    bytes32 receiptsRoot;   // Receipts root for the block housing this tx
  }
  mapping(address => Withdrawal) pendingWithdrawals;

  // The root of a Merkle tree made of consecutive block headers.
  // These are indexed by the chainId of the Bridge contract on the
  // sidechain. This also serves as the identity of the chain itself.
  // The associatin between address-id and chain-id is stored off-chain but it
  // must be 1:1 and unique.
  mapping(address => bytes32[]) roots;

  // Tracking the last block for each bridge network
  mapping(address => uint256) lastBlock;

  // Tokens need to be associated between chains. For now, only the admin can
  // create and map tokens on the sidechain to tokens on the main chain
  // fromChainId => (oldTokenAddr => newTokenAddr)
  mapping(address => mapping(address => address)) tokens;

  // ===========================================================================
  // STAKER FUNCTIONS
  // ===========================================================================

  // Stake a specified quantity of the staking token
  function stake(uint256 amount) public {
    EIP20 t = EIP20(stakeToken);
    t.transferFrom(msg.sender, address(this), amount);
    // We can't have a 0-length stakes array
    if (stakers[msg.sender] == 0) {
      // If the staker is new
      Stake memory s;
      s.amount = amount;
      s.staker = msg.sender;
      if (stakes.length == 0) { stakes.push(s); }
      stakes.push(s);
      stakers[msg.sender] = stakes.length - 1;
    } else {
      // Otherwise we can just add to the stake
      stakes[stakers[msg.sender]].amount += amount;
    }
    stakeSum += amount;
  }

  // Remove stake
  // TODO: This can probably be rolled into stake()
  function destake(uint256 amount) public {
    assert(stakers[msg.sender] != 0);
    assert(amount <= stakes[stakers[msg.sender]].amount);
    //stakeSum -= amount;
    stakes[stakers[msg.sender]].amount -= amount;
    stakeSum -= amount;
    EIP20 t = EIP20(stakeToken);
    t.transfer(msg.sender, amount);
    if (stakes[stakers[msg.sender]].amount == 0) {
      delete stakes[stakers[msg.sender]];
    }
  }

  // Save a hash to an append-only array of rootHashes associated with the
  // given origin chain address-id.
  // TODO: This can be turned into a loop so the proposer can submit roots
  // from multiple bridged chains. The reward will be increased with more roots.
  function proposeRoot(bytes32 headerRoot, address chainId, uint256 end, bytes sigs)
  public {
    // Make sure we are adding blocks
    assert(end > lastBlock[chainId] + 1);
    // Make sure enough validators sign off on the proposed header root
    assert(checkSignatures(headerRoot, chainId, lastBlock[chainId] + 1, end, sigs) >= validatorThreshold);
    // Add the header root
    roots[chainId].push(headerRoot);
    // Calculate the reward and issue it
    uint256 r = reward.base + reward.a * (end - lastBlock[chainId]);
    // If we exceed the max reward, anyone can propose the header root
    if (r > maxReward) {
      r = maxReward;
    } else {
      assert(msg.sender == getProposer());
    }
    msg.sender.transfer(r);
    epochSeed = keccak256(block.difficulty + block.number + now);
    RootStorage(chainId, lastBlock[chainId] + 1, end, headerRoot, roots[chainId].length - 1, msg.sender);
    lastBlock[chainId] = end;
  }

  // ===========================================================================
  // ADMIN FUNCTIONS
  // ===========================================================================

  // Create a token and map it to an existing one on the origin chain
  function addToken(address newToken, address origToken, address fromChain)
  public payable onlyAdmin() {
    // Ether is represented as address(1). We don't need to map the entire supply
    // because actors need ether to do anything on this chain. We'll assume
    // the accounting is managed off-chain.
    if (newToken != address(1)) {
      // Adding ERC20 tokens is stricter. We need to map the total supply.
      assert(newToken != address(0));
      EIP20 t = EIP20(newToken);
      t.transferFrom(msg.sender, address(this), t.totalSupply());
      tokens[fromChain][origToken] = newToken;
    }
    TokenAdded(fromChain, origToken, newToken);
  }

  // Forward association. Map an existing token to a replciated one on the
  // destination chain.
  // oldToken is on this chain; newToken is on toChain
  function associateToken(address newToken, address origToken, address toChain)
  public onlyAdmin() {
    tokens[toChain][newToken] = origToken;
    TokenAssociated(toChain, origToken, newToken);
  }

  // Change the number of validators required to allow a passed header root
  function updateValidatorThreshold(uint256 newThreshold) public onlyAdmin() {
    validatorThreshold = newThreshold;
  }

  // The admin can update the reward at any time.
  // TODO: We may want to block this during the current epoch, which would require
  // we keep a "reward cache" of some kind.
  function updateReward(uint256 base, uint256 a, uint256 max) public onlyAdmin() {
    reward.base = base;
    reward.a = a;
    maxReward = max;
  }

  // ===========================================================================
  // USER FUNCTIONS
  // ===========================================================================

  // Any user may make a deposit bound for a particular chainId (address of
  // bridge on the destination chain).
  // Only tokens for now, but ether may be allowed later.
  function deposit(address token, address toChain, uint256 amount) public {
    EIP20 t = EIP20(token);
    t.transferFrom(msg.sender, address(this), amount);
    Deposit(msg.sender, toChain, token, address(this), amount);
  }

  // --------------------------------------------------------------------------
  // Witddraw 
  // --------------------------------------------------------------------------

  function getStandardV(bytes v, uint256 netVersion) internal constant returns (uint8) {
    if (netVersion > 0) {
      return uint8(BytesLib.toUint(BytesLib.leftPad(v), 0) - (netVersion * 2) - 8);
    } else {
      return uint8(BytesLib.toUint(BytesLib.leftPad(v), 0));
    }
  }

  // The user who wishes to make a withdrawal sets the transaction here.
  // This must correspond to `deposit()` on the fromChain
  // The txRoot can be passed in, but it needs to be correct for the second part
  // of this process where the user proves the transaction root goes in the
  // block header.
  //
  // addrs = [fromChain, depositToken, withdrawToken]
  //
  // netVersion is for EIP155 - v = netVersion*2 + 35 or netVersion*2 + 36
  // This can be found in a web3 console with web3.version.network. Parity
  // also serves it in the transaction log under `chainId`

  function prepWithdraw(
    bytes v,
    bytes32[4] b32p, // r=0, s=1, txRoot=2, txHash=3
    //bytes32 r, 
    //bytes32 s, 
    address[3] addrs, // fromChain=0, depositToken=1, withdrawToken=2
    uint256 amount, 
    //bytes32 txRoot, 
    bytes path,
    bytes parentNodes, 
    bytes netVersion,
    bytes rlpDepositTx
    )
    public 
    {

    // LAZ:
    // Reduction of this function is possible, but it cannot be merged with 
    // proveReceipt, see comments there.   

    //assert(tokens[addrs[0]][addrs[3]] == addrs[1]);
    // Form the transaction data.

    // LAZ: 
    // the following proof is based exclusively on external parameters. it could
    // be moved out to javascript code (reduces around 20k gas) 

    // Make sure this transaction is the value on the path via a MerklePatricia proof
    assert(MerklePatriciaProof.verify(rlpDepositTx, path, parentNodes, b32p[2]) == true);

    // Ensure v,r,s belong to msg.sender
    // We want standardV as either 27 or 28
    uint8 standardV = getStandardV(v, BytesLib.toUint(BytesLib.leftPad(netVersion), 0));
    assert(msg.sender == ecrecover(b32p[3], standardV, b32p[0], b32p[1]));

    Withdrawal memory w;
    w.withdrawToken = addrs[2];
    w.fromChain = addrs[0];
    w.amount = amount;
    w.txRoot = b32p[2];
    w.txHash = b32p[3];
    pendingWithdrawals[msg.sender] = w;
  }

// --------------------------------------------------------------------------

  // Prove the receipt included in the tx forms the receipt root for the block
  // If the proof works, save the receipt root
  // Two logs are emitted. Token transfer has 3 topics, Deposit has 4 topics.
  // Topics are only for the indexed fields.
  //
  // ---------------------------------------------------------------------------
  // logs format (NOTE: this is falttened as input!):
  // [ [addrs[0], [ topics[0], topics[1], topics[2]], data[0] ],
  //   [addrs[1], [ topics[3], topics[4], topics[5], topics[6] ], data[1] ] ]
  // where addrs = [token, bridgeB]
  // --------------------------------------------------------------------------
  // data[2] is the receiptsRoot for the block
  //function proveReceipt(bytes cumulativeGas, bytes logsBloom, address[2] addrs,
  //bytes32[3] data, bytes32[7] topics, bytes path, bytes parentNodes)
  function proveReceipt(
    bytes logs, 
    bytes cumulativeGas, 
    bytes logsBloom,
    bytes32 receiptsRoot, 
    bytes path, 
    bytes parentNodes
    )
    public
    {
    // LAZ:
    // even one(!) more parameter leads to "CompilerError: Stack too deep, 
    // try removing local variables.". Applying Packing/Slicing has its 
    // limits, as it has stack-cost, too (and needs sometimes local vars,
    // as it does below).
    // Suggestion (essentially a must): 
    // Overall rewrite of proveReceipt, to use other techniques/concepts,
    // thus stack-cost is reduced significantly. After this, at minimum
    // one of the 2 other functions (prep / withdraw) will be mergable.

    // Make sure the user has a pending withdrawal
    //assert(pendingWithdrawals[msg.sender].txRoot != bytes32(0));

    // Encdode the logs. This is of form:
    // [ [addrs[0], [ topics[0], topics[1], topics[2]], data[0] ],
    //   [addrs[1], [ topics[3], topics[4], topics[5], topics[6] ], data[1] ] ]
    bytes[] memory log0 = new bytes[](3);
    bytes[] memory topics0 = new bytes[](3);
    log0[0] = BytesLib.slice(logs, 0, 20);
    topics0[0] = BytesLib.slice(logs, 20, 32);
    topics0[1] = BytesLib.slice(logs, 52, 32);
    topics0[2] = BytesLib.slice(logs, 84, 32);
    log0[1] = RLPEncode.encodeList(topics0);
    log0[2] = BytesLib.slice(logs, 116, 32);

    bytes[] memory log1 = new bytes[](3);
    bytes[] memory topics1 = new bytes[](4);
    log1[0] = BytesLib.slice(logs, 148, 20);
    topics1[0] = BytesLib.slice(logs, 168, 32);
    topics1[1] = BytesLib.slice(logs, 200, 32);
    topics1[2] = BytesLib.slice(logs, 232, 32);
    topics1[3] = BytesLib.slice(logs, 264, 32);
    log1[1] = RLPEncode.encodeList(topics1);
    log1[2] = BytesLib.slice(logs, 296, 64); // this is two 32 byte words

    // We need to hack around the RLPEncode library for the topics, which are
    // nested lists
    bool[] memory passes = new bool[](4);
    passes[0] = false;
    passes[1] = true;
    passes[2] = false;
    bytes[] memory allLogs = new bytes[](2);
    allLogs[0] = RLPEncode.encodeListWithPasses(log0, passes);
    allLogs[1] = RLPEncode.encodeListWithPasses(log1, passes);
    passes[0] = true;

    // Finally, we can encode the receipt
    bytes[] memory receipt = new bytes[](4);
    receipt[0] = hex"01";
    receipt[1] = cumulativeGas;
    receipt[2] = logsBloom;
    receipt[3] = RLPEncode.encodeListWithPasses(allLogs, passes);
    passes[0] = false;
    passes[1] = false;
    passes[3] = true;

    // Check that the sender made this transaction
    assert(BytesLib.toAddress(topics0[1], 12) == msg.sender);
    assert(BytesLib.toAddress(topics1[1], 12) == msg.sender);

    // Check the amount
    assert(BytesLib.toUint(log0[2], 0) == pendingWithdrawals[msg.sender].amount);
    assert(BytesLib.toUint(log1[2], 32) == pendingWithdrawals[msg.sender].amount);

    // Check that this is the right destination
    assert(BytesLib.toAddress(topics1[2], 12) == address(this));

    // Check that it's coming from the right place
    assert(BytesLib.toAddress(log1[0], 0) == pendingWithdrawals[msg.sender].fromChain);

    // Check the token
    assert(tokens[pendingWithdrawals[msg.sender].fromChain][BytesLib.toAddress(log0[0], 0)] == pendingWithdrawals[msg.sender].withdrawToken);

    // TODO: There may be more checks for other parts of the logs, but this covers
    // the basic stuff

    assert(MerklePatriciaProof.verify(RLPEncode.encodeListWithPasses(receipt, passes),
      path, parentNodes, receiptsRoot) == true);
    pendingWithdrawals[msg.sender].receiptsRoot = receiptsRoot;

    // LAZ:
    // draft for inclusion of final withdraw function call  
    // Part 3 of withdrawal. At this point, the user has proven transaction and
    // receipt. Now the user needs to prove the header.
    
    // Those lines cannot be merged, as they depend on parameters 
    //Withdrawal memory w = pendingWithdrawals[msg.sender];
    //bytes32 leaf = keccak256(prevHeader, timestamp, blockNum, w.txRoot, w.receiptsRoot);
    //assert(merkleProof(leaf, roots[w.fromChain][rootN], proof) == true);

    // Those lines could be enabled (this results in around 370k gas, but without
    // the prooves above)
    //EIP20 t = EIP20(pendingWithdrawals[msg.sender].withdrawToken);
    //t.transfer(msg.sender, pendingWithdrawals[msg.sender].amount);
    //Withdraw(msg.sender, pendingWithdrawals[msg.sender].fromChain, pendingWithdrawals[msg.sender].withdrawToken, pendingWithdrawals[msg.sender].amount);
    //delete pendingWithdrawals[msg.sender];
}

// --------------------------------------------------------------------------

  // Part 3 of withdrawal. At this point, the user has proven transaction and
  // receipt. Now the user needs to prove the header.
  function withdraw(
    uint256 blockNum, 
    uint256 timestamp, 
    bytes32 prevHeader,
    uint rootN, 
    bytes proof
  ) 
  public 
  {
    Withdrawal memory w = pendingWithdrawals[msg.sender];
    bytes32 leaf = keccak256(prevHeader, timestamp, blockNum, w.txRoot, w.receiptsRoot);
    assert(merkleProof(leaf, roots[w.fromChain][rootN], proof) == true);
    EIP20 t = EIP20(w.withdrawToken);
    t.transfer(msg.sender, w.amount);
    Withdraw(msg.sender, w.fromChain, w.withdrawToken, w.amount);
    delete pendingWithdrawals[msg.sender];
  }

// --------------------------------------------------------------------------
// END WITHDRAW
// --------------------------------------------------------------------------

  function getPendingToken(address user) public constant returns (address) {
    return pendingWithdrawals[user].withdrawToken;
  }

  function getPendingAmount(address user) public constant returns (uint256) {
    return pendingWithdrawals[user].amount;
  }

  function getPendingFromChain(address user) public constant returns (address) {
    return pendingWithdrawals[user].fromChain;
  }

  function getReward(uint end, address chainId) public constant returns (uint256) {
    uint256 r = reward.base + reward.a * (end - lastBlock[chainId]);
    // If we exceed the max reward, anyone can propose the header root
    if (r > maxReward) { r = maxReward; }
    return r;
  }

  // ===========================================================================
  // UTILITY FUNCTIONS
  // ===========================================================================


  // Check a series of signatures against staker addresses. If there are enough
  // signatures (>= validatorThreshold), return true
  // NOTE: For the first version, any staker will work. For the future, we should
  // select a subset of validators from the staker pool.
  function checkSignatures(bytes32 root, address chain, uint256 start, uint256 end, bytes sigs)
  public constant returns (uint256) {
    bytes32 h = keccak256(root, chain, start, end);
    uint256 passed;
    address[] memory passing = new address[](sigs.length / 96);
    // signs are chunked in 65 bytes -> [r, s, v]
    for (uint64 i = 0; i < sigs.length; i += 96) {
      bytes32 r = BytesLib.toBytes32(BytesLib.slice(sigs, i, 32));
      bytes32 s = BytesLib.toBytes32(BytesLib.slice(sigs, i + 32, 32));
      uint8 v = uint8(BytesLib.toUint(sigs, i + 64));
      address valTmp = ecrecover(h, v, r, s);
      bool noPass = false;
      // Unfortunately we need to loop through the cache to make sure there are
      // no signature duplicates. This is the most efficient way to do it since
      // storage costs too much.s
      // Make sure this address is a staker and NOT the proposer
      if (stakes[stakers[valTmp]].amount > 0 && valTmp != getProposer()) {
        for (uint64 j = 0; j < i / 96; j += 1) {
          if (passing[j] == valTmp) { noPass = true; }
        }
      }
      if (noPass == false) {
        passing[(i / 96)] = valTmp;
        passed ++;
      }
    }
    return passed;
  }

  function getStake(address a) public constant returns (uint256) {
    return stakes[stakers[a]].amount;
  }

  function getStakeIndex(address a) public constant returns (uint256) {
    return stakers[a];
  }

  function getLastBlock(address fromChain) public constant returns (uint256) {
    return lastBlock[fromChain];
  }

  // Sample a proposer. Likelihood of being chosen is proportional to stake size.
  // NOTE: This current design assumes
  function getProposer() public constant returns (address) {
    // Convert the seed to an index
    uint256 target = uint256(epochSeed) % stakeSum;
    // Index of stakes
    uint64 i = 1;
    // Total stake
    uint256 sum = 0;
    while (sum < target) {
      sum += stakes[i].amount;
      i += 1;
    }
    // Winner winner chicken dinner
    return stakes[i - 1].staker;
  }

  function getTokenMapping(address chain, address token)
  public constant returns (address) {
    return tokens[chain][token];
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

  // 'proof' is a concatenated set of [right][hash], i.e. 33 byte chunks
  function merkleProof(bytes32 leaf, bytes32 targetHash, bytes proof) private constant returns (bool) {
    bytes32 currentHash = leaf;
    for (uint i = 0; i < proof.length / 33; i++) {
      if (BytesLib.slice(proof, i*33, 1)[0] == 1) {
        currentHash = keccak256(currentHash, BytesLib.slice(proof, i * 33 + 1, 32));
      } else {
        currentHash = keccak256(BytesLib.slice(proof, i * 33 + 1, 32), currentHash);
      }
    }
    return currentHash == targetHash;
  }

  // Staking token can only be set at instantiation!
  function Bridge(address token) {
    admin = msg.sender;
    stakeToken = token;
  }

  modifier onlyAdmin() {
    require(msg.sender == admin);
    _;
  }

  function() public payable {}

}
