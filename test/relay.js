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
const rlp = require('rlp');
const blocks = require('./util/blocks.js');
const val = require('./util/val.js');
const Token = artifacts.require('EIP20.sol'); // EPM package
const Relay = artifacts.require('./Relay');
const EthereumTx = require('ethereumjs-tx');
const EthUtil = require('ethereumjs-util');

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
const relayABI = require('../build/contracts/Relay.json').abi;
const relayBytes = require('../build/contracts/Relay.json').bytecode;
const tokenABI = require('../build/contracts/EIP20.json').abi;
const tokenBytes = require('../build/contracts/EIP20.json').bytecode;
const merkleLibBytes = require('../build/contracts/MerklePatriciaProof.json').bytecode;

// Global variables (will be references throughout the tests)
let wallets;
let stakingToken;
let tokenA;
let tokenB;
let relayA;
let relayB;
let merkleLibBAddr;
let deposit;
let depositBlock;
let headers;
let headerRoot;
let sigs = [];
let gasPrice = 10 ** 9;
let successfulTxs = [];

// Parameters that can be changed throughout the process
let proposer;

// left-pad half-bytes
function ensureByte(s) {
  if (s.substr(0, 2) == '0x') { s = s.slice(2); }
  if (s.length % 2 == 0) { return `0x${s}`; }
  else { return `0x0${s}`; }
}

