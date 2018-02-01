var Migrations = artifacts.require("./Migrations.sol");
var Bridge = artifacts.require('./Bridge.sol');
var MerkleLib = artifacts.require('./MerklePatriciaProof.sol');
var RLP = artifacts.require('./RLP.sol');

module.exports = function(deployer) {
  deployer.deploy(Migrations);
  deployer.deploy(MerkleLib);
  deployer.link(MerkleLib, Bridge);
  deployer.deploy(RLP);
  deployer.link(RLP, MerkleLib);
  deployer.deploy(Bridge);
};
