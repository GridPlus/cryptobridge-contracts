var Migrations = artifacts.require("./Migrations.sol");
var Relay = artifacts.require('./Relay.sol');
var MerkleLib = artifacts.require('./MerklePatriciaProof.sol');
var RLP = artifacts.require('./RLP.sol');

module.exports = function(deployer) {
  deployer.deploy(Migrations);
  deployer.deploy(MerkleLib);
  deployer.link(MerkleLib, Relay);
  deployer.deploy(RLP);
  deployer.link(RLP, MerkleLib);
  deployer.deploy(Relay);
};
