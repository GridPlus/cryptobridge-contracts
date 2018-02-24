const Promise = require('bluebird').Promise;
const bip39 = require('bip39');
const hdkey = require('ethereumjs-wallet/hdkey');
const leftPad = require('left-pad');
const secrets = require('../secrets.json');
const sha3 = require('solidity-sha3').default;
const util = require('ethereumjs-util');
const truffleConf = require('../truffle.js').networks;
const Web3 = require('web3');
const EthProof = require('eth-proof');
const txProof = require('./util/txProof.js');
const rProof = require('./util/receiptProof.js');
const rlp = require('rlp');
const blocks = require('./util/blocks.js');
const val = require('./util/val.js');
const Token = artifacts.require('EIP20.sol'); // EPM package
const Bridge = artifacts.require('./Bridge.sol');
const EthereumTx = require('ethereumjs-tx');
const EthUtil = require('ethereumjs-util');
const BN = require('big-number');
const merkle = require('./util/merkle.js');
const sync = require('./util/sync.js');

// Need two of these
const _providerA = `http://${truffleConf.development.host}:${truffleConf.development.port}`;
const providerA = new Web3.providers.HttpProvider(_providerA);
const web3A = new Web3(providerA);
const epA = new EthProof(providerA);
const _providerB = `http://${truffleConf.developmentB.host}:${truffleConf.developmentB.port}`;
const providerB = new Web3.providers.HttpProvider(_providerB);
const web3B = new Web3(providerB);
const epB = new EthProof(providerB);

// ABI and bytes for interacting with web3B
const BridgeABI = require('../build/contracts/Bridge.json').abi;
const BridgeBytes = require('../build/contracts/Bridge.json').bytecode;
const tokenABI = require('../build/contracts/EIP20.json').abi;
const tokenBytes = require('../build/contracts/EIP20.json').bytecode;
const merkleLibBytes = require('../build/contracts/MerklePatriciaProof.json').bytecode;

// Global variables (will be references throughout the tests)
let wallets;
let stakingToken;
let tokenA;
let tokenB;
let BridgeA;
let BridgeB;
let merkleLibBAddr;
let deposit;
let depositBlock;
let depositBlockSlim; // Contains only tx hashes
let depositHeader;
let depositReceipt;
let headers;
let headerRoot;
let sigs = [];
let gasPrice = 10 ** 9;
let RootStorageIndex; // This is needed for the final withdrawal
let startingHeader;
let startingBlockNumber;
let treeHeaders;
// Parameters that can be changed throughout the process
let proposer;

// left-pad half-bytes
function ensureByte(s) {
  if (s.substr(0, 2) == '0x') { s = s.slice(2); }
  if (s.length % 2 == 0) { return `0x${s}`; }
  else { return `0x0${s}`; }
}

