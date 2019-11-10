const USDC = artifacts.require("USDC");
const TCAD = artifacts.require("TCAD");

module.exports = function(deployer) {
  let addr = "0x203ddBe2D4925DD7fDeE0C5d7d7e195D71E0e821";
  let val = web3.utils.toWei("100", "ether");
  deployer.deploy(USDC, addr, val);
  deployer.deploy(TCAD, addr, val);
};
