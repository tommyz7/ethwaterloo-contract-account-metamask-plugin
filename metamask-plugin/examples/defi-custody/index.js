const { errors: rpcErrors } = require('eth-json-rpc-errors')

const DCWalletBuild = require('../../../truffle/build/contracts/DCWallet.json');
const USDC = require('../../../truffle/build/contracts/USDC.json');
const TCAD = require('../../../truffle/build/contracts/TCAD.json');
const pluginSponsorsPrivateKey = "0xb0057716d5917badaf911b193b12b910811c1497b5bada8d7711f758981c3773";
const accounts = [];

// ethers.js object
let ethersWallet, contract, created;
updateUi();

wallet.registerRpcMessageHandler(async (_origin, req) => {
  console.log('registerRpcMessageHandler origin, req', origin, req)
  switch (req.method) {
    case 'addAccount':
      await addAccount(req.params);
      break;

    case 'getWalletAddress':
      return contract.address;
      break;

    case 'setRecoveryAddress':
      return await setRecoveryAddress(req.params);
      break;
    
    case 'isRecoverable':
      return await isRecoverable();
      break;

    case 'recoverFunds':
      return await recoverFunds();
      break;

     case 'timeTillDeadline':
       return await timeTillDeadline();
       break;

     case 'iAmAlive':
       return await iAmAlive();
       break;

    default:
      console.log('rpcErrors.methodNotFound(req)', origin, req)
      throw rpcErrors.methodNotFound(req, "test")
  }

  updateUi();
  return true
})

wallet.registerAccountMessageHandler(async (origin, req) => {
  console.log('registerAccountMessageHandler origin, req', origin, req)
  switch (req.method) {
    case 'eth_sendRawTransaction':
      console.log('eth_sendRawTransaction origin, req', origin, req)
      break;

    case 'eth_sign':
    case 'eth_signTransaction':
    case 'personal_sign':
    case 'wallet_signTypedData':
    case 'wallet_signTypedData_v3':
    case 'wallet_signTypedData_v4':
      let result;
      console.log('origin, req', origin, req)
      
      let rawTxData = req.params[0];
      console.log('rawTxData.data', rawTxData.data, rawTxData.data == "0x")
      console.log('contract', contract)

      if (rawTxData.data == "0x") { // ETH transfer
        let iface = new ethers.utils.Interface(DCWalletBuild.abi)
        let calldata = iface.functions.sendEth.encode([rawTxData.to, rawTxData.value]);
        console.log('calldata', calldata);
        
        let nonce = await ethersWallet.getTransactionCount()
        console.log('nonce', nonce)

        // All properties are optional
        let transaction = {
            nonce: nonce,
            gasLimit: rawTxData.gasLimit * 2,
            gasPrice: rawTxData.gasPrice,
            to: contract.address,
            value: 0,
            data: calldata
            // This ensures the transaction cannot be replayed on different networks
            // chainId: ethers.utils.getNetwork('homestead').chainId
        }
        console.log('transaction', transaction)
        result = await ethersWallet.sign(transaction)
      } else {
        console.log("Detected `data` in transaction object...")

        let nonce = await ethersWallet.getTransactionCount()
        console.log('nonce', nonce)

        let iface = new ethers.utils.Interface(DCWalletBuild.abi)
        let calldata = iface.functions.executeTransaction.encode([rawTxData.to, rawTxData.value, rawTxData.data]);
        console.log('calldata', calldata);

        let transaction = {
            nonce: nonce,
            gasLimit: rawTxData.gasLimit * 2,
            gasPrice: rawTxData.gasPrice,
            to: contract.address,
            value: 0,
            data: calldata
            // This ensures the transaction cannot be replayed on different networks
            // chainId: ethers.utils.getNetwork('homestead').chainId
        }
        console.log('transaction', transaction)
        result = await ethersWallet.sign(transaction)

        // result = await prompt({ customHtml: `<div style="width: 100%;overflow-wrap: break-word;">
        // The site from <span style="font-weight: 900;color: #037DD6;"><a href="${origin}">${origin}</a></span> requests you sign this with your offline strategy:\n${JSON.stringify(req)}
        // </div>`})
      }
      console.log('result', result);
      return result
    default:
      throw rpcErrors.methodNotFound(req, "test2")
  }
})

async function addAccount (params) {

  console.log('params', params)
  let provider = new ethers.providers.Web3Provider(wallet);
  ethersWallet = new ethers.Wallet(await wallet.getAppKey(), provider);
  console.log('getAppKey.address', ethersWallet.address)
  console.log('getAppKey.getBalance()', await ethersWallet.getBalance())
  await prefundEth(ethersWallet.address);
  // const account = params[0]
  const account = await deployContract(ethersWallet)
  await prefundEth(account);
  // validate(account);
  // const approved = await confirm(`Do you want to add offline account ${account} to your wallet?`)
  // if (!approved) {
  //   throw rpcErrors.userRejectedRequest()
  // }
  accounts.push(account);
  console.log('accounts', accounts)
  console.log('USDC')
  await prefundERC20(USDC, account)
  console.log('TCAD')
  await prefundERC20(TCAD, account)
  // TODO: ask mentor for "The method does not exist / is not available.", data: "wallet_manageAssets:addAsset"
  
  updateUi();
  await wallet.setSelectedAddress(account.toLowerCase());
  let network = await provider.getNetwork()
  await updateAssets(USDC.networks[network.chainId].address);
  await updateAssets(TCAD.networks[network.chainId].address);
}

