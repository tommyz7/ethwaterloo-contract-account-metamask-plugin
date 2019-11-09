const JsonRpcEngine = require('json-rpc-engine')
const asMiddleware = require('json-rpc-engine/src/asMiddleware')
const createAsyncMiddleware = require('json-rpc-engine/src/createAsyncMiddleware')
const ObservableStore = require('obs-store')
const RpcCap = require('rpc-cap').CapabilitiesController
const { errors: rpcErrors } = require('eth-json-rpc-errors')

const {
  getExternalRestrictedMethods,
  pluginRestrictedMethodDescriptions,
} = require('./restrictedMethods')
const createRequestMiddleware = require('./requestMiddleware')
const createLoggerMiddleware = require('./loggerMiddleware')

// Methods that do not require any permissions to use:
const SAFE_METHODS = require('./permissions-safe-methods.json')

const METADATA_STORE_KEY = 'siteMetadata'
const LOG_STORE_KEY = 'permissionsLog'
const HISTORY_STORE_KEY = 'permissionsHistory'
const WALLET_METHOD_PREFIX = 'wallet_'

function prefix (method) {
  return WALLET_METHOD_PREFIX + method
}

// class PermissionsController extends SafeEventEmitter {
class PermissionsController {

  constructor ({
    openPopup, closePopup, keyringController, pluginsController, assetsController,
    setupProvider, pluginRestrictedMethods, getApi, metamaskEventMethods,
  } = {},
  restoredPermissions = {}, restoredState = {}
  ) {
    this.store = new ObservableStore({
      [METADATA_STORE_KEY]: restoredState[METADATA_STORE_KEY] || {},
      [LOG_STORE_KEY]: restoredState[LOG_STORE_KEY] || [],
      [HISTORY_STORE_KEY]: restoredState[HISTORY_STORE_KEY] || {},
    })
    this._openPopup = openPopup
    this._closePopup = closePopup
    this.keyringController = keyringController
    this.pluginsController = pluginsController
    this.assetsController = assetsController
    this.setupProvider = setupProvider
    this.externalRestrictedMethods = getExternalRestrictedMethods(this)
    this.pluginRestrictedMethods = pluginRestrictedMethods
    this.getApi = getApi
    this.metamaskEventMethods = metamaskEventMethods
    this._initializePermissions(restoredPermissions)
  }

  createMiddleware (options) {
    const { origin, isPlugin } = options
    const engine = new JsonRpcEngine()
    engine.push(this.createPluginMethodRestrictionMiddleware(isPlugin))
    engine.push(createRequestMiddleware({
      store: this.store,
      storeKey: METADATA_STORE_KEY,
    }))
    engine.push(createLoggerMiddleware({
      walletPrefix: WALLET_METHOD_PREFIX,
      restrictedMethods: (
        Object.keys(this.externalRestrictedMethods)
          .concat(Object.keys(this.pluginRestrictedMethods))
      ),
      store: this.store,
      logStoreKey: LOG_STORE_KEY,
      historyStoreKey: HISTORY_STORE_KEY,
    }))
    engine.push(this.permissions.providerMiddlewareFunction.bind(
      this.permissions, { origin }
    ))
    return asMiddleware(engine)
  }

  /**
   * Create middleware for prevent non-plugins from accessing methods only available to plugins
   */
  createPluginMethodRestrictionMiddleware (isPlugin) {
    return createAsyncMiddleware(async (req, res, next) => {
      if (typeof req.method !== 'string') {
        res.error = rpcErrors.invalidRequest(null, req)
        return // TODO:json-rpc-engine
      }

      if (pluginRestrictedMethodDescriptions[req.method] && !isPlugin) {
        res.error = rpcErrors.methodNotFound(null, req.method)
        return
      }

      return next()
    })
  }

  /**
   * Returns the accounts that should be exposed for the given origin domain,
   * if any. This method exists for when a trusted context needs to know
   * which accounts are exposed to a given domain.
   *
   * Do not use in untrusted contexts; just send an RPC request.
   *
   * @param {string} origin
   */
  getAccounts (origin) {
    return new Promise((resolve, _) => {
      const req = { method: 'eth_accounts' }
      const res = {}
      this.permissions.providerMiddlewareFunction(
        { origin }, req, res, () => {}, _end
      )

      function _end () {
        if (res.error || !Array.isArray(res.result)) resolve([])
        else resolve(res.result)
      }
    })
  }

  /**
   * Removes the given permissions for the given domain.
   * @param {object} domains { origin: [permissions] }
   */
  removePermissionsFor (domains) {
    Object.entries(domains).forEach(([origin, perms]) => {
      this.permissions.removePermissionsFor(
        origin,
        perms.map(methodName => {
          return { parentCapability: methodName }
        })
      )
    })
  }

