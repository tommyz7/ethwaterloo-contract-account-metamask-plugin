const { errors: rpcErrors } = require('eth-json-rpc-errors')
const ethereumjs = require('ethereumjs-wallet')
const EthereumTx = require('ethereumjs-tx').Transaction

const accounts = [];
updateUi();

wallet.registerRpcMessageHandler(async (_origin, req) => {
  console.log('addAccount')
  switch (req.method) {
    case 'addAccount':
      addAccount(req.params);
      break;

    default:
      console.log('addAccount error')
      throw rpcErrors.methodNotFound(req)
  }

  updateUi();
  return true
})

wallet.registerAccountMessageHandler(async (origin, req) => {
  switch (req.method) {
    case 'eth_sign':
    case 'eth_signTransaction':
    case 'personal_sign':
    case 'wallet_signTypedData':
    case 'wallet_signTypedData_v3':
    case 'wallet_signTypedData_v4':
      console.log('origin, req', origin, req)

      let ethjsWallet = await ethereumjs.fromPrivateKey(await wallet.getAppKey());
      console.log('ethjsWallet', ethjsWallet);
      console.log('getAddress()', '0x372314Cb378A43486FA9D25e0155AA2892fD3941', await walletWithProvider.getAddress());

      let addr = await ethjsWallet.getAddress()
      let params = [
        addr,
        "latest"
      ];

      // let nonce = await wallet.send({
      //   method: 'eth_getTransactionCount',
      //   params: params,
      //   from: addr
      // })

      console.log('nonce', nonce);

      // Number()

      // let transaction = {
      //     nonce: await walletWithProvider.getTransactionCount(),
      //     gasLimit: 221000,
      //     gasPrice: req.params[0].gasPrice,

      //     to: req.params[0].to,
      //     // ... or supports ENS names
      //     // to: "ricmoo.firefly.eth",

      //     value: req.params[0].value,
      //     data: req.params[0].data,
      //     chainId: ethers.utils.getNetwork().chainId
      // }

      // let singedTx = await walletWithProvider.sign(transaction);
      // console.log('wallet', wallet)

      const result = await prompt({ customHtml: `<div style="width: 100%;overflow-wrap: break-word;">
        The site from <span style="font-weight: 900;color: #037DD6;"><a href="${origin}">${origin}</a></span> requests you sign this with your offline strategy:\n${JSON.stringify(req)}
        </div>`})
      return 0
    default:
      throw rpcErrors.methodNotFound(req)
  }
})

async function addAccount (params) {
  validate(params);
  const account = params[0]
  const approved = await confirm(`Do you want to add offline account ${account} to your wallet?`)
  if (!approved) {
    throw rpcErrors.userRejectedRequest()
  }
  accounts.push(account);
  updateUi();
}

async function deposit (params) {
  validate(params);
  const account = params[0]
  const approved = await confirm(`Do you want to add offline account ${account} to your wallet?`)
  if (!approved) {
    throw rpcErrors.userRejectedRequest()
  }
  accounts.push(account);
  updateUi();
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

