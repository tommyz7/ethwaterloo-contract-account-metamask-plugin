# ethwaterloo-contract-account-metamask-plugin

## Running locally

1. Build and run Metamask
`yarn install`
`yarn start`

2. Go to Chrome Extention and *load unpacked* from `/metamask/dist/chrome/`
3. In another terminal run mm-plugin
`cd metamask-plugin/examples/custom-account`
`npm link`
`npm install -g mm-plugin`
`mm-plugin build`
`mm-plugin serve`
