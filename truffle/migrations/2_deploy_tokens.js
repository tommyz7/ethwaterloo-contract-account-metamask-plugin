const USDC = artifacts.require("USDC");
const TCAD = artifacts.require("TCAD");

module.exports = function(deployer) {
  let addr = "0x8c859377912C579415EB8a5C6e1aBB3AA9cAFb94";
  let val = web3.utils.toWei("100", "ether");
  deployer.deploy(USDC, addr, val);
  deployer.deploy(TCAD, addr, val);
};