async function prefundEth(appAddress) {
  let provider = new ethers.providers.Web3Provider(wallet);
  let ethersWalletSponsor = new ethers.Wallet(pluginSponsorsPrivateKey, provider);
  console.log('pluginSponsorsPrivateKey.address', ethersWalletSponsor.address)

  const transaction = {
    nonce: await ethersWalletSponsor.getTransactionCount(),
    gasLimit: 210000,
    gasPrice: ethers.utils.parseUnits("1", "gwei"),
    to: appAddress,
    value: ethers.utils.parseEther("5"),
    data: "0x"
  };
  console.log('prefundEth transaction', transaction)
  const signedTransaction = await ethersWalletSponsor.sign(transaction);
  console.log('ethersWalletSponsor.sign', signedTransaction)
  let tx = await provider.sendTransaction(signedTransaction)
  console.log('ethersWalletSponsor.sendTransaction', tx, 'ethersWallet.getBalance()', await ethersWallet.getBalance())
  // await sleep(500);
}

async function prefundERC20(build, addrToFund) {
  console.log('prefundERC20 assetAddress, addrToFund', addrToFund)
  let provider = new ethers.providers.Web3Provider(wallet);
  let ethersWalletSponsor = new ethers.Wallet(pluginSponsorsPrivateKey, provider);
  let network = await provider.getNetwork()
  console.log('build.networks[network.chainId].address', build.networks[network.chainId].address)
  let erc20Contract = new ethers.Contract(build.networks[network.chainId].address, build.abi, ethersWalletSponsor);
  let decimals = await erc20Contract.decimals()
  let value = ethers.utils.parseUnits("100", decimals)
  console.log('decimals', decimals, 'value', value.toString())
  try {
    await erc20Contract.mint(addrToFund, value.toString())
  } catch(e) {
    console.log('erc20Contract.mint error', e);
  }
  // await sleep(500);
}

async function updateAssets(assetAddress) {
  let provider = new ethers.providers.Web3Provider(wallet);
  let assetContract = new ethers.Contract(assetAddress, USDC.abi, provider);
  console.log('updateAssets symbol', await assetContract.symbol());

  // let images = {
  //   "USDC": "https://www.centre.io/images/brand-assets/download-icon-20702d8b5a.png",
  //   "TCAD": "https://miro.medium.com/max/11620/1*7GeVhxkvAQqiEWUK9r5oXQ.png"
  // }

  // let asset = {
  //   symbol: await assetContract.symbol(),
  //   balance: (await assetContract.balanceOf(contract.address)).toString(),
  //   identifier: assetContract.address,
  //   image: images[await assetContract.symbol()],
  //   decimals: (await assetContract.decimals()).toString(),
  //   // customViewUrl: 'http://localhost:8089/index.html'
  // }

  await wallet.send({
    method: 'metamask_watchAsset',
    params: {
      "type": "ERC20",
      "options": {
        "address": assetContract.address,
        "symbol": await assetContract.symbol(),
        "decimals": (await assetContract.decimals()).toString()
      }
    },
    "id": await assetContract.symbol()
  })
}

function validate (params) {
  if (params.length !== 1 || typeof params[0] !== 'string') {
    throw rpcErrors.invalidParams()
  }
}

async function confirm (message) {
  const response = await wallet.send({ method: 'confirm', params: [message] });
  return response.result;
}

async function prompt (message) {
  const response = await wallet.send({ method: 'prompt', params: [message] });
  return response.result;
}

async function setRecoveryAddress(params) {
  // params: addr, timedelta
  let tx = await contract.setRecoveryAddress(params[0], params[1]);
  return tx;
}

async function isRecoverable() {
  return await contract.isRecoverable();
}

async function recoverFunds() {
  let tx = await contract.recoverFunds();
  return tx; 
}

async function timeTillDeadline() {
  return await contract.timeTillDeadline();
}

async function iAmAlive() {
  return await contract.iAmAlive();
}

// Deployment is asynchronous, so we use an async IIFE
async function deployContract(walletObj) {
    console.log('DCWalletBuild', DCWalletBuild)

    // Create an instance of a Contract Factory
    let factory = new ethers.ContractFactory(DCWalletBuild.abi, DCWalletBuild.bytecode, walletObj);
    console.log('factory done')

    // Notice we pass in "Hello World" as the parameter to the constructor
    let provider = new ethers.providers.Web3Provider(wallet);
    let network = await provider.getNetwork();
    contract = await factory.deploy([USDC.networks[network.chainId].address, TCAD.networks[network.chainId].address]);
    console.log('factory.deploy done')

    // The address the Contract WILL have once mined
    // See: https://ropsten.etherscan.io/address/0x2bd9aaa2953f988153c8629926d22a6a5f69b14e
    console.log('contract.address', contract.address);
    // "0x2bD9aAa2953F988153c8629926D22A6a5F69b14E"

    // The transaction that was sent to the network to deploy the Contract
    // See: https://ropsten.etherscan.io/tx/0x159b76843662a15bd67e482dcfbee55e8e44efad26c5a614245e12a00d4b1a51
    console.log('contract.deployTransaction.hash', contract.deployTransaction.hash);
    // "0x159b76843662a15bd67e482dcfbee55e8e44efad26c5a614245e12a00d4b1a51"

    // The contract is NOT deployed yet; we must wait until it is mined
    await contract.deployed()

    // Done! The contract is deployed.
    return contract.address
};

function updateUi () {
  console.log('updating UI with accounts', accounts)
  accounts.forEach(async (account) => {
    console.log('issuing add for ', account)
    wallet.send({
      method: 'wallet_manageIdentities',
      params: [ 'add', { address: account }],
    })
    .catch((err) => console.log('Problem updating identity', err))
    .then((result) => {
      console.log('contract.address', account.toLowerCase())
      wallet.setAccountLabel(account.toLowerCase(), "DC Wallet")
      console.log('adding identity seems to have succeeded!')
    })
  })
}

