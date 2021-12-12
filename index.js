/*                                            _..
.                                            .qd$$$$bp.
.                                         .q$$$$$$$$$$m.
.                                        .$$$$$$$$$$$$$$
.                                      .q$$$$$$$$$$$$$$$$
.                                     .$$$$$$$$$$$$P\$$$$;
.                                   .q$$$$$$$$$P^"_.`;$$$$
.                                  q$$$$$$$P;\   ,  /$$$$P
.                                .$$$P^::Y$/`  _  .:.$$$/
.                               .P.:..    \ `._.-:.. \$P
.                               $':.  __.. :   :..    :'
.                              /:_..::.   `. .:.    .'|
.                            _::..          T:..   /  :
.                         .::..             J:..  :  :
.                      .::..          7:..   F:.. :  ;
.                  _.::..             |:..   J:.. `./
.             _..:::..               /J:..    F:.  :
.           .::::..                .T  \:..   J:.  /
.          /:::...               .' `.  \:..   F_o'
.         .:::...              .'     \  \:..  J ;
.         ::::...           .-'`.    _.`._\:..  \'
.         ':::...         .'  `._7.-'_.-  `\:.   \
.          \:::...   _..-'__.._/_.--' ,:.   b:.   \._
.           `::::..-"_.'-"_..--"      :..   /):.   `.\
.             `-:/"-7.--""            _::.-'P::..    \}
.  _....------""""""            _..--".-'   \::..     `.
. (::..              _...----"""  _.-'       `---:..    `-.
.  \::..      _.-""""   `""""---""                `::...___)
.   `\:._.-"""               HODL BEWBS, NOT COINS*/

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
const console = require('console');

// SERVER CONFIG
const PORT = process.env.PORT || 5000;
const app = express();
const server = http.createServer(app).listen(PORT, () => console.log(`Listening on ${PORT}`));
const POLLING_INTERVAL = 1000; // 1 Second = 1000

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
const HODL_ACCOUNT = process.env.HODL_ACCOUNT;

// LOAD COIN ADDRESSES FROM JSON, MAKE LISTS
const STABLE_COINS = require('./stableTokens.json');
const SHIT_COINS = require('./shitTokens.json');
const WATCH_COINS = require('./quickswapTokens.json');
const ERC20_ABI = require("./erc20ABI.json");
const PRICE_CHANGES = {};
const CURRENT_PRICE_TREND = {};
const CURRENT_PRICE_LIST = {};
const SLIPPAGE = 0.97;
const topFive = {};
const currentHodl = {};

// SET QUICKSWAP CONTRACT
const QUICKSWAP_ABI = require('./quickswapABI.json');
const QUICKSWAP_ADDRESS = "0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff"


// POPULATE PRICE CHANGE DICT
for (var i = 0; i < WATCH_COINS.length; i++) {
  PRICE_CHANGES[WATCH_COINS[i].address] = [];
}

let priceMonitor;
let monitoringPrice = false;
let executingTrade = false;





