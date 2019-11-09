const { errors: rpcErrors } = require('eth-json-rpc-errors')

const accounts = [];

// ethers.js object
let ethersWallet, contract;
updateUi();

wallet.registerRpcMessageHandler(async (_origin, req) => {
  console.log('registerRpcMessageHandler origin, req', origin, req)
  switch (req.method) {
    case 'addAccount':
      addAccount(req.params);
      break;

    case 'setLabel':
      await setLabel(req.params);
      break;

    default:
      throw rpcErrors.methodNotFound(req)
  }

  updateUi();
  return true
})

wallet.registerAccountMessageHandler(async (origin, req) => {
  console.log('registerAccountMessageHandler origin, req', origin, req)
  switch (req.method) {
    // case 'eth_sendRawTransaction':
    //   console.log('eth_sendRawTransaction origin, req', origin, req)
    //   break;

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
      if (rawTxData.data == "0x") { // ETH transfer
        console.log('contract', contract)
        let build = require('./Word.json');
        let iface = new ethers.utils.Interface(build.abi)
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
        result = await prompt({ customHtml: `<div style="width: 100%;overflow-wrap: break-word;">
        The site from <span style="font-weight: 900;color: #037DD6;"><a href="${origin}">${origin}</a></span> requests you sign this with your offline strategy:\n${JSON.stringify(req)}
        </div>`})
      }
      console.log('result', result);
      return result
    default:
      throw rpcErrors.methodNotFound(req)
  }
})

async function addAccount (params) {
  console.log('params', params)
  let provider = new ethers.providers.Web3Provider(wallet);
  ethersWallet = new ethers.Wallet(await wallet.getAppKey(), provider);
  console.log('ethersWallet.address', ethersWallet.address)
  console.log('ethersWallet.getBalance()', await ethersWallet.getBalance())
  // const account = params[0]
  const account = await deployContract(ethersWallet)
  // validate(account);
  const approved = await confirm(`Do you want to add offline account ${account} to your wallet?`)
  if (!approved) {
    throw rpcErrors.userRejectedRequest()
  }
  accounts.push(account);
  console.log('accounts', accounts)
  updateUi();
}

async function setLabel(params) {
  let res = await wallet.send({
    method: 'setAccountLabel',
    params: [ 'DC Wallet', {address: accounts[0]}]
  })
  console.log('setAccountLabel result', res)
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

// Deployment is asynchronous, so we use an async IIFE
async function deployContract(walletObj) {
    let build = require('../../../truffle/build/contracts/Word.json');
    console.log('build', build)

    // Create an instance of a Contract Factory
    let factory = new ethers.ContractFactory(build.abi, build.bytecode, walletObj);

    // Notice we pass in "Hello World" as the parameter to the constructor
    contract = await factory.deploy("Hello World");

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
      console.log('adding identity seems to have succeeded!')
    })
  })
}

