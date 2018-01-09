const bip39 = require('bip39');
const hdkey = require('ethereumjs-wallet/hdkey');
const leftPad = require('left-pad');
const secrets = require('../secrets.json');
const sha3 = require('solidity-sha3').default;
const util = require('ethereumjs-util');
const truffleConf = require('../truffle.js').networks;
const Web3 = require('web3');

const Token = artifacts.require('HumanStandardToken.sol'); // EPM package
const Relay = artifacts.require('./Relay');

// Need two of these
const providerA = `http://${truffleConf.development.host}:${truffleConf.development.port}`;
const web3A = new Web3(new Web3.providers.HttpProvider(providerA));
const providerB = `http://${truffleConf.developmentB.host}:${truffleConf.developmentB.port}`;
const web3B = new Web3(new Web3.providers.HttpProvider(providerB));

// Global variables (will be references throughout the tests)
let stakingToken;
let tokenA;
let tokenB;
let relayA;
let relayB;

contract('Relay', (accounts) => {
  assert(accounts.length > 0);

  describe('Admin: Relay setup', () => {
    it('Should create a token on chain A and give it out to accounts 1-3', async () => {
      stakingToken = await Token.new(1000, 'Staking', 0, 'STK', { from: accounts[0] });
      await stakingToken.transfer(accounts[1], 100);
      await stakingToken.transfer(accounts[2], 100);
      await stakingToken.transfer(accounts[3], 100);
    });

    it('Should create the relay with the token as the staking token', async () => {
      relayA = await Relay.new(stakingToken.address, { from: accounts[0] });
    });

    it('Should give a small amount of ether to the relay', async () => {
      await web3A.eth.sendTransaction({
        to: relayA.address,
        value: 10 ** 17,
        from: accounts[0]
      });
    });

    it('Should set the reward parameters of the relay', async () => {

    });

    it('Should stake via accounts[1]', async () => {

    });

    it('Should stake via accounts[2]', async () => {

    });

    it('Should stake via accounts[3]', async () => {

    });

    it('Should get the proposer and make sure it is a staker', async () => {

    });

    it('Should create a relay on chain B', async () => {

    });
  });

  describe('Admin: Token mapping', () => {
    it('Should create a new token (token B) on chain B', async () => {

    });

    it('Should create a new token (token A) on chain A', async () => {

    });

    it('Should map token on chain A to the one on chain B', async () => {

    });

    it('Should ensure the relay on chain A has all of the mapped token', async () => {

    });

    it('Should give 5 token B to accounts[1]', async () => {

    });
  });

  describe('User: Deposit tokens on chain B', () => {
    it('Should deposit 5 token B to the relay on chain B', async () => {

    });

    it('Should ensure the tokens were successfully deposited', async () => {

    });
  })

  describe('Stakers: Relay blocks', () => {
    it('Should form a Merkle tree from the last two block headers, get signatures, and submit to chain A', async () => {

    });
  })

  describe('User: Withdraw tokens on chain A', () => {
    it('Should prepare the withdrawal with the transaction data (accounts[1])', async () => {

    });

    it('Should get the transaction Merkle proof for the submitted transaction', () => {

    });

    it('Should get the block header Merkle proof for the relayed header root',  () => {

    });

    it('Should submit the required data and make the withdrwal', () => {

    });
  });
});
