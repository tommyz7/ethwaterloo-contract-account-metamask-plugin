# The first smart account in Metamask history!

Using Metamask Snaps. More details https://devpost.com/software/dc-wallet

## Running locally
### Run Ganache

`npm i -g ganache-cli`

`ganache-cli -d`

### Compile truffle contract and run migrations

`npm i -g truffle`

`cd truffle`

`truffle compile --all`

`truffle migrate --reset`

### Build and run Metamask

`cd metamask`

`yarn install`

`yarn start`

### Go to Chrome Extentions and click *load unpacked*. Load from `/metamask/dist/chrome/`

### Run Metamask Plugin

`cd metamask-plugin/examples/defi-custody`

`npm link`

`npm install -g mm-plugin`

`mm-plugin build`

`mm-plugin serve`

### Open `http://localhost:8089` and enjoy