contract('Relay', (accounts) => {
  assert(accounts.length > 0);
  function isEVMException(err) {
    return err.toString().includes('VM Exception');
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


  describe('Wallets', () => {
    it('Should create wallets for first 4 accounts', async () => {
      wallets = generateFirstWallets(4, [], 0);
      assert(wallets.length == 4);
    })
  })

  describe('Admin: Relay setup', () => {
    it('Should create a token on chain A and give it out to accounts 1-3', async () => {
      stakingToken = await Token.new(1000, 'Staking', 0, 'STK', { from: accounts[0] });
      await stakingToken.transfer(accounts[1], 100);
      await stakingToken.transfer(accounts[2], 100);
      await stakingToken.transfer(accounts[3], 100);
    });

    it('Should create the relay with the token as the staking token', async () => {
      relayA = await Relay.new(stakingToken.address, { from: accounts[0] });
      const admin = await relayA.admin();
      assert(admin == accounts[0]);
    });

    it('Should set the validator threshold to 3', async () => {
      await relayA.updateValidatorThreshold(3);
      const thresh = await relayA.validatorThreshold();
      assert(parseInt(thresh) === 3);
    })

    it('Should give a small amount of ether to the relay', async () => {
      await web3A.eth.sendTransaction({
        to: relayA.address,
        value: 10 ** 17,
        from: accounts[0]
      });
    });

    it('Should set the reward parameters of the relay', async () => {
      const BASE = 10 ** 16;
      await relayA.updateReward(BASE, 0, BASE, { from: accounts[0] });
      const maxReward = await relayA.maxReward();
      assert(maxReward == BASE);
    });

    it('Should stake via accounts[1]', async () => {
      await stakingToken.approve(relayA.address, 1, { from: accounts[1] });
      await relayA.stake(1, { from: accounts[1] });
      const stakeSumTmp = await relayA.stakeSum();
      assert(parseInt(stakeSumTmp) === 1);
    });

    it('Should stake via accounts[2]', async () => {
      await stakingToken.approve(relayA.address, 10, { from: accounts[2] });
      await relayA.stake(10, { from: accounts[2] });
      const stakeSumTmp = await relayA.stakeSum();
      assert(parseInt(stakeSumTmp) === 11);
    });

    it('Should stake via accounts[3]', async () => {
      await stakingToken.approve(relayA.address, 100, { from: accounts[3] });
      await relayA.stake(100, { from: accounts[3] });
      const stakeSumTmp = await relayA.stakeSum();
      assert(parseInt(stakeSumTmp) === 111);
    });

    it('Should destake a small amount from accounts[3]', async () => {
      await relayA.destake(1, { from: accounts[3] });
      const stakeSumTmp = await relayA.stakeSum();
      assert(parseInt(stakeSumTmp) === 110);
    })

    it('Should get the proposer and make sure it is a staker', async () => {
      const seed = await relayA.epochSeed();
      let stakeSum = await relayA.stakeSum();
      stakeSum = parseInt(stakeSum);
      proposer = await relayA.getProposer();
      assert(proposer === accounts[1] || proposer === accounts[2] || proposer === accounts[3]);
    });

    it('Should deploy MerkleLib and use it to deploy a relay on chain B', async () => {
      // Deploy the library
      const libReceipt = await web3B.eth.sendTransaction({
        from: accounts[0],
        data: merkleLibBytes,
        gas: 3000000,
      });
      merkleLibBAddr = libReceipt.contractAddress.slice(2).toLowerCase();
      const relayBytesB = relayBytes.replace(/_+MerkleLib_+/g, merkleLibBAddr);
      const receipt = await web3B.eth.sendTransaction({
        from: accounts[0],
        data: relayBytesB,
        gas: 7000000,
      });
      assert(receipt.blockNumber >= 0);
      relayB = await new web3B.eth.Contract(relayABI, receipt.contractAddress);
      assert(receipt.contractAddress === relayB.options.address);
      relayB.setProvider(providerB);
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
        await relayA.addToken(tokenA.address, tokenB.options.address, relayB.options.address)
      } catch (err) {
        assert(isEVMException(err) === true);
      }
    });

    it('Should map token on chain A to the one on chain B', async () => {
      await tokenA.approve(relayA.address, 1000);
      await relayA.addToken(tokenA.address, tokenB.options.address, relayB.options.address)
    });

    it('Should map token on chainB to the one on chain A', async () => {
      await relayB.methods.associateToken(tokenA.address, tokenB.options.address, relayA.address)
        .send({ from: accounts[0] });
      const associatedToken = await relayB.methods.getTokenMapping(relayA.address, tokenB.options.address).call();
      assert(associatedToken.toLowerCase() == tokenA.address.toLowerCase());
    })

    it('Should ensure the relay on chain A has all of the mapped token', async () => {
      const supply = await tokenA.totalSupply();
      const held = await tokenA.balanceOf(relayA.address);
      assert(parseInt(supply) === parseInt(held));
    });

    it('Should give 5 token B to accounts[1]', async () => {
      await tokenB.methods.transfer(accounts[1], 5).send({ from: accounts[0] })
      const balance = await tokenB.methods.balanceOf(accounts[1]).call();
      assert(parseInt(balance) === 5);
    });
  });

  describe('User: Deposit tokens on chain B', () => {
    it('Should deposit 5 token B to the relay on chain B', async () => {
      await tokenB.methods.approve(relayB.options.address, 5).send({ from: accounts[1] })
      const allowance = await tokenB.methods.allowance(accounts[1], relayB.options.address).call();
      const _deposit = await relayB.methods.deposit(tokenB.options.address, relayA.address, 5)
        .send({ from: accounts[1] })
      const balance = await tokenB.methods.balanceOf(accounts[1]).call();
      //assert(parseInt(balance) === 0);
      deposit = await web3B.eth.getTransaction(_deposit.transactionHash);
      depositBlock = await web3B.eth.getBlock(_deposit.blockHash, true);
      successfulTxs.push(_deposit.transactionHash)
    });
  })

  describe('Stakers: Relay blocks', () => {
    let start;
    let end;
    let sigData;

    it('Should form a Merkle tree from the last four block headers, get signatures, and submit to chain A', async () => {
      start = depositBlock.number - 3;
      end = depositBlock.number;
      headers = await blocks.getHeaders(start, end, web3B);
      headerRoot = blocks.getRoot(headers);
      assert(headerRoot != null);
    });

    /*it('Should get signatures from stakers for proposed header root and check them', async () => {
      // Sign and store
      const msg = val.getMsg(headerRoot, relayB.options.address, start, end);
      let sigs = [];
      for (let i = 1; i < wallets.length; i++) {
        if (wallets[i][0] != proposer) {
          sigs.push(val.sign(msg, wallets[i]));
        }
      }
      sigData = val.formatSigs(sigs);
      const passing = await relayA.checkSignatures(headerRoot, relayB.options.address, start, end, sigData);
      assert(passing === true);
    });

    it('Should submit header and sigs to chain A', async () => {
      let i;
      accounts.forEach((account, _i) => {
        if (account == proposer) { i = _i; }
      })
      const bountyStart = await web3A.eth.getBalance(relayA.address);
      const proposerStart = await web3A.eth.getBalance(accounts[i]);

      const receipt = await relayA.proposeRoot(headerRoot, relayB.options.address, start, end, sigData,
        { from: accounts[i], gasPrice: gasPrice });
      const bountyEnd = await web3A.eth.getBalance(relayA.address);
      const proposerEnd = await web3A.eth.getBalance(proposer);
      const gasCost = receipt.receipt.gasUsed * gasPrice;

      // Make sure the proposer got the payout. There will be rounding errors from
      // JS so just check that it's within 10,000 wei
      const diffBounty = Math.round((bountyStart - bountyEnd) / 10000);
      const diffProposer = Math.round((proposerEnd - proposerStart + gasCost) / 10000);
      assert(diffBounty === diffProposer);
    });*/
  })

  describe('User: Withdraw tokens on chain A', () => {

    it('Should check that the deposit txParams hash was signed by accounts[1]', async () => {
      const unsignedDeposit = deposit;
      unsignedDeposit.value = '';
      unsignedDeposit.gasPrice = parseInt(deposit.gasPrice);
      const ethtx = new EthereumTx(unsignedDeposit);
      const ethtxhash = ethtx.hash(false);
      const signingV = parseInt(deposit.standardV) + 27;

      const signerPub = EthUtil.ecrecover(ethtxhash, signingV, deposit.r, deposit.s)
      const signer = EthUtil.pubToAddress(signerPub).toString('hex');
      assert(`0x${signer}` === accounts[1]);
    });


   it('Should prepare the withdrawal with the transaction data (accounts[1])', async () => {
      const proof = await txProof.build(deposit, depositBlock);
      const path = ensureByte(rlp.encode(proof.path).toString('hex'));
      const parentNodes = ensureByte(rlp.encode(proof.parentNodes).toString('hex'));

      const nonce = ensureByte(`0x${parseInt(deposit.nonce).toString(16)}`);
      const gasPrice = ensureByte(`0x${parseInt(deposit.gasPrice).toString(16)}`);
      const gas = ensureByte(`0x${parseInt(deposit.gas).toString(16)}`);

      // Make sure we are RLP encoding the transaction correctly. `encoded` corresponds
      // to what Solidity calculates.
      const encodedTest = rlp.encode([nonce, gasPrice, gas, relayB.options.address, '', deposit.input, deposit.v, deposit.r, deposit.s]).toString('hex');
      const encodedValue = rlp.encode(proof.value).toString('hex');
      assert(encodedTest == encodedValue, 'Tx RLP encoding incorrect');

      // Check the proof in JS first
      const checkpoint = txProof.verifyTx(proof);
      assert(checkpoint === true);

      // Get the network version
      const version = parseInt(deposit.chainId);


      const test = await relayA.prepWithdraw(nonce, gasPrice, gas, deposit.v, deposit.r, deposit.s,
        [deposit.to, tokenB.options.address, relayA.address], 5,
        depositBlock.transactionsRoot, path, parentNodes, version, { from: accounts[1], gas: 500000 });
      assert(test.receipt.gasUsed < 500000);
      console.log('prepWithdraw gas usage:', test.receipt.gasUsed);
    })

    it('Should prove the state root', () => {

    });

    it('Should submit the required data and make the withdrwal', () => {

    });
  });
});
