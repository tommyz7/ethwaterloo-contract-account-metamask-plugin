# The first smart account in Metamask history!

Winner of ETHWaterloo2. Using Metamask Snaps. Demo video https://www.youtube.com/watch?v=iwaseuYXYx0

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
