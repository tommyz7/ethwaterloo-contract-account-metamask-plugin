
export function toEth(web3, weiVal){
  return web3.utils.fromWei(weiVal, 'ether');
}

export function toWei(web3, ethVal) {
  return web3.utils.toWei(ethVal, 'ether');
}


/* typescript workaround */
export function loadTokenContract(web3, contractJson, contractAddr){
  return new web3.eth.Contract(contractJson.abi, contractAddr);
}
