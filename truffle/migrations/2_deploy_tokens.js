const USDC = artifacts.require("USDC");
const TCAD = artifacts.require("TCAD");

module.exports = function(deployer) {
  let addr = "0x2DE810c2C7177266DFBF4F9ed3C9e41726dB1262";
  let val = web3.utils.toWei("100", "ether");
  deployer.deploy(USDC, addr, val);
  deployer.deploy(TCAD, addr, val);
};
