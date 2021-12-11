/*
                                               _..
                                           .qd$$$$bp.
                                         .q$$$$$$$$$$m.
                                        .$$$$$$$$$$$$$$
                                      .q$$$$$$$$$$$$$$$$
                                     .$$$$$$$$$$$$P\$$$$;
                                   .q$$$$$$$$$P^"_.`;$$$$
                                  q$$$$$$$P;\   ,  /$$$$P
                                .$$$P^::Y$/`  _  .:.$$$/
                               .P.:..    \ `._.-:.. \$P
                               $':.  __.. :   :..    :'
                              /:_..::.   `. .:.    .'|
                            _::..          T:..   /  :
                         .::..             J:..  :  :
                      .::..          7:..   F:.. :  ;
                  _.::..             |:..   J:.. `./
             _..:::..               /J:..    F:.  :
           .::::..                .T  \:..   J:.  /
          /:::...               .' `.  \:..   F_o'
         .:::...              .'     \  \:..  J ;
         ::::...           .-'`.    _.`._\:..  \'
         ':::...         .'  `._7.-'_.-  `\:.   \
          \:::...   _..-'__.._/_.--' ,:.   b:.   \._
           `::::..-"_.'-"_..--"      :..   /):.   `.\
             `-:/"-7.--""            _::.-'P::..    \}
  _....------""""""            _..--".-'   \::..     `.
 (::..              _...----"""  _.-'       `---:..    `-.
  \::..      _.-""""   `""""---""                `::...___)
   `\:._.-"""                    I HEART BOOBIES

------------------------------------------------
*/
// BASE REQUIREMENTS
require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const http = require('http');
const Web3 = require('web3');
const HDWalletProvider = require('@truffle/hdwallet-provider');
const moment = require('moment-timezone');
const numeral = require('numeral');
const _ = require('lodash');

// SERVER CONFIG
const PORT = process.env.PORT || 5000;
const app = express();
const server = http.createServer(app).listen(PORT, () => console.log(`Listening on ${PORT}`));

// WEB3 CONFIG
const web3 = new Web3(new HDWalletProvider(process.env.PRIVATE_KEY, process.env.RPC_URL));

// MORALIS CONFIG
const serverUrl = process.env.MOR_URL;
const appId = process.env.MOR_APP_ID;
const apiKey = process.env.MOR_API_KEY;
const Moralis = require('moralis/node');
Moralis.start({ serverUrl, appId });

// ACCOUNT CONFIG

const ACCOUNT = process.env.ACCOUNT;

// LOAD COIN ADDRESSES FROM JSON, MAKE LISTS
const tokenList = require('./watchTokens.json');
const priceChanges = {};
const currentPriceTrend = {};
const currentPriceList = {};
const topFive = {};
const currentHodl = {};

// SET QUICKSWAP CONTRACT
const qsABI = require('./qsABI.json');
const console = require('console');
const qsAddress = "0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff"
const qsSwapContract = new web3.eth.Contract(qsABI, qsAddress);

// POPULATE PRICE CHANGE DICT, SO JS KNOWS VALUE IS LIST
for (var i = 0; i < tokenList.length; i++) {
  priceChanges[tokenList[i].tokenAddress] = [];
}

let priceMonitor;
let monitoringPrice = false;

async function monitorPrice() {
  if (monitoringPrice) {
    return;
  }

  console.log("Checking price...");
  monitoringPrice = true;

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
      console.log(obj.ticker, "has a value of $", tokenPrice.usdPrice.toFixed(18));
      var changes = [priceChanges[obj.tokenAddress]];
      changes[0].push(tokenPrice.usdPrice);
      priceChanges[obj.tokenAddress] = changes[0];
      currentPriceList[obj.tokenAddress] = tokenPrice.usdPrice.toFixed(18);
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
    if (priceChanges[obj.tokenAddress].length >= 2) {
      var tokenChange = 0;
      if (priceChanges[obj.tokenAddress][0] < priceChanges[obj.tokenAddress][1]) {
        console.log(obj.ticker, "price went up %", ((priceChanges[obj.tokenAddress][1] - priceChanges[obj.tokenAddress][0]) / priceChanges[obj.tokenAddress][0]) * 100);
        tokenChange = (((priceChanges[obj.tokenAddress][priceChanges[obj.tokenAddress].length - 1] - priceChanges[obj.tokenAddress][0]) / priceChanges[obj.tokenAddress][0]) * 100).toFixed(18);
      }
      if (priceChanges[obj.tokenAddress][0] > priceChanges[obj.tokenAddress][1]) {
        console.log(obj.ticker, "price went down %", ((priceChanges[obj.tokenAddress][0] - priceChanges[obj.tokenAddress][1])) * 100);
        tokenChange = (((priceChanges[obj.tokenAddress][0] - priceChanges[obj.tokenAddress][priceChanges[obj.tokenAddress].length - 1])) * -100).toFixed(18);
      }
      if (priceChanges[obj.tokenAddress][0] == priceChanges[obj.tokenAddress][1]) {
        console.log(obj.ticker, "price didn't change");
        tokenChange = 0;
      }
      priceChanges[obj.tokenAddress].pop[0];
      currentPriceTrend[obj.tokenAddress] = tokenChange;
    }
  }
  AnalyzePriceChanges();
  CashOut();
  monitoringPrice = false;
}