  /**
   * Removes all known domains and their related permissions.
   */
  clearPermissions () {
    this.permissions.clearDomains()
  }

  /**
   * Clears the permissions log.
   */
  clearLog () {
    this.store.updateState({
      [LOG_STORE_KEY]: [],
    })
  }

  /**
   * Clears the permissions history.
   */
  clearHistory () {
    this.store.updateState({
      [HISTORY_STORE_KEY]: {},
    })
  }

  /**
   * User approval callback.
   * @param {object} approved the approved request object
   */
  async approvePermissionsRequest (approved) {
    const { id } = approved.metadata
    const approval = this.pendingApprovals[id]
    this._closePopup && this._closePopup()

    // Load any requested plugins first:
    const pluginNames = this.pluginsFromPerms(approved.permissions)
    try {
      await Promise.all(pluginNames.map((plugin) => {
        return this.pluginsController.add(plugin)
      }))

      const resolve = approval.resolve
      resolve(approved.permissions)
      delete this.pendingApprovals[id]

      // Once we've approved the initial app permissions,
      // we are free to prompt for the plugin permissions:
      Promise.all(pluginNames.map(async (pluginName) => {
        const plugin = await this.pluginsController.authorize(pluginName)
        const { sourceCode, approvedPermissions } = plugin
        const ethereumProvider = this.pluginsController.setupProvider(pluginName, async () => { return {name: pluginName } }, true)
        await this.pluginsController.run(pluginName, approvedPermissions, sourceCode, ethereumProvider)
      }))
        .catch((err) => {
          // We swallow this error, we don't want the plugin permissions prompt to block the resolution
          // Of the main dapp's permissions prompt.
          console.error(`Error when adding plugin:`, err)
        })

    } catch (reason) {
      const { reject } = approval
      reject(reason)
    }
  }

  pluginsFromPerms (permissions) {
    const permStrings = Object.keys(permissions)
    return permStrings.filter((perm) => {
      return perm.indexOf('wallet_plugin_') === 0
    })
      .map(perm => perm.substr(14))
  }

  /**
   * User rejection callback.
   * @param {string} id the id of the rejected request
   */
  async rejectPermissionsRequest (id) {
    const approval = this.pendingApprovals[id]
    const reject = approval.reject
    reject(false) // TODO:lps:review should this be an error instead?
    this._closePopup && this._closePopup()
    delete this.pendingApprovals[id]
  }

  /**
   * A convenience method for retrieving a login object
   * or creating a new one if needed.
   *
   * @param {string} origin = The origin string representing the domain.
   */
  _initializePermissions (restoredState) {

    const initState = Object.keys(restoredState)
      .filter(k => {
        return ![
          'permissionsDescriptions',
          'permissionsRequests',
        ].includes(k)
      })
      .reduce((acc, k) => {
        acc[k] = restoredState[k]
        return acc
      }, {})

    this.testProfile = {
      name: 'Dan Finlay',
    }

    this.pendingApprovals = {}

    const api = this.getApi()

    const externalMethodsToAddToRestricted = {
      ...this.pluginRestrictedMethods,
      ...api,
      ...this.metamaskEventMethods,
      removePermissionsFor: this.removePermissionsFor.bind(this),
      getApprovedAccounts: this.getAccounts.bind(this),
    }

    const pluginRestrictedMethods = Object.keys(externalMethodsToAddToRestricted).reduce((acc, methodKey) => {
      const hasDescription = externalMethodsToAddToRestricted[methodKey]
      if (!hasDescription) {
        return acc
      }
      return {
        ...acc,
        ['metamask_' + methodKey]: {
          description: pluginRestrictedMethodDescriptions[methodKey] || methodKey,
          method: 'metamask_' + externalMethodsToAddToRestricted[methodKey],
        },
      }
    }, {})

    this.permissions = new RpcCap({

      // Supports passthrough methods:
      safeMethods: SAFE_METHODS,

      // optional prefix for internal methods
      methodPrefix: WALLET_METHOD_PREFIX,

      restrictedMethods: {
        ...this.externalRestrictedMethods, ...pluginRestrictedMethods,
      },

      /**
       * A promise-returning callback used to determine whether to approve
       * permissions requests or not.
       *
       * Currently only returns a boolean, but eventually should return any specific parameters or amendments to the permissions.
       *
       * @param {string} domain - The requesting domain string
       * @param {string} req - The request object sent in to the `requestPermissions` method.
       * @returns {Promise<bool>} approved - Whether the user approves the request or not.
       */
      requestUserApproval: async (options) => {
        const { metadata } = options
        const { id } = metadata

        this._openPopup && this._openPopup()

        return new Promise((resolve, reject) => {
          this.pendingApprovals[id] = { resolve, reject }
        })
      },
    }, initState)
  }

}

module.exports = {
  PermissionsController,
  addInternalMethodPrefix: prefix,
}
