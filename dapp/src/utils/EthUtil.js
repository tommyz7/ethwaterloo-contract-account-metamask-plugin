import { ethers } from 'ethers';


export function toEth(web3, weiVal){
  return web3.utils.fromWei(weiVal, 'ether');
}

export function toWei(web3, ethVal) {
  return web3.utils.toWei(ethVal, 'ether');
}


/* typescript workaround */
export function loadTokenContract(provider, contractJson, contractAddr){
  //return new web3.eth.Contract(contractJson.abi, contractAddr);
  console.log('provider', provider);
  console.log('contractJson', contractJson.abi);
  console.log('contractAddr', contractAddr);

  return new ethers.Contract(contractAddr, contractJson.abi, provider);

}
