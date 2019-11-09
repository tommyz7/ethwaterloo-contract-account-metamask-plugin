const USDC = artifacts.require("USDC");
const TCAD = artifacts.require("TCAD");

module.exports = function(deployer) {
  let account = "0x1df62f291b2e969fb0849d99d9ce41e2f137006e";
  let amount = web3.utils.toWei("100", "ether");
  deployer.deploy(USDC, account, amount);
  deployer.deploy(TCAD, account, amount);
};