async function monitorPrice() {
  if (monitoringPrice) {
    return;
  }
  monitoringPrice = true;

  // LOOP THROUGH CONTRACT LIST
  for (var i = 0; i < WATCH_COINS.length; i++) {
    var obj = WATCH_COINS[i];
    var options = {
      address: obj.address,
      chain: "polygon",
      exchange: "quickswap"
    }

    // GET TOKEN PRICE
    try {
      var tokenPrice = await Moralis.Web3API.token.getTokenPrice(options);
      console.log(obj.name, "has a value of $", tokenPrice.usdPrice.toFixed(18));
      var changes = [PRICE_CHANGES[obj.address]];
      changes[0].push(tokenPrice.usdPrice);
      PRICE_CHANGES[obj.address] = changes[0];
      CURRENT_PRICE_LIST[obj.address] = tokenPrice.usdPrice.toFixed(18);
    }
    catch (error) {
      if (error.code != 141) {
        console.log(error);
        console.log(obj.name);
      }
      else {
        console.log("No Price Found for", obj.name);
      }
    }
    // CHECK PRICE CHANGES
    if (PRICE_CHANGES[obj.address].length >= 2) {
      var tokenChange = 0;
      if (PRICE_CHANGES[obj.address][0] < PRICE_CHANGES[obj.address][1]) {
        console.log(obj.name, "price went up %", ((PRICE_CHANGES[obj.address][1] - PRICE_CHANGES[obj.address][0]) / PRICE_CHANGES[obj.address][0]) * 100);
        tokenChange = (((PRICE_CHANGES[obj.address][1] - PRICE_CHANGES[obj.address][0]) / PRICE_CHANGES[obj.address][0]) * 100);
      }
      if (PRICE_CHANGES[obj.address][0] > PRICE_CHANGES[obj.address][1]) {
        console.log(obj.name, "price went down %", ((PRICE_CHANGES[obj.address][0] - PRICE_CHANGES[obj.address][1]) / PRICE_CHANGES[obj.address][0]) * 100);
        tokenChange = (((PRICE_CHANGES[obj.address][0] - PRICE_CHANGES[obj.address][1]) / PRICE_CHANGES[obj.address][0]) * -100);
      }
      if (PRICE_CHANGES[obj.address][0] == PRICE_CHANGES[obj.address][1]) {
        console.log(obj.name, "price didn't change");
        tokenChange = 0;
      }
      PRICE_CHANGES[obj.address].shift();
      CURRENT_PRICE_TREND[obj.address] = tokenChange;
    }
  }

  AnalyzePriceChanges();
  CashOut();

  monitoringPrice = false;
}

// RETURN TOP 5 GAINING COINS
async function AnalyzePriceChanges() {
  var tempTop5 = Object.keys(CURRENT_PRICE_TREND).map(function (key) {
    return [key, CURRENT_PRICE_TREND[key]];
  });
  tempTop5.sort(function (first, second) {
    return second[1] - first[1];
  });
  console.log(tempTop5.slice(0, 10));
}

// THE SKY IS FALLING, SELL IT ALL
async function CashOut() {
  const options = { chain: 'polygon', address: ACCOUNT };
  const balances = await Moralis.Web3API.account.getTokenBalances(options);
  console.log("Oh no, everything is dipping, thankfully you created me, master.");

  for (var i = 0; i < balances.length; i++) {
    if (!STABLE_COINS.includes(balances[i].token_address) && !SHIT_COINS.includes(balances[i].token_address)) {
      SwapCoins(balances[i].token_address, STABLE_COINS[1], balances[i].balance);
    }
  }
}

