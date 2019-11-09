const USDC = artifacts.require("USDC");
const TCAD = artifacts.require("TCAD");

module.exports = function(deployer) {
  let account = "0x46206cf1e80C05e9e20d329f1B3fC75ACDC4673E";
  let amount = web3.utils.toWei("100", "ether");
  deployer.deploy(USDC, account, amount);
  deployer.deploy(TCAD, account, amount);
};
