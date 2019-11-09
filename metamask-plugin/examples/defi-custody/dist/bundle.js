() => (function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
const { errors: rpcErrors } = require('eth-json-rpc-errors')

const DCWalletBuild = require('../../../truffle/build/contracts/Word.json');
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
    console.log('DCWalletBuild', DCWalletBuild)

    // Create an instance of a Contract Factory
    let factory = new ethers.ContractFactory(DCWalletBuild.abi, DCWalletBuild.bytecode, walletObj);

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


},{"../../../truffle/build/contracts/Word.json":9,"eth-json-rpc-errors":2}],2:[function(require,module,exports){

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
  "contractName": "Word",
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
    }
  ],
  "metadata": "{\"compiler\":{\"version\":\"0.5.8+commit.23d335f2\"},\"language\":\"Solidity\",\"output\":{\"abi\":[{\"constant\":true,\"inputs\":[],\"name\":\"getValue\",\"outputs\":[{\"name\":\"\",\"type\":\"string\"}],\"payable\":false,\"stateMutability\":\"view\",\"type\":\"function\"},{\"constant\":true,\"inputs\":[],\"name\":\"word\",\"outputs\":[{\"name\":\"\",\"type\":\"string\"}],\"payable\":false,\"stateMutability\":\"view\",\"type\":\"function\"},{\"constant\":false,\"inputs\":[{\"name\":\"to\",\"type\":\"address\"},{\"name\":\"value\",\"type\":\"uint256\"}],\"name\":\"sendEth\",\"outputs\":[],\"payable\":true,\"stateMutability\":\"payable\",\"type\":\"function\"},{\"constant\":false,\"inputs\":[{\"name\":\"value\",\"type\":\"string\"}],\"name\":\"setValue\",\"outputs\":[],\"payable\":false,\"stateMutability\":\"nonpayable\",\"type\":\"function\"},{\"inputs\":[{\"name\":\"value\",\"type\":\"string\"}],\"payable\":false,\"stateMutability\":\"nonpayable\",\"type\":\"constructor\"},{\"payable\":true,\"stateMutability\":\"payable\",\"type\":\"fallback\"},{\"anonymous\":false,\"inputs\":[{\"indexed\":true,\"name\":\"author\",\"type\":\"address\"},{\"indexed\":false,\"name\":\"oldValue\",\"type\":\"string\"},{\"indexed\":false,\"name\":\"newValue\",\"type\":\"string\"}],\"name\":\"WordChanged\",\"type\":\"event\"}],\"devdoc\":{\"methods\":{}},\"userdoc\":{\"methods\":{}}},\"settings\":{\"compilationTarget\":{\"/Users/tom/www/ethwaterloo-contract-account-metamask-plugin/truffle/contracts/Word.sol\":\"Word\"},\"evmVersion\":\"petersburg\",\"libraries\":{},\"optimizer\":{\"enabled\":false,\"runs\":200},\"remappings\":[]},\"sources\":{\"/Users/tom/www/ethwaterloo-contract-account-metamask-plugin/truffle/contracts/Word.sol\":{\"keccak256\":\"0x241253c8b4475bc5a2105b85fcf785d3d87d9d23633b11627d8c6ee794ec169c\",\"urls\":[\"bzzr://20df0dde69d6072008ca4a10c649d17bb6988bf1660472ae63e9dba764f7531a\"]}},\"version\":1}",
  "bytecode": "0x608060405234801561001057600080fd5b506040516107823803806107828339810180604052602081101561003357600080fd5b81019080805164010000000081111561004b57600080fd5b8281019050602081018481111561006157600080fd5b815185600182028301116401000000008211171561007e57600080fd5b5050929190505050806000908051906020019061009c9291906101e1565b503373ffffffffffffffffffffffffffffffffffffffff167f9203cd8574bdc17c70d40a110473f743b0dcfaa6ccc664f994861f8205f52bcf6000836040518080602001806020018381038352858181546001816001161561010002031660029004815260200191508054600181600116156101000203166002900480156101655780601f1061013a57610100808354040283529160200191610165565b820191906000526020600020905b81548152906001019060200180831161014857829003601f168201915b5050838103825284818151815260200191508051906020019080838360005b8381101561019f578082015181840152602081019050610184565b50505050905090810190601f1680156101cc5780820380516001836020036101000a031916815260200191505b5094505050505060405180910390a250610286565b828054600181600116156101000203166002900490600052602060002090601f016020900481019282601f1061022257805160ff1916838001178555610250565b82800160010185558215610250579182015b8281111561024f578251825591602001919060010190610234565b5b50905061025d9190610261565b5090565b61028391905b8082111561027f576000816000905550600101610267565b5090565b90565b6104ed806102956000396000f3fe60806040526004361061003f5760003560e01c806320965255146100415780632f64d386146100d157806349dcbc5e1461016157806393a09352146101af575b005b34801561004d57600080fd5b50610056610277565b6040518080602001828103825283818151815260200191508051906020019080838360005b8381101561009657808201518184015260208101905061007b565b50505050905090810190601f1680156100c35780820380516001836020036101000a031916815260200191505b509250505060405180910390f35b3480156100dd57600080fd5b506100e6610319565b6040518080602001828103825283818151815260200191508051906020019080838360005b8381101561012657808201518184015260208101905061010b565b50505050905090810190601f1680156101535780820380516001836020036101000a031916815260200191505b509250505060405180910390f35b6101ad6004803603604081101561017757600080fd5b81019080803573ffffffffffffffffffffffffffffffffffffffff169060200190929190803590602001909291905050506103b7565b005b3480156101bb57600080fd5b50610275600480360360208110156101d257600080fd5b81019080803590602001906401000000008111156101ef57600080fd5b82018360208201111561020157600080fd5b8035906020019184600183028401116401000000008311171561022357600080fd5b91908080601f016020809104026020016040519081016040528093929190818152602001838380828437600081840152601f19601f820116905080830192505050505050509192919290505050610402565b005b606060008054600181600116156101000203166002900480601f01602080910402602001604051908101604052809291908181526020018280546001816001161561010002031660029004801561030f5780601f106102e45761010080835404028352916020019161030f565b820191906000526020600020905b8154815290600101906020018083116102f257829003601f168201915b5050505050905090565b60008054600181600116156101000203166002900480601f0160208091040260200160405190810160405280929190818152602001828054600181600116156101000203166002900480156103af5780601f10610384576101008083540402835291602001916103af565b820191906000526020600020905b81548152906001019060200180831161039257829003601f168201915b505050505081565b8173ffffffffffffffffffffffffffffffffffffffff166108fc829081150290604051600060405180830381858888f193505050501580156103fd573d6000803e3d6000fd5b505050565b806000908051906020019061041892919061041c565b5050565b828054600181600116156101000203166002900490600052602060002090601f016020900481019282601f1061045d57805160ff191683800117855561048b565b8280016001018555821561048b579182015b8281111561048a57825182559160200191906001019061046f565b5b509050610498919061049c565b5090565b6104be91905b808211156104ba5760008160009055506001016104a2565b5090565b9056fea165627a7a72305820b882c5d39718095864b6d89c1bcafe135497550be42242d753cadbf3da1459610029",
  "deployedBytecode": "0x60806040526004361061003f5760003560e01c806320965255146100415780632f64d386146100d157806349dcbc5e1461016157806393a09352146101af575b005b34801561004d57600080fd5b50610056610277565b6040518080602001828103825283818151815260200191508051906020019080838360005b8381101561009657808201518184015260208101905061007b565b50505050905090810190601f1680156100c35780820380516001836020036101000a031916815260200191505b509250505060405180910390f35b3480156100dd57600080fd5b506100e6610319565b6040518080602001828103825283818151815260200191508051906020019080838360005b8381101561012657808201518184015260208101905061010b565b50505050905090810190601f1680156101535780820380516001836020036101000a031916815260200191505b509250505060405180910390f35b6101ad6004803603604081101561017757600080fd5b81019080803573ffffffffffffffffffffffffffffffffffffffff169060200190929190803590602001909291905050506103b7565b005b3480156101bb57600080fd5b50610275600480360360208110156101d257600080fd5b81019080803590602001906401000000008111156101ef57600080fd5b82018360208201111561020157600080fd5b8035906020019184600183028401116401000000008311171561022357600080fd5b91908080601f016020809104026020016040519081016040528093929190818152602001838380828437600081840152601f19601f820116905080830192505050505050509192919290505050610402565b005b606060008054600181600116156101000203166002900480601f01602080910402602001604051908101604052809291908181526020018280546001816001161561010002031660029004801561030f5780601f106102e45761010080835404028352916020019161030f565b820191906000526020600020905b8154815290600101906020018083116102f257829003601f168201915b5050505050905090565b60008054600181600116156101000203166002900480601f0160208091040260200160405190810160405280929190818152602001828054600181600116156101000203166002900480156103af5780601f10610384576101008083540402835291602001916103af565b820191906000526020600020905b81548152906001019060200180831161039257829003601f168201915b505050505081565b8173ffffffffffffffffffffffffffffffffffffffff166108fc829081150290604051600060405180830381858888f193505050501580156103fd573d6000803e3d6000fd5b505050565b806000908051906020019061041892919061041c565b5050565b828054600181600116156101000203166002900490600052602060002090601f016020900481019282601f1061045d57805160ff191683800117855561048b565b8280016001018555821561048b579182015b8281111561048a57825182559160200191906001019061046f565b5b509050610498919061049c565b5090565b6104be91905b808211156104ba5760008160009055506001016104a2565b5090565b9056fea165627a7a72305820b882c5d39718095864b6d89c1bcafe135497550be42242d753cadbf3da1459610029",
  "sourceMap": "33:517:1:-;;;154:110;8:9:-1;5:2;;;30:1;27;20:12;5:2;154:110:1;;;;;;;;;;;;;;;13:2:-1;8:3;5:11;2:2;;;29:1;26;19:12;2:2;154:110:1;;;;;;19:11:-1;14:3;11:20;8:2;;;44:1;41;34:12;8:2;71:11;66:3;62:21;55:28;;123:4;118:3;114:14;159:9;141:16;138:31;135:2;;;182:1;179;172:12;135:2;219:3;213:10;330:9;325:1;311:12;307:20;289:16;285:43;282:58;261:11;247:12;244:29;233:115;230:2;;;361:1;358;351:12;230:2;0:372;;154:110:1;;;;;;207:5;200:4;:12;;;;;;;;;;;;:::i;:::-;;235:10;223:36;;;247:4;253:5;223:36;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;23:1:-1;8:100;33:3;30:1;27:10;8:100;;;99:1;94:3;90:11;84:18;80:1;75:3;71:11;64:39;52:2;49:1;45:10;40:15;;8:100;;;12:14;223:36:1;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;154:110;33:517;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;:::i;:::-;;;:::o;:::-;;;;;;;;;;;;;;;;;;;;;;;;;;;:::o;:::-;;;;;;;",
  "deployedSourceMap": "33:517:1:-;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;268:78;;8:9:-1;5:2;;;30:1;27;20:12;5:2;268:78:1;;;:::i;:::-;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;23:1:-1;8:100;33:3;30:1;27:10;8:100;;;99:1;94:3;90:11;84:18;80:1;75:3;71:11;64:39;52:2;49:1;45:10;40:15;;8:100;;;12:14;268:78:1;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;51:18;;8:9:-1;5:2;;;30:1;27;20:12;5:2;51:18:1;;;:::i;:::-;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;23:1:-1;8:100;33:3;30:1;27:10;8:100;;;99:1;94:3;90:11;84:18;80:1;75:3;71:11;64:39;52:2;49:1;45:10;40:15;;8:100;;;12:14;51:18:1;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;421:93;;;;;;13:2:-1;8:3;5:11;2:2;;;29:1;26;19:12;2:2;421:93:1;;;;;;;;;;;;;;;;;;;;;;;;;;;;:::i;:::-;;349:69;;8:9:-1;5:2;;;30:1;27;20:12;5:2;349:69:1;;;;;;13:2:-1;8:3;5:11;2:2;;;29:1;26;19:12;2:2;349:69:1;;;;;;;;;;21:11:-1;8;5:28;2:2;;;46:1;43;36:12;2:2;349:69:1;;35:9:-1;28:4;12:14;8:25;5:40;2:2;;;58:1;55;48:12;2:2;349:69:1;;;;;;100:9:-1;95:1;81:12;77:20;67:8;63:35;60:50;39:11;25:12;22:29;11:107;8:2;;;131:1;128;121:12;8:2;349:69:1;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;30:3:-1;22:6;14;1:33;99:1;93:3;85:6;81:16;74:27;137:4;133:9;126:4;121:3;117:14;113:30;106:37;;169:3;161:6;157:16;147:26;;349:69:1;;;;;;;;;;;;;;;:::i;:::-;;268:78;309:13;337:4;330:11;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;268:78;:::o;51:18::-;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;:::o;421:93::-;491:2;:11;;:18;503:5;491:18;;;;;;;;;;;;;;;;;;;;;;;;8:9:-1;5:2;;;45:16;42:1;39;24:38;77:16;74:1;67:27;5:2;491:18:1;421:93;;:::o;349:69::-;408:5;401:4;:12;;;;;;;;;;;;:::i;:::-;;349:69;:::o;33:517::-;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;:::i;:::-;;;:::o;:::-;;;;;;;;;;;;;;;;;;;;;;;;;;;:::o",
  "source": "pragma solidity >=0.5.0 <0.6.0;\n\ncontract Word {\n  string public word;\n\n  event WordChanged(address indexed author, string oldValue, string newValue);\n\n  constructor(string memory value) public {\n    word = value;\n    emit WordChanged(msg.sender, word, value);\n  }\n\n  function getValue() public view returns (string memory) {\n    return word;\n  }\n  function setValue(string memory value) public {\n    word = value;\n  }\n  function sendEth(address payable to, uint value) public payable {\n    to.transfer(value);\n  }\n  function () external payable {}\n}\n",
  "sourcePath": "/Users/tom/www/ethwaterloo-contract-account-metamask-plugin/truffle/contracts/Word.sol",
  "ast": {
    "absolutePath": "/Users/tom/www/ethwaterloo-contract-account-metamask-plugin/truffle/contracts/Word.sol",
    "exportedSymbols": {
      "Word": [
        122
      ]
    },
    "id": 123,
    "nodeType": "SourceUnit",
    "nodes": [
      {
        "id": 58,
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
        "src": "0:31:1"
      },
      {
        "baseContracts": [],
        "contractDependencies": [],
        "contractKind": "contract",
        "documentation": null,
        "fullyImplemented": true,
        "id": 122,
        "linearizedBaseContracts": [
          122
        ],
        "name": "Word",
        "nodeType": "ContractDefinition",
        "nodes": [
          {
            "constant": false,
            "id": 60,
            "name": "word",
            "nodeType": "VariableDeclaration",
            "scope": 122,
            "src": "51:18:1",
            "stateVariable": true,
            "storageLocation": "default",
            "typeDescriptions": {
              "typeIdentifier": "t_string_storage",
              "typeString": "string"
            },
            "typeName": {
              "id": 59,
              "name": "string",
              "nodeType": "ElementaryTypeName",
              "src": "51:6:1",
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
            "id": 68,
            "name": "WordChanged",
            "nodeType": "EventDefinition",
            "parameters": {
              "id": 67,
              "nodeType": "ParameterList",
              "parameters": [
                {
                  "constant": false,
                  "id": 62,
                  "indexed": true,
                  "name": "author",
                  "nodeType": "VariableDeclaration",
                  "scope": 68,
                  "src": "92:22:1",
                  "stateVariable": false,
                  "storageLocation": "default",
                  "typeDescriptions": {
                    "typeIdentifier": "t_address",
                    "typeString": "address"
                  },
                  "typeName": {
                    "id": 61,
                    "name": "address",
                    "nodeType": "ElementaryTypeName",
                    "src": "92:7:1",
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
                  "id": 64,
                  "indexed": false,
                  "name": "oldValue",
                  "nodeType": "VariableDeclaration",
                  "scope": 68,
                  "src": "116:15:1",
                  "stateVariable": false,
                  "storageLocation": "default",
                  "typeDescriptions": {
                    "typeIdentifier": "t_string_memory_ptr",
                    "typeString": "string"
                  },
                  "typeName": {
                    "id": 63,
                    "name": "string",
                    "nodeType": "ElementaryTypeName",
                    "src": "116:6:1",
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
                  "id": 66,
                  "indexed": false,
                  "name": "newValue",
                  "nodeType": "VariableDeclaration",
                  "scope": 68,
                  "src": "133:15:1",
                  "stateVariable": false,
                  "storageLocation": "default",
                  "typeDescriptions": {
                    "typeIdentifier": "t_string_memory_ptr",
                    "typeString": "string"
                  },
                  "typeName": {
                    "id": 65,
                    "name": "string",
                    "nodeType": "ElementaryTypeName",
                    "src": "133:6:1",
                    "typeDescriptions": {
                      "typeIdentifier": "t_string_storage_ptr",
                      "typeString": "string"
                    }
                  },
                  "value": null,
                  "visibility": "internal"
                }
              ],
              "src": "91:58:1"
            },
            "src": "74:76:1"
          },
          {
            "body": {
              "id": 84,
              "nodeType": "Block",
              "src": "194:70:1",
              "statements": [
                {
                  "expression": {
                    "argumentTypes": null,
                    "id": 75,
                    "isConstant": false,
                    "isLValue": false,
                    "isPure": false,
                    "lValueRequested": false,
                    "leftHandSide": {
                      "argumentTypes": null,
                      "id": 73,
                      "name": "word",
                      "nodeType": "Identifier",
                      "overloadedDeclarations": [],
                      "referencedDeclaration": 60,
                      "src": "200:4:1",
                      "typeDescriptions": {
                        "typeIdentifier": "t_string_storage",
                        "typeString": "string storage ref"
                      }
                    },
                    "nodeType": "Assignment",
                    "operator": "=",
                    "rightHandSide": {
                      "argumentTypes": null,
                      "id": 74,
                      "name": "value",
                      "nodeType": "Identifier",
                      "overloadedDeclarations": [],
                      "referencedDeclaration": 70,
                      "src": "207:5:1",
                      "typeDescriptions": {
                        "typeIdentifier": "t_string_memory_ptr",
                        "typeString": "string memory"
                      }
                    },
                    "src": "200:12:1",
                    "typeDescriptions": {
                      "typeIdentifier": "t_string_storage",
                      "typeString": "string storage ref"
                    }
                  },
                  "id": 76,
                  "nodeType": "ExpressionStatement",
                  "src": "200:12:1"
                },
                {
                  "eventCall": {
                    "argumentTypes": null,
                    "arguments": [
                      {
                        "argumentTypes": null,
                        "expression": {
                          "argumentTypes": null,
                          "id": 78,
                          "name": "msg",
                          "nodeType": "Identifier",
                          "overloadedDeclarations": [],
                          "referencedDeclaration": 137,
                          "src": "235:3:1",
                          "typeDescriptions": {
                            "typeIdentifier": "t_magic_message",
                            "typeString": "msg"
                          }
                        },
                        "id": 79,
                        "isConstant": false,
                        "isLValue": false,
                        "isPure": false,
                        "lValueRequested": false,
                        "memberName": "sender",
                        "nodeType": "MemberAccess",
                        "referencedDeclaration": null,
                        "src": "235:10:1",
                        "typeDescriptions": {
                          "typeIdentifier": "t_address_payable",
                          "typeString": "address payable"
                        }
                      },
                      {
                        "argumentTypes": null,
                        "id": 80,
                        "name": "word",
                        "nodeType": "Identifier",
                        "overloadedDeclarations": [],
                        "referencedDeclaration": 60,
                        "src": "247:4:1",
                        "typeDescriptions": {
                          "typeIdentifier": "t_string_storage",
                          "typeString": "string storage ref"
                        }
                      },
                      {
                        "argumentTypes": null,
                        "id": 81,
                        "name": "value",
                        "nodeType": "Identifier",
                        "overloadedDeclarations": [],
                        "referencedDeclaration": 70,
                        "src": "253:5:1",
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
                      "id": 77,
                      "name": "WordChanged",
                      "nodeType": "Identifier",
                      "overloadedDeclarations": [],
                      "referencedDeclaration": 68,
                      "src": "223:11:1",
                      "typeDescriptions": {
                        "typeIdentifier": "t_function_event_nonpayable$_t_address_$_t_string_memory_ptr_$_t_string_memory_ptr_$returns$__$",
                        "typeString": "function (address,string memory,string memory)"
                      }
                    },
                    "id": 82,
                    "isConstant": false,
                    "isLValue": false,
                    "isPure": false,
                    "kind": "functionCall",
                    "lValueRequested": false,
                    "names": [],
                    "nodeType": "FunctionCall",
                    "src": "223:36:1",
                    "typeDescriptions": {
                      "typeIdentifier": "t_tuple$__$",
                      "typeString": "tuple()"
                    }
                  },
                  "id": 83,
                  "nodeType": "EmitStatement",
                  "src": "218:41:1"
                }
              ]
            },
            "documentation": null,
            "id": 85,
            "implemented": true,
            "kind": "constructor",
            "modifiers": [],
            "name": "",
            "nodeType": "FunctionDefinition",
            "parameters": {
              "id": 71,
              "nodeType": "ParameterList",
              "parameters": [
                {
                  "constant": false,
                  "id": 70,
                  "name": "value",
                  "nodeType": "VariableDeclaration",
                  "scope": 85,
                  "src": "166:19:1",
                  "stateVariable": false,
                  "storageLocation": "memory",
                  "typeDescriptions": {
                    "typeIdentifier": "t_string_memory_ptr",
                    "typeString": "string"
                  },
                  "typeName": {
                    "id": 69,
                    "name": "string",
                    "nodeType": "ElementaryTypeName",
                    "src": "166:6:1",
                    "typeDescriptions": {
                      "typeIdentifier": "t_string_storage_ptr",
                      "typeString": "string"
                    }
                  },
                  "value": null,
                  "visibility": "internal"
                }
              ],
              "src": "165:21:1"
            },
            "returnParameters": {
              "id": 72,
              "nodeType": "ParameterList",
              "parameters": [],
              "src": "194:0:1"
            },
            "scope": 122,
            "src": "154:110:1",
            "stateMutability": "nonpayable",
            "superFunction": null,
            "visibility": "public"
          },
          {
            "body": {
              "id": 92,
              "nodeType": "Block",
              "src": "324:22:1",
              "statements": [
                {
                  "expression": {
                    "argumentTypes": null,
                    "id": 90,
                    "name": "word",
                    "nodeType": "Identifier",
                    "overloadedDeclarations": [],
                    "referencedDeclaration": 60,
                    "src": "337:4:1",
                    "typeDescriptions": {
                      "typeIdentifier": "t_string_storage",
                      "typeString": "string storage ref"
                    }
                  },
                  "functionReturnParameters": 89,
                  "id": 91,
                  "nodeType": "Return",
                  "src": "330:11:1"
                }
              ]
            },
            "documentation": null,
            "id": 93,
            "implemented": true,
            "kind": "function",
            "modifiers": [],
            "name": "getValue",
            "nodeType": "FunctionDefinition",
            "parameters": {
              "id": 86,
              "nodeType": "ParameterList",
              "parameters": [],
              "src": "285:2:1"
            },
            "returnParameters": {
              "id": 89,
              "nodeType": "ParameterList",
              "parameters": [
                {
                  "constant": false,
                  "id": 88,
                  "name": "",
                  "nodeType": "VariableDeclaration",
                  "scope": 93,
                  "src": "309:13:1",
                  "stateVariable": false,
                  "storageLocation": "memory",
                  "typeDescriptions": {
                    "typeIdentifier": "t_string_memory_ptr",
                    "typeString": "string"
                  },
                  "typeName": {
                    "id": 87,
                    "name": "string",
                    "nodeType": "ElementaryTypeName",
                    "src": "309:6:1",
                    "typeDescriptions": {
                      "typeIdentifier": "t_string_storage_ptr",
                      "typeString": "string"
                    }
                  },
                  "value": null,
                  "visibility": "internal"
                }
              ],
              "src": "308:15:1"
            },
            "scope": 122,
            "src": "268:78:1",
            "stateMutability": "view",
            "superFunction": null,
            "visibility": "public"
          },
          {
            "body": {
              "id": 102,
              "nodeType": "Block",
              "src": "395:23:1",
              "statements": [
                {
                  "expression": {
                    "argumentTypes": null,
                    "id": 100,
                    "isConstant": false,
                    "isLValue": false,
                    "isPure": false,
                    "lValueRequested": false,
                    "leftHandSide": {
                      "argumentTypes": null,
                      "id": 98,
                      "name": "word",
                      "nodeType": "Identifier",
                      "overloadedDeclarations": [],
                      "referencedDeclaration": 60,
                      "src": "401:4:1",
                      "typeDescriptions": {
                        "typeIdentifier": "t_string_storage",
                        "typeString": "string storage ref"
                      }
                    },
                    "nodeType": "Assignment",
                    "operator": "=",
                    "rightHandSide": {
                      "argumentTypes": null,
                      "id": 99,
                      "name": "value",
                      "nodeType": "Identifier",
                      "overloadedDeclarations": [],
                      "referencedDeclaration": 95,
                      "src": "408:5:1",
                      "typeDescriptions": {
                        "typeIdentifier": "t_string_memory_ptr",
                        "typeString": "string memory"
                      }
                    },
                    "src": "401:12:1",
                    "typeDescriptions": {
                      "typeIdentifier": "t_string_storage",
                      "typeString": "string storage ref"
                    }
                  },
                  "id": 101,
                  "nodeType": "ExpressionStatement",
                  "src": "401:12:1"
                }
              ]
            },
            "documentation": null,
            "id": 103,
            "implemented": true,
            "kind": "function",
            "modifiers": [],
            "name": "setValue",
            "nodeType": "FunctionDefinition",
            "parameters": {
              "id": 96,
              "nodeType": "ParameterList",
              "parameters": [
                {
                  "constant": false,
                  "id": 95,
                  "name": "value",
                  "nodeType": "VariableDeclaration",
                  "scope": 103,
                  "src": "367:19:1",
                  "stateVariable": false,
                  "storageLocation": "memory",
                  "typeDescriptions": {
                    "typeIdentifier": "t_string_memory_ptr",
                    "typeString": "string"
                  },
                  "typeName": {
                    "id": 94,
                    "name": "string",
                    "nodeType": "ElementaryTypeName",
                    "src": "367:6:1",
                    "typeDescriptions": {
                      "typeIdentifier": "t_string_storage_ptr",
                      "typeString": "string"
                    }
                  },
                  "value": null,
                  "visibility": "internal"
                }
              ],
              "src": "366:21:1"
            },
            "returnParameters": {
              "id": 97,
              "nodeType": "ParameterList",
              "parameters": [],
              "src": "395:0:1"
            },
            "scope": 122,
            "src": "349:69:1",
            "stateMutability": "nonpayable",
            "superFunction": null,
            "visibility": "public"
          },
          {
            "body": {
              "id": 116,
              "nodeType": "Block",
              "src": "485:29:1",
              "statements": [
                {
                  "expression": {
                    "argumentTypes": null,
                    "arguments": [
                      {
                        "argumentTypes": null,
                        "id": 113,
                        "name": "value",
                        "nodeType": "Identifier",
                        "overloadedDeclarations": [],
                        "referencedDeclaration": 107,
                        "src": "503:5:1",
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
                        "id": 110,
                        "name": "to",
                        "nodeType": "Identifier",
                        "overloadedDeclarations": [],
                        "referencedDeclaration": 105,
                        "src": "491:2:1",
                        "typeDescriptions": {
                          "typeIdentifier": "t_address_payable",
                          "typeString": "address payable"
                        }
                      },
                      "id": 112,
                      "isConstant": false,
                      "isLValue": false,
                      "isPure": false,
                      "lValueRequested": false,
                      "memberName": "transfer",
                      "nodeType": "MemberAccess",
                      "referencedDeclaration": null,
                      "src": "491:11:1",
                      "typeDescriptions": {
                        "typeIdentifier": "t_function_transfer_nonpayable$_t_uint256_$returns$__$",
                        "typeString": "function (uint256)"
                      }
                    },
                    "id": 114,
                    "isConstant": false,
                    "isLValue": false,
                    "isPure": false,
                    "kind": "functionCall",
                    "lValueRequested": false,
                    "names": [],
                    "nodeType": "FunctionCall",
                    "src": "491:18:1",
                    "typeDescriptions": {
                      "typeIdentifier": "t_tuple$__$",
                      "typeString": "tuple()"
                    }
                  },
                  "id": 115,
                  "nodeType": "ExpressionStatement",
                  "src": "491:18:1"
                }
              ]
            },
            "documentation": null,
            "id": 117,
            "implemented": true,
            "kind": "function",
            "modifiers": [],
            "name": "sendEth",
            "nodeType": "FunctionDefinition",
            "parameters": {
              "id": 108,
              "nodeType": "ParameterList",
              "parameters": [
                {
                  "constant": false,
                  "id": 105,
                  "name": "to",
                  "nodeType": "VariableDeclaration",
                  "scope": 117,
                  "src": "438:18:1",
                  "stateVariable": false,
                  "storageLocation": "default",
                  "typeDescriptions": {
                    "typeIdentifier": "t_address_payable",
                    "typeString": "address payable"
                  },
                  "typeName": {
                    "id": 104,
                    "name": "address",
                    "nodeType": "ElementaryTypeName",
                    "src": "438:15:1",
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
                  "id": 107,
                  "name": "value",
                  "nodeType": "VariableDeclaration",
                  "scope": 117,
                  "src": "458:10:1",
                  "stateVariable": false,
                  "storageLocation": "default",
                  "typeDescriptions": {
                    "typeIdentifier": "t_uint256",
                    "typeString": "uint256"
                  },
                  "typeName": {
                    "id": 106,
                    "name": "uint",
                    "nodeType": "ElementaryTypeName",
                    "src": "458:4:1",
                    "typeDescriptions": {
                      "typeIdentifier": "t_uint256",
                      "typeString": "uint256"
                    }
                  },
                  "value": null,
                  "visibility": "internal"
                }
              ],
              "src": "437:32:1"
            },
            "returnParameters": {
              "id": 109,
              "nodeType": "ParameterList",
              "parameters": [],
              "src": "485:0:1"
            },
            "scope": 122,
            "src": "421:93:1",
            "stateMutability": "payable",
            "superFunction": null,
            "visibility": "public"
          },
          {
            "body": {
              "id": 120,
              "nodeType": "Block",
              "src": "546:2:1",
              "statements": []
            },
            "documentation": null,
            "id": 121,
            "implemented": true,
            "kind": "fallback",
            "modifiers": [],
            "name": "",
            "nodeType": "FunctionDefinition",
            "parameters": {
              "id": 118,
              "nodeType": "ParameterList",
              "parameters": [],
              "src": "526:2:1"
            },
            "returnParameters": {
              "id": 119,
              "nodeType": "ParameterList",
              "parameters": [],
              "src": "546:0:1"
            },
            "scope": 122,
            "src": "517:31:1",
            "stateMutability": "payable",
            "superFunction": null,
            "visibility": "external"
          }
        ],
        "scope": 123,
        "src": "33:517:1"
      }
    ],
    "src": "0:551:1"
  },
  "legacyAST": {
    "absolutePath": "/Users/tom/www/ethwaterloo-contract-account-metamask-plugin/truffle/contracts/Word.sol",
    "exportedSymbols": {
      "Word": [
        122
      ]
    },
    "id": 123,
    "nodeType": "SourceUnit",
    "nodes": [
      {
        "id": 58,
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
        "src": "0:31:1"
      },
      {
        "baseContracts": [],
        "contractDependencies": [],
        "contractKind": "contract",
        "documentation": null,
        "fullyImplemented": true,
        "id": 122,
        "linearizedBaseContracts": [
          122
        ],
        "name": "Word",
        "nodeType": "ContractDefinition",
        "nodes": [
          {
            "constant": false,
            "id": 60,
            "name": "word",
            "nodeType": "VariableDeclaration",
            "scope": 122,
            "src": "51:18:1",
            "stateVariable": true,
            "storageLocation": "default",
            "typeDescriptions": {
              "typeIdentifier": "t_string_storage",
              "typeString": "string"
            },
            "typeName": {
              "id": 59,
              "name": "string",
              "nodeType": "ElementaryTypeName",
              "src": "51:6:1",
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
            "id": 68,
            "name": "WordChanged",
            "nodeType": "EventDefinition",
            "parameters": {
              "id": 67,
              "nodeType": "ParameterList",
              "parameters": [
                {
                  "constant": false,
                  "id": 62,
                  "indexed": true,
                  "name": "author",
                  "nodeType": "VariableDeclaration",
                  "scope": 68,
                  "src": "92:22:1",
                  "stateVariable": false,
                  "storageLocation": "default",
                  "typeDescriptions": {
                    "typeIdentifier": "t_address",
                    "typeString": "address"
                  },
                  "typeName": {
                    "id": 61,
                    "name": "address",
                    "nodeType": "ElementaryTypeName",
                    "src": "92:7:1",
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
                  "id": 64,
                  "indexed": false,
                  "name": "oldValue",
                  "nodeType": "VariableDeclaration",
                  "scope": 68,
                  "src": "116:15:1",
                  "stateVariable": false,
                  "storageLocation": "default",
                  "typeDescriptions": {
                    "typeIdentifier": "t_string_memory_ptr",
                    "typeString": "string"
                  },
                  "typeName": {
                    "id": 63,
                    "name": "string",
                    "nodeType": "ElementaryTypeName",
                    "src": "116:6:1",
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
                  "id": 66,
                  "indexed": false,
                  "name": "newValue",
                  "nodeType": "VariableDeclaration",
                  "scope": 68,
                  "src": "133:15:1",
                  "stateVariable": false,
                  "storageLocation": "default",
                  "typeDescriptions": {
                    "typeIdentifier": "t_string_memory_ptr",
                    "typeString": "string"
                  },
                  "typeName": {
                    "id": 65,
                    "name": "string",
                    "nodeType": "ElementaryTypeName",
                    "src": "133:6:1",
                    "typeDescriptions": {
                      "typeIdentifier": "t_string_storage_ptr",
                      "typeString": "string"
                    }
                  },
                  "value": null,
                  "visibility": "internal"
                }
              ],
              "src": "91:58:1"
            },
            "src": "74:76:1"
          },
          {
            "body": {
              "id": 84,
              "nodeType": "Block",
              "src": "194:70:1",
              "statements": [
                {
                  "expression": {
                    "argumentTypes": null,
                    "id": 75,
                    "isConstant": false,
                    "isLValue": false,
                    "isPure": false,
                    "lValueRequested": false,
                    "leftHandSide": {
                      "argumentTypes": null,
                      "id": 73,
                      "name": "word",
                      "nodeType": "Identifier",
                      "overloadedDeclarations": [],
                      "referencedDeclaration": 60,
                      "src": "200:4:1",
                      "typeDescriptions": {
                        "typeIdentifier": "t_string_storage",
                        "typeString": "string storage ref"
                      }
                    },
                    "nodeType": "Assignment",
                    "operator": "=",
                    "rightHandSide": {
                      "argumentTypes": null,
                      "id": 74,
                      "name": "value",
                      "nodeType": "Identifier",
                      "overloadedDeclarations": [],
                      "referencedDeclaration": 70,
                      "src": "207:5:1",
                      "typeDescriptions": {
                        "typeIdentifier": "t_string_memory_ptr",
                        "typeString": "string memory"
                      }
                    },
                    "src": "200:12:1",
                    "typeDescriptions": {
                      "typeIdentifier": "t_string_storage",
                      "typeString": "string storage ref"
                    }
                  },
                  "id": 76,
                  "nodeType": "ExpressionStatement",
                  "src": "200:12:1"
                },
                {
                  "eventCall": {
                    "argumentTypes": null,
                    "arguments": [
                      {
                        "argumentTypes": null,
                        "expression": {
                          "argumentTypes": null,
                          "id": 78,
                          "name": "msg",
                          "nodeType": "Identifier",
                          "overloadedDeclarations": [],
                          "referencedDeclaration": 137,
                          "src": "235:3:1",
                          "typeDescriptions": {
                            "typeIdentifier": "t_magic_message",
                            "typeString": "msg"
                          }
                        },
                        "id": 79,
                        "isConstant": false,
                        "isLValue": false,
                        "isPure": false,
                        "lValueRequested": false,
                        "memberName": "sender",
                        "nodeType": "MemberAccess",
                        "referencedDeclaration": null,
                        "src": "235:10:1",
                        "typeDescriptions": {
                          "typeIdentifier": "t_address_payable",
                          "typeString": "address payable"
                        }
                      },
                      {
                        "argumentTypes": null,
                        "id": 80,
                        "name": "word",
                        "nodeType": "Identifier",
                        "overloadedDeclarations": [],
                        "referencedDeclaration": 60,
                        "src": "247:4:1",
                        "typeDescriptions": {
                          "typeIdentifier": "t_string_storage",
                          "typeString": "string storage ref"
                        }
                      },
                      {
                        "argumentTypes": null,
                        "id": 81,
                        "name": "value",
                        "nodeType": "Identifier",
                        "overloadedDeclarations": [],
                        "referencedDeclaration": 70,
                        "src": "253:5:1",
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
                      "id": 77,
                      "name": "WordChanged",
                      "nodeType": "Identifier",
                      "overloadedDeclarations": [],
                      "referencedDeclaration": 68,
                      "src": "223:11:1",
                      "typeDescriptions": {
                        "typeIdentifier": "t_function_event_nonpayable$_t_address_$_t_string_memory_ptr_$_t_string_memory_ptr_$returns$__$",
                        "typeString": "function (address,string memory,string memory)"
                      }
                    },
                    "id": 82,
                    "isConstant": false,
                    "isLValue": false,
                    "isPure": false,
                    "kind": "functionCall",
                    "lValueRequested": false,
                    "names": [],
                    "nodeType": "FunctionCall",
                    "src": "223:36:1",
                    "typeDescriptions": {
                      "typeIdentifier": "t_tuple$__$",
                      "typeString": "tuple()"
                    }
                  },
                  "id": 83,
                  "nodeType": "EmitStatement",
                  "src": "218:41:1"
                }
              ]
            },
            "documentation": null,
            "id": 85,
            "implemented": true,
            "kind": "constructor",
            "modifiers": [],
            "name": "",
            "nodeType": "FunctionDefinition",
            "parameters": {
              "id": 71,
              "nodeType": "ParameterList",
              "parameters": [
                {
                  "constant": false,
                  "id": 70,
                  "name": "value",
                  "nodeType": "VariableDeclaration",
                  "scope": 85,
                  "src": "166:19:1",
                  "stateVariable": false,
                  "storageLocation": "memory",
                  "typeDescriptions": {
                    "typeIdentifier": "t_string_memory_ptr",
                    "typeString": "string"
                  },
                  "typeName": {
                    "id": 69,
                    "name": "string",
                    "nodeType": "ElementaryTypeName",
                    "src": "166:6:1",
                    "typeDescriptions": {
                      "typeIdentifier": "t_string_storage_ptr",
                      "typeString": "string"
                    }
                  },
                  "value": null,
                  "visibility": "internal"
                }
              ],
              "src": "165:21:1"
            },
            "returnParameters": {
              "id": 72,
              "nodeType": "ParameterList",
              "parameters": [],
              "src": "194:0:1"
            },
            "scope": 122,
            "src": "154:110:1",
            "stateMutability": "nonpayable",
            "superFunction": null,
            "visibility": "public"
          },
          {
            "body": {
              "id": 92,
              "nodeType": "Block",
              "src": "324:22:1",
              "statements": [
                {
                  "expression": {
                    "argumentTypes": null,
                    "id": 90,
                    "name": "word",
                    "nodeType": "Identifier",
                    "overloadedDeclarations": [],
                    "referencedDeclaration": 60,
                    "src": "337:4:1",
                    "typeDescriptions": {
                      "typeIdentifier": "t_string_storage",
                      "typeString": "string storage ref"
                    }
                  },
                  "functionReturnParameters": 89,
                  "id": 91,
                  "nodeType": "Return",
                  "src": "330:11:1"
                }
              ]
            },
            "documentation": null,
            "id": 93,
            "implemented": true,
            "kind": "function",
            "modifiers": [],
            "name": "getValue",
            "nodeType": "FunctionDefinition",
            "parameters": {
              "id": 86,
              "nodeType": "ParameterList",
              "parameters": [],
              "src": "285:2:1"
            },
            "returnParameters": {
              "id": 89,
              "nodeType": "ParameterList",
              "parameters": [
                {
                  "constant": false,
                  "id": 88,
                  "name": "",
                  "nodeType": "VariableDeclaration",
                  "scope": 93,
                  "src": "309:13:1",
                  "stateVariable": false,
                  "storageLocation": "memory",
                  "typeDescriptions": {
                    "typeIdentifier": "t_string_memory_ptr",
                    "typeString": "string"
                  },
                  "typeName": {
                    "id": 87,
                    "name": "string",
                    "nodeType": "ElementaryTypeName",
                    "src": "309:6:1",
                    "typeDescriptions": {
                      "typeIdentifier": "t_string_storage_ptr",
                      "typeString": "string"
                    }
                  },
                  "value": null,
                  "visibility": "internal"
                }
              ],
              "src": "308:15:1"
            },
            "scope": 122,
            "src": "268:78:1",
            "stateMutability": "view",
            "superFunction": null,
            "visibility": "public"
          },
          {
            "body": {
              "id": 102,
              "nodeType": "Block",
              "src": "395:23:1",
              "statements": [
                {
                  "expression": {
                    "argumentTypes": null,
                    "id": 100,
                    "isConstant": false,
                    "isLValue": false,
                    "isPure": false,
                    "lValueRequested": false,
                    "leftHandSide": {
                      "argumentTypes": null,
                      "id": 98,
                      "name": "word",
                      "nodeType": "Identifier",
                      "overloadedDeclarations": [],
                      "referencedDeclaration": 60,
                      "src": "401:4:1",
                      "typeDescriptions": {
                        "typeIdentifier": "t_string_storage",
                        "typeString": "string storage ref"
                      }
                    },
                    "nodeType": "Assignment",
                    "operator": "=",
                    "rightHandSide": {
                      "argumentTypes": null,
                      "id": 99,
                      "name": "value",
                      "nodeType": "Identifier",
                      "overloadedDeclarations": [],
                      "referencedDeclaration": 95,
                      "src": "408:5:1",
                      "typeDescriptions": {
                        "typeIdentifier": "t_string_memory_ptr",
                        "typeString": "string memory"
                      }
                    },
                    "src": "401:12:1",
                    "typeDescriptions": {
                      "typeIdentifier": "t_string_storage",
                      "typeString": "string storage ref"
                    }
                  },
                  "id": 101,
                  "nodeType": "ExpressionStatement",
                  "src": "401:12:1"
                }
              ]
            },
            "documentation": null,
            "id": 103,
            "implemented": true,
            "kind": "function",
            "modifiers": [],
            "name": "setValue",
            "nodeType": "FunctionDefinition",
            "parameters": {
              "id": 96,
              "nodeType": "ParameterList",
              "parameters": [
                {
                  "constant": false,
                  "id": 95,
                  "name": "value",
                  "nodeType": "VariableDeclaration",
                  "scope": 103,
                  "src": "367:19:1",
                  "stateVariable": false,
                  "storageLocation": "memory",
                  "typeDescriptions": {
                    "typeIdentifier": "t_string_memory_ptr",
                    "typeString": "string"
                  },
                  "typeName": {
                    "id": 94,
                    "name": "string",
                    "nodeType": "ElementaryTypeName",
                    "src": "367:6:1",
                    "typeDescriptions": {
                      "typeIdentifier": "t_string_storage_ptr",
                      "typeString": "string"
                    }
                  },
                  "value": null,
                  "visibility": "internal"
                }
              ],
              "src": "366:21:1"
            },
            "returnParameters": {
              "id": 97,
              "nodeType": "ParameterList",
              "parameters": [],
              "src": "395:0:1"
            },
            "scope": 122,
            "src": "349:69:1",
            "stateMutability": "nonpayable",
            "superFunction": null,
            "visibility": "public"
          },
          {
            "body": {
              "id": 116,
              "nodeType": "Block",
              "src": "485:29:1",
              "statements": [
                {
                  "expression": {
                    "argumentTypes": null,
                    "arguments": [
                      {
                        "argumentTypes": null,
                        "id": 113,
                        "name": "value",
                        "nodeType": "Identifier",
                        "overloadedDeclarations": [],
                        "referencedDeclaration": 107,
                        "src": "503:5:1",
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
                        "id": 110,
                        "name": "to",
                        "nodeType": "Identifier",
                        "overloadedDeclarations": [],
                        "referencedDeclaration": 105,
                        "src": "491:2:1",
                        "typeDescriptions": {
                          "typeIdentifier": "t_address_payable",
                          "typeString": "address payable"
                        }
                      },
                      "id": 112,
                      "isConstant": false,
                      "isLValue": false,
                      "isPure": false,
                      "lValueRequested": false,
                      "memberName": "transfer",
                      "nodeType": "MemberAccess",
                      "referencedDeclaration": null,
                      "src": "491:11:1",
                      "typeDescriptions": {
                        "typeIdentifier": "t_function_transfer_nonpayable$_t_uint256_$returns$__$",
                        "typeString": "function (uint256)"
                      }
                    },
                    "id": 114,
                    "isConstant": false,
                    "isLValue": false,
                    "isPure": false,
                    "kind": "functionCall",
                    "lValueRequested": false,
                    "names": [],
                    "nodeType": "FunctionCall",
                    "src": "491:18:1",
                    "typeDescriptions": {
                      "typeIdentifier": "t_tuple$__$",
                      "typeString": "tuple()"
                    }
                  },
                  "id": 115,
                  "nodeType": "ExpressionStatement",
                  "src": "491:18:1"
                }
              ]
            },
            "documentation": null,
            "id": 117,
            "implemented": true,
            "kind": "function",
            "modifiers": [],
            "name": "sendEth",
            "nodeType": "FunctionDefinition",
            "parameters": {
              "id": 108,
              "nodeType": "ParameterList",
              "parameters": [
                {
                  "constant": false,
                  "id": 105,
                  "name": "to",
                  "nodeType": "VariableDeclaration",
                  "scope": 117,
                  "src": "438:18:1",
                  "stateVariable": false,
                  "storageLocation": "default",
                  "typeDescriptions": {
                    "typeIdentifier": "t_address_payable",
                    "typeString": "address payable"
                  },
                  "typeName": {
                    "id": 104,
                    "name": "address",
                    "nodeType": "ElementaryTypeName",
                    "src": "438:15:1",
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
                  "id": 107,
                  "name": "value",
                  "nodeType": "VariableDeclaration",
                  "scope": 117,
                  "src": "458:10:1",
                  "stateVariable": false,
                  "storageLocation": "default",
                  "typeDescriptions": {
                    "typeIdentifier": "t_uint256",
                    "typeString": "uint256"
                  },
                  "typeName": {
                    "id": 106,
                    "name": "uint",
                    "nodeType": "ElementaryTypeName",
                    "src": "458:4:1",
                    "typeDescriptions": {
                      "typeIdentifier": "t_uint256",
                      "typeString": "uint256"
                    }
                  },
                  "value": null,
                  "visibility": "internal"
                }
              ],
              "src": "437:32:1"
            },
            "returnParameters": {
              "id": 109,
              "nodeType": "ParameterList",
              "parameters": [],
              "src": "485:0:1"
            },
            "scope": 122,
            "src": "421:93:1",
            "stateMutability": "payable",
            "superFunction": null,
            "visibility": "public"
          },
          {
            "body": {
              "id": 120,
              "nodeType": "Block",
              "src": "546:2:1",
              "statements": []
            },
            "documentation": null,
            "id": 121,
            "implemented": true,
            "kind": "fallback",
            "modifiers": [],
            "name": "",
            "nodeType": "FunctionDefinition",
            "parameters": {
              "id": 118,
              "nodeType": "ParameterList",
              "parameters": [],
              "src": "526:2:1"
            },
            "returnParameters": {
              "id": 119,
              "nodeType": "ParameterList",
              "parameters": [],
              "src": "546:0:1"
            },
            "scope": 122,
            "src": "517:31:1",
            "stateMutability": "payable",
            "superFunction": null,
            "visibility": "external"
          }
        ],
        "scope": 123,
        "src": "33:517:1"
      }
    ],
    "src": "0:551:1"
  },
  "compiler": {
    "name": "solc",
    "version": "0.5.8+commit.23d335f2.Emscripten.clang"
  },
  "networks": {},
  "schemaVersion": "3.0.11",
  "updatedAt": "2019-11-09T13:53:05.501Z",
  "devdoc": {
    "methods": {}
  },
  "userdoc": {
    "methods": {}
  }
}
},{}]},{},[1])