// CONVERT TOKEN TO STABLE COIN
async function SwapCoins(tokenIn, tokenOut, amountToTrade) {
  // POPULATE INFO FOR SETTINGS
  const moment = require('moment')
  const now = moment().unix()
  const DEADLINE = now + 60
  const MATIC = "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270";
  const QUICK = "0x831753dd7087cac61ab5644b308642cc1c33dc13";
  const ETH = "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619";
  const USDC = "0x2791bca1f2de4661ed88a30c99a7a9449aa84174";
  const USDT = "0xc2132d05d31c914a87c6611c10748aeb04b58e8f";
  const miMATIC = "0xa3fa99a148fa48d14ed51d610c367c61876997f1";

  try {
    // SET OPTIONS AND SETTINGS FOR APPROVE/SWAP
    const OPTIONS_IN = {
      address: tokenIn,
      chain: "polygon",
      exchange: "quickswap"
    }
    const OPTIONS_OUT = {
      address: tokenOut,
      chain: "polygon",
      exchange: "quickswap"
    }
    const SETTINGS = {
      gasLimit: 8000000,
      gasPrice: web3.utils.toWei('50', 'Gwei'),
      from: ACCOUNT,
    }

    // GET SWAP AMOUNT BASED ON TOKEN PRICE
    const tokenInPrice = await Moralis.Web3API.token.getTokenPrice(OPTIONS_IN);
    const tokenOutPrice = await Moralis.Web3API.token.getTokenPrice(OPTIONS_OUT);
    const decInOptions = { chain: "polygon", addresses: tokenIn };
    const decOutOptions = { chain: "polygon", addresses: tokenOut };
    const tokenInMetadata = await Moralis.Web3API.token.getTokenMetadata(decInOptions);
    const tokenOutMetadata = await Moralis.Web3API.token.getTokenMetadata(decOutOptions);
    const tokenInDecimals = tokenInMetadata[0].decimals;
    const tokenOutDecimals = tokenOutMetadata[0].decimals;
    const ethIn = Moralis.Units.FromWei(amountToTrade, tokenInDecimals);
    const cashIn = (ethIn * tokenInPrice.usdPrice * SLIPPAGE).toFixed(18);
    const converted = cashIn / tokenOutPrice.usdPrice;
    const approvalConverted = (cashIn / tokenOutPrice.usdPrice) * 100;
    console.log(converted);
    // const weiOut = Moralis.Units.Token(converted, tokenOutDecimals);
    const weiOut = BigInt((converted * (Math.pow(10, tokenOutDecimals))).toFixed(0));
    const approveAmount = BigInt(approvalConverted.toFixed(0));

    // TOKEN CONTRACT SETTINGS      
    const address = tokenIn;
    const tokenContract = new web3.eth.Contract(ERC20_ABI, address);
    const QUICKSWAP_CONTRACT = new web3.eth.Contract(QUICKSWAP_ABI, QUICKSWAP_ADDRESS);

    // CHECK FOR APPROVAL AND EXECUTE TRADE
    const currentApproval = await tokenContract.methods.allowance(ACCOUNT, QUICKSWAP_ADDRESS).call();
    const biApproval = BigInt(currentApproval);
    console.log("\nCashing out $", cashIn, "\n");
    console.log("\n", currentApproval, biApproval, weiOut, "\n");
    // executingTrade = true;
    // await tokenContract.methods.approve(QUICKSWAP_ADDRESS, weiOut).send(SETTINGS);
    // let result = await QUICKSWAP_CONTRACT.methods.swapExactTokensForTokens(BigInt(amountToTrade), weiOut, [tokenIn, ETH, tokenOut], ACCOUNT, DEADLINE).send(SETTINGS)
    // console.log(`\nSuccessful Swap: https://polygonscan.com/tx/${result.transactionHash}\n`);
    // executingTrade = false;



    if (weiOut >= currentApproval) {
      if (currentApproval == 0) {
        console.log("\nNo approval, approving spend of", weiOut, "\n");
        executingTrade = true;
        await tokenContract.methods.approve(QUICKSWAP_ADDRESS, approveAmount).send(SETTINGS);
        let result = await QUICKSWAP_CONTRACT.methods.swapExactTokensForTokens(BigInt(amountToTrade), weiOut, [tokenIn, ETH, tokenOut], ACCOUNT, DEADLINE).send(SETTINGS)
        console.log(`\nSuccessful Swap: https://polygonscan.com/tx/${result.transactionHash}\n`);
        executingTrade = false;
      }
      else {
        console.log("\nCurrent approval too low, increasing to", weiOut, "\n");
        executingTrade = true;
        await tokenContract.methods.increaseAllowance(QUICKSWAP_ADDRESS, approveAmount).send(SETTINGS);
        let result = await QUICKSWAP_CONTRACT.methods.swapExactTokensForTokens(BigInt(amountToTrade), weiOut, [tokenIn, MATIC, tokenOut], ACCOUNT, DEADLINE).send(SETTINGS)
        console.log(`\nSuccessful Swap: https://polygonscan.com/tx/${result.transactionHash}\n`);
        executingTrade = false;
      }
    }
    else {
      console.log("\nWithin approved amount, swapping\n")
      executingTrade = true;
      let result = await QUICKSWAP_CONTRACT.methods.swapExactTokensForTokens(BigInt(amountToTrade), weiOut, [tokenIn, MATIC, tokenOut], ACCOUNT, DEADLINE).send(SETTINGS)
      console.log(`\nSuccessful Swap: https://polygonscan.com/tx/${result.transactionHash}\n`);
      executingTrade = false;
    }
  }

  catch (error) {
    console.log(error);
    return;
  }
}

async function Approve(address) {
  const SETTINGS = {
    gasLimit: 8000000,
    gasPrice: web3.utils.toWei('50', 'Gwei'),
    from: ACCOUNT,
  }
  const tokenContract = new web3.eth.Contract(ERC20_ABI, address);
  await tokenContract.methods.approve(QUICKSWAP_ADDRESS, 1000000000000).send(SETTINGS);
  console.log("approved")

}

priceMonitor = setInterval(async () => { await monitorPrice() }, POLLING_INTERVAL)
