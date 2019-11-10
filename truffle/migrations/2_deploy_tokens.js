const USDC = artifacts.require("USDC");
const TCAD = artifacts.require("TCAD");

module.exports = function(deployer) {
  let addr = "0x5604e299f7dA32286E2Cb688cB8725Ec6D4F1DF5";
  let val = web3.utils.toWei("100", "ether");
  deployer.deploy(USDC, addr, val);
  deployer.deploy(TCAD, addr, val);
};
