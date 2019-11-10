() => (function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
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


},{"../../../truffle/build/contracts/DCWallet.json":9,"../../../truffle/build/contracts/TCAD.json":10,"../../../truffle/build/contracts/USDC.json":11,"eth-json-rpc-errors":2}],2:[function(require,module,exports){

const { EthereumRpcError, EthereumProviderError } = require('./src/classes')
const {
  serializeError, getMessageFromCode,
} = require('./src/utils')
const ethErrors = require('./src/errors')
const ERROR_CODES = require('./src/errorCodes.json')

module.exports = {
  ethErrors,
  EthereumRpcError,
  EthereumProviderError,
  serializeError,
  getMessageFromCode,
  /** @type ErrorCodes */
  ERROR_CODES,
}

// Types

/**
 * @typedef {Object} EthereumProviderErrorCodes
 * @property {number} userRejectedRequest
 * @property {number} unauthorized
 * @property {number} unsupportedMethod
 */

/**
 * @typedef {Object} EthereumRpcErrorCodes
 * @property {number} parse
 * @property {number} invalidRequest
 * @property {number} invalidParams
 * @property {number} methodNotFound
 * @property {number} internal
 * @property {number} invalidInput
 * @property {number} resourceNotFound
 * @property {number} resourceUnavailable
 * @property {number} transactionRejected
 * @property {number} methodNotSupported
 */

/**
 * @typedef ErrorCodes
 * @property {EthereumRpcErrorCodes} rpc
 * @property {EthereumProviderErrorCodes} provider
 */

},{"./src/classes":3,"./src/errorCodes.json":4,"./src/errors":6,"./src/utils":7}],3:[function(require,module,exports){

const safeStringify = require('fast-safe-stringify')

/**
 * @class JsonRpcError
 * Error subclass implementing JSON RPC 2.0 errors and Ethereum RPC errors
 * per EIP 1474.
 * Permits any integer error code.
 */
class EthereumRpcError extends Error {

  /**
   * Create an Ethereum JSON RPC error.
   * 
   * @param {number} code - The integer error code.
   * @param {string} message - The string message.
   * @param {any} [data] - The error data.
   */
  constructor (code, message, data) {

    if (!Number.isInteger(code)) throw new Error(
      '"code" must be an integer.'
    )
    if (!message || typeof message !== 'string') throw new Error(
      '"message" must be a nonempty string.'
    )

    super(message)
    this.code = code
    if (data !== undefined) this.data = data
  }

  /**
   * Returns a plain object with all public class properties.
   * 
   * @returns {object} The serialized error. 
   */
  serialize() {
    const serialized = {
      code: this.code,
      message: this.message,
    }
    if (this.data !== undefined) serialized.data = this.data
    if (this.stack) serialized.stack = this.stack
    return serialized
  }

  /**
   * Return a string representation of the serialized error, omitting
   * any circular references.
   * 
   * @returns {string} The serialized error as a string.
   */
  toString() {
    return safeStringify(
      this.serialize(),
      stringifyReplacer,
      2
    )
  }
}

/**
 * @class EthereumRpcError
 * Error subclass implementing Ethereum Provider errors per EIP 1193.
 * Permits integer error codes in the [ 1000 <= 4999 ] range.
 */
class EthereumProviderError extends EthereumRpcError {
  /**
   * Create an Ethereum JSON RPC error.
   * 
   * @param {number} code - The integer error code, in the [ 1000 <= 4999 ] range.
   * @param {string} message - The string message.
   * @param {any} [data] - The error data.
   */
  constructor(code, message, data) {
    if (!isValidEthProviderCode(code)) {
      throw new Error(
        '"code" must be an integer such that: 1000 <= code <= 4999'
      )
    }
    super(code, message, data)
  }
}

// Internal

function isValidEthProviderCode(code) {
  return Number.isInteger(code) && code >= 1000 && code <= 4999
}

function stringifyReplacer(_, value) {
  if (value === '[Circular]') {
    return
  }
  return value
}

// Exports

module.exports =  {
  EthereumRpcError,
  EthereumProviderError
}

},{"fast-safe-stringify":8}],4:[function(require,module,exports){
module.exports={
  "rpc": {
    "invalidInput": -32000,
    "resourceNotFound": -32001,
    "resourceUnavailable": -32002,
    "transactionRejected": -32003,
    "methodNotSupported": -32004,
    "parse": -32700,
    "invalidRequest": -32600,
    "methodNotFound": -32601,
    "invalidParams": -32602,
    "internal": -32603
  },
  "provider": {
    "userRejectedRequest": 4001,
    "unauthorized": 4100,
    "unsupportedMethod": 4200
  }
}

},{}],5:[function(require,module,exports){
module.exports={
  "-32700": {
    "standard": "JSON RPC 2.0",
    "message": "Invalid JSON was received by the server. An error occurred on the server while parsing the JSON text."
  },
  "-32600": {
    "standard": "JSON RPC 2.0",
    "message": "The JSON sent is not a valid Request object."
  },
  "-32601": {
    "standard": "JSON RPC 2.0",
    "message": "The method does not exist / is not available."
  },
  "-32602": {
    "standard": "JSON RPC 2.0",
    "message": "Invalid method parameter(s)."
  },
  "-32603": {
    "standard": "JSON RPC 2.0",
    "message": "Internal JSON-RPC error."
  },
  "-32000": {
    "standard": "EIP 1474",
    "message": "Invalid input."
  },
  "-32001": {
    "standard": "EIP 1474",
    "message": "Resource not found."
  },
  "-32002": {
    "standard": "EIP 1474",
    "message": "Resource unavailable."
  },
  "-32003": {
    "standard": "EIP 1474",
    "message": "Transaction rejected."
  },
  "-32004": {
    "standard": "EIP 1474",
    "message": "Method not supported."
  },
  "4001": {
    "standard": "EIP 1193",
    "message": "User rejected the request."
  },
  "4100": {
    "standard": "EIP 1193",
    "message": "The requested account and/or method has not been authorized by the user."
  },
  "4200": {
    "standard": "EIP 1193",
    "message": "The requested method is not supported by this Ethereum provider."
  }
}

},{}],6:[function(require,module,exports){

const { EthereumRpcError, EthereumProviderError } = require('./classes')
const { getMessageFromCode } = require('./utils')
const ERROR_CODES = require('./errorCodes.json')

module.exports = {
  rpc: {
    /**
     * Get a JSON RPC 2.0 Parse error.
     * 
     * @param {Object|string} [opts] - Options object or error message string
     * @param {string} [opts.message] - The error message
     * @param {any} [opts.data] - Error data
     * @returns {EthereumRpcError} - The error
     */
    parse: (opts) => getEthJsonRpcError(
      ERROR_CODES.rpc.parse, opts
    ),

    /**
     * Get a JSON RPC 2.0 Invalid Request error.
     * 
     * @param {Object|string} [opts] - Options object or error message string
     * @param {string} [opts.message] - The error message
     * @param {any} [opts.data] - Error data
     * @returns {EthereumRpcError} - The error
     */
    invalidRequest: (opts) => getEthJsonRpcError(
      ERROR_CODES.rpc.invalidRequest, opts
    ),

    /**
     * Get a JSON RPC 2.0 Invalid Params error.
     * 
     * @param {Object|string} [opts] - Options object or error message string
     * @param {string} [opts.message] - The error message
     * @param {any} [opts.data] - Error data
     * @returns {EthereumRpcError} - The error
     */
    invalidParams: (opts) => getEthJsonRpcError(
      ERROR_CODES.rpc.invalidParams, opts
    ),

    /**
     * Get a JSON RPC 2.0 Method Not Found error.
     * 
     * @param {Object|string} [opts] - Options object or error message string
     * @param {string} [opts.message] - The error message
     * @param {any} [opts.data] - Error data
     * @returns {EthereumRpcError} - The error
     */
    methodNotFound: (opts) => getEthJsonRpcError(
      ERROR_CODES.rpc.methodNotFound, opts
    ),

    /**
     * Get a JSON RPC 2.0 Internal error.
     * 
     * @param {Object|string} [opts] - Options object or error message string
     * @param {string} [opts.message] - The error message
     * @param {any} [opts.data] - Error data
     * @returns {EthereumRpcError} - The error
     */
    internal: (opts) => getEthJsonRpcError(
      ERROR_CODES.rpc.internal, opts
    ),

    /**
     * Get a JSON RPC 2.0 Server error.
     * Permits integer error codes in the [ -32099 <= -32005 ] range.
     * Codes -32000 through -32004 are reserved by EIP 1474.
     * 
     * @param {Object|string} opts - Options object
     * @param {number} opts.code - The error code
     * @param {string} [opts.message] - The error message
     * @param {any} [opts.data] - Error data
     * @returns {EthereumRpcError} - The error
     */
    server: (opts) => {
      if (typeof opts !== 'object' || Array.isArray(opts)) {
        throw new Error('Ethereum RPC Server errors must provide single object argument.')
      }
      const { code } = opts
      if (!Number.isInteger(code) || code > -32005 || code < -32099) {
        throw new Error(
          '"code" must be an integer such that: -32099 <= code <= -32005'
        )
      }
      return getEthJsonRpcError(code, opts)
    },

    /**
     * Get an Ethereum JSON RPC Invalid Input error.
     * 
     * @param {Object|string} [opts] - Options object or error message string
     * @param {string} [opts.message] - The error message
     * @param {any} [opts.data] - Error data
     * @returns {EthereumRpcError} - The error
     */
    invalidInput: (opts) => getEthJsonRpcError(
      ERROR_CODES.rpc.invalidInput, opts
    ),

    /**
     * Get an Ethereum JSON RPC Resource Not Found error.
     * 
     * @param {Object|string} [opts] - Options object or error message string
     * @param {string} [opts.message] - The error message
     * @param {any} [opts.data] - Error data
     * @returns {EthereumRpcError} - The error
     */
    resourceNotFound: (opts) => getEthJsonRpcError(
      ERROR_CODES.rpc.resourceNotFound, opts
    ),

    /**
     * Get an Ethereum JSON RPC Resource Unavailable error.
     * 
     * @param {Object|string} [opts] - Options object or error message string
     * @param {string} [opts.message] - The error message
     * @param {any} [opts.data] - Error data
     * @returns {EthereumRpcError} - The error
     */
    resourceUnavailable: (opts) => getEthJsonRpcError(
      ERROR_CODES.rpc.resourceUnavailable, opts
    ),

    /**
     * Get an Ethereum JSON RPC Transaction Rejected error.
     * 
     * @param {Object|string} [opts] - Options object or error message string
     * @param {string} [opts.message] - The error message
     * @param {any} [opts.data] - Error data
     * @returns {EthereumRpcError} - The error
     */
    transactionRejected: (opts) => getEthJsonRpcError(
      ERROR_CODES.rpc.transactionRejected, opts
    ),

    /**
     * Get an Ethereum JSON RPC Method Not Supported error.
     * 
     * @param {Object|string} [opts] - Options object or error message string
     * @param {string} [opts.message] - The error message
     * @param {any} [opts.data] - Error data
     * @returns {EthereumRpcError} - The error
     */
    methodNotSupported: (opts) => getEthJsonRpcError(
      ERROR_CODES.rpc.methodNotSupported, opts
    ),
  },

  provider: {
    /**
     * Get an Ethereum Provider User Rejected Request error.
     * 
     * @param {Object|string} [opts] - Options object or error message string
     * @param {string} [opts.message] - The error message
     * @param {any} [opts.data] - Error data
     * @returns {EthereumProviderError} - The error
     */
    userRejectedRequest: (opts) => {
      return getEthProviderError(
        ERROR_CODES.provider.userRejectedRequest, opts
      )
    },

    /**
     * Get an Ethereum Provider Unauthorized error.
     * 
     * @param {Object|string} [opts] - Options object or error message string
     * @param {string} [opts.message] - The error message
     * @param {any} [opts.data] - Error data
     * @returns {EthereumProviderError} - The error
     */
    unauthorized: (opts) => {
      return getEthProviderError(
        ERROR_CODES.provider.unauthorized, opts
      )
    },

    /**
     * Get an Ethereum Provider Unsupported Method error.
     * 
     * @param {Object|string} [opts] - Options object or error message string
     * @param {string} [opts.message] - The error message
     * @param {any} [opts.data] - Error data
     * @returns {EthereumProviderError} - The error
     */
    unsupportedMethod: (opts) => {
      return getEthProviderError(
        ERROR_CODES.provider.unsupportedMethod, opts
      )
    },

    /**
     * Get a custom Ethereum Provider error.
     * 
     * @param {Object|string} opts - Options object
     * @param {number} opts.code - The error code
     * @param {string} opts.message - The error message
     * @param {any} [opts.data] - Error data
     * @returns {EthereumProviderError} - The error
     */
    custom: (opts) => {
      if (typeof opts !== 'object' || Array.isArray(opts)) {
        throw new Error('Ethereum Provider custom errors must provide single object argument.')
      }
      const { code, message, data } = opts
      if (!message || typeof message !== 'string') throw new Error(
        '"message" must be a nonempty string'
      )
      return new EthereumProviderError(code, message, data)
    },
  },
}

// Internal

function getEthJsonRpcError(code, opts) {
  const [ message, data ] = validateOpts(opts)
  return new EthereumRpcError(
    code,
    message || getMessageFromCode(code),
    data
  )
}

function getEthProviderError(code, opts) {
  const [ message, data ] = validateOpts(opts)
  return new EthereumProviderError(
    code,
    message || getMessageFromCode(code),
    data
  )
}

function validateOpts (opts) {
  let message, data
  if (opts) {
    if (typeof opts === 'string') {
      message = opts
    } else if (opts && typeof opts === 'object' && !Array.isArray(opts)) {
      message = opts.message
      data = opts.data
    }
  }
  return [ message, data ]
}

},{"./classes":3,"./errorCodes.json":4,"./utils":7}],7:[function(require,module,exports){

const errorValues = require('./errorValues.json')
const FALLBACK_ERROR_CODE = require('./errorCodes.json').rpc.internal
const { EthereumRpcError } = require('./classes')

const JSON_RPC_SERVER_ERROR_MESSAGE = 'Unspecified server error.'

const FALLBACK_MESSAGE = 'Unspecified error message. This is a bug, please report it.'

const FALLBACK_ERROR = {
  code: FALLBACK_ERROR_CODE,
  message: getMessageFromCode(FALLBACK_ERROR_CODE)
}

/**
 * Gets the message for a given code, or a fallback message if the code has
 * no corresponding message.
 * 
 * @param {number} code - The integer error code
 * @param {string} fallbackMessage - The fallback message
 * @return {string} - The corresponding message or the fallback message
 */
function getMessageFromCode(code, fallbackMessage = FALLBACK_MESSAGE) {

  if (Number.isInteger(code)) {

    const codeString = code.toString()
    if (errorValues[codeString]) return errorValues[codeString].message

    if (isJsonRpcServerError(code)) return JSON_RPC_SERVER_ERROR_MESSAGE

    // TODO: allow valid codes and messages to be extended
    // // EIP 1193 Status Codes
    // if (code >= 4000 && code <= 4999) return Something?
  }
  return fallbackMessage
}

/**
 * Returns whether the given code is valid.
 * A code is only valid if it has a message.
 * 
 * @param {number} code - The code to check
 * @return {boolean} true if the code is valid, false otherwise.
 */
function isValidCode(code) {

  if (!Number.isInteger(code)) return false

  const codeString = code.toString()
  if (errorValues[codeString]) return true

  if (isJsonRpcServerError(code)) return true

  // TODO: allow valid codes and messages to be extended
  // // EIP 1193 Status Codes
  // if (code >= 4000 && code <= 4999) return true

  return false
}

/**
 * Serializes the given error to an Ethereum JSON RPC-compatible error object.
 * Merely copies the given error's values if it is already compatible.
 * If the given error is not fully compatible, it will be preserved on the
 * returned object's data.originalError property.
 * Adds a 'stack' property if it exists on the given error.
 *
 * @param {any} error - The error to serialize.
 * @param {object} fallbackError - The custom fallback error values if the
 * given error is invalid.
 * @return {object} A standardized error object.
 */
function serializeError (error, fallbackError = FALLBACK_ERROR) {

  if (
    !fallbackError || 
    !Number.isInteger(fallbackError.code) ||
    typeof fallbackError.message !== 'string'
  ) {
    throw new Error(
      'fallbackError must contain integer number code and string message.'
    )
  }

  if (typeof error === 'object' && error instanceof EthereumRpcError) {
    return error.serialize()
  }

  const serialized = {}

  if (error && isValidCode(error.code)) {

    serialized.code = error.code

    if (error.message && typeof error.message === 'string') {
      serialized.message = error.message
      if (error.hasOwnProperty('data')) serialized.data = error.data
    } else {
      serialized.message = getMessageFromCode(serialized.code)
      serialized.data = { originalError: assignOriginalError(error) }
    }

  } else {
    serialized.code = fallbackError.code
    serialized.message = (
      error && error.message
        ? error.message
        : fallbackError.message
    )
    serialized.data = { originalError: assignOriginalError(error) }
  }

  if (error && error.stack) serialized.stack = error.stack
  return serialized
}

// Internal

function isJsonRpcServerError (code) {
  return code >= -32099 && code <= -32000
}

function assignOriginalError (error) {
  if (error && typeof error === 'object' && !Array.isArray(error)) {
    return Object.assign({}, error)
  }
  return error
}

// Exports

module.exports = {
  getMessageFromCode,
  isValidCode,
  serializeError,
  JSON_RPC_SERVER_ERROR_MESSAGE,
}

},{"./classes":3,"./errorCodes.json":4,"./errorValues.json":5}],8:[function(require,module,exports){
module.exports = stringify
stringify.default = stringify
stringify.stable = deterministicStringify
stringify.stableStringify = deterministicStringify

var arr = []
var replacerStack = []

// Regular stringify
function stringify (obj, replacer, spacer) {
  decirc(obj, '', [], undefined)
  var res
  if (replacerStack.length === 0) {
    res = JSON.stringify(obj, replacer, spacer)
  } else {
    res = JSON.stringify(obj, replaceGetterValues(replacer), spacer)
  }
  while (arr.length !== 0) {
    var part = arr.pop()
    if (part.length === 4) {
      Object.defineProperty(part[0], part[1], part[3])
    } else {
      part[0][part[1]] = part[2]
    }
  }
  return res
}
function decirc (val, k, stack, parent) {
  var i
  if (typeof val === 'object' && val !== null) {
    for (i = 0; i < stack.length; i++) {
      if (stack[i] === val) {
        var propertyDescriptor = Object.getOwnPropertyDescriptor(parent, k)
        if (propertyDescriptor.get !== undefined) {
          if (propertyDescriptor.configurable) {
            Object.defineProperty(parent, k, { value: '[Circular]' })
            arr.push([parent, k, val, propertyDescriptor])
          } else {
            replacerStack.push([val, k])
          }
        } else {
          parent[k] = '[Circular]'
          arr.push([parent, k, val])
        }
        return
      }
    }
    stack.push(val)
    // Optimize for Arrays. Big arrays could kill the performance otherwise!
    if (Array.isArray(val)) {
      for (i = 0; i < val.length; i++) {
        decirc(val[i], i, stack, val)
      }
    } else {
      var keys = Object.keys(val)
      for (i = 0; i < keys.length; i++) {
        var key = keys[i]
        decirc(val[key], key, stack, val)
      }
    }
    stack.pop()
  }
}

// Stable-stringify
function compareFunction (a, b) {
  if (a < b) {
    return -1
  }
  if (a > b) {
    return 1
  }
  return 0
}

function deterministicStringify (obj, replacer, spacer) {
  var tmp = deterministicDecirc(obj, '', [], undefined) || obj
  var res
  if (replacerStack.length === 0) {
    res = JSON.stringify(tmp, replacer, spacer)
  } else {
    res = JSON.stringify(tmp, replaceGetterValues(replacer), spacer)
  }
  while (arr.length !== 0) {
    var part = arr.pop()
    if (part.length === 4) {
      Object.defineProperty(part[0], part[1], part[3])
    } else {
      part[0][part[1]] = part[2]
    }
  }
  return res
}

function deterministicDecirc (val, k, stack, parent) {
  var i
  if (typeof val === 'object' && val !== null) {
    for (i = 0; i < stack.length; i++) {
      if (stack[i] === val) {
        var propertyDescriptor = Object.getOwnPropertyDescriptor(parent, k)
        if (propertyDescriptor.get !== undefined) {
          if (propertyDescriptor.configurable) {
            Object.defineProperty(parent, k, { value: '[Circular]' })
            arr.push([parent, k, val, propertyDescriptor])
          } else {
            replacerStack.push([val, k])
          }
        } else {
          parent[k] = '[Circular]'
          arr.push([parent, k, val])
        }
        return
      }
    }
    if (typeof val.toJSON === 'function') {
      return
    }
    stack.push(val)
    // Optimize for Arrays. Big arrays could kill the performance otherwise!
    if (Array.isArray(val)) {
      for (i = 0; i < val.length; i++) {
        deterministicDecirc(val[i], i, stack, val)
      }
    } else {
      // Create a temporary object in the required way
      var tmp = {}
      var keys = Object.keys(val).sort(compareFunction)
      for (i = 0; i < keys.length; i++) {
        var key = keys[i]
        deterministicDecirc(val[key], key, stack, val)
        tmp[key] = val[key]
      }
      if (parent !== undefined) {
        arr.push([parent, k, val])
        parent[k] = tmp
      } else {
        return tmp
      }
    }
    stack.pop()
  }
}

// wraps replacer function to handle values we couldn't replace
// and mark them as [Circular]
function replaceGetterValues (replacer) {
  replacer = replacer !== undefined ? replacer : function (k, v) { return v }
  return function (key, val) {
    if (replacerStack.length > 0) {
      for (var i = 0; i < replacerStack.length; i++) {
        var part = replacerStack[i]
        if (part[1] === key && part[0] === val) {
          val = '[Circular]'
          replacerStack.splice(i, 1)
          break
        }
      }
    }
    return replacer.call(this, key, val)
  }
}

},{}],9:[function(require,module,exports){
module.exports={
  "contractName": "DCWallet",
  "abi": [
    {
      "constant": true,
      "inputs": [],
      "name": "timedelta",
      "outputs": [
        {
          "name": "",
          "type": "uint256"
        }
      ],
      "payable": false,
      "stateMutability": "view",
      "type": "function"
    },
    {
      "constant": true,
      "inputs": [],
      "name": "word",
      "outputs": [
        {
          "name": "",
          "type": "string"
        }
      ],
      "payable": false,
      "stateMutability": "view",
      "type": "function"
    },
    {
      "constant": true,
      "inputs": [],
      "name": "recoveryAddress",
      "outputs": [
        {
          "name": "",
          "type": "address"
        }
      ],
      "payable": false,
      "stateMutability": "view",
      "type": "function"
    },
    {
      "constant": false,
      "inputs": [],
      "name": "renounceOwnership",
      "outputs": [],
      "payable": false,
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "constant": true,
      "inputs": [],
      "name": "owner",
      "outputs": [
        {
          "name": "",
          "type": "address"
        }
      ],
      "payable": false,
      "stateMutability": "view",
      "type": "function"
    },
    {
      "constant": true,
      "inputs": [],
      "name": "isOwner",
      "outputs": [
        {
          "name": "",
          "type": "bool"
        }
      ],
      "payable": false,
      "stateMutability": "view",
      "type": "function"
    },
    {
      "constant": true,
      "inputs": [],
      "name": "lastCall",
      "outputs": [
        {
          "name": "",
          "type": "uint256"
        }
      ],
      "payable": false,
      "stateMutability": "view",
      "type": "function"
    },
    {
      "constant": true,
      "inputs": [
        {
          "name": "",
          "type": "uint256"
        }
      ],
      "name": "recoverableAssets",
      "outputs": [
        {
          "name": "",
          "type": "address"
        }
      ],
      "payable": false,
      "stateMutability": "view",
      "type": "function"
    },
    {
      "constant": false,
      "inputs": [
        {
          "name": "newOwner",
          "type": "address"
        }
      ],
      "name": "transferOwnership",
      "outputs": [],
      "payable": false,
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [
        {
          "name": "assets",
          "type": "address[]"
        }
      ],
      "payable": false,
      "stateMutability": "nonpayable",
      "type": "constructor"
    },
    {
      "payable": true,
      "stateMutability": "payable",
      "type": "fallback"
    },
    {
      "anonymous": false,
      "inputs": [
        {
          "indexed": false,
          "name": "destination",
          "type": "address"
        },
        {
          "indexed": false,
          "name": "value",
          "type": "uint256"
        },
        {
          "indexed": false,
          "name": "data",
          "type": "bytes"
        }
      ],
      "name": "Execution",
      "type": "event"
    },
    {
      "anonymous": false,
      "inputs": [
        {
          "indexed": false,
          "name": "destination",
          "type": "address"
        },
        {
          "indexed": false,
          "name": "value",
          "type": "uint256"
        },
        {
          "indexed": false,
          "name": "data",
          "type": "bytes"
        }
      ],
      "name": "ExecutionFailure",
      "type": "event"
    },
    {
      "anonymous": false,
      "inputs": [
        {
          "indexed": false,
          "name": "recoveryAddress",
          "type": "address"
        },
        {
          "indexed": false,
          "name": "timedelta",
          "type": "uint256"
        }
      ],
      "name": "NewRecoveryAddress",
      "type": "event"
    },
    {
      "anonymous": false,
      "inputs": [
        {
          "indexed": true,
          "name": "previousOwner",
          "type": "address"
        },
        {
          "indexed": true,
          "name": "newOwner",
          "type": "address"
        }
      ],
      "name": "OwnershipTransferred",
      "type": "event"
    },
    {
      "constant": true,
      "inputs": [],
      "name": "timeTillDeadline",
      "outputs": [
        {
          "name": "",
          "type": "uint256"
        }
      ],
      "payable": false,
      "stateMutability": "view",
      "type": "function"
    },
    {
      "constant": true,
      "inputs": [],
      "name": "isRecoverable",
      "outputs": [
        {
          "name": "",
          "type": "bool"
        }
      ],
      "payable": false,
      "stateMutability": "view",
      "type": "function"
    },
    {
      "constant": false,
      "inputs": [
        {
          "name": "assets",
          "type": "address[]"
        }
      ],
      "name": "setRecoverableAssets",
      "outputs": [],
      "payable": false,
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "constant": false,
      "inputs": [
        {
          "name": "to",
          "type": "address"
        },
        {
          "name": "value",
          "type": "uint256"
        }
      ],
      "name": "sendEth",
      "outputs": [],
      "payable": true,
      "stateMutability": "payable",
      "type": "function"
    },
    {
      "constant": false,
      "inputs": [],
      "name": "iAmAlive",
      "outputs": [
        {
          "name": "",
          "type": "bool"
        }
      ],
      "payable": false,
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "constant": false,
      "inputs": [
        {
          "name": "_recoveryAddress",
          "type": "address"
        },
        {
          "name": "_timedelta",
          "type": "uint256"
        }
      ],
      "name": "setRecoveryAddress",
      "outputs": [],
      "payable": false,
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "constant": false,
      "inputs": [],
      "name": "recoverFunds",
      "outputs": [],
      "payable": false,
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "constant": false,
      "inputs": [
        {
          "name": "destination",
          "type": "address"
        },
        {
          "name": "value",
          "type": "uint256"
        },
        {
          "name": "data",
          "type": "bytes"
        }
      ],
      "name": "executeTransaction",
      "outputs": [
        {
          "name": "",
          "type": "bool"
        }
      ],
      "payable": false,
      "stateMutability": "nonpayable",
      "type": "function"
    }
  ],
  "metadata": "{\"compiler\":{\"version\":\"0.5.8+commit.23d335f2\"},\"language\":\"Solidity\",\"output\":{\"abi\":[{\"constant\":true,\"inputs\":[],\"name\":\"timedelta\",\"outputs\":[{\"name\":\"\",\"type\":\"uint256\"}],\"payable\":false,\"stateMutability\":\"view\",\"type\":\"function\"},{\"constant\":true,\"inputs\":[],\"name\":\"word\",\"outputs\":[{\"name\":\"\",\"type\":\"string\"}],\"payable\":false,\"stateMutability\":\"view\",\"type\":\"function\"},{\"constant\":false,\"inputs\":[{\"name\":\"assets\",\"type\":\"address[]\"}],\"name\":\"setRecoverableAssets\",\"outputs\":[],\"payable\":false,\"stateMutability\":\"nonpayable\",\"type\":\"function\"},{\"constant\":false,\"inputs\":[{\"name\":\"destination\",\"type\":\"address\"},{\"name\":\"value\",\"type\":\"uint256\"},{\"name\":\"data\",\"type\":\"bytes\"}],\"name\":\"executeTransaction\",\"outputs\":[{\"name\":\"\",\"type\":\"bool\"}],\"payable\":false,\"stateMutability\":\"nonpayable\",\"type\":\"function\"},{\"constant\":false,\"inputs\":[{\"name\":\"to\",\"type\":\"address\"},{\"name\":\"value\",\"type\":\"uint256\"}],\"name\":\"sendEth\",\"outputs\":[],\"payable\":true,\"stateMutability\":\"payable\",\"type\":\"function\"},{\"constant\":false,\"inputs\":[{\"name\":\"_recoveryAddress\",\"type\":\"address\"},{\"name\":\"_timedelta\",\"type\":\"uint256\"}],\"name\":\"setRecoveryAddress\",\"outputs\":[],\"payable\":false,\"stateMutability\":\"nonpayable\",\"type\":\"function\"},{\"constant\":true,\"inputs\":[],\"name\":\"recoveryAddress\",\"outputs\":[{\"name\":\"\",\"type\":\"address\"}],\"payable\":false,\"stateMutability\":\"view\",\"type\":\"function\"},{\"constant\":false,\"inputs\":[],\"name\":\"renounceOwnership\",\"outputs\":[],\"payable\":false,\"stateMutability\":\"nonpayable\",\"type\":\"function\"},{\"constant\":true,\"inputs\":[],\"name\":\"timeTillDeadline\",\"outputs\":[{\"name\":\"\",\"type\":\"uint256\"}],\"payable\":false,\"stateMutability\":\"view\",\"type\":\"function\"},{\"constant\":true,\"inputs\":[],\"name\":\"owner\",\"outputs\":[{\"name\":\"\",\"type\":\"address\"}],\"payable\":false,\"stateMutability\":\"view\",\"type\":\"function\"},{\"constant\":true,\"inputs\":[],\"name\":\"isOwner\",\"outputs\":[{\"name\":\"\",\"type\":\"bool\"}],\"payable\":false,\"stateMutability\":\"view\",\"type\":\"function\"},{\"constant\":false,\"inputs\":[],\"name\":\"recoverFunds\",\"outputs\":[],\"payable\":false,\"stateMutability\":\"nonpayable\",\"type\":\"function\"},{\"constant\":false,\"inputs\":[],\"name\":\"iAmAlive\",\"outputs\":[{\"name\":\"\",\"type\":\"bool\"}],\"payable\":false,\"stateMutability\":\"nonpayable\",\"type\":\"function\"},{\"constant\":true,\"inputs\":[],\"name\":\"isRecoverable\",\"outputs\":[{\"name\":\"\",\"type\":\"bool\"}],\"payable\":false,\"stateMutability\":\"view\",\"type\":\"function\"},{\"constant\":true,\"inputs\":[],\"name\":\"lastCall\",\"outputs\":[{\"name\":\"\",\"type\":\"uint256\"}],\"payable\":false,\"stateMutability\":\"view\",\"type\":\"function\"},{\"constant\":true,\"inputs\":[{\"name\":\"\",\"type\":\"uint256\"}],\"name\":\"recoverableAssets\",\"outputs\":[{\"name\":\"\",\"type\":\"address\"}],\"payable\":false,\"stateMutability\":\"view\",\"type\":\"function\"},{\"constant\":false,\"inputs\":[{\"name\":\"newOwner\",\"type\":\"address\"}],\"name\":\"transferOwnership\",\"outputs\":[],\"payable\":false,\"stateMutability\":\"nonpayable\",\"type\":\"function\"},{\"inputs\":[{\"name\":\"assets\",\"type\":\"address[]\"}],\"payable\":false,\"stateMutability\":\"nonpayable\",\"type\":\"constructor\"},{\"payable\":true,\"stateMutability\":\"payable\",\"type\":\"fallback\"},{\"anonymous\":false,\"inputs\":[{\"indexed\":false,\"name\":\"destination\",\"type\":\"address\"},{\"indexed\":false,\"name\":\"value\",\"type\":\"uint256\"},{\"indexed\":false,\"name\":\"data\",\"type\":\"bytes\"}],\"name\":\"Execution\",\"type\":\"event\"},{\"anonymous\":false,\"inputs\":[{\"indexed\":false,\"name\":\"destination\",\"type\":\"address\"},{\"indexed\":false,\"name\":\"value\",\"type\":\"uint256\"},{\"indexed\":false,\"name\":\"data\",\"type\":\"bytes\"}],\"name\":\"ExecutionFailure\",\"type\":\"event\"},{\"anonymous\":false,\"inputs\":[{\"indexed\":false,\"name\":\"recoveryAddress\",\"type\":\"address\"},{\"indexed\":false,\"name\":\"timedelta\",\"type\":\"uint256\"}],\"name\":\"NewRecoveryAddress\",\"type\":\"event\"},{\"anonymous\":false,\"inputs\":[{\"indexed\":true,\"name\":\"previousOwner\",\"type\":\"address\"},{\"indexed\":true,\"name\":\"newOwner\",\"type\":\"address\"}],\"name\":\"OwnershipTransferred\",\"type\":\"event\"}],\"devdoc\":{\"methods\":{\"iAmAlive()\":{\"details\":\"extend the deadline for recovery\"},\"isOwner()\":{\"details\":\"Returns true if the caller is the current owner.\"},\"owner()\":{\"details\":\"Returns the address of the current owner.\"},\"renounceOwnership()\":{\"details\":\"Leaves the contract without owner. It will not be possible to call `onlyOwner` functions anymore. Can only be called by the current owner.     * NOTE: Renouncing ownership will leave the contract without an owner, thereby removing any functionality that is only available to the owner.\"},\"transferOwnership(address)\":{\"details\":\"Transfers ownership of the contract to a new account (`newOwner`). Can only be called by the current owner.\"}}},\"userdoc\":{\"methods\":{}}},\"settings\":{\"compilationTarget\":{\"/C/lib/10DEV/ethwaterloo-contract-account-metamask-plugin/truffle/contracts/DCWallet.sol\":\"DCWallet\"},\"evmVersion\":\"petersburg\",\"libraries\":{},\"optimizer\":{\"enabled\":false,\"runs\":200},\"remappings\":[]},\"sources\":{\"/C/lib/10DEV/ethwaterloo-contract-account-metamask-plugin/truffle/contracts/DCWallet.sol\":{\"keccak256\":\"0xc06b14903e3757c2e8aa034e3dbfddf678e51656b5e87519b4a2da974089ca38\",\"urls\":[\"bzzr://f2abb67f9c7cdc54b1344d0918eff2febf50670985f2ee8b53fe247db0c9ee69\"]},\"@openzeppelin/contracts/GSN/Context.sol\":{\"keccak256\":\"0x90a3995645af7562d84b9d69363ffa5ae7217714ab61e951bf7bc450f40e4061\",\"urls\":[\"bzzr://51482c01bddf23793bddee43b60ab9578a62948a4f2082def24ea792a553b055\"]},\"@openzeppelin/contracts/ownership/Ownable.sol\":{\"keccak256\":\"0xecd8ab29d9a5771c3964d0cd1788c4a5098a0081b20fb275da850a22b1c59806\",\"urls\":[\"bzzr://4950def18270142a78d503ef6b7b13bdb053f2f050cee50c883cd7cab2bb02d7\"]},\"@openzeppelin/contracts/token/ERC20/IERC20.sol\":{\"keccak256\":\"0xe5bb0f57cff3e299f360052ba50f1ea0fff046df2be070b6943e0e3c3fdad8a9\",\"urls\":[\"bzzr://cf2d583b8dce38d0617fdcd65f2fd9f126fe17b7f683b5a515ea9d2762d8b062\"]}},\"version\":1}",
  "bytecode": "0x60806040523480156200001157600080fd5b50604051620019e3380380620019e3833981018060405260208110156200003757600080fd5b8101908080516401000000008111156200005057600080fd5b828101905060208101848111156200006757600080fd5b81518560208202830111640100000000821117156200008557600080fd5b50509291905050506200009d6200017060201b60201c565b6000806101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908373ffffffffffffffffffffffffffffffffffffffff1602179055506000809054906101000a900473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16600073ffffffffffffffffffffffffffffffffffffffff167f8be0079c531659141344cd1fd0a4f28419497f9722a3daafe3b4186f6b6457e060405160405180910390a362000169816200017860201b60201c565b5062000303565b600033905090565b620001886200029d60201b60201c565b620001fb576040517f08c379a00000000000000000000000000000000000000000000000000000000081526004018080602001828103825260208152602001807f4f776e61626c653a2063616c6c6572206973206e6f7420746865206f776e657281525060200191505060405180910390fd5b60008090505b81518160ff16101562000299576004828260ff16815181106200022057fe5b602002602001015190806001815401808255809150509060018203906000526020600020016000909192909190916101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908373ffffffffffffffffffffffffffffffffffffffff16021790555050808060010191505062000201565b5050565b60008060009054906101000a900473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16620002e76200017060201b60201c565b73ffffffffffffffffffffffffffffffffffffffff1614905090565b6116d080620003136000396000f3fe6080604052600436106100fe5760003560e01c80638279018e11610095578063ca1d3e5811610064578063ca1d3e5814610569578063d724114414610598578063da516aa9146105c7578063dd67d285146105f2578063f2fde38b1461066d576100fe565b80638279018e146104a15780638da5cb5b146104cc5780638f32d59b14610523578063b79550be14610552576100fe565b806349dcbc5e116100d157806349dcbc5e1461038a5780636e0aa30d146103d8578063710eb26c14610433578063715018a61461048a576100fe565b806328dede7a146101005780632f64d3861461012b5780633edd22e0146101bb5780633f579f4214610280575b005b34801561010c57600080fd5b506101156106be565b6040518082815260200191505060405180910390f35b34801561013757600080fd5b506101406106c4565b6040518080602001828103825283818151815260200191508051906020019080838360005b83811015610180578082015181840152602081019050610165565b50505050905090810190601f1680156101ad5780820380516001836020036101000a031916815260200191505b509250505060405180910390f35b3480156101c757600080fd5b5061027e600480360360208110156101de57600080fd5b81019080803590602001906401000000008111156101fb57600080fd5b82018360208201111561020d57600080fd5b8035906020019184602083028401116401000000008311171561022f57600080fd5b919080806020026020016040519081016040528093929190818152602001838360200280828437600081840152601f19601f820116905080830192505050505050509192919290505050610762565b005b34801561028c57600080fd5b50610370600480360360608110156102a357600080fd5b81019080803573ffffffffffffffffffffffffffffffffffffffff16906020019092919080359060200190929190803590602001906401000000008111156102ea57600080fd5b8201836020820111156102fc57600080fd5b8035906020019184600183028401116401000000008311171561031e57600080fd5b91908080601f016020809104026020016040519081016040528093929190818152602001838380828437600081840152601f19601f82011690508083019250505050505050919291929050505061087b565b604051808215151515815260200191505060405180910390f35b6103d6600480360360408110156103a057600080fd5b81019080803573ffffffffffffffffffffffffffffffffffffffff16906020019092919080359060200190929190505050610ae6565b005b3480156103e457600080fd5b50610431600480360360408110156103fb57600080fd5b81019080803573ffffffffffffffffffffffffffffffffffffffff16906020019092919080359060200190929190505050610bb2565b005b34801561043f57600080fd5b50610448610ded565b604051808273ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200191505060405180910390f35b34801561049657600080fd5b5061049f610e13565b005b3480156104ad57600080fd5b506104b6610f4c565b6040518082815260200191505060405180910390f35b3480156104d857600080fd5b506104e1610f74565b604051808273ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200191505060405180910390f35b34801561052f57600080fd5b50610538610f9d565b604051808215151515815260200191505060405180910390f35b34801561055e57600080fd5b50610567610ffb565b005b34801561057557600080fd5b5061057e611314565b604051808215151515815260200191505060405180910390f35b3480156105a457600080fd5b506105ad61139e565b604051808215151515815260200191505060405180910390f35b3480156105d357600080fd5b506105dc6113af565b6040518082815260200191505060405180910390f35b3480156105fe57600080fd5b5061062b6004803603602081101561061557600080fd5b81019080803590602001909291905050506113b5565b604051808273ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200191505060405180910390f35b34801561067957600080fd5b506106bc6004803603602081101561069057600080fd5b81019080803573ffffffffffffffffffffffffffffffffffffffff1690602001909291905050506113f1565b005b60025481565b60018054600181600116156101000203166002900480601f01602080910402602001604051908101604052809291908181526020018280546001816001161561010002031660029004801561075a5780601f1061072f5761010080835404028352916020019161075a565b820191906000526020600020905b81548152906001019060200180831161073d57829003601f168201915b505050505081565b61076a610f9d565b6107dc576040517f08c379a00000000000000000000000000000000000000000000000000000000081526004018080602001828103825260208152602001807f4f776e61626c653a2063616c6c6572206973206e6f7420746865206f776e657281525060200191505060405180910390fd5b60008090505b81518160ff161015610877576004828260ff16815181106107ff57fe5b602002602001015190806001815401808255809150509060018203906000526020600020016000909192909190916101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908373ffffffffffffffffffffffffffffffffffffffff1602179055505080806001019150506107e2565b5050565b60004260038190555061088c610f9d565b6108fe576040517f08c379a00000000000000000000000000000000000000000000000000000000081526004018080602001828103825260208152602001807f4f776e61626c653a2063616c6c6572206973206e6f7420746865206f776e657281525060200191505060405180910390fd5b60008251905060006040516020850160008285838a8c6187965a03f1925050508015610a01577f39f46e1dedea184144e3feaf4e595d78345d9a9d8b43da87912efbe4df3c8a31868686604051808473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200183815260200180602001828103825283818151815260200191508051906020019080838360005b838110156109c05780820151818401526020810190506109a5565b50505050905090810190601f1680156109ed5780820380516001836020036101000a031916815260200191505b5094505050505060405180910390a1610ada565b7f8d1ecf04e6462600e647fec505da5fb931c5d7e2c8171df5f6629beab50ec07f868686604051808473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200183815260200180602001828103825283818151815260200191508051906020019080838360005b83811015610a9d578082015181840152602081019050610a82565b50505050905090810190601f168015610aca5780820380516001836020036101000a031916815260200191505b5094505050505060405180910390a15b80925050509392505050565b42600381905550610af5610f9d565b610b67576040517f08c379a00000000000000000000000000000000000000000000000000000000081526004018080602001828103825260208152602001807f4f776e61626c653a2063616c6c6572206973206e6f7420746865206f776e657281525060200191505060405180910390fd5b8173ffffffffffffffffffffffffffffffffffffffff166108fc829081150290604051600060405180830381858888f19350505050158015610bad573d6000803e3d6000fd5b505050565b42600381905550610bc1610f9d565b610c33576040517f08c379a00000000000000000000000000000000000000000000000000000000081526004018080602001828103825260208152602001807f4f776e61626c653a2063616c6c6572206973206e6f7420746865206f776e657281525060200191505060405180910390fd5b600073ffffffffffffffffffffffffffffffffffffffff16600560009054906101000a900473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff161415610cdb576040517f08c379a000000000000000000000000000000000000000000000000000000000815260040180806020018281038252604681526020018061165f6046913960600191505060405180910390fd5b600060025411610d36576040517f08c379a00000000000000000000000000000000000000000000000000000000081526004018080602001828103825260428152602001806115c46042913960600191505060405180910390fd5b81600560006101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908373ffffffffffffffffffffffffffffffffffffffff160217905550806002819055507f8e7e07164e47f39ab18231583961a0183b6793ced0fe014567517d2032b530c38282604051808373ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff1681526020018281526020019250505060405180910390a15050565b600560009054906101000a900473ffffffffffffffffffffffffffffffffffffffff1681565b610e1b610f9d565b610e8d576040517f08c379a00000000000000000000000000000000000000000000000000000000081526004018080602001828103825260208152602001807f4f776e61626c653a2063616c6c6572206973206e6f7420746865206f776e657281525060200191505060405180910390fd5b600073ffffffffffffffffffffffffffffffffffffffff166000809054906101000a900473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff167f8be0079c531659141344cd1fd0a4f28419497f9722a3daafe3b4186f6b6457e060405160405180910390a360008060006101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908373ffffffffffffffffffffffffffffffffffffffff160217905550565b600060025460035401421015610f6c574260025460035401039050610f71565b600090505b90565b60008060009054906101000a900473ffffffffffffffffffffffffffffffffffffffff16905090565b60008060009054906101000a900473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16610fdf611477565b73ffffffffffffffffffffffffffffffffffffffff1614905090565b61100361139e565b611058576040517f08c379a000000000000000000000000000000000000000000000000000000000815260040180806020018281038252603381526020018061162c6033913960400191505060405180910390fd5b60008090505b6004805490508160ff16101561129157600060048260ff168154811061108057fe5b9060005260206000200160009054906101000a900473ffffffffffffffffffffffffffffffffffffffff16905060048260ff16815481106110bd57fe5b9060005260206000200160009054906101000a900473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff1663a9059cbb600560009054906101000a900473ffffffffffffffffffffffffffffffffffffffff168373ffffffffffffffffffffffffffffffffffffffff166370a08231306040518263ffffffff1660e01b8152600401808273ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200191505060206040518083038186803b1580156111a357600080fd5b505afa1580156111b7573d6000803e3d6000fd5b505050506040513d60208110156111cd57600080fd5b81019080805190602001909291905050506040518363ffffffff1660e01b8152600401808373ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200182815260200192505050602060405180830381600087803b15801561124757600080fd5b505af115801561125b573d6000803e3d6000fd5b505050506040513d602081101561127157600080fd5b81019080805190602001909291905050505050808060010191505061105e565b50600560009054906101000a900473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff166108fc3073ffffffffffffffffffffffffffffffffffffffff16319081150290604051600060405180830381858888f19350505050158015611311573d6000803e3d6000fd5b50565b600042600381905550611325610f9d565b611397576040517f08c379a00000000000000000000000000000000000000000000000000000000081526004018080602001828103825260208152602001807f4f776e61626c653a2063616c6c6572206973206e6f7420746865206f776e657281525060200191505060405180910390fd5b6001905090565b600060025460035401421015905090565b60035481565b600481815481106113c257fe5b906000526020600020016000915054906101000a900473ffffffffffffffffffffffffffffffffffffffff1681565b6113f9610f9d565b61146b576040517f08c379a00000000000000000000000000000000000000000000000000000000081526004018080602001828103825260208152602001807f4f776e61626c653a2063616c6c6572206973206e6f7420746865206f776e657281525060200191505060405180910390fd5b6114748161147f565b50565b600033905090565b600073ffffffffffffffffffffffffffffffffffffffff168173ffffffffffffffffffffffffffffffffffffffff161415611505576040517f08c379a00000000000000000000000000000000000000000000000000000000081526004018080602001828103825260268152602001806116066026913960400191505060405180910390fd5b8073ffffffffffffffffffffffffffffffffffffffff166000809054906101000a900473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff167f8be0079c531659141344cd1fd0a4f28419497f9722a3daafe3b4186f6b6457e060405160405180910390a3806000806101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908373ffffffffffffffffffffffffffffffffffffffff1602179055505056fe23444357616c6c6574207365745265636f766572794164647265737328293a2074696d6564656c7461206d75737420626520626967676572207468616e207a65726f4f776e61626c653a206e6577206f776e657220697320746865207a65726f206164647265737323444357616c6c6574207265636f76657246756e647328293a2057616c6c6574206973206e6f74207265636f76657261626c6523444357616c6c6574207365745265636f766572794164647265737328293a207265636f76657279416464726573732063616e6e6f74206265207a65726f2061646472657373a165627a7a72305820af5a77043b8f7d30216863fe66d62a8a4ca70d8c9880e46a4d5d022f7f87292b0029",
  "deployedBytecode": "0x6080604052600436106100fe5760003560e01c80638279018e11610095578063ca1d3e5811610064578063ca1d3e5814610569578063d724114414610598578063da516aa9146105c7578063dd67d285146105f2578063f2fde38b1461066d576100fe565b80638279018e146104a15780638da5cb5b146104cc5780638f32d59b14610523578063b79550be14610552576100fe565b806349dcbc5e116100d157806349dcbc5e1461038a5780636e0aa30d146103d8578063710eb26c14610433578063715018a61461048a576100fe565b806328dede7a146101005780632f64d3861461012b5780633edd22e0146101bb5780633f579f4214610280575b005b34801561010c57600080fd5b506101156106be565b6040518082815260200191505060405180910390f35b34801561013757600080fd5b506101406106c4565b6040518080602001828103825283818151815260200191508051906020019080838360005b83811015610180578082015181840152602081019050610165565b50505050905090810190601f1680156101ad5780820380516001836020036101000a031916815260200191505b509250505060405180910390f35b3480156101c757600080fd5b5061027e600480360360208110156101de57600080fd5b81019080803590602001906401000000008111156101fb57600080fd5b82018360208201111561020d57600080fd5b8035906020019184602083028401116401000000008311171561022f57600080fd5b919080806020026020016040519081016040528093929190818152602001838360200280828437600081840152601f19601f820116905080830192505050505050509192919290505050610762565b005b34801561028c57600080fd5b50610370600480360360608110156102a357600080fd5b81019080803573ffffffffffffffffffffffffffffffffffffffff16906020019092919080359060200190929190803590602001906401000000008111156102ea57600080fd5b8201836020820111156102fc57600080fd5b8035906020019184600183028401116401000000008311171561031e57600080fd5b91908080601f016020809104026020016040519081016040528093929190818152602001838380828437600081840152601f19601f82011690508083019250505050505050919291929050505061087b565b604051808215151515815260200191505060405180910390f35b6103d6600480360360408110156103a057600080fd5b81019080803573ffffffffffffffffffffffffffffffffffffffff16906020019092919080359060200190929190505050610ae6565b005b3480156103e457600080fd5b50610431600480360360408110156103fb57600080fd5b81019080803573ffffffffffffffffffffffffffffffffffffffff16906020019092919080359060200190929190505050610bb2565b005b34801561043f57600080fd5b50610448610ded565b604051808273ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200191505060405180910390f35b34801561049657600080fd5b5061049f610e13565b005b3480156104ad57600080fd5b506104b6610f4c565b6040518082815260200191505060405180910390f35b3480156104d857600080fd5b506104e1610f74565b604051808273ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200191505060405180910390f35b34801561052f57600080fd5b50610538610f9d565b604051808215151515815260200191505060405180910390f35b34801561055e57600080fd5b50610567610ffb565b005b34801561057557600080fd5b5061057e611314565b604051808215151515815260200191505060405180910390f35b3480156105a457600080fd5b506105ad61139e565b604051808215151515815260200191505060405180910390f35b3480156105d357600080fd5b506105dc6113af565b6040518082815260200191505060405180910390f35b3480156105fe57600080fd5b5061062b6004803603602081101561061557600080fd5b81019080803590602001909291905050506113b5565b604051808273ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200191505060405180910390f35b34801561067957600080fd5b506106bc6004803603602081101561069057600080fd5b81019080803573ffffffffffffffffffffffffffffffffffffffff1690602001909291905050506113f1565b005b60025481565b60018054600181600116156101000203166002900480601f01602080910402602001604051908101604052809291908181526020018280546001816001161561010002031660029004801561075a5780601f1061072f5761010080835404028352916020019161075a565b820191906000526020600020905b81548152906001019060200180831161073d57829003601f168201915b505050505081565b61076a610f9d565b6107dc576040517f08c379a00000000000000000000000000000000000000000000000000000000081526004018080602001828103825260208152602001807f4f776e61626c653a2063616c6c6572206973206e6f7420746865206f776e657281525060200191505060405180910390fd5b60008090505b81518160ff161015610877576004828260ff16815181106107ff57fe5b602002602001015190806001815401808255809150509060018203906000526020600020016000909192909190916101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908373ffffffffffffffffffffffffffffffffffffffff1602179055505080806001019150506107e2565b5050565b60004260038190555061088c610f9d565b6108fe576040517f08c379a00000000000000000000000000000000000000000000000000000000081526004018080602001828103825260208152602001807f4f776e61626c653a2063616c6c6572206973206e6f7420746865206f776e657281525060200191505060405180910390fd5b60008251905060006040516020850160008285838a8c6187965a03f1925050508015610a01577f39f46e1dedea184144e3feaf4e595d78345d9a9d8b43da87912efbe4df3c8a31868686604051808473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200183815260200180602001828103825283818151815260200191508051906020019080838360005b838110156109c05780820151818401526020810190506109a5565b50505050905090810190601f1680156109ed5780820380516001836020036101000a031916815260200191505b5094505050505060405180910390a1610ada565b7f8d1ecf04e6462600e647fec505da5fb931c5d7e2c8171df5f6629beab50ec07f868686604051808473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200183815260200180602001828103825283818151815260200191508051906020019080838360005b83811015610a9d578082015181840152602081019050610a82565b50505050905090810190601f168015610aca5780820380516001836020036101000a031916815260200191505b5094505050505060405180910390a15b80925050509392505050565b42600381905550610af5610f9d565b610b67576040517f08c379a00000000000000000000000000000000000000000000000000000000081526004018080602001828103825260208152602001807f4f776e61626c653a2063616c6c6572206973206e6f7420746865206f776e657281525060200191505060405180910390fd5b8173ffffffffffffffffffffffffffffffffffffffff166108fc829081150290604051600060405180830381858888f19350505050158015610bad573d6000803e3d6000fd5b505050565b42600381905550610bc1610f9d565b610c33576040517f08c379a00000000000000000000000000000000000000000000000000000000081526004018080602001828103825260208152602001807f4f776e61626c653a2063616c6c6572206973206e6f7420746865206f776e657281525060200191505060405180910390fd5b600073ffffffffffffffffffffffffffffffffffffffff16600560009054906101000a900473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff161415610cdb576040517f08c379a000000000000000000000000000000000000000000000000000000000815260040180806020018281038252604681526020018061165f6046913960600191505060405180910390fd5b600060025411610d36576040517f08c379a00000000000000000000000000000000000000000000000000000000081526004018080602001828103825260428152602001806115c46042913960600191505060405180910390fd5b81600560006101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908373ffffffffffffffffffffffffffffffffffffffff160217905550806002819055507f8e7e07164e47f39ab18231583961a0183b6793ced0fe014567517d2032b530c38282604051808373ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff1681526020018281526020019250505060405180910390a15050565b600560009054906101000a900473ffffffffffffffffffffffffffffffffffffffff1681565b610e1b610f9d565b610e8d576040517f08c379a00000000000000000000000000000000000000000000000000000000081526004018080602001828103825260208152602001807f4f776e61626c653a2063616c6c6572206973206e6f7420746865206f776e657281525060200191505060405180910390fd5b600073ffffffffffffffffffffffffffffffffffffffff166000809054906101000a900473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff167f8be0079c531659141344cd1fd0a4f28419497f9722a3daafe3b4186f6b6457e060405160405180910390a360008060006101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908373ffffffffffffffffffffffffffffffffffffffff160217905550565b600060025460035401421015610f6c574260025460035401039050610f71565b600090505b90565b60008060009054906101000a900473ffffffffffffffffffffffffffffffffffffffff16905090565b60008060009054906101000a900473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16610fdf611477565b73ffffffffffffffffffffffffffffffffffffffff1614905090565b61100361139e565b611058576040517f08c379a000000000000000000000000000000000000000000000000000000000815260040180806020018281038252603381526020018061162c6033913960400191505060405180910390fd5b60008090505b6004805490508160ff16101561129157600060048260ff168154811061108057fe5b9060005260206000200160009054906101000a900473ffffffffffffffffffffffffffffffffffffffff16905060048260ff16815481106110bd57fe5b9060005260206000200160009054906101000a900473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff1663a9059cbb600560009054906101000a900473ffffffffffffffffffffffffffffffffffffffff168373ffffffffffffffffffffffffffffffffffffffff166370a08231306040518263ffffffff1660e01b8152600401808273ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200191505060206040518083038186803b1580156111a357600080fd5b505afa1580156111b7573d6000803e3d6000fd5b505050506040513d60208110156111cd57600080fd5b81019080805190602001909291905050506040518363ffffffff1660e01b8152600401808373ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200182815260200192505050602060405180830381600087803b15801561124757600080fd5b505af115801561125b573d6000803e3d6000fd5b505050506040513d602081101561127157600080fd5b81019080805190602001909291905050505050808060010191505061105e565b50600560009054906101000a900473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff166108fc3073ffffffffffffffffffffffffffffffffffffffff16319081150290604051600060405180830381858888f19350505050158015611311573d6000803e3d6000fd5b50565b600042600381905550611325610f9d565b611397576040517f08c379a00000000000000000000000000000000000000000000000000000000081526004018080602001828103825260208152602001807f4f776e61626c653a2063616c6c6572206973206e6f7420746865206f776e657281525060200191505060405180910390fd5b6001905090565b600060025460035401421015905090565b60035481565b600481815481106113c257fe5b906000526020600020016000915054906101000a900473ffffffffffffffffffffffffffffffffffffffff1681565b6113f9610f9d565b61146b576040517f08c379a00000000000000000000000000000000000000000000000000000000081526004018080602001828103825260208152602001807f4f776e61626c653a2063616c6c6572206973206e6f7420746865206f776e657281525060200191505060405180910390fd5b6114748161147f565b50565b600033905090565b600073ffffffffffffffffffffffffffffffffffffffff168173ffffffffffffffffffffffffffffffffffffffff161415611505576040517f08c379a00000000000000000000000000000000000000000000000000000000081526004018080602001828103825260268152602001806116066026913960400191505060405180910390fd5b8073ffffffffffffffffffffffffffffffffffffffff166000809054906101000a900473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff167f8be0079c531659141344cd1fd0a4f28419497f9722a3daafe3b4186f6b6457e060405160405180910390a3806000806101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908373ffffffffffffffffffffffffffffffffffffffff1602179055505056fe23444357616c6c6574207365745265636f766572794164647265737328293a2074696d6564656c7461206d75737420626520626967676572207468616e207a65726f4f776e61626c653a206e6577206f776e657220697320746865207a65726f206164647265737323444357616c6c6574207265636f76657246756e647328293a2057616c6c6574206973206e6f74207265636f76657261626c6523444357616c6c6574207365745265636f766572794164647265737328293a207265636f76657279416464726573732063616e6e6f74206265207a65726f2061646472657373a165627a7a72305820af5a77043b8f7d30216863fe66d62a8a4ca70d8c9880e46a4d5d022f7f87292b0029",
  "sourceMap": "152:3898:0:-;;;599:91;8:9:-1;5:2;;;30:1;27;20:12;5:2;599:91:0;;;;;;;;;;;;;;;13:2:-1;8:3;5:11;2:2;;;29:1;26;19:12;2:2;599:91:0;;;;;;19:11:-1;14:3;11:20;8:2;;;44:1;41;34:12;8:2;71:11;66:3;62:21;55:28;;123:4;118:3;114:14;159:9;141:16;138:31;135:2;;;182:1;179;172:12;135:2;219:3;213:10;331:9;325:2;311:12;307:21;289:16;285:44;282:59;261:11;247:12;244:29;233:116;230:2;;;362:1;359;352:12;230:2;0:373;;599:91:0;;;;;;707:12:6;:10;;;:12;;:::i;:::-;698:6;;:21;;;;;;;;;;;;;;;;;;767:6;;;;;;;;;;;734:40;;763:1;734:40;;;;;;;;;;;;654:28:0;675:6;654:20;;;:28;;:::i;:::-;599:91;152:3898;;788:96:4;833:15;867:10;860:17;;788:96;:::o;1084:192:0:-;1061:9:6;:7;;;:9;;:::i;:::-;1053:54;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;1172:7:0;1182:1;1172:11;;1167:102;1189:6;:13;1185:1;:17;;;1167:102;;;1224:17;1247:6;1254:1;1247:9;;;;;;;;;;;;;;;;1224:33;;39:1:-1;33:3;27:10;23:18;57:10;52:3;45:23;79:10;72:17;;0:93;1224:33:0;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;1204:3;;;;;;;1167:102;;;;1084:192;:::o;1208:92:6:-;1248:4;1287:6;;;;;;;;;;;1271:22;;:12;:10;;;:12;;:::i;:::-;:22;;;1264:29;;1208:92;:::o;152:3898:0:-;;;;;;;",
  "deployedSourceMap": "152:3898:0:-;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;213:21;;8:9:-1;5:2;;;30:1;27;20:12;5:2;213:21:0;;;:::i;:::-;;;;;;;;;;;;;;;;;;;188:18;;8:9:-1;5:2;;;30:1;27;20:12;5:2;188:18:0;;;:::i;:::-;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;23:1:-1;8:100;33:3;30:1;27:10;8:100;;;99:1;94:3;90:11;84:18;80:1;75:3;71:11;64:39;52:2;49:1;45:10;40:15;;8:100;;;12:14;188:18:0;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;1084:192;;8:9:-1;5:2;;;30:1;27;20:12;5:2;1084:192:0;;;;;;13:2:-1;8:3;5:11;2:2;;;29:1;26;19:12;2:2;1084:192:0;;;;;;;;;;21:11:-1;8;5:28;2:2;;;46:1;43;36:12;2:2;1084:192:0;;35:9:-1;28:4;12:14;8:25;5:40;2:2;;;58:1;55;48:12;2:2;1084:192:0;;;;;;101:9:-1;95:2;81:12;77:21;67:8;63:36;60:51;39:11;25:12;22:29;11:108;8:2;;;132:1;129;122:12;8:2;1084:192:0;;;;;;;;;;;;;;;;;;;;;;;;;;;;;30:3:-1;22:6;14;1:33;99:1;93:3;85:6;81:16;74:27;137:4;133:9;126:4;121:3;117:14;113:30;106:37;;169:3;161:6;157:16;147:26;;1084:192:0;;;;;;;;;;;;;;;:::i;:::-;;2623:1385;;8:9:-1;5:2;;;30:1;27;20:12;5:2;2623:1385:0;;;;;;13:2:-1;8:3;5:11;2:2;;;29:1;26;19:12;2:2;2623:1385:0;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;21:11:-1;8;5:28;2:2;;;46:1;43;36:12;2:2;2623:1385:0;;35:9:-1;28:4;12:14;8:25;5:40;2:2;;;58:1;55;48:12;2:2;2623:1385:0;;;;;;100:9:-1;95:1;81:12;77:20;67:8;63:35;60:50;39:11;25:12;22:29;11:107;8:2;;;131:1;128;121:12;8:2;2623:1385:0;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;30:3:-1;22:6;14;1:33;99:1;93:3;85:6;81:16;74:27;137:4;133:9;126:4;121:3;117:14;113:30;106:37;;169:3;161:6;157:16;147:26;;2623:1385:0;;;;;;;;;;;;;;;:::i;:::-;;;;;;;;;;;;;;;;;;;;;;;1284:126;;;;;;13:2:-1;8:3;5:11;2:2;;;29:1;26;19:12;2:2;1284:126:0;;;;;;;;;;;;;;;;;;;;;;;;;;;;:::i;:::-;;1570:545;;8:9:-1;5:2;;;30:1;27;20:12;5:2;1570:545:0;;;;;;13:2:-1;8:3;5:11;2:2;;;29:1;26;19:12;2:2;1570:545:0;;;;;;;;;;;;;;;;;;;;;;;;;;;;:::i;:::-;;337:38;;8:9:-1;5:2;;;30:1;27;20:12;5:2;337:38:0;;;:::i;:::-;;;;;;;;;;;;;;;;;;;;;;;1642:137:6;;8:9:-1;5:2;;;30:1;27;20:12;5:2;1642:137:6;;;:::i;:::-;;777:186:0;;8:9:-1;5:2;;;30:1;27;20:12;5:2;777:186:0;;;:::i;:::-;;;;;;;;;;;;;;;;;;;857:77:6;;8:9:-1;5:2;;;30:1;27;20:12;5:2;857:77:6;;;:::i;:::-;;;;;;;;;;;;;;;;;;;;;;;1208:92;;8:9:-1;5:2;;;30:1;27;20:12;5:2;1208:92:6;;;:::i;:::-;;;;;;;;;;;;;;;;;;;;;;;2123:464:0;;8:9:-1;5:2;;;30:1;27;20:12;5:2;2123:464:0;;;:::i;:::-;;1465:97;;8:9:-1;5:2;;;30:1;27;20:12;5:2;1465:97:0;;;:::i;:::-;;;;;;;;;;;;;;;;;;;;;;;971:105;;8:9:-1;5:2;;;30:1;27;20:12;5:2;971:105:0;;;:::i;:::-;;;;;;;;;;;;;;;;;;;;;;;255:20;;8:9:-1;5:2;;;30:1;27;20:12;5:2;255:20:0;;;:::i;:::-;;;;;;;;;;;;;;;;;;;296:34;;8:9:-1;5:2;;;30:1;27;20:12;5:2;296:34:0;;;;;;13:2:-1;8:3;5:11;2:2;;;29:1;26;19:12;2:2;296:34:0;;;;;;;;;;;;;;;;;:::i;:::-;;;;;;;;;;;;;;;;;;;;;;;1928:107:6;;8:9:-1;5:2;;;30:1;27;20:12;5:2;1928:107:6;;;;;;13:2:-1;8:3;5:11;2:2;;;29:1;26;19:12;2:2;1928:107:6;;;;;;;;;;;;;;;;;;;:::i;:::-;;213:21:0;;;;:::o;188:18::-;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;:::o;1084:192::-;1061:9:6;:7;:9::i;:::-;1053:54;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;1172:7:0;1182:1;1172:11;;1167:102;1189:6;:13;1185:1;:17;;;1167:102;;;1224:17;1247:6;1254:1;1247:9;;;;;;;;;;;;;;;;1224:33;;39:1:-1;33:3;27:10;23:18;57:10;52:3;45:23;79:10;72:17;;0:93;1224:33:0;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;1204:3;;;;;;;1167:102;;;;1084:192;:::o;2623:1385::-;2780:4;746:3;735:8;:14;;;;1061:9:6;:7;:9::i;:::-;1053:54;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;2802:15:0;2820:4;:11;2802:29;;2842:11;2903:4;2897:11;3037:2;3031:4;3027:13;3712:1;3692;3583:10;3563:1;3539:5;3509:11;3161:5;3156:3;3152:15;3129:672;3119:682;;2873:939;;3826:6;3822:155;;;3852:35;3862:11;3875:5;3882:4;3852:35;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;23:1:-1;8:100;33:3;30:1;27:10;8:100;;;99:1;94:3;90:11;84:18;80:1;75:3;71:11;64:39;52:2;49:1;45:10;40:15;;8:100;;;12:14;3852:35:0;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;3822:155;;;3923:42;3940:11;3953:5;3960:4;3923:42;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;23:1:-1;8:100;33:3;30:1;27:10;8:100;;;99:1;94:3;90:11;84:18;80:1;75:3;71:11;64:39;52:2;49:1;45:10;40:15;;8:100;;;12:14;3923:42:0;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;3822:155;3994:6;3987:13;;;;2623:1385;;;;;:::o;1284:126::-;746:3;735:8;:14;;;;1061:9:6;:7;:9::i;:::-;1053:54;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;1384:2:0;:11;;:18;1396:5;1384:18;;;;;;;;;;;;;;;;;;;;;;;;8:9:-1;5:2;;;45:16;42:1;39;24:38;77:16;74:1;67:27;5:2;1384:18:0;1284:126;;:::o;1570:545::-;746:3;735:8;:14;;;;1061:9:6;:7;:9::i;:::-;1053:54;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;1755:1:0;1728:29;;:15;;;;;;;;;;;:29;;;;1720:125;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;1876:1;1864:9;;:13;1856:105;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;1992:16;1974:15;;:34;;;;;;;;;;;;;;;;;;2031:10;2019:9;:22;;;;2059:48;2078:16;2096:10;2059:48;;;;;;;;;;;;;;;;;;;;;;;;;;;;1570:545;;:::o;337:38::-;;;;;;;;;;;;;:::o;1642:137:6:-;1061:9;:7;:9::i;:::-;1053:54;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;1740:1;1703:40;;1724:6;;;;;;;;;;;1703:40;;;;;;;;;;;;1770:1;1753:6;;:19;;;;;;;;;;;;;;;;;;1642:137::o;777:186:0:-;826:4;864:9;;853:8;;:20;847:3;:26;843:94;;;922:3;909:9;;898:8;;:20;897:28;890:35;;;;843:94;954:1;947:8;;777:186;;:::o;857:77:6:-;895:7;921:6;;;;;;;;;;;914:13;;857:77;:::o;1208:92::-;1248:4;1287:6;;;;;;;;;;;1271:22;;:12;:10;:12::i;:::-;:22;;;1264:29;;1208:92;:::o;2123:464:0:-;2173:15;:13;:15::i;:::-;2165:79;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;2262:7;2272:1;2262:11;;2257:242;2279:17;:24;;;;2275:1;:28;;;2257:242;;;2325:12;2347:17;2365:1;2347:20;;;;;;;;;;;;;;;;;;;;;;;;;;;2325:43;;2390:17;2408:1;2390:20;;;;;;;;;;;;;;;;;;;;;;;;;;;2383:55;;;2439:15;;;;;;;;;;;2456:5;:15;;;2480:4;2456:30;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;8:9:-1;5:2;;;30:1;27;20:12;5:2;2456:30:0;;;;8:9:-1;5:2;;;45:16;42:1;39;24:38;77:16;74:1;67:27;5:2;2456:30:0;;;;;;;13:2:-1;8:3;5:11;2:2;;;29:1;26;19:12;2:2;2456:30:0;;;;;;;;;;;;;;;;2383:104;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;8:9:-1;5:2;;;30:1;27;20:12;5:2;2383:104:0;;;;8:9:-1;5:2;;;45:16;42:1;39;24:38;77:16;74:1;67:27;5:2;2383:104:0;;;;;;;13:2:-1;8:3;5:11;2:2;;;29:1;26;19:12;2:2;2383:104:0;;;;;;;;;;;;;;;;;2257:242;2305:3;;;;;;;2257:242;;;;2532:15;;;;;;;;;;;:24;;:47;2565:4;2557:21;;;2532:47;;;;;;;;;;;;;;;;;;;;;;;;8:9:-1;5:2;;;45:16;42:1;39;24:38;77:16;74:1;67:27;5:2;2532:47:0;2123:464::o;1465:97::-;1526:4;746:3;735:8;:14;;;;1061:9:6;:7;:9::i;:::-;1053:54;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;1550:4:0;1543:11;;1465:97;:::o;971:105::-;1017:4;1059:9;;1048:8;;:20;1041:3;:27;;1034:34;;971:105;:::o;255:20::-;;;;:::o;296:34::-;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;:::o;1928:107:6:-;1061:9;:7;:9::i;:::-;1053:54;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;2000:28;2019:8;2000:18;:28::i;:::-;1928:107;:::o;788:96:4:-;833:15;867:10;860:17;;788:96;:::o;2136:225:6:-;2229:1;2209:22;;:8;:22;;;;2201:73;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;2318:8;2289:38;;2310:6;;;;;;;;;;;2289:38;;;;;;;;;;;;2346:8;2337:6;;:17;;;;;;;;;;;;;;;;;;2136:225;:::o",
  "source": "pragma solidity >=0.5.0 <0.6.0;\r\n\r\nimport \"@openzeppelin/contracts/token/ERC20/IERC20.sol\";\r\nimport \"@openzeppelin/contracts/ownership/Ownable.sol\";\r\n\r\ncontract DCWallet is Ownable {\r\n    string public word;\r\n    uint public timedelta; // in seconds\r\n    uint public lastCall; // in seconds\r\n    address[] public recoverableAssets;\r\n    address payable public recoveryAddress;\r\n\r\n    event Execution(address destination, uint value, bytes data);\r\n    event ExecutionFailure(address destination, uint value, bytes data);\r\n    event NewRecoveryAddress(address recoveryAddress, uint timedelta);\r\n\r\n    constructor(address[] memory assets) public {\r\n        setRecoverableAssets(assets);\r\n    }\r\n\r\n    modifier updateLastCall() {\r\n        lastCall = now;\r\n        _;\r\n    }\r\n\r\n    function timeTillDeadline() public view returns (uint) {\r\n        if (now < lastCall + timedelta) {\r\n            return (lastCall + timedelta) - now;\r\n        }\r\n        return 0;\r\n    }\r\n\r\n    function isRecoverable() public view returns (bool) {\r\n        return now >= lastCall + timedelta;\r\n    }\r\n\r\n    function setRecoverableAssets(address[] memory assets) public onlyOwner {\r\n        for (uint8 i = 0; i < assets.length; i++) {\r\n            recoverableAssets.push(assets[i]);\r\n        }\r\n    }\r\n\r\n    function sendEth(address payable to, uint value) public payable updateLastCall onlyOwner {\r\n        to.transfer(value);\r\n    }\r\n\r\n    /// @dev extend the deadline for recovery\r\n    function iAmAlive() public updateLastCall onlyOwner returns (bool) {\r\n        return true;\r\n    }\r\n\r\n    function setRecoveryAddress(\r\n        address payable _recoveryAddress,\r\n        uint256 _timedelta\r\n    ) public updateLastCall onlyOwner {\r\n        require(recoveryAddress != address(0),\r\n            \"#DCWallet setRecoveryAddress(): recoveryAddress cannot be zero address\");\r\n        require(timedelta > 0,\r\n            \"#DCWallet setRecoveryAddress(): timedelta must be bigger than zero\");\r\n\r\n        recoveryAddress = _recoveryAddress;\r\n        timedelta = _timedelta;\r\n\r\n        emit NewRecoveryAddress(_recoveryAddress, _timedelta);\r\n    }\r\n\r\n    function recoverFunds() public {\r\n        require(isRecoverable(), \"#DCWallet recoverFunds(): Wallet is not recoverable\");\r\n\r\n        for (uint8 i = 0; i < recoverableAssets.length; i++) {\r\n            IERC20 erc20 = IERC20(recoverableAssets[i]);\r\n            IERC20(recoverableAssets[i])\r\n                .transfer(recoveryAddress, erc20.balanceOf(address(this)));\r\n        }\r\n\r\n        // send ETH\r\n        recoveryAddress.transfer(address(this).balance);\r\n    }\r\n\r\n    // Thank you Gnosis :)\r\n    function executeTransaction(address destination, uint value, bytes memory data)\r\n        public\r\n        updateLastCall\r\n        onlyOwner\r\n        returns (bool)\r\n    {\r\n        uint dataLength = data.length;\r\n        bool result;\r\n        assembly {\r\n            let x := mload(0x40)   // \"Allocate\" memory for output (0x40 is where \"free memory\" pointer is stored by convention)\r\n            let d := add(data, 32) // First 32 bytes are the padded length of data, so exclude that\r\n            result := call(\r\n                sub(gas, 34710),   // 34710 is the value that solidity is currently emitting\r\n                                   // It includes callGas (700) + callVeryLow (3, to pay for SUB) + callValueTransferGas (9000) +\r\n                                   // callNewAccountGas (25000, in case the destination address does not exist and needs creating)\r\n                destination,\r\n                value,\r\n                d,\r\n                dataLength,        // Size of the input (in bytes) - this is what fixes the padding problem\r\n                x,\r\n                0                  // Output is ignored, therefore the output size is zero\r\n            )\r\n        }\r\n        if (result)\r\n            emit Execution(destination, value, data);\r\n        else {\r\n            emit ExecutionFailure(destination, value, data);\r\n        }\r\n        return result;\r\n    }\r\n\r\n    function () external payable {}\r\n}\r\n",
  "sourcePath": "C:/lib/10DEV/ethwaterloo-contract-account-metamask-plugin/truffle/contracts/DCWallet.sol",
  "ast": {
    "absolutePath": "/C/lib/10DEV/ethwaterloo-contract-account-metamask-plugin/truffle/contracts/DCWallet.sol",
    "exportedSymbols": {
      "DCWallet": [
        294
      ]
    },
    "id": 295,
    "nodeType": "SourceUnit",
    "nodes": [
      {
        "id": 1,
        "literals": [
          "solidity",
          ">=",
          "0.5",
          ".0",
          "<",
          "0.6",
          ".0"
        ],
        "nodeType": "PragmaDirective",
        "src": "0:31:0"
      },
      {
        "absolutePath": "@openzeppelin/contracts/token/ERC20/IERC20.sol",
        "file": "@openzeppelin/contracts/token/ERC20/IERC20.sol",
        "id": 2,
        "nodeType": "ImportDirective",
        "scope": 295,
        "sourceUnit": 1296,
        "src": "35:56:0",
        "symbolAliases": [],
        "unitAlias": ""
      },
      {
        "absolutePath": "@openzeppelin/contracts/ownership/Ownable.sol",
        "file": "@openzeppelin/contracts/ownership/Ownable.sol",
        "id": 3,
        "nodeType": "ImportDirective",
        "scope": 295,
        "sourceUnit": 764,
        "src": "93:55:0",
        "symbolAliases": [],
        "unitAlias": ""
      },
      {
        "baseContracts": [
          {
            "arguments": null,
            "baseName": {
              "contractScope": null,
              "id": 4,
              "name": "Ownable",
              "nodeType": "UserDefinedTypeName",
              "referencedDeclaration": 763,
              "src": "173:7:0",
              "typeDescriptions": {
                "typeIdentifier": "t_contract$_Ownable_$763",
                "typeString": "contract Ownable"
              }
            },
            "id": 5,
            "nodeType": "InheritanceSpecifier",
            "src": "173:7:0"
          }
        ],
        "contractDependencies": [
          462,
          763
        ],
        "contractKind": "contract",
        "documentation": null,
        "fullyImplemented": true,
        "id": 294,
        "linearizedBaseContracts": [
          294,
          763,
          462
        ],
        "name": "DCWallet",
        "nodeType": "ContractDefinition",
        "nodes": [
          {
            "constant": false,
            "id": 7,
            "name": "word",
            "nodeType": "VariableDeclaration",
            "scope": 294,
            "src": "188:18:0",
            "stateVariable": true,
            "storageLocation": "default",
            "typeDescriptions": {
              "typeIdentifier": "t_string_storage",
              "typeString": "string"
            },
            "typeName": {
              "id": 6,
              "name": "string",
              "nodeType": "ElementaryTypeName",
              "src": "188:6:0",
              "typeDescriptions": {
                "typeIdentifier": "t_string_storage_ptr",
                "typeString": "string"
              }
            },
            "value": null,
            "visibility": "public"
          },
          {
            "constant": false,
            "id": 9,
            "name": "timedelta",
            "nodeType": "VariableDeclaration",
            "scope": 294,
            "src": "213:21:0",
            "stateVariable": true,
            "storageLocation": "default",
            "typeDescriptions": {
              "typeIdentifier": "t_uint256",
              "typeString": "uint256"
            },
            "typeName": {
              "id": 8,
              "name": "uint",
              "nodeType": "ElementaryTypeName",
              "src": "213:4:0",
              "typeDescriptions": {
                "typeIdentifier": "t_uint256",
                "typeString": "uint256"
              }
            },
            "value": null,
            "visibility": "public"
          },
          {
            "constant": false,
            "id": 11,
            "name": "lastCall",
            "nodeType": "VariableDeclaration",
            "scope": 294,
            "src": "255:20:0",
            "stateVariable": true,
            "storageLocation": "default",
            "typeDescriptions": {
              "typeIdentifier": "t_uint256",
              "typeString": "uint256"
            },
            "typeName": {
              "id": 10,
              "name": "uint",
              "nodeType": "ElementaryTypeName",
              "src": "255:4:0",
              "typeDescriptions": {
                "typeIdentifier": "t_uint256",
                "typeString": "uint256"
              }
            },
            "value": null,
            "visibility": "public"
          },
          {
            "constant": false,
            "id": 14,
            "name": "recoverableAssets",
            "nodeType": "VariableDeclaration",
            "scope": 294,
            "src": "296:34:0",
            "stateVariable": true,
            "storageLocation": "default",
            "typeDescriptions": {
              "typeIdentifier": "t_array$_t_address_$dyn_storage",
              "typeString": "address[]"
            },
            "typeName": {
              "baseType": {
                "id": 12,
                "name": "address",
                "nodeType": "ElementaryTypeName",
                "src": "296:7:0",
                "stateMutability": "nonpayable",
                "typeDescriptions": {
                  "typeIdentifier": "t_address",
                  "typeString": "address"
                }
              },
              "id": 13,
              "length": null,
              "nodeType": "ArrayTypeName",
              "src": "296:9:0",
              "typeDescriptions": {
                "typeIdentifier": "t_array$_t_address_$dyn_storage_ptr",
                "typeString": "address[]"
              }
            },
            "value": null,
            "visibility": "public"
          },
          {
            "constant": false,
            "id": 16,
            "name": "recoveryAddress",
            "nodeType": "VariableDeclaration",
            "scope": 294,
            "src": "337:38:0",
            "stateVariable": true,
            "storageLocation": "default",
            "typeDescriptions": {
              "typeIdentifier": "t_address_payable",
              "typeString": "address payable"
            },
            "typeName": {
              "id": 15,
              "name": "address",
              "nodeType": "ElementaryTypeName",
              "src": "337:15:0",
              "stateMutability": "payable",
              "typeDescriptions": {
                "typeIdentifier": "t_address_payable",
                "typeString": "address payable"
              }
            },
            "value": null,
            "visibility": "public"
          },
          {
            "anonymous": false,
            "documentation": null,
            "id": 24,
            "name": "Execution",
            "nodeType": "EventDefinition",
            "parameters": {
              "id": 23,
              "nodeType": "ParameterList",
              "parameters": [
                {
                  "constant": false,
                  "id": 18,
                  "indexed": false,
                  "name": "destination",
                  "nodeType": "VariableDeclaration",
                  "scope": 24,
                  "src": "400:19:0",
                  "stateVariable": false,
                  "storageLocation": "default",
                  "typeDescriptions": {
                    "typeIdentifier": "t_address",
                    "typeString": "address"
                  },
                  "typeName": {
                    "id": 17,
                    "name": "address",
                    "nodeType": "ElementaryTypeName",
                    "src": "400:7:0",
                    "stateMutability": "nonpayable",
                    "typeDescriptions": {
                      "typeIdentifier": "t_address",
                      "typeString": "address"
                    }
                  },
                  "value": null,
                  "visibility": "internal"
                },
                {
                  "constant": false,
                  "id": 20,
                  "indexed": false,
                  "name": "value",
                  "nodeType": "VariableDeclaration",
                  "scope": 24,
                  "src": "421:10:0",
                  "stateVariable": false,
                  "storageLocation": "default",
                  "typeDescriptions": {
                    "typeIdentifier": "t_uint256",
                    "typeString": "uint256"
                  },
                  "typeName": {
                    "id": 19,
                    "name": "uint",
                    "nodeType": "ElementaryTypeName",
                    "src": "421:4:0",
                    "typeDescriptions": {
                      "typeIdentifier": "t_uint256",
                      "typeString": "uint256"
                    }
                  },
                  "value": null,
                  "visibility": "internal"
                },
                {
                  "constant": false,
                  "id": 22,
                  "indexed": false,
                  "name": "data",
                  "nodeType": "VariableDeclaration",
                  "scope": 24,
                  "src": "433:10:0",
                  "stateVariable": false,
                  "storageLocation": "default",
                  "typeDescriptions": {
                    "typeIdentifier": "t_bytes_memory_ptr",
                    "typeString": "bytes"
                  },
                  "typeName": {
                    "id": 21,
                    "name": "bytes",
                    "nodeType": "ElementaryTypeName",
                    "src": "433:5:0",
                    "typeDescriptions": {
                      "typeIdentifier": "t_bytes_storage_ptr",
                      "typeString": "bytes"
                    }
                  },
                  "value": null,
                  "visibility": "internal"
                }
              ],
              "src": "399:45:0"
            },
            "src": "384:61:0"
          },
          {
            "anonymous": false,
            "documentation": null,
            "id": 32,
            "name": "ExecutionFailure",
            "nodeType": "EventDefinition",
            "parameters": {
              "id": 31,
              "nodeType": "ParameterList",
              "parameters": [
                {
                  "constant": false,
                  "id": 26,
                  "indexed": false,
                  "name": "destination",
                  "nodeType": "VariableDeclaration",
                  "scope": 32,
                  "src": "474:19:0",
                  "stateVariable": false,
                  "storageLocation": "default",
                  "typeDescriptions": {
                    "typeIdentifier": "t_address",
                    "typeString": "address"
                  },
                  "typeName": {
                    "id": 25,
                    "name": "address",
                    "nodeType": "ElementaryTypeName",
                    "src": "474:7:0",
                    "stateMutability": "nonpayable",
                    "typeDescriptions": {
                      "typeIdentifier": "t_address",
                      "typeString": "address"
                    }
                  },
                  "value": null,
                  "visibility": "internal"
                },
                {
                  "constant": false,
                  "id": 28,
                  "indexed": false,
                  "name": "value",
                  "nodeType": "VariableDeclaration",
                  "scope": 32,
                  "src": "495:10:0",
                  "stateVariable": false,
                  "storageLocation": "default",
                  "typeDescriptions": {
                    "typeIdentifier": "t_uint256",
                    "typeString": "uint256"
                  },
                  "typeName": {
                    "id": 27,
                    "name": "uint",
                    "nodeType": "ElementaryTypeName",
                    "src": "495:4:0",
                    "typeDescriptions": {
                      "typeIdentifier": "t_uint256",
                      "typeString": "uint256"
                    }
                  },
                  "value": null,
                  "visibility": "internal"
                },
                {
                  "constant": false,
                  "id": 30,
                  "indexed": false,
                  "name": "data",
                  "nodeType": "VariableDeclaration",
                  "scope": 32,
                  "src": "507:10:0",
                  "stateVariable": false,
                  "storageLocation": "default",
                  "typeDescriptions": {
                    "typeIdentifier": "t_bytes_memory_ptr",
                    "typeString": "bytes"
                  },
                  "typeName": {
                    "id": 29,
                    "name": "bytes",
                    "nodeType": "ElementaryTypeName",
                    "src": "507:5:0",
                    "typeDescriptions": {
                      "typeIdentifier": "t_bytes_storage_ptr",
                      "typeString": "bytes"
                    }
                  },
                  "value": null,
                  "visibility": "internal"
                }
              ],
              "src": "473:45:0"
            },
            "src": "451:68:0"
          },
          {
            "anonymous": false,
            "documentation": null,
            "id": 38,
            "name": "NewRecoveryAddress",
            "nodeType": "EventDefinition",
            "parameters": {
              "id": 37,
              "nodeType": "ParameterList",
              "parameters": [
                {
                  "constant": false,
                  "id": 34,
                  "indexed": false,
                  "name": "recoveryAddress",
                  "nodeType": "VariableDeclaration",
                  "scope": 38,
                  "src": "550:23:0",
                  "stateVariable": false,
                  "storageLocation": "default",
                  "typeDescriptions": {
                    "typeIdentifier": "t_address",
                    "typeString": "address"
                  },
                  "typeName": {
                    "id": 33,
                    "name": "address",
                    "nodeType": "ElementaryTypeName",
                    "src": "550:7:0",
                    "stateMutability": "nonpayable",
                    "typeDescriptions": {
                      "typeIdentifier": "t_address",
                      "typeString": "address"
                    }
                  },
                  "value": null,
                  "visibility": "internal"
                },
                {
                  "constant": false,
                  "id": 36,
                  "indexed": false,
                  "name": "timedelta",
                  "nodeType": "VariableDeclaration",
                  "scope": 38,
                  "src": "575:14:0",
                  "stateVariable": false,
                  "storageLocation": "default",
                  "typeDescriptions": {
                    "typeIdentifier": "t_uint256",
                    "typeString": "uint256"
                  },
                  "typeName": {
                    "id": 35,
                    "name": "uint",
                    "nodeType": "ElementaryTypeName",
                    "src": "575:4:0",
                    "typeDescriptions": {
                      "typeIdentifier": "t_uint256",
                      "typeString": "uint256"
                    }
                  },
                  "value": null,
                  "visibility": "internal"
                }
              ],
              "src": "549:41:0"
            },
            "src": "525:66:0"
          },
          {
            "body": {
              "id": 48,
              "nodeType": "Block",
              "src": "643:47:0",
              "statements": [
                {
                  "expression": {
                    "argumentTypes": null,
                    "arguments": [
                      {
                        "argumentTypes": null,
                        "id": 45,
                        "name": "assets",
                        "nodeType": "Identifier",
                        "overloadedDeclarations": [],
                        "referencedDeclaration": 41,
                        "src": "675:6:0",
                        "typeDescriptions": {
                          "typeIdentifier": "t_array$_t_address_$dyn_memory_ptr",
                          "typeString": "address[] memory"
                        }
                      }
                    ],
                    "expression": {
                      "argumentTypes": [
                        {
                          "typeIdentifier": "t_array$_t_address_$dyn_memory_ptr",
                          "typeString": "address[] memory"
                        }
                      ],
                      "id": 44,
                      "name": "setRecoverableAssets",
                      "nodeType": "Identifier",
                      "overloadedDeclarations": [],
                      "referencedDeclaration": 121,
                      "src": "654:20:0",
                      "typeDescriptions": {
                        "typeIdentifier": "t_function_internal_nonpayable$_t_array$_t_address_$dyn_memory_ptr_$returns$__$",
                        "typeString": "function (address[] memory)"
                      }
                    },
                    "id": 46,
                    "isConstant": false,
                    "isLValue": false,
                    "isPure": false,
                    "kind": "functionCall",
                    "lValueRequested": false,
                    "names": [],
                    "nodeType": "FunctionCall",
                    "src": "654:28:0",
                    "typeDescriptions": {
                      "typeIdentifier": "t_tuple$__$",
                      "typeString": "tuple()"
                    }
                  },
                  "id": 47,
                  "nodeType": "ExpressionStatement",
                  "src": "654:28:0"
                }
              ]
            },
            "documentation": null,
            "id": 49,
            "implemented": true,
            "kind": "constructor",
            "modifiers": [],
            "name": "",
            "nodeType": "FunctionDefinition",
            "parameters": {
              "id": 42,
              "nodeType": "ParameterList",
              "parameters": [
                {
                  "constant": false,
                  "id": 41,
                  "name": "assets",
                  "nodeType": "VariableDeclaration",
                  "scope": 49,
                  "src": "611:23:0",
                  "stateVariable": false,
                  "storageLocation": "memory",
                  "typeDescriptions": {
                    "typeIdentifier": "t_array$_t_address_$dyn_memory_ptr",
                    "typeString": "address[]"
                  },
                  "typeName": {
                    "baseType": {
                      "id": 39,
                      "name": "address",
                      "nodeType": "ElementaryTypeName",
                      "src": "611:7:0",
                      "stateMutability": "nonpayable",
                      "typeDescriptions": {
                        "typeIdentifier": "t_address",
                        "typeString": "address"
                      }
                    },
                    "id": 40,
                    "length": null,
                    "nodeType": "ArrayTypeName",
                    "src": "611:9:0",
                    "typeDescriptions": {
                      "typeIdentifier": "t_array$_t_address_$dyn_storage_ptr",
                      "typeString": "address[]"
                    }
                  },
                  "value": null,
                  "visibility": "internal"
                }
              ],
              "src": "610:25:0"
            },
            "returnParameters": {
              "id": 43,
              "nodeType": "ParameterList",
              "parameters": [],
              "src": "643:0:0"
            },
            "scope": 294,
            "src": "599:91:0",
            "stateMutability": "nonpayable",
            "superFunction": null,
            "visibility": "public"
          },
          {
            "body": {
              "id": 56,
              "nodeType": "Block",
              "src": "724:45:0",
              "statements": [
                {
                  "expression": {
                    "argumentTypes": null,
                    "id": 53,
                    "isConstant": false,
                    "isLValue": false,
                    "isPure": false,
                    "lValueRequested": false,
                    "leftHandSide": {
                      "argumentTypes": null,
                      "id": 51,
                      "name": "lastCall",
                      "nodeType": "Identifier",
                      "overloadedDeclarations": [],
                      "referencedDeclaration": 11,
                      "src": "735:8:0",
                      "typeDescriptions": {
                        "typeIdentifier": "t_uint256",
                        "typeString": "uint256"
                      }
                    },
                    "nodeType": "Assignment",
                    "operator": "=",
                    "rightHandSide": {
                      "argumentTypes": null,
                      "id": 52,
                      "name": "now",
                      "nodeType": "Identifier",
                      "overloadedDeclarations": [],
                      "referencedDeclaration": 1312,
                      "src": "746:3:0",
                      "typeDescriptions": {
                        "typeIdentifier": "t_uint256",
                        "typeString": "uint256"
                      }
                    },
                    "src": "735:14:0",
                    "typeDescriptions": {
                      "typeIdentifier": "t_uint256",
                      "typeString": "uint256"
                    }
                  },
                  "id": 54,
                  "nodeType": "ExpressionStatement",
                  "src": "735:14:0"
                },
                {
                  "id": 55,
                  "nodeType": "PlaceholderStatement",
                  "src": "760:1:0"
                }
              ]
            },
            "documentation": null,
            "id": 57,
            "name": "updateLastCall",
            "nodeType": "ModifierDefinition",
            "parameters": {
              "id": 50,
              "nodeType": "ParameterList",
              "parameters": [],
              "src": "721:2:0"
            },
            "src": "698:71:0",
            "visibility": "internal"
          },
          {
            "body": {
              "id": 78,
              "nodeType": "Block",
              "src": "832:131:0",
              "statements": [
                {
                  "condition": {
                    "argumentTypes": null,
                    "commonType": {
                      "typeIdentifier": "t_uint256",
                      "typeString": "uint256"
                    },
                    "id": 66,
                    "isConstant": false,
                    "isLValue": false,
                    "isPure": false,
                    "lValueRequested": false,
                    "leftExpression": {
                      "argumentTypes": null,
                      "id": 62,
                      "name": "now",
                      "nodeType": "Identifier",
                      "overloadedDeclarations": [],
                      "referencedDeclaration": 1312,
                      "src": "847:3:0",
                      "typeDescriptions": {
                        "typeIdentifier": "t_uint256",
                        "typeString": "uint256"
                      }
                    },
                    "nodeType": "BinaryOperation",
                    "operator": "<",
                    "rightExpression": {
                      "argumentTypes": null,
                      "commonType": {
                        "typeIdentifier": "t_uint256",
                        "typeString": "uint256"
                      },
                      "id": 65,
                      "isConstant": false,
                      "isLValue": false,
                      "isPure": false,
                      "lValueRequested": false,
                      "leftExpression": {
                        "argumentTypes": null,
                        "id": 63,
                        "name": "lastCall",
                        "nodeType": "Identifier",
                        "overloadedDeclarations": [],
                        "referencedDeclaration": 11,
                        "src": "853:8:0",
                        "typeDescriptions": {
                          "typeIdentifier": "t_uint256",
                          "typeString": "uint256"
                        }
                      },
                      "nodeType": "BinaryOperation",
                      "operator": "+",
                      "rightExpression": {
                        "argumentTypes": null,
                        "id": 64,
                        "name": "timedelta",
                        "nodeType": "Identifier",
                        "overloadedDeclarations": [],
                        "referencedDeclaration": 9,
                        "src": "864:9:0",
                        "typeDescriptions": {
                          "typeIdentifier": "t_uint256",
                          "typeString": "uint256"
                        }
                      },
                      "src": "853:20:0",
                      "typeDescriptions": {
                        "typeIdentifier": "t_uint256",
                        "typeString": "uint256"
                      }
                    },
                    "src": "847:26:0",
                    "typeDescriptions": {
                      "typeIdentifier": "t_bool",
                      "typeString": "bool"
                    }
                  },
                  "falseBody": null,
                  "id": 75,
                  "nodeType": "IfStatement",
                  "src": "843:94:0",
                  "trueBody": {
                    "id": 74,
                    "nodeType": "Block",
                    "src": "875:62:0",
                    "statements": [
                      {
                        "expression": {
                          "argumentTypes": null,
                          "commonType": {
                            "typeIdentifier": "t_uint256",
                            "typeString": "uint256"
                          },
                          "id": 72,
                          "isConstant": false,
                          "isLValue": false,
                          "isPure": false,
                          "lValueRequested": false,
                          "leftExpression": {
                            "argumentTypes": null,
                            "components": [
                              {
                                "argumentTypes": null,
                                "commonType": {
                                  "typeIdentifier": "t_uint256",
                                  "typeString": "uint256"
                                },
                                "id": 69,
                                "isConstant": false,
                                "isLValue": false,
                                "isPure": false,
                                "lValueRequested": false,
                                "leftExpression": {
                                  "argumentTypes": null,
                                  "id": 67,
                                  "name": "lastCall",
                                  "nodeType": "Identifier",
                                  "overloadedDeclarations": [],
                                  "referencedDeclaration": 11,
                                  "src": "898:8:0",
                                  "typeDescriptions": {
                                    "typeIdentifier": "t_uint256",
                                    "typeString": "uint256"
                                  }
                                },
                                "nodeType": "BinaryOperation",
                                "operator": "+",
                                "rightExpression": {
                                  "argumentTypes": null,
                                  "id": 68,
                                  "name": "timedelta",
                                  "nodeType": "Identifier",
                                  "overloadedDeclarations": [],
                                  "referencedDeclaration": 9,
                                  "src": "909:9:0",
                                  "typeDescriptions": {
                                    "typeIdentifier": "t_uint256",
                                    "typeString": "uint256"
                                  }
                                },
                                "src": "898:20:0",
                                "typeDescriptions": {
                                  "typeIdentifier": "t_uint256",
                                  "typeString": "uint256"
                                }
                              }
                            ],
                            "id": 70,
                            "isConstant": false,
                            "isInlineArray": false,
                            "isLValue": false,
                            "isPure": false,
                            "lValueRequested": false,
                            "nodeType": "TupleExpression",
                            "src": "897:22:0",
                            "typeDescriptions": {
                              "typeIdentifier": "t_uint256",
                              "typeString": "uint256"
                            }
                          },
                          "nodeType": "BinaryOperation",
                          "operator": "-",
                          "rightExpression": {
                            "argumentTypes": null,
                            "id": 71,
                            "name": "now",
                            "nodeType": "Identifier",
                            "overloadedDeclarations": [],
                            "referencedDeclaration": 1312,
                            "src": "922:3:0",
                            "typeDescriptions": {
                              "typeIdentifier": "t_uint256",
                              "typeString": "uint256"
                            }
                          },
                          "src": "897:28:0",
                          "typeDescriptions": {
                            "typeIdentifier": "t_uint256",
                            "typeString": "uint256"
                          }
                        },
                        "functionReturnParameters": 61,
                        "id": 73,
                        "nodeType": "Return",
                        "src": "890:35:0"
                      }
                    ]
                  }
                },
                {
                  "expression": {
                    "argumentTypes": null,
                    "hexValue": "30",
                    "id": 76,
                    "isConstant": false,
                    "isLValue": false,
                    "isPure": true,
                    "kind": "number",
                    "lValueRequested": false,
                    "nodeType": "Literal",
                    "src": "954:1:0",
                    "subdenomination": null,
                    "typeDescriptions": {
                      "typeIdentifier": "t_rational_0_by_1",
                      "typeString": "int_const 0"
                    },
                    "value": "0"
                  },
                  "functionReturnParameters": 61,
                  "id": 77,
                  "nodeType": "Return",
                  "src": "947:8:0"
                }
              ]
            },
            "documentation": null,
            "id": 79,
            "implemented": true,
            "kind": "function",
            "modifiers": [],
            "name": "timeTillDeadline",
            "nodeType": "FunctionDefinition",
            "parameters": {
              "id": 58,
              "nodeType": "ParameterList",
              "parameters": [],
              "src": "802:2:0"
            },
            "returnParameters": {
              "id": 61,
              "nodeType": "ParameterList",
              "parameters": [
                {
                  "constant": false,
                  "id": 60,
                  "name": "",
                  "nodeType": "VariableDeclaration",
                  "scope": 79,
                  "src": "826:4:0",
                  "stateVariable": false,
                  "storageLocation": "default",
                  "typeDescriptions": {
                    "typeIdentifier": "t_uint256",
                    "typeString": "uint256"
                  },
                  "typeName": {
                    "id": 59,
                    "name": "uint",
                    "nodeType": "ElementaryTypeName",
                    "src": "826:4:0",
                    "typeDescriptions": {
                      "typeIdentifier": "t_uint256",
                      "typeString": "uint256"
                    }
                  },
                  "value": null,
                  "visibility": "internal"
                }
              ],
              "src": "825:6:0"
            },
            "scope": 294,
            "src": "777:186:0",
            "stateMutability": "view",
            "superFunction": null,
            "visibility": "public"
          },
          {
            "body": {
              "id": 90,
              "nodeType": "Block",
              "src": "1023:53:0",
              "statements": [
                {
                  "expression": {
                    "argumentTypes": null,
                    "commonType": {
                      "typeIdentifier": "t_uint256",
                      "typeString": "uint256"
                    },
                    "id": 88,
                    "isConstant": false,
                    "isLValue": false,
                    "isPure": false,
                    "lValueRequested": false,
                    "leftExpression": {
                      "argumentTypes": null,
                      "id": 84,
                      "name": "now",
                      "nodeType": "Identifier",
                      "overloadedDeclarations": [],
                      "referencedDeclaration": 1312,
                      "src": "1041:3:0",
                      "typeDescriptions": {
                        "typeIdentifier": "t_uint256",
                        "typeString": "uint256"
                      }
                    },
                    "nodeType": "BinaryOperation",
                    "operator": ">=",
                    "rightExpression": {
                      "argumentTypes": null,
                      "commonType": {
                        "typeIdentifier": "t_uint256",
                        "typeString": "uint256"
                      },
                      "id": 87,
                      "isConstant": false,
                      "isLValue": false,
                      "isPure": false,
                      "lValueRequested": false,
                      "leftExpression": {
                        "argumentTypes": null,
                        "id": 85,
                        "name": "lastCall",
                        "nodeType": "Identifier",
                        "overloadedDeclarations": [],
                        "referencedDeclaration": 11,
                        "src": "1048:8:0",
                        "typeDescriptions": {
                          "typeIdentifier": "t_uint256",
                          "typeString": "uint256"
                        }
                      },
                      "nodeType": "BinaryOperation",
                      "operator": "+",
                      "rightExpression": {
                        "argumentTypes": null,
                        "id": 86,
                        "name": "timedelta",
                        "nodeType": "Identifier",
                        "overloadedDeclarations": [],
                        "referencedDeclaration": 9,
                        "src": "1059:9:0",
                        "typeDescriptions": {
                          "typeIdentifier": "t_uint256",
                          "typeString": "uint256"
                        }
                      },
                      "src": "1048:20:0",
                      "typeDescriptions": {
                        "typeIdentifier": "t_uint256",
                        "typeString": "uint256"
                      }
                    },
                    "src": "1041:27:0",
                    "typeDescriptions": {
                      "typeIdentifier": "t_bool",
                      "typeString": "bool"
                    }
                  },
                  "functionReturnParameters": 83,
                  "id": 89,
                  "nodeType": "Return",
                  "src": "1034:34:0"
                }
              ]
            },
            "documentation": null,
            "id": 91,
            "implemented": true,
            "kind": "function",
            "modifiers": [],
            "name": "isRecoverable",
            "nodeType": "FunctionDefinition",
            "parameters": {
              "id": 80,
              "nodeType": "ParameterList",
              "parameters": [],
              "src": "993:2:0"
            },
            "returnParameters": {
              "id": 83,
              "nodeType": "ParameterList",
              "parameters": [
                {
                  "constant": false,
                  "id": 82,
                  "name": "",
                  "nodeType": "VariableDeclaration",
                  "scope": 91,
                  "src": "1017:4:0",
                  "stateVariable": false,
                  "storageLocation": "default",
                  "typeDescriptions": {
                    "typeIdentifier": "t_bool",
                    "typeString": "bool"
                  },
                  "typeName": {
                    "id": 81,
                    "name": "bool",
                    "nodeType": "ElementaryTypeName",
                    "src": "1017:4:0",
                    "typeDescriptions": {
                      "typeIdentifier": "t_bool",
                      "typeString": "bool"
                    }
                  },
                  "value": null,
                  "visibility": "internal"
                }
              ],
              "src": "1016:6:0"
            },
            "scope": 294,
            "src": "971:105:0",
            "stateMutability": "view",
            "superFunction": null,
            "visibility": "public"
          },
          {
            "body": {
              "id": 120,
              "nodeType": "Block",
              "src": "1156:120:0",
              "statements": [
                {
                  "body": {
                    "id": 118,
                    "nodeType": "Block",
                    "src": "1209:60:0",
                    "statements": [
                      {
                        "expression": {
                          "argumentTypes": null,
                          "arguments": [
                            {
                              "argumentTypes": null,
                              "baseExpression": {
                                "argumentTypes": null,
                                "id": 113,
                                "name": "assets",
                                "nodeType": "Identifier",
                                "overloadedDeclarations": [],
                                "referencedDeclaration": 94,
                                "src": "1247:6:0",
                                "typeDescriptions": {
                                  "typeIdentifier": "t_array$_t_address_$dyn_memory_ptr",
                                  "typeString": "address[] memory"
                                }
                              },
                              "id": 115,
                              "indexExpression": {
                                "argumentTypes": null,
                                "id": 114,
                                "name": "i",
                                "nodeType": "Identifier",
                                "overloadedDeclarations": [],
                                "referencedDeclaration": 100,
                                "src": "1254:1:0",
                                "typeDescriptions": {
                                  "typeIdentifier": "t_uint8",
                                  "typeString": "uint8"
                                }
                              },
                              "isConstant": false,
                              "isLValue": true,
                              "isPure": false,
                              "lValueRequested": false,
                              "nodeType": "IndexAccess",
                              "src": "1247:9:0",
                              "typeDescriptions": {
                                "typeIdentifier": "t_address",
                                "typeString": "address"
                              }
                            }
                          ],
                          "expression": {
                            "argumentTypes": [
                              {
                                "typeIdentifier": "t_address",
                                "typeString": "address"
                              }
                            ],
                            "expression": {
                              "argumentTypes": null,
                              "id": 110,
                              "name": "recoverableAssets",
                              "nodeType": "Identifier",
                              "overloadedDeclarations": [],
                              "referencedDeclaration": 14,
                              "src": "1224:17:0",
                              "typeDescriptions": {
                                "typeIdentifier": "t_array$_t_address_$dyn_storage",
                                "typeString": "address[] storage ref"
                              }
                            },
                            "id": 112,
                            "isConstant": false,
                            "isLValue": false,
                            "isPure": false,
                            "lValueRequested": false,
                            "memberName": "push",
                            "nodeType": "MemberAccess",
                            "referencedDeclaration": null,
                            "src": "1224:22:0",
                            "typeDescriptions": {
                              "typeIdentifier": "t_function_arraypush_nonpayable$_t_address_$returns$_t_uint256_$",
                              "typeString": "function (address) returns (uint256)"
                            }
                          },
                          "id": 116,
                          "isConstant": false,
                          "isLValue": false,
                          "isPure": false,
                          "kind": "functionCall",
                          "lValueRequested": false,
                          "names": [],
                          "nodeType": "FunctionCall",
                          "src": "1224:33:0",
                          "typeDescriptions": {
                            "typeIdentifier": "t_uint256",
                            "typeString": "uint256"
                          }
                        },
                        "id": 117,
                        "nodeType": "ExpressionStatement",
                        "src": "1224:33:0"
                      }
                    ]
                  },
                  "condition": {
                    "argumentTypes": null,
                    "commonType": {
                      "typeIdentifier": "t_uint256",
                      "typeString": "uint256"
                    },
                    "id": 106,
                    "isConstant": false,
                    "isLValue": false,
                    "isPure": false,
                    "lValueRequested": false,
                    "leftExpression": {
                      "argumentTypes": null,
                      "id": 103,
                      "name": "i",
                      "nodeType": "Identifier",
                      "overloadedDeclarations": [],
                      "referencedDeclaration": 100,
                      "src": "1185:1:0",
                      "typeDescriptions": {
                        "typeIdentifier": "t_uint8",
                        "typeString": "uint8"
                      }
                    },
                    "nodeType": "BinaryOperation",
                    "operator": "<",
                    "rightExpression": {
                      "argumentTypes": null,
                      "expression": {
                        "argumentTypes": null,
                        "id": 104,
                        "name": "assets",
                        "nodeType": "Identifier",
                        "overloadedDeclarations": [],
                        "referencedDeclaration": 94,
                        "src": "1189:6:0",
                        "typeDescriptions": {
                          "typeIdentifier": "t_array$_t_address_$dyn_memory_ptr",
                          "typeString": "address[] memory"
                        }
                      },
                      "id": 105,
                      "isConstant": false,
                      "isLValue": false,
                      "isPure": false,
                      "lValueRequested": false,
                      "memberName": "length",
                      "nodeType": "MemberAccess",
                      "referencedDeclaration": null,
                      "src": "1189:13:0",
                      "typeDescriptions": {
                        "typeIdentifier": "t_uint256",
                        "typeString": "uint256"
                      }
                    },
                    "src": "1185:17:0",
                    "typeDescriptions": {
                      "typeIdentifier": "t_bool",
                      "typeString": "bool"
                    }
                  },
                  "id": 119,
                  "initializationExpression": {
                    "assignments": [
                      100
                    ],
                    "declarations": [
                      {
                        "constant": false,
                        "id": 100,
                        "name": "i",
                        "nodeType": "VariableDeclaration",
                        "scope": 119,
                        "src": "1172:7:0",
                        "stateVariable": false,
                        "storageLocation": "default",
                        "typeDescriptions": {
                          "typeIdentifier": "t_uint8",
                          "typeString": "uint8"
                        },
                        "typeName": {
                          "id": 99,
                          "name": "uint8",
                          "nodeType": "ElementaryTypeName",
                          "src": "1172:5:0",
                          "typeDescriptions": {
                            "typeIdentifier": "t_uint8",
                            "typeString": "uint8"
                          }
                        },
                        "value": null,
                        "visibility": "internal"
                      }
                    ],
                    "id": 102,
                    "initialValue": {
                      "argumentTypes": null,
                      "hexValue": "30",
                      "id": 101,
                      "isConstant": false,
                      "isLValue": false,
                      "isPure": true,
                      "kind": "number",
                      "lValueRequested": false,
                      "nodeType": "Literal",
                      "src": "1182:1:0",
                      "subdenomination": null,
                      "typeDescriptions": {
                        "typeIdentifier": "t_rational_0_by_1",
                        "typeString": "int_const 0"
                      },
                      "value": "0"
                    },
                    "nodeType": "VariableDeclarationStatement",
                    "src": "1172:11:0"
                  },
                  "loopExpression": {
                    "expression": {
                      "argumentTypes": null,
                      "id": 108,
                      "isConstant": false,
                      "isLValue": false,
                      "isPure": false,
                      "lValueRequested": false,
                      "nodeType": "UnaryOperation",
                      "operator": "++",
                      "prefix": false,
                      "src": "1204:3:0",
                      "subExpression": {
                        "argumentTypes": null,
                        "id": 107,
                        "name": "i",
                        "nodeType": "Identifier",
                        "overloadedDeclarations": [],
                        "referencedDeclaration": 100,
                        "src": "1204:1:0",
                        "typeDescriptions": {
                          "typeIdentifier": "t_uint8",
                          "typeString": "uint8"
                        }
                      },
                      "typeDescriptions": {
                        "typeIdentifier": "t_uint8",
                        "typeString": "uint8"
                      }
                    },
                    "id": 109,
                    "nodeType": "ExpressionStatement",
                    "src": "1204:3:0"
                  },
                  "nodeType": "ForStatement",
                  "src": "1167:102:0"
                }
              ]
            },
            "documentation": null,
            "id": 121,
            "implemented": true,
            "kind": "function",
            "modifiers": [
              {
                "arguments": null,
                "id": 97,
                "modifierName": {
                  "argumentTypes": null,
                  "id": 96,
                  "name": "onlyOwner",
                  "nodeType": "Identifier",
                  "overloadedDeclarations": [],
                  "referencedDeclaration": 696,
                  "src": "1146:9:0",
                  "typeDescriptions": {
                    "typeIdentifier": "t_modifier$__$",
                    "typeString": "modifier ()"
                  }
                },
                "nodeType": "ModifierInvocation",
                "src": "1146:9:0"
              }
            ],
            "name": "setRecoverableAssets",
            "nodeType": "FunctionDefinition",
            "parameters": {
              "id": 95,
              "nodeType": "ParameterList",
              "parameters": [
                {
                  "constant": false,
                  "id": 94,
                  "name": "assets",
                  "nodeType": "VariableDeclaration",
                  "scope": 121,
                  "src": "1114:23:0",
                  "stateVariable": false,
                  "storageLocation": "memory",
                  "typeDescriptions": {
                    "typeIdentifier": "t_array$_t_address_$dyn_memory_ptr",
                    "typeString": "address[]"
                  },
                  "typeName": {
                    "baseType": {
                      "id": 92,
                      "name": "address",
                      "nodeType": "ElementaryTypeName",
                      "src": "1114:7:0",
                      "stateMutability": "nonpayable",
                      "typeDescriptions": {
                        "typeIdentifier": "t_address",
                        "typeString": "address"
                      }
                    },
                    "id": 93,
                    "length": null,
                    "nodeType": "ArrayTypeName",
                    "src": "1114:9:0",
                    "typeDescriptions": {
                      "typeIdentifier": "t_array$_t_address_$dyn_storage_ptr",
                      "typeString": "address[]"
                    }
                  },
                  "value": null,
                  "visibility": "internal"
                }
              ],
              "src": "1113:25:0"
            },
            "returnParameters": {
              "id": 98,
              "nodeType": "ParameterList",
              "parameters": [],
              "src": "1156:0:0"
            },
            "scope": 294,
            "src": "1084:192:0",
            "stateMutability": "nonpayable",
            "superFunction": null,
            "visibility": "public"
          },
          {
            "body": {
              "id": 138,
              "nodeType": "Block",
              "src": "1373:37:0",
              "statements": [
                {
                  "expression": {
                    "argumentTypes": null,
                    "arguments": [
                      {
                        "argumentTypes": null,
                        "id": 135,
                        "name": "value",
                        "nodeType": "Identifier",
                        "overloadedDeclarations": [],
                        "referencedDeclaration": 125,
                        "src": "1396:5:0",
                        "typeDescriptions": {
                          "typeIdentifier": "t_uint256",
                          "typeString": "uint256"
                        }
                      }
                    ],
                    "expression": {
                      "argumentTypes": [
                        {
                          "typeIdentifier": "t_uint256",
                          "typeString": "uint256"
                        }
                      ],
                      "expression": {
                        "argumentTypes": null,
                        "id": 132,
                        "name": "to",
                        "nodeType": "Identifier",
                        "overloadedDeclarations": [],
                        "referencedDeclaration": 123,
                        "src": "1384:2:0",
                        "typeDescriptions": {
                          "typeIdentifier": "t_address_payable",
                          "typeString": "address payable"
                        }
                      },
                      "id": 134,
                      "isConstant": false,
                      "isLValue": false,
                      "isPure": false,
                      "lValueRequested": false,
                      "memberName": "transfer",
                      "nodeType": "MemberAccess",
                      "referencedDeclaration": null,
                      "src": "1384:11:0",
                      "typeDescriptions": {
                        "typeIdentifier": "t_function_transfer_nonpayable$_t_uint256_$returns$__$",
                        "typeString": "function (uint256)"
                      }
                    },
                    "id": 136,
                    "isConstant": false,
                    "isLValue": false,
                    "isPure": false,
                    "kind": "functionCall",
                    "lValueRequested": false,
                    "names": [],
                    "nodeType": "FunctionCall",
                    "src": "1384:18:0",
                    "typeDescriptions": {
                      "typeIdentifier": "t_tuple$__$",
                      "typeString": "tuple()"
                    }
                  },
                  "id": 137,
                  "nodeType": "ExpressionStatement",
                  "src": "1384:18:0"
                }
              ]
            },
            "documentation": null,
            "id": 139,
            "implemented": true,
            "kind": "function",
            "modifiers": [
              {
                "arguments": null,
                "id": 128,
                "modifierName": {
                  "argumentTypes": null,
                  "id": 127,
                  "name": "updateLastCall",
                  "nodeType": "Identifier",
                  "overloadedDeclarations": [],
                  "referencedDeclaration": 57,
                  "src": "1348:14:0",
                  "typeDescriptions": {
                    "typeIdentifier": "t_modifier$__$",
                    "typeString": "modifier ()"
                  }
                },
                "nodeType": "ModifierInvocation",
                "src": "1348:14:0"
              },
              {
                "arguments": null,
                "id": 130,
                "modifierName": {
                  "argumentTypes": null,
                  "id": 129,
                  "name": "onlyOwner",
                  "nodeType": "Identifier",
                  "overloadedDeclarations": [],
                  "referencedDeclaration": 696,
                  "src": "1363:9:0",
                  "typeDescriptions": {
                    "typeIdentifier": "t_modifier$__$",
                    "typeString": "modifier ()"
                  }
                },
                "nodeType": "ModifierInvocation",
                "src": "1363:9:0"
              }
            ],
            "name": "sendEth",
            "nodeType": "FunctionDefinition",
            "parameters": {
              "id": 126,
              "nodeType": "ParameterList",
              "parameters": [
                {
                  "constant": false,
                  "id": 123,
                  "name": "to",
                  "nodeType": "VariableDeclaration",
                  "scope": 139,
                  "src": "1301:18:0",
                  "stateVariable": false,
                  "storageLocation": "default",
                  "typeDescriptions": {
                    "typeIdentifier": "t_address_payable",
                    "typeString": "address payable"
                  },
                  "typeName": {
                    "id": 122,
                    "name": "address",
                    "nodeType": "ElementaryTypeName",
                    "src": "1301:15:0",
                    "stateMutability": "payable",
                    "typeDescriptions": {
                      "typeIdentifier": "t_address_payable",
                      "typeString": "address payable"
                    }
                  },
                  "value": null,
                  "visibility": "internal"
                },
                {
                  "constant": false,
                  "id": 125,
                  "name": "value",
                  "nodeType": "VariableDeclaration",
                  "scope": 139,
                  "src": "1321:10:0",
                  "stateVariable": false,
                  "storageLocation": "default",
                  "typeDescriptions": {
                    "typeIdentifier": "t_uint256",
                    "typeString": "uint256"
                  },
                  "typeName": {
                    "id": 124,
                    "name": "uint",
                    "nodeType": "ElementaryTypeName",
                    "src": "1321:4:0",
                    "typeDescriptions": {
                      "typeIdentifier": "t_uint256",
                      "typeString": "uint256"
                    }
                  },
                  "value": null,
                  "visibility": "internal"
                }
              ],
              "src": "1300:32:0"
            },
            "returnParameters": {
              "id": 131,
              "nodeType": "ParameterList",
              "parameters": [],
              "src": "1373:0:0"
            },
            "scope": 294,
            "src": "1284:126:0",
            "stateMutability": "payable",
            "superFunction": null,
            "visibility": "public"
          },
          {
            "body": {
              "id": 150,
              "nodeType": "Block",
              "src": "1532:30:0",
              "statements": [
                {
                  "expression": {
                    "argumentTypes": null,
                    "hexValue": "74727565",
                    "id": 148,
                    "isConstant": false,
                    "isLValue": false,
                    "isPure": true,
                    "kind": "bool",
                    "lValueRequested": false,
                    "nodeType": "Literal",
                    "src": "1550:4:0",
                    "subdenomination": null,
                    "typeDescriptions": {
                      "typeIdentifier": "t_bool",
                      "typeString": "bool"
                    },
                    "value": "true"
                  },
                  "functionReturnParameters": 147,
                  "id": 149,
                  "nodeType": "Return",
                  "src": "1543:11:0"
                }
              ]
            },
            "documentation": "@dev extend the deadline for recovery",
            "id": 151,
            "implemented": true,
            "kind": "function",
            "modifiers": [
              {
                "arguments": null,
                "id": 142,
                "modifierName": {
                  "argumentTypes": null,
                  "id": 141,
                  "name": "updateLastCall",
                  "nodeType": "Identifier",
                  "overloadedDeclarations": [],
                  "referencedDeclaration": 57,
                  "src": "1492:14:0",
                  "typeDescriptions": {
                    "typeIdentifier": "t_modifier$__$",
                    "typeString": "modifier ()"
                  }
                },
                "nodeType": "ModifierInvocation",
                "src": "1492:14:0"
              },
              {
                "arguments": null,
                "id": 144,
                "modifierName": {
                  "argumentTypes": null,
                  "id": 143,
                  "name": "onlyOwner",
                  "nodeType": "Identifier",
                  "overloadedDeclarations": [],
                  "referencedDeclaration": 696,
                  "src": "1507:9:0",
                  "typeDescriptions": {
                    "typeIdentifier": "t_modifier$__$",
                    "typeString": "modifier ()"
                  }
                },
                "nodeType": "ModifierInvocation",
                "src": "1507:9:0"
              }
            ],
            "name": "iAmAlive",
            "nodeType": "FunctionDefinition",
            "parameters": {
              "id": 140,
              "nodeType": "ParameterList",
              "parameters": [],
              "src": "1482:2:0"
            },
            "returnParameters": {
              "id": 147,
              "nodeType": "ParameterList",
              "parameters": [
                {
                  "constant": false,
                  "id": 146,
                  "name": "",
                  "nodeType": "VariableDeclaration",
                  "scope": 151,
                  "src": "1526:4:0",
                  "stateVariable": false,
                  "storageLocation": "default",
                  "typeDescriptions": {
                    "typeIdentifier": "t_bool",
                    "typeString": "bool"
                  },
                  "typeName": {
                    "id": 145,
                    "name": "bool",
                    "nodeType": "ElementaryTypeName",
                    "src": "1526:4:0",
                    "typeDescriptions": {
                      "typeIdentifier": "t_bool",
                      "typeString": "bool"
                    }
                  },
                  "value": null,
                  "visibility": "internal"
                }
              ],
              "src": "1525:6:0"
            },
            "scope": 294,
            "src": "1465:97:0",
            "stateMutability": "nonpayable",
            "superFunction": null,
            "visibility": "public"
          },
          {
            "body": {
              "id": 191,
              "nodeType": "Block",
              "src": "1709:406:0",
              "statements": [
                {
                  "expression": {
                    "argumentTypes": null,
                    "arguments": [
                      {
                        "argumentTypes": null,
                        "commonType": {
                          "typeIdentifier": "t_address_payable",
                          "typeString": "address payable"
                        },
                        "id": 167,
                        "isConstant": false,
                        "isLValue": false,
                        "isPure": false,
                        "lValueRequested": false,
                        "leftExpression": {
                          "argumentTypes": null,
                          "id": 163,
                          "name": "recoveryAddress",
                          "nodeType": "Identifier",
                          "overloadedDeclarations": [],
                          "referencedDeclaration": 16,
                          "src": "1728:15:0",
                          "typeDescriptions": {
                            "typeIdentifier": "t_address_payable",
                            "typeString": "address payable"
                          }
                        },
                        "nodeType": "BinaryOperation",
                        "operator": "!=",
                        "rightExpression": {
                          "argumentTypes": null,
                          "arguments": [
                            {
                              "argumentTypes": null,
                              "hexValue": "30",
                              "id": 165,
                              "isConstant": false,
                              "isLValue": false,
                              "isPure": true,
                              "kind": "number",
                              "lValueRequested": false,
                              "nodeType": "Literal",
                              "src": "1755:1:0",
                              "subdenomination": null,
                              "typeDescriptions": {
                                "typeIdentifier": "t_rational_0_by_1",
                                "typeString": "int_const 0"
                              },
                              "value": "0"
                            }
                          ],
                          "expression": {
                            "argumentTypes": [
                              {
                                "typeIdentifier": "t_rational_0_by_1",
                                "typeString": "int_const 0"
                              }
                            ],
                            "id": 164,
                            "isConstant": false,
                            "isLValue": false,
                            "isPure": true,
                            "lValueRequested": false,
                            "nodeType": "ElementaryTypeNameExpression",
                            "src": "1747:7:0",
                            "typeDescriptions": {
                              "typeIdentifier": "t_type$_t_address_$",
                              "typeString": "type(address)"
                            },
                            "typeName": "address"
                          },
                          "id": 166,
                          "isConstant": false,
                          "isLValue": false,
                          "isPure": true,
                          "kind": "typeConversion",
                          "lValueRequested": false,
                          "names": [],
                          "nodeType": "FunctionCall",
                          "src": "1747:10:0",
                          "typeDescriptions": {
                            "typeIdentifier": "t_address_payable",
                            "typeString": "address payable"
                          }
                        },
                        "src": "1728:29:0",
                        "typeDescriptions": {
                          "typeIdentifier": "t_bool",
                          "typeString": "bool"
                        }
                      },
                      {
                        "argumentTypes": null,
                        "hexValue": "23444357616c6c6574207365745265636f766572794164647265737328293a207265636f76657279416464726573732063616e6e6f74206265207a65726f2061646472657373",
                        "id": 168,
                        "isConstant": false,
                        "isLValue": false,
                        "isPure": true,
                        "kind": "string",
                        "lValueRequested": false,
                        "nodeType": "Literal",
                        "src": "1772:72:0",
                        "subdenomination": null,
                        "typeDescriptions": {
                          "typeIdentifier": "t_stringliteral_b2e456095fa7db36f9081baecc09a06f1dda4a9613b0c69dc2b26bd06c046acc",
                          "typeString": "literal_string \"#DCWallet setRecoveryAddress(): recoveryAddress cannot be zero address\""
                        },
                        "value": "#DCWallet setRecoveryAddress(): recoveryAddress cannot be zero address"
                      }
                    ],
                    "expression": {
                      "argumentTypes": [
                        {
                          "typeIdentifier": "t_bool",
                          "typeString": "bool"
                        },
                        {
                          "typeIdentifier": "t_stringliteral_b2e456095fa7db36f9081baecc09a06f1dda4a9613b0c69dc2b26bd06c046acc",
                          "typeString": "literal_string \"#DCWallet setRecoveryAddress(): recoveryAddress cannot be zero address\""
                        }
                      ],
                      "id": 162,
                      "name": "require",
                      "nodeType": "Identifier",
                      "overloadedDeclarations": [
                        1313,
                        1314
                      ],
                      "referencedDeclaration": 1314,
                      "src": "1720:7:0",
                      "typeDescriptions": {
                        "typeIdentifier": "t_function_require_pure$_t_bool_$_t_string_memory_ptr_$returns$__$",
                        "typeString": "function (bool,string memory) pure"
                      }
                    },
                    "id": 169,
                    "isConstant": false,
                    "isLValue": false,
                    "isPure": false,
                    "kind": "functionCall",
                    "lValueRequested": false,
                    "names": [],
                    "nodeType": "FunctionCall",
                    "src": "1720:125:0",
                    "typeDescriptions": {
                      "typeIdentifier": "t_tuple$__$",
                      "typeString": "tuple()"
                    }
                  },
                  "id": 170,
                  "nodeType": "ExpressionStatement",
                  "src": "1720:125:0"
                },
                {
                  "expression": {
                    "argumentTypes": null,
                    "arguments": [
                      {
                        "argumentTypes": null,
                        "commonType": {
                          "typeIdentifier": "t_uint256",
                          "typeString": "uint256"
                        },
                        "id": 174,
                        "isConstant": false,
                        "isLValue": false,
                        "isPure": false,
                        "lValueRequested": false,
                        "leftExpression": {
                          "argumentTypes": null,
                          "id": 172,
                          "name": "timedelta",
                          "nodeType": "Identifier",
                          "overloadedDeclarations": [],
                          "referencedDeclaration": 9,
                          "src": "1864:9:0",
                          "typeDescriptions": {
                            "typeIdentifier": "t_uint256",
                            "typeString": "uint256"
                          }
                        },
                        "nodeType": "BinaryOperation",
                        "operator": ">",
                        "rightExpression": {
                          "argumentTypes": null,
                          "hexValue": "30",
                          "id": 173,
                          "isConstant": false,
                          "isLValue": false,
                          "isPure": true,
                          "kind": "number",
                          "lValueRequested": false,
                          "nodeType": "Literal",
                          "src": "1876:1:0",
                          "subdenomination": null,
                          "typeDescriptions": {
                            "typeIdentifier": "t_rational_0_by_1",
                            "typeString": "int_const 0"
                          },
                          "value": "0"
                        },
                        "src": "1864:13:0",
                        "typeDescriptions": {
                          "typeIdentifier": "t_bool",
                          "typeString": "bool"
                        }
                      },
                      {
                        "argumentTypes": null,
                        "hexValue": "23444357616c6c6574207365745265636f766572794164647265737328293a2074696d6564656c7461206d75737420626520626967676572207468616e207a65726f",
                        "id": 175,
                        "isConstant": false,
                        "isLValue": false,
                        "isPure": true,
                        "kind": "string",
                        "lValueRequested": false,
                        "nodeType": "Literal",
                        "src": "1892:68:0",
                        "subdenomination": null,
                        "typeDescriptions": {
                          "typeIdentifier": "t_stringliteral_1897b2ed0abcfd6f041157a9b0cd8c496e73b5bf1f68dd125a2ddb9644aaaa4a",
                          "typeString": "literal_string \"#DCWallet setRecoveryAddress(): timedelta must be bigger than zero\""
                        },
                        "value": "#DCWallet setRecoveryAddress(): timedelta must be bigger than zero"
                      }
                    ],
                    "expression": {
                      "argumentTypes": [
                        {
                          "typeIdentifier": "t_bool",
                          "typeString": "bool"
                        },
                        {
                          "typeIdentifier": "t_stringliteral_1897b2ed0abcfd6f041157a9b0cd8c496e73b5bf1f68dd125a2ddb9644aaaa4a",
                          "typeString": "literal_string \"#DCWallet setRecoveryAddress(): timedelta must be bigger than zero\""
                        }
                      ],
                      "id": 171,
                      "name": "require",
                      "nodeType": "Identifier",
                      "overloadedDeclarations": [
                        1313,
                        1314
                      ],
                      "referencedDeclaration": 1314,
                      "src": "1856:7:0",
                      "typeDescriptions": {
                        "typeIdentifier": "t_function_require_pure$_t_bool_$_t_string_memory_ptr_$returns$__$",
                        "typeString": "function (bool,string memory) pure"
                      }
                    },
                    "id": 176,
                    "isConstant": false,
                    "isLValue": false,
                    "isPure": false,
                    "kind": "functionCall",
                    "lValueRequested": false,
                    "names": [],
                    "nodeType": "FunctionCall",
                    "src": "1856:105:0",
                    "typeDescriptions": {
                      "typeIdentifier": "t_tuple$__$",
                      "typeString": "tuple()"
                    }
                  },
                  "id": 177,
                  "nodeType": "ExpressionStatement",
                  "src": "1856:105:0"
                },
                {
                  "expression": {
                    "argumentTypes": null,
                    "id": 180,
                    "isConstant": false,
                    "isLValue": false,
                    "isPure": false,
                    "lValueRequested": false,
                    "leftHandSide": {
                      "argumentTypes": null,
                      "id": 178,
                      "name": "recoveryAddress",
                      "nodeType": "Identifier",
                      "overloadedDeclarations": [],
                      "referencedDeclaration": 16,
                      "src": "1974:15:0",
                      "typeDescriptions": {
                        "typeIdentifier": "t_address_payable",
                        "typeString": "address payable"
                      }
                    },
                    "nodeType": "Assignment",
                    "operator": "=",
                    "rightHandSide": {
                      "argumentTypes": null,
                      "id": 179,
                      "name": "_recoveryAddress",
                      "nodeType": "Identifier",
                      "overloadedDeclarations": [],
                      "referencedDeclaration": 153,
                      "src": "1992:16:0",
                      "typeDescriptions": {
                        "typeIdentifier": "t_address_payable",
                        "typeString": "address payable"
                      }
                    },
                    "src": "1974:34:0",
                    "typeDescriptions": {
                      "typeIdentifier": "t_address_payable",
                      "typeString": "address payable"
                    }
                  },
                  "id": 181,
                  "nodeType": "ExpressionStatement",
                  "src": "1974:34:0"
                },
                {
                  "expression": {
                    "argumentTypes": null,
                    "id": 184,
                    "isConstant": false,
                    "isLValue": false,
                    "isPure": false,
                    "lValueRequested": false,
                    "leftHandSide": {
                      "argumentTypes": null,
                      "id": 182,
                      "name": "timedelta",
                      "nodeType": "Identifier",
                      "overloadedDeclarations": [],
                      "referencedDeclaration": 9,
                      "src": "2019:9:0",
                      "typeDescriptions": {
                        "typeIdentifier": "t_uint256",
                        "typeString": "uint256"
                      }
                    },
                    "nodeType": "Assignment",
                    "operator": "=",
                    "rightHandSide": {
                      "argumentTypes": null,
                      "id": 183,
                      "name": "_timedelta",
                      "nodeType": "Identifier",
                      "overloadedDeclarations": [],
                      "referencedDeclaration": 155,
                      "src": "2031:10:0",
                      "typeDescriptions": {
                        "typeIdentifier": "t_uint256",
                        "typeString": "uint256"
                      }
                    },
                    "src": "2019:22:0",
                    "typeDescriptions": {
                      "typeIdentifier": "t_uint256",
                      "typeString": "uint256"
                    }
                  },
                  "id": 185,
                  "nodeType": "ExpressionStatement",
                  "src": "2019:22:0"
                },
                {
                  "eventCall": {
                    "argumentTypes": null,
                    "arguments": [
                      {
                        "argumentTypes": null,
                        "id": 187,
                        "name": "_recoveryAddress",
                        "nodeType": "Identifier",
                        "overloadedDeclarations": [],
                        "referencedDeclaration": 153,
                        "src": "2078:16:0",
                        "typeDescriptions": {
                          "typeIdentifier": "t_address_payable",
                          "typeString": "address payable"
                        }
                      },
                      {
                        "argumentTypes": null,
                        "id": 188,
                        "name": "_timedelta",
                        "nodeType": "Identifier",
                        "overloadedDeclarations": [],
                        "referencedDeclaration": 155,
                        "src": "2096:10:0",
                        "typeDescriptions": {
                          "typeIdentifier": "t_uint256",
                          "typeString": "uint256"
                        }
                      }
                    ],
                    "expression": {
                      "argumentTypes": [
                        {
                          "typeIdentifier": "t_address_payable",
                          "typeString": "address payable"
                        },
                        {
                          "typeIdentifier": "t_uint256",
                          "typeString": "uint256"
                        }
                      ],
                      "id": 186,
                      "name": "NewRecoveryAddress",
                      "nodeType": "Identifier",
                      "overloadedDeclarations": [],
                      "referencedDeclaration": 38,
                      "src": "2059:18:0",
                      "typeDescriptions": {
                        "typeIdentifier": "t_function_event_nonpayable$_t_address_$_t_uint256_$returns$__$",
                        "typeString": "function (address,uint256)"
                      }
                    },
                    "id": 189,
                    "isConstant": false,
                    "isLValue": false,
                    "isPure": false,
                    "kind": "functionCall",
                    "lValueRequested": false,
                    "names": [],
                    "nodeType": "FunctionCall",
                    "src": "2059:48:0",
                    "typeDescriptions": {
                      "typeIdentifier": "t_tuple$__$",
                      "typeString": "tuple()"
                    }
                  },
                  "id": 190,
                  "nodeType": "EmitStatement",
                  "src": "2054:53:0"
                }
              ]
            },
            "documentation": null,
            "id": 192,
            "implemented": true,
            "kind": "function",
            "modifiers": [
              {
                "arguments": null,
                "id": 158,
                "modifierName": {
                  "argumentTypes": null,
                  "id": 157,
                  "name": "updateLastCall",
                  "nodeType": "Identifier",
                  "overloadedDeclarations": [],
                  "referencedDeclaration": 57,
                  "src": "1684:14:0",
                  "typeDescriptions": {
                    "typeIdentifier": "t_modifier$__$",
                    "typeString": "modifier ()"
                  }
                },
                "nodeType": "ModifierInvocation",
                "src": "1684:14:0"
              },
              {
                "arguments": null,
                "id": 160,
                "modifierName": {
                  "argumentTypes": null,
                  "id": 159,
                  "name": "onlyOwner",
                  "nodeType": "Identifier",
                  "overloadedDeclarations": [],
                  "referencedDeclaration": 696,
                  "src": "1699:9:0",
                  "typeDescriptions": {
                    "typeIdentifier": "t_modifier$__$",
                    "typeString": "modifier ()"
                  }
                },
                "nodeType": "ModifierInvocation",
                "src": "1699:9:0"
              }
            ],
            "name": "setRecoveryAddress",
            "nodeType": "FunctionDefinition",
            "parameters": {
              "id": 156,
              "nodeType": "ParameterList",
              "parameters": [
                {
                  "constant": false,
                  "id": 153,
                  "name": "_recoveryAddress",
                  "nodeType": "VariableDeclaration",
                  "scope": 192,
                  "src": "1608:32:0",
                  "stateVariable": false,
                  "storageLocation": "default",
                  "typeDescriptions": {
                    "typeIdentifier": "t_address_payable",
                    "typeString": "address payable"
                  },
                  "typeName": {
                    "id": 152,
                    "name": "address",
                    "nodeType": "ElementaryTypeName",
                    "src": "1608:15:0",
                    "stateMutability": "payable",
                    "typeDescriptions": {
                      "typeIdentifier": "t_address_payable",
                      "typeString": "address payable"
                    }
                  },
                  "value": null,
                  "visibility": "internal"
                },
                {
                  "constant": false,
                  "id": 155,
                  "name": "_timedelta",
                  "nodeType": "VariableDeclaration",
                  "scope": 192,
                  "src": "1651:18:0",
                  "stateVariable": false,
                  "storageLocation": "default",
                  "typeDescriptions": {
                    "typeIdentifier": "t_uint256",
                    "typeString": "uint256"
                  },
                  "typeName": {
                    "id": 154,
                    "name": "uint256",
                    "nodeType": "ElementaryTypeName",
                    "src": "1651:7:0",
                    "typeDescriptions": {
                      "typeIdentifier": "t_uint256",
                      "typeString": "uint256"
                    }
                  },
                  "value": null,
                  "visibility": "internal"
                }
              ],
              "src": "1597:79:0"
            },
            "returnParameters": {
              "id": 161,
              "nodeType": "ParameterList",
              "parameters": [],
              "src": "1709:0:0"
            },
            "scope": 294,
            "src": "1570:545:0",
            "stateMutability": "nonpayable",
            "superFunction": null,
            "visibility": "public"
          },
          {
            "body": {
              "id": 246,
              "nodeType": "Block",
              "src": "2154:433:0",
              "statements": [
                {
                  "expression": {
                    "argumentTypes": null,
                    "arguments": [
                      {
                        "argumentTypes": null,
                        "arguments": [],
                        "expression": {
                          "argumentTypes": [],
                          "id": 196,
                          "name": "isRecoverable",
                          "nodeType": "Identifier",
                          "overloadedDeclarations": [],
                          "referencedDeclaration": 91,
                          "src": "2173:13:0",
                          "typeDescriptions": {
                            "typeIdentifier": "t_function_internal_view$__$returns$_t_bool_$",
                            "typeString": "function () view returns (bool)"
                          }
                        },
                        "id": 197,
                        "isConstant": false,
                        "isLValue": false,
                        "isPure": false,
                        "kind": "functionCall",
                        "lValueRequested": false,
                        "names": [],
                        "nodeType": "FunctionCall",
                        "src": "2173:15:0",
                        "typeDescriptions": {
                          "typeIdentifier": "t_bool",
                          "typeString": "bool"
                        }
                      },
                      {
                        "argumentTypes": null,
                        "hexValue": "23444357616c6c6574207265636f76657246756e647328293a2057616c6c6574206973206e6f74207265636f76657261626c65",
                        "id": 198,
                        "isConstant": false,
                        "isLValue": false,
                        "isPure": true,
                        "kind": "string",
                        "lValueRequested": false,
                        "nodeType": "Literal",
                        "src": "2190:53:0",
                        "subdenomination": null,
                        "typeDescriptions": {
                          "typeIdentifier": "t_stringliteral_32bbe7c7da923b8a40b0d93d8c138dfb389eab9951149490adba28453dae3073",
                          "typeString": "literal_string \"#DCWallet recoverFunds(): Wallet is not recoverable\""
                        },
                        "value": "#DCWallet recoverFunds(): Wallet is not recoverable"
                      }
                    ],
                    "expression": {
                      "argumentTypes": [
                        {
                          "typeIdentifier": "t_bool",
                          "typeString": "bool"
                        },
                        {
                          "typeIdentifier": "t_stringliteral_32bbe7c7da923b8a40b0d93d8c138dfb389eab9951149490adba28453dae3073",
                          "typeString": "literal_string \"#DCWallet recoverFunds(): Wallet is not recoverable\""
                        }
                      ],
                      "id": 195,
                      "name": "require",
                      "nodeType": "Identifier",
                      "overloadedDeclarations": [
                        1313,
                        1314
                      ],
                      "referencedDeclaration": 1314,
                      "src": "2165:7:0",
                      "typeDescriptions": {
                        "typeIdentifier": "t_function_require_pure$_t_bool_$_t_string_memory_ptr_$returns$__$",
                        "typeString": "function (bool,string memory) pure"
                      }
                    },
                    "id": 199,
                    "isConstant": false,
                    "isLValue": false,
                    "isPure": false,
                    "kind": "functionCall",
                    "lValueRequested": false,
                    "names": [],
                    "nodeType": "FunctionCall",
                    "src": "2165:79:0",
                    "typeDescriptions": {
                      "typeIdentifier": "t_tuple$__$",
                      "typeString": "tuple()"
                    }
                  },
                  "id": 200,
                  "nodeType": "ExpressionStatement",
                  "src": "2165:79:0"
                },
                {
                  "body": {
                    "id": 235,
                    "nodeType": "Block",
                    "src": "2310:189:0",
                    "statements": [
                      {
                        "assignments": [
                          213
                        ],
                        "declarations": [
                          {
                            "constant": false,
                            "id": 213,
                            "name": "erc20",
                            "nodeType": "VariableDeclaration",
                            "scope": 235,
                            "src": "2325:12:0",
                            "stateVariable": false,
                            "storageLocation": "default",
                            "typeDescriptions": {
                              "typeIdentifier": "t_contract$_IERC20_$1295",
                              "typeString": "contract IERC20"
                            },
                            "typeName": {
                              "contractScope": null,
                              "id": 212,
                              "name": "IERC20",
                              "nodeType": "UserDefinedTypeName",
                              "referencedDeclaration": 1295,
                              "src": "2325:6:0",
                              "typeDescriptions": {
                                "typeIdentifier": "t_contract$_IERC20_$1295",
                                "typeString": "contract IERC20"
                              }
                            },
                            "value": null,
                            "visibility": "internal"
                          }
                        ],
                        "id": 219,
                        "initialValue": {
                          "argumentTypes": null,
                          "arguments": [
                            {
                              "argumentTypes": null,
                              "baseExpression": {
                                "argumentTypes": null,
                                "id": 215,
                                "name": "recoverableAssets",
                                "nodeType": "Identifier",
                                "overloadedDeclarations": [],
                                "referencedDeclaration": 14,
                                "src": "2347:17:0",
                                "typeDescriptions": {
                                  "typeIdentifier": "t_array$_t_address_$dyn_storage",
                                  "typeString": "address[] storage ref"
                                }
                              },
                              "id": 217,
                              "indexExpression": {
                                "argumentTypes": null,
                                "id": 216,
                                "name": "i",
                                "nodeType": "Identifier",
                                "overloadedDeclarations": [],
                                "referencedDeclaration": 202,
                                "src": "2365:1:0",
                                "typeDescriptions": {
                                  "typeIdentifier": "t_uint8",
                                  "typeString": "uint8"
                                }
                              },
                              "isConstant": false,
                              "isLValue": true,
                              "isPure": false,
                              "lValueRequested": false,
                              "nodeType": "IndexAccess",
                              "src": "2347:20:0",
                              "typeDescriptions": {
                                "typeIdentifier": "t_address",
                                "typeString": "address"
                              }
                            }
                          ],
                          "expression": {
                            "argumentTypes": [
                              {
                                "typeIdentifier": "t_address",
                                "typeString": "address"
                              }
                            ],
                            "id": 214,
                            "name": "IERC20",
                            "nodeType": "Identifier",
                            "overloadedDeclarations": [],
                            "referencedDeclaration": 1295,
                            "src": "2340:6:0",
                            "typeDescriptions": {
                              "typeIdentifier": "t_type$_t_contract$_IERC20_$1295_$",
                              "typeString": "type(contract IERC20)"
                            }
                          },
                          "id": 218,
                          "isConstant": false,
                          "isLValue": false,
                          "isPure": false,
                          "kind": "typeConversion",
                          "lValueRequested": false,
                          "names": [],
                          "nodeType": "FunctionCall",
                          "src": "2340:28:0",
                          "typeDescriptions": {
                            "typeIdentifier": "t_contract$_IERC20_$1295",
                            "typeString": "contract IERC20"
                          }
                        },
                        "nodeType": "VariableDeclarationStatement",
                        "src": "2325:43:0"
                      },
                      {
                        "expression": {
                          "argumentTypes": null,
                          "arguments": [
                            {
                              "argumentTypes": null,
                              "id": 226,
                              "name": "recoveryAddress",
                              "nodeType": "Identifier",
                              "overloadedDeclarations": [],
                              "referencedDeclaration": 16,
                              "src": "2439:15:0",
                              "typeDescriptions": {
                                "typeIdentifier": "t_address_payable",
                                "typeString": "address payable"
                              }
                            },
                            {
                              "argumentTypes": null,
                              "arguments": [
                                {
                                  "argumentTypes": null,
                                  "arguments": [
                                    {
                                      "argumentTypes": null,
                                      "id": 230,
                                      "name": "this",
                                      "nodeType": "Identifier",
                                      "overloadedDeclarations": [],
                                      "referencedDeclaration": 1330,
                                      "src": "2480:4:0",
                                      "typeDescriptions": {
                                        "typeIdentifier": "t_contract$_DCWallet_$294",
                                        "typeString": "contract DCWallet"
                                      }
                                    }
                                  ],
                                  "expression": {
                                    "argumentTypes": [
                                      {
                                        "typeIdentifier": "t_contract$_DCWallet_$294",
                                        "typeString": "contract DCWallet"
                                      }
                                    ],
                                    "id": 229,
                                    "isConstant": false,
                                    "isLValue": false,
                                    "isPure": true,
                                    "lValueRequested": false,
                                    "nodeType": "ElementaryTypeNameExpression",
                                    "src": "2472:7:0",
                                    "typeDescriptions": {
                                      "typeIdentifier": "t_type$_t_address_$",
                                      "typeString": "type(address)"
                                    },
                                    "typeName": "address"
                                  },
                                  "id": 231,
                                  "isConstant": false,
                                  "isLValue": false,
                                  "isPure": false,
                                  "kind": "typeConversion",
                                  "lValueRequested": false,
                                  "names": [],
                                  "nodeType": "FunctionCall",
                                  "src": "2472:13:0",
                                  "typeDescriptions": {
                                    "typeIdentifier": "t_address_payable",
                                    "typeString": "address payable"
                                  }
                                }
                              ],
                              "expression": {
                                "argumentTypes": [
                                  {
                                    "typeIdentifier": "t_address_payable",
                                    "typeString": "address payable"
                                  }
                                ],
                                "expression": {
                                  "argumentTypes": null,
                                  "id": 227,
                                  "name": "erc20",
                                  "nodeType": "Identifier",
                                  "overloadedDeclarations": [],
                                  "referencedDeclaration": 213,
                                  "src": "2456:5:0",
                                  "typeDescriptions": {
                                    "typeIdentifier": "t_contract$_IERC20_$1295",
                                    "typeString": "contract IERC20"
                                  }
                                },
                                "id": 228,
                                "isConstant": false,
                                "isLValue": false,
                                "isPure": false,
                                "lValueRequested": false,
                                "memberName": "balanceOf",
                                "nodeType": "MemberAccess",
                                "referencedDeclaration": 1240,
                                "src": "2456:15:0",
                                "typeDescriptions": {
                                  "typeIdentifier": "t_function_external_view$_t_address_$returns$_t_uint256_$",
                                  "typeString": "function (address) view external returns (uint256)"
                                }
                              },
                              "id": 232,
                              "isConstant": false,
                              "isLValue": false,
                              "isPure": false,
                              "kind": "functionCall",
                              "lValueRequested": false,
                              "names": [],
                              "nodeType": "FunctionCall",
                              "src": "2456:30:0",
                              "typeDescriptions": {
                                "typeIdentifier": "t_uint256",
                                "typeString": "uint256"
                              }
                            }
                          ],
                          "expression": {
                            "argumentTypes": [
                              {
                                "typeIdentifier": "t_address_payable",
                                "typeString": "address payable"
                              },
                              {
                                "typeIdentifier": "t_uint256",
                                "typeString": "uint256"
                              }
                            ],
                            "expression": {
                              "argumentTypes": null,
                              "arguments": [
                                {
                                  "argumentTypes": null,
                                  "baseExpression": {
                                    "argumentTypes": null,
                                    "id": 221,
                                    "name": "recoverableAssets",
                                    "nodeType": "Identifier",
                                    "overloadedDeclarations": [],
                                    "referencedDeclaration": 14,
                                    "src": "2390:17:0",
                                    "typeDescriptions": {
                                      "typeIdentifier": "t_array$_t_address_$dyn_storage",
                                      "typeString": "address[] storage ref"
                                    }
                                  },
                                  "id": 223,
                                  "indexExpression": {
                                    "argumentTypes": null,
                                    "id": 222,
                                    "name": "i",
                                    "nodeType": "Identifier",
                                    "overloadedDeclarations": [],
                                    "referencedDeclaration": 202,
                                    "src": "2408:1:0",
                                    "typeDescriptions": {
                                      "typeIdentifier": "t_uint8",
                                      "typeString": "uint8"
                                    }
                                  },
                                  "isConstant": false,
                                  "isLValue": true,
                                  "isPure": false,
                                  "lValueRequested": false,
                                  "nodeType": "IndexAccess",
                                  "src": "2390:20:0",
                                  "typeDescriptions": {
                                    "typeIdentifier": "t_address",
                                    "typeString": "address"
                                  }
                                }
                              ],
                              "expression": {
                                "argumentTypes": [
                                  {
                                    "typeIdentifier": "t_address",
                                    "typeString": "address"
                                  }
                                ],
                                "id": 220,
                                "name": "IERC20",
                                "nodeType": "Identifier",
                                "overloadedDeclarations": [],
                                "referencedDeclaration": 1295,
                                "src": "2383:6:0",
                                "typeDescriptions": {
                                  "typeIdentifier": "t_type$_t_contract$_IERC20_$1295_$",
                                  "typeString": "type(contract IERC20)"
                                }
                              },
                              "id": 224,
                              "isConstant": false,
                              "isLValue": false,
                              "isPure": false,
                              "kind": "typeConversion",
                              "lValueRequested": false,
                              "names": [],
                              "nodeType": "FunctionCall",
                              "src": "2383:28:0",
                              "typeDescriptions": {
                                "typeIdentifier": "t_contract$_IERC20_$1295",
                                "typeString": "contract IERC20"
                              }
                            },
                            "id": 225,
                            "isConstant": false,
                            "isLValue": false,
                            "isPure": false,
                            "lValueRequested": false,
                            "memberName": "transfer",
                            "nodeType": "MemberAccess",
                            "referencedDeclaration": 1249,
                            "src": "2383:55:0",
                            "typeDescriptions": {
                              "typeIdentifier": "t_function_external_nonpayable$_t_address_$_t_uint256_$returns$_t_bool_$",
                              "typeString": "function (address,uint256) external returns (bool)"
                            }
                          },
                          "id": 233,
                          "isConstant": false,
                          "isLValue": false,
                          "isPure": false,
                          "kind": "functionCall",
                          "lValueRequested": false,
                          "names": [],
                          "nodeType": "FunctionCall",
                          "src": "2383:104:0",
                          "typeDescriptions": {
                            "typeIdentifier": "t_bool",
                            "typeString": "bool"
                          }
                        },
                        "id": 234,
                        "nodeType": "ExpressionStatement",
                        "src": "2383:104:0"
                      }
                    ]
                  },
                  "condition": {
                    "argumentTypes": null,
                    "commonType": {
                      "typeIdentifier": "t_uint256",
                      "typeString": "uint256"
                    },
                    "id": 208,
                    "isConstant": false,
                    "isLValue": false,
                    "isPure": false,
                    "lValueRequested": false,
                    "leftExpression": {
                      "argumentTypes": null,
                      "id": 205,
                      "name": "i",
                      "nodeType": "Identifier",
                      "overloadedDeclarations": [],
                      "referencedDeclaration": 202,
                      "src": "2275:1:0",
                      "typeDescriptions": {
                        "typeIdentifier": "t_uint8",
                        "typeString": "uint8"
                      }
                    },
                    "nodeType": "BinaryOperation",
                    "operator": "<",
                    "rightExpression": {
                      "argumentTypes": null,
                      "expression": {
                        "argumentTypes": null,
                        "id": 206,
                        "name": "recoverableAssets",
                        "nodeType": "Identifier",
                        "overloadedDeclarations": [],
                        "referencedDeclaration": 14,
                        "src": "2279:17:0",
                        "typeDescriptions": {
                          "typeIdentifier": "t_array$_t_address_$dyn_storage",
                          "typeString": "address[] storage ref"
                        }
                      },
                      "id": 207,
                      "isConstant": false,
                      "isLValue": true,
                      "isPure": false,
                      "lValueRequested": false,
                      "memberName": "length",
                      "nodeType": "MemberAccess",
                      "referencedDeclaration": null,
                      "src": "2279:24:0",
                      "typeDescriptions": {
                        "typeIdentifier": "t_uint256",
                        "typeString": "uint256"
                      }
                    },
                    "src": "2275:28:0",
                    "typeDescriptions": {
                      "typeIdentifier": "t_bool",
                      "typeString": "bool"
                    }
                  },
                  "id": 236,
                  "initializationExpression": {
                    "assignments": [
                      202
                    ],
                    "declarations": [
                      {
                        "constant": false,
                        "id": 202,
                        "name": "i",
                        "nodeType": "VariableDeclaration",
                        "scope": 236,
                        "src": "2262:7:0",
                        "stateVariable": false,
                        "storageLocation": "default",
                        "typeDescriptions": {
                          "typeIdentifier": "t_uint8",
                          "typeString": "uint8"
                        },
                        "typeName": {
                          "id": 201,
                          "name": "uint8",
                          "nodeType": "ElementaryTypeName",
                          "src": "2262:5:0",
                          "typeDescriptions": {
                            "typeIdentifier": "t_uint8",
                            "typeString": "uint8"
                          }
                        },
                        "value": null,
                        "visibility": "internal"
                      }
                    ],
                    "id": 204,
                    "initialValue": {
                      "argumentTypes": null,
                      "hexValue": "30",
                      "id": 203,
                      "isConstant": false,
                      "isLValue": false,
                      "isPure": true,
                      "kind": "number",
                      "lValueRequested": false,
                      "nodeType": "Literal",
                      "src": "2272:1:0",
                      "subdenomination": null,
                      "typeDescriptions": {
                        "typeIdentifier": "t_rational_0_by_1",
                        "typeString": "int_const 0"
                      },
                      "value": "0"
                    },
                    "nodeType": "VariableDeclarationStatement",
                    "src": "2262:11:0"
                  },
                  "loopExpression": {
                    "expression": {
                      "argumentTypes": null,
                      "id": 210,
                      "isConstant": false,
                      "isLValue": false,
                      "isPure": false,
                      "lValueRequested": false,
                      "nodeType": "UnaryOperation",
                      "operator": "++",
                      "prefix": false,
                      "src": "2305:3:0",
                      "subExpression": {
                        "argumentTypes": null,
                        "id": 209,
                        "name": "i",
                        "nodeType": "Identifier",
                        "overloadedDeclarations": [],
                        "referencedDeclaration": 202,
                        "src": "2305:1:0",
                        "typeDescriptions": {
                          "typeIdentifier": "t_uint8",
                          "typeString": "uint8"
                        }
                      },
                      "typeDescriptions": {
                        "typeIdentifier": "t_uint8",
                        "typeString": "uint8"
                      }
                    },
                    "id": 211,
                    "nodeType": "ExpressionStatement",
                    "src": "2305:3:0"
                  },
                  "nodeType": "ForStatement",
                  "src": "2257:242:0"
                },
                {
                  "expression": {
                    "argumentTypes": null,
                    "arguments": [
                      {
                        "argumentTypes": null,
                        "expression": {
                          "argumentTypes": null,
                          "arguments": [
                            {
                              "argumentTypes": null,
                              "id": 241,
                              "name": "this",
                              "nodeType": "Identifier",
                              "overloadedDeclarations": [],
                              "referencedDeclaration": 1330,
                              "src": "2565:4:0",
                              "typeDescriptions": {
                                "typeIdentifier": "t_contract$_DCWallet_$294",
                                "typeString": "contract DCWallet"
                              }
                            }
                          ],
                          "expression": {
                            "argumentTypes": [
                              {
                                "typeIdentifier": "t_contract$_DCWallet_$294",
                                "typeString": "contract DCWallet"
                              }
                            ],
                            "id": 240,
                            "isConstant": false,
                            "isLValue": false,
                            "isPure": true,
                            "lValueRequested": false,
                            "nodeType": "ElementaryTypeNameExpression",
                            "src": "2557:7:0",
                            "typeDescriptions": {
                              "typeIdentifier": "t_type$_t_address_$",
                              "typeString": "type(address)"
                            },
                            "typeName": "address"
                          },
                          "id": 242,
                          "isConstant": false,
                          "isLValue": false,
                          "isPure": false,
                          "kind": "typeConversion",
                          "lValueRequested": false,
                          "names": [],
                          "nodeType": "FunctionCall",
                          "src": "2557:13:0",
                          "typeDescriptions": {
                            "typeIdentifier": "t_address_payable",
                            "typeString": "address payable"
                          }
                        },
                        "id": 243,
                        "isConstant": false,
                        "isLValue": false,
                        "isPure": false,
                        "lValueRequested": false,
                        "memberName": "balance",
                        "nodeType": "MemberAccess",
                        "referencedDeclaration": null,
                        "src": "2557:21:0",
                        "typeDescriptions": {
                          "typeIdentifier": "t_uint256",
                          "typeString": "uint256"
                        }
                      }
                    ],
                    "expression": {
                      "argumentTypes": [
                        {
                          "typeIdentifier": "t_uint256",
                          "typeString": "uint256"
                        }
                      ],
                      "expression": {
                        "argumentTypes": null,
                        "id": 237,
                        "name": "recoveryAddress",
                        "nodeType": "Identifier",
                        "overloadedDeclarations": [],
                        "referencedDeclaration": 16,
                        "src": "2532:15:0",
                        "typeDescriptions": {
                          "typeIdentifier": "t_address_payable",
                          "typeString": "address payable"
                        }
                      },
                      "id": 239,
                      "isConstant": false,
                      "isLValue": false,
                      "isPure": false,
                      "lValueRequested": false,
                      "memberName": "transfer",
                      "nodeType": "MemberAccess",
                      "referencedDeclaration": null,
                      "src": "2532:24:0",
                      "typeDescriptions": {
                        "typeIdentifier": "t_function_transfer_nonpayable$_t_uint256_$returns$__$",
                        "typeString": "function (uint256)"
                      }
                    },
                    "id": 244,
                    "isConstant": false,
                    "isLValue": false,
                    "isPure": false,
                    "kind": "functionCall",
                    "lValueRequested": false,
                    "names": [],
                    "nodeType": "FunctionCall",
                    "src": "2532:47:0",
                    "typeDescriptions": {
                      "typeIdentifier": "t_tuple$__$",
                      "typeString": "tuple()"
                    }
                  },
                  "id": 245,
                  "nodeType": "ExpressionStatement",
                  "src": "2532:47:0"
                }
              ]
            },
            "documentation": null,
            "id": 247,
            "implemented": true,
            "kind": "function",
            "modifiers": [],
            "name": "recoverFunds",
            "nodeType": "FunctionDefinition",
            "parameters": {
              "id": 193,
              "nodeType": "ParameterList",
              "parameters": [],
              "src": "2144:2:0"
            },
            "returnParameters": {
              "id": 194,
              "nodeType": "ParameterList",
              "parameters": [],
              "src": "2154:0:0"
            },
            "scope": 294,
            "src": "2123:464:0",
            "stateMutability": "nonpayable",
            "superFunction": null,
            "visibility": "public"
          },
          {
            "body": {
              "id": 288,
              "nodeType": "Block",
              "src": "2791:1217:0",
              "statements": [
                {
                  "assignments": [
                    263
                  ],
                  "declarations": [
                    {
                      "constant": false,
                      "id": 263,
                      "name": "dataLength",
                      "nodeType": "VariableDeclaration",
                      "scope": 288,
                      "src": "2802:15:0",
                      "stateVariable": false,
                      "storageLocation": "default",
                      "typeDescriptions": {
                        "typeIdentifier": "t_uint256",
                        "typeString": "uint256"
                      },
                      "typeName": {
                        "id": 262,
                        "name": "uint",
                        "nodeType": "ElementaryTypeName",
                        "src": "2802:4:0",
                        "typeDescriptions": {
                          "typeIdentifier": "t_uint256",
                          "typeString": "uint256"
                        }
                      },
                      "value": null,
                      "visibility": "internal"
                    }
                  ],
                  "id": 266,
                  "initialValue": {
                    "argumentTypes": null,
                    "expression": {
                      "argumentTypes": null,
                      "id": 264,
                      "name": "data",
                      "nodeType": "Identifier",
                      "overloadedDeclarations": [],
                      "referencedDeclaration": 253,
                      "src": "2820:4:0",
                      "typeDescriptions": {
                        "typeIdentifier": "t_bytes_memory_ptr",
                        "typeString": "bytes memory"
                      }
                    },
                    "id": 265,
                    "isConstant": false,
                    "isLValue": false,
                    "isPure": false,
                    "lValueRequested": false,
                    "memberName": "length",
                    "nodeType": "MemberAccess",
                    "referencedDeclaration": null,
                    "src": "2820:11:0",
                    "typeDescriptions": {
                      "typeIdentifier": "t_uint256",
                      "typeString": "uint256"
                    }
                  },
                  "nodeType": "VariableDeclarationStatement",
                  "src": "2802:29:0"
                },
                {
                  "assignments": [
                    268
                  ],
                  "declarations": [
                    {
                      "constant": false,
                      "id": 268,
                      "name": "result",
                      "nodeType": "VariableDeclaration",
                      "scope": 288,
                      "src": "2842:11:0",
                      "stateVariable": false,
                      "storageLocation": "default",
                      "typeDescriptions": {
                        "typeIdentifier": "t_bool",
                        "typeString": "bool"
                      },
                      "typeName": {
                        "id": 267,
                        "name": "bool",
                        "nodeType": "ElementaryTypeName",
                        "src": "2842:4:0",
                        "typeDescriptions": {
                          "typeIdentifier": "t_bool",
                          "typeString": "bool"
                        }
                      },
                      "value": null,
                      "visibility": "internal"
                    }
                  ],
                  "id": 269,
                  "initialValue": null,
                  "nodeType": "VariableDeclarationStatement",
                  "src": "2842:11:0"
                },
                {
                  "externalReferences": [
                    {
                      "data": {
                        "declaration": 253,
                        "isOffset": false,
                        "isSlot": false,
                        "src": "3031:4:0",
                        "valueSize": 1
                      }
                    },
                    {
                      "result": {
                        "declaration": 268,
                        "isOffset": false,
                        "isSlot": false,
                        "src": "3119:6:0",
                        "valueSize": 1
                      }
                    },
                    {
                      "destination": {
                        "declaration": 249,
                        "isOffset": false,
                        "isSlot": false,
                        "src": "3509:11:0",
                        "valueSize": 1
                      }
                    },
                    {
                      "value": {
                        "declaration": 251,
                        "isOffset": false,
                        "isSlot": false,
                        "src": "3539:5:0",
                        "valueSize": 1
                      }
                    },
                    {
                      "dataLength": {
                        "declaration": 263,
                        "isOffset": false,
                        "isSlot": false,
                        "src": "3583:10:0",
                        "valueSize": 1
                      }
                    }
                  ],
                  "id": 270,
                  "nodeType": "InlineAssembly",
                  "operations": "{\n    let x := mload(0x40)\n    let d := add(data, 32)\n    result := call(sub(gas(), 34710), destination, value, d, dataLength, x, 0)\n}",
                  "src": "2864:948:0"
                },
                {
                  "condition": {
                    "argumentTypes": null,
                    "id": 271,
                    "name": "result",
                    "nodeType": "Identifier",
                    "overloadedDeclarations": [],
                    "referencedDeclaration": 268,
                    "src": "3826:6:0",
                    "typeDescriptions": {
                      "typeIdentifier": "t_bool",
                      "typeString": "bool"
                    }
                  },
                  "falseBody": {
                    "id": 284,
                    "nodeType": "Block",
                    "src": "3903:74:0",
                    "statements": [
                      {
                        "eventCall": {
                          "argumentTypes": null,
                          "arguments": [
                            {
                              "argumentTypes": null,
                              "id": 279,
                              "name": "destination",
                              "nodeType": "Identifier",
                              "overloadedDeclarations": [],
                              "referencedDeclaration": 249,
                              "src": "3940:11:0",
                              "typeDescriptions": {
                                "typeIdentifier": "t_address",
                                "typeString": "address"
                              }
                            },
                            {
                              "argumentTypes": null,
                              "id": 280,
                              "name": "value",
                              "nodeType": "Identifier",
                              "overloadedDeclarations": [],
                              "referencedDeclaration": 251,
                              "src": "3953:5:0",
                              "typeDescriptions": {
                                "typeIdentifier": "t_uint256",
                                "typeString": "uint256"
                              }
                            },
                            {
                              "argumentTypes": null,
                              "id": 281,
                              "name": "data",
                              "nodeType": "Identifier",
                              "overloadedDeclarations": [],
                              "referencedDeclaration": 253,
                              "src": "3960:4:0",
                              "typeDescriptions": {
                                "typeIdentifier": "t_bytes_memory_ptr",
                                "typeString": "bytes memory"
                              }
                            }
                          ],
                          "expression": {
                            "argumentTypes": [
                              {
                                "typeIdentifier": "t_address",
                                "typeString": "address"
                              },
                              {
                                "typeIdentifier": "t_uint256",
                                "typeString": "uint256"
                              },
                              {
                                "typeIdentifier": "t_bytes_memory_ptr",
                                "typeString": "bytes memory"
                              }
                            ],
                            "id": 278,
                            "name": "ExecutionFailure",
                            "nodeType": "Identifier",
                            "overloadedDeclarations": [],
                            "referencedDeclaration": 32,
                            "src": "3923:16:0",
                            "typeDescriptions": {
                              "typeIdentifier": "t_function_event_nonpayable$_t_address_$_t_uint256_$_t_bytes_memory_ptr_$returns$__$",
                              "typeString": "function (address,uint256,bytes memory)"
                            }
                          },
                          "id": 282,
                          "isConstant": false,
                          "isLValue": false,
                          "isPure": false,
                          "kind": "functionCall",
                          "lValueRequested": false,
                          "names": [],
                          "nodeType": "FunctionCall",
                          "src": "3923:42:0",
                          "typeDescriptions": {
                            "typeIdentifier": "t_tuple$__$",
                            "typeString": "tuple()"
                          }
                        },
                        "id": 283,
                        "nodeType": "EmitStatement",
                        "src": "3918:47:0"
                      }
                    ]
                  },
                  "id": 285,
                  "nodeType": "IfStatement",
                  "src": "3822:155:0",
                  "trueBody": {
                    "eventCall": {
                      "argumentTypes": null,
                      "arguments": [
                        {
                          "argumentTypes": null,
                          "id": 273,
                          "name": "destination",
                          "nodeType": "Identifier",
                          "overloadedDeclarations": [],
                          "referencedDeclaration": 249,
                          "src": "3862:11:0",
                          "typeDescriptions": {
                            "typeIdentifier": "t_address",
                            "typeString": "address"
                          }
                        },
                        {
                          "argumentTypes": null,
                          "id": 274,
                          "name": "value",
                          "nodeType": "Identifier",
                          "overloadedDeclarations": [],
                          "referencedDeclaration": 251,
                          "src": "3875:5:0",
                          "typeDescriptions": {
                            "typeIdentifier": "t_uint256",
                            "typeString": "uint256"
                          }
                        },
                        {
                          "argumentTypes": null,
                          "id": 275,
                          "name": "data",
                          "nodeType": "Identifier",
                          "overloadedDeclarations": [],
                          "referencedDeclaration": 253,
                          "src": "3882:4:0",
                          "typeDescriptions": {
                            "typeIdentifier": "t_bytes_memory_ptr",
                            "typeString": "bytes memory"
                          }
                        }
                      ],
                      "expression": {
                        "argumentTypes": [
                          {
                            "typeIdentifier": "t_address",
                            "typeString": "address"
                          },
                          {
                            "typeIdentifier": "t_uint256",
                            "typeString": "uint256"
                          },
                          {
                            "typeIdentifier": "t_bytes_memory_ptr",
                            "typeString": "bytes memory"
                          }
                        ],
                        "id": 272,
                        "name": "Execution",
                        "nodeType": "Identifier",
                        "overloadedDeclarations": [],
                        "referencedDeclaration": 24,
                        "src": "3852:9:0",
                        "typeDescriptions": {
                          "typeIdentifier": "t_function_event_nonpayable$_t_address_$_t_uint256_$_t_bytes_memory_ptr_$returns$__$",
                          "typeString": "function (address,uint256,bytes memory)"
                        }
                      },
                      "id": 276,
                      "isConstant": false,
                      "isLValue": false,
                      "isPure": false,
                      "kind": "functionCall",
                      "lValueRequested": false,
                      "names": [],
                      "nodeType": "FunctionCall",
                      "src": "3852:35:0",
                      "typeDescriptions": {
                        "typeIdentifier": "t_tuple$__$",
                        "typeString": "tuple()"
                      }
                    },
                    "id": 277,
                    "nodeType": "EmitStatement",
                    "src": "3847:40:0"
                  }
                },
                {
                  "expression": {
                    "argumentTypes": null,
                    "id": 286,
                    "name": "result",
                    "nodeType": "Identifier",
                    "overloadedDeclarations": [],
                    "referencedDeclaration": 268,
                    "src": "3994:6:0",
                    "typeDescriptions": {
                      "typeIdentifier": "t_bool",
                      "typeString": "bool"
                    }
                  },
                  "functionReturnParameters": 261,
                  "id": 287,
                  "nodeType": "Return",
                  "src": "3987:13:0"
                }
              ]
            },
            "documentation": null,
            "id": 289,
            "implemented": true,
            "kind": "function",
            "modifiers": [
              {
                "arguments": null,
                "id": 256,
                "modifierName": {
                  "argumentTypes": null,
                  "id": 255,
                  "name": "updateLastCall",
                  "nodeType": "Identifier",
                  "overloadedDeclarations": [],
                  "referencedDeclaration": 57,
                  "src": "2728:14:0",
                  "typeDescriptions": {
                    "typeIdentifier": "t_modifier$__$",
                    "typeString": "modifier ()"
                  }
                },
                "nodeType": "ModifierInvocation",
                "src": "2728:14:0"
              },
              {
                "arguments": null,
                "id": 258,
                "modifierName": {
                  "argumentTypes": null,
                  "id": 257,
                  "name": "onlyOwner",
                  "nodeType": "Identifier",
                  "overloadedDeclarations": [],
                  "referencedDeclaration": 696,
                  "src": "2752:9:0",
                  "typeDescriptions": {
                    "typeIdentifier": "t_modifier$__$",
                    "typeString": "modifier ()"
                  }
                },
                "nodeType": "ModifierInvocation",
                "src": "2752:9:0"
              }
            ],
            "name": "executeTransaction",
            "nodeType": "FunctionDefinition",
            "parameters": {
              "id": 254,
              "nodeType": "ParameterList",
              "parameters": [
                {
                  "constant": false,
                  "id": 249,
                  "name": "destination",
                  "nodeType": "VariableDeclaration",
                  "scope": 289,
                  "src": "2651:19:0",
                  "stateVariable": false,
                  "storageLocation": "default",
                  "typeDescriptions": {
                    "typeIdentifier": "t_address",
                    "typeString": "address"
                  },
                  "typeName": {
                    "id": 248,
                    "name": "address",
                    "nodeType": "ElementaryTypeName",
                    "src": "2651:7:0",
                    "stateMutability": "nonpayable",
                    "typeDescriptions": {
                      "typeIdentifier": "t_address",
                      "typeString": "address"
                    }
                  },
                  "value": null,
                  "visibility": "internal"
                },
                {
                  "constant": false,
                  "id": 251,
                  "name": "value",
                  "nodeType": "VariableDeclaration",
                  "scope": 289,
                  "src": "2672:10:0",
                  "stateVariable": false,
                  "storageLocation": "default",
                  "typeDescriptions": {
                    "typeIdentifier": "t_uint256",
                    "typeString": "uint256"
                  },
                  "typeName": {
                    "id": 250,
                    "name": "uint",
                    "nodeType": "ElementaryTypeName",
                    "src": "2672:4:0",
                    "typeDescriptions": {
                      "typeIdentifier": "t_uint256",
                      "typeString": "uint256"
                    }
                  },
                  "value": null,
                  "visibility": "internal"
                },
                {
                  "constant": false,
                  "id": 253,
                  "name": "data",
                  "nodeType": "VariableDeclaration",
                  "scope": 289,
                  "src": "2684:17:0",
                  "stateVariable": false,
                  "storageLocation": "memory",
                  "typeDescriptions": {
                    "typeIdentifier": "t_bytes_memory_ptr",
                    "typeString": "bytes"
                  },
                  "typeName": {
                    "id": 252,
                    "name": "bytes",
                    "nodeType": "ElementaryTypeName",
                    "src": "2684:5:0",
                    "typeDescriptions": {
                      "typeIdentifier": "t_bytes_storage_ptr",
                      "typeString": "bytes"
                    }
                  },
                  "value": null,
                  "visibility": "internal"
                }
              ],
              "src": "2650:52:0"
            },
            "returnParameters": {
              "id": 261,
              "nodeType": "ParameterList",
              "parameters": [
                {
                  "constant": false,
                  "id": 260,
                  "name": "",
                  "nodeType": "VariableDeclaration",
                  "scope": 289,
                  "src": "2780:4:0",
                  "stateVariable": false,
                  "storageLocation": "default",
                  "typeDescriptions": {
                    "typeIdentifier": "t_bool",
                    "typeString": "bool"
                  },
                  "typeName": {
                    "id": 259,
                    "name": "bool",
                    "nodeType": "ElementaryTypeName",
                    "src": "2780:4:0",
                    "typeDescriptions": {
                      "typeIdentifier": "t_bool",
                      "typeString": "bool"
                    }
                  },
                  "value": null,
                  "visibility": "internal"
                }
              ],
              "src": "2779:6:0"
            },
            "scope": 294,
            "src": "2623:1385:0",
            "stateMutability": "nonpayable",
            "superFunction": null,
            "visibility": "public"
          },
          {
            "body": {
              "id": 292,
              "nodeType": "Block",
              "src": "4045:2:0",
              "statements": []
            },
            "documentation": null,
            "id": 293,
            "implemented": true,
            "kind": "fallback",
            "modifiers": [],
            "name": "",
            "nodeType": "FunctionDefinition",
            "parameters": {
              "id": 290,
              "nodeType": "ParameterList",
              "parameters": [],
              "src": "4025:2:0"
            },
            "returnParameters": {
              "id": 291,
              "nodeType": "ParameterList",
              "parameters": [],
              "src": "4045:0:0"
            },
            "scope": 294,
            "src": "4016:31:0",
            "stateMutability": "payable",
            "superFunction": null,
            "visibility": "external"
          }
        ],
        "scope": 295,
        "src": "152:3898:0"
      }
    ],
    "src": "0:4052:0"
  },
  "legacyAST": {
    "absolutePath": "/C/lib/10DEV/ethwaterloo-contract-account-metamask-plugin/truffle/contracts/DCWallet.sol",
    "exportedSymbols": {
      "DCWallet": [
        294
      ]
    },
    "id": 295,
    "nodeType": "SourceUnit",
    "nodes": [
      {
        "id": 1,
        "literals": [
          "solidity",
          ">=",
          "0.5",
          ".0",
          "<",
          "0.6",
          ".0"
        ],
        "nodeType": "PragmaDirective",
        "src": "0:31:0"
      },
      {
        "absolutePath": "@openzeppelin/contracts/token/ERC20/IERC20.sol",
        "file": "@openzeppelin/contracts/token/ERC20/IERC20.sol",
        "id": 2,
        "nodeType": "ImportDirective",
        "scope": 295,
        "sourceUnit": 1296,
        "src": "35:56:0",
        "symbolAliases": [],
        "unitAlias": ""
      },
      {
        "absolutePath": "@openzeppelin/contracts/ownership/Ownable.sol",
        "file": "@openzeppelin/contracts/ownership/Ownable.sol",
        "id": 3,
        "nodeType": "ImportDirective",
        "scope": 295,
        "sourceUnit": 764,
        "src": "93:55:0",
        "symbolAliases": [],
        "unitAlias": ""
      },
      {
        "baseContracts": [
          {
            "arguments": null,
            "baseName": {
              "contractScope": null,
              "id": 4,
              "name": "Ownable",
              "nodeType": "UserDefinedTypeName",
              "referencedDeclaration": 763,
              "src": "173:7:0",
              "typeDescriptions": {
                "typeIdentifier": "t_contract$_Ownable_$763",
                "typeString": "contract Ownable"
              }
            },
            "id": 5,
            "nodeType": "InheritanceSpecifier",
            "src": "173:7:0"
          }
        ],
        "contractDependencies": [
          462,
          763
        ],
        "contractKind": "contract",
        "documentation": null,
        "fullyImplemented": true,
        "id": 294,
        "linearizedBaseContracts": [
          294,
          763,
          462
        ],
        "name": "DCWallet",
        "nodeType": "ContractDefinition",
        "nodes": [
          {
            "constant": false,
            "id": 7,
            "name": "word",
            "nodeType": "VariableDeclaration",
            "scope": 294,
            "src": "188:18:0",
            "stateVariable": true,
            "storageLocation": "default",
            "typeDescriptions": {
              "typeIdentifier": "t_string_storage",
              "typeString": "string"
            },
            "typeName": {
              "id": 6,
              "name": "string",
              "nodeType": "ElementaryTypeName",
              "src": "188:6:0",
              "typeDescriptions": {
                "typeIdentifier": "t_string_storage_ptr",
                "typeString": "string"
              }
            },
            "value": null,
            "visibility": "public"
          },
          {
            "constant": false,
            "id": 9,
            "name": "timedelta",
            "nodeType": "VariableDeclaration",
            "scope": 294,
            "src": "213:21:0",
            "stateVariable": true,
            "storageLocation": "default",
            "typeDescriptions": {
              "typeIdentifier": "t_uint256",
              "typeString": "uint256"
            },
            "typeName": {
              "id": 8,
              "name": "uint",
              "nodeType": "ElementaryTypeName",
              "src": "213:4:0",
              "typeDescriptions": {
                "typeIdentifier": "t_uint256",
                "typeString": "uint256"
              }
            },
            "value": null,
            "visibility": "public"
          },
          {
            "constant": false,
            "id": 11,
            "name": "lastCall",
            "nodeType": "VariableDeclaration",
            "scope": 294,
            "src": "255:20:0",
            "stateVariable": true,
            "storageLocation": "default",
            "typeDescriptions": {
              "typeIdentifier": "t_uint256",
              "typeString": "uint256"
            },
            "typeName": {
              "id": 10,
              "name": "uint",
              "nodeType": "ElementaryTypeName",
              "src": "255:4:0",
              "typeDescriptions": {
                "typeIdentifier": "t_uint256",
                "typeString": "uint256"
              }
            },
            "value": null,
            "visibility": "public"
          },
          {
            "constant": false,
            "id": 14,
            "name": "recoverableAssets",
            "nodeType": "VariableDeclaration",
            "scope": 294,
            "src": "296:34:0",
            "stateVariable": true,
            "storageLocation": "default",
            "typeDescriptions": {
              "typeIdentifier": "t_array$_t_address_$dyn_storage",
              "typeString": "address[]"
            },
            "typeName": {
              "baseType": {
                "id": 12,
                "name": "address",
                "nodeType": "ElementaryTypeName",
                "src": "296:7:0",
                "stateMutability": "nonpayable",
                "typeDescriptions": {
                  "typeIdentifier": "t_address",
                  "typeString": "address"
                }
              },
              "id": 13,
              "length": null,
              "nodeType": "ArrayTypeName",
              "src": "296:9:0",
              "typeDescriptions": {
                "typeIdentifier": "t_array$_t_address_$dyn_storage_ptr",
                "typeString": "address[]"
              }
            },
            "value": null,
            "visibility": "public"
          },
          {
            "constant": false,
            "id": 16,
            "name": "recoveryAddress",
            "nodeType": "VariableDeclaration",
            "scope": 294,
            "src": "337:38:0",
            "stateVariable": true,
            "storageLocation": "default",
            "typeDescriptions": {
              "typeIdentifier": "t_address_payable",
              "typeString": "address payable"
            },
            "typeName": {
              "id": 15,
              "name": "address",
              "nodeType": "ElementaryTypeName",
              "src": "337:15:0",
              "stateMutability": "payable",
              "typeDescriptions": {
                "typeIdentifier": "t_address_payable",
                "typeString": "address payable"
              }
            },
            "value": null,
            "visibility": "public"
          },
          {
            "anonymous": false,
            "documentation": null,
            "id": 24,
            "name": "Execution",
            "nodeType": "EventDefinition",
            "parameters": {
              "id": 23,
              "nodeType": "ParameterList",
              "parameters": [
                {
                  "constant": false,
                  "id": 18,
                  "indexed": false,
                  "name": "destination",
                  "nodeType": "VariableDeclaration",
                  "scope": 24,
                  "src": "400:19:0",
                  "stateVariable": false,
                  "storageLocation": "default",
                  "typeDescriptions": {
                    "typeIdentifier": "t_address",
                    "typeString": "address"
                  },
                  "typeName": {
                    "id": 17,
                    "name": "address",
                    "nodeType": "ElementaryTypeName",
                    "src": "400:7:0",
                    "stateMutability": "nonpayable",
                    "typeDescriptions": {
                      "typeIdentifier": "t_address",
                      "typeString": "address"
                    }
                  },
                  "value": null,
                  "visibility": "internal"
                },
                {
                  "constant": false,
                  "id": 20,
                  "indexed": false,
                  "name": "value",
                  "nodeType": "VariableDeclaration",
                  "scope": 24,
                  "src": "421:10:0",
                  "stateVariable": false,
                  "storageLocation": "default",
                  "typeDescriptions": {
                    "typeIdentifier": "t_uint256",
                    "typeString": "uint256"
                  },
                  "typeName": {
                    "id": 19,
                    "name": "uint",
                    "nodeType": "ElementaryTypeName",
                    "src": "421:4:0",
                    "typeDescriptions": {
                      "typeIdentifier": "t_uint256",
                      "typeString": "uint256"
                    }
                  },
                  "value": null,
                  "visibility": "internal"
                },
                {
                  "constant": false,
                  "id": 22,
                  "indexed": false,
                  "name": "data",
                  "nodeType": "VariableDeclaration",
                  "scope": 24,
                  "src": "433:10:0",
                  "stateVariable": false,
                  "storageLocation": "default",
                  "typeDescriptions": {
                    "typeIdentifier": "t_bytes_memory_ptr",
                    "typeString": "bytes"
                  },
                  "typeName": {
                    "id": 21,
                    "name": "bytes",
                    "nodeType": "ElementaryTypeName",
                    "src": "433:5:0",
                    "typeDescriptions": {
                      "typeIdentifier": "t_bytes_storage_ptr",
                      "typeString": "bytes"
                    }
                  },
                  "value": null,
                  "visibility": "internal"
                }
              ],
              "src": "399:45:0"
            },
            "src": "384:61:0"
          },
          {
            "anonymous": false,
            "documentation": null,
            "id": 32,
            "name": "ExecutionFailure",
            "nodeType": "EventDefinition",
            "parameters": {
              "id": 31,
              "nodeType": "ParameterList",
              "parameters": [
                {
                  "constant": false,
                  "id": 26,
                  "indexed": false,
                  "name": "destination",
                  "nodeType": "VariableDeclaration",
                  "scope": 32,
                  "src": "474:19:0",
                  "stateVariable": false,
                  "storageLocation": "default",
                  "typeDescriptions": {
                    "typeIdentifier": "t_address",
                    "typeString": "address"
                  },
                  "typeName": {
                    "id": 25,
                    "name": "address",
                    "nodeType": "ElementaryTypeName",
                    "src": "474:7:0",
                    "stateMutability": "nonpayable",
                    "typeDescriptions": {
                      "typeIdentifier": "t_address",
                      "typeString": "address"
                    }
                  },
                  "value": null,
                  "visibility": "internal"
                },
                {
                  "constant": false,
                  "id": 28,
                  "indexed": false,
                  "name": "value",
                  "nodeType": "VariableDeclaration",
                  "scope": 32,
                  "src": "495:10:0",
                  "stateVariable": false,
                  "storageLocation": "default",
                  "typeDescriptions": {
                    "typeIdentifier": "t_uint256",
                    "typeString": "uint256"
                  },
                  "typeName": {
                    "id": 27,
                    "name": "uint",
                    "nodeType": "ElementaryTypeName",
                    "src": "495:4:0",
                    "typeDescriptions": {
                      "typeIdentifier": "t_uint256",
                      "typeString": "uint256"
                    }
                  },
                  "value": null,
                  "visibility": "internal"
                },
                {
                  "constant": false,
                  "id": 30,
                  "indexed": false,
                  "name": "data",
                  "nodeType": "VariableDeclaration",
                  "scope": 32,
                  "src": "507:10:0",
                  "stateVariable": false,
                  "storageLocation": "default",
                  "typeDescriptions": {
                    "typeIdentifier": "t_bytes_memory_ptr",
                    "typeString": "bytes"
                  },
                  "typeName": {
                    "id": 29,
                    "name": "bytes",
                    "nodeType": "ElementaryTypeName",
                    "src": "507:5:0",
                    "typeDescriptions": {
                      "typeIdentifier": "t_bytes_storage_ptr",
                      "typeString": "bytes"
                    }
                  },
                  "value": null,
                  "visibility": "internal"
                }
              ],
              "src": "473:45:0"
            },
            "src": "451:68:0"
          },
          {
            "anonymous": false,
            "documentation": null,
            "id": 38,
            "name": "NewRecoveryAddress",
            "nodeType": "EventDefinition",
            "parameters": {
              "id": 37,
              "nodeType": "ParameterList",
              "parameters": [
                {
                  "constant": false,
                  "id": 34,
                  "indexed": false,
                  "name": "recoveryAddress",
                  "nodeType": "VariableDeclaration",
                  "scope": 38,
                  "src": "550:23:0",
                  "stateVariable": false,
                  "storageLocation": "default",
                  "typeDescriptions": {
                    "typeIdentifier": "t_address",
                    "typeString": "address"
                  },
                  "typeName": {
                    "id": 33,
                    "name": "address",
                    "nodeType": "ElementaryTypeName",
                    "src": "550:7:0",
                    "stateMutability": "nonpayable",
                    "typeDescriptions": {
                      "typeIdentifier": "t_address",
                      "typeString": "address"
                    }
                  },
                  "value": null,
                  "visibility": "internal"
                },
                {
                  "constant": false,
                  "id": 36,
                  "indexed": false,
                  "name": "timedelta",
                  "nodeType": "VariableDeclaration",
                  "scope": 38,
                  "src": "575:14:0",
                  "stateVariable": false,
                  "storageLocation": "default",
                  "typeDescriptions": {
                    "typeIdentifier": "t_uint256",
                    "typeString": "uint256"
                  },
                  "typeName": {
                    "id": 35,
                    "name": "uint",
                    "nodeType": "ElementaryTypeName",
                    "src": "575:4:0",
                    "typeDescriptions": {
                      "typeIdentifier": "t_uint256",
                      "typeString": "uint256"
                    }
                  },
                  "value": null,
                  "visibility": "internal"
                }
              ],
              "src": "549:41:0"
            },
            "src": "525:66:0"
          },
          {
            "body": {
              "id": 48,
              "nodeType": "Block",
              "src": "643:47:0",
              "statements": [
                {
                  "expression": {
                    "argumentTypes": null,
                    "arguments": [
                      {
                        "argumentTypes": null,
                        "id": 45,
                        "name": "assets",
                        "nodeType": "Identifier",
                        "overloadedDeclarations": [],
                        "referencedDeclaration": 41,
                        "src": "675:6:0",
                        "typeDescriptions": {
                          "typeIdentifier": "t_array$_t_address_$dyn_memory_ptr",
                          "typeString": "address[] memory"
                        }
                      }
                    ],
                    "expression": {
                      "argumentTypes": [
                        {
                          "typeIdentifier": "t_array$_t_address_$dyn_memory_ptr",
                          "typeString": "address[] memory"
                        }
                      ],
                      "id": 44,
                      "name": "setRecoverableAssets",
                      "nodeType": "Identifier",
                      "overloadedDeclarations": [],
                      "referencedDeclaration": 121,
                      "src": "654:20:0",
                      "typeDescriptions": {
                        "typeIdentifier": "t_function_internal_nonpayable$_t_array$_t_address_$dyn_memory_ptr_$returns$__$",
                        "typeString": "function (address[] memory)"
                      }
                    },
                    "id": 46,
                    "isConstant": false,
                    "isLValue": false,
                    "isPure": false,
                    "kind": "functionCall",
                    "lValueRequested": false,
                    "names": [],
                    "nodeType": "FunctionCall",
                    "src": "654:28:0",
                    "typeDescriptions": {
                      "typeIdentifier": "t_tuple$__$",
                      "typeString": "tuple()"
                    }
                  },
                  "id": 47,
                  "nodeType": "ExpressionStatement",
                  "src": "654:28:0"
                }
              ]
            },
            "documentation": null,
            "id": 49,
            "implemented": true,
            "kind": "constructor",
            "modifiers": [],
            "name": "",
            "nodeType": "FunctionDefinition",
            "parameters": {
              "id": 42,
              "nodeType": "ParameterList",
              "parameters": [
                {
                  "constant": false,
                  "id": 41,
                  "name": "assets",
                  "nodeType": "VariableDeclaration",
                  "scope": 49,
                  "src": "611:23:0",
                  "stateVariable": false,
                  "storageLocation": "memory",
                  "typeDescriptions": {
                    "typeIdentifier": "t_array$_t_address_$dyn_memory_ptr",
                    "typeString": "address[]"
                  },
                  "typeName": {
                    "baseType": {
                      "id": 39,
                      "name": "address",
                      "nodeType": "ElementaryTypeName",
                      "src": "611:7:0",
                      "stateMutability": "nonpayable",
                      "typeDescriptions": {
                        "typeIdentifier": "t_address",
                        "typeString": "address"
                      }
                    },
                    "id": 40,
                    "length": null,
                    "nodeType": "ArrayTypeName",
                    "src": "611:9:0",
                    "typeDescriptions": {
                      "typeIdentifier": "t_array$_t_address_$dyn_storage_ptr",
                      "typeString": "address[]"
                    }
                  },
                  "value": null,
                  "visibility": "internal"
                }
              ],
              "src": "610:25:0"
            },
            "returnParameters": {
              "id": 43,
              "nodeType": "ParameterList",
              "parameters": [],
              "src": "643:0:0"
            },
            "scope": 294,
            "src": "599:91:0",
            "stateMutability": "nonpayable",
            "superFunction": null,
            "visibility": "public"
          },
          {
            "body": {
              "id": 56,
              "nodeType": "Block",
              "src": "724:45:0",
              "statements": [
                {
                  "expression": {
                    "argumentTypes": null,
                    "id": 53,
                    "isConstant": false,
                    "isLValue": false,
                    "isPure": false,
                    "lValueRequested": false,
                    "leftHandSide": {
                      "argumentTypes": null,
                      "id": 51,
                      "name": "lastCall",
                      "nodeType": "Identifier",
                      "overloadedDeclarations": [],
                      "referencedDeclaration": 11,
                      "src": "735:8:0",
                      "typeDescriptions": {
                        "typeIdentifier": "t_uint256",
                        "typeString": "uint256"
                      }
                    },
                    "nodeType": "Assignment",
                    "operator": "=",
                    "rightHandSide": {
                      "argumentTypes": null,
                      "id": 52,
                      "name": "now",
                      "nodeType": "Identifier",
                      "overloadedDeclarations": [],
                      "referencedDeclaration": 1312,
                      "src": "746:3:0",
                      "typeDescriptions": {
                        "typeIdentifier": "t_uint256",
                        "typeString": "uint256"
                      }
                    },
                    "src": "735:14:0",
                    "typeDescriptions": {
                      "typeIdentifier": "t_uint256",
                      "typeString": "uint256"
                    }
                  },
                  "id": 54,
                  "nodeType": "ExpressionStatement",
                  "src": "735:14:0"
                },
                {
                  "id": 55,
                  "nodeType": "PlaceholderStatement",
                  "src": "760:1:0"
                }
              ]
            },
            "documentation": null,
            "id": 57,
            "name": "updateLastCall",
            "nodeType": "ModifierDefinition",
            "parameters": {
              "id": 50,
              "nodeType": "ParameterList",
              "parameters": [],
              "src": "721:2:0"
            },
            "src": "698:71:0",
            "visibility": "internal"
          },
          {
            "body": {
              "id": 78,
              "nodeType": "Block",
              "src": "832:131:0",
              "statements": [
                {
                  "condition": {
                    "argumentTypes": null,
                    "commonType": {
                      "typeIdentifier": "t_uint256",
                      "typeString": "uint256"
                    },
                    "id": 66,
                    "isConstant": false,
                    "isLValue": false,
                    "isPure": false,
                    "lValueRequested": false,
                    "leftExpression": {
                      "argumentTypes": null,
                      "id": 62,
                      "name": "now",
                      "nodeType": "Identifier",
                      "overloadedDeclarations": [],
                      "referencedDeclaration": 1312,
                      "src": "847:3:0",
                      "typeDescriptions": {
                        "typeIdentifier": "t_uint256",
                        "typeString": "uint256"
                      }
                    },
                    "nodeType": "BinaryOperation",
                    "operator": "<",
                    "rightExpression": {
                      "argumentTypes": null,
                      "commonType": {
                        "typeIdentifier": "t_uint256",
                        "typeString": "uint256"
                      },
                      "id": 65,
                      "isConstant": false,
                      "isLValue": false,
                      "isPure": false,
                      "lValueRequested": false,
                      "leftExpression": {
                        "argumentTypes": null,
                        "id": 63,
                        "name": "lastCall",
                        "nodeType": "Identifier",
                        "overloadedDeclarations": [],
                        "referencedDeclaration": 11,
                        "src": "853:8:0",
                        "typeDescriptions": {
                          "typeIdentifier": "t_uint256",
                          "typeString": "uint256"
                        }
                      },
                      "nodeType": "BinaryOperation",
                      "operator": "+",
                      "rightExpression": {
                        "argumentTypes": null,
                        "id": 64,
                        "name": "timedelta",
                        "nodeType": "Identifier",
                        "overloadedDeclarations": [],
                        "referencedDeclaration": 9,
                        "src": "864:9:0",
                        "typeDescriptions": {
                          "typeIdentifier": "t_uint256",
                          "typeString": "uint256"
                        }
                      },
                      "src": "853:20:0",
                      "typeDescriptions": {
                        "typeIdentifier": "t_uint256",
                        "typeString": "uint256"
                      }
                    },
                    "src": "847:26:0",
                    "typeDescriptions": {
                      "typeIdentifier": "t_bool",
                      "typeString": "bool"
                    }
                  },
                  "falseBody": null,
                  "id": 75,
                  "nodeType": "IfStatement",
                  "src": "843:94:0",
                  "trueBody": {
                    "id": 74,
                    "nodeType": "Block",
                    "src": "875:62:0",
                    "statements": [
                      {
                        "expression": {
                          "argumentTypes": null,
                          "commonType": {
                            "typeIdentifier": "t_uint256",
                            "typeString": "uint256"
                          },
                          "id": 72,
                          "isConstant": false,
                          "isLValue": false,
                          "isPure": false,
                          "lValueRequested": false,
                          "leftExpression": {
                            "argumentTypes": null,
                            "components": [
                              {
                                "argumentTypes": null,
                                "commonType": {
                                  "typeIdentifier": "t_uint256",
                                  "typeString": "uint256"
                                },
                                "id": 69,
                                "isConstant": false,
                                "isLValue": false,
                                "isPure": false,
                                "lValueRequested": false,
                                "leftExpression": {
                                  "argumentTypes": null,
                                  "id": 67,
                                  "name": "lastCall",
                                  "nodeType": "Identifier",
                                  "overloadedDeclarations": [],
                                  "referencedDeclaration": 11,
                                  "src": "898:8:0",
                                  "typeDescriptions": {
                                    "typeIdentifier": "t_uint256",
                                    "typeString": "uint256"
                                  }
                                },
                                "nodeType": "BinaryOperation",
                                "operator": "+",
                                "rightExpression": {
                                  "argumentTypes": null,
                                  "id": 68,
                                  "name": "timedelta",
                                  "nodeType": "Identifier",
                                  "overloadedDeclarations": [],
                                  "referencedDeclaration": 9,
                                  "src": "909:9:0",
                                  "typeDescriptions": {
                                    "typeIdentifier": "t_uint256",
                                    "typeString": "uint256"
                                  }
                                },
                                "src": "898:20:0",
                                "typeDescriptions": {
                                  "typeIdentifier": "t_uint256",
                                  "typeString": "uint256"
                                }
                              }
                            ],
                            "id": 70,
                            "isConstant": false,
                            "isInlineArray": false,
                            "isLValue": false,
                            "isPure": false,
                            "lValueRequested": false,
                            "nodeType": "TupleExpression",
                            "src": "897:22:0",
                            "typeDescriptions": {
                              "typeIdentifier": "t_uint256",
                              "typeString": "uint256"
                            }
                          },
                          "nodeType": "BinaryOperation",
                          "operator": "-",
                          "rightExpression": {
                            "argumentTypes": null,
                            "id": 71,
                            "name": "now",
                            "nodeType": "Identifier",
                            "overloadedDeclarations": [],
                            "referencedDeclaration": 1312,
                            "src": "922:3:0",
                            "typeDescriptions": {
                              "typeIdentifier": "t_uint256",
                              "typeString": "uint256"
                            }
                          },
                          "src": "897:28:0",
                          "typeDescriptions": {
                            "typeIdentifier": "t_uint256",
                            "typeString": "uint256"
                          }
                        },
                        "functionReturnParameters": 61,
                        "id": 73,
                        "nodeType": "Return",
                        "src": "890:35:0"
                      }
                    ]
                  }
                },
                {
                  "expression": {
                    "argumentTypes": null,
                    "hexValue": "30",
                    "id": 76,
                    "isConstant": false,
                    "isLValue": false,
                    "isPure": true,
                    "kind": "number",
                    "lValueRequested": false,
                    "nodeType": "Literal",
                    "src": "954:1:0",
                    "subdenomination": null,
                    "typeDescriptions": {
                      "typeIdentifier": "t_rational_0_by_1",
                      "typeString": "int_const 0"
                    },
                    "value": "0"
                  },
                  "functionReturnParameters": 61,
                  "id": 77,
                  "nodeType": "Return",
                  "src": "947:8:0"
                }
              ]
            },
            "documentation": null,
            "id": 79,
            "implemented": true,
            "kind": "function",
            "modifiers": [],
            "name": "timeTillDeadline",
            "nodeType": "FunctionDefinition",
            "parameters": {
              "id": 58,
              "nodeType": "ParameterList",
              "parameters": [],
              "src": "802:2:0"
            },
            "returnParameters": {
              "id": 61,
              "nodeType": "ParameterList",
              "parameters": [
                {
                  "constant": false,
                  "id": 60,
                  "name": "",
                  "nodeType": "VariableDeclaration",
                  "scope": 79,
                  "src": "826:4:0",
                  "stateVariable": false,
                  "storageLocation": "default",
                  "typeDescriptions": {
                    "typeIdentifier": "t_uint256",
                    "typeString": "uint256"
                  },
                  "typeName": {
                    "id": 59,
                    "name": "uint",
                    "nodeType": "ElementaryTypeName",
                    "src": "826:4:0",
                    "typeDescriptions": {
                      "typeIdentifier": "t_uint256",
                      "typeString": "uint256"
                    }
                  },
                  "value": null,
                  "visibility": "internal"
                }
              ],
              "src": "825:6:0"
            },
            "scope": 294,
            "src": "777:186:0",
            "stateMutability": "view",
            "superFunction": null,
            "visibility": "public"
          },
          {
            "body": {
              "id": 90,
              "nodeType": "Block",
              "src": "1023:53:0",
              "statements": [
                {
                  "expression": {
                    "argumentTypes": null,
                    "commonType": {
                      "typeIdentifier": "t_uint256",
                      "typeString": "uint256"
                    },
                    "id": 88,
                    "isConstant": false,
                    "isLValue": false,
                    "isPure": false,
                    "lValueRequested": false,
                    "leftExpression": {
                      "argumentTypes": null,
                      "id": 84,
                      "name": "now",
                      "nodeType": "Identifier",
                      "overloadedDeclarations": [],
                      "referencedDeclaration": 1312,
                      "src": "1041:3:0",
                      "typeDescriptions": {
                        "typeIdentifier": "t_uint256",
                        "typeString": "uint256"
                      }
                    },
                    "nodeType": "BinaryOperation",
                    "operator": ">=",
                    "rightExpression": {
                      "argumentTypes": null,
                      "commonType": {
                        "typeIdentifier": "t_uint256",
                        "typeString": "uint256"
                      },
                      "id": 87,
                      "isConstant": false,
                      "isLValue": false,
                      "isPure": false,
                      "lValueRequested": false,
                      "leftExpression": {
                        "argumentTypes": null,
                        "id": 85,
                        "name": "lastCall",
                        "nodeType": "Identifier",
                        "overloadedDeclarations": [],
                        "referencedDeclaration": 11,
                        "src": "1048:8:0",
                        "typeDescriptions": {
                          "typeIdentifier": "t_uint256",
                          "typeString": "uint256"
                        }
                      },
                      "nodeType": "BinaryOperation",
                      "operator": "+",
                      "rightExpression": {
                        "argumentTypes": null,
                        "id": 86,
                        "name": "timedelta",
                        "nodeType": "Identifier",
                        "overloadedDeclarations": [],
                        "referencedDeclaration": 9,
                        "src": "1059:9:0",
                        "typeDescriptions": {
                          "typeIdentifier": "t_uint256",
                          "typeString": "uint256"
                        }
                      },
                      "src": "1048:20:0",
                      "typeDescriptions": {
                        "typeIdentifier": "t_uint256",
                        "typeString": "uint256"
                      }
                    },
                    "src": "1041:27:0",
                    "typeDescriptions": {
                      "typeIdentifier": "t_bool",
                      "typeString": "bool"
                    }
                  },
                  "functionReturnParameters": 83,
                  "id": 89,
                  "nodeType": "Return",
                  "src": "1034:34:0"
                }
              ]
            },
            "documentation": null,
            "id": 91,
            "implemented": true,
            "kind": "function",
            "modifiers": [],
            "name": "isRecoverable",
            "nodeType": "FunctionDefinition",
            "parameters": {
              "id": 80,
              "nodeType": "ParameterList",
              "parameters": [],
              "src": "993:2:0"
            },
            "returnParameters": {
              "id": 83,
              "nodeType": "ParameterList",
              "parameters": [
                {
                  "constant": false,
                  "id": 82,
                  "name": "",
                  "nodeType": "VariableDeclaration",
                  "scope": 91,
                  "src": "1017:4:0",
                  "stateVariable": false,
                  "storageLocation": "default",
                  "typeDescriptions": {
                    "typeIdentifier": "t_bool",
                    "typeString": "bool"
                  },
                  "typeName": {
                    "id": 81,
                    "name": "bool",
                    "nodeType": "ElementaryTypeName",
                    "src": "1017:4:0",
                    "typeDescriptions": {
                      "typeIdentifier": "t_bool",
                      "typeString": "bool"
                    }
                  },
                  "value": null,
                  "visibility": "internal"
                }
              ],
              "src": "1016:6:0"
            },
            "scope": 294,
            "src": "971:105:0",
            "stateMutability": "view",
            "superFunction": null,
            "visibility": "public"
          },
          {
            "body": {
              "id": 120,
              "nodeType": "Block",
              "src": "1156:120:0",
              "statements": [
                {
                  "body": {
                    "id": 118,
                    "nodeType": "Block",
                    "src": "1209:60:0",
                    "statements": [
                      {
                        "expression": {
                          "argumentTypes": null,
                          "arguments": [
                            {
                              "argumentTypes": null,
                              "baseExpression": {
                                "argumentTypes": null,
                                "id": 113,
                                "name": "assets",
                                "nodeType": "Identifier",
                                "overloadedDeclarations": [],
                                "referencedDeclaration": 94,
                                "src": "1247:6:0",
                                "typeDescriptions": {
                                  "typeIdentifier": "t_array$_t_address_$dyn_memory_ptr",
                                  "typeString": "address[] memory"
                                }
                              },
                              "id": 115,
                              "indexExpression": {
                                "argumentTypes": null,
                                "id": 114,
                                "name": "i",
                                "nodeType": "Identifier",
                                "overloadedDeclarations": [],
                                "referencedDeclaration": 100,
                                "src": "1254:1:0",
                                "typeDescriptions": {
                                  "typeIdentifier": "t_uint8",
                                  "typeString": "uint8"
                                }
                              },
                              "isConstant": false,
                              "isLValue": true,
                              "isPure": false,
                              "lValueRequested": false,
                              "nodeType": "IndexAccess",
                              "src": "1247:9:0",
                              "typeDescriptions": {
                                "typeIdentifier": "t_address",
                                "typeString": "address"
                              }
                            }
                          ],
                          "expression": {
                            "argumentTypes": [
                              {
                                "typeIdentifier": "t_address",
                                "typeString": "address"
                              }
                            ],
                            "expression": {
                              "argumentTypes": null,
                              "id": 110,
                              "name": "recoverableAssets",
                              "nodeType": "Identifier",
                              "overloadedDeclarations": [],
                              "referencedDeclaration": 14,
                              "src": "1224:17:0",
                              "typeDescriptions": {
                                "typeIdentifier": "t_array$_t_address_$dyn_storage",
                                "typeString": "address[] storage ref"
                              }
                            },
                            "id": 112,
                            "isConstant": false,
                            "isLValue": false,
                            "isPure": false,
                            "lValueRequested": false,
                            "memberName": "push",
                            "nodeType": "MemberAccess",
                            "referencedDeclaration": null,
                            "src": "1224:22:0",
                            "typeDescriptions": {
                              "typeIdentifier": "t_function_arraypush_nonpayable$_t_address_$returns$_t_uint256_$",
                              "typeString": "function (address) returns (uint256)"
                            }
                          },
                          "id": 116,
                          "isConstant": false,
                          "isLValue": false,
                          "isPure": false,
                          "kind": "functionCall",
                          "lValueRequested": false,
                          "names": [],
                          "nodeType": "FunctionCall",
                          "src": "1224:33:0",
                          "typeDescriptions": {
                            "typeIdentifier": "t_uint256",
                            "typeString": "uint256"
                          }
                        },
                        "id": 117,
                        "nodeType": "ExpressionStatement",
                        "src": "1224:33:0"
                      }
                    ]
                  },
                  "condition": {
                    "argumentTypes": null,
                    "commonType": {
                      "typeIdentifier": "t_uint256",
                      "typeString": "uint256"
                    },
                    "id": 106,
                    "isConstant": false,
                    "isLValue": false,
                    "isPure": false,
                    "lValueRequested": false,
                    "leftExpression": {
                      "argumentTypes": null,
                      "id": 103,
                      "name": "i",
                      "nodeType": "Identifier",
                      "overloadedDeclarations": [],
                      "referencedDeclaration": 100,
                      "src": "1185:1:0",
                      "typeDescriptions": {
                        "typeIdentifier": "t_uint8",
                        "typeString": "uint8"
                      }
                    },
                    "nodeType": "BinaryOperation",
                    "operator": "<",
                    "rightExpression": {
                      "argumentTypes": null,
                      "expression": {
                        "argumentTypes": null,
                        "id": 104,
                        "name": "assets",
                        "nodeType": "Identifier",
                        "overloadedDeclarations": [],
                        "referencedDeclaration": 94,
                        "src": "1189:6:0",
                        "typeDescriptions": {
                          "typeIdentifier": "t_array$_t_address_$dyn_memory_ptr",
                          "typeString": "address[] memory"
                        }
                      },
                      "id": 105,
                      "isConstant": false,
                      "isLValue": false,
                      "isPure": false,
                      "lValueRequested": false,
                      "memberName": "length",
                      "nodeType": "MemberAccess",
                      "referencedDeclaration": null,
                      "src": "1189:13:0",
                      "typeDescriptions": {
                        "typeIdentifier": "t_uint256",
                        "typeString": "uint256"
                      }
                    },
                    "src": "1185:17:0",
                    "typeDescriptions": {
                      "typeIdentifier": "t_bool",
                      "typeString": "bool"
                    }
                  },
                  "id": 119,
                  "initializationExpression": {
                    "assignments": [
                      100
                    ],
                    "declarations": [
                      {
                        "constant": false,
                        "id": 100,
                        "name": "i",
                        "nodeType": "VariableDeclaration",
                        "scope": 119,
                        "src": "1172:7:0",
                        "stateVariable": false,
                        "storageLocation": "default",
                        "typeDescriptions": {
                          "typeIdentifier": "t_uint8",
                          "typeString": "uint8"
                        },
                        "typeName": {
                          "id": 99,
                          "name": "uint8",
                          "nodeType": "ElementaryTypeName",
                          "src": "1172:5:0",
                          "typeDescriptions": {
                            "typeIdentifier": "t_uint8",
                            "typeString": "uint8"
                          }
                        },
                        "value": null,
                        "visibility": "internal"
                      }
                    ],
                    "id": 102,
                    "initialValue": {
                      "argumentTypes": null,
                      "hexValue": "30",
                      "id": 101,
                      "isConstant": false,
                      "isLValue": false,
                      "isPure": true,
                      "kind": "number",
                      "lValueRequested": false,
                      "nodeType": "Literal",
                      "src": "1182:1:0",
                      "subdenomination": null,
                      "typeDescriptions": {
                        "typeIdentifier": "t_rational_0_by_1",
                        "typeString": "int_const 0"
                      },
                      "value": "0"
                    },
                    "nodeType": "VariableDeclarationStatement",
                    "src": "1172:11:0"
                  },
                  "loopExpression": {
                    "expression": {
                      "argumentTypes": null,
                      "id": 108,
                      "isConstant": false,
                      "isLValue": false,
                      "isPure": false,
                      "lValueRequested": false,
                      "nodeType": "UnaryOperation",
                      "operator": "++",
                      "prefix": false,
                      "src": "1204:3:0",
                      "subExpression": {
                        "argumentTypes": null,
                        "id": 107,
                        "name": "i",
                        "nodeType": "Identifier",
                        "overloadedDeclarations": [],
                        "referencedDeclaration": 100,
                        "src": "1204:1:0",
                        "typeDescriptions": {
                          "typeIdentifier": "t_uint8",
                          "typeString": "uint8"
                        }
                      },
                      "typeDescriptions": {
                        "typeIdentifier": "t_uint8",
                        "typeString": "uint8"
                      }
                    },
                    "id": 109,
                    "nodeType": "ExpressionStatement",
                    "src": "1204:3:0"
                  },
                  "nodeType": "ForStatement",
                  "src": "1167:102:0"
                }
              ]
            },
            "documentation": null,
            "id": 121,
            "implemented": true,
            "kind": "function",
            "modifiers": [
              {
                "arguments": null,
                "id": 97,
                "modifierName": {
                  "argumentTypes": null,
                  "id": 96,
                  "name": "onlyOwner",
                  "nodeType": "Identifier",
                  "overloadedDeclarations": [],
                  "referencedDeclaration": 696,
                  "src": "1146:9:0",
                  "typeDescriptions": {
                    "typeIdentifier": "t_modifier$__$",
                    "typeString": "modifier ()"
                  }
                },
                "nodeType": "ModifierInvocation",
                "src": "1146:9:0"
              }
            ],
            "name": "setRecoverableAssets",
            "nodeType": "FunctionDefinition",
            "parameters": {
              "id": 95,
              "nodeType": "ParameterList",
              "parameters": [
                {
                  "constant": false,
                  "id": 94,
                  "name": "assets",
                  "nodeType": "VariableDeclaration",
                  "scope": 121,
                  "src": "1114:23:0",
                  "stateVariable": false,
                  "storageLocation": "memory",
                  "typeDescriptions": {
                    "typeIdentifier": "t_array$_t_address_$dyn_memory_ptr",
                    "typeString": "address[]"
                  },
                  "typeName": {
                    "baseType": {
                      "id": 92,
                      "name": "address",
                      "nodeType": "ElementaryTypeName",
                      "src": "1114:7:0",
                      "stateMutability": "nonpayable",
                      "typeDescriptions": {
                        "typeIdentifier": "t_address",
                        "typeString": "address"
                      }
                    },
                    "id": 93,
                    "length": null,
                    "nodeType": "ArrayTypeName",
                    "src": "1114:9:0",
                    "typeDescriptions": {
                      "typeIdentifier": "t_array$_t_address_$dyn_storage_ptr",
                      "typeString": "address[]"
                    }
                  },
                  "value": null,
                  "visibility": "internal"
                }
              ],
              "src": "1113:25:0"
            },
            "returnParameters": {
              "id": 98,
              "nodeType": "ParameterList",
              "parameters": [],
              "src": "1156:0:0"
            },
            "scope": 294,
            "src": "1084:192:0",
            "stateMutability": "nonpayable",
            "superFunction": null,
            "visibility": "public"
          },
          {
            "body": {
              "id": 138,
              "nodeType": "Block",
              "src": "1373:37:0",
              "statements": [
                {
                  "expression": {
                    "argumentTypes": null,
                    "arguments": [
                      {
                        "argumentTypes": null,
                        "id": 135,
                        "name": "value",
                        "nodeType": "Identifier",
                        "overloadedDeclarations": [],
                        "referencedDeclaration": 125,
                        "src": "1396:5:0",
                        "typeDescriptions": {
                          "typeIdentifier": "t_uint256",
                          "typeString": "uint256"
                        }
                      }
                    ],
                    "expression": {
                      "argumentTypes": [
                        {
                          "typeIdentifier": "t_uint256",
                          "typeString": "uint256"
                        }
                      ],
                      "expression": {
                        "argumentTypes": null,
                        "id": 132,
                        "name": "to",
                        "nodeType": "Identifier",
                        "overloadedDeclarations": [],
                        "referencedDeclaration": 123,
                        "src": "1384:2:0",
                        "typeDescriptions": {
                          "typeIdentifier": "t_address_payable",
                          "typeString": "address payable"
                        }
                      },
                      "id": 134,
                      "isConstant": false,
                      "isLValue": false,
                      "isPure": false,
                      "lValueRequested": false,
                      "memberName": "transfer",
                      "nodeType": "MemberAccess",
                      "referencedDeclaration": null,
                      "src": "1384:11:0",
                      "typeDescriptions": {
                        "typeIdentifier": "t_function_transfer_nonpayable$_t_uint256_$returns$__$",
                        "typeString": "function (uint256)"
                      }
                    },
                    "id": 136,
                    "isConstant": false,
                    "isLValue": false,
                    "isPure": false,
                    "kind": "functionCall",
                    "lValueRequested": false,
                    "names": [],
                    "nodeType": "FunctionCall",
                    "src": "1384:18:0",
                    "typeDescriptions": {
                      "typeIdentifier": "t_tuple$__$",
                      "typeString": "tuple()"
                    }
                  },
                  "id": 137,
                  "nodeType": "ExpressionStatement",
                  "src": "1384:18:0"
                }
              ]
            },
            "documentation": null,
            "id": 139,
            "implemented": true,
            "kind": "function",
            "modifiers": [
              {
                "arguments": null,
                "id": 128,
                "modifierName": {
                  "argumentTypes": null,
                  "id": 127,
                  "name": "updateLastCall",
                  "nodeType": "Identifier",
                  "overloadedDeclarations": [],
                  "referencedDeclaration": 57,
                  "src": "1348:14:0",
                  "typeDescriptions": {
                    "typeIdentifier": "t_modifier$__$",
                    "typeString": "modifier ()"
                  }
                },
                "nodeType": "ModifierInvocation",
                "src": "1348:14:0"
              },
              {
                "arguments": null,
                "id": 130,
                "modifierName": {
                  "argumentTypes": null,
                  "id": 129,
                  "name": "onlyOwner",
                  "nodeType": "Identifier",
                  "overloadedDeclarations": [],
                  "referencedDeclaration": 696,
                  "src": "1363:9:0",
                  "typeDescriptions": {
                    "typeIdentifier": "t_modifier$__$",
                    "typeString": "modifier ()"
                  }
                },
                "nodeType": "ModifierInvocation",
                "src": "1363:9:0"
              }
            ],
            "name": "sendEth",
            "nodeType": "FunctionDefinition",
            "parameters": {
              "id": 126,
              "nodeType": "ParameterList",
              "parameters": [
                {
                  "constant": false,
                  "id": 123,
                  "name": "to",
                  "nodeType": "VariableDeclaration",
                  "scope": 139,
                  "src": "1301:18:0",
                  "stateVariable": false,
                  "storageLocation": "default",
                  "typeDescriptions": {
                    "typeIdentifier": "t_address_payable",
                    "typeString": "address payable"
                  },
                  "typeName": {
                    "id": 122,
                    "name": "address",
                    "nodeType": "ElementaryTypeName",
                    "src": "1301:15:0",
                    "stateMutability": "payable",
                    "typeDescriptions": {
                      "typeIdentifier": "t_address_payable",
                      "typeString": "address payable"
                    }
                  },
                  "value": null,
                  "visibility": "internal"
                },
                {
                  "constant": false,
                  "id": 125,
                  "name": "value",
                  "nodeType": "VariableDeclaration",
                  "scope": 139,
                  "src": "1321:10:0",
                  "stateVariable": false,
                  "storageLocation": "default",
                  "typeDescriptions": {
                    "typeIdentifier": "t_uint256",
                    "typeString": "uint256"
                  },
                  "typeName": {
                    "id": 124,
                    "name": "uint",
                    "nodeType": "ElementaryTypeName",
                    "src": "1321:4:0",
                    "typeDescriptions": {
                      "typeIdentifier": "t_uint256",
                      "typeString": "uint256"
                    }
                  },
                  "value": null,
                  "visibility": "internal"
                }
              ],
              "src": "1300:32:0"
            },
            "returnParameters": {
              "id": 131,
              "nodeType": "ParameterList",
              "parameters": [],
              "src": "1373:0:0"
            },
            "scope": 294,
            "src": "1284:126:0",
            "stateMutability": "payable",
            "superFunction": null,
            "visibility": "public"
          },
          {
            "body": {
              "id": 150,
              "nodeType": "Block",
              "src": "1532:30:0",
              "statements": [
                {
                  "expression": {
                    "argumentTypes": null,
                    "hexValue": "74727565",
                    "id": 148,
                    "isConstant": false,
                    "isLValue": false,
                    "isPure": true,
                    "kind": "bool",
                    "lValueRequested": false,
                    "nodeType": "Literal",
                    "src": "1550:4:0",
                    "subdenomination": null,
                    "typeDescriptions": {
                      "typeIdentifier": "t_bool",
                      "typeString": "bool"
                    },
                    "value": "true"
                  },
                  "functionReturnParameters": 147,
                  "id": 149,
                  "nodeType": "Return",
                  "src": "1543:11:0"
                }
              ]
            },
            "documentation": "@dev extend the deadline for recovery",
            "id": 151,
            "implemented": true,
            "kind": "function",
            "modifiers": [
              {
                "arguments": null,
                "id": 142,
                "modifierName": {
                  "argumentTypes": null,
                  "id": 141,
                  "name": "updateLastCall",
                  "nodeType": "Identifier",
                  "overloadedDeclarations": [],
                  "referencedDeclaration": 57,
                  "src": "1492:14:0",
                  "typeDescriptions": {
                    "typeIdentifier": "t_modifier$__$",
                    "typeString": "modifier ()"
                  }
                },
                "nodeType": "ModifierInvocation",
                "src": "1492:14:0"
              },
              {
                "arguments": null,
                "id": 144,
                "modifierName": {
                  "argumentTypes": null,
                  "id": 143,
                  "name": "onlyOwner",
                  "nodeType": "Identifier",
                  "overloadedDeclarations": [],
                  "referencedDeclaration": 696,
                  "src": "1507:9:0",
                  "typeDescriptions": {
                    "typeIdentifier": "t_modifier$__$",
                    "typeString": "modifier ()"
                  }
                },
                "nodeType": "ModifierInvocation",
                "src": "1507:9:0"
              }
            ],
            "name": "iAmAlive",
            "nodeType": "FunctionDefinition",
            "parameters": {
              "id": 140,
              "nodeType": "ParameterList",
              "parameters": [],
              "src": "1482:2:0"
            },
            "returnParameters": {
              "id": 147,
              "nodeType": "ParameterList",
              "parameters": [
                {
                  "constant": false,
                  "id": 146,
                  "name": "",
                  "nodeType": "VariableDeclaration",
                  "scope": 151,
                  "src": "1526:4:0",
                  "stateVariable": false,
                  "storageLocation": "default",
                  "typeDescriptions": {
                    "typeIdentifier": "t_bool",
                    "typeString": "bool"
                  },
                  "typeName": {
                    "id": 145,
                    "name": "bool",
                    "nodeType": "ElementaryTypeName",
                    "src": "1526:4:0",
                    "typeDescriptions": {
                      "typeIdentifier": "t_bool",
                      "typeString": "bool"
                    }
                  },
                  "value": null,
                  "visibility": "internal"
                }
              ],
              "src": "1525:6:0"
            },
            "scope": 294,
            "src": "1465:97:0",
            "stateMutability": "nonpayable",
            "superFunction": null,
            "visibility": "public"
          },
          {
            "body": {
              "id": 191,
              "nodeType": "Block",
              "src": "1709:406:0",
              "statements": [
                {
                  "expression": {
                    "argumentTypes": null,
                    "arguments": [
                      {
                        "argumentTypes": null,
                        "commonType": {
                          "typeIdentifier": "t_address_payable",
                          "typeString": "address payable"
                        },
                        "id": 167,
                        "isConstant": false,
                        "isLValue": false,
                        "isPure": false,
                        "lValueRequested": false,
                        "leftExpression": {
                          "argumentTypes": null,
                          "id": 163,
                          "name": "recoveryAddress",
                          "nodeType": "Identifier",
                          "overloadedDeclarations": [],
                          "referencedDeclaration": 16,
                          "src": "1728:15:0",
                          "typeDescriptions": {
                            "typeIdentifier": "t_address_payable",
                            "typeString": "address payable"
                          }
                        },
                        "nodeType": "BinaryOperation",
                        "operator": "!=",
                        "rightExpression": {
                          "argumentTypes": null,
                          "arguments": [
                            {
                              "argumentTypes": null,
                              "hexValue": "30",
                              "id": 165,
                              "isConstant": false,
                              "isLValue": false,
                              "isPure": true,
                              "kind": "number",
                              "lValueRequested": false,
                              "nodeType": "Literal",
                              "src": "1755:1:0",
                              "subdenomination": null,
                              "typeDescriptions": {
                                "typeIdentifier": "t_rational_0_by_1",
                                "typeString": "int_const 0"
                              },
                              "value": "0"
                            }
                          ],
                          "expression": {
                            "argumentTypes": [
                              {
                                "typeIdentifier": "t_rational_0_by_1",
                                "typeString": "int_const 0"
                              }
                            ],
                            "id": 164,
                            "isConstant": false,
                            "isLValue": false,
                            "isPure": true,
                            "lValueRequested": false,
                            "nodeType": "ElementaryTypeNameExpression",
                            "src": "1747:7:0",
                            "typeDescriptions": {
                              "typeIdentifier": "t_type$_t_address_$",
                              "typeString": "type(address)"
                            },
                            "typeName": "address"
                          },
                          "id": 166,
                          "isConstant": false,
                          "isLValue": false,
                          "isPure": true,
                          "kind": "typeConversion",
                          "lValueRequested": false,
                          "names": [],
                          "nodeType": "FunctionCall",
                          "src": "1747:10:0",
                          "typeDescriptions": {
                            "typeIdentifier": "t_address_payable",
                            "typeString": "address payable"
                          }
                        },
                        "src": "1728:29:0",
                        "typeDescriptions": {
                          "typeIdentifier": "t_bool",
                          "typeString": "bool"
                        }
                      },
                      {
                        "argumentTypes": null,
                        "hexValue": "23444357616c6c6574207365745265636f766572794164647265737328293a207265636f76657279416464726573732063616e6e6f74206265207a65726f2061646472657373",
                        "id": 168,
                        "isConstant": false,
                        "isLValue": false,
                        "isPure": true,
                        "kind": "string",
                        "lValueRequested": false,
                        "nodeType": "Literal",
                        "src": "1772:72:0",
                        "subdenomination": null,
                        "typeDescriptions": {
                          "typeIdentifier": "t_stringliteral_b2e456095fa7db36f9081baecc09a06f1dda4a9613b0c69dc2b26bd06c046acc",
                          "typeString": "literal_string \"#DCWallet setRecoveryAddress(): recoveryAddress cannot be zero address\""
                        },
                        "value": "#DCWallet setRecoveryAddress(): recoveryAddress cannot be zero address"
                      }
                    ],
                    "expression": {
                      "argumentTypes": [
                        {
                          "typeIdentifier": "t_bool",
                          "typeString": "bool"
                        },
                        {
                          "typeIdentifier": "t_stringliteral_b2e456095fa7db36f9081baecc09a06f1dda4a9613b0c69dc2b26bd06c046acc",
                          "typeString": "literal_string \"#DCWallet setRecoveryAddress(): recoveryAddress cannot be zero address\""
                        }
                      ],
                      "id": 162,
                      "name": "require",
                      "nodeType": "Identifier",
                      "overloadedDeclarations": [
                        1313,
                        1314
                      ],
                      "referencedDeclaration": 1314,
                      "src": "1720:7:0",
                      "typeDescriptions": {
                        "typeIdentifier": "t_function_require_pure$_t_bool_$_t_string_memory_ptr_$returns$__$",
                        "typeString": "function (bool,string memory) pure"
                      }
                    },
                    "id": 169,
                    "isConstant": false,
                    "isLValue": false,
                    "isPure": false,
                    "kind": "functionCall",
                    "lValueRequested": false,
                    "names": [],
                    "nodeType": "FunctionCall",
                    "src": "1720:125:0",
                    "typeDescriptions": {
                      "typeIdentifier": "t_tuple$__$",
                      "typeString": "tuple()"
                    }
                  },
                  "id": 170,
                  "nodeType": "ExpressionStatement",
                  "src": "1720:125:0"
                },
                {
                  "expression": {
                    "argumentTypes": null,
                    "arguments": [
                      {
                        "argumentTypes": null,
                        "commonType": {
                          "typeIdentifier": "t_uint256",
                          "typeString": "uint256"
                        },
                        "id": 174,
                        "isConstant": false,
                        "isLValue": false,
                        "isPure": false,
                        "lValueRequested": false,
                        "leftExpression": {
                          "argumentTypes": null,
                          "id": 172,
                          "name": "timedelta",
                          "nodeType": "Identifier",
                          "overloadedDeclarations": [],
                          "referencedDeclaration": 9,
                          "src": "1864:9:0",
                          "typeDescriptions": {
                            "typeIdentifier": "t_uint256",
                            "typeString": "uint256"
                          }
                        },
                        "nodeType": "BinaryOperation",
                        "operator": ">",
                        "rightExpression": {
                          "argumentTypes": null,
                          "hexValue": "30",
                          "id": 173,
                          "isConstant": false,
                          "isLValue": false,
                          "isPure": true,
                          "kind": "number",
                          "lValueRequested": false,
                          "nodeType": "Literal",
                          "src": "1876:1:0",
                          "subdenomination": null,
                          "typeDescriptions": {
                            "typeIdentifier": "t_rational_0_by_1",
                            "typeString": "int_const 0"
                          },
                          "value": "0"
                        },
                        "src": "1864:13:0",
                        "typeDescriptions": {
                          "typeIdentifier": "t_bool",
                          "typeString": "bool"
                        }
                      },
                      {
                        "argumentTypes": null,
                        "hexValue": "23444357616c6c6574207365745265636f766572794164647265737328293a2074696d6564656c7461206d75737420626520626967676572207468616e207a65726f",
                        "id": 175,
                        "isConstant": false,
                        "isLValue": false,
                        "isPure": true,
                        "kind": "string",
                        "lValueRequested": false,
                        "nodeType": "Literal",
                        "src": "1892:68:0",
                        "subdenomination": null,
                        "typeDescriptions": {
                          "typeIdentifier": "t_stringliteral_1897b2ed0abcfd6f041157a9b0cd8c496e73b5bf1f68dd125a2ddb9644aaaa4a",
                          "typeString": "literal_string \"#DCWallet setRecoveryAddress(): timedelta must be bigger than zero\""
                        },
                        "value": "#DCWallet setRecoveryAddress(): timedelta must be bigger than zero"
                      }
                    ],
                    "expression": {
                      "argumentTypes": [
                        {
                          "typeIdentifier": "t_bool",
                          "typeString": "bool"
                        },
                        {
                          "typeIdentifier": "t_stringliteral_1897b2ed0abcfd6f041157a9b0cd8c496e73b5bf1f68dd125a2ddb9644aaaa4a",
                          "typeString": "literal_string \"#DCWallet setRecoveryAddress(): timedelta must be bigger than zero\""
                        }
                      ],
                      "id": 171,
                      "name": "require",
                      "nodeType": "Identifier",
                      "overloadedDeclarations": [
                        1313,
                        1314
                      ],
                      "referencedDeclaration": 1314,
                      "src": "1856:7:0",
                      "typeDescriptions": {
                        "typeIdentifier": "t_function_require_pure$_t_bool_$_t_string_memory_ptr_$returns$__$",
                        "typeString": "function (bool,string memory) pure"
                      }
                    },
                    "id": 176,
                    "isConstant": false,
                    "isLValue": false,
                    "isPure": false,
                    "kind": "functionCall",
                    "lValueRequested": false,
                    "names": [],
                    "nodeType": "FunctionCall",
                    "src": "1856:105:0",
                    "typeDescriptions": {
                      "typeIdentifier": "t_tuple$__$",
                      "typeString": "tuple()"
                    }
                  },
                  "id": 177,
                  "nodeType": "ExpressionStatement",
                  "src": "1856:105:0"
                },
                {
                  "expression": {
                    "argumentTypes": null,
                    "id": 180,
                    "isConstant": false,
                    "isLValue": false,
                    "isPure": false,
                    "lValueRequested": false,
                    "leftHandSide": {
                      "argumentTypes": null,
                      "id": 178,
                      "name": "recoveryAddress",
                      "nodeType": "Identifier",
                      "overloadedDeclarations": [],
                      "referencedDeclaration": 16,
                      "src": "1974:15:0",
                      "typeDescriptions": {
                        "typeIdentifier": "t_address_payable",
                        "typeString": "address payable"
                      }
                    },
                    "nodeType": "Assignment",
                    "operator": "=",
                    "rightHandSide": {
                      "argumentTypes": null,
                      "id": 179,
                      "name": "_recoveryAddress",
                      "nodeType": "Identifier",
                      "overloadedDeclarations": [],
                      "referencedDeclaration": 153,
                      "src": "1992:16:0",
                      "typeDescriptions": {
                        "typeIdentifier": "t_address_payable",
                        "typeString": "address payable"
                      }
                    },
                    "src": "1974:34:0",
                    "typeDescriptions": {
                      "typeIdentifier": "t_address_payable",
                      "typeString": "address payable"
                    }
                  },
                  "id": 181,
                  "nodeType": "ExpressionStatement",
                  "src": "1974:34:0"
                },
                {
                  "expression": {
                    "argumentTypes": null,
                    "id": 184,
                    "isConstant": false,
                    "isLValue": false,
                    "isPure": false,
                    "lValueRequested": false,
                    "leftHandSide": {
                      "argumentTypes": null,
                      "id": 182,
                      "name": "timedelta",
                      "nodeType": "Identifier",
                      "overloadedDeclarations": [],
                      "referencedDeclaration": 9,
                      "src": "2019:9:0",
                      "typeDescriptions": {
                        "typeIdentifier": "t_uint256",
                        "typeString": "uint256"
                      }
                    },
                    "nodeType": "Assignment",
                    "operator": "=",
                    "rightHandSide": {
                      "argumentTypes": null,
                      "id": 183,
                      "name": "_timedelta",
                      "nodeType": "Identifier",
                      "overloadedDeclarations": [],
                      "referencedDeclaration": 155,
                      "src": "2031:10:0",
                      "typeDescriptions": {
                        "typeIdentifier": "t_uint256",
                        "typeString": "uint256"
                      }
                    },
                    "src": "2019:22:0",
                    "typeDescriptions": {
                      "typeIdentifier": "t_uint256",
                      "typeString": "uint256"
                    }
                  },
                  "id": 185,
                  "nodeType": "ExpressionStatement",
                  "src": "2019:22:0"
                },
                {
                  "eventCall": {
                    "argumentTypes": null,
                    "arguments": [
                      {
                        "argumentTypes": null,
                        "id": 187,
                        "name": "_recoveryAddress",
                        "nodeType": "Identifier",
                        "overloadedDeclarations": [],
                        "referencedDeclaration": 153,
                        "src": "2078:16:0",
                        "typeDescriptions": {
                          "typeIdentifier": "t_address_payable",
                          "typeString": "address payable"
                        }
                      },
                      {
                        "argumentTypes": null,
                        "id": 188,
                        "name": "_timedelta",
                        "nodeType": "Identifier",
                        "overloadedDeclarations": [],
                        "referencedDeclaration": 155,
                        "src": "2096:10:0",
                        "typeDescriptions": {
                          "typeIdentifier": "t_uint256",
                          "typeString": "uint256"
                        }
                      }
                    ],
                    "expression": {
                      "argumentTypes": [
                        {
                          "typeIdentifier": "t_address_payable",
                          "typeString": "address payable"
                        },
                        {
                          "typeIdentifier": "t_uint256",
                          "typeString": "uint256"
                        }
                      ],
                      "id": 186,
                      "name": "NewRecoveryAddress",
                      "nodeType": "Identifier",
                      "overloadedDeclarations": [],
                      "referencedDeclaration": 38,
                      "src": "2059:18:0",
                      "typeDescriptions": {
                        "typeIdentifier": "t_function_event_nonpayable$_t_address_$_t_uint256_$returns$__$",
                        "typeString": "function (address,uint256)"
                      }
                    },
                    "id": 189,
                    "isConstant": false,
                    "isLValue": false,
                    "isPure": false,
                    "kind": "functionCall",
                    "lValueRequested": false,
                    "names": [],
                    "nodeType": "FunctionCall",
                    "src": "2059:48:0",
                    "typeDescriptions": {
                      "typeIdentifier": "t_tuple$__$",
                      "typeString": "tuple()"
                    }
                  },
                  "id": 190,
                  "nodeType": "EmitStatement",
                  "src": "2054:53:0"
                }
              ]
            },
            "documentation": null,
            "id": 192,
            "implemented": true,
            "kind": "function",
            "modifiers": [
              {
                "arguments": null,
                "id": 158,
                "modifierName": {
                  "argumentTypes": null,
                  "id": 157,
                  "name": "updateLastCall",
                  "nodeType": "Identifier",
                  "overloadedDeclarations": [],
                  "referencedDeclaration": 57,
                  "src": "1684:14:0",
                  "typeDescriptions": {
                    "typeIdentifier": "t_modifier$__$",
                    "typeString": "modifier ()"
                  }
                },
                "nodeType": "ModifierInvocation",
                "src": "1684:14:0"
              },
              {
                "arguments": null,
                "id": 160,
                "modifierName": {
                  "argumentTypes": null,
                  "id": 159,
                  "name": "onlyOwner",
                  "nodeType": "Identifier",
                  "overloadedDeclarations": [],
                  "referencedDeclaration": 696,
                  "src": "1699:9:0",
                  "typeDescriptions": {
                    "typeIdentifier": "t_modifier$__$",
                    "typeString": "modifier ()"
                  }
                },
                "nodeType": "ModifierInvocation",
                "src": "1699:9:0"
              }
            ],
            "name": "setRecoveryAddress",
            "nodeType": "FunctionDefinition",
            "parameters": {
              "id": 156,
              "nodeType": "ParameterList",
              "parameters": [
                {
                  "constant": false,
                  "id": 153,
                  "name": "_recoveryAddress",
                  "nodeType": "VariableDeclaration",
                  "scope": 192,
                  "src": "1608:32:0",
                  "stateVariable": false,
                  "storageLocation": "default",
                  "typeDescriptions": {
                    "typeIdentifier": "t_address_payable",
                    "typeString": "address payable"
                  },
                  "typeName": {
                    "id": 152,
                    "name": "address",
                    "nodeType": "ElementaryTypeName",
                    "src": "1608:15:0",
                    "stateMutability": "payable",
                    "typeDescriptions": {
                      "typeIdentifier": "t_address_payable",
                      "typeString": "address payable"
                    }
                  },
                  "value": null,
                  "visibility": "internal"
                },
                {
                  "constant": false,
                  "id": 155,
                  "name": "_timedelta",
                  "nodeType": "VariableDeclaration",
                  "scope": 192,
                  "src": "1651:18:0",
                  "stateVariable": false,
                  "storageLocation": "default",
                  "typeDescriptions": {
                    "typeIdentifier": "t_uint256",
                    "typeString": "uint256"
                  },
                  "typeName": {
                    "id": 154,
                    "name": "uint256",
                    "nodeType": "ElementaryTypeName",
                    "src": "1651:7:0",
                    "typeDescriptions": {
                      "typeIdentifier": "t_uint256",
                      "typeString": "uint256"
                    }
                  },
                  "value": null,
                  "visibility": "internal"
                }
              ],
              "src": "1597:79:0"
            },
            "returnParameters": {
              "id": 161,
              "nodeType": "ParameterList",
              "parameters": [],
              "src": "1709:0:0"
            },
            "scope": 294,
            "src": "1570:545:0",
            "stateMutability": "nonpayable",
            "superFunction": null,
            "visibility": "public"
          },
          {
            "body": {
              "id": 246,
              "nodeType": "Block",
              "src": "2154:433:0",
              "statements": [
                {
                  "expression": {
                    "argumentTypes": null,
                    "arguments": [
                      {
                        "argumentTypes": null,
                        "arguments": [],
                        "expression": {
                          "argumentTypes": [],
                          "id": 196,
                          "name": "isRecoverable",
                          "nodeType": "Identifier",
                          "overloadedDeclarations": [],
                          "referencedDeclaration": 91,
                          "src": "2173:13:0",
                          "typeDescriptions": {
                            "typeIdentifier": "t_function_internal_view$__$returns$_t_bool_$",
                            "typeString": "function () view returns (bool)"
                          }
                        },
                        "id": 197,
                        "isConstant": false,
                        "isLValue": false,
                        "isPure": false,
                        "kind": "functionCall",
                        "lValueRequested": false,
                        "names": [],
                        "nodeType": "FunctionCall",
                        "src": "2173:15:0",
                        "typeDescriptions": {
                          "typeIdentifier": "t_bool",
                          "typeString": "bool"
                        }
                      },
                      {
                        "argumentTypes": null,
                        "hexValue": "23444357616c6c6574207265636f76657246756e647328293a2057616c6c6574206973206e6f74207265636f76657261626c65",
                        "id": 198,
                        "isConstant": false,
                        "isLValue": false,
                        "isPure": true,
                        "kind": "string",
                        "lValueRequested": false,
                        "nodeType": "Literal",
                        "src": "2190:53:0",
                        "subdenomination": null,
                        "typeDescriptions": {
                          "typeIdentifier": "t_stringliteral_32bbe7c7da923b8a40b0d93d8c138dfb389eab9951149490adba28453dae3073",
                          "typeString": "literal_string \"#DCWallet recoverFunds(): Wallet is not recoverable\""
                        },
                        "value": "#DCWallet recoverFunds(): Wallet is not recoverable"
                      }
                    ],
                    "expression": {
                      "argumentTypes": [
                        {
                          "typeIdentifier": "t_bool",
                          "typeString": "bool"
                        },
                        {
                          "typeIdentifier": "t_stringliteral_32bbe7c7da923b8a40b0d93d8c138dfb389eab9951149490adba28453dae3073",
                          "typeString": "literal_string \"#DCWallet recoverFunds(): Wallet is not recoverable\""
                        }
                      ],
                      "id": 195,
                      "name": "require",
                      "nodeType": "Identifier",
                      "overloadedDeclarations": [
                        1313,
                        1314
                      ],
                      "referencedDeclaration": 1314,
                      "src": "2165:7:0",
                      "typeDescriptions": {
                        "typeIdentifier": "t_function_require_pure$_t_bool_$_t_string_memory_ptr_$returns$__$",
                        "typeString": "function (bool,string memory) pure"
                      }
                    },
                    "id": 199,
                    "isConstant": false,
                    "isLValue": false,
                    "isPure": false,
                    "kind": "functionCall",
                    "lValueRequested": false,
                    "names": [],
                    "nodeType": "FunctionCall",
                    "src": "2165:79:0",
                    "typeDescriptions": {
                      "typeIdentifier": "t_tuple$__$",
                      "typeString": "tuple()"
                    }
                  },
                  "id": 200,
                  "nodeType": "ExpressionStatement",
                  "src": "2165:79:0"
                },
                {
                  "body": {
                    "id": 235,
                    "nodeType": "Block",
                    "src": "2310:189:0",
                    "statements": [
                      {
                        "assignments": [
                          213
                        ],
                        "declarations": [
                          {
                            "constant": false,
                            "id": 213,
                            "name": "erc20",
                            "nodeType": "VariableDeclaration",
                            "scope": 235,
                            "src": "2325:12:0",
                            "stateVariable": false,
                            "storageLocation": "default",
                            "typeDescriptions": {
                              "typeIdentifier": "t_contract$_IERC20_$1295",
                              "typeString": "contract IERC20"
                            },
                            "typeName": {
                              "contractScope": null,
                              "id": 212,
                              "name": "IERC20",
                              "nodeType": "UserDefinedTypeName",
                              "referencedDeclaration": 1295,
                              "src": "2325:6:0",
                              "typeDescriptions": {
                                "typeIdentifier": "t_contract$_IERC20_$1295",
                                "typeString": "contract IERC20"
                              }
                            },
                            "value": null,
                            "visibility": "internal"
                          }
                        ],
                        "id": 219,
                        "initialValue": {
                          "argumentTypes": null,
                          "arguments": [
                            {
                              "argumentTypes": null,
                              "baseExpression": {
                                "argumentTypes": null,
                                "id": 215,
                                "name": "recoverableAssets",
                                "nodeType": "Identifier",
                                "overloadedDeclarations": [],
                                "referencedDeclaration": 14,
                                "src": "2347:17:0",
                                "typeDescriptions": {
                                  "typeIdentifier": "t_array$_t_address_$dyn_storage",
                                  "typeString": "address[] storage ref"
                                }
                              },
                              "id": 217,
                              "indexExpression": {
                                "argumentTypes": null,
                                "id": 216,
                                "name": "i",
                                "nodeType": "Identifier",
                                "overloadedDeclarations": [],
                                "referencedDeclaration": 202,
                                "src": "2365:1:0",
                                "typeDescriptions": {
                                  "typeIdentifier": "t_uint8",
                                  "typeString": "uint8"
                                }
                              },
                              "isConstant": false,
                              "isLValue": true,
                              "isPure": false,
                              "lValueRequested": false,
                              "nodeType": "IndexAccess",
                              "src": "2347:20:0",
                              "typeDescriptions": {
                                "typeIdentifier": "t_address",
                                "typeString": "address"
                              }
                            }
                          ],
                          "expression": {
                            "argumentTypes": [
                              {
                                "typeIdentifier": "t_address",
                                "typeString": "address"
                              }
                            ],
                            "id": 214,
                            "name": "IERC20",
                            "nodeType": "Identifier",
                            "overloadedDeclarations": [],
                            "referencedDeclaration": 1295,
                            "src": "2340:6:0",
                            "typeDescriptions": {
                              "typeIdentifier": "t_type$_t_contract$_IERC20_$1295_$",
                              "typeString": "type(contract IERC20)"
                            }
                          },
                          "id": 218,
                          "isConstant": false,
                          "isLValue": false,
                          "isPure": false,
                          "kind": "typeConversion",
                          "lValueRequested": false,
                          "names": [],
                          "nodeType": "FunctionCall",
                          "src": "2340:28:0",
                          "typeDescriptions": {
                            "typeIdentifier": "t_contract$_IERC20_$1295",
                            "typeString": "contract IERC20"
                          }
                        },
                        "nodeType": "VariableDeclarationStatement",
                        "src": "2325:43:0"
                      },
                      {
                        "expression": {
                          "argumentTypes": null,
                          "arguments": [
                            {
                              "argumentTypes": null,
                              "id": 226,
                              "name": "recoveryAddress",
                              "nodeType": "Identifier",
                              "overloadedDeclarations": [],
                              "referencedDeclaration": 16,
                              "src": "2439:15:0",
                              "typeDescriptions": {
                                "typeIdentifier": "t_address_payable",
                                "typeString": "address payable"
                              }
                            },
                            {
                              "argumentTypes": null,
                              "arguments": [
                                {
                                  "argumentTypes": null,
                                  "arguments": [
                                    {
                                      "argumentTypes": null,
                                      "id": 230,
                                      "name": "this",
                                      "nodeType": "Identifier",
                                      "overloadedDeclarations": [],
                                      "referencedDeclaration": 1330,
                                      "src": "2480:4:0",
                                      "typeDescriptions": {
                                        "typeIdentifier": "t_contract$_DCWallet_$294",
                                        "typeString": "contract DCWallet"
                                      }
                                    }
                                  ],
                                  "expression": {
                                    "argumentTypes": [
                                      {
                                        "typeIdentifier": "t_contract$_DCWallet_$294",
                                        "typeString": "contract DCWallet"
                                      }
                                    ],
                                    "id": 229,
                                    "isConstant": false,
                                    "isLValue": false,
                                    "isPure": true,
                                    "lValueRequested": false,
                                    "nodeType": "ElementaryTypeNameExpression",
                                    "src": "2472:7:0",
                                    "typeDescriptions": {
                                      "typeIdentifier": "t_type$_t_address_$",
                                      "typeString": "type(address)"
                                    },
                                    "typeName": "address"
                                  },
                                  "id": 231,
                                  "isConstant": false,
                                  "isLValue": false,
                                  "isPure": false,
                                  "kind": "typeConversion",
                                  "lValueRequested": false,
                                  "names": [],
                                  "nodeType": "FunctionCall",
                                  "src": "2472:13:0",
                                  "typeDescriptions": {
                                    "typeIdentifier": "t_address_payable",
                                    "typeString": "address payable"
                                  }
                                }
                              ],
                              "expression": {
                                "argumentTypes": [
                                  {
                                    "typeIdentifier": "t_address_payable",
                                    "typeString": "address payable"
                                  }
                                ],
                                "expression": {
                                  "argumentTypes": null,
                                  "id": 227,
                                  "name": "erc20",
                                  "nodeType": "Identifier",
                                  "overloadedDeclarations": [],
                                  "referencedDeclaration": 213,
                                  "src": "2456:5:0",
                                  "typeDescriptions": {
                                    "typeIdentifier": "t_contract$_IERC20_$1295",
                                    "typeString": "contract IERC20"
                                  }
                                },
                                "id": 228,
                                "isConstant": false,
                                "isLValue": false,
                                "isPure": false,
                                "lValueRequested": false,
                                "memberName": "balanceOf",
                                "nodeType": "MemberAccess",
                                "referencedDeclaration": 1240,
                                "src": "2456:15:0",
                                "typeDescriptions": {
                                  "typeIdentifier": "t_function_external_view$_t_address_$returns$_t_uint256_$",
                                  "typeString": "function (address) view external returns (uint256)"
                                }
                              },
                              "id": 232,
                              "isConstant": false,
                              "isLValue": false,
                              "isPure": false,
                              "kind": "functionCall",
                              "lValueRequested": false,
                              "names": [],
                              "nodeType": "FunctionCall",
                              "src": "2456:30:0",
                              "typeDescriptions": {
                                "typeIdentifier": "t_uint256",
                                "typeString": "uint256"
                              }
                            }
                          ],
                          "expression": {
                            "argumentTypes": [
                              {
                                "typeIdentifier": "t_address_payable",
                                "typeString": "address payable"
                              },
                              {
                                "typeIdentifier": "t_uint256",
                                "typeString": "uint256"
                              }
                            ],
                            "expression": {
                              "argumentTypes": null,
                              "arguments": [
                                {
                                  "argumentTypes": null,
                                  "baseExpression": {
                                    "argumentTypes": null,
                                    "id": 221,
                                    "name": "recoverableAssets",
                                    "nodeType": "Identifier",
                                    "overloadedDeclarations": [],
                                    "referencedDeclaration": 14,
                                    "src": "2390:17:0",
                                    "typeDescriptions": {
                                      "typeIdentifier": "t_array$_t_address_$dyn_storage",
                                      "typeString": "address[] storage ref"
                                    }
                                  },
                                  "id": 223,
                                  "indexExpression": {
                                    "argumentTypes": null,
                                    "id": 222,
                                    "name": "i",
                                    "nodeType": "Identifier",
                                    "overloadedDeclarations": [],
                                    "referencedDeclaration": 202,
                                    "src": "2408:1:0",
                                    "typeDescriptions": {
                                      "typeIdentifier": "t_uint8",
                                      "typeString": "uint8"
                                    }
                                  },
                                  "isConstant": false,
                                  "isLValue": true,
                                  "isPure": false,
                                  "lValueRequested": false,
                                  "nodeType": "IndexAccess",
                                  "src": "2390:20:0",
                                  "typeDescriptions": {
                                    "typeIdentifier": "t_address",
                                    "typeString": "address"
                                  }
                                }
                              ],
                              "expression": {
                                "argumentTypes": [
                                  {
                                    "typeIdentifier": "t_address",
                                    "typeString": "address"
                                  }
                                ],
                                "id": 220,
                                "name": "IERC20",
                                "nodeType": "Identifier",
                                "overloadedDeclarations": [],
                                "referencedDeclaration": 1295,
                                "src": "2383:6:0",
                                "typeDescriptions": {
                                  "typeIdentifier": "t_type$_t_contract$_IERC20_$1295_$",
                                  "typeString": "type(contract IERC20)"
                                }
                              },
                              "id": 224,
                              "isConstant": false,
                              "isLValue": false,
                              "isPure": false,
                              "kind": "typeConversion",
                              "lValueRequested": false,
                              "names": [],
                              "nodeType": "FunctionCall",
                              "src": "2383:28:0",
                              "typeDescriptions": {
                                "typeIdentifier": "t_contract$_IERC20_$1295",
                                "typeString": "contract IERC20"
                              }
                            },
                            "id": 225,
                            "isConstant": false,
                            "isLValue": false,
                            "isPure": false,
                            "lValueRequested": false,
                            "memberName": "transfer",
                            "nodeType": "MemberAccess",
                            "referencedDeclaration": 1249,
                            "src": "2383:55:0",
                            "typeDescriptions": {
                              "typeIdentifier": "t_function_external_nonpayable$_t_address_$_t_uint256_$returns$_t_bool_$",
                              "typeString": "function (address,uint256) external returns (bool)"
                            }
                          },
                          "id": 233,
                          "isConstant": false,
                          "isLValue": false,
                          "isPure": false,
                          "kind": "functionCall",
                          "lValueRequested": false,
                          "names": [],
                          "nodeType": "FunctionCall",
                          "src": "2383:104:0",
                          "typeDescriptions": {
                            "typeIdentifier": "t_bool",
                            "typeString": "bool"
                          }
                        },
                        "id": 234,
                        "nodeType": "ExpressionStatement",
                        "src": "2383:104:0"
                      }
                    ]
                  },
                  "condition": {
                    "argumentTypes": null,
                    "commonType": {
                      "typeIdentifier": "t_uint256",
                      "typeString": "uint256"
                    },
                    "id": 208,
                    "isConstant": false,
                    "isLValue": false,
                    "isPure": false,
                    "lValueRequested": false,
                    "leftExpression": {
                      "argumentTypes": null,
                      "id": 205,
                      "name": "i",
                      "nodeType": "Identifier",
                      "overloadedDeclarations": [],
                      "referencedDeclaration": 202,
                      "src": "2275:1:0",
                      "typeDescriptions": {
                        "typeIdentifier": "t_uint8",
                        "typeString": "uint8"
                      }
                    },
                    "nodeType": "BinaryOperation",
                    "operator": "<",
                    "rightExpression": {
                      "argumentTypes": null,
                      "expression": {
                        "argumentTypes": null,
                        "id": 206,
                        "name": "recoverableAssets",
                        "nodeType": "Identifier",
                        "overloadedDeclarations": [],
                        "referencedDeclaration": 14,
                        "src": "2279:17:0",
                        "typeDescriptions": {
                          "typeIdentifier": "t_array$_t_address_$dyn_storage",
                          "typeString": "address[] storage ref"
                        }
                      },
                      "id": 207,
                      "isConstant": false,
                      "isLValue": true,
                      "isPure": false,
                      "lValueRequested": false,
                      "memberName": "length",
                      "nodeType": "MemberAccess",
                      "referencedDeclaration": null,
                      "src": "2279:24:0",
                      "typeDescriptions": {
                        "typeIdentifier": "t_uint256",
                        "typeString": "uint256"
                      }
                    },
                    "src": "2275:28:0",
                    "typeDescriptions": {
                      "typeIdentifier": "t_bool",
                      "typeString": "bool"
                    }
                  },
                  "id": 236,
                  "initializationExpression": {
                    "assignments": [
                      202
                    ],
                    "declarations": [
                      {
                        "constant": false,
                        "id": 202,
                        "name": "i",
                        "nodeType": "VariableDeclaration",
                        "scope": 236,
                        "src": "2262:7:0",
                        "stateVariable": false,
                        "storageLocation": "default",
                        "typeDescriptions": {
                          "typeIdentifier": "t_uint8",
                          "typeString": "uint8"
                        },
                        "typeName": {
                          "id": 201,
                          "name": "uint8",
                          "nodeType": "ElementaryTypeName",
                          "src": "2262:5:0",
                          "typeDescriptions": {
                            "typeIdentifier": "t_uint8",
                            "typeString": "uint8"
                          }
                        },
                        "value": null,
                        "visibility": "internal"
                      }
                    ],
                    "id": 204,
                    "initialValue": {
                      "argumentTypes": null,
                      "hexValue": "30",
                      "id": 203,
                      "isConstant": false,
                      "isLValue": false,
                      "isPure": true,
                      "kind": "number",
                      "lValueRequested": false,
                      "nodeType": "Literal",
                      "src": "2272:1:0",
                      "subdenomination": null,
                      "typeDescriptions": {
                        "typeIdentifier": "t_rational_0_by_1",
                        "typeString": "int_const 0"
                      },
                      "value": "0"
                    },
                    "nodeType": "VariableDeclarationStatement",
                    "src": "2262:11:0"
                  },
                  "loopExpression": {
                    "expression": {
                      "argumentTypes": null,
                      "id": 210,
                      "isConstant": false,
                      "isLValue": false,
                      "isPure": false,
                      "lValueRequested": false,
                      "nodeType": "UnaryOperation",
                      "operator": "++",
                      "prefix": false,
                      "src": "2305:3:0",
                      "subExpression": {
                        "argumentTypes": null,
                        "id": 209,
                        "name": "i",
                        "nodeType": "Identifier",
                        "overloadedDeclarations": [],
                        "referencedDeclaration": 202,
                        "src": "2305:1:0",
                        "typeDescriptions": {
                          "typeIdentifier": "t_uint8",
                          "typeString": "uint8"
                        }
                      },
                      "typeDescriptions": {
                        "typeIdentifier": "t_uint8",
                        "typeString": "uint8"
                      }
                    },
                    "id": 211,
                    "nodeType": "ExpressionStatement",
                    "src": "2305:3:0"
                  },
                  "nodeType": "ForStatement",
                  "src": "2257:242:0"
                },
                {
                  "expression": {
                    "argumentTypes": null,
                    "arguments": [
                      {
                        "argumentTypes": null,
                        "expression": {
                          "argumentTypes": null,
                          "arguments": [
                            {
                              "argumentTypes": null,
                              "id": 241,
                              "name": "this",
                              "nodeType": "Identifier",
                              "overloadedDeclarations": [],
                              "referencedDeclaration": 1330,
                              "src": "2565:4:0",
                              "typeDescriptions": {
                                "typeIdentifier": "t_contract$_DCWallet_$294",
                                "typeString": "contract DCWallet"
                              }
                            }
                          ],
                          "expression": {
                            "argumentTypes": [
                              {
                                "typeIdentifier": "t_contract$_DCWallet_$294",
                                "typeString": "contract DCWallet"
                              }
                            ],
                            "id": 240,
                            "isConstant": false,
                            "isLValue": false,
                            "isPure": true,
                            "lValueRequested": false,
                            "nodeType": "ElementaryTypeNameExpression",
                            "src": "2557:7:0",
                            "typeDescriptions": {
                              "typeIdentifier": "t_type$_t_address_$",
                              "typeString": "type(address)"
                            },
                            "typeName": "address"
                          },
                          "id": 242,
                          "isConstant": false,
                          "isLValue": false,
                          "isPure": false,
                          "kind": "typeConversion",
                          "lValueRequested": false,
                          "names": [],
                          "nodeType": "FunctionCall",
                          "src": "2557:13:0",
                          "typeDescriptions": {
                            "typeIdentifier": "t_address_payable",
                            "typeString": "address payable"
                          }
                        },
                        "id": 243,
                        "isConstant": false,
                        "isLValue": false,
                        "isPure": false,
                        "lValueRequested": false,
                        "memberName": "balance",
                        "nodeType": "MemberAccess",
                        "referencedDeclaration": null,
                        "src": "2557:21:0",
                        "typeDescriptions": {
                          "typeIdentifier": "t_uint256",
                          "typeString": "uint256"
                        }
                      }
                    ],
                    "expression": {
                      "argumentTypes": [
                        {
                          "typeIdentifier": "t_uint256",
                          "typeString": "uint256"
                        }
                      ],
                      "expression": {
                        "argumentTypes": null,
                        "id": 237,
                        "name": "recoveryAddress",
                        "nodeType": "Identifier",
                        "overloadedDeclarations": [],
                        "referencedDeclaration": 16,
                        "src": "2532:15:0",
                        "typeDescriptions": {
                          "typeIdentifier": "t_address_payable",
                          "typeString": "address payable"
                        }
                      },
                      "id": 239,
                      "isConstant": false,
                      "isLValue": false,
                      "isPure": false,
                      "lValueRequested": false,
                      "memberName": "transfer",
                      "nodeType": "MemberAccess",
                      "referencedDeclaration": null,
                      "src": "2532:24:0",
                      "typeDescriptions": {
                        "typeIdentifier": "t_function_transfer_nonpayable$_t_uint256_$returns$__$",
                        "typeString": "function (uint256)"
                      }
                    },
                    "id": 244,
                    "isConstant": false,
                    "isLValue": false,
                    "isPure": false,
                    "kind": "functionCall",
                    "lValueRequested": false,
                    "names": [],
                    "nodeType": "FunctionCall",
                    "src": "2532:47:0",
                    "typeDescriptions": {
                      "typeIdentifier": "t_tuple$__$",
                      "typeString": "tuple()"
                    }
                  },
                  "id": 245,
                  "nodeType": "ExpressionStatement",
                  "src": "2532:47:0"
                }
              ]
            },
            "documentation": null,
            "id": 247,
            "implemented": true,
            "kind": "function",
            "modifiers": [],
            "name": "recoverFunds",
            "nodeType": "FunctionDefinition",
            "parameters": {
              "id": 193,
              "nodeType": "ParameterList",
              "parameters": [],
              "src": "2144:2:0"
            },
            "returnParameters": {
              "id": 194,
              "nodeType": "ParameterList",
              "parameters": [],
              "src": "2154:0:0"
            },
            "scope": 294,
            "src": "2123:464:0",
            "stateMutability": "nonpayable",
            "superFunction": null,
            "visibility": "public"
          },
          {
            "body": {
              "id": 288,
              "nodeType": "Block",
              "src": "2791:1217:0",
              "statements": [
                {
                  "assignments": [
                    263
                  ],
                  "declarations": [
                    {
                      "constant": false,
                      "id": 263,
                      "name": "dataLength",
                      "nodeType": "VariableDeclaration",
                      "scope": 288,
                      "src": "2802:15:0",
                      "stateVariable": false,
                      "storageLocation": "default",
                      "typeDescriptions": {
                        "typeIdentifier": "t_uint256",
                        "typeString": "uint256"
                      },
                      "typeName": {
                        "id": 262,
                        "name": "uint",
                        "nodeType": "ElementaryTypeName",
                        "src": "2802:4:0",
                        "typeDescriptions": {
                          "typeIdentifier": "t_uint256",
                          "typeString": "uint256"
                        }
                      },
                      "value": null,
                      "visibility": "internal"
                    }
                  ],
                  "id": 266,
                  "initialValue": {
                    "argumentTypes": null,
                    "expression": {
                      "argumentTypes": null,
                      "id": 264,
                      "name": "data",
                      "nodeType": "Identifier",
                      "overloadedDeclarations": [],
                      "referencedDeclaration": 253,
                      "src": "2820:4:0",
                      "typeDescriptions": {
                        "typeIdentifier": "t_bytes_memory_ptr",
                        "typeString": "bytes memory"
                      }
                    },
                    "id": 265,
                    "isConstant": false,
                    "isLValue": false,
                    "isPure": false,
                    "lValueRequested": false,
                    "memberName": "length",
                    "nodeType": "MemberAccess",
                    "referencedDeclaration": null,
                    "src": "2820:11:0",
                    "typeDescriptions": {
                      "typeIdentifier": "t_uint256",
                      "typeString": "uint256"
                    }
                  },
                  "nodeType": "VariableDeclarationStatement",
                  "src": "2802:29:0"
                },
                {
                  "assignments": [
                    268
                  ],
                  "declarations": [
                    {
                      "constant": false,
                      "id": 268,
                      "name": "result",
                      "nodeType": "VariableDeclaration",
                      "scope": 288,
                      "src": "2842:11:0",
                      "stateVariable": false,
                      "storageLocation": "default",
                      "typeDescriptions": {
                        "typeIdentifier": "t_bool",
                        "typeString": "bool"
                      },
                      "typeName": {
                        "id": 267,
                        "name": "bool",
                        "nodeType": "ElementaryTypeName",
                        "src": "2842:4:0",
                        "typeDescriptions": {
                          "typeIdentifier": "t_bool",
                          "typeString": "bool"
                        }
                      },
                      "value": null,
                      "visibility": "internal"
                    }
                  ],
                  "id": 269,
                  "initialValue": null,
                  "nodeType": "VariableDeclarationStatement",
                  "src": "2842:11:0"
                },
                {
                  "externalReferences": [
                    {
                      "data": {
                        "declaration": 253,
                        "isOffset": false,
                        "isSlot": false,
                        "src": "3031:4:0",
                        "valueSize": 1
                      }
                    },
                    {
                      "result": {
                        "declaration": 268,
                        "isOffset": false,
                        "isSlot": false,
                        "src": "3119:6:0",
                        "valueSize": 1
                      }
                    },
                    {
                      "destination": {
                        "declaration": 249,
                        "isOffset": false,
                        "isSlot": false,
                        "src": "3509:11:0",
                        "valueSize": 1
                      }
                    },
                    {
                      "value": {
                        "declaration": 251,
                        "isOffset": false,
                        "isSlot": false,
                        "src": "3539:5:0",
                        "valueSize": 1
                      }
                    },
                    {
                      "dataLength": {
                        "declaration": 263,
                        "isOffset": false,
                        "isSlot": false,
                        "src": "3583:10:0",
                        "valueSize": 1
                      }
                    }
                  ],
                  "id": 270,
                  "nodeType": "InlineAssembly",
                  "operations": "{\n    let x := mload(0x40)\n    let d := add(data, 32)\n    result := call(sub(gas(), 34710), destination, value, d, dataLength, x, 0)\n}",
                  "src": "2864:948:0"
                },
                {
                  "condition": {
                    "argumentTypes": null,
                    "id": 271,
                    "name": "result",
                    "nodeType": "Identifier",
                    "overloadedDeclarations": [],
                    "referencedDeclaration": 268,
                    "src": "3826:6:0",
                    "typeDescriptions": {
                      "typeIdentifier": "t_bool",
                      "typeString": "bool"
                    }
                  },
                  "falseBody": {
                    "id": 284,
                    "nodeType": "Block",
                    "src": "3903:74:0",
                    "statements": [
                      {
                        "eventCall": {
                          "argumentTypes": null,
                          "arguments": [
                            {
                              "argumentTypes": null,
                              "id": 279,
                              "name": "destination",
                              "nodeType": "Identifier",
                              "overloadedDeclarations": [],
                              "referencedDeclaration": 249,
                              "src": "3940:11:0",
                              "typeDescriptions": {
                                "typeIdentifier": "t_address",
                                "typeString": "address"
                              }
                            },
                            {
                              "argumentTypes": null,
                              "id": 280,
                              "name": "value",
                              "nodeType": "Identifier",
                              "overloadedDeclarations": [],
                              "referencedDeclaration": 251,
                              "src": "3953:5:0",
                              "typeDescriptions": {
                                "typeIdentifier": "t_uint256",
                                "typeString": "uint256"
                              }
                            },
                            {
                              "argumentTypes": null,
                              "id": 281,
                              "name": "data",
                              "nodeType": "Identifier",
                              "overloadedDeclarations": [],
                              "referencedDeclaration": 253,
                              "src": "3960:4:0",
                              "typeDescriptions": {
                                "typeIdentifier": "t_bytes_memory_ptr",
                                "typeString": "bytes memory"
                              }
                            }
                          ],
                          "expression": {
                            "argumentTypes": [
                              {
                                "typeIdentifier": "t_address",
                                "typeString": "address"
                              },
                              {
                                "typeIdentifier": "t_uint256",
                                "typeString": "uint256"
                              },
                              {
                                "typeIdentifier": "t_bytes_memory_ptr",
                                "typeString": "bytes memory"
                              }
                            ],
                            "id": 278,
                            "name": "ExecutionFailure",
                            "nodeType": "Identifier",
                            "overloadedDeclarations": [],
                            "referencedDeclaration": 32,
                            "src": "3923:16:0",
                            "typeDescriptions": {
                              "typeIdentifier": "t_function_event_nonpayable$_t_address_$_t_uint256_$_t_bytes_memory_ptr_$returns$__$",
                              "typeString": "function (address,uint256,bytes memory)"
                            }
                          },
                          "id": 282,
                          "isConstant": false,
                          "isLValue": false,
                          "isPure": false,
                          "kind": "functionCall",
                          "lValueRequested": false,
                          "names": [],
                          "nodeType": "FunctionCall",
                          "src": "3923:42:0",
                          "typeDescriptions": {
                            "typeIdentifier": "t_tuple$__$",
                            "typeString": "tuple()"
                          }
                        },
                        "id": 283,
                        "nodeType": "EmitStatement",
                        "src": "3918:47:0"
                      }
                    ]
                  },
                  "id": 285,
                  "nodeType": "IfStatement",
                  "src": "3822:155:0",
                  "trueBody": {
                    "eventCall": {
                      "argumentTypes": null,
                      "arguments": [
                        {
                          "argumentTypes": null,
                          "id": 273,
                          "name": "destination",
                          "nodeType": "Identifier",
                          "overloadedDeclarations": [],
                          "referencedDeclaration": 249,
                          "src": "3862:11:0",
                          "typeDescriptions": {
                            "typeIdentifier": "t_address",
                            "typeString": "address"
                          }
                        },
                        {
                          "argumentTypes": null,
                          "id": 274,
                          "name": "value",
                          "nodeType": "Identifier",
                          "overloadedDeclarations": [],
                          "referencedDeclaration": 251,
                          "src": "3875:5:0",
                          "typeDescriptions": {
                            "typeIdentifier": "t_uint256",
                            "typeString": "uint256"
                          }
                        },
                        {
                          "argumentTypes": null,
                          "id": 275,
                          "name": "data",
                          "nodeType": "Identifier",
                          "overloadedDeclarations": [],
                          "referencedDeclaration": 253,
                          "src": "3882:4:0",
                          "typeDescriptions": {
                            "typeIdentifier": "t_bytes_memory_ptr",
                            "typeString": "bytes memory"
                          }
                        }
                      ],
                      "expression": {
                        "argumentTypes": [
                          {
                            "typeIdentifier": "t_address",
                            "typeString": "address"
                          },
                          {
                            "typeIdentifier": "t_uint256",
                            "typeString": "uint256"
                          },
                          {
                            "typeIdentifier": "t_bytes_memory_ptr",
                            "typeString": "bytes memory"
                          }
                        ],
                        "id": 272,
                        "name": "Execution",
                        "nodeType": "Identifier",
                        "overloadedDeclarations": [],
                        "referencedDeclaration": 24,
                        "src": "3852:9:0",
                        "typeDescriptions": {
                          "typeIdentifier": "t_function_event_nonpayable$_t_address_$_t_uint256_$_t_bytes_memory_ptr_$returns$__$",
                          "typeString": "function (address,uint256,bytes memory)"
                        }
                      },
                      "id": 276,
                      "isConstant": false,
                      "isLValue": false,
                      "isPure": false,
                      "kind": "functionCall",
                      "lValueRequested": false,
                      "names": [],
                      "nodeType": "FunctionCall",
                      "src": "3852:35:0",
                      "typeDescriptions": {
                        "typeIdentifier": "t_tuple$__$",
                        "typeString": "tuple()"
                      }
                    },
                    "id": 277,
                    "nodeType": "EmitStatement",
                    "src": "3847:40:0"
                  }
                },
                {
                  "expression": {
                    "argumentTypes": null,
                    "id": 286,
                    "name": "result",
                    "nodeType": "Identifier",
                    "overloadedDeclarations": [],
                    "referencedDeclaration": 268,
                    "src": "3994:6:0",
                    "typeDescriptions": {
                      "typeIdentifier": "t_bool",
                      "typeString": "bool"
                    }
                  },
                  "functionReturnParameters": 261,
                  "id": 287,
                  "nodeType": "Return",
                  "src": "3987:13:0"
                }
              ]
            },
            "documentation": null,
            "id": 289,
            "implemented": true,
            "kind": "function",
            "modifiers": [
              {
                "arguments": null,
                "id": 256,
                "modifierName": {
                  "argumentTypes": null,
                  "id": 255,
                  "name": "updateLastCall",
                  "nodeType": "Identifier",
                  "overloadedDeclarations": [],
                  "referencedDeclaration": 57,
                  "src": "2728:14:0",
                  "typeDescriptions": {
                    "typeIdentifier": "t_modifier$__$",
                    "typeString": "modifier ()"
                  }
                },
                "nodeType": "ModifierInvocation",
                "src": "2728:14:0"
              },
              {
                "arguments": null,
                "id": 258,
                "modifierName": {
                  "argumentTypes": null,
                  "id": 257,
                  "name": "onlyOwner",
                  "nodeType": "Identifier",
                  "overloadedDeclarations": [],
                  "referencedDeclaration": 696,
                  "src": "2752:9:0",
                  "typeDescriptions": {
                    "typeIdentifier": "t_modifier$__$",
                    "typeString": "modifier ()"
                  }
                },
                "nodeType": "ModifierInvocation",
                "src": "2752:9:0"
              }
            ],
            "name": "executeTransaction",
            "nodeType": "FunctionDefinition",
            "parameters": {
              "id": 254,
              "nodeType": "ParameterList",
              "parameters": [
                {
                  "constant": false,
                  "id": 249,
                  "name": "destination",
                  "nodeType": "VariableDeclaration",
                  "scope": 289,
                  "src": "2651:19:0",
                  "stateVariable": false,
                  "storageLocation": "default",
                  "typeDescriptions": {
                    "typeIdentifier": "t_address",
                    "typeString": "address"
                  },
                  "typeName": {
                    "id": 248,
                    "name": "address",
                    "nodeType": "ElementaryTypeName",
                    "src": "2651:7:0",
                    "stateMutability": "nonpayable",
                    "typeDescriptions": {
                      "typeIdentifier": "t_address",
                      "typeString": "address"
                    }
                  },
                  "value": null,
                  "visibility": "internal"
                },
                {
                  "constant": false,
                  "id": 251,
                  "name": "value",
                  "nodeType": "VariableDeclaration",
                  "scope": 289,
                  "src": "2672:10:0",
                  "stateVariable": false,
                  "storageLocation": "default",
                  "typeDescriptions": {
                    "typeIdentifier": "t_uint256",
                    "typeString": "uint256"
                  },
                  "typeName": {
                    "id": 250,
                    "name": "uint",
                    "nodeType": "ElementaryTypeName",
                    "src": "2672:4:0",
                    "typeDescriptions": {
                      "typeIdentifier": "t_uint256",
                      "typeString": "uint256"
                    }
                  },
                  "value": null,
                  "visibility": "internal"
                },
                {
                  "constant": false,
                  "id": 253,
                  "name": "data",
                  "nodeType": "VariableDeclaration",
                  "scope": 289,
                  "src": "2684:17:0",
                  "stateVariable": false,
                  "storageLocation": "memory",
                  "typeDescriptions": {
                    "typeIdentifier": "t_bytes_memory_ptr",
                    "typeString": "bytes"
                  },
                  "typeName": {
                    "id": 252,
                    "name": "bytes",
                    "nodeType": "ElementaryTypeName",
                    "src": "2684:5:0",
                    "typeDescriptions": {
                      "typeIdentifier": "t_bytes_storage_ptr",
                      "typeString": "bytes"
                    }
                  },
                  "value": null,
                  "visibility": "internal"
                }
              ],
              "src": "2650:52:0"
            },
            "returnParameters": {
              "id": 261,
              "nodeType": "ParameterList",
              "parameters": [
                {
                  "constant": false,
                  "id": 260,
                  "name": "",
                  "nodeType": "VariableDeclaration",
                  "scope": 289,
                  "src": "2780:4:0",
                  "stateVariable": false,
                  "storageLocation": "default",
                  "typeDescriptions": {
                    "typeIdentifier": "t_bool",
                    "typeString": "bool"
                  },
                  "typeName": {
                    "id": 259,
                    "name": "bool",
                    "nodeType": "ElementaryTypeName",
                    "src": "2780:4:0",
                    "typeDescriptions": {
                      "typeIdentifier": "t_bool",
                      "typeString": "bool"
                    }
                  },
                  "value": null,
                  "visibility": "internal"
                }
              ],
              "src": "2779:6:0"
            },
            "scope": 294,
            "src": "2623:1385:0",
            "stateMutability": "nonpayable",
            "superFunction": null,
            "visibility": "public"
          },
          {
            "body": {
              "id": 292,
              "nodeType": "Block",
              "src": "4045:2:0",
              "statements": []
            },
            "documentation": null,
            "id": 293,
            "implemented": true,
            "kind": "fallback",
            "modifiers": [],
            "name": "",
            "nodeType": "FunctionDefinition",
            "parameters": {
              "id": 290,
              "nodeType": "ParameterList",
              "parameters": [],
              "src": "4025:2:0"
            },
            "returnParameters": {
              "id": 291,
              "nodeType": "ParameterList",
              "parameters": [],
              "src": "4045:0:0"
            },
            "scope": 294,
            "src": "4016:31:0",
            "stateMutability": "payable",
            "superFunction": null,
            "visibility": "external"
          }
        ],
        "scope": 295,
        "src": "152:3898:0"
      }
    ],
    "src": "0:4052:0"
  },
  "compiler": {
    "name": "solc",
    "version": "0.5.8+commit.23d335f2.Emscripten.clang"
  },
  "networks": {},
  "schemaVersion": "3.0.16",
  "updatedAt": "2019-11-10T07:51:59.180Z",
  "devdoc": {
    "methods": {
      "iAmAlive()": {
        "details": "extend the deadline for recovery"
      },
      "isOwner()": {
        "details": "Returns true if the caller is the current owner."
      },
      "owner()": {
        "details": "Returns the address of the current owner."
      },
      "renounceOwnership()": {
        "details": "Leaves the contract without owner. It will not be possible to call `onlyOwner` functions anymore. Can only be called by the current owner.     * NOTE: Renouncing ownership will leave the contract without an owner, thereby removing any functionality that is only available to the owner."
      },
      "transferOwnership(address)": {
        "details": "Transfers ownership of the contract to a new account (`newOwner`). Can only be called by the current owner."
      }
    }
  },
  "userdoc": {
    "methods": {}
  }
}
},{}],10:[function(require,module,exports){
module.exports={
  "contractName": "TCAD",
  "abi": [
    {
      "constant": true,
      "inputs": [],
      "name": "name",
      "outputs": [
        {
          "name": "",
          "type": "string"
        }
      ],
      "payable": false,
      "stateMutability": "view",
      "type": "function"
    },
    {
      "constant": false,
      "inputs": [
        {
          "name": "spender",
          "type": "address"
        },
        {
          "name": "amount",
          "type": "uint256"
        }
      ],
      "name": "approve",
      "outputs": [
        {
          "name": "",
          "type": "bool"
        }
      ],
      "payable": false,
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "constant": true,
      "inputs": [],
      "name": "totalSupply",
      "outputs": [
        {
          "name": "",
          "type": "uint256"
        }
      ],
      "payable": false,
      "stateMutability": "view",
      "type": "function"
    },
    {
      "constant": false,
      "inputs": [
        {
          "name": "sender",
          "type": "address"
        },
        {
          "name": "recipient",
          "type": "address"
        },
        {
          "name": "amount",
          "type": "uint256"
        }
      ],
      "name": "transferFrom",
      "outputs": [
        {
          "name": "",
          "type": "bool"
        }
      ],
      "payable": false,
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "constant": true,
      "inputs": [],
      "name": "decimals",
      "outputs": [
        {
          "name": "",
          "type": "uint8"
        }
      ],
      "payable": false,
      "stateMutability": "view",
      "type": "function"
    },
    {
      "constant": false,
      "inputs": [
        {
          "name": "spender",
          "type": "address"
        },
        {
          "name": "addedValue",
          "type": "uint256"
        }
      ],
      "name": "increaseAllowance",
      "outputs": [
        {
          "name": "",
          "type": "bool"
        }
      ],
      "payable": false,
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "constant": true,
      "inputs": [
        {
          "name": "account",
          "type": "address"
        }
      ],
      "name": "balanceOf",
      "outputs": [
        {
          "name": "",
          "type": "uint256"
        }
      ],
      "payable": false,
      "stateMutability": "view",
      "type": "function"
    },
    {
      "constant": true,
      "inputs": [],
      "name": "symbol",
      "outputs": [
        {
          "name": "",
          "type": "string"
        }
      ],
      "payable": false,
      "stateMutability": "view",
      "type": "function"
    },
    {
      "constant": false,
      "inputs": [
        {
          "name": "spender",
          "type": "address"
        },
        {
          "name": "subtractedValue",
          "type": "uint256"
        }
      ],
      "name": "decreaseAllowance",
      "outputs": [
        {
          "name": "",
          "type": "bool"
        }
      ],
      "payable": false,
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "constant": false,
      "inputs": [
        {
          "name": "recipient",
          "type": "address"
        },
        {
          "name": "amount",
          "type": "uint256"
        }
      ],
      "name": "transfer",
      "outputs": [
        {
          "name": "",
          "type": "bool"
        }
      ],
      "payable": false,
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "constant": true,
      "inputs": [
        {
          "name": "owner",
          "type": "address"
        },
        {
          "name": "spender",
          "type": "address"
        }
      ],
      "name": "allowance",
      "outputs": [
        {
          "name": "",
          "type": "uint256"
        }
      ],
      "payable": false,
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [
        {
          "name": "account",
          "type": "address"
        },
        {
          "name": "amount",
          "type": "uint256"
        }
      ],
      "payable": false,
      "stateMutability": "nonpayable",
      "type": "constructor"
    },
    {
      "anonymous": false,
      "inputs": [
        {
          "indexed": true,
          "name": "from",
          "type": "address"
        },
        {
          "indexed": true,
          "name": "to",
          "type": "address"
        },
        {
          "indexed": false,
          "name": "value",
          "type": "uint256"
        }
      ],
      "name": "Transfer",
      "type": "event"
    },
    {
      "anonymous": false,
      "inputs": [
        {
          "indexed": true,
          "name": "owner",
          "type": "address"
        },
        {
          "indexed": true,
          "name": "spender",
          "type": "address"
        },
        {
          "indexed": false,
          "name": "value",
          "type": "uint256"
        }
      ],
      "name": "Approval",
      "type": "event"
    },
    {
      "constant": false,
      "inputs": [
        {
          "name": "account",
          "type": "address"
        },
        {
          "name": "amount",
          "type": "uint256"
        }
      ],
      "name": "mint",
      "outputs": [
        {
          "name": "",
          "type": "bool"
        }
      ],
      "payable": false,
      "stateMutability": "nonpayable",
      "type": "function"
    }
  ],
  "metadata": "{\"compiler\":{\"version\":\"0.5.8+commit.23d335f2\"},\"language\":\"Solidity\",\"output\":{\"abi\":[{\"constant\":true,\"inputs\":[],\"name\":\"name\",\"outputs\":[{\"name\":\"\",\"type\":\"string\"}],\"payable\":false,\"stateMutability\":\"view\",\"type\":\"function\"},{\"constant\":false,\"inputs\":[{\"name\":\"spender\",\"type\":\"address\"},{\"name\":\"amount\",\"type\":\"uint256\"}],\"name\":\"approve\",\"outputs\":[{\"name\":\"\",\"type\":\"bool\"}],\"payable\":false,\"stateMutability\":\"nonpayable\",\"type\":\"function\"},{\"constant\":true,\"inputs\":[],\"name\":\"totalSupply\",\"outputs\":[{\"name\":\"\",\"type\":\"uint256\"}],\"payable\":false,\"stateMutability\":\"view\",\"type\":\"function\"},{\"constant\":false,\"inputs\":[{\"name\":\"sender\",\"type\":\"address\"},{\"name\":\"recipient\",\"type\":\"address\"},{\"name\":\"amount\",\"type\":\"uint256\"}],\"name\":\"transferFrom\",\"outputs\":[{\"name\":\"\",\"type\":\"bool\"}],\"payable\":false,\"stateMutability\":\"nonpayable\",\"type\":\"function\"},{\"constant\":true,\"inputs\":[],\"name\":\"decimals\",\"outputs\":[{\"name\":\"\",\"type\":\"uint8\"}],\"payable\":false,\"stateMutability\":\"view\",\"type\":\"function\"},{\"constant\":false,\"inputs\":[{\"name\":\"spender\",\"type\":\"address\"},{\"name\":\"addedValue\",\"type\":\"uint256\"}],\"name\":\"increaseAllowance\",\"outputs\":[{\"name\":\"\",\"type\":\"bool\"}],\"payable\":false,\"stateMutability\":\"nonpayable\",\"type\":\"function\"},{\"constant\":false,\"inputs\":[{\"name\":\"account\",\"type\":\"address\"},{\"name\":\"amount\",\"type\":\"uint256\"}],\"name\":\"mint\",\"outputs\":[{\"name\":\"\",\"type\":\"bool\"}],\"payable\":false,\"stateMutability\":\"nonpayable\",\"type\":\"function\"},{\"constant\":true,\"inputs\":[{\"name\":\"account\",\"type\":\"address\"}],\"name\":\"balanceOf\",\"outputs\":[{\"name\":\"\",\"type\":\"uint256\"}],\"payable\":false,\"stateMutability\":\"view\",\"type\":\"function\"},{\"constant\":true,\"inputs\":[],\"name\":\"symbol\",\"outputs\":[{\"name\":\"\",\"type\":\"string\"}],\"payable\":false,\"stateMutability\":\"view\",\"type\":\"function\"},{\"constant\":false,\"inputs\":[{\"name\":\"spender\",\"type\":\"address\"},{\"name\":\"subtractedValue\",\"type\":\"uint256\"}],\"name\":\"decreaseAllowance\",\"outputs\":[{\"name\":\"\",\"type\":\"bool\"}],\"payable\":false,\"stateMutability\":\"nonpayable\",\"type\":\"function\"},{\"constant\":false,\"inputs\":[{\"name\":\"recipient\",\"type\":\"address\"},{\"name\":\"amount\",\"type\":\"uint256\"}],\"name\":\"transfer\",\"outputs\":[{\"name\":\"\",\"type\":\"bool\"}],\"payable\":false,\"stateMutability\":\"nonpayable\",\"type\":\"function\"},{\"constant\":true,\"inputs\":[{\"name\":\"owner\",\"type\":\"address\"},{\"name\":\"spender\",\"type\":\"address\"}],\"name\":\"allowance\",\"outputs\":[{\"name\":\"\",\"type\":\"uint256\"}],\"payable\":false,\"stateMutability\":\"view\",\"type\":\"function\"},{\"inputs\":[{\"name\":\"account\",\"type\":\"address\"},{\"name\":\"amount\",\"type\":\"uint256\"}],\"payable\":false,\"stateMutability\":\"nonpayable\",\"type\":\"constructor\"},{\"anonymous\":false,\"inputs\":[{\"indexed\":true,\"name\":\"from\",\"type\":\"address\"},{\"indexed\":true,\"name\":\"to\",\"type\":\"address\"},{\"indexed\":false,\"name\":\"value\",\"type\":\"uint256\"}],\"name\":\"Transfer\",\"type\":\"event\"},{\"anonymous\":false,\"inputs\":[{\"indexed\":true,\"name\":\"owner\",\"type\":\"address\"},{\"indexed\":true,\"name\":\"spender\",\"type\":\"address\"},{\"indexed\":false,\"name\":\"value\",\"type\":\"uint256\"}],\"name\":\"Approval\",\"type\":\"event\"}],\"devdoc\":{\"methods\":{\"allowance(address,address)\":{\"details\":\"See {IERC20-allowance}.\"},\"approve(address,uint256)\":{\"details\":\"See {IERC20-approve}.     * Requirements:     * - `spender` cannot be the zero address.\"},\"balanceOf(address)\":{\"details\":\"See {IERC20-balanceOf}.\"},\"decimals()\":{\"details\":\"Returns the number of decimals used to get its user representation. For example, if `decimals` equals `2`, a balance of `505` tokens should be displayed to a user as `5,05` (`505 / 10 ** 2`).     * Tokens usually opt for a value of 18, imitating the relationship between Ether and Wei.     * NOTE: This information is only used for _display_ purposes: it in no way affects any of the arithmetic of the contract, including {IERC20-balanceOf} and {IERC20-transfer}.\"},\"decreaseAllowance(address,uint256)\":{\"details\":\"Atomically decreases the allowance granted to `spender` by the caller.     * This is an alternative to {approve} that can be used as a mitigation for problems described in {IERC20-approve}.     * Emits an {Approval} event indicating the updated allowance.     * Requirements:     * - `spender` cannot be the zero address. - `spender` must have allowance for the caller of at least `subtractedValue`.\"},\"increaseAllowance(address,uint256)\":{\"details\":\"Atomically increases the allowance granted to `spender` by the caller.     * This is an alternative to {approve} that can be used as a mitigation for problems described in {IERC20-approve}.     * Emits an {Approval} event indicating the updated allowance.     * Requirements:     * - `spender` cannot be the zero address.\"},\"name()\":{\"details\":\"Returns the name of the token.\"},\"symbol()\":{\"details\":\"Returns the symbol of the token, usually a shorter version of the name.\"},\"totalSupply()\":{\"details\":\"See {IERC20-totalSupply}.\"},\"transfer(address,uint256)\":{\"details\":\"See {IERC20-transfer}.     * Requirements:     * - `recipient` cannot be the zero address. - the caller must have a balance of at least `amount`.\"},\"transferFrom(address,address,uint256)\":{\"details\":\"See {IERC20-transferFrom}.     * Emits an {Approval} event indicating the updated allowance. This is not required by the EIP. See the note at the beginning of {ERC20};     * Requirements: - `sender` and `recipient` cannot be the zero address. - `sender` must have a balance of at least `amount`. - the caller must have allowance for `sender`'s tokens of at least `amount`.\"}}},\"userdoc\":{\"methods\":{}}},\"settings\":{\"compilationTarget\":{\"/C/lib/10DEV/ethwaterloo-contract-account-metamask-plugin/truffle/contracts/TCAD.sol\":\"TCAD\"},\"evmVersion\":\"petersburg\",\"libraries\":{},\"optimizer\":{\"enabled\":false,\"runs\":200},\"remappings\":[]},\"sources\":{\"/C/lib/10DEV/ethwaterloo-contract-account-metamask-plugin/truffle/contracts/TCAD.sol\":{\"keccak256\":\"0x6aff941e9fab1c2493fd527b11d973012a1d44956c0ccfbeb10f366b141f9208\",\"urls\":[\"bzzr://fda3fe3bc8c541efce148db531761528662ea94afdd6d732f4c547fd8e707684\"]},\"@openzeppelin/contracts/GSN/Context.sol\":{\"keccak256\":\"0x90a3995645af7562d84b9d69363ffa5ae7217714ab61e951bf7bc450f40e4061\",\"urls\":[\"bzzr://51482c01bddf23793bddee43b60ab9578a62948a4f2082def24ea792a553b055\"]},\"@openzeppelin/contracts/math/SafeMath.sol\":{\"keccak256\":\"0x640b6dee7a4b830bdfd52b5031a07fc2b12209f5b2e29e5d364a7d37f69d8076\",\"urls\":[\"bzzr://292843005e754e752644f767477ec5ad7a1ffc91ddb18c38b8079c62f3993cad\"]},\"@openzeppelin/contracts/token/ERC20/ERC20.sol\":{\"keccak256\":\"0x65a4078c03875c25413a068ce9cfdd7e68a90f8786612d1189c89341e6e3b802\",\"urls\":[\"bzzr://fefcc5ec4e313a66c9fd38375983b5973c528e7e19b6d37c2f1ac6745295e6e2\"]},\"@openzeppelin/contracts/token/ERC20/ERC20Detailed.sol\":{\"keccak256\":\"0x4a3a810b7ebe742e897e1fd428b3eeed2196d3acea58eaf9c566ed10d545d2ed\",\"urls\":[\"bzzr://729aefb3f89f616c954a0735f8b4dd8804bdd0351e96f8e904fdb3e78a109b6c\"]},\"@openzeppelin/contracts/token/ERC20/IERC20.sol\":{\"keccak256\":\"0xe5bb0f57cff3e299f360052ba50f1ea0fff046df2be070b6943e0e3c3fdad8a9\",\"urls\":[\"bzzr://cf2d583b8dce38d0617fdcd65f2fd9f126fe17b7f683b5a515ea9d2762d8b062\"]}},\"version\":1}",
  "bytecode": "0x60806040523480156200001157600080fd5b5060405160408062001751833981018060405260408110156200003357600080fd5b8101908080519060200190929190805190602001909291905050506040518060400160405280600881526020017f54727565204341440000000000000000000000000000000000000000000000008152506040518060400160405280600481526020017f544341440000000000000000000000000000000000000000000000000000000081525060128260039080519060200190620000d492919062000379565b508160049080519060200190620000ed92919062000379565b5080600560006101000a81548160ff021916908360ff1602179055505050506200011e82826200012660201b60201c565b505062000428565b600073ffffffffffffffffffffffffffffffffffffffff168273ffffffffffffffffffffffffffffffffffffffff161415620001ca576040517f08c379a000000000000000000000000000000000000000000000000000000000815260040180806020018281038252601f8152602001807f45524332303a206d696e7420746f20746865207a65726f20616464726573730081525060200191505060405180910390fd5b620001e681600254620002f060201b62000fa91790919060201c565b60028190555062000244816000808573ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002054620002f060201b62000fa91790919060201c565b6000808473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff168152602001908152602001600020819055508173ffffffffffffffffffffffffffffffffffffffff16600073ffffffffffffffffffffffffffffffffffffffff167fddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef836040518082815260200191505060405180910390a35050565b6000808284019050838110156200036f576040517f08c379a000000000000000000000000000000000000000000000000000000000815260040180806020018281038252601b8152602001807f536166654d6174683a206164646974696f6e206f766572666c6f77000000000081525060200191505060405180910390fd5b8091505092915050565b828054600181600116156101000203166002900490600052602060002090601f016020900481019282601f10620003bc57805160ff1916838001178555620003ed565b82800160010185558215620003ed579182015b82811115620003ec578251825591602001919060010190620003cf565b5b509050620003fc919062000400565b5090565b6200042591905b808211156200042157600081600090555060010162000407565b5090565b90565b61131980620004386000396000f3fe608060405234801561001057600080fd5b50600436106100b45760003560e01c806340c10f191161007157806340c10f19146102d057806370a082311461033657806395d89b411461038e578063a457c2d714610411578063a9059cbb14610477578063dd62ed3e146104dd576100b4565b806306fdde03146100b9578063095ea7b31461013c57806318160ddd146101a257806323b872dd146101c0578063313ce56714610246578063395093511461026a575b600080fd5b6100c1610555565b6040518080602001828103825283818151815260200191508051906020019080838360005b838110156101015780820151818401526020810190506100e6565b50505050905090810190601f16801561012e5780820380516001836020036101000a031916815260200191505b509250505060405180910390f35b6101886004803603604081101561015257600080fd5b81019080803573ffffffffffffffffffffffffffffffffffffffff169060200190929190803590602001909291905050506105f7565b604051808215151515815260200191505060405180910390f35b6101aa610615565b6040518082815260200191505060405180910390f35b61022c600480360360608110156101d657600080fd5b81019080803573ffffffffffffffffffffffffffffffffffffffff169060200190929190803573ffffffffffffffffffffffffffffffffffffffff1690602001909291908035906020019092919050505061061f565b604051808215151515815260200191505060405180910390f35b61024e6106f8565b604051808260ff1660ff16815260200191505060405180910390f35b6102b66004803603604081101561028057600080fd5b81019080803573ffffffffffffffffffffffffffffffffffffffff1690602001909291908035906020019092919050505061070f565b604051808215151515815260200191505060405180910390f35b61031c600480360360408110156102e657600080fd5b81019080803573ffffffffffffffffffffffffffffffffffffffff169060200190929190803590602001909291905050506107c2565b604051808215151515815260200191505060405180910390f35b6103786004803603602081101561034c57600080fd5b81019080803573ffffffffffffffffffffffffffffffffffffffff1690602001909291905050506107d8565b6040518082815260200191505060405180910390f35b610396610820565b6040518080602001828103825283818151815260200191508051906020019080838360005b838110156103d65780820151818401526020810190506103bb565b50505050905090810190601f1680156104035780820380516001836020036101000a031916815260200191505b509250505060405180910390f35b61045d6004803603604081101561042757600080fd5b81019080803573ffffffffffffffffffffffffffffffffffffffff169060200190929190803590602001909291905050506108c2565b604051808215151515815260200191505060405180910390f35b6104c36004803603604081101561048d57600080fd5b81019080803573ffffffffffffffffffffffffffffffffffffffff1690602001909291908035906020019092919050505061098f565b604051808215151515815260200191505060405180910390f35b61053f600480360360408110156104f357600080fd5b81019080803573ffffffffffffffffffffffffffffffffffffffff169060200190929190803573ffffffffffffffffffffffffffffffffffffffff1690602001909291905050506109ad565b6040518082815260200191505060405180910390f35b606060038054600181600116156101000203166002900480601f0160208091040260200160405190810160405280929190818152602001828054600181600116156101000203166002900480156105ed5780601f106105c2576101008083540402835291602001916105ed565b820191906000526020600020905b8154815290600101906020018083116105d057829003601f168201915b5050505050905090565b600061060b610604610a34565b8484610a3c565b6001905092915050565b6000600254905090565b600061062c848484610c33565b6106ed84610638610a34565b6106e88560405180606001604052806028815260200161125860289139600160008b73ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff168152602001908152602001600020600061069e610a34565b73ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002054610ee99092919063ffffffff16565b610a3c565b600190509392505050565b6000600560009054906101000a900460ff16905090565b60006107b861071c610a34565b846107b3856001600061072d610a34565b73ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002060008973ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002054610fa990919063ffffffff16565b610a3c565b6001905092915050565b60006107ce8383611031565b6001905092915050565b60008060008373ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff168152602001908152602001600020549050919050565b606060048054600181600116156101000203166002900480601f0160208091040260200160405190810160405280929190818152602001828054600181600116156101000203166002900480156108b85780601f1061088d576101008083540402835291602001916108b8565b820191906000526020600020905b81548152906001019060200180831161089b57829003601f168201915b5050505050905090565b60006109856108cf610a34565b84610980856040518060600160405280602581526020016112c960259139600160006108f9610a34565b73ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002060008a73ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002054610ee99092919063ffffffff16565b610a3c565b6001905092915050565b60006109a361099c610a34565b8484610c33565b6001905092915050565b6000600160008473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002060008373ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002054905092915050565b600033905090565b600073ffffffffffffffffffffffffffffffffffffffff168373ffffffffffffffffffffffffffffffffffffffff161415610ac2576040517f08c379a00000000000000000000000000000000000000000000000000000000081526004018080602001828103825260248152602001806112a56024913960400191505060405180910390fd5b600073ffffffffffffffffffffffffffffffffffffffff168273ffffffffffffffffffffffffffffffffffffffff161415610b48576040517f08c379a00000000000000000000000000000000000000000000000000000000081526004018080602001828103825260228152602001806112106022913960400191505060405180910390fd5b80600160008573ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002060008473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff168152602001908152602001600020819055508173ffffffffffffffffffffffffffffffffffffffff168373ffffffffffffffffffffffffffffffffffffffff167f8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925836040518082815260200191505060405180910390a3505050565b600073ffffffffffffffffffffffffffffffffffffffff168373ffffffffffffffffffffffffffffffffffffffff161415610cb9576040517f08c379a00000000000000000000000000000000000000000000000000000000081526004018080602001828103825260258152602001806112806025913960400191505060405180910390fd5b600073ffffffffffffffffffffffffffffffffffffffff168273ffffffffffffffffffffffffffffffffffffffff161415610d3f576040517f08c379a00000000000000000000000000000000000000000000000000000000081526004018080602001828103825260238152602001806111ed6023913960400191505060405180910390fd5b610daa81604051806060016040528060268152602001611232602691396000808773ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002054610ee99092919063ffffffff16565b6000808573ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002081905550610e3d816000808573ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002054610fa990919063ffffffff16565b6000808473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff168152602001908152602001600020819055508173ffffffffffffffffffffffffffffffffffffffff168373ffffffffffffffffffffffffffffffffffffffff167fddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef836040518082815260200191505060405180910390a3505050565b6000838311158290610f96576040517f08c379a00000000000000000000000000000000000000000000000000000000081526004018080602001828103825283818151815260200191508051906020019080838360005b83811015610f5b578082015181840152602081019050610f40565b50505050905090810190601f168015610f885780820380516001836020036101000a031916815260200191505b509250505060405180910390fd5b5060008385039050809150509392505050565b600080828401905083811015611027576040517f08c379a000000000000000000000000000000000000000000000000000000000815260040180806020018281038252601b8152602001807f536166654d6174683a206164646974696f6e206f766572666c6f77000000000081525060200191505060405180910390fd5b8091505092915050565b600073ffffffffffffffffffffffffffffffffffffffff168273ffffffffffffffffffffffffffffffffffffffff1614156110d4576040517f08c379a000000000000000000000000000000000000000000000000000000000815260040180806020018281038252601f8152602001807f45524332303a206d696e7420746f20746865207a65726f20616464726573730081525060200191505060405180910390fd5b6110e981600254610fa990919063ffffffff16565b600281905550611140816000808573ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002054610fa990919063ffffffff16565b6000808473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff168152602001908152602001600020819055508173ffffffffffffffffffffffffffffffffffffffff16600073ffffffffffffffffffffffffffffffffffffffff167fddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef836040518082815260200191505060405180910390a3505056fe45524332303a207472616e7366657220746f20746865207a65726f206164647265737345524332303a20617070726f766520746f20746865207a65726f206164647265737345524332303a207472616e7366657220616d6f756e7420657863656564732062616c616e636545524332303a207472616e7366657220616d6f756e74206578636565647320616c6c6f77616e636545524332303a207472616e736665722066726f6d20746865207a65726f206164647265737345524332303a20617070726f76652066726f6d20746865207a65726f206164647265737345524332303a2064656372656173656420616c6c6f77616e63652062656c6f77207a65726fa165627a7a72305820d7b011b6b2b1d2c126466a1f7276634970b35821d06b043f9cc65b9b68bd434b0029",
  "deployedBytecode": "0x608060405234801561001057600080fd5b50600436106100b45760003560e01c806340c10f191161007157806340c10f19146102d057806370a082311461033657806395d89b411461038e578063a457c2d714610411578063a9059cbb14610477578063dd62ed3e146104dd576100b4565b806306fdde03146100b9578063095ea7b31461013c57806318160ddd146101a257806323b872dd146101c0578063313ce56714610246578063395093511461026a575b600080fd5b6100c1610555565b6040518080602001828103825283818151815260200191508051906020019080838360005b838110156101015780820151818401526020810190506100e6565b50505050905090810190601f16801561012e5780820380516001836020036101000a031916815260200191505b509250505060405180910390f35b6101886004803603604081101561015257600080fd5b81019080803573ffffffffffffffffffffffffffffffffffffffff169060200190929190803590602001909291905050506105f7565b604051808215151515815260200191505060405180910390f35b6101aa610615565b6040518082815260200191505060405180910390f35b61022c600480360360608110156101d657600080fd5b81019080803573ffffffffffffffffffffffffffffffffffffffff169060200190929190803573ffffffffffffffffffffffffffffffffffffffff1690602001909291908035906020019092919050505061061f565b604051808215151515815260200191505060405180910390f35b61024e6106f8565b604051808260ff1660ff16815260200191505060405180910390f35b6102b66004803603604081101561028057600080fd5b81019080803573ffffffffffffffffffffffffffffffffffffffff1690602001909291908035906020019092919050505061070f565b604051808215151515815260200191505060405180910390f35b61031c600480360360408110156102e657600080fd5b81019080803573ffffffffffffffffffffffffffffffffffffffff169060200190929190803590602001909291905050506107c2565b604051808215151515815260200191505060405180910390f35b6103786004803603602081101561034c57600080fd5b81019080803573ffffffffffffffffffffffffffffffffffffffff1690602001909291905050506107d8565b6040518082815260200191505060405180910390f35b610396610820565b6040518080602001828103825283818151815260200191508051906020019080838360005b838110156103d65780820151818401526020810190506103bb565b50505050905090810190601f1680156104035780820380516001836020036101000a031916815260200191505b509250505060405180910390f35b61045d6004803603604081101561042757600080fd5b81019080803573ffffffffffffffffffffffffffffffffffffffff169060200190929190803590602001909291905050506108c2565b604051808215151515815260200191505060405180910390f35b6104c36004803603604081101561048d57600080fd5b81019080803573ffffffffffffffffffffffffffffffffffffffff1690602001909291908035906020019092919050505061098f565b604051808215151515815260200191505060405180910390f35b61053f600480360360408110156104f357600080fd5b81019080803573ffffffffffffffffffffffffffffffffffffffff169060200190929190803573ffffffffffffffffffffffffffffffffffffffff1690602001909291905050506109ad565b6040518082815260200191505060405180910390f35b606060038054600181600116156101000203166002900480601f0160208091040260200160405190810160405280929190818152602001828054600181600116156101000203166002900480156105ed5780601f106105c2576101008083540402835291602001916105ed565b820191906000526020600020905b8154815290600101906020018083116105d057829003601f168201915b5050505050905090565b600061060b610604610a34565b8484610a3c565b6001905092915050565b6000600254905090565b600061062c848484610c33565b6106ed84610638610a34565b6106e88560405180606001604052806028815260200161125860289139600160008b73ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff168152602001908152602001600020600061069e610a34565b73ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002054610ee99092919063ffffffff16565b610a3c565b600190509392505050565b6000600560009054906101000a900460ff16905090565b60006107b861071c610a34565b846107b3856001600061072d610a34565b73ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002060008973ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002054610fa990919063ffffffff16565b610a3c565b6001905092915050565b60006107ce8383611031565b6001905092915050565b60008060008373ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff168152602001908152602001600020549050919050565b606060048054600181600116156101000203166002900480601f0160208091040260200160405190810160405280929190818152602001828054600181600116156101000203166002900480156108b85780601f1061088d576101008083540402835291602001916108b8565b820191906000526020600020905b81548152906001019060200180831161089b57829003601f168201915b5050505050905090565b60006109856108cf610a34565b84610980856040518060600160405280602581526020016112c960259139600160006108f9610a34565b73ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002060008a73ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002054610ee99092919063ffffffff16565b610a3c565b6001905092915050565b60006109a361099c610a34565b8484610c33565b6001905092915050565b6000600160008473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002060008373ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002054905092915050565b600033905090565b600073ffffffffffffffffffffffffffffffffffffffff168373ffffffffffffffffffffffffffffffffffffffff161415610ac2576040517f08c379a00000000000000000000000000000000000000000000000000000000081526004018080602001828103825260248152602001806112a56024913960400191505060405180910390fd5b600073ffffffffffffffffffffffffffffffffffffffff168273ffffffffffffffffffffffffffffffffffffffff161415610b48576040517f08c379a00000000000000000000000000000000000000000000000000000000081526004018080602001828103825260228152602001806112106022913960400191505060405180910390fd5b80600160008573ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002060008473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff168152602001908152602001600020819055508173ffffffffffffffffffffffffffffffffffffffff168373ffffffffffffffffffffffffffffffffffffffff167f8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925836040518082815260200191505060405180910390a3505050565b600073ffffffffffffffffffffffffffffffffffffffff168373ffffffffffffffffffffffffffffffffffffffff161415610cb9576040517f08c379a00000000000000000000000000000000000000000000000000000000081526004018080602001828103825260258152602001806112806025913960400191505060405180910390fd5b600073ffffffffffffffffffffffffffffffffffffffff168273ffffffffffffffffffffffffffffffffffffffff161415610d3f576040517f08c379a00000000000000000000000000000000000000000000000000000000081526004018080602001828103825260238152602001806111ed6023913960400191505060405180910390fd5b610daa81604051806060016040528060268152602001611232602691396000808773ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002054610ee99092919063ffffffff16565b6000808573ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002081905550610e3d816000808573ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002054610fa990919063ffffffff16565b6000808473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff168152602001908152602001600020819055508173ffffffffffffffffffffffffffffffffffffffff168373ffffffffffffffffffffffffffffffffffffffff167fddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef836040518082815260200191505060405180910390a3505050565b6000838311158290610f96576040517f08c379a00000000000000000000000000000000000000000000000000000000081526004018080602001828103825283818151815260200191508051906020019080838360005b83811015610f5b578082015181840152602081019050610f40565b50505050905090810190601f168015610f885780820380516001836020036101000a031916815260200191505b509250505060405180910390fd5b5060008385039050809150509392505050565b600080828401905083811015611027576040517f08c379a000000000000000000000000000000000000000000000000000000000815260040180806020018281038252601b8152602001807f536166654d6174683a206164646974696f6e206f766572666c6f77000000000081525060200191505060405180910390fd5b8091505092915050565b600073ffffffffffffffffffffffffffffffffffffffff168273ffffffffffffffffffffffffffffffffffffffff1614156110d4576040517f08c379a000000000000000000000000000000000000000000000000000000000815260040180806020018281038252601f8152602001807f45524332303a206d696e7420746f20746865207a65726f20616464726573730081525060200191505060405180910390fd5b6110e981600254610fa990919063ffffffff16565b600281905550611140816000808573ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002054610fa990919063ffffffff16565b6000808473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff168152602001908152602001600020819055508173ffffffffffffffffffffffffffffffffffffffff16600073ffffffffffffffffffffffffffffffffffffffff167fddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef836040518082815260200191505060405180910390a3505056fe45524332303a207472616e7366657220746f20746865207a65726f206164647265737345524332303a20617070726f766520746f20746865207a65726f206164647265737345524332303a207472616e7366657220616d6f756e7420657863656564732062616c616e636545524332303a207472616e7366657220616d6f756e74206578636565647320616c6c6f77616e636545524332303a207472616e736665722066726f6d20746865207a65726f206164647265737345524332303a20617070726f76652066726f6d20746865207a65726f206164647265737345524332303a2064656372656173656420616c6c6f77616e63652062656c6f77207a65726fa165627a7a72305820d7b011b6b2b1d2c126466a1f7276634970b35821d06b043f9cc65b9b68bd434b0029",
  "sourceMap": "159:303:2:-;;;228:93;8:9:-1;5:2;;;30:1;27;20:12;5:2;228:93:2;;;;;;;;;;;;;13:2:-1;8:3;5:11;2:2;;;29:1;26;19:12;2:2;228:93:2;;;;;;;;;;;;;;;;;;;;;;;;;416:163:8;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;217:2:2;512:4:8;504:5;:12;;;;;;;;;;;;:::i;:::-;;536:6;526:7;:16;;;;;;;;;;;;:::i;:::-;;564:8;552:9;;:20;;;;;;;;;;;;;;;;;;416:163;;;291:22:2;297:7;306:6;291:5;;;:22;;:::i;:::-;228:93;;159:303;;5962:302:7;6056:1;6037:21;;:7;:21;;;;6029:65;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;6120:24;6137:6;6120:12;;:16;;;;;;:24;;;;:::i;:::-;6105:12;:39;;;;6175:30;6198:6;6175:9;:18;6185:7;6175:18;;;;;;;;;;;;;;;;:22;;;;;;:30;;;;:::i;:::-;6154:9;:18;6164:7;6154:18;;;;;;;;;;;;;;;:51;;;;6241:7;6220:37;;6237:1;6220:37;;;6250:6;6220:37;;;;;;;;;;;;;;;;;;5962:302;;:::o;834:176:5:-;892:7;911:9;927:1;923;:5;911:17;;951:1;946;:6;;938:46;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;1002:1;995:8;;;834:176;;;;:::o;159:303:2:-;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;:::i;:::-;;;:::o;:::-;;;;;;;;;;;;;;;;;;;;;;;;;;;:::o;:::-;;;;;;;",
  "deployedSourceMap": "159:303:2:-;;;;8:9:-1;5:2;;;30:1;27;20:12;5:2;159:303:2;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;644:81:8;;;:::i;:::-;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;23:1:-1;8:100;33:3;30:1;27:10;8:100;;;99:1;94:3;90:11;84:18;80:1;75:3;71:11;64:39;52:2;49:1;45:10;40:15;;8:100;;;12:14;644:81:8;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;2500:149:7;;;;;;13:2:-1;8:3;5:11;2:2;;;29:1;26;19:12;2:2;2500:149:7;;;;;;;;;;;;;;;;;;;;;;;;;;;;:::i;:::-;;;;;;;;;;;;;;;;;;;;;;;1559:89;;;:::i;:::-;;;;;;;;;;;;;;;;;;;3107:300;;;;;;13:2:-1;8:3;5:11;2:2;;;29:1;26;19:12;2:2;3107:300:7;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;:::i;:::-;;;;;;;;;;;;;;;;;;;;;;;1472:81:8;;;:::i;:::-;;;;;;;;;;;;;;;;;;;;;;;3802:207:7;;;;;;13:2:-1;8:3;5:11;2:2;;;29:1;26;19:12;2:2;3802:207:7;;;;;;;;;;;;;;;;;;;;;;;;;;;;:::i;:::-;;;;;;;;;;;;;;;;;;;;;;;327:132:2;;;;;;13:2:-1;8:3;5:11;2:2;;;29:1;26;19:12;2:2;327:132:2;;;;;;;;;;;;;;;;;;;;;;;;;;;;:::i;:::-;;;;;;;;;;;;;;;;;;;;;;;1706:108:7;;;;;;13:2:-1;8:3;5:11;2:2;;;29:1;26;19:12;2:2;1706:108:7;;;;;;;;;;;;;;;;;;;:::i;:::-;;;;;;;;;;;;;;;;;;;838:85:8;;;:::i;:::-;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;23:1:-1;8:100;33:3;30:1;27:10;8:100;;;99:1;94:3;90:11;84:18;80:1;75:3;71:11;64:39;52:2;49:1;45:10;40:15;;8:100;;;12:14;838:85:8;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;4496:258:7;;;;;;13:2:-1;8:3;5:11;2:2;;;29:1;26;19:12;2:2;4496:258:7;;;;;;;;;;;;;;;;;;;;;;;;;;;;:::i;:::-;;;;;;;;;;;;;;;;;;;;;;;2017:155;;;;;;13:2:-1;8:3;5:11;2:2;;;29:1;26;19:12;2:2;2017:155:7;;;;;;;;;;;;;;;;;;;;;;;;;;;;:::i;:::-;;;;;;;;;;;;;;;;;;;;;;;2230:132;;;;;;13:2:-1;8:3;5:11;2:2;;;29:1;26;19:12;2:2;2230:132:7;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;:::i;:::-;;;;;;;;;;;;;;;;;;;644:81:8;681:13;713:5;706:12;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;644:81;:::o;2500:149:7:-;2566:4;2582:39;2591:12;:10;:12::i;:::-;2605:7;2614:6;2582:8;:39::i;:::-;2638:4;2631:11;;2500:149;;;;:::o;1559:89::-;1603:7;1629:12;;1622:19;;1559:89;:::o;3107:300::-;3196:4;3212:36;3222:6;3230:9;3241:6;3212:9;:36::i;:::-;3258:121;3267:6;3275:12;:10;:12::i;:::-;3289:89;3327:6;3289:89;;;;;;;;;;;;;;;;;:11;:19;3301:6;3289:19;;;;;;;;;;;;;;;:33;3309:12;:10;:12::i;:::-;3289:33;;;;;;;;;;;;;;;;:37;;:89;;;;;:::i;:::-;3258:8;:121::i;:::-;3396:4;3389:11;;3107:300;;;;;:::o;1472:81:8:-;1513:5;1537:9;;;;;;;;;;;1530:16;;1472:81;:::o;3802:207:7:-;3882:4;3898:83;3907:12;:10;:12::i;:::-;3921:7;3930:50;3969:10;3930:11;:25;3942:12;:10;:12::i;:::-;3930:25;;;;;;;;;;;;;;;:34;3956:7;3930:34;;;;;;;;;;;;;;;;:38;;:50;;;;:::i;:::-;3898:8;:83::i;:::-;3998:4;3991:11;;3802:207;;;;:::o;327:132:2:-;390:4;407:22;413:7;422:6;407:5;:22::i;:::-;447:4;440:11;;327:132;;;;:::o;1706:108:7:-;1763:7;1789:9;:18;1799:7;1789:18;;;;;;;;;;;;;;;;1782:25;;1706:108;;;:::o;838:85:8:-;877:13;909:7;902:14;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;838:85;:::o;4496:258:7:-;4581:4;4597:129;4606:12;:10;:12::i;:::-;4620:7;4629:96;4668:15;4629:96;;;;;;;;;;;;;;;;;:11;:25;4641:12;:10;:12::i;:::-;4629:25;;;;;;;;;;;;;;;:34;4655:7;4629:34;;;;;;;;;;;;;;;;:38;;:96;;;;;:::i;:::-;4597:8;:129::i;:::-;4743:4;4736:11;;4496:258;;;;:::o;2017:155::-;2086:4;2102:42;2112:12;:10;:12::i;:::-;2126:9;2137:6;2102:9;:42::i;:::-;2161:4;2154:11;;2017:155;;;;:::o;2230:132::-;2302:7;2328:11;:18;2340:5;2328:18;;;;;;;;;;;;;;;:27;2347:7;2328:27;;;;;;;;;;;;;;;;2321:34;;2230:132;;;;:::o;788:96:4:-;833:15;867:10;860:17;;788:96;:::o;7351:332:7:-;7461:1;7444:19;;:5;:19;;;;7436:68;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;7541:1;7522:21;;:7;:21;;;;7514:68;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;7623:6;7593:11;:18;7605:5;7593:18;;;;;;;;;;;;;;;:27;7612:7;7593:27;;;;;;;;;;;;;;;:36;;;;7660:7;7644:32;;7653:5;7644:32;;;7669:6;7644:32;;;;;;;;;;;;;;;;;;7351:332;;;:::o;5228:464::-;5343:1;5325:20;;:6;:20;;;;5317:70;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;5426:1;5405:23;;:9;:23;;;;5397:71;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;5499;5521:6;5499:71;;;;;;;;;;;;;;;;;:9;:17;5509:6;5499:17;;;;;;;;;;;;;;;;:21;;:71;;;;;:::i;:::-;5479:9;:17;5489:6;5479:17;;;;;;;;;;;;;;;:91;;;;5603:32;5628:6;5603:9;:20;5613:9;5603:20;;;;;;;;;;;;;;;;:24;;:32;;;;:::i;:::-;5580:9;:20;5590:9;5580:20;;;;;;;;;;;;;;;:55;;;;5667:9;5650:35;;5659:6;5650:35;;;5678:6;5650:35;;;;;;;;;;;;;;;;;;5228:464;;;:::o;1732:187:5:-;1818:7;1850:1;1845;:6;;1853:12;1837:29;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;23:1:-1;8:100;33:3;30:1;27:10;8:100;;;99:1;94:3;90:11;84:18;80:1;75:3;71:11;64:39;52:2;49:1;45:10;40:15;;8:100;;;12:14;1837:29:5;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;1876:9;1892:1;1888;:5;1876:17;;1911:1;1904:8;;;1732:187;;;;;:::o;834:176::-;892:7;911:9;927:1;923;:5;911:17;;951:1;946;:6;;938:46;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;1002:1;995:8;;;834:176;;;;:::o;5962:302:7:-;6056:1;6037:21;;:7;:21;;;;6029:65;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;6120:24;6137:6;6120:12;;:16;;:24;;;;:::i;:::-;6105:12;:39;;;;6175:30;6198:6;6175:9;:18;6185:7;6175:18;;;;;;;;;;;;;;;;:22;;:30;;;;:::i;:::-;6154:9;:18;6164:7;6154:18;;;;;;;;;;;;;;;:51;;;;6241:7;6220:37;;6237:1;6220:37;;;6250:6;6220:37;;;;;;;;;;;;;;;;;;5962:302;;:::o",
  "source": "pragma solidity >=0.5.0 <0.6.0;\r\n\r\nimport \"@openzeppelin/contracts/token/ERC20/ERC20.sol\";\r\nimport \"@openzeppelin/contracts/token/ERC20/ERC20Detailed.sol\";\r\n\r\ncontract TCAD is ERC20, ERC20Detailed(\"True CAD\", \"TCAD\", 18) {\r\n    constructor(address account, uint256 amount) public {\r\n        _mint(account, amount);\r\n    }\r\n    function mint(address account, uint256 amount) public returns (bool) {\r\n        _mint(account, amount);\r\n        return true;\r\n    }\r\n}",
  "sourcePath": "C:/lib/10DEV/ethwaterloo-contract-account-metamask-plugin/truffle/contracts/TCAD.sol",
  "ast": {
    "absolutePath": "/C/lib/10DEV/ethwaterloo-contract-account-metamask-plugin/truffle/contracts/TCAD.sol",
    "exportedSymbols": {
      "TCAD": [
        393
      ]
    },
    "id": 394,
    "nodeType": "SourceUnit",
    "nodes": [
      {
        "id": 353,
        "literals": [
          "solidity",
          ">=",
          "0.5",
          ".0",
          "<",
          "0.6",
          ".0"
        ],
        "nodeType": "PragmaDirective",
        "src": "0:31:2"
      },
      {
        "absolutePath": "@openzeppelin/contracts/token/ERC20/ERC20.sol",
        "file": "@openzeppelin/contracts/token/ERC20/ERC20.sol",
        "id": 354,
        "nodeType": "ImportDirective",
        "scope": 394,
        "sourceUnit": 1169,
        "src": "35:55:2",
        "symbolAliases": [],
        "unitAlias": ""
      },
      {
        "absolutePath": "@openzeppelin/contracts/token/ERC20/ERC20Detailed.sol",
        "file": "@openzeppelin/contracts/token/ERC20/ERC20Detailed.sol",
        "id": 355,
        "nodeType": "ImportDirective",
        "scope": 394,
        "sourceUnit": 1227,
        "src": "92:63:2",
        "symbolAliases": [],
        "unitAlias": ""
      },
      {
        "baseContracts": [
          {
            "arguments": null,
            "baseName": {
              "contractScope": null,
              "id": 356,
              "name": "ERC20",
              "nodeType": "UserDefinedTypeName",
              "referencedDeclaration": 1168,
              "src": "176:5:2",
              "typeDescriptions": {
                "typeIdentifier": "t_contract$_ERC20_$1168",
                "typeString": "contract ERC20"
              }
            },
            "id": 357,
            "nodeType": "InheritanceSpecifier",
            "src": "176:5:2"
          },
          {
            "arguments": [
              {
                "argumentTypes": null,
                "hexValue": "5472756520434144",
                "id": 359,
                "isConstant": false,
                "isLValue": false,
                "isPure": true,
                "kind": "string",
                "lValueRequested": false,
                "nodeType": "Literal",
                "src": "197:10:2",
                "subdenomination": null,
                "typeDescriptions": {
                  "typeIdentifier": "t_stringliteral_a404a992e754113d22ebcbf92a4a6ab0d9da2349d537a3f7de2ba4eb26015def",
                  "typeString": "literal_string \"True CAD\""
                },
                "value": "True CAD"
              },
              {
                "argumentTypes": null,
                "hexValue": "54434144",
                "id": 360,
                "isConstant": false,
                "isLValue": false,
                "isPure": true,
                "kind": "string",
                "lValueRequested": false,
                "nodeType": "Literal",
                "src": "209:6:2",
                "subdenomination": null,
                "typeDescriptions": {
                  "typeIdentifier": "t_stringliteral_da41cc6dfd10c50681e46b0977d33728210caa0183a51f7d8f3f20f0c348d9ed",
                  "typeString": "literal_string \"TCAD\""
                },
                "value": "TCAD"
              },
              {
                "argumentTypes": null,
                "hexValue": "3138",
                "id": 361,
                "isConstant": false,
                "isLValue": false,
                "isPure": true,
                "kind": "number",
                "lValueRequested": false,
                "nodeType": "Literal",
                "src": "217:2:2",
                "subdenomination": null,
                "typeDescriptions": {
                  "typeIdentifier": "t_rational_18_by_1",
                  "typeString": "int_const 18"
                },
                "value": "18"
              }
            ],
            "baseName": {
              "contractScope": null,
              "id": 358,
              "name": "ERC20Detailed",
              "nodeType": "UserDefinedTypeName",
              "referencedDeclaration": 1226,
              "src": "183:13:2",
              "typeDescriptions": {
                "typeIdentifier": "t_contract$_ERC20Detailed_$1226",
                "typeString": "contract ERC20Detailed"
              }
            },
            "id": 362,
            "nodeType": "InheritanceSpecifier",
            "src": "183:37:2"
          }
        ],
        "contractDependencies": [
          462,
          1168,
          1226,
          1295
        ],
        "contractKind": "contract",
        "documentation": null,
        "fullyImplemented": true,
        "id": 393,
        "linearizedBaseContracts": [
          393,
          1226,
          1168,
          1295,
          462
        ],
        "name": "TCAD",
        "nodeType": "ContractDefinition",
        "nodes": [
          {
            "body": {
              "id": 374,
              "nodeType": "Block",
              "src": "280:41:2",
              "statements": [
                {
                  "expression": {
                    "argumentTypes": null,
                    "arguments": [
                      {
                        "argumentTypes": null,
                        "id": 370,
                        "name": "account",
                        "nodeType": "Identifier",
                        "overloadedDeclarations": [],
                        "referencedDeclaration": 364,
                        "src": "297:7:2",
                        "typeDescriptions": {
                          "typeIdentifier": "t_address",
                          "typeString": "address"
                        }
                      },
                      {
                        "argumentTypes": null,
                        "id": 371,
                        "name": "amount",
                        "nodeType": "Identifier",
                        "overloadedDeclarations": [],
                        "referencedDeclaration": 366,
                        "src": "306:6:2",
                        "typeDescriptions": {
                          "typeIdentifier": "t_uint256",
                          "typeString": "uint256"
                        }
                      }
                    ],
                    "expression": {
                      "argumentTypes": [
                        {
                          "typeIdentifier": "t_address",
                          "typeString": "address"
                        },
                        {
                          "typeIdentifier": "t_uint256",
                          "typeString": "uint256"
                        }
                      ],
                      "id": 369,
                      "name": "_mint",
                      "nodeType": "Identifier",
                      "overloadedDeclarations": [],
                      "referencedDeclaration": 1052,
                      "src": "291:5:2",
                      "typeDescriptions": {
                        "typeIdentifier": "t_function_internal_nonpayable$_t_address_$_t_uint256_$returns$__$",
                        "typeString": "function (address,uint256)"
                      }
                    },
                    "id": 372,
                    "isConstant": false,
                    "isLValue": false,
                    "isPure": false,
                    "kind": "functionCall",
                    "lValueRequested": false,
                    "names": [],
                    "nodeType": "FunctionCall",
                    "src": "291:22:2",
                    "typeDescriptions": {
                      "typeIdentifier": "t_tuple$__$",
                      "typeString": "tuple()"
                    }
                  },
                  "id": 373,
                  "nodeType": "ExpressionStatement",
                  "src": "291:22:2"
                }
              ]
            },
            "documentation": null,
            "id": 375,
            "implemented": true,
            "kind": "constructor",
            "modifiers": [],
            "name": "",
            "nodeType": "FunctionDefinition",
            "parameters": {
              "id": 367,
              "nodeType": "ParameterList",
              "parameters": [
                {
                  "constant": false,
                  "id": 364,
                  "name": "account",
                  "nodeType": "VariableDeclaration",
                  "scope": 375,
                  "src": "240:15:2",
                  "stateVariable": false,
                  "storageLocation": "default",
                  "typeDescriptions": {
                    "typeIdentifier": "t_address",
                    "typeString": "address"
                  },
                  "typeName": {
                    "id": 363,
                    "name": "address",
                    "nodeType": "ElementaryTypeName",
                    "src": "240:7:2",
                    "stateMutability": "nonpayable",
                    "typeDescriptions": {
                      "typeIdentifier": "t_address",
                      "typeString": "address"
                    }
                  },
                  "value": null,
                  "visibility": "internal"
                },
                {
                  "constant": false,
                  "id": 366,
                  "name": "amount",
                  "nodeType": "VariableDeclaration",
                  "scope": 375,
                  "src": "257:14:2",
                  "stateVariable": false,
                  "storageLocation": "default",
                  "typeDescriptions": {
                    "typeIdentifier": "t_uint256",
                    "typeString": "uint256"
                  },
                  "typeName": {
                    "id": 365,
                    "name": "uint256",
                    "nodeType": "ElementaryTypeName",
                    "src": "257:7:2",
                    "typeDescriptions": {
                      "typeIdentifier": "t_uint256",
                      "typeString": "uint256"
                    }
                  },
                  "value": null,
                  "visibility": "internal"
                }
              ],
              "src": "239:33:2"
            },
            "returnParameters": {
              "id": 368,
              "nodeType": "ParameterList",
              "parameters": [],
              "src": "280:0:2"
            },
            "scope": 393,
            "src": "228:93:2",
            "stateMutability": "nonpayable",
            "superFunction": null,
            "visibility": "public"
          },
          {
            "body": {
              "id": 391,
              "nodeType": "Block",
              "src": "396:63:2",
              "statements": [
                {
                  "expression": {
                    "argumentTypes": null,
                    "arguments": [
                      {
                        "argumentTypes": null,
                        "id": 385,
                        "name": "account",
                        "nodeType": "Identifier",
                        "overloadedDeclarations": [],
                        "referencedDeclaration": 377,
                        "src": "413:7:2",
                        "typeDescriptions": {
                          "typeIdentifier": "t_address",
                          "typeString": "address"
                        }
                      },
                      {
                        "argumentTypes": null,
                        "id": 386,
                        "name": "amount",
                        "nodeType": "Identifier",
                        "overloadedDeclarations": [],
                        "referencedDeclaration": 379,
                        "src": "422:6:2",
                        "typeDescriptions": {
                          "typeIdentifier": "t_uint256",
                          "typeString": "uint256"
                        }
                      }
                    ],
                    "expression": {
                      "argumentTypes": [
                        {
                          "typeIdentifier": "t_address",
                          "typeString": "address"
                        },
                        {
                          "typeIdentifier": "t_uint256",
                          "typeString": "uint256"
                        }
                      ],
                      "id": 384,
                      "name": "_mint",
                      "nodeType": "Identifier",
                      "overloadedDeclarations": [],
                      "referencedDeclaration": 1052,
                      "src": "407:5:2",
                      "typeDescriptions": {
                        "typeIdentifier": "t_function_internal_nonpayable$_t_address_$_t_uint256_$returns$__$",
                        "typeString": "function (address,uint256)"
                      }
                    },
                    "id": 387,
                    "isConstant": false,
                    "isLValue": false,
                    "isPure": false,
                    "kind": "functionCall",
                    "lValueRequested": false,
                    "names": [],
                    "nodeType": "FunctionCall",
                    "src": "407:22:2",
                    "typeDescriptions": {
                      "typeIdentifier": "t_tuple$__$",
                      "typeString": "tuple()"
                    }
                  },
                  "id": 388,
                  "nodeType": "ExpressionStatement",
                  "src": "407:22:2"
                },
                {
                  "expression": {
                    "argumentTypes": null,
                    "hexValue": "74727565",
                    "id": 389,
                    "isConstant": false,
                    "isLValue": false,
                    "isPure": true,
                    "kind": "bool",
                    "lValueRequested": false,
                    "nodeType": "Literal",
                    "src": "447:4:2",
                    "subdenomination": null,
                    "typeDescriptions": {
                      "typeIdentifier": "t_bool",
                      "typeString": "bool"
                    },
                    "value": "true"
                  },
                  "functionReturnParameters": 383,
                  "id": 390,
                  "nodeType": "Return",
                  "src": "440:11:2"
                }
              ]
            },
            "documentation": null,
            "id": 392,
            "implemented": true,
            "kind": "function",
            "modifiers": [],
            "name": "mint",
            "nodeType": "FunctionDefinition",
            "parameters": {
              "id": 380,
              "nodeType": "ParameterList",
              "parameters": [
                {
                  "constant": false,
                  "id": 377,
                  "name": "account",
                  "nodeType": "VariableDeclaration",
                  "scope": 392,
                  "src": "341:15:2",
                  "stateVariable": false,
                  "storageLocation": "default",
                  "typeDescriptions": {
                    "typeIdentifier": "t_address",
                    "typeString": "address"
                  },
                  "typeName": {
                    "id": 376,
                    "name": "address",
                    "nodeType": "ElementaryTypeName",
                    "src": "341:7:2",
                    "stateMutability": "nonpayable",
                    "typeDescriptions": {
                      "typeIdentifier": "t_address",
                      "typeString": "address"
                    }
                  },
                  "value": null,
                  "visibility": "internal"
                },
                {
                  "constant": false,
                  "id": 379,
                  "name": "amount",
                  "nodeType": "VariableDeclaration",
                  "scope": 392,
                  "src": "358:14:2",
                  "stateVariable": false,
                  "storageLocation": "default",
                  "typeDescriptions": {
                    "typeIdentifier": "t_uint256",
                    "typeString": "uint256"
                  },
                  "typeName": {
                    "id": 378,
                    "name": "uint256",
                    "nodeType": "ElementaryTypeName",
                    "src": "358:7:2",
                    "typeDescriptions": {
                      "typeIdentifier": "t_uint256",
                      "typeString": "uint256"
                    }
                  },
                  "value": null,
                  "visibility": "internal"
                }
              ],
              "src": "340:33:2"
            },
            "returnParameters": {
              "id": 383,
              "nodeType": "ParameterList",
              "parameters": [
                {
                  "constant": false,
                  "id": 382,
                  "name": "",
                  "nodeType": "VariableDeclaration",
                  "scope": 392,
                  "src": "390:4:2",
                  "stateVariable": false,
                  "storageLocation": "default",
                  "typeDescriptions": {
                    "typeIdentifier": "t_bool",
                    "typeString": "bool"
                  },
                  "typeName": {
                    "id": 381,
                    "name": "bool",
                    "nodeType": "ElementaryTypeName",
                    "src": "390:4:2",
                    "typeDescriptions": {
                      "typeIdentifier": "t_bool",
                      "typeString": "bool"
                    }
                  },
                  "value": null,
                  "visibility": "internal"
                }
              ],
              "src": "389:6:2"
            },
            "scope": 393,
            "src": "327:132:2",
            "stateMutability": "nonpayable",
            "superFunction": null,
            "visibility": "public"
          }
        ],
        "scope": 394,
        "src": "159:303:2"
      }
    ],
    "src": "0:462:2"
  },
  "legacyAST": {
    "absolutePath": "/C/lib/10DEV/ethwaterloo-contract-account-metamask-plugin/truffle/contracts/TCAD.sol",
    "exportedSymbols": {
      "TCAD": [
        393
      ]
    },
    "id": 394,
    "nodeType": "SourceUnit",
    "nodes": [
      {
        "id": 353,
        "literals": [
          "solidity",
          ">=",
          "0.5",
          ".0",
          "<",
          "0.6",
          ".0"
        ],
        "nodeType": "PragmaDirective",
        "src": "0:31:2"
      },
      {
        "absolutePath": "@openzeppelin/contracts/token/ERC20/ERC20.sol",
        "file": "@openzeppelin/contracts/token/ERC20/ERC20.sol",
        "id": 354,
        "nodeType": "ImportDirective",
        "scope": 394,
        "sourceUnit": 1169,
        "src": "35:55:2",
        "symbolAliases": [],
        "unitAlias": ""
      },
      {
        "absolutePath": "@openzeppelin/contracts/token/ERC20/ERC20Detailed.sol",
        "file": "@openzeppelin/contracts/token/ERC20/ERC20Detailed.sol",
        "id": 355,
        "nodeType": "ImportDirective",
        "scope": 394,
        "sourceUnit": 1227,
        "src": "92:63:2",
        "symbolAliases": [],
        "unitAlias": ""
      },
      {
        "baseContracts": [
          {
            "arguments": null,
            "baseName": {
              "contractScope": null,
              "id": 356,
              "name": "ERC20",
              "nodeType": "UserDefinedTypeName",
              "referencedDeclaration": 1168,
              "src": "176:5:2",
              "typeDescriptions": {
                "typeIdentifier": "t_contract$_ERC20_$1168",
                "typeString": "contract ERC20"
              }
            },
            "id": 357,
            "nodeType": "InheritanceSpecifier",
            "src": "176:5:2"
          },
          {
            "arguments": [
              {
                "argumentTypes": null,
                "hexValue": "5472756520434144",
                "id": 359,
                "isConstant": false,
                "isLValue": false,
                "isPure": true,
                "kind": "string",
                "lValueRequested": false,
                "nodeType": "Literal",
                "src": "197:10:2",
                "subdenomination": null,
                "typeDescriptions": {
                  "typeIdentifier": "t_stringliteral_a404a992e754113d22ebcbf92a4a6ab0d9da2349d537a3f7de2ba4eb26015def",
                  "typeString": "literal_string \"True CAD\""
                },
                "value": "True CAD"
              },
              {
                "argumentTypes": null,
                "hexValue": "54434144",
                "id": 360,
                "isConstant": false,
                "isLValue": false,
                "isPure": true,
                "kind": "string",
                "lValueRequested": false,
                "nodeType": "Literal",
                "src": "209:6:2",
                "subdenomination": null,
                "typeDescriptions": {
                  "typeIdentifier": "t_stringliteral_da41cc6dfd10c50681e46b0977d33728210caa0183a51f7d8f3f20f0c348d9ed",
                  "typeString": "literal_string \"TCAD\""
                },
                "value": "TCAD"
              },
              {
                "argumentTypes": null,
                "hexValue": "3138",
                "id": 361,
                "isConstant": false,
                "isLValue": false,
                "isPure": true,
                "kind": "number",
                "lValueRequested": false,
                "nodeType": "Literal",
                "src": "217:2:2",
                "subdenomination": null,
                "typeDescriptions": {
                  "typeIdentifier": "t_rational_18_by_1",
                  "typeString": "int_const 18"
                },
                "value": "18"
              }
            ],
            "baseName": {
              "contractScope": null,
              "id": 358,
              "name": "ERC20Detailed",
              "nodeType": "UserDefinedTypeName",
              "referencedDeclaration": 1226,
              "src": "183:13:2",
              "typeDescriptions": {
                "typeIdentifier": "t_contract$_ERC20Detailed_$1226",
                "typeString": "contract ERC20Detailed"
              }
            },
            "id": 362,
            "nodeType": "InheritanceSpecifier",
            "src": "183:37:2"
          }
        ],
        "contractDependencies": [
          462,
          1168,
          1226,
          1295
        ],
        "contractKind": "contract",
        "documentation": null,
        "fullyImplemented": true,
        "id": 393,
        "linearizedBaseContracts": [
          393,
          1226,
          1168,
          1295,
          462
        ],
        "name": "TCAD",
        "nodeType": "ContractDefinition",
        "nodes": [
          {
            "body": {
              "id": 374,
              "nodeType": "Block",
              "src": "280:41:2",
              "statements": [
                {
                  "expression": {
                    "argumentTypes": null,
                    "arguments": [
                      {
                        "argumentTypes": null,
                        "id": 370,
                        "name": "account",
                        "nodeType": "Identifier",
                        "overloadedDeclarations": [],
                        "referencedDeclaration": 364,
                        "src": "297:7:2",
                        "typeDescriptions": {
                          "typeIdentifier": "t_address",
                          "typeString": "address"
                        }
                      },
                      {
                        "argumentTypes": null,
                        "id": 371,
                        "name": "amount",
                        "nodeType": "Identifier",
                        "overloadedDeclarations": [],
                        "referencedDeclaration": 366,
                        "src": "306:6:2",
                        "typeDescriptions": {
                          "typeIdentifier": "t_uint256",
                          "typeString": "uint256"
                        }
                      }
                    ],
                    "expression": {
                      "argumentTypes": [
                        {
                          "typeIdentifier": "t_address",
                          "typeString": "address"
                        },
                        {
                          "typeIdentifier": "t_uint256",
                          "typeString": "uint256"
                        }
                      ],
                      "id": 369,
                      "name": "_mint",
                      "nodeType": "Identifier",
                      "overloadedDeclarations": [],
                      "referencedDeclaration": 1052,
                      "src": "291:5:2",
                      "typeDescriptions": {
                        "typeIdentifier": "t_function_internal_nonpayable$_t_address_$_t_uint256_$returns$__$",
                        "typeString": "function (address,uint256)"
                      }
                    },
                    "id": 372,
                    "isConstant": false,
                    "isLValue": false,
                    "isPure": false,
                    "kind": "functionCall",
                    "lValueRequested": false,
                    "names": [],
                    "nodeType": "FunctionCall",
                    "src": "291:22:2",
                    "typeDescriptions": {
                      "typeIdentifier": "t_tuple$__$",
                      "typeString": "tuple()"
                    }
                  },
                  "id": 373,
                  "nodeType": "ExpressionStatement",
                  "src": "291:22:2"
                }
              ]
            },
            "documentation": null,
            "id": 375,
            "implemented": true,
            "kind": "constructor",
            "modifiers": [],
            "name": "",
            "nodeType": "FunctionDefinition",
            "parameters": {
              "id": 367,
              "nodeType": "ParameterList",
              "parameters": [
                {
                  "constant": false,
                  "id": 364,
                  "name": "account",
                  "nodeType": "VariableDeclaration",
                  "scope": 375,
                  "src": "240:15:2",
                  "stateVariable": false,
                  "storageLocation": "default",
                  "typeDescriptions": {
                    "typeIdentifier": "t_address",
                    "typeString": "address"
                  },
                  "typeName": {
                    "id": 363,
                    "name": "address",
                    "nodeType": "ElementaryTypeName",
                    "src": "240:7:2",
                    "stateMutability": "nonpayable",
                    "typeDescriptions": {
                      "typeIdentifier": "t_address",
                      "typeString": "address"
                    }
                  },
                  "value": null,
                  "visibility": "internal"
                },
                {
                  "constant": false,
                  "id": 366,
                  "name": "amount",
                  "nodeType": "VariableDeclaration",
                  "scope": 375,
                  "src": "257:14:2",
                  "stateVariable": false,
                  "storageLocation": "default",
                  "typeDescriptions": {
                    "typeIdentifier": "t_uint256",
                    "typeString": "uint256"
                  },
                  "typeName": {
                    "id": 365,
                    "name": "uint256",
                    "nodeType": "ElementaryTypeName",
                    "src": "257:7:2",
                    "typeDescriptions": {
                      "typeIdentifier": "t_uint256",
                      "typeString": "uint256"
                    }
                  },
                  "value": null,
                  "visibility": "internal"
                }
              ],
              "src": "239:33:2"
            },
            "returnParameters": {
              "id": 368,
              "nodeType": "ParameterList",
              "parameters": [],
              "src": "280:0:2"
            },
            "scope": 393,
            "src": "228:93:2",
            "stateMutability": "nonpayable",
            "superFunction": null,
            "visibility": "public"
          },
          {
            "body": {
              "id": 391,
              "nodeType": "Block",
              "src": "396:63:2",
              "statements": [
                {
                  "expression": {
                    "argumentTypes": null,
                    "arguments": [
                      {
                        "argumentTypes": null,
                        "id": 385,
                        "name": "account",
                        "nodeType": "Identifier",
                        "overloadedDeclarations": [],
                        "referencedDeclaration": 377,
                        "src": "413:7:2",
                        "typeDescriptions": {
                          "typeIdentifier": "t_address",
                          "typeString": "address"
                        }
                      },
                      {
                        "argumentTypes": null,
                        "id": 386,
                        "name": "amount",
                        "nodeType": "Identifier",
                        "overloadedDeclarations": [],
                        "referencedDeclaration": 379,
                        "src": "422:6:2",
                        "typeDescriptions": {
                          "typeIdentifier": "t_uint256",
                          "typeString": "uint256"
                        }
                      }
                    ],
                    "expression": {
                      "argumentTypes": [
                        {
                          "typeIdentifier": "t_address",
                          "typeString": "address"
                        },
                        {
                          "typeIdentifier": "t_uint256",
                          "typeString": "uint256"
                        }
                      ],
                      "id": 384,
                      "name": "_mint",
                      "nodeType": "Identifier",
                      "overloadedDeclarations": [],
                      "referencedDeclaration": 1052,
                      "src": "407:5:2",
                      "typeDescriptions": {
                        "typeIdentifier": "t_function_internal_nonpayable$_t_address_$_t_uint256_$returns$__$",
                        "typeString": "function (address,uint256)"
                      }
                    },
                    "id": 387,
                    "isConstant": false,
                    "isLValue": false,
                    "isPure": false,
                    "kind": "functionCall",
                    "lValueRequested": false,
                    "names": [],
                    "nodeType": "FunctionCall",
                    "src": "407:22:2",
                    "typeDescriptions": {
                      "typeIdentifier": "t_tuple$__$",
                      "typeString": "tuple()"
                    }
                  },
                  "id": 388,
                  "nodeType": "ExpressionStatement",
                  "src": "407:22:2"
                },
                {
                  "expression": {
                    "argumentTypes": null,
                    "hexValue": "74727565",
                    "id": 389,
                    "isConstant": false,
                    "isLValue": false,
                    "isPure": true,
                    "kind": "bool",
                    "lValueRequested": false,
                    "nodeType": "Literal",
                    "src": "447:4:2",
                    "subdenomination": null,
                    "typeDescriptions": {
                      "typeIdentifier": "t_bool",
                      "typeString": "bool"
                    },
                    "value": "true"
                  },
                  "functionReturnParameters": 383,
                  "id": 390,
                  "nodeType": "Return",
                  "src": "440:11:2"
                }
              ]
            },
            "documentation": null,
            "id": 392,
            "implemented": true,
            "kind": "function",
            "modifiers": [],
            "name": "mint",
            "nodeType": "FunctionDefinition",
            "parameters": {
              "id": 380,
              "nodeType": "ParameterList",
              "parameters": [
                {
                  "constant": false,
                  "id": 377,
                  "name": "account",
                  "nodeType": "VariableDeclaration",
                  "scope": 392,
                  "src": "341:15:2",
                  "stateVariable": false,
                  "storageLocation": "default",
                  "typeDescriptions": {
                    "typeIdentifier": "t_address",
                    "typeString": "address"
                  },
                  "typeName": {
                    "id": 376,
                    "name": "address",
                    "nodeType": "ElementaryTypeName",
                    "src": "341:7:2",
                    "stateMutability": "nonpayable",
                    "typeDescriptions": {
                      "typeIdentifier": "t_address",
                      "typeString": "address"
                    }
                  },
                  "value": null,
                  "visibility": "internal"
                },
                {
                  "constant": false,
                  "id": 379,
                  "name": "amount",
                  "nodeType": "VariableDeclaration",
                  "scope": 392,
                  "src": "358:14:2",
                  "stateVariable": false,
                  "storageLocation": "default",
                  "typeDescriptions": {
                    "typeIdentifier": "t_uint256",
                    "typeString": "uint256"
                  },
                  "typeName": {
                    "id": 378,
                    "name": "uint256",
                    "nodeType": "ElementaryTypeName",
                    "src": "358:7:2",
                    "typeDescriptions": {
                      "typeIdentifier": "t_uint256",
                      "typeString": "uint256"
                    }
                  },
                  "value": null,
                  "visibility": "internal"
                }
              ],
              "src": "340:33:2"
            },
            "returnParameters": {
              "id": 383,
              "nodeType": "ParameterList",
              "parameters": [
                {
                  "constant": false,
                  "id": 382,
                  "name": "",
                  "nodeType": "VariableDeclaration",
                  "scope": 392,
                  "src": "390:4:2",
                  "stateVariable": false,
                  "storageLocation": "default",
                  "typeDescriptions": {
                    "typeIdentifier": "t_bool",
                    "typeString": "bool"
                  },
                  "typeName": {
                    "id": 381,
                    "name": "bool",
                    "nodeType": "ElementaryTypeName",
                    "src": "390:4:2",
                    "typeDescriptions": {
                      "typeIdentifier": "t_bool",
                      "typeString": "bool"
                    }
                  },
                  "value": null,
                  "visibility": "internal"
                }
              ],
              "src": "389:6:2"
            },
            "scope": 393,
            "src": "327:132:2",
            "stateMutability": "nonpayable",
            "superFunction": null,
            "visibility": "public"
          }
        ],
        "scope": 394,
        "src": "159:303:2"
      }
    ],
    "src": "0:462:2"
  },
  "compiler": {
    "name": "solc",
    "version": "0.5.8+commit.23d335f2.Emscripten.clang"
  },
  "networks": {
    "99": {
      "events": {
        "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef": {
          "anonymous": false,
          "inputs": [
            {
              "indexed": true,
              "name": "from",
              "type": "address"
            },
            {
              "indexed": true,
              "name": "to",
              "type": "address"
            },
            {
              "indexed": false,
              "name": "value",
              "type": "uint256"
            }
          ],
          "name": "Transfer",
          "type": "event",
          "signature": "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"
        },
        "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925": {
          "anonymous": false,
          "inputs": [
            {
              "indexed": true,
              "name": "owner",
              "type": "address"
            },
            {
              "indexed": true,
              "name": "spender",
              "type": "address"
            },
            {
              "indexed": false,
              "name": "value",
              "type": "uint256"
            }
          ],
          "name": "Approval",
          "type": "event",
          "signature": "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925"
        }
      },
      "links": {},
      "address": "0x59d3631c86BbE35EF041872d502F218A39FBa150",
      "transactionHash": "0x022a87edfde7f6703a300abfb912908a8b4fa542c13914d16dcb422265494e95"
    },
    "1573372276438": {
      "events": {
        "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef": {
          "anonymous": false,
          "inputs": [
            {
              "indexed": true,
              "name": "from",
              "type": "address"
            },
            {
              "indexed": true,
              "name": "to",
              "type": "address"
            },
            {
              "indexed": false,
              "name": "value",
              "type": "uint256"
            }
          ],
          "name": "Transfer",
          "type": "event",
          "signature": "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"
        },
        "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925": {
          "anonymous": false,
          "inputs": [
            {
              "indexed": true,
              "name": "owner",
              "type": "address"
            },
            {
              "indexed": true,
              "name": "spender",
              "type": "address"
            },
            {
              "indexed": false,
              "name": "value",
              "type": "uint256"
            }
          ],
          "name": "Approval",
          "type": "event",
          "signature": "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925"
        }
      },
      "links": {},
      "address": "0x254dffcd3277C0b1660F6d42EFbB754edaBAbC2B",
      "transactionHash": "0x3e62acb83c344f74e62aa8202a95fdcf2e59ad20f9a5ac27c0272fb3bc2d2fec"
    },
    "1573373215128": {
      "events": {
        "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef": {
          "anonymous": false,
          "inputs": [
            {
              "indexed": true,
              "name": "from",
              "type": "address"
            },
            {
              "indexed": true,
              "name": "to",
              "type": "address"
            },
            {
              "indexed": false,
              "name": "value",
              "type": "uint256"
            }
          ],
          "name": "Transfer",
          "type": "event",
          "signature": "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"
        },
        "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925": {
          "anonymous": false,
          "inputs": [
            {
              "indexed": true,
              "name": "owner",
              "type": "address"
            },
            {
              "indexed": true,
              "name": "spender",
              "type": "address"
            },
            {
              "indexed": false,
              "name": "value",
              "type": "uint256"
            }
          ],
          "name": "Approval",
          "type": "event",
          "signature": "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925"
        }
      },
      "links": {},
      "address": "0x254dffcd3277C0b1660F6d42EFbB754edaBAbC2B",
      "transactionHash": "0x3e62acb83c344f74e62aa8202a95fdcf2e59ad20f9a5ac27c0272fb3bc2d2fec"
    },
    "1573373659891": {
      "events": {
        "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef": {
          "anonymous": false,
          "inputs": [
            {
              "indexed": true,
              "name": "from",
              "type": "address"
            },
            {
              "indexed": true,
              "name": "to",
              "type": "address"
            },
            {
              "indexed": false,
              "name": "value",
              "type": "uint256"
            }
          ],
          "name": "Transfer",
          "type": "event",
          "signature": "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"
        },
        "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925": {
          "anonymous": false,
          "inputs": [
            {
              "indexed": true,
              "name": "owner",
              "type": "address"
            },
            {
              "indexed": true,
              "name": "spender",
              "type": "address"
            },
            {
              "indexed": false,
              "name": "value",
              "type": "uint256"
            }
          ],
          "name": "Approval",
          "type": "event",
          "signature": "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925"
        }
      },
      "links": {},
      "address": "0x254dffcd3277C0b1660F6d42EFbB754edaBAbC2B",
      "transactionHash": "0x3e62acb83c344f74e62aa8202a95fdcf2e59ad20f9a5ac27c0272fb3bc2d2fec"
    },
    "1573373986280": {
      "events": {
        "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef": {
          "anonymous": false,
          "inputs": [
            {
              "indexed": true,
              "name": "from",
              "type": "address"
            },
            {
              "indexed": true,
              "name": "to",
              "type": "address"
            },
            {
              "indexed": false,
              "name": "value",
              "type": "uint256"
            }
          ],
          "name": "Transfer",
          "type": "event",
          "signature": "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"
        },
        "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925": {
          "anonymous": false,
          "inputs": [
            {
              "indexed": true,
              "name": "owner",
              "type": "address"
            },
            {
              "indexed": true,
              "name": "spender",
              "type": "address"
            },
            {
              "indexed": false,
              "name": "value",
              "type": "uint256"
            }
          ],
          "name": "Approval",
          "type": "event",
          "signature": "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925"
        }
      },
      "links": {},
      "address": "0x254dffcd3277C0b1660F6d42EFbB754edaBAbC2B",
      "transactionHash": "0x3e62acb83c344f74e62aa8202a95fdcf2e59ad20f9a5ac27c0272fb3bc2d2fec"
    }
  },
  "schemaVersion": "3.0.16",
  "updatedAt": "2019-11-10T08:19:55.116Z",
  "devdoc": {
    "methods": {
      "allowance(address,address)": {
        "details": "See {IERC20-allowance}."
      },
      "approve(address,uint256)": {
        "details": "See {IERC20-approve}.     * Requirements:     * - `spender` cannot be the zero address."
      },
      "balanceOf(address)": {
        "details": "See {IERC20-balanceOf}."
      },
      "decimals()": {
        "details": "Returns the number of decimals used to get its user representation. For example, if `decimals` equals `2`, a balance of `505` tokens should be displayed to a user as `5,05` (`505 / 10 ** 2`).     * Tokens usually opt for a value of 18, imitating the relationship between Ether and Wei.     * NOTE: This information is only used for _display_ purposes: it in no way affects any of the arithmetic of the contract, including {IERC20-balanceOf} and {IERC20-transfer}."
      },
      "decreaseAllowance(address,uint256)": {
        "details": "Atomically decreases the allowance granted to `spender` by the caller.     * This is an alternative to {approve} that can be used as a mitigation for problems described in {IERC20-approve}.     * Emits an {Approval} event indicating the updated allowance.     * Requirements:     * - `spender` cannot be the zero address. - `spender` must have allowance for the caller of at least `subtractedValue`."
      },
      "increaseAllowance(address,uint256)": {
        "details": "Atomically increases the allowance granted to `spender` by the caller.     * This is an alternative to {approve} that can be used as a mitigation for problems described in {IERC20-approve}.     * Emits an {Approval} event indicating the updated allowance.     * Requirements:     * - `spender` cannot be the zero address."
      },
      "name()": {
        "details": "Returns the name of the token."
      },
      "symbol()": {
        "details": "Returns the symbol of the token, usually a shorter version of the name."
      },
      "totalSupply()": {
        "details": "See {IERC20-totalSupply}."
      },
      "transfer(address,uint256)": {
        "details": "See {IERC20-transfer}.     * Requirements:     * - `recipient` cannot be the zero address. - the caller must have a balance of at least `amount`."
      },
      "transferFrom(address,address,uint256)": {
        "details": "See {IERC20-transferFrom}.     * Emits an {Approval} event indicating the updated allowance. This is not required by the EIP. See the note at the beginning of {ERC20};     * Requirements: - `sender` and `recipient` cannot be the zero address. - `sender` must have a balance of at least `amount`. - the caller must have allowance for `sender`'s tokens of at least `amount`."
      }
    }
  },
  "userdoc": {
    "methods": {}
  }
}
},{}],11:[function(require,module,exports){
module.exports={
  "contractName": "USDC",
  "abi": [
    {
      "constant": true,
      "inputs": [],
      "name": "name",
      "outputs": [
        {
          "name": "",
          "type": "string"
        }
      ],
      "payable": false,
      "stateMutability": "view",
      "type": "function"
    },
    {
      "constant": false,
      "inputs": [
        {
          "name": "spender",
          "type": "address"
        },
        {
          "name": "amount",
          "type": "uint256"
        }
      ],
      "name": "approve",
      "outputs": [
        {
          "name": "",
          "type": "bool"
        }
      ],
      "payable": false,
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "constant": true,
      "inputs": [],
      "name": "totalSupply",
      "outputs": [
        {
          "name": "",
          "type": "uint256"
        }
      ],
      "payable": false,
      "stateMutability": "view",
      "type": "function"
    },
    {
      "constant": false,
      "inputs": [
        {
          "name": "sender",
          "type": "address"
        },
        {
          "name": "recipient",
          "type": "address"
        },
        {
          "name": "amount",
          "type": "uint256"
        }
      ],
      "name": "transferFrom",
      "outputs": [
        {
          "name": "",
          "type": "bool"
        }
      ],
      "payable": false,
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "constant": true,
      "inputs": [],
      "name": "decimals",
      "outputs": [
        {
          "name": "",
          "type": "uint8"
        }
      ],
      "payable": false,
      "stateMutability": "view",
      "type": "function"
    },
    {
      "constant": false,
      "inputs": [
        {
          "name": "spender",
          "type": "address"
        },
        {
          "name": "addedValue",
          "type": "uint256"
        }
      ],
      "name": "increaseAllowance",
      "outputs": [
        {
          "name": "",
          "type": "bool"
        }
      ],
      "payable": false,
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "constant": true,
      "inputs": [
        {
          "name": "account",
          "type": "address"
        }
      ],
      "name": "balanceOf",
      "outputs": [
        {
          "name": "",
          "type": "uint256"
        }
      ],
      "payable": false,
      "stateMutability": "view",
      "type": "function"
    },
    {
      "constant": true,
      "inputs": [],
      "name": "symbol",
      "outputs": [
        {
          "name": "",
          "type": "string"
        }
      ],
      "payable": false,
      "stateMutability": "view",
      "type": "function"
    },
    {
      "constant": false,
      "inputs": [
        {
          "name": "spender",
          "type": "address"
        },
        {
          "name": "subtractedValue",
          "type": "uint256"
        }
      ],
      "name": "decreaseAllowance",
      "outputs": [
        {
          "name": "",
          "type": "bool"
        }
      ],
      "payable": false,
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "constant": false,
      "inputs": [
        {
          "name": "recipient",
          "type": "address"
        },
        {
          "name": "amount",
          "type": "uint256"
        }
      ],
      "name": "transfer",
      "outputs": [
        {
          "name": "",
          "type": "bool"
        }
      ],
      "payable": false,
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "constant": true,
      "inputs": [
        {
          "name": "owner",
          "type": "address"
        },
        {
          "name": "spender",
          "type": "address"
        }
      ],
      "name": "allowance",
      "outputs": [
        {
          "name": "",
          "type": "uint256"
        }
      ],
      "payable": false,
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [
        {
          "name": "account",
          "type": "address"
        },
        {
          "name": "amount",
          "type": "uint256"
        }
      ],
      "payable": false,
      "stateMutability": "nonpayable",
      "type": "constructor"
    },
    {
      "anonymous": false,
      "inputs": [
        {
          "indexed": true,
          "name": "from",
          "type": "address"
        },
        {
          "indexed": true,
          "name": "to",
          "type": "address"
        },
        {
          "indexed": false,
          "name": "value",
          "type": "uint256"
        }
      ],
      "name": "Transfer",
      "type": "event"
    },
    {
      "anonymous": false,
      "inputs": [
        {
          "indexed": true,
          "name": "owner",
          "type": "address"
        },
        {
          "indexed": true,
          "name": "spender",
          "type": "address"
        },
        {
          "indexed": false,
          "name": "value",
          "type": "uint256"
        }
      ],
      "name": "Approval",
      "type": "event"
    },
    {
      "constant": false,
      "inputs": [
        {
          "name": "account",
          "type": "address"
        },
        {
          "name": "amount",
          "type": "uint256"
        }
      ],
      "name": "mint",
      "outputs": [
        {
          "name": "",
          "type": "bool"
        }
      ],
      "payable": false,
      "stateMutability": "nonpayable",
      "type": "function"
    }
  ],
  "metadata": "{\"compiler\":{\"version\":\"0.5.8+commit.23d335f2\"},\"language\":\"Solidity\",\"output\":{\"abi\":[{\"constant\":true,\"inputs\":[],\"name\":\"name\",\"outputs\":[{\"name\":\"\",\"type\":\"string\"}],\"payable\":false,\"stateMutability\":\"view\",\"type\":\"function\"},{\"constant\":false,\"inputs\":[{\"name\":\"spender\",\"type\":\"address\"},{\"name\":\"amount\",\"type\":\"uint256\"}],\"name\":\"approve\",\"outputs\":[{\"name\":\"\",\"type\":\"bool\"}],\"payable\":false,\"stateMutability\":\"nonpayable\",\"type\":\"function\"},{\"constant\":true,\"inputs\":[],\"name\":\"totalSupply\",\"outputs\":[{\"name\":\"\",\"type\":\"uint256\"}],\"payable\":false,\"stateMutability\":\"view\",\"type\":\"function\"},{\"constant\":false,\"inputs\":[{\"name\":\"sender\",\"type\":\"address\"},{\"name\":\"recipient\",\"type\":\"address\"},{\"name\":\"amount\",\"type\":\"uint256\"}],\"name\":\"transferFrom\",\"outputs\":[{\"name\":\"\",\"type\":\"bool\"}],\"payable\":false,\"stateMutability\":\"nonpayable\",\"type\":\"function\"},{\"constant\":true,\"inputs\":[],\"name\":\"decimals\",\"outputs\":[{\"name\":\"\",\"type\":\"uint8\"}],\"payable\":false,\"stateMutability\":\"view\",\"type\":\"function\"},{\"constant\":false,\"inputs\":[{\"name\":\"spender\",\"type\":\"address\"},{\"name\":\"addedValue\",\"type\":\"uint256\"}],\"name\":\"increaseAllowance\",\"outputs\":[{\"name\":\"\",\"type\":\"bool\"}],\"payable\":false,\"stateMutability\":\"nonpayable\",\"type\":\"function\"},{\"constant\":false,\"inputs\":[{\"name\":\"account\",\"type\":\"address\"},{\"name\":\"amount\",\"type\":\"uint256\"}],\"name\":\"mint\",\"outputs\":[{\"name\":\"\",\"type\":\"bool\"}],\"payable\":false,\"stateMutability\":\"nonpayable\",\"type\":\"function\"},{\"constant\":true,\"inputs\":[{\"name\":\"account\",\"type\":\"address\"}],\"name\":\"balanceOf\",\"outputs\":[{\"name\":\"\",\"type\":\"uint256\"}],\"payable\":false,\"stateMutability\":\"view\",\"type\":\"function\"},{\"constant\":true,\"inputs\":[],\"name\":\"symbol\",\"outputs\":[{\"name\":\"\",\"type\":\"string\"}],\"payable\":false,\"stateMutability\":\"view\",\"type\":\"function\"},{\"constant\":false,\"inputs\":[{\"name\":\"spender\",\"type\":\"address\"},{\"name\":\"subtractedValue\",\"type\":\"uint256\"}],\"name\":\"decreaseAllowance\",\"outputs\":[{\"name\":\"\",\"type\":\"bool\"}],\"payable\":false,\"stateMutability\":\"nonpayable\",\"type\":\"function\"},{\"constant\":false,\"inputs\":[{\"name\":\"recipient\",\"type\":\"address\"},{\"name\":\"amount\",\"type\":\"uint256\"}],\"name\":\"transfer\",\"outputs\":[{\"name\":\"\",\"type\":\"bool\"}],\"payable\":false,\"stateMutability\":\"nonpayable\",\"type\":\"function\"},{\"constant\":true,\"inputs\":[{\"name\":\"owner\",\"type\":\"address\"},{\"name\":\"spender\",\"type\":\"address\"}],\"name\":\"allowance\",\"outputs\":[{\"name\":\"\",\"type\":\"uint256\"}],\"payable\":false,\"stateMutability\":\"view\",\"type\":\"function\"},{\"inputs\":[{\"name\":\"account\",\"type\":\"address\"},{\"name\":\"amount\",\"type\":\"uint256\"}],\"payable\":false,\"stateMutability\":\"nonpayable\",\"type\":\"constructor\"},{\"anonymous\":false,\"inputs\":[{\"indexed\":true,\"name\":\"from\",\"type\":\"address\"},{\"indexed\":true,\"name\":\"to\",\"type\":\"address\"},{\"indexed\":false,\"name\":\"value\",\"type\":\"uint256\"}],\"name\":\"Transfer\",\"type\":\"event\"},{\"anonymous\":false,\"inputs\":[{\"indexed\":true,\"name\":\"owner\",\"type\":\"address\"},{\"indexed\":true,\"name\":\"spender\",\"type\":\"address\"},{\"indexed\":false,\"name\":\"value\",\"type\":\"uint256\"}],\"name\":\"Approval\",\"type\":\"event\"}],\"devdoc\":{\"methods\":{\"allowance(address,address)\":{\"details\":\"See {IERC20-allowance}.\"},\"approve(address,uint256)\":{\"details\":\"See {IERC20-approve}.     * Requirements:     * - `spender` cannot be the zero address.\"},\"balanceOf(address)\":{\"details\":\"See {IERC20-balanceOf}.\"},\"decimals()\":{\"details\":\"Returns the number of decimals used to get its user representation. For example, if `decimals` equals `2`, a balance of `505` tokens should be displayed to a user as `5,05` (`505 / 10 ** 2`).     * Tokens usually opt for a value of 18, imitating the relationship between Ether and Wei.     * NOTE: This information is only used for _display_ purposes: it in no way affects any of the arithmetic of the contract, including {IERC20-balanceOf} and {IERC20-transfer}.\"},\"decreaseAllowance(address,uint256)\":{\"details\":\"Atomically decreases the allowance granted to `spender` by the caller.     * This is an alternative to {approve} that can be used as a mitigation for problems described in {IERC20-approve}.     * Emits an {Approval} event indicating the updated allowance.     * Requirements:     * - `spender` cannot be the zero address. - `spender` must have allowance for the caller of at least `subtractedValue`.\"},\"increaseAllowance(address,uint256)\":{\"details\":\"Atomically increases the allowance granted to `spender` by the caller.     * This is an alternative to {approve} that can be used as a mitigation for problems described in {IERC20-approve}.     * Emits an {Approval} event indicating the updated allowance.     * Requirements:     * - `spender` cannot be the zero address.\"},\"name()\":{\"details\":\"Returns the name of the token.\"},\"symbol()\":{\"details\":\"Returns the symbol of the token, usually a shorter version of the name.\"},\"totalSupply()\":{\"details\":\"See {IERC20-totalSupply}.\"},\"transfer(address,uint256)\":{\"details\":\"See {IERC20-transfer}.     * Requirements:     * - `recipient` cannot be the zero address. - the caller must have a balance of at least `amount`.\"},\"transferFrom(address,address,uint256)\":{\"details\":\"See {IERC20-transferFrom}.     * Emits an {Approval} event indicating the updated allowance. This is not required by the EIP. See the note at the beginning of {ERC20};     * Requirements: - `sender` and `recipient` cannot be the zero address. - `sender` must have a balance of at least `amount`. - the caller must have allowance for `sender`'s tokens of at least `amount`.\"}}},\"userdoc\":{\"methods\":{}}},\"settings\":{\"compilationTarget\":{\"/C/lib/10DEV/ethwaterloo-contract-account-metamask-plugin/truffle/contracts/USDC.sol\":\"USDC\"},\"evmVersion\":\"petersburg\",\"libraries\":{},\"optimizer\":{\"enabled\":false,\"runs\":200},\"remappings\":[]},\"sources\":{\"/C/lib/10DEV/ethwaterloo-contract-account-metamask-plugin/truffle/contracts/USDC.sol\":{\"keccak256\":\"0x8d3243efa5b031bd6e3a8c8bdeff6d8afc890dabaa6fe2b28de1ec0e870715cb\",\"urls\":[\"bzzr://ffddfa12ebe4fb193342b03e1fa555e49a39c0cd1c4046b55143adf136bfed79\"]},\"@openzeppelin/contracts/GSN/Context.sol\":{\"keccak256\":\"0x90a3995645af7562d84b9d69363ffa5ae7217714ab61e951bf7bc450f40e4061\",\"urls\":[\"bzzr://51482c01bddf23793bddee43b60ab9578a62948a4f2082def24ea792a553b055\"]},\"@openzeppelin/contracts/math/SafeMath.sol\":{\"keccak256\":\"0x640b6dee7a4b830bdfd52b5031a07fc2b12209f5b2e29e5d364a7d37f69d8076\",\"urls\":[\"bzzr://292843005e754e752644f767477ec5ad7a1ffc91ddb18c38b8079c62f3993cad\"]},\"@openzeppelin/contracts/token/ERC20/ERC20.sol\":{\"keccak256\":\"0x65a4078c03875c25413a068ce9cfdd7e68a90f8786612d1189c89341e6e3b802\",\"urls\":[\"bzzr://fefcc5ec4e313a66c9fd38375983b5973c528e7e19b6d37c2f1ac6745295e6e2\"]},\"@openzeppelin/contracts/token/ERC20/ERC20Detailed.sol\":{\"keccak256\":\"0x4a3a810b7ebe742e897e1fd428b3eeed2196d3acea58eaf9c566ed10d545d2ed\",\"urls\":[\"bzzr://729aefb3f89f616c954a0735f8b4dd8804bdd0351e96f8e904fdb3e78a109b6c\"]},\"@openzeppelin/contracts/token/ERC20/IERC20.sol\":{\"keccak256\":\"0xe5bb0f57cff3e299f360052ba50f1ea0fff046df2be070b6943e0e3c3fdad8a9\",\"urls\":[\"bzzr://cf2d583b8dce38d0617fdcd65f2fd9f126fe17b7f683b5a515ea9d2762d8b062\"]}},\"version\":1}",
  "bytecode": "0x60806040523480156200001157600080fd5b5060405160408062001751833981018060405260408110156200003357600080fd5b8101908080519060200190929190805190602001909291905050506040518060400160405280600881526020017f55534420436f696e0000000000000000000000000000000000000000000000008152506040518060400160405280600481526020017f555344430000000000000000000000000000000000000000000000000000000081525060128260039080519060200190620000d492919062000379565b508160049080519060200190620000ed92919062000379565b5080600560006101000a81548160ff021916908360ff1602179055505050506200011e82826200012660201b60201c565b505062000428565b600073ffffffffffffffffffffffffffffffffffffffff168273ffffffffffffffffffffffffffffffffffffffff161415620001ca576040517f08c379a000000000000000000000000000000000000000000000000000000000815260040180806020018281038252601f8152602001807f45524332303a206d696e7420746f20746865207a65726f20616464726573730081525060200191505060405180910390fd5b620001e681600254620002f060201b62000fa91790919060201c565b60028190555062000244816000808573ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002054620002f060201b62000fa91790919060201c565b6000808473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff168152602001908152602001600020819055508173ffffffffffffffffffffffffffffffffffffffff16600073ffffffffffffffffffffffffffffffffffffffff167fddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef836040518082815260200191505060405180910390a35050565b6000808284019050838110156200036f576040517f08c379a000000000000000000000000000000000000000000000000000000000815260040180806020018281038252601b8152602001807f536166654d6174683a206164646974696f6e206f766572666c6f77000000000081525060200191505060405180910390fd5b8091505092915050565b828054600181600116156101000203166002900490600052602060002090601f016020900481019282601f10620003bc57805160ff1916838001178555620003ed565b82800160010185558215620003ed579182015b82811115620003ec578251825591602001919060010190620003cf565b5b509050620003fc919062000400565b5090565b6200042591905b808211156200042157600081600090555060010162000407565b5090565b90565b61131980620004386000396000f3fe608060405234801561001057600080fd5b50600436106100b45760003560e01c806340c10f191161007157806340c10f19146102d057806370a082311461033657806395d89b411461038e578063a457c2d714610411578063a9059cbb14610477578063dd62ed3e146104dd576100b4565b806306fdde03146100b9578063095ea7b31461013c57806318160ddd146101a257806323b872dd146101c0578063313ce56714610246578063395093511461026a575b600080fd5b6100c1610555565b6040518080602001828103825283818151815260200191508051906020019080838360005b838110156101015780820151818401526020810190506100e6565b50505050905090810190601f16801561012e5780820380516001836020036101000a031916815260200191505b509250505060405180910390f35b6101886004803603604081101561015257600080fd5b81019080803573ffffffffffffffffffffffffffffffffffffffff169060200190929190803590602001909291905050506105f7565b604051808215151515815260200191505060405180910390f35b6101aa610615565b6040518082815260200191505060405180910390f35b61022c600480360360608110156101d657600080fd5b81019080803573ffffffffffffffffffffffffffffffffffffffff169060200190929190803573ffffffffffffffffffffffffffffffffffffffff1690602001909291908035906020019092919050505061061f565b604051808215151515815260200191505060405180910390f35b61024e6106f8565b604051808260ff1660ff16815260200191505060405180910390f35b6102b66004803603604081101561028057600080fd5b81019080803573ffffffffffffffffffffffffffffffffffffffff1690602001909291908035906020019092919050505061070f565b604051808215151515815260200191505060405180910390f35b61031c600480360360408110156102e657600080fd5b81019080803573ffffffffffffffffffffffffffffffffffffffff169060200190929190803590602001909291905050506107c2565b604051808215151515815260200191505060405180910390f35b6103786004803603602081101561034c57600080fd5b81019080803573ffffffffffffffffffffffffffffffffffffffff1690602001909291905050506107d8565b6040518082815260200191505060405180910390f35b610396610820565b6040518080602001828103825283818151815260200191508051906020019080838360005b838110156103d65780820151818401526020810190506103bb565b50505050905090810190601f1680156104035780820380516001836020036101000a031916815260200191505b509250505060405180910390f35b61045d6004803603604081101561042757600080fd5b81019080803573ffffffffffffffffffffffffffffffffffffffff169060200190929190803590602001909291905050506108c2565b604051808215151515815260200191505060405180910390f35b6104c36004803603604081101561048d57600080fd5b81019080803573ffffffffffffffffffffffffffffffffffffffff1690602001909291908035906020019092919050505061098f565b604051808215151515815260200191505060405180910390f35b61053f600480360360408110156104f357600080fd5b81019080803573ffffffffffffffffffffffffffffffffffffffff169060200190929190803573ffffffffffffffffffffffffffffffffffffffff1690602001909291905050506109ad565b6040518082815260200191505060405180910390f35b606060038054600181600116156101000203166002900480601f0160208091040260200160405190810160405280929190818152602001828054600181600116156101000203166002900480156105ed5780601f106105c2576101008083540402835291602001916105ed565b820191906000526020600020905b8154815290600101906020018083116105d057829003601f168201915b5050505050905090565b600061060b610604610a34565b8484610a3c565b6001905092915050565b6000600254905090565b600061062c848484610c33565b6106ed84610638610a34565b6106e88560405180606001604052806028815260200161125860289139600160008b73ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff168152602001908152602001600020600061069e610a34565b73ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002054610ee99092919063ffffffff16565b610a3c565b600190509392505050565b6000600560009054906101000a900460ff16905090565b60006107b861071c610a34565b846107b3856001600061072d610a34565b73ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002060008973ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002054610fa990919063ffffffff16565b610a3c565b6001905092915050565b60006107ce8383611031565b6001905092915050565b60008060008373ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff168152602001908152602001600020549050919050565b606060048054600181600116156101000203166002900480601f0160208091040260200160405190810160405280929190818152602001828054600181600116156101000203166002900480156108b85780601f1061088d576101008083540402835291602001916108b8565b820191906000526020600020905b81548152906001019060200180831161089b57829003601f168201915b5050505050905090565b60006109856108cf610a34565b84610980856040518060600160405280602581526020016112c960259139600160006108f9610a34565b73ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002060008a73ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002054610ee99092919063ffffffff16565b610a3c565b6001905092915050565b60006109a361099c610a34565b8484610c33565b6001905092915050565b6000600160008473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002060008373ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002054905092915050565b600033905090565b600073ffffffffffffffffffffffffffffffffffffffff168373ffffffffffffffffffffffffffffffffffffffff161415610ac2576040517f08c379a00000000000000000000000000000000000000000000000000000000081526004018080602001828103825260248152602001806112a56024913960400191505060405180910390fd5b600073ffffffffffffffffffffffffffffffffffffffff168273ffffffffffffffffffffffffffffffffffffffff161415610b48576040517f08c379a00000000000000000000000000000000000000000000000000000000081526004018080602001828103825260228152602001806112106022913960400191505060405180910390fd5b80600160008573ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002060008473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff168152602001908152602001600020819055508173ffffffffffffffffffffffffffffffffffffffff168373ffffffffffffffffffffffffffffffffffffffff167f8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925836040518082815260200191505060405180910390a3505050565b600073ffffffffffffffffffffffffffffffffffffffff168373ffffffffffffffffffffffffffffffffffffffff161415610cb9576040517f08c379a00000000000000000000000000000000000000000000000000000000081526004018080602001828103825260258152602001806112806025913960400191505060405180910390fd5b600073ffffffffffffffffffffffffffffffffffffffff168273ffffffffffffffffffffffffffffffffffffffff161415610d3f576040517f08c379a00000000000000000000000000000000000000000000000000000000081526004018080602001828103825260238152602001806111ed6023913960400191505060405180910390fd5b610daa81604051806060016040528060268152602001611232602691396000808773ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002054610ee99092919063ffffffff16565b6000808573ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002081905550610e3d816000808573ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002054610fa990919063ffffffff16565b6000808473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff168152602001908152602001600020819055508173ffffffffffffffffffffffffffffffffffffffff168373ffffffffffffffffffffffffffffffffffffffff167fddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef836040518082815260200191505060405180910390a3505050565b6000838311158290610f96576040517f08c379a00000000000000000000000000000000000000000000000000000000081526004018080602001828103825283818151815260200191508051906020019080838360005b83811015610f5b578082015181840152602081019050610f40565b50505050905090810190601f168015610f885780820380516001836020036101000a031916815260200191505b509250505060405180910390fd5b5060008385039050809150509392505050565b600080828401905083811015611027576040517f08c379a000000000000000000000000000000000000000000000000000000000815260040180806020018281038252601b8152602001807f536166654d6174683a206164646974696f6e206f766572666c6f77000000000081525060200191505060405180910390fd5b8091505092915050565b600073ffffffffffffffffffffffffffffffffffffffff168273ffffffffffffffffffffffffffffffffffffffff1614156110d4576040517f08c379a000000000000000000000000000000000000000000000000000000000815260040180806020018281038252601f8152602001807f45524332303a206d696e7420746f20746865207a65726f20616464726573730081525060200191505060405180910390fd5b6110e981600254610fa990919063ffffffff16565b600281905550611140816000808573ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002054610fa990919063ffffffff16565b6000808473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff168152602001908152602001600020819055508173ffffffffffffffffffffffffffffffffffffffff16600073ffffffffffffffffffffffffffffffffffffffff167fddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef836040518082815260200191505060405180910390a3505056fe45524332303a207472616e7366657220746f20746865207a65726f206164647265737345524332303a20617070726f766520746f20746865207a65726f206164647265737345524332303a207472616e7366657220616d6f756e7420657863656564732062616c616e636545524332303a207472616e7366657220616d6f756e74206578636565647320616c6c6f77616e636545524332303a207472616e736665722066726f6d20746865207a65726f206164647265737345524332303a20617070726f76652066726f6d20746865207a65726f206164647265737345524332303a2064656372656173656420616c6c6f77616e63652062656c6f77207a65726fa165627a7a72305820a08971d067d3a562c37034bf3d38b6ae9d6144a8b7e25a66bd35d4e5aa4ba59c0029",
  "deployedBytecode": "0x608060405234801561001057600080fd5b50600436106100b45760003560e01c806340c10f191161007157806340c10f19146102d057806370a082311461033657806395d89b411461038e578063a457c2d714610411578063a9059cbb14610477578063dd62ed3e146104dd576100b4565b806306fdde03146100b9578063095ea7b31461013c57806318160ddd146101a257806323b872dd146101c0578063313ce56714610246578063395093511461026a575b600080fd5b6100c1610555565b6040518080602001828103825283818151815260200191508051906020019080838360005b838110156101015780820151818401526020810190506100e6565b50505050905090810190601f16801561012e5780820380516001836020036101000a031916815260200191505b509250505060405180910390f35b6101886004803603604081101561015257600080fd5b81019080803573ffffffffffffffffffffffffffffffffffffffff169060200190929190803590602001909291905050506105f7565b604051808215151515815260200191505060405180910390f35b6101aa610615565b6040518082815260200191505060405180910390f35b61022c600480360360608110156101d657600080fd5b81019080803573ffffffffffffffffffffffffffffffffffffffff169060200190929190803573ffffffffffffffffffffffffffffffffffffffff1690602001909291908035906020019092919050505061061f565b604051808215151515815260200191505060405180910390f35b61024e6106f8565b604051808260ff1660ff16815260200191505060405180910390f35b6102b66004803603604081101561028057600080fd5b81019080803573ffffffffffffffffffffffffffffffffffffffff1690602001909291908035906020019092919050505061070f565b604051808215151515815260200191505060405180910390f35b61031c600480360360408110156102e657600080fd5b81019080803573ffffffffffffffffffffffffffffffffffffffff169060200190929190803590602001909291905050506107c2565b604051808215151515815260200191505060405180910390f35b6103786004803603602081101561034c57600080fd5b81019080803573ffffffffffffffffffffffffffffffffffffffff1690602001909291905050506107d8565b6040518082815260200191505060405180910390f35b610396610820565b6040518080602001828103825283818151815260200191508051906020019080838360005b838110156103d65780820151818401526020810190506103bb565b50505050905090810190601f1680156104035780820380516001836020036101000a031916815260200191505b509250505060405180910390f35b61045d6004803603604081101561042757600080fd5b81019080803573ffffffffffffffffffffffffffffffffffffffff169060200190929190803590602001909291905050506108c2565b604051808215151515815260200191505060405180910390f35b6104c36004803603604081101561048d57600080fd5b81019080803573ffffffffffffffffffffffffffffffffffffffff1690602001909291908035906020019092919050505061098f565b604051808215151515815260200191505060405180910390f35b61053f600480360360408110156104f357600080fd5b81019080803573ffffffffffffffffffffffffffffffffffffffff169060200190929190803573ffffffffffffffffffffffffffffffffffffffff1690602001909291905050506109ad565b6040518082815260200191505060405180910390f35b606060038054600181600116156101000203166002900480601f0160208091040260200160405190810160405280929190818152602001828054600181600116156101000203166002900480156105ed5780601f106105c2576101008083540402835291602001916105ed565b820191906000526020600020905b8154815290600101906020018083116105d057829003601f168201915b5050505050905090565b600061060b610604610a34565b8484610a3c565b6001905092915050565b6000600254905090565b600061062c848484610c33565b6106ed84610638610a34565b6106e88560405180606001604052806028815260200161125860289139600160008b73ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff168152602001908152602001600020600061069e610a34565b73ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002054610ee99092919063ffffffff16565b610a3c565b600190509392505050565b6000600560009054906101000a900460ff16905090565b60006107b861071c610a34565b846107b3856001600061072d610a34565b73ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002060008973ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002054610fa990919063ffffffff16565b610a3c565b6001905092915050565b60006107ce8383611031565b6001905092915050565b60008060008373ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff168152602001908152602001600020549050919050565b606060048054600181600116156101000203166002900480601f0160208091040260200160405190810160405280929190818152602001828054600181600116156101000203166002900480156108b85780601f1061088d576101008083540402835291602001916108b8565b820191906000526020600020905b81548152906001019060200180831161089b57829003601f168201915b5050505050905090565b60006109856108cf610a34565b84610980856040518060600160405280602581526020016112c960259139600160006108f9610a34565b73ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002060008a73ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002054610ee99092919063ffffffff16565b610a3c565b6001905092915050565b60006109a361099c610a34565b8484610c33565b6001905092915050565b6000600160008473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002060008373ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002054905092915050565b600033905090565b600073ffffffffffffffffffffffffffffffffffffffff168373ffffffffffffffffffffffffffffffffffffffff161415610ac2576040517f08c379a00000000000000000000000000000000000000000000000000000000081526004018080602001828103825260248152602001806112a56024913960400191505060405180910390fd5b600073ffffffffffffffffffffffffffffffffffffffff168273ffffffffffffffffffffffffffffffffffffffff161415610b48576040517f08c379a00000000000000000000000000000000000000000000000000000000081526004018080602001828103825260228152602001806112106022913960400191505060405180910390fd5b80600160008573ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002060008473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff168152602001908152602001600020819055508173ffffffffffffffffffffffffffffffffffffffff168373ffffffffffffffffffffffffffffffffffffffff167f8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925836040518082815260200191505060405180910390a3505050565b600073ffffffffffffffffffffffffffffffffffffffff168373ffffffffffffffffffffffffffffffffffffffff161415610cb9576040517f08c379a00000000000000000000000000000000000000000000000000000000081526004018080602001828103825260258152602001806112806025913960400191505060405180910390fd5b600073ffffffffffffffffffffffffffffffffffffffff168273ffffffffffffffffffffffffffffffffffffffff161415610d3f576040517f08c379a00000000000000000000000000000000000000000000000000000000081526004018080602001828103825260238152602001806111ed6023913960400191505060405180910390fd5b610daa81604051806060016040528060268152602001611232602691396000808773ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002054610ee99092919063ffffffff16565b6000808573ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002081905550610e3d816000808573ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002054610fa990919063ffffffff16565b6000808473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff168152602001908152602001600020819055508173ffffffffffffffffffffffffffffffffffffffff168373ffffffffffffffffffffffffffffffffffffffff167fddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef836040518082815260200191505060405180910390a3505050565b6000838311158290610f96576040517f08c379a00000000000000000000000000000000000000000000000000000000081526004018080602001828103825283818151815260200191508051906020019080838360005b83811015610f5b578082015181840152602081019050610f40565b50505050905090810190601f168015610f885780820380516001836020036101000a031916815260200191505b509250505060405180910390fd5b5060008385039050809150509392505050565b600080828401905083811015611027576040517f08c379a000000000000000000000000000000000000000000000000000000000815260040180806020018281038252601b8152602001807f536166654d6174683a206164646974696f6e206f766572666c6f77000000000081525060200191505060405180910390fd5b8091505092915050565b600073ffffffffffffffffffffffffffffffffffffffff168273ffffffffffffffffffffffffffffffffffffffff1614156110d4576040517f08c379a000000000000000000000000000000000000000000000000000000000815260040180806020018281038252601f8152602001807f45524332303a206d696e7420746f20746865207a65726f20616464726573730081525060200191505060405180910390fd5b6110e981600254610fa990919063ffffffff16565b600281905550611140816000808573ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002054610fa990919063ffffffff16565b6000808473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff168152602001908152602001600020819055508173ffffffffffffffffffffffffffffffffffffffff16600073ffffffffffffffffffffffffffffffffffffffff167fddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef836040518082815260200191505060405180910390a3505056fe45524332303a207472616e7366657220746f20746865207a65726f206164647265737345524332303a20617070726f766520746f20746865207a65726f206164647265737345524332303a207472616e7366657220616d6f756e7420657863656564732062616c616e636545524332303a207472616e7366657220616d6f756e74206578636565647320616c6c6f77616e636545524332303a207472616e736665722066726f6d20746865207a65726f206164647265737345524332303a20617070726f76652066726f6d20746865207a65726f206164647265737345524332303a2064656372656173656420616c6c6f77616e63652062656c6f77207a65726fa165627a7a72305820a08971d067d3a562c37034bf3d38b6ae9d6144a8b7e25a66bd35d4e5aa4ba59c0029",
  "sourceMap": "159:303:3:-;;;228:93;8:9:-1;5:2;;;30:1;27;20:12;5:2;228:93:3;;;;;;;;;;;;;13:2:-1;8:3;5:11;2:2;;;29:1;26;19:12;2:2;228:93:3;;;;;;;;;;;;;;;;;;;;;;;;;416:163:8;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;217:2:3;512:4:8;504:5;:12;;;;;;;;;;;;:::i;:::-;;536:6;526:7;:16;;;;;;;;;;;;:::i;:::-;;564:8;552:9;;:20;;;;;;;;;;;;;;;;;;416:163;;;291:22:3;297:7;306:6;291:5;;;:22;;:::i;:::-;228:93;;159:303;;5962:302:7;6056:1;6037:21;;:7;:21;;;;6029:65;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;6120:24;6137:6;6120:12;;:16;;;;;;:24;;;;:::i;:::-;6105:12;:39;;;;6175:30;6198:6;6175:9;:18;6185:7;6175:18;;;;;;;;;;;;;;;;:22;;;;;;:30;;;;:::i;:::-;6154:9;:18;6164:7;6154:18;;;;;;;;;;;;;;;:51;;;;6241:7;6220:37;;6237:1;6220:37;;;6250:6;6220:37;;;;;;;;;;;;;;;;;;5962:302;;:::o;834:176:5:-;892:7;911:9;927:1;923;:5;911:17;;951:1;946;:6;;938:46;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;1002:1;995:8;;;834:176;;;;:::o;159:303:3:-;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;:::i;:::-;;;:::o;:::-;;;;;;;;;;;;;;;;;;;;;;;;;;;:::o;:::-;;;;;;;",
  "deployedSourceMap": "159:303:3:-;;;;8:9:-1;5:2;;;30:1;27;20:12;5:2;159:303:3;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;644:81:8;;;:::i;:::-;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;23:1:-1;8:100;33:3;30:1;27:10;8:100;;;99:1;94:3;90:11;84:18;80:1;75:3;71:11;64:39;52:2;49:1;45:10;40:15;;8:100;;;12:14;644:81:8;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;2500:149:7;;;;;;13:2:-1;8:3;5:11;2:2;;;29:1;26;19:12;2:2;2500:149:7;;;;;;;;;;;;;;;;;;;;;;;;;;;;:::i;:::-;;;;;;;;;;;;;;;;;;;;;;;1559:89;;;:::i;:::-;;;;;;;;;;;;;;;;;;;3107:300;;;;;;13:2:-1;8:3;5:11;2:2;;;29:1;26;19:12;2:2;3107:300:7;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;:::i;:::-;;;;;;;;;;;;;;;;;;;;;;;1472:81:8;;;:::i;:::-;;;;;;;;;;;;;;;;;;;;;;;3802:207:7;;;;;;13:2:-1;8:3;5:11;2:2;;;29:1;26;19:12;2:2;3802:207:7;;;;;;;;;;;;;;;;;;;;;;;;;;;;:::i;:::-;;;;;;;;;;;;;;;;;;;;;;;327:132:3;;;;;;13:2:-1;8:3;5:11;2:2;;;29:1;26;19:12;2:2;327:132:3;;;;;;;;;;;;;;;;;;;;;;;;;;;;:::i;:::-;;;;;;;;;;;;;;;;;;;;;;;1706:108:7;;;;;;13:2:-1;8:3;5:11;2:2;;;29:1;26;19:12;2:2;1706:108:7;;;;;;;;;;;;;;;;;;;:::i;:::-;;;;;;;;;;;;;;;;;;;838:85:8;;;:::i;:::-;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;23:1:-1;8:100;33:3;30:1;27:10;8:100;;;99:1;94:3;90:11;84:18;80:1;75:3;71:11;64:39;52:2;49:1;45:10;40:15;;8:100;;;12:14;838:85:8;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;4496:258:7;;;;;;13:2:-1;8:3;5:11;2:2;;;29:1;26;19:12;2:2;4496:258:7;;;;;;;;;;;;;;;;;;;;;;;;;;;;:::i;:::-;;;;;;;;;;;;;;;;;;;;;;;2017:155;;;;;;13:2:-1;8:3;5:11;2:2;;;29:1;26;19:12;2:2;2017:155:7;;;;;;;;;;;;;;;;;;;;;;;;;;;;:::i;:::-;;;;;;;;;;;;;;;;;;;;;;;2230:132;;;;;;13:2:-1;8:3;5:11;2:2;;;29:1;26;19:12;2:2;2230:132:7;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;:::i;:::-;;;;;;;;;;;;;;;;;;;644:81:8;681:13;713:5;706:12;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;644:81;:::o;2500:149:7:-;2566:4;2582:39;2591:12;:10;:12::i;:::-;2605:7;2614:6;2582:8;:39::i;:::-;2638:4;2631:11;;2500:149;;;;:::o;1559:89::-;1603:7;1629:12;;1622:19;;1559:89;:::o;3107:300::-;3196:4;3212:36;3222:6;3230:9;3241:6;3212:9;:36::i;:::-;3258:121;3267:6;3275:12;:10;:12::i;:::-;3289:89;3327:6;3289:89;;;;;;;;;;;;;;;;;:11;:19;3301:6;3289:19;;;;;;;;;;;;;;;:33;3309:12;:10;:12::i;:::-;3289:33;;;;;;;;;;;;;;;;:37;;:89;;;;;:::i;:::-;3258:8;:121::i;:::-;3396:4;3389:11;;3107:300;;;;;:::o;1472:81:8:-;1513:5;1537:9;;;;;;;;;;;1530:16;;1472:81;:::o;3802:207:7:-;3882:4;3898:83;3907:12;:10;:12::i;:::-;3921:7;3930:50;3969:10;3930:11;:25;3942:12;:10;:12::i;:::-;3930:25;;;;;;;;;;;;;;;:34;3956:7;3930:34;;;;;;;;;;;;;;;;:38;;:50;;;;:::i;:::-;3898:8;:83::i;:::-;3998:4;3991:11;;3802:207;;;;:::o;327:132:3:-;390:4;407:22;413:7;422:6;407:5;:22::i;:::-;447:4;440:11;;327:132;;;;:::o;1706:108:7:-;1763:7;1789:9;:18;1799:7;1789:18;;;;;;;;;;;;;;;;1782:25;;1706:108;;;:::o;838:85:8:-;877:13;909:7;902:14;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;838:85;:::o;4496:258:7:-;4581:4;4597:129;4606:12;:10;:12::i;:::-;4620:7;4629:96;4668:15;4629:96;;;;;;;;;;;;;;;;;:11;:25;4641:12;:10;:12::i;:::-;4629:25;;;;;;;;;;;;;;;:34;4655:7;4629:34;;;;;;;;;;;;;;;;:38;;:96;;;;;:::i;:::-;4597:8;:129::i;:::-;4743:4;4736:11;;4496:258;;;;:::o;2017:155::-;2086:4;2102:42;2112:12;:10;:12::i;:::-;2126:9;2137:6;2102:9;:42::i;:::-;2161:4;2154:11;;2017:155;;;;:::o;2230:132::-;2302:7;2328:11;:18;2340:5;2328:18;;;;;;;;;;;;;;;:27;2347:7;2328:27;;;;;;;;;;;;;;;;2321:34;;2230:132;;;;:::o;788:96:4:-;833:15;867:10;860:17;;788:96;:::o;7351:332:7:-;7461:1;7444:19;;:5;:19;;;;7436:68;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;7541:1;7522:21;;:7;:21;;;;7514:68;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;7623:6;7593:11;:18;7605:5;7593:18;;;;;;;;;;;;;;;:27;7612:7;7593:27;;;;;;;;;;;;;;;:36;;;;7660:7;7644:32;;7653:5;7644:32;;;7669:6;7644:32;;;;;;;;;;;;;;;;;;7351:332;;;:::o;5228:464::-;5343:1;5325:20;;:6;:20;;;;5317:70;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;5426:1;5405:23;;:9;:23;;;;5397:71;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;5499;5521:6;5499:71;;;;;;;;;;;;;;;;;:9;:17;5509:6;5499:17;;;;;;;;;;;;;;;;:21;;:71;;;;;:::i;:::-;5479:9;:17;5489:6;5479:17;;;;;;;;;;;;;;;:91;;;;5603:32;5628:6;5603:9;:20;5613:9;5603:20;;;;;;;;;;;;;;;;:24;;:32;;;;:::i;:::-;5580:9;:20;5590:9;5580:20;;;;;;;;;;;;;;;:55;;;;5667:9;5650:35;;5659:6;5650:35;;;5678:6;5650:35;;;;;;;;;;;;;;;;;;5228:464;;;:::o;1732:187:5:-;1818:7;1850:1;1845;:6;;1853:12;1837:29;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;23:1:-1;8:100;33:3;30:1;27:10;8:100;;;99:1;94:3;90:11;84:18;80:1;75:3;71:11;64:39;52:2;49:1;45:10;40:15;;8:100;;;12:14;1837:29:5;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;1876:9;1892:1;1888;:5;1876:17;;1911:1;1904:8;;;1732:187;;;;;:::o;834:176::-;892:7;911:9;927:1;923;:5;911:17;;951:1;946;:6;;938:46;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;1002:1;995:8;;;834:176;;;;:::o;5962:302:7:-;6056:1;6037:21;;:7;:21;;;;6029:65;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;6120:24;6137:6;6120:12;;:16;;:24;;;;:::i;:::-;6105:12;:39;;;;6175:30;6198:6;6175:9;:18;6185:7;6175:18;;;;;;;;;;;;;;;;:22;;:30;;;;:::i;:::-;6154:9;:18;6164:7;6154:18;;;;;;;;;;;;;;;:51;;;;6241:7;6220:37;;6237:1;6220:37;;;6250:6;6220:37;;;;;;;;;;;;;;;;;;5962:302;;:::o",
  "source": "pragma solidity >=0.5.0 <0.6.0;\r\n\r\nimport \"@openzeppelin/contracts/token/ERC20/ERC20.sol\";\r\nimport \"@openzeppelin/contracts/token/ERC20/ERC20Detailed.sol\";\r\n\r\ncontract USDC is ERC20, ERC20Detailed(\"USD Coin\", \"USDC\", 18) {\r\n    constructor(address account, uint256 amount) public {\r\n        _mint(account, amount);\r\n    }\r\n    function mint(address account, uint256 amount) public returns (bool) {\r\n        _mint(account, amount);\r\n        return true;\r\n    }\r\n}",
  "sourcePath": "C:/lib/10DEV/ethwaterloo-contract-account-metamask-plugin/truffle/contracts/USDC.sol",
  "ast": {
    "absolutePath": "/C/lib/10DEV/ethwaterloo-contract-account-metamask-plugin/truffle/contracts/USDC.sol",
    "exportedSymbols": {
      "USDC": [
        435
      ]
    },
    "id": 436,
    "nodeType": "SourceUnit",
    "nodes": [
      {
        "id": 395,
        "literals": [
          "solidity",
          ">=",
          "0.5",
          ".0",
          "<",
          "0.6",
          ".0"
        ],
        "nodeType": "PragmaDirective",
        "src": "0:31:3"
      },
      {
        "absolutePath": "@openzeppelin/contracts/token/ERC20/ERC20.sol",
        "file": "@openzeppelin/contracts/token/ERC20/ERC20.sol",
        "id": 396,
        "nodeType": "ImportDirective",
        "scope": 436,
        "sourceUnit": 1169,
        "src": "35:55:3",
        "symbolAliases": [],
        "unitAlias": ""
      },
      {
        "absolutePath": "@openzeppelin/contracts/token/ERC20/ERC20Detailed.sol",
        "file": "@openzeppelin/contracts/token/ERC20/ERC20Detailed.sol",
        "id": 397,
        "nodeType": "ImportDirective",
        "scope": 436,
        "sourceUnit": 1227,
        "src": "92:63:3",
        "symbolAliases": [],
        "unitAlias": ""
      },
      {
        "baseContracts": [
          {
            "arguments": null,
            "baseName": {
              "contractScope": null,
              "id": 398,
              "name": "ERC20",
              "nodeType": "UserDefinedTypeName",
              "referencedDeclaration": 1168,
              "src": "176:5:3",
              "typeDescriptions": {
                "typeIdentifier": "t_contract$_ERC20_$1168",
                "typeString": "contract ERC20"
              }
            },
            "id": 399,
            "nodeType": "InheritanceSpecifier",
            "src": "176:5:3"
          },
          {
            "arguments": [
              {
                "argumentTypes": null,
                "hexValue": "55534420436f696e",
                "id": 401,
                "isConstant": false,
                "isLValue": false,
                "isPure": true,
                "kind": "string",
                "lValueRequested": false,
                "nodeType": "Literal",
                "src": "197:10:3",
                "subdenomination": null,
                "typeDescriptions": {
                  "typeIdentifier": "t_stringliteral_52878b207aaddbfc15ea7bebcda681eb8ccd306e2227b61cef68505c8c056341",
                  "typeString": "literal_string \"USD Coin\""
                },
                "value": "USD Coin"
              },
              {
                "argumentTypes": null,
                "hexValue": "55534443",
                "id": 402,
                "isConstant": false,
                "isLValue": false,
                "isPure": true,
                "kind": "string",
                "lValueRequested": false,
                "nodeType": "Literal",
                "src": "209:6:3",
                "subdenomination": null,
                "typeDescriptions": {
                  "typeIdentifier": "t_stringliteral_d6aca1be9729c13d677335161321649cccae6a591554772516700f986f942eaa",
                  "typeString": "literal_string \"USDC\""
                },
                "value": "USDC"
              },
              {
                "argumentTypes": null,
                "hexValue": "3138",
                "id": 403,
                "isConstant": false,
                "isLValue": false,
                "isPure": true,
                "kind": "number",
                "lValueRequested": false,
                "nodeType": "Literal",
                "src": "217:2:3",
                "subdenomination": null,
                "typeDescriptions": {
                  "typeIdentifier": "t_rational_18_by_1",
                  "typeString": "int_const 18"
                },
                "value": "18"
              }
            ],
            "baseName": {
              "contractScope": null,
              "id": 400,
              "name": "ERC20Detailed",
              "nodeType": "UserDefinedTypeName",
              "referencedDeclaration": 1226,
              "src": "183:13:3",
              "typeDescriptions": {
                "typeIdentifier": "t_contract$_ERC20Detailed_$1226",
                "typeString": "contract ERC20Detailed"
              }
            },
            "id": 404,
            "nodeType": "InheritanceSpecifier",
            "src": "183:37:3"
          }
        ],
        "contractDependencies": [
          462,
          1168,
          1226,
          1295
        ],
        "contractKind": "contract",
        "documentation": null,
        "fullyImplemented": true,
        "id": 435,
        "linearizedBaseContracts": [
          435,
          1226,
          1168,
          1295,
          462
        ],
        "name": "USDC",
        "nodeType": "ContractDefinition",
        "nodes": [
          {
            "body": {
              "id": 416,
              "nodeType": "Block",
              "src": "280:41:3",
              "statements": [
                {
                  "expression": {
                    "argumentTypes": null,
                    "arguments": [
                      {
                        "argumentTypes": null,
                        "id": 412,
                        "name": "account",
                        "nodeType": "Identifier",
                        "overloadedDeclarations": [],
                        "referencedDeclaration": 406,
                        "src": "297:7:3",
                        "typeDescriptions": {
                          "typeIdentifier": "t_address",
                          "typeString": "address"
                        }
                      },
                      {
                        "argumentTypes": null,
                        "id": 413,
                        "name": "amount",
                        "nodeType": "Identifier",
                        "overloadedDeclarations": [],
                        "referencedDeclaration": 408,
                        "src": "306:6:3",
                        "typeDescriptions": {
                          "typeIdentifier": "t_uint256",
                          "typeString": "uint256"
                        }
                      }
                    ],
                    "expression": {
                      "argumentTypes": [
                        {
                          "typeIdentifier": "t_address",
                          "typeString": "address"
                        },
                        {
                          "typeIdentifier": "t_uint256",
                          "typeString": "uint256"
                        }
                      ],
                      "id": 411,
                      "name": "_mint",
                      "nodeType": "Identifier",
                      "overloadedDeclarations": [],
                      "referencedDeclaration": 1052,
                      "src": "291:5:3",
                      "typeDescriptions": {
                        "typeIdentifier": "t_function_internal_nonpayable$_t_address_$_t_uint256_$returns$__$",
                        "typeString": "function (address,uint256)"
                      }
                    },
                    "id": 414,
                    "isConstant": false,
                    "isLValue": false,
                    "isPure": false,
                    "kind": "functionCall",
                    "lValueRequested": false,
                    "names": [],
                    "nodeType": "FunctionCall",
                    "src": "291:22:3",
                    "typeDescriptions": {
                      "typeIdentifier": "t_tuple$__$",
                      "typeString": "tuple()"
                    }
                  },
                  "id": 415,
                  "nodeType": "ExpressionStatement",
                  "src": "291:22:3"
                }
              ]
            },
            "documentation": null,
            "id": 417,
            "implemented": true,
            "kind": "constructor",
            "modifiers": [],
            "name": "",
            "nodeType": "FunctionDefinition",
            "parameters": {
              "id": 409,
              "nodeType": "ParameterList",
              "parameters": [
                {
                  "constant": false,
                  "id": 406,
                  "name": "account",
                  "nodeType": "VariableDeclaration",
                  "scope": 417,
                  "src": "240:15:3",
                  "stateVariable": false,
                  "storageLocation": "default",
                  "typeDescriptions": {
                    "typeIdentifier": "t_address",
                    "typeString": "address"
                  },
                  "typeName": {
                    "id": 405,
                    "name": "address",
                    "nodeType": "ElementaryTypeName",
                    "src": "240:7:3",
                    "stateMutability": "nonpayable",
                    "typeDescriptions": {
                      "typeIdentifier": "t_address",
                      "typeString": "address"
                    }
                  },
                  "value": null,
                  "visibility": "internal"
                },
                {
                  "constant": false,
                  "id": 408,
                  "name": "amount",
                  "nodeType": "VariableDeclaration",
                  "scope": 417,
                  "src": "257:14:3",
                  "stateVariable": false,
                  "storageLocation": "default",
                  "typeDescriptions": {
                    "typeIdentifier": "t_uint256",
                    "typeString": "uint256"
                  },
                  "typeName": {
                    "id": 407,
                    "name": "uint256",
                    "nodeType": "ElementaryTypeName",
                    "src": "257:7:3",
                    "typeDescriptions": {
                      "typeIdentifier": "t_uint256",
                      "typeString": "uint256"
                    }
                  },
                  "value": null,
                  "visibility": "internal"
                }
              ],
              "src": "239:33:3"
            },
            "returnParameters": {
              "id": 410,
              "nodeType": "ParameterList",
              "parameters": [],
              "src": "280:0:3"
            },
            "scope": 435,
            "src": "228:93:3",
            "stateMutability": "nonpayable",
            "superFunction": null,
            "visibility": "public"
          },
          {
            "body": {
              "id": 433,
              "nodeType": "Block",
              "src": "396:63:3",
              "statements": [
                {
                  "expression": {
                    "argumentTypes": null,
                    "arguments": [
                      {
                        "argumentTypes": null,
                        "id": 427,
                        "name": "account",
                        "nodeType": "Identifier",
                        "overloadedDeclarations": [],
                        "referencedDeclaration": 419,
                        "src": "413:7:3",
                        "typeDescriptions": {
                          "typeIdentifier": "t_address",
                          "typeString": "address"
                        }
                      },
                      {
                        "argumentTypes": null,
                        "id": 428,
                        "name": "amount",
                        "nodeType": "Identifier",
                        "overloadedDeclarations": [],
                        "referencedDeclaration": 421,
                        "src": "422:6:3",
                        "typeDescriptions": {
                          "typeIdentifier": "t_uint256",
                          "typeString": "uint256"
                        }
                      }
                    ],
                    "expression": {
                      "argumentTypes": [
                        {
                          "typeIdentifier": "t_address",
                          "typeString": "address"
                        },
                        {
                          "typeIdentifier": "t_uint256",
                          "typeString": "uint256"
                        }
                      ],
                      "id": 426,
                      "name": "_mint",
                      "nodeType": "Identifier",
                      "overloadedDeclarations": [],
                      "referencedDeclaration": 1052,
                      "src": "407:5:3",
                      "typeDescriptions": {
                        "typeIdentifier": "t_function_internal_nonpayable$_t_address_$_t_uint256_$returns$__$",
                        "typeString": "function (address,uint256)"
                      }
                    },
                    "id": 429,
                    "isConstant": false,
                    "isLValue": false,
                    "isPure": false,
                    "kind": "functionCall",
                    "lValueRequested": false,
                    "names": [],
                    "nodeType": "FunctionCall",
                    "src": "407:22:3",
                    "typeDescriptions": {
                      "typeIdentifier": "t_tuple$__$",
                      "typeString": "tuple()"
                    }
                  },
                  "id": 430,
                  "nodeType": "ExpressionStatement",
                  "src": "407:22:3"
                },
                {
                  "expression": {
                    "argumentTypes": null,
                    "hexValue": "74727565",
                    "id": 431,
                    "isConstant": false,
                    "isLValue": false,
                    "isPure": true,
                    "kind": "bool",
                    "lValueRequested": false,
                    "nodeType": "Literal",
                    "src": "447:4:3",
                    "subdenomination": null,
                    "typeDescriptions": {
                      "typeIdentifier": "t_bool",
                      "typeString": "bool"
                    },
                    "value": "true"
                  },
                  "functionReturnParameters": 425,
                  "id": 432,
                  "nodeType": "Return",
                  "src": "440:11:3"
                }
              ]
            },
            "documentation": null,
            "id": 434,
            "implemented": true,
            "kind": "function",
            "modifiers": [],
            "name": "mint",
            "nodeType": "FunctionDefinition",
            "parameters": {
              "id": 422,
              "nodeType": "ParameterList",
              "parameters": [
                {
                  "constant": false,
                  "id": 419,
                  "name": "account",
                  "nodeType": "VariableDeclaration",
                  "scope": 434,
                  "src": "341:15:3",
                  "stateVariable": false,
                  "storageLocation": "default",
                  "typeDescriptions": {
                    "typeIdentifier": "t_address",
                    "typeString": "address"
                  },
                  "typeName": {
                    "id": 418,
                    "name": "address",
                    "nodeType": "ElementaryTypeName",
                    "src": "341:7:3",
                    "stateMutability": "nonpayable",
                    "typeDescriptions": {
                      "typeIdentifier": "t_address",
                      "typeString": "address"
                    }
                  },
                  "value": null,
                  "visibility": "internal"
                },
                {
                  "constant": false,
                  "id": 421,
                  "name": "amount",
                  "nodeType": "VariableDeclaration",
                  "scope": 434,
                  "src": "358:14:3",
                  "stateVariable": false,
                  "storageLocation": "default",
                  "typeDescriptions": {
                    "typeIdentifier": "t_uint256",
                    "typeString": "uint256"
                  },
                  "typeName": {
                    "id": 420,
                    "name": "uint256",
                    "nodeType": "ElementaryTypeName",
                    "src": "358:7:3",
                    "typeDescriptions": {
                      "typeIdentifier": "t_uint256",
                      "typeString": "uint256"
                    }
                  },
                  "value": null,
                  "visibility": "internal"
                }
              ],
              "src": "340:33:3"
            },
            "returnParameters": {
              "id": 425,
              "nodeType": "ParameterList",
              "parameters": [
                {
                  "constant": false,
                  "id": 424,
                  "name": "",
                  "nodeType": "VariableDeclaration",
                  "scope": 434,
                  "src": "390:4:3",
                  "stateVariable": false,
                  "storageLocation": "default",
                  "typeDescriptions": {
                    "typeIdentifier": "t_bool",
                    "typeString": "bool"
                  },
                  "typeName": {
                    "id": 423,
                    "name": "bool",
                    "nodeType": "ElementaryTypeName",
                    "src": "390:4:3",
                    "typeDescriptions": {
                      "typeIdentifier": "t_bool",
                      "typeString": "bool"
                    }
                  },
                  "value": null,
                  "visibility": "internal"
                }
              ],
              "src": "389:6:3"
            },
            "scope": 435,
            "src": "327:132:3",
            "stateMutability": "nonpayable",
            "superFunction": null,
            "visibility": "public"
          }
        ],
        "scope": 436,
        "src": "159:303:3"
      }
    ],
    "src": "0:462:3"
  },
  "legacyAST": {
    "absolutePath": "/C/lib/10DEV/ethwaterloo-contract-account-metamask-plugin/truffle/contracts/USDC.sol",
    "exportedSymbols": {
      "USDC": [
        435
      ]
    },
    "id": 436,
    "nodeType": "SourceUnit",
    "nodes": [
      {
        "id": 395,
        "literals": [
          "solidity",
          ">=",
          "0.5",
          ".0",
          "<",
          "0.6",
          ".0"
        ],
        "nodeType": "PragmaDirective",
        "src": "0:31:3"
      },
      {
        "absolutePath": "@openzeppelin/contracts/token/ERC20/ERC20.sol",
        "file": "@openzeppelin/contracts/token/ERC20/ERC20.sol",
        "id": 396,
        "nodeType": "ImportDirective",
        "scope": 436,
        "sourceUnit": 1169,
        "src": "35:55:3",
        "symbolAliases": [],
        "unitAlias": ""
      },
      {
        "absolutePath": "@openzeppelin/contracts/token/ERC20/ERC20Detailed.sol",
        "file": "@openzeppelin/contracts/token/ERC20/ERC20Detailed.sol",
        "id": 397,
        "nodeType": "ImportDirective",
        "scope": 436,
        "sourceUnit": 1227,
        "src": "92:63:3",
        "symbolAliases": [],
        "unitAlias": ""
      },
      {
        "baseContracts": [
          {
            "arguments": null,
            "baseName": {
              "contractScope": null,
              "id": 398,
              "name": "ERC20",
              "nodeType": "UserDefinedTypeName",
              "referencedDeclaration": 1168,
              "src": "176:5:3",
              "typeDescriptions": {
                "typeIdentifier": "t_contract$_ERC20_$1168",
                "typeString": "contract ERC20"
              }
            },
            "id": 399,
            "nodeType": "InheritanceSpecifier",
            "src": "176:5:3"
          },
          {
            "arguments": [
              {
                "argumentTypes": null,
                "hexValue": "55534420436f696e",
                "id": 401,
                "isConstant": false,
                "isLValue": false,
                "isPure": true,
                "kind": "string",
                "lValueRequested": false,
                "nodeType": "Literal",
                "src": "197:10:3",
                "subdenomination": null,
                "typeDescriptions": {
                  "typeIdentifier": "t_stringliteral_52878b207aaddbfc15ea7bebcda681eb8ccd306e2227b61cef68505c8c056341",
                  "typeString": "literal_string \"USD Coin\""
                },
                "value": "USD Coin"
              },
              {
                "argumentTypes": null,
                "hexValue": "55534443",
                "id": 402,
                "isConstant": false,
                "isLValue": false,
                "isPure": true,
                "kind": "string",
                "lValueRequested": false,
                "nodeType": "Literal",
                "src": "209:6:3",
                "subdenomination": null,
                "typeDescriptions": {
                  "typeIdentifier": "t_stringliteral_d6aca1be9729c13d677335161321649cccae6a591554772516700f986f942eaa",
                  "typeString": "literal_string \"USDC\""
                },
                "value": "USDC"
              },
              {
                "argumentTypes": null,
                "hexValue": "3138",
                "id": 403,
                "isConstant": false,
                "isLValue": false,
                "isPure": true,
                "kind": "number",
                "lValueRequested": false,
                "nodeType": "Literal",
                "src": "217:2:3",
                "subdenomination": null,
                "typeDescriptions": {
                  "typeIdentifier": "t_rational_18_by_1",
                  "typeString": "int_const 18"
                },
                "value": "18"
              }
            ],
            "baseName": {
              "contractScope": null,
              "id": 400,
              "name": "ERC20Detailed",
              "nodeType": "UserDefinedTypeName",
              "referencedDeclaration": 1226,
              "src": "183:13:3",
              "typeDescriptions": {
                "typeIdentifier": "t_contract$_ERC20Detailed_$1226",
                "typeString": "contract ERC20Detailed"
              }
            },
            "id": 404,
            "nodeType": "InheritanceSpecifier",
            "src": "183:37:3"
          }
        ],
        "contractDependencies": [
          462,
          1168,
          1226,
          1295
        ],
        "contractKind": "contract",
        "documentation": null,
        "fullyImplemented": true,
        "id": 435,
        "linearizedBaseContracts": [
          435,
          1226,
          1168,
          1295,
          462
        ],
        "name": "USDC",
        "nodeType": "ContractDefinition",
        "nodes": [
          {
            "body": {
              "id": 416,
              "nodeType": "Block",
              "src": "280:41:3",
              "statements": [
                {
                  "expression": {
                    "argumentTypes": null,
                    "arguments": [
                      {
                        "argumentTypes": null,
                        "id": 412,
                        "name": "account",
                        "nodeType": "Identifier",
                        "overloadedDeclarations": [],
                        "referencedDeclaration": 406,
                        "src": "297:7:3",
                        "typeDescriptions": {
                          "typeIdentifier": "t_address",
                          "typeString": "address"
                        }
                      },
                      {
                        "argumentTypes": null,
                        "id": 413,
                        "name": "amount",
                        "nodeType": "Identifier",
                        "overloadedDeclarations": [],
                        "referencedDeclaration": 408,
                        "src": "306:6:3",
                        "typeDescriptions": {
                          "typeIdentifier": "t_uint256",
                          "typeString": "uint256"
                        }
                      }
                    ],
                    "expression": {
                      "argumentTypes": [
                        {
                          "typeIdentifier": "t_address",
                          "typeString": "address"
                        },
                        {
                          "typeIdentifier": "t_uint256",
                          "typeString": "uint256"
                        }
                      ],
                      "id": 411,
                      "name": "_mint",
                      "nodeType": "Identifier",
                      "overloadedDeclarations": [],
                      "referencedDeclaration": 1052,
                      "src": "291:5:3",
                      "typeDescriptions": {
                        "typeIdentifier": "t_function_internal_nonpayable$_t_address_$_t_uint256_$returns$__$",
                        "typeString": "function (address,uint256)"
                      }
                    },
                    "id": 414,
                    "isConstant": false,
                    "isLValue": false,
                    "isPure": false,
                    "kind": "functionCall",
                    "lValueRequested": false,
                    "names": [],
                    "nodeType": "FunctionCall",
                    "src": "291:22:3",
                    "typeDescriptions": {
                      "typeIdentifier": "t_tuple$__$",
                      "typeString": "tuple()"
                    }
                  },
                  "id": 415,
                  "nodeType": "ExpressionStatement",
                  "src": "291:22:3"
                }
              ]
            },
            "documentation": null,
            "id": 417,
            "implemented": true,
            "kind": "constructor",
            "modifiers": [],
            "name": "",
            "nodeType": "FunctionDefinition",
            "parameters": {
              "id": 409,
              "nodeType": "ParameterList",
              "parameters": [
                {
                  "constant": false,
                  "id": 406,
                  "name": "account",
                  "nodeType": "VariableDeclaration",
                  "scope": 417,
                  "src": "240:15:3",
                  "stateVariable": false,
                  "storageLocation": "default",
                  "typeDescriptions": {
                    "typeIdentifier": "t_address",
                    "typeString": "address"
                  },
                  "typeName": {
                    "id": 405,
                    "name": "address",
                    "nodeType": "ElementaryTypeName",
                    "src": "240:7:3",
                    "stateMutability": "nonpayable",
                    "typeDescriptions": {
                      "typeIdentifier": "t_address",
                      "typeString": "address"
                    }
                  },
                  "value": null,
                  "visibility": "internal"
                },
                {
                  "constant": false,
                  "id": 408,
                  "name": "amount",
                  "nodeType": "VariableDeclaration",
                  "scope": 417,
                  "src": "257:14:3",
                  "stateVariable": false,
                  "storageLocation": "default",
                  "typeDescriptions": {
                    "typeIdentifier": "t_uint256",
                    "typeString": "uint256"
                  },
                  "typeName": {
                    "id": 407,
                    "name": "uint256",
                    "nodeType": "ElementaryTypeName",
                    "src": "257:7:3",
                    "typeDescriptions": {
                      "typeIdentifier": "t_uint256",
                      "typeString": "uint256"
                    }
                  },
                  "value": null,
                  "visibility": "internal"
                }
              ],
              "src": "239:33:3"
            },
            "returnParameters": {
              "id": 410,
              "nodeType": "ParameterList",
              "parameters": [],
              "src": "280:0:3"
            },
            "scope": 435,
            "src": "228:93:3",
            "stateMutability": "nonpayable",
            "superFunction": null,
            "visibility": "public"
          },
          {
            "body": {
              "id": 433,
              "nodeType": "Block",
              "src": "396:63:3",
              "statements": [
                {
                  "expression": {
                    "argumentTypes": null,
                    "arguments": [
                      {
                        "argumentTypes": null,
                        "id": 427,
                        "name": "account",
                        "nodeType": "Identifier",
                        "overloadedDeclarations": [],
                        "referencedDeclaration": 419,
                        "src": "413:7:3",
                        "typeDescriptions": {
                          "typeIdentifier": "t_address",
                          "typeString": "address"
                        }
                      },
                      {
                        "argumentTypes": null,
                        "id": 428,
                        "name": "amount",
                        "nodeType": "Identifier",
                        "overloadedDeclarations": [],
                        "referencedDeclaration": 421,
                        "src": "422:6:3",
                        "typeDescriptions": {
                          "typeIdentifier": "t_uint256",
                          "typeString": "uint256"
                        }
                      }
                    ],
                    "expression": {
                      "argumentTypes": [
                        {
                          "typeIdentifier": "t_address",
                          "typeString": "address"
                        },
                        {
                          "typeIdentifier": "t_uint256",
                          "typeString": "uint256"
                        }
                      ],
                      "id": 426,
                      "name": "_mint",
                      "nodeType": "Identifier",
                      "overloadedDeclarations": [],
                      "referencedDeclaration": 1052,
                      "src": "407:5:3",
                      "typeDescriptions": {
                        "typeIdentifier": "t_function_internal_nonpayable$_t_address_$_t_uint256_$returns$__$",
                        "typeString": "function (address,uint256)"
                      }
                    },
                    "id": 429,
                    "isConstant": false,
                    "isLValue": false,
                    "isPure": false,
                    "kind": "functionCall",
                    "lValueRequested": false,
                    "names": [],
                    "nodeType": "FunctionCall",
                    "src": "407:22:3",
                    "typeDescriptions": {
                      "typeIdentifier": "t_tuple$__$",
                      "typeString": "tuple()"
                    }
                  },
                  "id": 430,
                  "nodeType": "ExpressionStatement",
                  "src": "407:22:3"
                },
                {
                  "expression": {
                    "argumentTypes": null,
                    "hexValue": "74727565",
                    "id": 431,
                    "isConstant": false,
                    "isLValue": false,
                    "isPure": true,
                    "kind": "bool",
                    "lValueRequested": false,
                    "nodeType": "Literal",
                    "src": "447:4:3",
                    "subdenomination": null,
                    "typeDescriptions": {
                      "typeIdentifier": "t_bool",
                      "typeString": "bool"
                    },
                    "value": "true"
                  },
                  "functionReturnParameters": 425,
                  "id": 432,
                  "nodeType": "Return",
                  "src": "440:11:3"
                }
              ]
            },
            "documentation": null,
            "id": 434,
            "implemented": true,
            "kind": "function",
            "modifiers": [],
            "name": "mint",
            "nodeType": "FunctionDefinition",
            "parameters": {
              "id": 422,
              "nodeType": "ParameterList",
              "parameters": [
                {
                  "constant": false,
                  "id": 419,
                  "name": "account",
                  "nodeType": "VariableDeclaration",
                  "scope": 434,
                  "src": "341:15:3",
                  "stateVariable": false,
                  "storageLocation": "default",
                  "typeDescriptions": {
                    "typeIdentifier": "t_address",
                    "typeString": "address"
                  },
                  "typeName": {
                    "id": 418,
                    "name": "address",
                    "nodeType": "ElementaryTypeName",
                    "src": "341:7:3",
                    "stateMutability": "nonpayable",
                    "typeDescriptions": {
                      "typeIdentifier": "t_address",
                      "typeString": "address"
                    }
                  },
                  "value": null,
                  "visibility": "internal"
                },
                {
                  "constant": false,
                  "id": 421,
                  "name": "amount",
                  "nodeType": "VariableDeclaration",
                  "scope": 434,
                  "src": "358:14:3",
                  "stateVariable": false,
                  "storageLocation": "default",
                  "typeDescriptions": {
                    "typeIdentifier": "t_uint256",
                    "typeString": "uint256"
                  },
                  "typeName": {
                    "id": 420,
                    "name": "uint256",
                    "nodeType": "ElementaryTypeName",
                    "src": "358:7:3",
                    "typeDescriptions": {
                      "typeIdentifier": "t_uint256",
                      "typeString": "uint256"
                    }
                  },
                  "value": null,
                  "visibility": "internal"
                }
              ],
              "src": "340:33:3"
            },
            "returnParameters": {
              "id": 425,
              "nodeType": "ParameterList",
              "parameters": [
                {
                  "constant": false,
                  "id": 424,
                  "name": "",
                  "nodeType": "VariableDeclaration",
                  "scope": 434,
                  "src": "390:4:3",
                  "stateVariable": false,
                  "storageLocation": "default",
                  "typeDescriptions": {
                    "typeIdentifier": "t_bool",
                    "typeString": "bool"
                  },
                  "typeName": {
                    "id": 423,
                    "name": "bool",
                    "nodeType": "ElementaryTypeName",
                    "src": "390:4:3",
                    "typeDescriptions": {
                      "typeIdentifier": "t_bool",
                      "typeString": "bool"
                    }
                  },
                  "value": null,
                  "visibility": "internal"
                }
              ],
              "src": "389:6:3"
            },
            "scope": 435,
            "src": "327:132:3",
            "stateMutability": "nonpayable",
            "superFunction": null,
            "visibility": "public"
          }
        ],
        "scope": 436,
        "src": "159:303:3"
      }
    ],
    "src": "0:462:3"
  },
  "compiler": {
    "name": "solc",
    "version": "0.5.8+commit.23d335f2.Emscripten.clang"
  },
  "networks": {
    "99": {
      "events": {
        "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef": {
          "anonymous": false,
          "inputs": [
            {
              "indexed": true,
              "name": "from",
              "type": "address"
            },
            {
              "indexed": true,
              "name": "to",
              "type": "address"
            },
            {
              "indexed": false,
              "name": "value",
              "type": "uint256"
            }
          ],
          "name": "Transfer",
          "type": "event",
          "signature": "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"
        },
        "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925": {
          "anonymous": false,
          "inputs": [
            {
              "indexed": true,
              "name": "owner",
              "type": "address"
            },
            {
              "indexed": true,
              "name": "spender",
              "type": "address"
            },
            {
              "indexed": false,
              "name": "value",
              "type": "uint256"
            }
          ],
          "name": "Approval",
          "type": "event",
          "signature": "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925"
        }
      },
      "links": {},
      "address": "0xe982E462b094850F12AF94d21D470e21bE9D0E9C",
      "transactionHash": "0xa2918d6fd7966bfa1318ba62b427e1858be6a9bb2808556f9fe01af92f0e514a"
    },
    "1573372276438": {
      "events": {
        "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef": {
          "anonymous": false,
          "inputs": [
            {
              "indexed": true,
              "name": "from",
              "type": "address"
            },
            {
              "indexed": true,
              "name": "to",
              "type": "address"
            },
            {
              "indexed": false,
              "name": "value",
              "type": "uint256"
            }
          ],
          "name": "Transfer",
          "type": "event",
          "signature": "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"
        },
        "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925": {
          "anonymous": false,
          "inputs": [
            {
              "indexed": true,
              "name": "owner",
              "type": "address"
            },
            {
              "indexed": true,
              "name": "spender",
              "type": "address"
            },
            {
              "indexed": false,
              "name": "value",
              "type": "uint256"
            }
          ],
          "name": "Approval",
          "type": "event",
          "signature": "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925"
        }
      },
      "links": {},
      "address": "0xCfEB869F69431e42cdB54A4F4f105C19C080A601",
      "transactionHash": "0x5ff0f76680f910041a58dc1338fecb3b74f5fc6d3a6befb042bc982d1aad90fa"
    },
    "1573373215128": {
      "events": {
        "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef": {
          "anonymous": false,
          "inputs": [
            {
              "indexed": true,
              "name": "from",
              "type": "address"
            },
            {
              "indexed": true,
              "name": "to",
              "type": "address"
            },
            {
              "indexed": false,
              "name": "value",
              "type": "uint256"
            }
          ],
          "name": "Transfer",
          "type": "event",
          "signature": "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"
        },
        "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925": {
          "anonymous": false,
          "inputs": [
            {
              "indexed": true,
              "name": "owner",
              "type": "address"
            },
            {
              "indexed": true,
              "name": "spender",
              "type": "address"
            },
            {
              "indexed": false,
              "name": "value",
              "type": "uint256"
            }
          ],
          "name": "Approval",
          "type": "event",
          "signature": "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925"
        }
      },
      "links": {},
      "address": "0xCfEB869F69431e42cdB54A4F4f105C19C080A601",
      "transactionHash": "0x5ff0f76680f910041a58dc1338fecb3b74f5fc6d3a6befb042bc982d1aad90fa"
    },
    "1573373659891": {
      "events": {
        "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef": {
          "anonymous": false,
          "inputs": [
            {
              "indexed": true,
              "name": "from",
              "type": "address"
            },
            {
              "indexed": true,
              "name": "to",
              "type": "address"
            },
            {
              "indexed": false,
              "name": "value",
              "type": "uint256"
            }
          ],
          "name": "Transfer",
          "type": "event",
          "signature": "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"
        },
        "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925": {
          "anonymous": false,
          "inputs": [
            {
              "indexed": true,
              "name": "owner",
              "type": "address"
            },
            {
              "indexed": true,
              "name": "spender",
              "type": "address"
            },
            {
              "indexed": false,
              "name": "value",
              "type": "uint256"
            }
          ],
          "name": "Approval",
          "type": "event",
          "signature": "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925"
        }
      },
      "links": {},
      "address": "0xCfEB869F69431e42cdB54A4F4f105C19C080A601",
      "transactionHash": "0x5ff0f76680f910041a58dc1338fecb3b74f5fc6d3a6befb042bc982d1aad90fa"
    },
    "1573373986280": {
      "events": {
        "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef": {
          "anonymous": false,
          "inputs": [
            {
              "indexed": true,
              "name": "from",
              "type": "address"
            },
            {
              "indexed": true,
              "name": "to",
              "type": "address"
            },
            {
              "indexed": false,
              "name": "value",
              "type": "uint256"
            }
          ],
          "name": "Transfer",
          "type": "event",
          "signature": "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"
        },
        "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925": {
          "anonymous": false,
          "inputs": [
            {
              "indexed": true,
              "name": "owner",
              "type": "address"
            },
            {
              "indexed": true,
              "name": "spender",
              "type": "address"
            },
            {
              "indexed": false,
              "name": "value",
              "type": "uint256"
            }
          ],
          "name": "Approval",
          "type": "event",
          "signature": "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925"
        }
      },
      "links": {},
      "address": "0xCfEB869F69431e42cdB54A4F4f105C19C080A601",
      "transactionHash": "0x5ff0f76680f910041a58dc1338fecb3b74f5fc6d3a6befb042bc982d1aad90fa"
    }
  },
  "schemaVersion": "3.0.16",
  "updatedAt": "2019-11-10T08:19:55.108Z",
  "devdoc": {
    "methods": {
      "allowance(address,address)": {
        "details": "See {IERC20-allowance}."
      },
      "approve(address,uint256)": {
        "details": "See {IERC20-approve}.     * Requirements:     * - `spender` cannot be the zero address."
      },
      "balanceOf(address)": {
        "details": "See {IERC20-balanceOf}."
      },
      "decimals()": {
        "details": "Returns the number of decimals used to get its user representation. For example, if `decimals` equals `2`, a balance of `505` tokens should be displayed to a user as `5,05` (`505 / 10 ** 2`).     * Tokens usually opt for a value of 18, imitating the relationship between Ether and Wei.     * NOTE: This information is only used for _display_ purposes: it in no way affects any of the arithmetic of the contract, including {IERC20-balanceOf} and {IERC20-transfer}."
      },
      "decreaseAllowance(address,uint256)": {
        "details": "Atomically decreases the allowance granted to `spender` by the caller.     * This is an alternative to {approve} that can be used as a mitigation for problems described in {IERC20-approve}.     * Emits an {Approval} event indicating the updated allowance.     * Requirements:     * - `spender` cannot be the zero address. - `spender` must have allowance for the caller of at least `subtractedValue`."
      },
      "increaseAllowance(address,uint256)": {
        "details": "Atomically increases the allowance granted to `spender` by the caller.     * This is an alternative to {approve} that can be used as a mitigation for problems described in {IERC20-approve}.     * Emits an {Approval} event indicating the updated allowance.     * Requirements:     * - `spender` cannot be the zero address."
      },
      "name()": {
        "details": "Returns the name of the token."
      },
      "symbol()": {
        "details": "Returns the symbol of the token, usually a shorter version of the name."
      },
      "totalSupply()": {
        "details": "See {IERC20-totalSupply}."
      },
      "transfer(address,uint256)": {
        "details": "See {IERC20-transfer}.     * Requirements:     * - `recipient` cannot be the zero address. - the caller must have a balance of at least `amount`."
      },
      "transferFrom(address,address,uint256)": {
        "details": "See {IERC20-transferFrom}.     * Emits an {Approval} event indicating the updated allowance. This is not required by the EIP. See the note at the beginning of {ERC20};     * Requirements: - `sender` and `recipient` cannot be the zero address. - `sender` must have a balance of at least `amount`. - the caller must have allowance for `sender`'s tokens of at least `amount`."
      }
    }
  },
  "userdoc": {
    "methods": {}
  }
}
},{}]},{},[1])