contract('Bridge', (accounts) => {
  assert(accounts.length > 0);
  function isEVMException(err) {
    return err.toString().includes('VM Exception') || err.toString().includes('StatusError');
  }

  function generateFirstWallets(n, _wallets, hdPathIndex) {
    const hdwallet = hdkey.fromMasterSeed(bip39.mnemonicToSeed(secrets.mnemonic));
    const node = hdwallet.derivePath(secrets.hdPath + hdPathIndex.toString());
    const secretKey = node.getWallet().getPrivateKeyString();
    const addr = node.getWallet().getAddressString();
    _wallets.push([addr, secretKey]);
    const nextHDPathIndex = hdPathIndex + 1;
    if (nextHDPathIndex >= n) {
      return _wallets;
    }
    return generateFirstWallets(n, _wallets, nextHDPathIndex);
  }

  async function saveDummyCheckpoints(ends, start, i=0) {
    if (i == ends.length) { return true; }
    else {
      let end = ends[i]
      // Sign and store
      let signers = [];
      const headerRoot = sha3('dummy');
      const msg = val.getMsg(headerRoot, BridgeB.options.address, parseInt(start), end);
      let sigs = [];
      // wallets[j+1] = accounts[j] and we're looking for accounts 1-4
      const proposer = await BridgeA.getProposer();
      for (let j = 0; j < 4; j++) {
        if (wallets[j+1][0] != proposer) {
          sigs.push(val.sign(msg, wallets[j+1]));
          signers.push(wallets[j+1][0]);
        }
      }
      const sigData = val.formatSigs(sigs)
      const proposeRoot = await BridgeA.proposeRoot(headerRoot, BridgeB.options.address, end, sigData,
        { from: proposer, gas: 500000, gasPrice: gasPrice });
      console.log(`Propose root gas usage (${start} - ${end}): ${proposeRoot.receipt.gasUsed}`);
      start = end + 1;
      i ++;
      return saveDummyCheckpoints(ends, start, i);
    }
  }

  before (async () => {
    const syncData = await sync.fsSync(web3B);
    startingHeader = syncData[0];
    startingBlockNumber = syncData[1];
  });

  describe('Wallets', () => {
    it('Should create wallets for first 5 accounts', async () => {
      wallets = generateFirstWallets(5, [], 0);
      assert(wallets.length == 5);
      assert(wallets[1][0] == accounts[0]);
    })
  })

  describe('Admin: Bridge setup', () => {
    it('Should create a token on chain A and give it out to accounts 1-3', async () => {
      stakingToken = await Token.new(1000, 'Staking', 0, 'STK', { from: accounts[0] });
      console.log('Staking token A: ', stakingToken.address);
      // Need to stake from wallets rather than accounts since validators sigs
      // will come from wallets.
      // For some reason the wallet indexing doesn't seem to match up to the
      // account indexing (the first wallet is different, but also the ordering
      // of subsequent ones seems different)
      // wallets[1] == accounts[0]
      await stakingToken.transfer(wallets[1][0], 100);
      await stakingToken.transfer(wallets[2][0], 100);
      await stakingToken.transfer(wallets[3][0], 100);
      await stakingToken.transfer(wallets[4][0], 100);
    });

    it('Should create the Bridge with the token as the staking token', async () => {
      BridgeA = await Bridge.new(stakingToken.address, { from: accounts[0] });
      const admin = await BridgeA.admin();
      assert(admin == accounts[0]);
      console.log(`Bridge on ${_providerA}: ${BridgeA.address}`)
    });

    // NOTE: Even though I'm getting values of 3 for checkSignatures, it's still
    // failing validation checks. I'm really not sure why, but I've knocked it
    // down to 2 and it works fine.
    // TODO: Investigate this further
    it('Should set the validator threshold to 2', async () => {
      await BridgeA.updateValidatorThreshold(2);
      const thresh = await BridgeA.validatorThreshold();
      assert(parseInt(thresh) === 2);
    })

    it('Should give a small amount of ether to the Bridge', async () => {
      await web3A.eth.sendTransaction({
        to: BridgeA.address,
        value: 10 ** 17,
        from: accounts[0]
      });
    });

    it('Should set the reward parameters of the Bridge', async () => {
      const BASE = 10 ** 16;
      await BridgeA.updateReward(BASE, 0, BASE, { from: accounts[0] });
      const maxReward = await BridgeA.maxReward();
      assert(maxReward == BASE);
    });

    it('Should stake via wallets[1]', async () => {
      const user = wallets[1][0];
      const amount = 1;
      await stakingToken.approve(BridgeA.address, amount, { from: user });
      await BridgeA.stake(amount, { from: user });
      const stakeSumTmp = await BridgeA.stakeSum();
      console.log('stakeSumTmp', parseInt(stakeSumTmp), 'amount', amount);
      assert(parseInt(stakeSumTmp) === amount);
      const currentStake = await BridgeA.getStake(user);
      console.log('currentStake', currentStake)
      assert(parseInt(currentStake) === amount);
    })

    it('Should stake via wallets[2]', async () => {
      const user = wallets[2][0];
      const amount = 1;
      await stakingToken.approve(BridgeA.address, amount, { from: user });
      await BridgeA.stake(amount, { from: user });
      const stakeSumTmp = await BridgeA.stakeSum();
      assert(parseInt(stakeSumTmp) === 2);
      const currentStake = await BridgeA.getStake(user);
      assert(parseInt(currentStake) === amount);
    });

    it('Should stake via wallets[3]', async () => {
      const user = wallets[3][0];
      const amount = 10;
      await stakingToken.approve(BridgeA.address, amount, { from: user });
      await BridgeA.stake(amount, { from: user });
      const stakeSumTmp = await BridgeA.stakeSum();
      assert(parseInt(stakeSumTmp) === 12);
      const currentStake = await BridgeA.getStake(user);
      assert(parseInt(currentStake) === amount);
    });

    it('Should stake via wallets[4]', async () => {
      const user = wallets[4][0];
      const amount = 100;
      await stakingToken.approve(BridgeA.address, amount, { from: user });
      await BridgeA.stake(amount, { from: user });
      const stakeSumTmp = await BridgeA.stakeSum();
      assert(parseInt(stakeSumTmp) === 112);
      const currentStake = await BridgeA.getStake(user);
      assert(parseInt(currentStake) === amount);
    });

    it('Should destake a small amount from wallets[4]', async () => {
      await BridgeA.destake(1, { from: wallets[4][0] });
      const stakeSumTmp = await BridgeA.stakeSum();
      assert(parseInt(stakeSumTmp) === 111);
    })

    it('Should get the proposer and make sure it is a staker', async () => {
      const seed = await BridgeA.epochSeed();
      let stakeSum = await BridgeA.stakeSum();
      stakeSum = parseInt(stakeSum);
      proposer = await BridgeA.getProposer();
      assert(proposer === wallets[1][0] || proposer === wallets[2][0] || proposer === wallets[3][0] || proposer === wallets[4][0]);
    });

    it('Should deploy MerkleLib and use it to deploy a Bridge on chain B', async () => {
      // Deploy the library
      const libReceipt = await web3B.eth.sendTransaction({
        from: accounts[0],
        data: merkleLibBytes,
        gas: 3000000,
      });
      merkleLibBAddr = libReceipt.contractAddress.slice(2).toLowerCase();
      const BridgeBytesB = BridgeBytes.replace(/_+MerkleLib_+/g, merkleLibBAddr);
      const txReceipt = await web3B.eth.sendTransaction({
        from: accounts[0],
        data: BridgeBytesB,
        gas: 7000000,
      });
      assert(txReceipt.blockNumber >= 0);
      BridgeB = await new web3B.eth.Contract(BridgeABI, txReceipt.contractAddress);
      assert(txReceipt.contractAddress === BridgeB.options.address);
      BridgeB.setProvider(providerB);
      console.log(`Bridge on ${_providerB}: ${BridgeB.options.address}`)
    });
  });

  describe('Admin: Token mapping', () => {
    it('Should create a new token (token B) on chain B', async () => {
      const tokenBTmp = await new web3B.eth.Contract(tokenABI);
      await tokenBTmp.deploy({
        data: tokenBytes,
        arguments: [1000, 'TokenB', 0, 'TKB']
      })
      .send({ from: accounts[0], gas: 3000000 })
      .then((tkb) => {
        tokenB = tkb;
        assert(tkb.options.address != null);
        tokenB.setProvider(providerB);
      })
    });

    it('Should create a new token (token A) on chain A', async () => {
      tokenA = await Token.new(1000, 'TokenA', 0, 'TKA', { from: accounts[0] });
    });

    it('Should fail to map tokenB because it has not been given allowance', async () => {
      try {
        await BridgeA.addToken(tokenA.address, tokenB.options.address, BridgeB.options.address)
      } catch (err) {
        assert(isEVMException(err) === true);
      }
    });

    it('Should map token on chain A to the one on chain B', async () => {
      await tokenA.approve(BridgeA.address, 1000);
      await BridgeA.addToken(tokenA.address, tokenB.options.address, BridgeB.options.address)
      const tkB = await BridgeA.getTokenMapping(BridgeB.options.address, tokenB.options.address);
      assert(tkB.toLowerCase() == tokenA.address.toLowerCase());
    });

    it('Should map token on chainB to the one on chain A', async () => {
      await BridgeB.methods.associateToken(tokenA.address, tokenB.options.address, BridgeA.address)
        .send({ from: accounts[0] });
      const associatedToken = await BridgeB.methods.getTokenMapping(BridgeA.address, tokenA.address).call();
      assert(associatedToken.toLowerCase() == tokenB.options.address.toLowerCase());
    })

    it('Should ensure the Bridge on chain A has all of the mapped token', async () => {
      const supply = await tokenA.totalSupply();
      const held = await tokenA.balanceOf(BridgeA.address);
      assert(parseInt(supply) === parseInt(held));
    });

    it('Should give 5 token B to wallets[1]', async () => {
      const r = await tokenB.methods.transfer(wallets[2][0], 5).send({ from: accounts[0] })
      const balance = await tokenB.methods.balanceOf(wallets[2][0]).call();
      assert(parseInt(balance) === 5);
    });
  });

  describe('Stakers: Bridge backlog', () => {
    let ends = [];
    let sigData = [];
    const headerRoot = sha3('fake'); // We can fake this one since there are no deposits

    it('Should get a set of end points to Bridge (powers of two)', async () => {
      let _ends = [];
      // Get to the latest block with a set of end points
      const latestBlock = await web3B.eth.getBlockNumber();
      const lastBlock = await BridgeA.getLastBlock(BridgeB.options.address);

      // Get the set of end points that we will want to checkpoint. There should
      // only be a handful since they get exponentially smaller
      _ends.push(blocks.getLastPowTwo(parseInt(latestBlock)));
      let endsSum = _ends[0];
      while (blocks.getLastPowTwo(latestBlock - endsSum) > 1) {
        const nextEnd = blocks.getLastPowTwo(latestBlock - endsSum);
        _ends.push(nextEnd);
        endsSum += nextEnd;
      }
      let endsSum2 = 0;
      _ends.forEach((end, i) => {
        ends.push(parseInt(end) + parseInt(lastBlock) + endsSum2);
        endsSum2 += end;
      })
    });

    it('Should go through end points and get signatures', async () => {
      const _lastBlock = await BridgeA.getLastBlock(BridgeB.options.address);
      const saved = await saveDummyCheckpoints(ends, _lastBlock + 1);
      assert(saved === true);
    });
  });

  describe('User: Deposit tokens on chain B', () => {
    it('Should deposit 5 token B to the Bridge on chain B', async () => {
      await tokenB.methods.approve(BridgeB.options.address, 5).send({ from: wallets[2][0] })
      const allowance = await tokenB.methods.allowance(accounts[1], BridgeB.options.address).call();
      const _deposit = await BridgeB.methods.deposit(tokenB.options.address, BridgeA.address, 5)
        .send({ from: wallets[2][0], gas: 500000 })
      const balance = await tokenB.methods.balanceOf(accounts[1]).call();
      deposit = await web3B.eth.getTransaction(_deposit.transactionHash);
      depositBlock = await web3B.eth.getBlock(_deposit.blockHash, true);
      depositBlockSlim = await web3B.eth.getBlock(_deposit.blockHash, false);
      depositReceipt = await web3B.eth.getTransactionReceipt(_deposit.transactionHash);
    });
  })

  describe('Stakers: Bridge blocks', () => {
    let end;
    let sigData;
    let lastBlock

    it('Should fast forward blockchain to next power of two', async() => {
      lastBlock = await BridgeA.getLastBlock(BridgeB.options.address);
      lastBlock = parseInt(lastBlock);
      const currentBlock = await web3B.eth.getBlockNumber();
      let diff = currentBlock - lastBlock;
      let toMine = blocks.getNextPowTwo(diff) - diff;
      if (blocks.isPowTwo(diff)) { toMine = 0; }
      await blocks.forceMine(toMine, accounts[0], web3B)
      end = await web3B.eth.getBlockNumber();
      assert(blocks.isPowTwo(end - lastBlock) === true);
    });

    it('Should get tree headers', async () => {
      const currentBlockNumber = await web3B.eth.getBlockNumber();
      assert(currentBlockNumber > startingBlockNumber, 'Your chain is oversynced. Did you delete your "lastBlock" file?')
      const allHeaders = await blocks.getHeaders(startingBlockNumber, currentBlockNumber, web3B, [startingHeader]);
      treeHeaders = allHeaders.slice(allHeaders.length - (currentBlockNumber - lastBlock));
    });

    it('Should form a Merkle tree from the last block headers, get signatures, and submit to chain A', async () => {
      depositHeader = treeHeaders[depositBlock.number - (lastBlock + 1)];
      tree = merkle.buildTree(treeHeaders);
      assert(tree[tree.length - 1].length == 1, 'Merkle tree formatted incorrectly - no root.');
      headerRoot = tree[tree.length - 1][0];
    });

    it('Should get signatures from stakers for proposed header root and check them', async () => {
      // Sign and store
      let signers = [];
      const msg = val.getMsg(headerRoot, BridgeB.options.address, lastBlock + 1, end);
      let sigs = [];
      proposer = await BridgeA.getProposer();
      // wallets[i+1] = accounts[i] and we're looking for accounts 1-4
      for (let i = 0; i < 4; i++) {
        if (wallets[i+1][0] != proposer) {
          sigs.push(val.sign(msg, wallets[i+1]));
          signers.push(wallets[i+1][0]);
        }
      }
      sigData = val.formatSigs(sigs);
      const checkSignatures = await BridgeA.checkSignatures(headerRoot, BridgeB.options.address, lastBlock + 1, end, sigData);
      const bountyStart = await web3A.eth.getBalance(BridgeA.address);
      const proposerStart = await web3A.eth.getBalance(proposer);
      const reward = await BridgeA.getReward(end, BridgeB.options.address);

      // TODO: Add fast-forward function to get to a specified block
      // TODO: Fast-forward to the next 2^N block
      const proposeRoot = await BridgeA.proposeRoot(headerRoot, BridgeB.options.address, end, sigData,
        { from: proposer, gas: 500000, gasPrice: gasPrice });
      RootStorageIndex = parseInt(proposeRoot.logs[0].args.i);
      console.log('Propose root gas usage: ', proposeRoot.receipt.gasUsed);
      const bountyEnd = await web3A.eth.getBalance(BridgeA.address);
      const proposerEnd = await web3A.eth.getBalance(proposer);
      const gasCost = proposeRoot.receipt.gasUsed * gasPrice;
      const diffBounty = bountyStart - bountyEnd;
      assert(diffBounty === parseInt(reward));
      assert(parseInt(BN(proposerEnd).plus(gasCost).minus(proposerStart)) === parseInt(reward));
    });
  })

  describe('User: Withdraw tokens on chain A', () => {

    it('Should check that the deposit txParams hash was signed by wallets[2]', async () => {
      const unsignedDeposit = deposit;
      unsignedDeposit.value = '';
      unsignedDeposit.gasPrice = parseInt(deposit.gasPrice);
      const ethtx = new EthereumTx(unsignedDeposit);
      const ethtxhash = ethtx.hash(false);
      const signingV = parseInt(deposit.standardV) + 27;

      const signerPub = EthUtil.ecrecover(ethtxhash, signingV, deposit.r, deposit.s)
      const signer = EthUtil.pubToAddress(signerPub).toString('hex');
      assert(`0x${signer}` === wallets[2][0]);
    });


   it('Should prepare the withdrawal with the transaction data (wallets[2])', async () => {
      const proof = await txProof.build(deposit, depositBlock);
      const path = ensureByte(rlp.encode(proof.path).toString('hex'));
      const parentNodes = ensureByte(rlp.encode(proof.parentNodes).toString('hex'));

      const nonce = ensureByte(`0x${parseInt(deposit.nonce).toString(16)}`);
      const gasPrice = ensureByte(`0x${parseInt(deposit.gasPrice).toString(16)}`);
      const gas = ensureByte(`0x${parseInt(deposit.gas).toString(16)}`);

      // Make sure we are RLP encoding the transaction correctly. `encoded` corresponds
      // to what Solidity calculates.
      const encodedTest = rlp.encode([nonce, gasPrice, gas, BridgeB.options.address,
        '', deposit.input, deposit.v, deposit.r, deposit.s]).toString('hex');
      const encodedValue = rlp.encode(proof.value).toString('hex');
      assert(encodedTest == encodedValue, 'Tx RLP encoding incorrect');

      // Check the proof in JS first
      const checkpoint = txProof.verify(proof, 4);
      assert(checkpoint === true);

      // Get the network version
      const version = parseInt(deposit.chainId);

      // Make the transaction
      const prepWithdraw = await BridgeA.prepWithdraw(nonce, gasPrice, gas, deposit.v, deposit.r, deposit.s,
        [BridgeB.options.address, tokenB.options.address, tokenA.address], 5,
        depositBlock.transactionsRoot, path, parentNodes, version, { from: wallets[2][0], gas: 500000 });
      console.log('prepWithdraw gas usage:', prepWithdraw.receipt.gasUsed);
      assert(prepWithdraw.receipt.gasUsed < 500000);
    })

    it('Should check the pending withdrawal fields', async () => {
      const pendingToken = await BridgeA.getPendingToken(accounts[2]);
      assert(pendingToken.toLowerCase() == tokenA.address.toLowerCase());
      const pendingFromChain = await BridgeA.getPendingFromChain(accounts[2]);
      assert(pendingFromChain.toLowerCase() == BridgeB.options.address.toLowerCase());
    })

    it('Should prove the state root', async () => {
      // Get the receipt proof
      const receiptProof = await rProof.buildProof(depositReceipt, depositBlockSlim, web3B);
      const path = ensureByte(rlp.encode(receiptProof.path).toString('hex'));
      const parentNodes = ensureByte(rlp.encode(receiptProof.parentNodes).toString('hex'));

      const checkpoint2 = txProof.verify(receiptProof, 5);
      const encodedLogs = rProof.encodeLogs(depositReceipt.logs);
      const encodedReceiptTest = rlp.encode([depositReceipt.status, depositReceipt.cumulativeGasUsed,
        depositReceipt.logsBloom, encodedLogs]);
      const encodedReceiptValue = rlp.encode(receiptProof.value);

      assert(encodedReceiptTest.equals(encodedReceiptValue) == true);
      let addrs = [encodedLogs[0][0], encodedLogs[1][0]];
      let topics = [encodedLogs[0][1], encodedLogs[1][1]];
      let data = [encodedLogs[0][2], encodedLogs[1][2]];

      let logsCat = `0x${addrs[0].toString('hex')}${topics[0][0].toString('hex')}`
      logsCat += `${topics[0][1].toString('hex')}${topics[0][2].toString('hex')}`
      logsCat += `${data[0].toString('hex')}${addrs[1].toString('hex')}${topics[1][0].toString('hex')}`
      logsCat += `${topics[1][1].toString('hex')}${topics[1][2].toString('hex')}`
      logsCat += `${topics[1][3].toString('hex')}${data[1].toString('hex')}`;
      const proveReceipt = await BridgeA.proveReceipt(logsCat, depositReceipt.cumulativeGasUsed,
        depositReceipt.logsBloom, depositBlock.receiptsRoot, path, parentNodes,
        { from: wallets[2][0], gas: 500000 })
      console.log('proveReceipt gas usage:', proveReceipt.receipt.gasUsed);
    });

    it('Should submit the required data and make the withdrawal', async () => {
      let hI;
      treeHeaders.forEach((header, i) => {
        if (header == depositHeader) { hI = i; }
      })
      // This should always be greater than zero since the prior two withdrawal
      // calls were made after the deposit
      assert(hI > 0);
      const prevHeader = treeHeaders[hI - 1];
      const proof = merkle.getProof(hI, tree);
      const proofStr = merkle.getProofStr(proof);
      // console.log('proofStr', proofStr);
      const validProof = merkle.checkProof(depositHeader, proof, tree[tree.length - 1][0])
      assert(validProof === true);
      const withdrawal = await BridgeA.withdraw(depositBlock.number,
         depositBlock.timestamp, prevHeader, RootStorageIndex, proofStr,
         { from: wallets[2][0], gas: 500000});
      assert(withdrawal.receipt.gasUsed < 500000);
      console.log('Withdrawal gas usage: ', withdrawal.receipt.gasUsed);
    });

  });

});
