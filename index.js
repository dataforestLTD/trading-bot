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

// LOAD COIN ADDRESSES FROM JSON, MAKE LISTS
const tokenList = require('./contracts.json');
const priceChanges = {};
const currentPriceTrend = {};
const currentHodl = {};

// POPULATE PRICE CHANGE DICT, SO JS KNOWS VALUE IS LIST
for (var i = 0; i < tokenList.length; i++) {
  priceChanges[tokenList[i].tokenAddress] = [];
}

let priceMonitor
let monitoringPrice = false

async function monitorPrice() {
  if (monitoringPrice) {
    return
  }

  console.log("Checking price...")
  monitoringPrice = true

  // LOOP THROUGH CONTRACT LIST
  for (var i = 0; i < tokenList.length; i++) {
    var obj = tokenList[i];
    var options = {
      address: obj.tokenAddress,
      chain: "polygon",
      exchange: "quickswap"
    }
    // GET TOKEN PRICE
    try {
      var tokenPrice = await Moralis.Web3API.token.getTokenPrice(options);
      console.log(obj.ticker, "$", tokenPrice.usdPrice);
      var changes = [priceChanges[obj.tokenAddress]];
      changes[0].push(tokenPrice.usdPrice);
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
    // CHECK PRICE CHANGES
    if (priceChanges[obj.tokenAddress].length >= 6) {
      var tokenChange = 0;
      if (priceChanges[obj.tokenAddress][0] < priceChanges[obj.tokenAddress][priceChanges[obj.tokenAddress].length - 1]) {
        console.log(obj.ticker, "price went up %", ((priceChanges[obj.tokenAddress][priceChanges[obj.tokenAddress].length - 1] - priceChanges[obj.tokenAddress][0]) / priceChanges[obj.tokenAddress][0]) * 100);
        tokenChange = (((priceChanges[obj.tokenAddress][priceChanges[obj.tokenAddress].length - 1] - priceChanges[obj.tokenAddress][0]) / priceChanges[obj.tokenAddress][0]) * 100);
      }
      if (priceChanges[obj.tokenAddress][0] > priceChanges[obj.tokenAddress][priceChanges[obj.tokenAddress].length - 1]) {
        console.log(obj.ticker, "price went down %", ((priceChanges[obj.tokenAddress][0] - priceChanges[obj.tokenAddress][priceChanges[obj.tokenAddress].length - 1])) * 100);
        tokenChange = (((priceChanges[obj.tokenAddress][0] - priceChanges[obj.tokenAddress][priceChanges[obj.tokenAddress].length - 1])) * -100);
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
}

// Check markets every n seconds`
const POLLING_INTERVAL = process.env.POLLING_INTERVAL || 10000 // 1 Second = 1000
priceMonitor = setInterval(async () => { await monitorPrice() }, POLLING_INTERVAL)