// RETURN TOP 5 GAINING COINS
async function AnalyzePriceChanges() {
  var tempTop5 = Object.keys(currentPriceTrend).map(function (key) {
    return [key, currentPriceTrend[key]];
  });
  tempTop5.sort(function (first, second) {
    return second[1] - first[1];
  });
  console.log(tempTop5.slice(0, 5));
}

async function CashOut() {
  const options = { chain: 'polygon', address: ACCOUNT };
  const balances = await Moralis.Web3API.account.getTokenBalances(options);
  // console.log(balances);
  for (var i = 0; i < balances.length; i++) {
    ConvertToStable(balances[i].token_address, balances[i].balance, balances[i].decimals);
  }
}
async function ConvertToStable(tokenIn, amountToTrade, decimals) {

  // POPULATE SETTINGS
  const moment = require('moment')
  const now = moment().unix()
  const DEADLINE = now + 60
  const MATIC = "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270";
  const ETH = "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619";
  const USDT = "0xc2132d05d31c914a87c6611c10748aeb04b58e8f";
  const STABLE_COINS = [
    "0x2791bca1f2de4661ed88a30c99a7a9449aa84174",
    "0xc2132d05d31c914a87c6611c10748aeb04b58e8f",
    "0xa3fa99a148fa48d14ed51d610c367c61876997f1",
    "0x8f3cf7ad23cd3cadbd9735aff958023239c6a063",
    "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270"
  ]
  const SHIT_COINS = [
    "0x22e51bae3f545255e115090202a23c7ede0b00b9"
  ]

  // IGNORE IF COIN IS STABLE OR SHIT
  if (!STABLE_COINS.includes(tokenIn) && !SHIT_COINS.includes(tokenIn)) {
    try {
      const OPTIONS = {
        address: tokenIn,
        chain: "polygon",
        exchange: "quickswap"
      }
      const SETTINGS = {
        gasLimit: 8000000,
        gasPrice: web3.utils.toWei('75', 'Gwei'),
        from: ACCOUNT,
      }

      // SETTINGS FOR APPROVE AND SWAP
      const tokenPriceForSwap = await Moralis.Web3API.token.getTokenPrice(OPTIONS);
      const totalValue = (Moralis.Units.FromWei(amountToTrade, decimals) * (tokenPriceForSwap.usdPrice * 0.98));
      const buyAmount = Moralis.Units.Token(totalValue.toFixed(2), "6");
      const approveAmount = Moralis.Units.Token((totalValue).toFixed(2), "18");

      // TOKEN CONTRACT SETTINGS
      const tokenABI = require("./erc20ABI.json");
      const tokenAddress = tokenIn;
      const tokenContract = new web3.eth.Contract(tokenABI, tokenAddress);

      // CHECK FOR APPROVAL AND EXECUTE TRADE
      const currentApproval = await tokenContract.methods.allowance(ACCOUNT, qsAddress).call();
      console.log("\nCashing out $", totalValue, "\n");
      if (buyAmount < currentApproval) {
        if (currentApproval == 0) {
          console.log("No approval, approving spend of", approveAmount);
          await tokenContract.methods.approve(qsAddress, approveAmount).send(SETTINGS);
          let result = await qsSwapContract.methods.swapExactTokensForTokens(BigInt(amountToTrade), buyAmount, [tokenIn, MATIC, USDT], ACCOUNT, DEADLINE).send(SETTINGS)
          console.log(`\nSuccessful Swap: https://polygonscan.com/tx/${result.transactionHash}\n`);
        }
        else {
          console.log("Current approval too low, increasing to", approveAmount);
          await tokenContract.methods.increaseAllowance(qsAddress, approveAmount).send(SETTINGS);
          let result = await qsSwapContract.methods.swapExactTokensForTokens(BigInt(amountToTrade), buyAmount, [tokenIn, MATIC, USDT], ACCOUNT, DEADLINE).send(SETTINGS)
          console.log(`\nSuccessful Swap: https://polygonscan.com/tx/${result.transactionHash}\n`);
        }
      }
      else {
        console.log("Within approved amount, swapping")
        let result = await qsSwapContract.methods.swapExactTokensForTokens(BigInt(amountToTrade), buyAmount, [tokenIn, MATIC, USDT], ACCOUNT, DEADLINE).send(SETTINGS)
        console.log(`\nSuccessful Swap: https://polygonscan.com/tx/${result.transactionHash}\n`);
      }
    }

    catch (error) {
      console.log(error)
      return;
    }
  }
}



// Check markets every n seconds`
const POLLING_INTERVAL = process.env.POLLING_INTERVAL || 1000 // 1 Second = 1000
priceMonitor = setInterval(async () => { await monitorPrice() }, POLLING_INTERVAL)
