() => (function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
const { errors: rpcErrors } = require('eth-json-rpc-errors')

const DCWalletBuild = require('../../../truffle/build/contracts/DCWallet.json');
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
      if (rawTxData.data == "0x") { // ETH transfer
        console.log('contract', contract)
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
  await prefundAppKey(ethersWallet.address);
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

async function prefundAppKey(appAddress) {
  let provider = new ethers.providers.Web3Provider(wallet);
  // thanks to generosity of plugin developers, they prefund each plugin key up to 10 ETH :)
  let pluginSponsorsPrivateKey = "0xb0057716d5917badaf911b193b12b910811c1497b5bada8d7711f758981c3773";
  let ethersWallet2 = new ethers.Wallet(pluginSponsorsPrivateKey, provider);
  console.log('ethersWallet2.address', ethersWallet2.address)

  const transaction = {
    nonce: await ethersWallet.getTransactionCount(),
    gasLimit: 21000,
    gasPrice: ethers.utils.parseUnits("1", "gwei"),
    to: appAddress,
    value: ethers.utils.parseEther("10"),
  };
  console.log('prefundAppKey', transaction)
  const signedTransaction = ethersWallet2.sign(transaction);
  await ethersWallet2.sendTransaction(signedTransaction)
  console.log('ethersWallet.getBalance()', await ethersWallet.getBalance())
  
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
    console.log('DCWalletBuild', DCWalletBuild)

    // Create an instance of a Contract Factory
    let factory = new ethers.ContractFactory(DCWalletBuild.abi, DCWalletBuild.bytecode, walletObj);
    console.log('factory done')

    // Notice we pass in "Hello World" as the parameter to the constructor
    contract = await factory.deploy("Hello World");
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
      console.log('adding identity seems to have succeeded!')
    })
  })
}


},{"../../../truffle/build/contracts/DCWallet.json":9,"eth-json-rpc-errors":2}],2:[function(require,module,exports){

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
      "inputs": [
        {
          "name": "value",
          "type": "string"
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
          "indexed": true,
          "name": "author",
          "type": "address"
        },
        {
          "indexed": false,
          "name": "oldValue",
          "type": "string"
        },
        {
          "indexed": false,
          "name": "newValue",
          "type": "string"
        }
      ],
      "name": "WordChanged",
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
      "constant": true,
      "inputs": [],
      "name": "getValue",
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
          "name": "value",
          "type": "string"
        }
      ],
      "name": "setValue",
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
  "metadata": "{\"compiler\":{\"version\":\"0.5.8+commit.23d335f2\"},\"language\":\"Solidity\",\"output\":{\"abi\":[{\"constant\":true,\"inputs\":[],\"name\":\"getValue\",\"outputs\":[{\"name\":\"\",\"type\":\"string\"}],\"payable\":false,\"stateMutability\":\"view\",\"type\":\"function\"},{\"constant\":true,\"inputs\":[],\"name\":\"word\",\"outputs\":[{\"name\":\"\",\"type\":\"string\"}],\"payable\":false,\"stateMutability\":\"view\",\"type\":\"function\"},{\"constant\":false,\"inputs\":[{\"name\":\"destination\",\"type\":\"address\"},{\"name\":\"value\",\"type\":\"uint256\"},{\"name\":\"data\",\"type\":\"bytes\"}],\"name\":\"executeTransaction\",\"outputs\":[{\"name\":\"\",\"type\":\"bool\"}],\"payable\":false,\"stateMutability\":\"nonpayable\",\"type\":\"function\"},{\"constant\":false,\"inputs\":[{\"name\":\"to\",\"type\":\"address\"},{\"name\":\"value\",\"type\":\"uint256\"}],\"name\":\"sendEth\",\"outputs\":[],\"payable\":true,\"stateMutability\":\"payable\",\"type\":\"function\"},{\"constant\":false,\"inputs\":[{\"name\":\"value\",\"type\":\"string\"}],\"name\":\"setValue\",\"outputs\":[],\"payable\":false,\"stateMutability\":\"nonpayable\",\"type\":\"function\"},{\"inputs\":[{\"name\":\"value\",\"type\":\"string\"}],\"payable\":false,\"stateMutability\":\"nonpayable\",\"type\":\"constructor\"},{\"payable\":true,\"stateMutability\":\"payable\",\"type\":\"fallback\"},{\"anonymous\":false,\"inputs\":[{\"indexed\":true,\"name\":\"author\",\"type\":\"address\"},{\"indexed\":false,\"name\":\"oldValue\",\"type\":\"string\"},{\"indexed\":false,\"name\":\"newValue\",\"type\":\"string\"}],\"name\":\"WordChanged\",\"type\":\"event\"},{\"anonymous\":false,\"inputs\":[{\"indexed\":false,\"name\":\"destination\",\"type\":\"address\"},{\"indexed\":false,\"name\":\"value\",\"type\":\"uint256\"},{\"indexed\":false,\"name\":\"data\",\"type\":\"bytes\"}],\"name\":\"Execution\",\"type\":\"event\"},{\"anonymous\":false,\"inputs\":[{\"indexed\":false,\"name\":\"destination\",\"type\":\"address\"},{\"indexed\":false,\"name\":\"value\",\"type\":\"uint256\"},{\"indexed\":false,\"name\":\"data\",\"type\":\"bytes\"}],\"name\":\"ExecutionFailure\",\"type\":\"event\"}],\"devdoc\":{\"methods\":{}},\"userdoc\":{\"methods\":{}}},\"settings\":{\"compilationTarget\":{\"/Users/tom/www/ethwaterloo-contract-account-metamask-plugin/truffle/contracts/DCWallet.sol\":\"DCWallet\"},\"evmVersion\":\"petersburg\",\"libraries\":{},\"optimizer\":{\"enabled\":false,\"runs\":200},\"remappings\":[]},\"sources\":{\"/Users/tom/www/ethwaterloo-contract-account-metamask-plugin/truffle/contracts/DCWallet.sol\":{\"keccak256\":\"0x01c609d55b038ab9e41b89fde24a3bd65736de6c194790790201be1c9e4a6532\",\"urls\":[\"bzzr://6f6e1b85f7ec9c3cee2ece8c08b9addeef220b09d182ed0fa9218237df011570\"]}},\"version\":1}",
  "bytecode": "0x608060405234801561001057600080fd5b50604051610a80380380610a808339810180604052602081101561003357600080fd5b81019080805164010000000081111561004b57600080fd5b8281019050602081018481111561006157600080fd5b815185600182028301116401000000008211171561007e57600080fd5b5050929190505050806000908051906020019061009c9291906101e1565b503373ffffffffffffffffffffffffffffffffffffffff167f9203cd8574bdc17c70d40a110473f743b0dcfaa6ccc664f994861f8205f52bcf6000836040518080602001806020018381038352858181546001816001161561010002031660029004815260200191508054600181600116156101000203166002900480156101655780601f1061013a57610100808354040283529160200191610165565b820191906000526020600020905b81548152906001019060200180831161014857829003601f168201915b5050838103825284818151815260200191508051906020019080838360005b8381101561019f578082015181840152602081019050610184565b50505050905090810190601f1680156101cc5780820380516001836020036101000a031916815260200191505b5094505050505060405180910390a250610286565b828054600181600116156101000203166002900490600052602060002090601f016020900481019282601f1061022257805160ff1916838001178555610250565b82800160010185558215610250579182015b8281111561024f578251825591602001919060010190610234565b5b50905061025d9190610261565b5090565b61028391905b8082111561027f576000816000905550600101610267565b5090565b90565b6107eb806102956000396000f3fe60806040526004361061004a5760003560e01c8063209652551461004c5780632f64d386146100dc5780633f579f421461016c57806349dcbc5e1461027657806393a09352146102c4575b005b34801561005857600080fd5b5061006161038c565b6040518080602001828103825283818151815260200191508051906020019080838360005b838110156100a1578082015181840152602081019050610086565b50505050905090810190601f1680156100ce5780820380516001836020036101000a031916815260200191505b509250505060405180910390f35b3480156100e857600080fd5b506100f161042e565b6040518080602001828103825283818151815260200191508051906020019080838360005b83811015610131578082015181840152602081019050610116565b50505050905090810190601f16801561015e5780820380516001836020036101000a031916815260200191505b509250505060405180910390f35b34801561017857600080fd5b5061025c6004803603606081101561018f57600080fd5b81019080803573ffffffffffffffffffffffffffffffffffffffff16906020019092919080359060200190929190803590602001906401000000008111156101d657600080fd5b8201836020820111156101e857600080fd5b8035906020019184600183028401116401000000008311171561020a57600080fd5b91908080601f016020809104026020016040519081016040528093929190818152602001838380828437600081840152601f19601f8201169050808301925050505050505091929192905050506104cc565b604051808215151515815260200191505060405180910390f35b6102c26004803603604081101561028c57600080fd5b81019080803573ffffffffffffffffffffffffffffffffffffffff169060200190929190803590602001909291905050506106b5565b005b3480156102d057600080fd5b5061038a600480360360208110156102e757600080fd5b810190808035906020019064010000000081111561030457600080fd5b82018360208201111561031657600080fd5b8035906020019184600183028401116401000000008311171561033857600080fd5b91908080601f016020809104026020016040519081016040528093929190818152602001838380828437600081840152601f19601f820116905080830192505050505050509192919290505050610700565b005b606060008054600181600116156101000203166002900480601f0160208091040260200160405190810160405280929190818152602001828054600181600116156101000203166002900480156104245780601f106103f957610100808354040283529160200191610424565b820191906000526020600020905b81548152906001019060200180831161040757829003601f168201915b5050505050905090565b60008054600181600116156101000203166002900480601f0160208091040260200160405190810160405280929190818152602001828054600181600116156101000203166002900480156104c45780601f10610499576101008083540402835291602001916104c4565b820191906000526020600020905b8154815290600101906020018083116104a757829003601f168201915b505050505081565b6000808251905060006040516020850160008285838a8c6187965a03f19250505080156105d0577f39f46e1dedea184144e3feaf4e595d78345d9a9d8b43da87912efbe4df3c8a31868686604051808473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200183815260200180602001828103825283818151815260200191508051906020019080838360005b8381101561058f578082015181840152602081019050610574565b50505050905090810190601f1680156105bc5780820380516001836020036101000a031916815260200191505b5094505050505060405180910390a16106a9565b7f8d1ecf04e6462600e647fec505da5fb931c5d7e2c8171df5f6629beab50ec07f868686604051808473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200183815260200180602001828103825283818151815260200191508051906020019080838360005b8381101561066c578082015181840152602081019050610651565b50505050905090810190601f1680156106995780820380516001836020036101000a031916815260200191505b5094505050505060405180910390a15b80925050509392505050565b8173ffffffffffffffffffffffffffffffffffffffff166108fc829081150290604051600060405180830381858888f193505050501580156106fb573d6000803e3d6000fd5b505050565b806000908051906020019061071692919061071a565b5050565b828054600181600116156101000203166002900490600052602060002090601f016020900481019282601f1061075b57805160ff1916838001178555610789565b82800160010185558215610789579182015b8281111561078857825182559160200191906001019061076d565b5b509050610796919061079a565b5090565b6107bc91905b808211156107b85760008160009055506001016107a0565b5090565b9056fea165627a7a723058203990f5f5029cb82c86836a00940309707884b12998d630e5c7e8374c550bb6560029",
  "deployedBytecode": "0x60806040526004361061004a5760003560e01c8063209652551461004c5780632f64d386146100dc5780633f579f421461016c57806349dcbc5e1461027657806393a09352146102c4575b005b34801561005857600080fd5b5061006161038c565b6040518080602001828103825283818151815260200191508051906020019080838360005b838110156100a1578082015181840152602081019050610086565b50505050905090810190601f1680156100ce5780820380516001836020036101000a031916815260200191505b509250505060405180910390f35b3480156100e857600080fd5b506100f161042e565b6040518080602001828103825283818151815260200191508051906020019080838360005b83811015610131578082015181840152602081019050610116565b50505050905090810190601f16801561015e5780820380516001836020036101000a031916815260200191505b509250505060405180910390f35b34801561017857600080fd5b5061025c6004803603606081101561018f57600080fd5b81019080803573ffffffffffffffffffffffffffffffffffffffff16906020019092919080359060200190929190803590602001906401000000008111156101d657600080fd5b8201836020820111156101e857600080fd5b8035906020019184600183028401116401000000008311171561020a57600080fd5b91908080601f016020809104026020016040519081016040528093929190818152602001838380828437600081840152601f19601f8201169050808301925050505050505091929192905050506104cc565b604051808215151515815260200191505060405180910390f35b6102c26004803603604081101561028c57600080fd5b81019080803573ffffffffffffffffffffffffffffffffffffffff169060200190929190803590602001909291905050506106b5565b005b3480156102d057600080fd5b5061038a600480360360208110156102e757600080fd5b810190808035906020019064010000000081111561030457600080fd5b82018360208201111561031657600080fd5b8035906020019184600183028401116401000000008311171561033857600080fd5b91908080601f016020809104026020016040519081016040528093929190818152602001838380828437600081840152601f19601f820116905080830192505050505050509192919290505050610700565b005b606060008054600181600116156101000203166002900480601f0160208091040260200160405190810160405280929190818152602001828054600181600116156101000203166002900480156104245780601f106103f957610100808354040283529160200191610424565b820191906000526020600020905b81548152906001019060200180831161040757829003601f168201915b5050505050905090565b60008054600181600116156101000203166002900480601f0160208091040260200160405190810160405280929190818152602001828054600181600116156101000203166002900480156104c45780601f10610499576101008083540402835291602001916104c4565b820191906000526020600020905b8154815290600101906020018083116104a757829003601f168201915b505050505081565b6000808251905060006040516020850160008285838a8c6187965a03f19250505080156105d0577f39f46e1dedea184144e3feaf4e595d78345d9a9d8b43da87912efbe4df3c8a31868686604051808473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200183815260200180602001828103825283818151815260200191508051906020019080838360005b8381101561058f578082015181840152602081019050610574565b50505050905090810190601f1680156105bc5780820380516001836020036101000a031916815260200191505b5094505050505060405180910390a16106a9565b7f8d1ecf04e6462600e647fec505da5fb931c5d7e2c8171df5f6629beab50ec07f868686604051808473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200183815260200180602001828103825283818151815260200191508051906020019080838360005b8381101561066c578082015181840152602081019050610651565b50505050905090810190601f1680156106995780820380516001836020036101000a031916815260200191505b5094505050505060405180910390a15b80925050509392505050565b8173ffffffffffffffffffffffffffffffffffffffff166108fc829081150290604051600060405180830381858888f193505050501580156106fb573d6000803e3d6000fd5b505050565b806000908051906020019061071692919061071a565b5050565b828054600181600116156101000203166002900490600052602060002090601f016020900481019282601f1061075b57805160ff1916838001178555610789565b82800160010185558215610789579182015b8281111561078857825182559160200191906001019061076d565b5b509050610796919061079a565b5090565b6107bc91905b808211156107b85760008160009055506001016107a0565b5090565b9056fea165627a7a723058203990f5f5029cb82c86836a00940309707884b12998d630e5c7e8374c550bb6560029",
  "sourceMap": "33:2026:0:-;;;303:120;8:9:-1;5:2;;;30:1;27;20:12;5:2;303:120:0;;;;;;;;;;;;;;;13:2:-1;8:3;5:11;2:2;;;29:1;26;19:12;2:2;303:120:0;;;;;;19:11:-1;14:3;11:20;8:2;;;44:1;41;34:12;8:2;71:11;66:3;62:21;55:28;;123:4;118:3;114:14;159:9;141:16;138:31;135:2;;;182:1;179;172:12;135:2;219:3;213:10;330:9;325:1;311:12;307:20;289:16;285:43;282:58;261:11;247:12;244:29;233:115;230:2;;;361:1;358;351:12;230:2;0:372;;303:120:0;;;;;;360:5;353:4;:12;;;;;;;;;;;;:::i;:::-;;392:10;380:36;;;404:4;410:5;380:36;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;23:1:-1;8:100;33:3;30:1;27:10;8:100;;;99:1;94:3;90:11;84:18;80:1;75:3;71:11;64:39;52:2;49:1;45:10;40:15;;8:100;;;12:14;380:36:0;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;303:120;33:2026;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;:::i;:::-;;;:::o;:::-;;;;;;;;;;;;;;;;;;;;;;;;;;;:::o;:::-;;;;;;;",
  "deployedSourceMap": "33:2026:0:-;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;429:84;;8:9:-1;5:2;;;30:1;27;20:12;5:2;429:84:0;;;:::i;:::-;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;23:1:-1;8:100;33:3;30:1;27:10;8:100;;;99:1;94:3;90:11;84:18;80:1;75:3;71:11;64:39;52:2;49:1;45:10;40:15;;8:100;;;12:14;429:84:0;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;57:18;;8:9:-1;5:2;;;30:1;27;20:12;5:2;57:18:0;;;:::i;:::-;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;23:1:-1;8:100;33:3;30:1;27:10;8:100;;;99:1;94:3;90:11;84:18;80:1;75:3;71:11;64:39;52:2;49:1;45:10;40:15;;8:100;;;12:14;57:18:0;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;705:1315;;8:9:-1;5:2;;;30:1;27;20:12;5:2;705:1315:0;;;;;;13:2:-1;8:3;5:11;2:2;;;29:1;26;19:12;2:2;705:1315:0;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;21:11:-1;8;5:28;2:2;;;46:1;43;36:12;2:2;705:1315:0;;35:9:-1;28:4;12:14;8:25;5:40;2:2;;;58:1;55;48:12;2:2;705:1315:0;;;;;;100:9:-1;95:1;81:12;77:20;67:8;63:35;60:50;39:11;25:12;22:29;11:107;8:2;;;131:1;128;121:12;8:2;705:1315:0;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;30:3:-1;22:6;14;1:33;99:1;93:3;85:6;81:16;74:27;137:4;133:9;126:4;121:3;117:14;113:30;106:37;;169:3;161:6;157:16;147:26;;705:1315:0;;;;;;;;;;;;;;;:::i;:::-;;;;;;;;;;;;;;;;;;;;;;;600:99;;;;;;13:2:-1;8:3;5:11;2:2;;;29:1;26;19:12;2:2;600:99:0;;;;;;;;;;;;;;;;;;;;;;;;;;;;:::i;:::-;;519:75;;8:9:-1;5:2;;;30:1;27;20:12;5:2;519:75:0;;;;;;13:2:-1;8:3;5:11;2:2;;;29:1;26;19:12;2:2;519:75:0;;;;;;;;;;21:11:-1;8;5:28;2:2;;;46:1;43;36:12;2:2;519:75:0;;35:9:-1;28:4;12:14;8:25;5:40;2:2;;;58:1;55;48:12;2:2;519:75:0;;;;;;100:9:-1;95:1;81:12;77:20;67:8;63:35;60:50;39:11;25:12;22:29;11:107;8:2;;;131:1;128;121:12;8:2;519:75:0;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;30:3:-1;22:6;14;1:33;99:1;93:3;85:6;81:16;74:27;137:4;133:9;126:4;121:3;117:14;113:30;106:37;;169:3;161:6;157:16;147:26;;519:75:0;;;;;;;;;;;;;;;:::i;:::-;;429:84;470:13;502:4;495:11;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;429:84;:::o;57:18::-;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;:::o;705:1315::-;817:4;837:15;855:4;:11;837:29;;876:11;935:4;929:11;1068:2;1062:4;1058:13;1733:1;1714;1606:10;1587:1;1564:5;1535:11;1190:5;1185:3;1181:15;1159:662;1149:672;;906:925;;1844:6;1840:151;;;1869:35;1879:11;1892:5;1899:4;1869:35;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;23:1:-1;8:100;33:3;30:1;27:10;8:100;;;99:1;94:3;90:11;84:18;80:1;75:3;71:11;64:39;52:2;49:1;45:10;40:15;;8:100;;;12:14;1869:35:0;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;1840:151;;;1938:42;1955:11;1968:5;1975:4;1938:42;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;23:1:-1;8:100;33:3;30:1;27:10;8:100;;;99:1;94:3;90:11;84:18;80:1;75:3;71:11;64:39;52:2;49:1;45:10;40:15;;8:100;;;12:14;1938:42:0;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;1840:151;2007:6;2000:13;;;;705:1315;;;;;:::o;600:99::-;674:2;:11;;:18;686:5;674:18;;;;;;;;;;;;;;;;;;;;;;;;8:9:-1;5:2;;;45:16;42:1;39;24:38;77:16;74:1;67:27;5:2;674:18:0;600:99;;:::o;519:75::-;582:5;575:4;:12;;;;;;;;;;;;:::i;:::-;;519:75;:::o;33:2026::-;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;:::i;:::-;;;:::o;:::-;;;;;;;;;;;;;;;;;;;;;;;;;;;:::o",
  "source": "pragma solidity >=0.5.0 <0.6.0;\n\ncontract DCWallet {\n    string public word;\n\n    event WordChanged(address indexed author, string oldValue, string newValue);\n    event Execution(address destination, uint value, bytes data);\n    event ExecutionFailure(address destination, uint value, bytes data);\n\n    constructor(string memory value) public {\n        word = value;\n        emit WordChanged(msg.sender, word, value);\n    }\n\n    function getValue() public view returns (string memory) {\n        return word;\n    }\n\n    function setValue(string memory value) public {\n        word = value;\n    }\n\n    function sendEth(address payable to, uint value) public payable {\n        to.transfer(value);\n    }\n\n    function executeTransaction(address destination, uint value, bytes memory data)\n        public\n        returns (bool)\n    {\n        uint dataLength = data.length;\n        bool result;\n        assembly {\n            let x := mload(0x40)   // \"Allocate\" memory for output (0x40 is where \"free memory\" pointer is stored by convention)\n            let d := add(data, 32) // First 32 bytes are the padded length of data, so exclude that\n            result := call(\n                sub(gas, 34710),   // 34710 is the value that solidity is currently emitting\n                                   // It includes callGas (700) + callVeryLow (3, to pay for SUB) + callValueTransferGas (9000) +\n                                   // callNewAccountGas (25000, in case the destination address does not exist and needs creating)\n                destination,\n                value,\n                d,\n                dataLength,        // Size of the input (in bytes) - this is what fixes the padding problem\n                x,\n                0                  // Output is ignored, therefore the output size is zero\n            )\n        }\n        if (result)\n            emit Execution(destination, value, data);\n        else {\n            emit ExecutionFailure(destination, value, data);\n        }\n        return result;\n    }\n\n    function () external payable {}\n}\n",
  "sourcePath": "/Users/tom/www/ethwaterloo-contract-account-metamask-plugin/truffle/contracts/DCWallet.sol",
  "ast": {
    "absolutePath": "/Users/tom/www/ethwaterloo-contract-account-metamask-plugin/truffle/contracts/DCWallet.sol",
    "exportedSymbols": {
      "DCWallet": [
        119
      ]
    },
    "id": 120,
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
        "baseContracts": [],
        "contractDependencies": [],
        "contractKind": "contract",
        "documentation": null,
        "fullyImplemented": true,
        "id": 119,
        "linearizedBaseContracts": [
          119
        ],
        "name": "DCWallet",
        "nodeType": "ContractDefinition",
        "nodes": [
          {
            "constant": false,
            "id": 3,
            "name": "word",
            "nodeType": "VariableDeclaration",
            "scope": 119,
            "src": "57:18:0",
            "stateVariable": true,
            "storageLocation": "default",
            "typeDescriptions": {
              "typeIdentifier": "t_string_storage",
              "typeString": "string"
            },
            "typeName": {
              "id": 2,
              "name": "string",
              "nodeType": "ElementaryTypeName",
              "src": "57:6:0",
              "typeDescriptions": {
                "typeIdentifier": "t_string_storage_ptr",
                "typeString": "string"
              }
            },
            "value": null,
            "visibility": "public"
          },
          {
            "anonymous": false,
            "documentation": null,
            "id": 11,
            "name": "WordChanged",
            "nodeType": "EventDefinition",
            "parameters": {
              "id": 10,
              "nodeType": "ParameterList",
              "parameters": [
                {
                  "constant": false,
                  "id": 5,
                  "indexed": true,
                  "name": "author",
                  "nodeType": "VariableDeclaration",
                  "scope": 11,
                  "src": "100:22:0",
                  "stateVariable": false,
                  "storageLocation": "default",
                  "typeDescriptions": {
                    "typeIdentifier": "t_address",
                    "typeString": "address"
                  },
                  "typeName": {
                    "id": 4,
                    "name": "address",
                    "nodeType": "ElementaryTypeName",
                    "src": "100:7:0",
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
                  "id": 7,
                  "indexed": false,
                  "name": "oldValue",
                  "nodeType": "VariableDeclaration",
                  "scope": 11,
                  "src": "124:15:0",
                  "stateVariable": false,
                  "storageLocation": "default",
                  "typeDescriptions": {
                    "typeIdentifier": "t_string_memory_ptr",
                    "typeString": "string"
                  },
                  "typeName": {
                    "id": 6,
                    "name": "string",
                    "nodeType": "ElementaryTypeName",
                    "src": "124:6:0",
                    "typeDescriptions": {
                      "typeIdentifier": "t_string_storage_ptr",
                      "typeString": "string"
                    }
                  },
                  "value": null,
                  "visibility": "internal"
                },
                {
                  "constant": false,
                  "id": 9,
                  "indexed": false,
                  "name": "newValue",
                  "nodeType": "VariableDeclaration",
                  "scope": 11,
                  "src": "141:15:0",
                  "stateVariable": false,
                  "storageLocation": "default",
                  "typeDescriptions": {
                    "typeIdentifier": "t_string_memory_ptr",
                    "typeString": "string"
                  },
                  "typeName": {
                    "id": 8,
                    "name": "string",
                    "nodeType": "ElementaryTypeName",
                    "src": "141:6:0",
                    "typeDescriptions": {
                      "typeIdentifier": "t_string_storage_ptr",
                      "typeString": "string"
                    }
                  },
                  "value": null,
                  "visibility": "internal"
                }
              ],
              "src": "99:58:0"
            },
            "src": "82:76:0"
          },
          {
            "anonymous": false,
            "documentation": null,
            "id": 19,
            "name": "Execution",
            "nodeType": "EventDefinition",
            "parameters": {
              "id": 18,
              "nodeType": "ParameterList",
              "parameters": [
                {
                  "constant": false,
                  "id": 13,
                  "indexed": false,
                  "name": "destination",
                  "nodeType": "VariableDeclaration",
                  "scope": 19,
                  "src": "179:19:0",
                  "stateVariable": false,
                  "storageLocation": "default",
                  "typeDescriptions": {
                    "typeIdentifier": "t_address",
                    "typeString": "address"
                  },
                  "typeName": {
                    "id": 12,
                    "name": "address",
                    "nodeType": "ElementaryTypeName",
                    "src": "179:7:0",
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
                  "id": 15,
                  "indexed": false,
                  "name": "value",
                  "nodeType": "VariableDeclaration",
                  "scope": 19,
                  "src": "200:10:0",
                  "stateVariable": false,
                  "storageLocation": "default",
                  "typeDescriptions": {
                    "typeIdentifier": "t_uint256",
                    "typeString": "uint256"
                  },
                  "typeName": {
                    "id": 14,
                    "name": "uint",
                    "nodeType": "ElementaryTypeName",
                    "src": "200:4:0",
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
                  "id": 17,
                  "indexed": false,
                  "name": "data",
                  "nodeType": "VariableDeclaration",
                  "scope": 19,
                  "src": "212:10:0",
                  "stateVariable": false,
                  "storageLocation": "default",
                  "typeDescriptions": {
                    "typeIdentifier": "t_bytes_memory_ptr",
                    "typeString": "bytes"
                  },
                  "typeName": {
                    "id": 16,
                    "name": "bytes",
                    "nodeType": "ElementaryTypeName",
                    "src": "212:5:0",
                    "typeDescriptions": {
                      "typeIdentifier": "t_bytes_storage_ptr",
                      "typeString": "bytes"
                    }
                  },
                  "value": null,
                  "visibility": "internal"
                }
              ],
              "src": "178:45:0"
            },
            "src": "163:61:0"
          },
          {
            "anonymous": false,
            "documentation": null,
            "id": 27,
            "name": "ExecutionFailure",
            "nodeType": "EventDefinition",
            "parameters": {
              "id": 26,
              "nodeType": "ParameterList",
              "parameters": [
                {
                  "constant": false,
                  "id": 21,
                  "indexed": false,
                  "name": "destination",
                  "nodeType": "VariableDeclaration",
                  "scope": 27,
                  "src": "252:19:0",
                  "stateVariable": false,
                  "storageLocation": "default",
                  "typeDescriptions": {
                    "typeIdentifier": "t_address",
                    "typeString": "address"
                  },
                  "typeName": {
                    "id": 20,
                    "name": "address",
                    "nodeType": "ElementaryTypeName",
                    "src": "252:7:0",
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
                  "id": 23,
                  "indexed": false,
                  "name": "value",
                  "nodeType": "VariableDeclaration",
                  "scope": 27,
                  "src": "273:10:0",
                  "stateVariable": false,
                  "storageLocation": "default",
                  "typeDescriptions": {
                    "typeIdentifier": "t_uint256",
                    "typeString": "uint256"
                  },
                  "typeName": {
                    "id": 22,
                    "name": "uint",
                    "nodeType": "ElementaryTypeName",
                    "src": "273:4:0",
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
                  "id": 25,
                  "indexed": false,
                  "name": "data",
                  "nodeType": "VariableDeclaration",
                  "scope": 27,
                  "src": "285:10:0",
                  "stateVariable": false,
                  "storageLocation": "default",
                  "typeDescriptions": {
                    "typeIdentifier": "t_bytes_memory_ptr",
                    "typeString": "bytes"
                  },
                  "typeName": {
                    "id": 24,
                    "name": "bytes",
                    "nodeType": "ElementaryTypeName",
                    "src": "285:5:0",
                    "typeDescriptions": {
                      "typeIdentifier": "t_bytes_storage_ptr",
                      "typeString": "bytes"
                    }
                  },
                  "value": null,
                  "visibility": "internal"
                }
              ],
              "src": "251:45:0"
            },
            "src": "229:68:0"
          },
          {
            "body": {
              "id": 43,
              "nodeType": "Block",
              "src": "343:80:0",
              "statements": [
                {
                  "expression": {
                    "argumentTypes": null,
                    "id": 34,
                    "isConstant": false,
                    "isLValue": false,
                    "isPure": false,
                    "lValueRequested": false,
                    "leftHandSide": {
                      "argumentTypes": null,
                      "id": 32,
                      "name": "word",
                      "nodeType": "Identifier",
                      "overloadedDeclarations": [],
                      "referencedDeclaration": 3,
                      "src": "353:4:0",
                      "typeDescriptions": {
                        "typeIdentifier": "t_string_storage",
                        "typeString": "string storage ref"
                      }
                    },
                    "nodeType": "Assignment",
                    "operator": "=",
                    "rightHandSide": {
                      "argumentTypes": null,
                      "id": 33,
                      "name": "value",
                      "nodeType": "Identifier",
                      "overloadedDeclarations": [],
                      "referencedDeclaration": 29,
                      "src": "360:5:0",
                      "typeDescriptions": {
                        "typeIdentifier": "t_string_memory_ptr",
                        "typeString": "string memory"
                      }
                    },
                    "src": "353:12:0",
                    "typeDescriptions": {
                      "typeIdentifier": "t_string_storage",
                      "typeString": "string storage ref"
                    }
                  },
                  "id": 35,
                  "nodeType": "ExpressionStatement",
                  "src": "353:12:0"
                },
                {
                  "eventCall": {
                    "argumentTypes": null,
                    "arguments": [
                      {
                        "argumentTypes": null,
                        "expression": {
                          "argumentTypes": null,
                          "id": 37,
                          "name": "msg",
                          "nodeType": "Identifier",
                          "overloadedDeclarations": [],
                          "referencedDeclaration": 191,
                          "src": "392:3:0",
                          "typeDescriptions": {
                            "typeIdentifier": "t_magic_message",
                            "typeString": "msg"
                          }
                        },
                        "id": 38,
                        "isConstant": false,
                        "isLValue": false,
                        "isPure": false,
                        "lValueRequested": false,
                        "memberName": "sender",
                        "nodeType": "MemberAccess",
                        "referencedDeclaration": null,
                        "src": "392:10:0",
                        "typeDescriptions": {
                          "typeIdentifier": "t_address_payable",
                          "typeString": "address payable"
                        }
                      },
                      {
                        "argumentTypes": null,
                        "id": 39,
                        "name": "word",
                        "nodeType": "Identifier",
                        "overloadedDeclarations": [],
                        "referencedDeclaration": 3,
                        "src": "404:4:0",
                        "typeDescriptions": {
                          "typeIdentifier": "t_string_storage",
                          "typeString": "string storage ref"
                        }
                      },
                      {
                        "argumentTypes": null,
                        "id": 40,
                        "name": "value",
                        "nodeType": "Identifier",
                        "overloadedDeclarations": [],
                        "referencedDeclaration": 29,
                        "src": "410:5:0",
                        "typeDescriptions": {
                          "typeIdentifier": "t_string_memory_ptr",
                          "typeString": "string memory"
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
                          "typeIdentifier": "t_string_storage",
                          "typeString": "string storage ref"
                        },
                        {
                          "typeIdentifier": "t_string_memory_ptr",
                          "typeString": "string memory"
                        }
                      ],
                      "id": 36,
                      "name": "WordChanged",
                      "nodeType": "Identifier",
                      "overloadedDeclarations": [],
                      "referencedDeclaration": 11,
                      "src": "380:11:0",
                      "typeDescriptions": {
                        "typeIdentifier": "t_function_event_nonpayable$_t_address_$_t_string_memory_ptr_$_t_string_memory_ptr_$returns$__$",
                        "typeString": "function (address,string memory,string memory)"
                      }
                    },
                    "id": 41,
                    "isConstant": false,
                    "isLValue": false,
                    "isPure": false,
                    "kind": "functionCall",
                    "lValueRequested": false,
                    "names": [],
                    "nodeType": "FunctionCall",
                    "src": "380:36:0",
                    "typeDescriptions": {
                      "typeIdentifier": "t_tuple$__$",
                      "typeString": "tuple()"
                    }
                  },
                  "id": 42,
                  "nodeType": "EmitStatement",
                  "src": "375:41:0"
                }
              ]
            },
            "documentation": null,
            "id": 44,
            "implemented": true,
            "kind": "constructor",
            "modifiers": [],
            "name": "",
            "nodeType": "FunctionDefinition",
            "parameters": {
              "id": 30,
              "nodeType": "ParameterList",
              "parameters": [
                {
                  "constant": false,
                  "id": 29,
                  "name": "value",
                  "nodeType": "VariableDeclaration",
                  "scope": 44,
                  "src": "315:19:0",
                  "stateVariable": false,
                  "storageLocation": "memory",
                  "typeDescriptions": {
                    "typeIdentifier": "t_string_memory_ptr",
                    "typeString": "string"
                  },
                  "typeName": {
                    "id": 28,
                    "name": "string",
                    "nodeType": "ElementaryTypeName",
                    "src": "315:6:0",
                    "typeDescriptions": {
                      "typeIdentifier": "t_string_storage_ptr",
                      "typeString": "string"
                    }
                  },
                  "value": null,
                  "visibility": "internal"
                }
              ],
              "src": "314:21:0"
            },
            "returnParameters": {
              "id": 31,
              "nodeType": "ParameterList",
              "parameters": [],
              "src": "343:0:0"
            },
            "scope": 119,
            "src": "303:120:0",
            "stateMutability": "nonpayable",
            "superFunction": null,
            "visibility": "public"
          },
          {
            "body": {
              "id": 51,
              "nodeType": "Block",
              "src": "485:28:0",
              "statements": [
                {
                  "expression": {
                    "argumentTypes": null,
                    "id": 49,
                    "name": "word",
                    "nodeType": "Identifier",
                    "overloadedDeclarations": [],
                    "referencedDeclaration": 3,
                    "src": "502:4:0",
                    "typeDescriptions": {
                      "typeIdentifier": "t_string_storage",
                      "typeString": "string storage ref"
                    }
                  },
                  "functionReturnParameters": 48,
                  "id": 50,
                  "nodeType": "Return",
                  "src": "495:11:0"
                }
              ]
            },
            "documentation": null,
            "id": 52,
            "implemented": true,
            "kind": "function",
            "modifiers": [],
            "name": "getValue",
            "nodeType": "FunctionDefinition",
            "parameters": {
              "id": 45,
              "nodeType": "ParameterList",
              "parameters": [],
              "src": "446:2:0"
            },
            "returnParameters": {
              "id": 48,
              "nodeType": "ParameterList",
              "parameters": [
                {
                  "constant": false,
                  "id": 47,
                  "name": "",
                  "nodeType": "VariableDeclaration",
                  "scope": 52,
                  "src": "470:13:0",
                  "stateVariable": false,
                  "storageLocation": "memory",
                  "typeDescriptions": {
                    "typeIdentifier": "t_string_memory_ptr",
                    "typeString": "string"
                  },
                  "typeName": {
                    "id": 46,
                    "name": "string",
                    "nodeType": "ElementaryTypeName",
                    "src": "470:6:0",
                    "typeDescriptions": {
                      "typeIdentifier": "t_string_storage_ptr",
                      "typeString": "string"
                    }
                  },
                  "value": null,
                  "visibility": "internal"
                }
              ],
              "src": "469:15:0"
            },
            "scope": 119,
            "src": "429:84:0",
            "stateMutability": "view",
            "superFunction": null,
            "visibility": "public"
          },
          {
            "body": {
              "id": 61,
              "nodeType": "Block",
              "src": "565:29:0",
              "statements": [
                {
                  "expression": {
                    "argumentTypes": null,
                    "id": 59,
                    "isConstant": false,
                    "isLValue": false,
                    "isPure": false,
                    "lValueRequested": false,
                    "leftHandSide": {
                      "argumentTypes": null,
                      "id": 57,
                      "name": "word",
                      "nodeType": "Identifier",
                      "overloadedDeclarations": [],
                      "referencedDeclaration": 3,
                      "src": "575:4:0",
                      "typeDescriptions": {
                        "typeIdentifier": "t_string_storage",
                        "typeString": "string storage ref"
                      }
                    },
                    "nodeType": "Assignment",
                    "operator": "=",
                    "rightHandSide": {
                      "argumentTypes": null,
                      "id": 58,
                      "name": "value",
                      "nodeType": "Identifier",
                      "overloadedDeclarations": [],
                      "referencedDeclaration": 54,
                      "src": "582:5:0",
                      "typeDescriptions": {
                        "typeIdentifier": "t_string_memory_ptr",
                        "typeString": "string memory"
                      }
                    },
                    "src": "575:12:0",
                    "typeDescriptions": {
                      "typeIdentifier": "t_string_storage",
                      "typeString": "string storage ref"
                    }
                  },
                  "id": 60,
                  "nodeType": "ExpressionStatement",
                  "src": "575:12:0"
                }
              ]
            },
            "documentation": null,
            "id": 62,
            "implemented": true,
            "kind": "function",
            "modifiers": [],
            "name": "setValue",
            "nodeType": "FunctionDefinition",
            "parameters": {
              "id": 55,
              "nodeType": "ParameterList",
              "parameters": [
                {
                  "constant": false,
                  "id": 54,
                  "name": "value",
                  "nodeType": "VariableDeclaration",
                  "scope": 62,
                  "src": "537:19:0",
                  "stateVariable": false,
                  "storageLocation": "memory",
                  "typeDescriptions": {
                    "typeIdentifier": "t_string_memory_ptr",
                    "typeString": "string"
                  },
                  "typeName": {
                    "id": 53,
                    "name": "string",
                    "nodeType": "ElementaryTypeName",
                    "src": "537:6:0",
                    "typeDescriptions": {
                      "typeIdentifier": "t_string_storage_ptr",
                      "typeString": "string"
                    }
                  },
                  "value": null,
                  "visibility": "internal"
                }
              ],
              "src": "536:21:0"
            },
            "returnParameters": {
              "id": 56,
              "nodeType": "ParameterList",
              "parameters": [],
              "src": "565:0:0"
            },
            "scope": 119,
            "src": "519:75:0",
            "stateMutability": "nonpayable",
            "superFunction": null,
            "visibility": "public"
          },
          {
            "body": {
              "id": 75,
              "nodeType": "Block",
              "src": "664:35:0",
              "statements": [
                {
                  "expression": {
                    "argumentTypes": null,
                    "arguments": [
                      {
                        "argumentTypes": null,
                        "id": 72,
                        "name": "value",
                        "nodeType": "Identifier",
                        "overloadedDeclarations": [],
                        "referencedDeclaration": 66,
                        "src": "686:5:0",
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
                        "id": 69,
                        "name": "to",
                        "nodeType": "Identifier",
                        "overloadedDeclarations": [],
                        "referencedDeclaration": 64,
                        "src": "674:2:0",
                        "typeDescriptions": {
                          "typeIdentifier": "t_address_payable",
                          "typeString": "address payable"
                        }
                      },
                      "id": 71,
                      "isConstant": false,
                      "isLValue": false,
                      "isPure": false,
                      "lValueRequested": false,
                      "memberName": "transfer",
                      "nodeType": "MemberAccess",
                      "referencedDeclaration": null,
                      "src": "674:11:0",
                      "typeDescriptions": {
                        "typeIdentifier": "t_function_transfer_nonpayable$_t_uint256_$returns$__$",
                        "typeString": "function (uint256)"
                      }
                    },
                    "id": 73,
                    "isConstant": false,
                    "isLValue": false,
                    "isPure": false,
                    "kind": "functionCall",
                    "lValueRequested": false,
                    "names": [],
                    "nodeType": "FunctionCall",
                    "src": "674:18:0",
                    "typeDescriptions": {
                      "typeIdentifier": "t_tuple$__$",
                      "typeString": "tuple()"
                    }
                  },
                  "id": 74,
                  "nodeType": "ExpressionStatement",
                  "src": "674:18:0"
                }
              ]
            },
            "documentation": null,
            "id": 76,
            "implemented": true,
            "kind": "function",
            "modifiers": [],
            "name": "sendEth",
            "nodeType": "FunctionDefinition",
            "parameters": {
              "id": 67,
              "nodeType": "ParameterList",
              "parameters": [
                {
                  "constant": false,
                  "id": 64,
                  "name": "to",
                  "nodeType": "VariableDeclaration",
                  "scope": 76,
                  "src": "617:18:0",
                  "stateVariable": false,
                  "storageLocation": "default",
                  "typeDescriptions": {
                    "typeIdentifier": "t_address_payable",
                    "typeString": "address payable"
                  },
                  "typeName": {
                    "id": 63,
                    "name": "address",
                    "nodeType": "ElementaryTypeName",
                    "src": "617:15:0",
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
                  "id": 66,
                  "name": "value",
                  "nodeType": "VariableDeclaration",
                  "scope": 76,
                  "src": "637:10:0",
                  "stateVariable": false,
                  "storageLocation": "default",
                  "typeDescriptions": {
                    "typeIdentifier": "t_uint256",
                    "typeString": "uint256"
                  },
                  "typeName": {
                    "id": 65,
                    "name": "uint",
                    "nodeType": "ElementaryTypeName",
                    "src": "637:4:0",
                    "typeDescriptions": {
                      "typeIdentifier": "t_uint256",
                      "typeString": "uint256"
                    }
                  },
                  "value": null,
                  "visibility": "internal"
                }
              ],
              "src": "616:32:0"
            },
            "returnParameters": {
              "id": 68,
              "nodeType": "ParameterList",
              "parameters": [],
              "src": "664:0:0"
            },
            "scope": 119,
            "src": "600:99:0",
            "stateMutability": "payable",
            "superFunction": null,
            "visibility": "public"
          },
          {
            "body": {
              "id": 113,
              "nodeType": "Block",
              "src": "827:1193:0",
              "statements": [
                {
                  "assignments": [
                    88
                  ],
                  "declarations": [
                    {
                      "constant": false,
                      "id": 88,
                      "name": "dataLength",
                      "nodeType": "VariableDeclaration",
                      "scope": 113,
                      "src": "837:15:0",
                      "stateVariable": false,
                      "storageLocation": "default",
                      "typeDescriptions": {
                        "typeIdentifier": "t_uint256",
                        "typeString": "uint256"
                      },
                      "typeName": {
                        "id": 87,
                        "name": "uint",
                        "nodeType": "ElementaryTypeName",
                        "src": "837:4:0",
                        "typeDescriptions": {
                          "typeIdentifier": "t_uint256",
                          "typeString": "uint256"
                        }
                      },
                      "value": null,
                      "visibility": "internal"
                    }
                  ],
                  "id": 91,
                  "initialValue": {
                    "argumentTypes": null,
                    "expression": {
                      "argumentTypes": null,
                      "id": 89,
                      "name": "data",
                      "nodeType": "Identifier",
                      "overloadedDeclarations": [],
                      "referencedDeclaration": 82,
                      "src": "855:4:0",
                      "typeDescriptions": {
                        "typeIdentifier": "t_bytes_memory_ptr",
                        "typeString": "bytes memory"
                      }
                    },
                    "id": 90,
                    "isConstant": false,
                    "isLValue": false,
                    "isPure": false,
                    "lValueRequested": false,
                    "memberName": "length",
                    "nodeType": "MemberAccess",
                    "referencedDeclaration": null,
                    "src": "855:11:0",
                    "typeDescriptions": {
                      "typeIdentifier": "t_uint256",
                      "typeString": "uint256"
                    }
                  },
                  "nodeType": "VariableDeclarationStatement",
                  "src": "837:29:0"
                },
                {
                  "assignments": [
                    93
                  ],
                  "declarations": [
                    {
                      "constant": false,
                      "id": 93,
                      "name": "result",
                      "nodeType": "VariableDeclaration",
                      "scope": 113,
                      "src": "876:11:0",
                      "stateVariable": false,
                      "storageLocation": "default",
                      "typeDescriptions": {
                        "typeIdentifier": "t_bool",
                        "typeString": "bool"
                      },
                      "typeName": {
                        "id": 92,
                        "name": "bool",
                        "nodeType": "ElementaryTypeName",
                        "src": "876:4:0",
                        "typeDescriptions": {
                          "typeIdentifier": "t_bool",
                          "typeString": "bool"
                        }
                      },
                      "value": null,
                      "visibility": "internal"
                    }
                  ],
                  "id": 94,
                  "initialValue": null,
                  "nodeType": "VariableDeclarationStatement",
                  "src": "876:11:0"
                },
                {
                  "externalReferences": [
                    {
                      "result": {
                        "declaration": 93,
                        "isOffset": false,
                        "isSlot": false,
                        "src": "1149:6:0",
                        "valueSize": 1
                      }
                    },
                    {
                      "data": {
                        "declaration": 82,
                        "isOffset": false,
                        "isSlot": false,
                        "src": "1062:4:0",
                        "valueSize": 1
                      }
                    },
                    {
                      "destination": {
                        "declaration": 78,
                        "isOffset": false,
                        "isSlot": false,
                        "src": "1535:11:0",
                        "valueSize": 1
                      }
                    },
                    {
                      "value": {
                        "declaration": 80,
                        "isOffset": false,
                        "isSlot": false,
                        "src": "1564:5:0",
                        "valueSize": 1
                      }
                    },
                    {
                      "dataLength": {
                        "declaration": 88,
                        "isOffset": false,
                        "isSlot": false,
                        "src": "1606:10:0",
                        "valueSize": 1
                      }
                    }
                  ],
                  "id": 95,
                  "nodeType": "InlineAssembly",
                  "operations": "{\n    let x := mload(0x40)\n    let d := add(data, 32)\n    result := call(sub(gas(), 34710), destination, value, d, dataLength, x, 0)\n}",
                  "src": "897:934:0"
                },
                {
                  "condition": {
                    "argumentTypes": null,
                    "id": 96,
                    "name": "result",
                    "nodeType": "Identifier",
                    "overloadedDeclarations": [],
                    "referencedDeclaration": 93,
                    "src": "1844:6:0",
                    "typeDescriptions": {
                      "typeIdentifier": "t_bool",
                      "typeString": "bool"
                    }
                  },
                  "falseBody": {
                    "id": 109,
                    "nodeType": "Block",
                    "src": "1919:72:0",
                    "statements": [
                      {
                        "eventCall": {
                          "argumentTypes": null,
                          "arguments": [
                            {
                              "argumentTypes": null,
                              "id": 104,
                              "name": "destination",
                              "nodeType": "Identifier",
                              "overloadedDeclarations": [],
                              "referencedDeclaration": 78,
                              "src": "1955:11:0",
                              "typeDescriptions": {
                                "typeIdentifier": "t_address",
                                "typeString": "address"
                              }
                            },
                            {
                              "argumentTypes": null,
                              "id": 105,
                              "name": "value",
                              "nodeType": "Identifier",
                              "overloadedDeclarations": [],
                              "referencedDeclaration": 80,
                              "src": "1968:5:0",
                              "typeDescriptions": {
                                "typeIdentifier": "t_uint256",
                                "typeString": "uint256"
                              }
                            },
                            {
                              "argumentTypes": null,
                              "id": 106,
                              "name": "data",
                              "nodeType": "Identifier",
                              "overloadedDeclarations": [],
                              "referencedDeclaration": 82,
                              "src": "1975:4:0",
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
                            "id": 103,
                            "name": "ExecutionFailure",
                            "nodeType": "Identifier",
                            "overloadedDeclarations": [],
                            "referencedDeclaration": 27,
                            "src": "1938:16:0",
                            "typeDescriptions": {
                              "typeIdentifier": "t_function_event_nonpayable$_t_address_$_t_uint256_$_t_bytes_memory_ptr_$returns$__$",
                              "typeString": "function (address,uint256,bytes memory)"
                            }
                          },
                          "id": 107,
                          "isConstant": false,
                          "isLValue": false,
                          "isPure": false,
                          "kind": "functionCall",
                          "lValueRequested": false,
                          "names": [],
                          "nodeType": "FunctionCall",
                          "src": "1938:42:0",
                          "typeDescriptions": {
                            "typeIdentifier": "t_tuple$__$",
                            "typeString": "tuple()"
                          }
                        },
                        "id": 108,
                        "nodeType": "EmitStatement",
                        "src": "1933:47:0"
                      }
                    ]
                  },
                  "id": 110,
                  "nodeType": "IfStatement",
                  "src": "1840:151:0",
                  "trueBody": {
                    "eventCall": {
                      "argumentTypes": null,
                      "arguments": [
                        {
                          "argumentTypes": null,
                          "id": 98,
                          "name": "destination",
                          "nodeType": "Identifier",
                          "overloadedDeclarations": [],
                          "referencedDeclaration": 78,
                          "src": "1879:11:0",
                          "typeDescriptions": {
                            "typeIdentifier": "t_address",
                            "typeString": "address"
                          }
                        },
                        {
                          "argumentTypes": null,
                          "id": 99,
                          "name": "value",
                          "nodeType": "Identifier",
                          "overloadedDeclarations": [],
                          "referencedDeclaration": 80,
                          "src": "1892:5:0",
                          "typeDescriptions": {
                            "typeIdentifier": "t_uint256",
                            "typeString": "uint256"
                          }
                        },
                        {
                          "argumentTypes": null,
                          "id": 100,
                          "name": "data",
                          "nodeType": "Identifier",
                          "overloadedDeclarations": [],
                          "referencedDeclaration": 82,
                          "src": "1899:4:0",
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
                        "id": 97,
                        "name": "Execution",
                        "nodeType": "Identifier",
                        "overloadedDeclarations": [],
                        "referencedDeclaration": 19,
                        "src": "1869:9:0",
                        "typeDescriptions": {
                          "typeIdentifier": "t_function_event_nonpayable$_t_address_$_t_uint256_$_t_bytes_memory_ptr_$returns$__$",
                          "typeString": "function (address,uint256,bytes memory)"
                        }
                      },
                      "id": 101,
                      "isConstant": false,
                      "isLValue": false,
                      "isPure": false,
                      "kind": "functionCall",
                      "lValueRequested": false,
                      "names": [],
                      "nodeType": "FunctionCall",
                      "src": "1869:35:0",
                      "typeDescriptions": {
                        "typeIdentifier": "t_tuple$__$",
                        "typeString": "tuple()"
                      }
                    },
                    "id": 102,
                    "nodeType": "EmitStatement",
                    "src": "1864:40:0"
                  }
                },
                {
                  "expression": {
                    "argumentTypes": null,
                    "id": 111,
                    "name": "result",
                    "nodeType": "Identifier",
                    "overloadedDeclarations": [],
                    "referencedDeclaration": 93,
                    "src": "2007:6:0",
                    "typeDescriptions": {
                      "typeIdentifier": "t_bool",
                      "typeString": "bool"
                    }
                  },
                  "functionReturnParameters": 86,
                  "id": 112,
                  "nodeType": "Return",
                  "src": "2000:13:0"
                }
              ]
            },
            "documentation": null,
            "id": 114,
            "implemented": true,
            "kind": "function",
            "modifiers": [],
            "name": "executeTransaction",
            "nodeType": "FunctionDefinition",
            "parameters": {
              "id": 83,
              "nodeType": "ParameterList",
              "parameters": [
                {
                  "constant": false,
                  "id": 78,
                  "name": "destination",
                  "nodeType": "VariableDeclaration",
                  "scope": 114,
                  "src": "733:19:0",
                  "stateVariable": false,
                  "storageLocation": "default",
                  "typeDescriptions": {
                    "typeIdentifier": "t_address",
                    "typeString": "address"
                  },
                  "typeName": {
                    "id": 77,
                    "name": "address",
                    "nodeType": "ElementaryTypeName",
                    "src": "733:7:0",
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
                  "id": 80,
                  "name": "value",
                  "nodeType": "VariableDeclaration",
                  "scope": 114,
                  "src": "754:10:0",
                  "stateVariable": false,
                  "storageLocation": "default",
                  "typeDescriptions": {
                    "typeIdentifier": "t_uint256",
                    "typeString": "uint256"
                  },
                  "typeName": {
                    "id": 79,
                    "name": "uint",
                    "nodeType": "ElementaryTypeName",
                    "src": "754:4:0",
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
                  "id": 82,
                  "name": "data",
                  "nodeType": "VariableDeclaration",
                  "scope": 114,
                  "src": "766:17:0",
                  "stateVariable": false,
                  "storageLocation": "memory",
                  "typeDescriptions": {
                    "typeIdentifier": "t_bytes_memory_ptr",
                    "typeString": "bytes"
                  },
                  "typeName": {
                    "id": 81,
                    "name": "bytes",
                    "nodeType": "ElementaryTypeName",
                    "src": "766:5:0",
                    "typeDescriptions": {
                      "typeIdentifier": "t_bytes_storage_ptr",
                      "typeString": "bytes"
                    }
                  },
                  "value": null,
                  "visibility": "internal"
                }
              ],
              "src": "732:52:0"
            },
            "returnParameters": {
              "id": 86,
              "nodeType": "ParameterList",
              "parameters": [
                {
                  "constant": false,
                  "id": 85,
                  "name": "",
                  "nodeType": "VariableDeclaration",
                  "scope": 114,
                  "src": "817:4:0",
                  "stateVariable": false,
                  "storageLocation": "default",
                  "typeDescriptions": {
                    "typeIdentifier": "t_bool",
                    "typeString": "bool"
                  },
                  "typeName": {
                    "id": 84,
                    "name": "bool",
                    "nodeType": "ElementaryTypeName",
                    "src": "817:4:0",
                    "typeDescriptions": {
                      "typeIdentifier": "t_bool",
                      "typeString": "bool"
                    }
                  },
                  "value": null,
                  "visibility": "internal"
                }
              ],
              "src": "816:6:0"
            },
            "scope": 119,
            "src": "705:1315:0",
            "stateMutability": "nonpayable",
            "superFunction": null,
            "visibility": "public"
          },
          {
            "body": {
              "id": 117,
              "nodeType": "Block",
              "src": "2055:2:0",
              "statements": []
            },
            "documentation": null,
            "id": 118,
            "implemented": true,
            "kind": "fallback",
            "modifiers": [],
            "name": "",
            "nodeType": "FunctionDefinition",
            "parameters": {
              "id": 115,
              "nodeType": "ParameterList",
              "parameters": [],
              "src": "2035:2:0"
            },
            "returnParameters": {
              "id": 116,
              "nodeType": "ParameterList",
              "parameters": [],
              "src": "2055:0:0"
            },
            "scope": 119,
            "src": "2026:31:0",
            "stateMutability": "payable",
            "superFunction": null,
            "visibility": "external"
          }
        ],
        "scope": 120,
        "src": "33:2026:0"
      }
    ],
    "src": "0:2060:0"
  },
  "legacyAST": {
    "absolutePath": "/Users/tom/www/ethwaterloo-contract-account-metamask-plugin/truffle/contracts/DCWallet.sol",
    "exportedSymbols": {
      "DCWallet": [
        119
      ]
    },
    "id": 120,
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
        "baseContracts": [],
        "contractDependencies": [],
        "contractKind": "contract",
        "documentation": null,
        "fullyImplemented": true,
        "id": 119,
        "linearizedBaseContracts": [
          119
        ],
        "name": "DCWallet",
        "nodeType": "ContractDefinition",
        "nodes": [
          {
            "constant": false,
            "id": 3,
            "name": "word",
            "nodeType": "VariableDeclaration",
            "scope": 119,
            "src": "57:18:0",
            "stateVariable": true,
            "storageLocation": "default",
            "typeDescriptions": {
              "typeIdentifier": "t_string_storage",
              "typeString": "string"
            },
            "typeName": {
              "id": 2,
              "name": "string",
              "nodeType": "ElementaryTypeName",
              "src": "57:6:0",
              "typeDescriptions": {
                "typeIdentifier": "t_string_storage_ptr",
                "typeString": "string"
              }
            },
            "value": null,
            "visibility": "public"
          },
          {
            "anonymous": false,
            "documentation": null,
            "id": 11,
            "name": "WordChanged",
            "nodeType": "EventDefinition",
            "parameters": {
              "id": 10,
              "nodeType": "ParameterList",
              "parameters": [
                {
                  "constant": false,
                  "id": 5,
                  "indexed": true,
                  "name": "author",
                  "nodeType": "VariableDeclaration",
                  "scope": 11,
                  "src": "100:22:0",
                  "stateVariable": false,
                  "storageLocation": "default",
                  "typeDescriptions": {
                    "typeIdentifier": "t_address",
                    "typeString": "address"
                  },
                  "typeName": {
                    "id": 4,
                    "name": "address",
                    "nodeType": "ElementaryTypeName",
                    "src": "100:7:0",
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
                  "id": 7,
                  "indexed": false,
                  "name": "oldValue",
                  "nodeType": "VariableDeclaration",
                  "scope": 11,
                  "src": "124:15:0",
                  "stateVariable": false,
                  "storageLocation": "default",
                  "typeDescriptions": {
                    "typeIdentifier": "t_string_memory_ptr",
                    "typeString": "string"
                  },
                  "typeName": {
                    "id": 6,
                    "name": "string",
                    "nodeType": "ElementaryTypeName",
                    "src": "124:6:0",
                    "typeDescriptions": {
                      "typeIdentifier": "t_string_storage_ptr",
                      "typeString": "string"
                    }
                  },
                  "value": null,
                  "visibility": "internal"
                },
                {
                  "constant": false,
                  "id": 9,
                  "indexed": false,
                  "name": "newValue",
                  "nodeType": "VariableDeclaration",
                  "scope": 11,
                  "src": "141:15:0",
                  "stateVariable": false,
                  "storageLocation": "default",
                  "typeDescriptions": {
                    "typeIdentifier": "t_string_memory_ptr",
                    "typeString": "string"
                  },
                  "typeName": {
                    "id": 8,
                    "name": "string",
                    "nodeType": "ElementaryTypeName",
                    "src": "141:6:0",
                    "typeDescriptions": {
                      "typeIdentifier": "t_string_storage_ptr",
                      "typeString": "string"
                    }
                  },
                  "value": null,
                  "visibility": "internal"
                }
              ],
              "src": "99:58:0"
            },
            "src": "82:76:0"
          },
          {
            "anonymous": false,
            "documentation": null,
            "id": 19,
            "name": "Execution",
            "nodeType": "EventDefinition",
            "parameters": {
              "id": 18,
              "nodeType": "ParameterList",
              "parameters": [
                {
                  "constant": false,
                  "id": 13,
                  "indexed": false,
                  "name": "destination",
                  "nodeType": "VariableDeclaration",
                  "scope": 19,
                  "src": "179:19:0",
                  "stateVariable": false,
                  "storageLocation": "default",
                  "typeDescriptions": {
                    "typeIdentifier": "t_address",
                    "typeString": "address"
                  },
                  "typeName": {
                    "id": 12,
                    "name": "address",
                    "nodeType": "ElementaryTypeName",
                    "src": "179:7:0",
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
                  "id": 15,
                  "indexed": false,
                  "name": "value",
                  "nodeType": "VariableDeclaration",
                  "scope": 19,
                  "src": "200:10:0",
                  "stateVariable": false,
                  "storageLocation": "default",
                  "typeDescriptions": {
                    "typeIdentifier": "t_uint256",
                    "typeString": "uint256"
                  },
                  "typeName": {
                    "id": 14,
                    "name": "uint",
                    "nodeType": "ElementaryTypeName",
                    "src": "200:4:0",
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
                  "id": 17,
                  "indexed": false,
                  "name": "data",
                  "nodeType": "VariableDeclaration",
                  "scope": 19,
                  "src": "212:10:0",
                  "stateVariable": false,
                  "storageLocation": "default",
                  "typeDescriptions": {
                    "typeIdentifier": "t_bytes_memory_ptr",
                    "typeString": "bytes"
                  },
                  "typeName": {
                    "id": 16,
                    "name": "bytes",
                    "nodeType": "ElementaryTypeName",
                    "src": "212:5:0",
                    "typeDescriptions": {
                      "typeIdentifier": "t_bytes_storage_ptr",
                      "typeString": "bytes"
                    }
                  },
                  "value": null,
                  "visibility": "internal"
                }
              ],
              "src": "178:45:0"
            },
            "src": "163:61:0"
          },
          {
            "anonymous": false,
            "documentation": null,
            "id": 27,
            "name": "ExecutionFailure",
            "nodeType": "EventDefinition",
            "parameters": {
              "id": 26,
              "nodeType": "ParameterList",
              "parameters": [
                {
                  "constant": false,
                  "id": 21,
                  "indexed": false,
                  "name": "destination",
                  "nodeType": "VariableDeclaration",
                  "scope": 27,
                  "src": "252:19:0",
                  "stateVariable": false,
                  "storageLocation": "default",
                  "typeDescriptions": {
                    "typeIdentifier": "t_address",
                    "typeString": "address"
                  },
                  "typeName": {
                    "id": 20,
                    "name": "address",
                    "nodeType": "ElementaryTypeName",
                    "src": "252:7:0",
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
                  "id": 23,
                  "indexed": false,
                  "name": "value",
                  "nodeType": "VariableDeclaration",
                  "scope": 27,
                  "src": "273:10:0",
                  "stateVariable": false,
                  "storageLocation": "default",
                  "typeDescriptions": {
                    "typeIdentifier": "t_uint256",
                    "typeString": "uint256"
                  },
                  "typeName": {
                    "id": 22,
                    "name": "uint",
                    "nodeType": "ElementaryTypeName",
                    "src": "273:4:0",
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
                  "id": 25,
                  "indexed": false,
                  "name": "data",
                  "nodeType": "VariableDeclaration",
                  "scope": 27,
                  "src": "285:10:0",
                  "stateVariable": false,
                  "storageLocation": "default",
                  "typeDescriptions": {
                    "typeIdentifier": "t_bytes_memory_ptr",
                    "typeString": "bytes"
                  },
                  "typeName": {
                    "id": 24,
                    "name": "bytes",
                    "nodeType": "ElementaryTypeName",
                    "src": "285:5:0",
                    "typeDescriptions": {
                      "typeIdentifier": "t_bytes_storage_ptr",
                      "typeString": "bytes"
                    }
                  },
                  "value": null,
                  "visibility": "internal"
                }
              ],
              "src": "251:45:0"
            },
            "src": "229:68:0"
          },
          {
            "body": {
              "id": 43,
              "nodeType": "Block",
              "src": "343:80:0",
              "statements": [
                {
                  "expression": {
                    "argumentTypes": null,
                    "id": 34,
                    "isConstant": false,
                    "isLValue": false,
                    "isPure": false,
                    "lValueRequested": false,
                    "leftHandSide": {
                      "argumentTypes": null,
                      "id": 32,
                      "name": "word",
                      "nodeType": "Identifier",
                      "overloadedDeclarations": [],
                      "referencedDeclaration": 3,
                      "src": "353:4:0",
                      "typeDescriptions": {
                        "typeIdentifier": "t_string_storage",
                        "typeString": "string storage ref"
                      }
                    },
                    "nodeType": "Assignment",
                    "operator": "=",
                    "rightHandSide": {
                      "argumentTypes": null,
                      "id": 33,
                      "name": "value",
                      "nodeType": "Identifier",
                      "overloadedDeclarations": [],
                      "referencedDeclaration": 29,
                      "src": "360:5:0",
                      "typeDescriptions": {
                        "typeIdentifier": "t_string_memory_ptr",
                        "typeString": "string memory"
                      }
                    },
                    "src": "353:12:0",
                    "typeDescriptions": {
                      "typeIdentifier": "t_string_storage",
                      "typeString": "string storage ref"
                    }
                  },
                  "id": 35,
                  "nodeType": "ExpressionStatement",
                  "src": "353:12:0"
                },
                {
                  "eventCall": {
                    "argumentTypes": null,
                    "arguments": [
                      {
                        "argumentTypes": null,
                        "expression": {
                          "argumentTypes": null,
                          "id": 37,
                          "name": "msg",
                          "nodeType": "Identifier",
                          "overloadedDeclarations": [],
                          "referencedDeclaration": 191,
                          "src": "392:3:0",
                          "typeDescriptions": {
                            "typeIdentifier": "t_magic_message",
                            "typeString": "msg"
                          }
                        },
                        "id": 38,
                        "isConstant": false,
                        "isLValue": false,
                        "isPure": false,
                        "lValueRequested": false,
                        "memberName": "sender",
                        "nodeType": "MemberAccess",
                        "referencedDeclaration": null,
                        "src": "392:10:0",
                        "typeDescriptions": {
                          "typeIdentifier": "t_address_payable",
                          "typeString": "address payable"
                        }
                      },
                      {
                        "argumentTypes": null,
                        "id": 39,
                        "name": "word",
                        "nodeType": "Identifier",
                        "overloadedDeclarations": [],
                        "referencedDeclaration": 3,
                        "src": "404:4:0",
                        "typeDescriptions": {
                          "typeIdentifier": "t_string_storage",
                          "typeString": "string storage ref"
                        }
                      },
                      {
                        "argumentTypes": null,
                        "id": 40,
                        "name": "value",
                        "nodeType": "Identifier",
                        "overloadedDeclarations": [],
                        "referencedDeclaration": 29,
                        "src": "410:5:0",
                        "typeDescriptions": {
                          "typeIdentifier": "t_string_memory_ptr",
                          "typeString": "string memory"
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
                          "typeIdentifier": "t_string_storage",
                          "typeString": "string storage ref"
                        },
                        {
                          "typeIdentifier": "t_string_memory_ptr",
                          "typeString": "string memory"
                        }
                      ],
                      "id": 36,
                      "name": "WordChanged",
                      "nodeType": "Identifier",
                      "overloadedDeclarations": [],
                      "referencedDeclaration": 11,
                      "src": "380:11:0",
                      "typeDescriptions": {
                        "typeIdentifier": "t_function_event_nonpayable$_t_address_$_t_string_memory_ptr_$_t_string_memory_ptr_$returns$__$",
                        "typeString": "function (address,string memory,string memory)"
                      }
                    },
                    "id": 41,
                    "isConstant": false,
                    "isLValue": false,
                    "isPure": false,
                    "kind": "functionCall",
                    "lValueRequested": false,
                    "names": [],
                    "nodeType": "FunctionCall",
                    "src": "380:36:0",
                    "typeDescriptions": {
                      "typeIdentifier": "t_tuple$__$",
                      "typeString": "tuple()"
                    }
                  },
                  "id": 42,
                  "nodeType": "EmitStatement",
                  "src": "375:41:0"
                }
              ]
            },
            "documentation": null,
            "id": 44,
            "implemented": true,
            "kind": "constructor",
            "modifiers": [],
            "name": "",
            "nodeType": "FunctionDefinition",
            "parameters": {
              "id": 30,
              "nodeType": "ParameterList",
              "parameters": [
                {
                  "constant": false,
                  "id": 29,
                  "name": "value",
                  "nodeType": "VariableDeclaration",
                  "scope": 44,
                  "src": "315:19:0",
                  "stateVariable": false,
                  "storageLocation": "memory",
                  "typeDescriptions": {
                    "typeIdentifier": "t_string_memory_ptr",
                    "typeString": "string"
                  },
                  "typeName": {
                    "id": 28,
                    "name": "string",
                    "nodeType": "ElementaryTypeName",
                    "src": "315:6:0",
                    "typeDescriptions": {
                      "typeIdentifier": "t_string_storage_ptr",
                      "typeString": "string"
                    }
                  },
                  "value": null,
                  "visibility": "internal"
                }
              ],
              "src": "314:21:0"
            },
            "returnParameters": {
              "id": 31,
              "nodeType": "ParameterList",
              "parameters": [],
              "src": "343:0:0"
            },
            "scope": 119,
            "src": "303:120:0",
            "stateMutability": "nonpayable",
            "superFunction": null,
            "visibility": "public"
          },
          {
            "body": {
              "id": 51,
              "nodeType": "Block",
              "src": "485:28:0",
              "statements": [
                {
                  "expression": {
                    "argumentTypes": null,
                    "id": 49,
                    "name": "word",
                    "nodeType": "Identifier",
                    "overloadedDeclarations": [],
                    "referencedDeclaration": 3,
                    "src": "502:4:0",
                    "typeDescriptions": {
                      "typeIdentifier": "t_string_storage",
                      "typeString": "string storage ref"
                    }
                  },
                  "functionReturnParameters": 48,
                  "id": 50,
                  "nodeType": "Return",
                  "src": "495:11:0"
                }
              ]
            },
            "documentation": null,
            "id": 52,
            "implemented": true,
            "kind": "function",
            "modifiers": [],
            "name": "getValue",
            "nodeType": "FunctionDefinition",
            "parameters": {
              "id": 45,
              "nodeType": "ParameterList",
              "parameters": [],
              "src": "446:2:0"
            },
            "returnParameters": {
              "id": 48,
              "nodeType": "ParameterList",
              "parameters": [
                {
                  "constant": false,
                  "id": 47,
                  "name": "",
                  "nodeType": "VariableDeclaration",
                  "scope": 52,
                  "src": "470:13:0",
                  "stateVariable": false,
                  "storageLocation": "memory",
                  "typeDescriptions": {
                    "typeIdentifier": "t_string_memory_ptr",
                    "typeString": "string"
                  },
                  "typeName": {
                    "id": 46,
                    "name": "string",
                    "nodeType": "ElementaryTypeName",
                    "src": "470:6:0",
                    "typeDescriptions": {
                      "typeIdentifier": "t_string_storage_ptr",
                      "typeString": "string"
                    }
                  },
                  "value": null,
                  "visibility": "internal"
                }
              ],
              "src": "469:15:0"
            },
            "scope": 119,
            "src": "429:84:0",
            "stateMutability": "view",
            "superFunction": null,
            "visibility": "public"
          },
          {
            "body": {
              "id": 61,
              "nodeType": "Block",
              "src": "565:29:0",
              "statements": [
                {
                  "expression": {
                    "argumentTypes": null,
                    "id": 59,
                    "isConstant": false,
                    "isLValue": false,
                    "isPure": false,
                    "lValueRequested": false,
                    "leftHandSide": {
                      "argumentTypes": null,
                      "id": 57,
                      "name": "word",
                      "nodeType": "Identifier",
                      "overloadedDeclarations": [],
                      "referencedDeclaration": 3,
                      "src": "575:4:0",
                      "typeDescriptions": {
                        "typeIdentifier": "t_string_storage",
                        "typeString": "string storage ref"
                      }
                    },
                    "nodeType": "Assignment",
                    "operator": "=",
                    "rightHandSide": {
                      "argumentTypes": null,
                      "id": 58,
                      "name": "value",
                      "nodeType": "Identifier",
                      "overloadedDeclarations": [],
                      "referencedDeclaration": 54,
                      "src": "582:5:0",
                      "typeDescriptions": {
                        "typeIdentifier": "t_string_memory_ptr",
                        "typeString": "string memory"
                      }
                    },
                    "src": "575:12:0",
                    "typeDescriptions": {
                      "typeIdentifier": "t_string_storage",
                      "typeString": "string storage ref"
                    }
                  },
                  "id": 60,
                  "nodeType": "ExpressionStatement",
                  "src": "575:12:0"
                }
              ]
            },
            "documentation": null,
            "id": 62,
            "implemented": true,
            "kind": "function",
            "modifiers": [],
            "name": "setValue",
            "nodeType": "FunctionDefinition",
            "parameters": {
              "id": 55,
              "nodeType": "ParameterList",
              "parameters": [
                {
                  "constant": false,
                  "id": 54,
                  "name": "value",
                  "nodeType": "VariableDeclaration",
                  "scope": 62,
                  "src": "537:19:0",
                  "stateVariable": false,
                  "storageLocation": "memory",
                  "typeDescriptions": {
                    "typeIdentifier": "t_string_memory_ptr",
                    "typeString": "string"
                  },
                  "typeName": {
                    "id": 53,
                    "name": "string",
                    "nodeType": "ElementaryTypeName",
                    "src": "537:6:0",
                    "typeDescriptions": {
                      "typeIdentifier": "t_string_storage_ptr",
                      "typeString": "string"
                    }
                  },
                  "value": null,
                  "visibility": "internal"
                }
              ],
              "src": "536:21:0"
            },
            "returnParameters": {
              "id": 56,
              "nodeType": "ParameterList",
              "parameters": [],
              "src": "565:0:0"
            },
            "scope": 119,
            "src": "519:75:0",
            "stateMutability": "nonpayable",
            "superFunction": null,
            "visibility": "public"
          },
          {
            "body": {
              "id": 75,
              "nodeType": "Block",
              "src": "664:35:0",
              "statements": [
                {
                  "expression": {
                    "argumentTypes": null,
                    "arguments": [
                      {
                        "argumentTypes": null,
                        "id": 72,
                        "name": "value",
                        "nodeType": "Identifier",
                        "overloadedDeclarations": [],
                        "referencedDeclaration": 66,
                        "src": "686:5:0",
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
                        "id": 69,
                        "name": "to",
                        "nodeType": "Identifier",
                        "overloadedDeclarations": [],
                        "referencedDeclaration": 64,
                        "src": "674:2:0",
                        "typeDescriptions": {
                          "typeIdentifier": "t_address_payable",
                          "typeString": "address payable"
                        }
                      },
                      "id": 71,
                      "isConstant": false,
                      "isLValue": false,
                      "isPure": false,
                      "lValueRequested": false,
                      "memberName": "transfer",
                      "nodeType": "MemberAccess",
                      "referencedDeclaration": null,
                      "src": "674:11:0",
                      "typeDescriptions": {
                        "typeIdentifier": "t_function_transfer_nonpayable$_t_uint256_$returns$__$",
                        "typeString": "function (uint256)"
                      }
                    },
                    "id": 73,
                    "isConstant": false,
                    "isLValue": false,
                    "isPure": false,
                    "kind": "functionCall",
                    "lValueRequested": false,
                    "names": [],
                    "nodeType": "FunctionCall",
                    "src": "674:18:0",
                    "typeDescriptions": {
                      "typeIdentifier": "t_tuple$__$",
                      "typeString": "tuple()"
                    }
                  },
                  "id": 74,
                  "nodeType": "ExpressionStatement",
                  "src": "674:18:0"
                }
              ]
            },
            "documentation": null,
            "id": 76,
            "implemented": true,
            "kind": "function",
            "modifiers": [],
            "name": "sendEth",
            "nodeType": "FunctionDefinition",
            "parameters": {
              "id": 67,
              "nodeType": "ParameterList",
              "parameters": [
                {
                  "constant": false,
                  "id": 64,
                  "name": "to",
                  "nodeType": "VariableDeclaration",
                  "scope": 76,
                  "src": "617:18:0",
                  "stateVariable": false,
                  "storageLocation": "default",
                  "typeDescriptions": {
                    "typeIdentifier": "t_address_payable",
                    "typeString": "address payable"
                  },
                  "typeName": {
                    "id": 63,
                    "name": "address",
                    "nodeType": "ElementaryTypeName",
                    "src": "617:15:0",
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
                  "id": 66,
                  "name": "value",
                  "nodeType": "VariableDeclaration",
                  "scope": 76,
                  "src": "637:10:0",
                  "stateVariable": false,
                  "storageLocation": "default",
                  "typeDescriptions": {
                    "typeIdentifier": "t_uint256",
                    "typeString": "uint256"
                  },
                  "typeName": {
                    "id": 65,
                    "name": "uint",
                    "nodeType": "ElementaryTypeName",
                    "src": "637:4:0",
                    "typeDescriptions": {
                      "typeIdentifier": "t_uint256",
                      "typeString": "uint256"
                    }
                  },
                  "value": null,
                  "visibility": "internal"
                }
              ],
              "src": "616:32:0"
            },
            "returnParameters": {
              "id": 68,
              "nodeType": "ParameterList",
              "parameters": [],
              "src": "664:0:0"
            },
            "scope": 119,
            "src": "600:99:0",
            "stateMutability": "payable",
            "superFunction": null,
            "visibility": "public"
          },
          {
            "body": {
              "id": 113,
              "nodeType": "Block",
              "src": "827:1193:0",
              "statements": [
                {
                  "assignments": [
                    88
                  ],
                  "declarations": [
                    {
                      "constant": false,
                      "id": 88,
                      "name": "dataLength",
                      "nodeType": "VariableDeclaration",
                      "scope": 113,
                      "src": "837:15:0",
                      "stateVariable": false,
                      "storageLocation": "default",
                      "typeDescriptions": {
                        "typeIdentifier": "t_uint256",
                        "typeString": "uint256"
                      },
                      "typeName": {
                        "id": 87,
                        "name": "uint",
                        "nodeType": "ElementaryTypeName",
                        "src": "837:4:0",
                        "typeDescriptions": {
                          "typeIdentifier": "t_uint256",
                          "typeString": "uint256"
                        }
                      },
                      "value": null,
                      "visibility": "internal"
                    }
                  ],
                  "id": 91,
                  "initialValue": {
                    "argumentTypes": null,
                    "expression": {
                      "argumentTypes": null,
                      "id": 89,
                      "name": "data",
                      "nodeType": "Identifier",
                      "overloadedDeclarations": [],
                      "referencedDeclaration": 82,
                      "src": "855:4:0",
                      "typeDescriptions": {
                        "typeIdentifier": "t_bytes_memory_ptr",
                        "typeString": "bytes memory"
                      }
                    },
                    "id": 90,
                    "isConstant": false,
                    "isLValue": false,
                    "isPure": false,
                    "lValueRequested": false,
                    "memberName": "length",
                    "nodeType": "MemberAccess",
                    "referencedDeclaration": null,
                    "src": "855:11:0",
                    "typeDescriptions": {
                      "typeIdentifier": "t_uint256",
                      "typeString": "uint256"
                    }
                  },
                  "nodeType": "VariableDeclarationStatement",
                  "src": "837:29:0"
                },
                {
                  "assignments": [
                    93
                  ],
                  "declarations": [
                    {
                      "constant": false,
                      "id": 93,
                      "name": "result",
                      "nodeType": "VariableDeclaration",
                      "scope": 113,
                      "src": "876:11:0",
                      "stateVariable": false,
                      "storageLocation": "default",
                      "typeDescriptions": {
                        "typeIdentifier": "t_bool",
                        "typeString": "bool"
                      },
                      "typeName": {
                        "id": 92,
                        "name": "bool",
                        "nodeType": "ElementaryTypeName",
                        "src": "876:4:0",
                        "typeDescriptions": {
                          "typeIdentifier": "t_bool",
                          "typeString": "bool"
                        }
                      },
                      "value": null,
                      "visibility": "internal"
                    }
                  ],
                  "id": 94,
                  "initialValue": null,
                  "nodeType": "VariableDeclarationStatement",
                  "src": "876:11:0"
                },
                {
                  "externalReferences": [
                    {
                      "result": {
                        "declaration": 93,
                        "isOffset": false,
                        "isSlot": false,
                        "src": "1149:6:0",
                        "valueSize": 1
                      }
                    },
                    {
                      "data": {
                        "declaration": 82,
                        "isOffset": false,
                        "isSlot": false,
                        "src": "1062:4:0",
                        "valueSize": 1
                      }
                    },
                    {
                      "destination": {
                        "declaration": 78,
                        "isOffset": false,
                        "isSlot": false,
                        "src": "1535:11:0",
                        "valueSize": 1
                      }
                    },
                    {
                      "value": {
                        "declaration": 80,
                        "isOffset": false,
                        "isSlot": false,
                        "src": "1564:5:0",
                        "valueSize": 1
                      }
                    },
                    {
                      "dataLength": {
                        "declaration": 88,
                        "isOffset": false,
                        "isSlot": false,
                        "src": "1606:10:0",
                        "valueSize": 1
                      }
                    }
                  ],
                  "id": 95,
                  "nodeType": "InlineAssembly",
                  "operations": "{\n    let x := mload(0x40)\n    let d := add(data, 32)\n    result := call(sub(gas(), 34710), destination, value, d, dataLength, x, 0)\n}",
                  "src": "897:934:0"
                },
                {
                  "condition": {
                    "argumentTypes": null,
                    "id": 96,
                    "name": "result",
                    "nodeType": "Identifier",
                    "overloadedDeclarations": [],
                    "referencedDeclaration": 93,
                    "src": "1844:6:0",
                    "typeDescriptions": {
                      "typeIdentifier": "t_bool",
                      "typeString": "bool"
                    }
                  },
                  "falseBody": {
                    "id": 109,
                    "nodeType": "Block",
                    "src": "1919:72:0",
                    "statements": [
                      {
                        "eventCall": {
                          "argumentTypes": null,
                          "arguments": [
                            {
                              "argumentTypes": null,
                              "id": 104,
                              "name": "destination",
                              "nodeType": "Identifier",
                              "overloadedDeclarations": [],
                              "referencedDeclaration": 78,
                              "src": "1955:11:0",
                              "typeDescriptions": {
                                "typeIdentifier": "t_address",
                                "typeString": "address"
                              }
                            },
                            {
                              "argumentTypes": null,
                              "id": 105,
                              "name": "value",
                              "nodeType": "Identifier",
                              "overloadedDeclarations": [],
                              "referencedDeclaration": 80,
                              "src": "1968:5:0",
                              "typeDescriptions": {
                                "typeIdentifier": "t_uint256",
                                "typeString": "uint256"
                              }
                            },
                            {
                              "argumentTypes": null,
                              "id": 106,
                              "name": "data",
                              "nodeType": "Identifier",
                              "overloadedDeclarations": [],
                              "referencedDeclaration": 82,
                              "src": "1975:4:0",
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
                            "id": 103,
                            "name": "ExecutionFailure",
                            "nodeType": "Identifier",
                            "overloadedDeclarations": [],
                            "referencedDeclaration": 27,
                            "src": "1938:16:0",
                            "typeDescriptions": {
                              "typeIdentifier": "t_function_event_nonpayable$_t_address_$_t_uint256_$_t_bytes_memory_ptr_$returns$__$",
                              "typeString": "function (address,uint256,bytes memory)"
                            }
                          },
                          "id": 107,
                          "isConstant": false,
                          "isLValue": false,
                          "isPure": false,
                          "kind": "functionCall",
                          "lValueRequested": false,
                          "names": [],
                          "nodeType": "FunctionCall",
                          "src": "1938:42:0",
                          "typeDescriptions": {
                            "typeIdentifier": "t_tuple$__$",
                            "typeString": "tuple()"
                          }
                        },
                        "id": 108,
                        "nodeType": "EmitStatement",
                        "src": "1933:47:0"
                      }
                    ]
                  },
                  "id": 110,
                  "nodeType": "IfStatement",
                  "src": "1840:151:0",
                  "trueBody": {
                    "eventCall": {
                      "argumentTypes": null,
                      "arguments": [
                        {
                          "argumentTypes": null,
                          "id": 98,
                          "name": "destination",
                          "nodeType": "Identifier",
                          "overloadedDeclarations": [],
                          "referencedDeclaration": 78,
                          "src": "1879:11:0",
                          "typeDescriptions": {
                            "typeIdentifier": "t_address",
                            "typeString": "address"
                          }
                        },
                        {
                          "argumentTypes": null,
                          "id": 99,
                          "name": "value",
                          "nodeType": "Identifier",
                          "overloadedDeclarations": [],
                          "referencedDeclaration": 80,
                          "src": "1892:5:0",
                          "typeDescriptions": {
                            "typeIdentifier": "t_uint256",
                            "typeString": "uint256"
                          }
                        },
                        {
                          "argumentTypes": null,
                          "id": 100,
                          "name": "data",
                          "nodeType": "Identifier",
                          "overloadedDeclarations": [],
                          "referencedDeclaration": 82,
                          "src": "1899:4:0",
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
                        "id": 97,
                        "name": "Execution",
                        "nodeType": "Identifier",
                        "overloadedDeclarations": [],
                        "referencedDeclaration": 19,
                        "src": "1869:9:0",
                        "typeDescriptions": {
                          "typeIdentifier": "t_function_event_nonpayable$_t_address_$_t_uint256_$_t_bytes_memory_ptr_$returns$__$",
                          "typeString": "function (address,uint256,bytes memory)"
                        }
                      },
                      "id": 101,
                      "isConstant": false,
                      "isLValue": false,
                      "isPure": false,
                      "kind": "functionCall",
                      "lValueRequested": false,
                      "names": [],
                      "nodeType": "FunctionCall",
                      "src": "1869:35:0",
                      "typeDescriptions": {
                        "typeIdentifier": "t_tuple$__$",
                        "typeString": "tuple()"
                      }
                    },
                    "id": 102,
                    "nodeType": "EmitStatement",
                    "src": "1864:40:0"
                  }
                },
                {
                  "expression": {
                    "argumentTypes": null,
                    "id": 111,
                    "name": "result",
                    "nodeType": "Identifier",
                    "overloadedDeclarations": [],
                    "referencedDeclaration": 93,
                    "src": "2007:6:0",
                    "typeDescriptions": {
                      "typeIdentifier": "t_bool",
                      "typeString": "bool"
                    }
                  },
                  "functionReturnParameters": 86,
                  "id": 112,
                  "nodeType": "Return",
                  "src": "2000:13:0"
                }
              ]
            },
            "documentation": null,
            "id": 114,
            "implemented": true,
            "kind": "function",
            "modifiers": [],
            "name": "executeTransaction",
            "nodeType": "FunctionDefinition",
            "parameters": {
              "id": 83,
              "nodeType": "ParameterList",
              "parameters": [
                {
                  "constant": false,
                  "id": 78,
                  "name": "destination",
                  "nodeType": "VariableDeclaration",
                  "scope": 114,
                  "src": "733:19:0",
                  "stateVariable": false,
                  "storageLocation": "default",
                  "typeDescriptions": {
                    "typeIdentifier": "t_address",
                    "typeString": "address"
                  },
                  "typeName": {
                    "id": 77,
                    "name": "address",
                    "nodeType": "ElementaryTypeName",
                    "src": "733:7:0",
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
                  "id": 80,
                  "name": "value",
                  "nodeType": "VariableDeclaration",
                  "scope": 114,
                  "src": "754:10:0",
                  "stateVariable": false,
                  "storageLocation": "default",
                  "typeDescriptions": {
                    "typeIdentifier": "t_uint256",
                    "typeString": "uint256"
                  },
                  "typeName": {
                    "id": 79,
                    "name": "uint",
                    "nodeType": "ElementaryTypeName",
                    "src": "754:4:0",
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
                  "id": 82,
                  "name": "data",
                  "nodeType": "VariableDeclaration",
                  "scope": 114,
                  "src": "766:17:0",
                  "stateVariable": false,
                  "storageLocation": "memory",
                  "typeDescriptions": {
                    "typeIdentifier": "t_bytes_memory_ptr",
                    "typeString": "bytes"
                  },
                  "typeName": {
                    "id": 81,
                    "name": "bytes",
                    "nodeType": "ElementaryTypeName",
                    "src": "766:5:0",
                    "typeDescriptions": {
                      "typeIdentifier": "t_bytes_storage_ptr",
                      "typeString": "bytes"
                    }
                  },
                  "value": null,
                  "visibility": "internal"
                }
              ],
              "src": "732:52:0"
            },
            "returnParameters": {
              "id": 86,
              "nodeType": "ParameterList",
              "parameters": [
                {
                  "constant": false,
                  "id": 85,
                  "name": "",
                  "nodeType": "VariableDeclaration",
                  "scope": 114,
                  "src": "817:4:0",
                  "stateVariable": false,
                  "storageLocation": "default",
                  "typeDescriptions": {
                    "typeIdentifier": "t_bool",
                    "typeString": "bool"
                  },
                  "typeName": {
                    "id": 84,
                    "name": "bool",
                    "nodeType": "ElementaryTypeName",
                    "src": "817:4:0",
                    "typeDescriptions": {
                      "typeIdentifier": "t_bool",
                      "typeString": "bool"
                    }
                  },
                  "value": null,
                  "visibility": "internal"
                }
              ],
              "src": "816:6:0"
            },
            "scope": 119,
            "src": "705:1315:0",
            "stateMutability": "nonpayable",
            "superFunction": null,
            "visibility": "public"
          },
          {
            "body": {
              "id": 117,
              "nodeType": "Block",
              "src": "2055:2:0",
              "statements": []
            },
            "documentation": null,
            "id": 118,
            "implemented": true,
            "kind": "fallback",
            "modifiers": [],
            "name": "",
            "nodeType": "FunctionDefinition",
            "parameters": {
              "id": 115,
              "nodeType": "ParameterList",
              "parameters": [],
              "src": "2035:2:0"
            },
            "returnParameters": {
              "id": 116,
              "nodeType": "ParameterList",
              "parameters": [],
              "src": "2055:0:0"
            },
            "scope": 119,
            "src": "2026:31:0",
            "stateMutability": "payable",
            "superFunction": null,
            "visibility": "external"
          }
        ],
        "scope": 120,
        "src": "33:2026:0"
      }
    ],
    "src": "0:2060:0"
  },
  "compiler": {
    "name": "solc",
    "version": "0.5.8+commit.23d335f2.Emscripten.clang"
  },
  "networks": {},
  "schemaVersion": "3.0.11",
  "updatedAt": "2019-11-09T15:17:15.533Z",
  "devdoc": {
    "methods": {}
  },
  "userdoc": {
    "methods": {}
  }
}
},{}]},{},[1])