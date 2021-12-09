require('dotenv').config()
const express = require('express')
const bodyParser = require('body-parser')
const http = require('http')
const Web3 = require('web3')
const HDWalletProvider = require('@truffle/hdwallet-provider')
const moment = require('moment-timezone')
const numeral = require('numeral')
const _ = require('lodash')

// SERVER CONFIG
const PORT = process.env.PORT || 5000
const app = express();
const server = http.createServer(app).listen(PORT, () => console.log(`Listening on ${PORT}`))

// WEB3 CONFIG
const web3 = new Web3(new HDWalletProvider(process.env.PRIVATE_KEY, process.env.RPC_URL))

// MORALIS CONFIG
const serverUrl = process.env.MOR_URL;
const appId = process.env.MOR_APP_ID;
const apiKey = process.env.MOR_API_KEY;
const Moralis = require('moralis/node');
Moralis.start({ serverUrl, appId });

// LOAD COIN ADDRESSES FROM JSON MAKE LISTS
const tokenList = require('./contracts.json');
const priceChanges = {};
const currentPriceTrend = {};
const currentHodl = {};

// Minimum eth to swap  
const ETH_AMOUNT = web3.utils.toWei('1', 'Ether')
console.log("Eth Amount", ETH_AMOUNT)

const ETH_SELL_PRICE = web3.utils.toWei('20000', 'Ether') // 200 Dai a.k.a. $200 USD

for (var i = 0; i < tokenList.length; i++) {
  priceChanges[tokenList[i].tokenAddress] = [];
}

async function sellEth(ethAmount, daiAmount) {
  const moment = require('moment') // import moment.js library
  const now = moment().unix() // fetch current unix timestamp
  const DEADLINE = now + 60 // add 60 seconds
  console.log("Deadline", DEADLINE)

  // Transaction Settings
  const SETTINGS = {
    gasLimit: 8000000, // Override gas settings: https://github.com/ethers-io/ethers.js/issues/469
    gasPrice: web3.utils.toWei('50', 'Gwei'),
    from: process.env.ACCOUNT, // Use your account here
    value: ethAmount // Amount of Ether to Swap
  }

  // Perform Swap
  console.log('Performing swap...')
  let result = await exchangeContract.methods.ethToTokenSwapInput(daiAmount.toString(), DEADLINE).send(SETTINGS)
  console.log(`Successful Swap: https://ropsten.etherscan.io/tx/${result.transactionHash}`)
}

async function checkBalances() {
  let balance

  // Check Ether balance swap
  balance = await web3.eth.getBalance(process.env.ACCOUNT)
  balance = web3.utils.toWei(balance, 'Ether')
  console.log("Ether Balance:", balance)

  // Check Dai balance swap
  balance = await daiContract.methods.balanceOf(process.env.ACCOUNT).call()
  balance = web3.utils.toWei(balance, 'Ether')
  console.log("Dai Balance:", balance)
}

let priceMonitor
let monitoringPrice = false

async function monitorPrice() {
  if (monitoringPrice) {
    return
  }

  console.log("Checking price...")
  monitoringPrice = true

  for (var i = 0; i < tokenList.length; i++) {
    var obj = tokenList[i];
    var options = {
      address: obj.tokenAddress,
      chain: "polygon",
      exchange: "quickswap"
    }
    try {
      var tokenPrice = await Moralis.Web3API.token.getTokenPrice(options);
      console.log(obj.ticker, "$", tokenPrice.usdPrice.toFixed(18));
      var changes = [priceChanges[obj.tokenAddress]];
      changes[0].push(tokenPrice.usdPrice.toFixed(18));
      priceChanges[obj.tokenAddress] = changes[0];
    }
    catch (error) {
      if (error.code != 141) {
        console.log(error);
        console.log(obj.ticker);
      }
      else {
        console.log("No Price Found for", obj.ticker);
      }
    }
    if (priceChanges[obj.tokenAddress].length >= 6) {
      var tokenChange = 0;
      if (priceChanges[obj.tokenAddress][0] < priceChanges[obj.tokenAddress][priceChanges[obj.tokenAddress].length - 1]) {
        console.log(obj.ticker, "price went up %", ((priceChanges[obj.tokenAddress][priceChanges[obj.tokenAddress].length - 1] - priceChanges[obj.tokenAddress][0]) / priceChanges[obj.tokenAddress][0]) * 100);
        tokenChange = (((priceChanges[obj.tokenAddress][priceChanges[obj.tokenAddress].length - 1] - priceChanges[obj.tokenAddress][0]) / priceChanges[obj.tokenAddress][0]) * 100).toFixed(18);
      }
      if (priceChanges[obj.tokenAddress][0] > priceChanges[obj.tokenAddress][priceChanges[obj.tokenAddress].length - 1]) {
        console.log(obj.ticker, "price went down %", ((priceChanges[obj.tokenAddress][0] - priceChanges[obj.tokenAddress][priceChanges[obj.tokenAddress].length - 1])) * 100);
        tokenChange = (((priceChanges[obj.tokenAddress][0] - priceChanges[obj.tokenAddress][priceChanges[obj.tokenAddress].length - 1])) * -100).toFixed(18);
      }
      if (priceChanges[obj.tokenAddress][0] == priceChanges[obj.tokenAddress][priceChanges[obj.tokenAddress].length - 1]) {
        console.log(obj.ticker, "price didn't change");
        tokenChange = 0;
      }
      priceChanges[obj.tokenAddress].pop[0];
      currentPriceTrend[obj.tokenAddress] = tokenChange;
    }
  }
  AnalyzePriceChanges();
  monitoringPrice = false;
}

async function AnalyzePriceChanges() {
  var bestChange = 0;
  var bestCoin = "";
  var worstChange = 0;
  var worstCoin = "";
  for (var key in currentPriceTrend) {
    var value = currentPriceTrend[key];
    if (value > bestChange) {
      bestChange = value;
      bestCoin = key;
    }
    if (value < worstChange) {
      worstChange = value;
      worstCoin = key;
    }
  }
  console.log(bestCoin, " has the best percentage change of %", bestChange);
  console.log(worstCoin, " has the worst percentage change of -%", worstChange);
  var maticBalance = await web3.eth.getBalance("0x37d25aE1Ed276e4BBaF1254c24d95066879f06b7");
  console.log(maticBalance / 1000000000000000000)
}

// Check markets every n seconds`
const POLLING_INTERVAL = process.env.POLLING_INTERVAL || 10000 // 1 Second = 1000
priceMonitor = setInterval(async () => { await monitorPrice() }, POLLING_INTERVAL)
