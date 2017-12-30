const HDWalletProvider = require('truffle-hdwallet-provider');
const secrets = require('./secrets.json');
const bip39 = require('bip39');
const hdkey = require('ethereumjs-wallet/hdkey');
const hdwallet = hdkey.fromMasterSeed(bip39.mnemonicToSeed(secrets.mnemonic));
const node = hdwallet.derivePath(secrets.hdPath + '0');
const addr = node.getWallet().getAddressString();

module.exports = {
  networks: {
    origin: {
      name: "Origin",
      host: 'localhost',
      port: 7545,
      network_id: '*', // Match any network id
      from: addr
    },
    destination: {
      name: "Destination",
      host: 'localhost',
      port: 8545,
      network_id: '*', // Match any network id
      from: addr
    },
    development: {
      name: "Dev",
      host: 'localhost',
      port: 7546,
      network_id: '*', // Match any network id
      gas: 5600000
    },
    ropsten: {
      provider: new HDWalletProvider(secrets.mnemonic, 'https://ropsten.infura.io/'),
      network_id: 3, // official id of the ropsten network
    },
  },
};
