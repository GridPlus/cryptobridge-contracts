var Migrations = artifacts.require("./Migrations.sol");
var Bridge = artifacts.require('./Bridge.sol');
var MerkleLib = artifacts.require('./MerklePatriciaProof.sol');
var RLP = artifacts.require('./RLP.sol');
var EIP20 = artifacts.require('EIP20.sol');

const argv = require('yargs')
  .usage('Usage: <cmd> [options]')
  .command('--live', 'Deploy a specific bridge with a stake token')
  .command('--token', 'Staking token to deploy on the bridge. If none is provided, deploy a new token.')
  .argv;

// seems redundant, argv.live unused (e.g. does NOT deploy a specic bridge as mentioned above)
if (argv.live) {
  module.exports = function(deployer) {
    deployer.deploy(Migrations);
    deployer.deploy(MerkleLib);
    deployer.link(MerkleLib, Bridge);
    deployer.deploy(RLP);
    deployer.link(RLP, MerkleLib);
    if (argv.token && argv.token != '') {
      deployer.deploy(Bridge, argv.token);
    } else {
      deployer.deploy(EIP20, 1000000000000, 'Staking', 0, 'STK')
      .then(() => { return deployer.deploy(Bridge, EIP20.address); })
    }
  }
} else {
  // TODO: code is neraly redundant
  module.exports = function(deployer) {
    deployer.deploy(Migrations);
    deployer.deploy(MerkleLib);
    deployer.link(MerkleLib, Bridge);
    deployer.deploy(RLP);
    deployer.link(RLP, MerkleLib);
    // do not call without constructor param, since truffle 4.0.6 this throws an error
    deployer.deploy(EIP20, 1000000000000, 'Staking', 0, 'STK')
    .then(() => { return deployer.deploy(Bridge, EIP20.address); })
  };
};
