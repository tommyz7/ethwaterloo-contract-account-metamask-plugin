const USDC = artifacts.require("USDC");
const TCAD = artifacts.require("TCAD");

module.exports = function(deployer) {
  deployer.deploy(USDC);
  deployer.deploy(TCAD);
};
