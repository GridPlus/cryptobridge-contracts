var Migrations = artifacts.require("./Migrations.sol");
var Relay = artifacts.require('./Relay.sol');
var MerkleLib = artifacts.require('./MerkleLib.sol');

module.exports = function(deployer) {
  deployer.deploy(Migrations);
  deployer.deploy(MerkleLib);
  deployer.link(MerkleLib, Relay);
  deployer.deploy(Relay);
};
