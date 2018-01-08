const bip39 = require('bip39');
const hdkey = require('ethereumjs-wallet/hdkey');
const leftPad = require('left-pad');
const secrets = require('../secrets.json');
const sha3 = require('solidity-sha3').default;
const util = require('ethereumjs-util');
const truffleConf = require('../truffle.js').networks;
const Web3 = require('web3');
const provider = `http://${truffleConf.development.host}:${truffleConf.development.port}`;
const web3 = new Web3(new Web3.providers.HttpProvider(provider));

contract('Relay', (accounts) => {
  assert(accounts.length > 0);

  describe('Admin: Relay setup', () => {
    it('Should create a token on chain A', async () => {

    });

    it('Should create the relay with the token as the stkaing token', async () => {

    });

    it('Should give a small amount of ether to the relay', async () => {

    });

    it('Should set the reward parameters of the relay', async () => {

    });

    it('Should give tokens to accounts[1]', async () => {

    });

    it('Should give tokens to accounts[2]', async () => {

    });

    it('Should give tokens to accounts[3]', async () => {

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
