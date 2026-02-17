MDS.load("./js/decimal.js");
MDS.load("./js/constants.js");
MDS.load("./js/getAccount.js");
MDS.load("./js/coinManager.js");
MDS.load("./js/sql.js");
MDS.load("./js/util.js");
MDS.load("./js/notify.js");
MDS.load("./js/orderbookUtil.js");
MDS.load("./js/orderbookManager.js");

var ACCOUNT;
var READ_MODE = true;
var COMPLETED_CONTRACTS = [];
var INVALID_CONTRACTS = [];
var ORDERSEND_COUNTER = 0;
var LISTINGS_REBALANCE_COUNTER = 0;

var PUBLISHED_ORDERBOOK = true;

function randomInteger(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getStateVariable(coin, port) {
  //Get the state vars
  var statvars = coin.state;
  var len = statvars.length;
  for (var i = 0; i < len; i++) {
    var state = statvars[i];
    if (state.port == port) {
      return state.data;
    }
  }

  return undefined;
}

function getEnabledListing(listings, tokenId) {
  for (var i = 0; i < listings.length; i++) {
    var listing = listings[i];
    if (listing.tokenid === tokenId && listing.enable === true) {
      return listing;
    }
  }
  return null;
}

function checkValidAmount(listingPrice, requestedAmount, actualLockedAmount) {
  var amountRequired = new Decimal(listingPrice).times(requestedAmount).toFixed(8);
  var actualLocked = new Decimal(actualLockedAmount).toFixed(8);
  
  if (new Decimal(actualLocked).lessThan(amountRequired)) {
    return {status: false, amountRequired: amountRequired, actualLocked: actualLocked};
  }

  return {status: true, amountRequired: amountRequired, actualLocked: actualLocked};
}

function estimateObjectSize(obj) {
  var str = JSON.stringify(obj);
  var byteSize = 0;
  
  for (var i = 0; i < str.length; i++) {
    var charCode = str.charCodeAt(i);

    if (charCode <= 0x7F) {
      byteSize += 1;
    } else if (charCode <= 0x7FF) {
      byteSize += 2;
    } else if (charCode >= 0xD800 && charCode <= 0xDBFF) {
      byteSize+=4;
      i++;
    } else {

      byteSize += 3;
    }
  }

  return byteSize;
}

function isValidBiddingCoin(coin) {
  // const MAX_COIN_SIZE = 10240; // 10K in bytes
  // var coinSize = estimateObjectSize(coin);
  
  // if (coinSize > MAX_COIN_SIZE) {
  //   MDS.log(`Coin data size (${coinSize} bytes) exceeds the maximum allowed size (${MAX_COIN_SIZE} bytes)`);
  //   return false;
  // }
  // Check if the state array exists and has elements
  if (!coin.state || !Array.isArray(coin.state) || coin.state.length === 0) {
    return false;
  }

  // Define the expected port-type pairs
  var requiredPorts = {
    0: 1, // Port 0 must have type 1
    1: 1,
    2: 1, // Port 2 must have type 1
    3: 2, // Port 3 must have type 2
    4: 1,
    5: 4,
    6: 4,
    7: 2,
    66: 2
  };

  // Create an object to store the found ports
  var foundPorts = {};

  // Iterate over the state array
  for (var i = 0; i < coin.state.length; i++) {
    var stateItem = coin.state[i];
    var port = stateItem.port;
    var type = stateItem.type;

    // Check if the current port is one we care about, and if the type matches
    if (Object.prototype.hasOwnProperty.call(requiredPorts, port)) {
      if (type === requiredPorts[port]) {
        foundPorts[port] = true; // Mark the port as found and valid
      } else {
        return false; // If the type doesn't match, it's not valid
      }
    }
  }

  // Check that all required ports were found
  for (var requiredPort in requiredPorts) {
    if (
      Object.prototype.hasOwnProperty.call(requiredPorts, requiredPort) &&
      !foundPorts[requiredPort]
    ) {
      return false; // If any required port is missing, it's not valid
    }
  }

  // If all checks pass, the coin is valid
  return true;
}

// Function to check contract coins for purchase requests
function checkForRelevantPurchaseRequests() {
  // let's get the current market...
  getMyOrderbook(function ({status, orderbook}) {
    
    if (!status || orderbook.listings.length === 0) {
      // there are no listings currently... let's sleep
      return;
    }

    
    var seller = orderbook;
    if (seller.publicKey === ACCOUNT.publicKey) {
      // we found our listings... let's now check for relevant requests...
      MDS.cmd("coins coinage:2 address:" + DEX_ADDRESS, function (res) {
        if (res.status) {
          for (var j = 0; j < res.response.length; j++) {
            var coin = res.response[j];

            var isValidCoin = isValidBiddingCoin(coin);
    
            if (!isValidCoin) {
              continue;
            }
    
            if (COMPLETED_CONTRACTS.indexOf(coin.coinid) !== -1 || INVALID_CONTRACTS.indexOf(coin.coinid) !== -1) {
              continue;
            }
            
            var tokenId = getStateVariable(coin, 2);
            var tokenAmount = getStateVariable(coin, 3);
    
            // Check if this listing is enabled and get listing details
            var enabledListing = getEnabledListing(seller.listings, tokenId);
            
            
            if (tokenId && tokenAmount && enabledListing) {
              
              // check coin amount locked, requested amount and the price calculation
              var {status: validCoinStatus, amountRequired, actualLocked } = checkValidAmount(enabledListing.price, tokenAmount, coin.amount);
              
              // Check if the coin amount is less than the listing price
              if (!validCoinStatus) {
                INVALID_CONTRACTS.push(coin.coinid);
                MDS.log("Insufficient funds: Coin amount locked " + actualLocked + " is less than total required amount " + amountRequired + " for tokenId " + tokenId);
                continue; // Stop processing this coin
              }

            
              MDS.cmd("balance", function (balanceRes) {
                if (balanceRes.status && balanceRes.response.length > 0) {
                  for (var k = 0; k < balanceRes.response.length; k++) {
                    var t = balanceRes.response[k];
                    if (t.tokenid === tokenId) {

                      var ourMoney = coin.coinid;
                      var ownerAddress = getStateVariable(coin, 1);
                      var uid = getStateVariable(coin, 66);

                      // Send the token to buyer, send money to us...
    
                      //Random txn ID
                      var txnid = "nft_confirm_bid_" + randomInteger(1, 1000000000);

                      var coinNotifyAmount = 0.0001;
                      var spendableAmount = new Decimal(coin.amount).minus(coinNotifyAmount).toString();

                      var rawTransaction = 
                        "txncreate id:" + txnid + ";" +
                        "txninput id:" + txnid + " coinid:" + ourMoney + ";" +
                        "txnoutput id:" + txnid + " address:" + COIN_EVENT_NOTIFY + " tokenid:0x00 amount:" + coinNotifyAmount + " storestate:true;" +
                        "txnoutput id:" + txnid + " address:" + ACCOUNT.address + " tokenid:0x00 amount:" + spendableAmount + " storestate:false;" +
                        "txnaddamount id:" + txnid + " fromaddress:" + ACCOUNT.address + " address:" + ownerAddress + " tokenid:" + tokenId + " amount:" + tokenAmount + " storestate:false;" +
                        "txnstate id:" + txnid + " port:66 value:" + uid + ";" +
                        "txnstate id:" + txnid + " port:67 value:" + false + ";" + // is cancellation?
                        // "txnstate id:" + txnid + " port:5 value:" + buyer + ";" +
                        // "txnstate id:" + txnid + " port:2 value:" + tokenId + ";" +
                        // "txnstate id:" + txnid + " port:3 value:" + quantity + ";" +
                        // "txnstate id:" + txnid + " port:7 value:" + price + ";" +
                        "txnsign id:" + txnid + " publickey:auto;" +
                        "txnsign id:" + txnid + " publickey:" + ACCOUNT.publicKey + ";" +
                        "txnpost id:" + txnid + " auto:true mine:true";
                      

                      MDS.cmd(rawTransaction, function (resp) {
                        //Get the TxPowID
                        var status = false;
                        var txpowid = "0x00";
                        if (resp.length == 10) {
                          var postcmd = resp[9];
                          status = postcmd.status;
                          updatePurchaseRequestEvent(                            
                            uid,
                            1, function(){}
                          );
                          
                          if (status) {
                            txpowid = postcmd.response.txpowid;
                            COMPLETED_CONTRACTS.push(coin.coinid);
                            MDS.notify("NFT Sold, find the txpow on https://explorer.minima.global/transactions/" + txpowid);
                            MDS.log("NFT Sold, find it on https://explorer.minima.global/transactions/" + txpowid);
                          }
                        }
    
                        //always delete whatever happens
                        MDS.cmd("txndelete id:" + txnid, function () {
                          //If success - Log it..
                          if (status) {
                            MDS.log("SUCCESSFULLY POSTED TXN");
                          }
                        });
                      });
                      
                    }
                  }
                }
              });
            }
          }
        } else {
          MDS.log("Error fetching coins:" + res.error);
        }
      });
    }
  });
}

// Initialize MDS
MDS.init(function (msg) {
  if (msg.event === "inited") {
    MDS.log("MDS initialized");

    // check keypair for mode...
    MDS.cmd("checkmode", function (res) {
      if (res.status) {
        READ_MODE = res.response.mode === "READ";
      }
    });

    // create SQL tables
    initSql();
    
    // init the Marketplace
    initMarket(function() {
      // MDS.log("MarketPlace 60s MARKET UPDATE");
    });

    MDS.cmd(
      "coinnotify action:add address:" + DEX_ADDRESS,
      function () {
        // console.log(resp);
        // NOTIFYING OF ALL COIN EVENTS ON THIS ADDRESS...
      }
    );
    
    // MDS.cmd(
    //   "coinnotify action:add address:" + LISTING_ADDRESS,
    //   function () {
    //     // console.log(resp);
    //     // NOTIFYING OF ALL COIN EVENTS ON THIS ADDRESS...
    //   }
    // );

    // Create Marketplace Account
    getAccount(function (getAcc) {
      // Set Global
      ACCOUNT = {
        publicKey: getAcc.publicKey,
        address: getAcc.address,
        mxAddress: getAcc.mxaddress,
      };      
    });

    if (ACCOUNT) {

      if (!READ_MODE) {
        // Check for relevant coins, action them
        checkForRelevantPurchaseRequests();
        checkForExpiredDEXCoins(ACCOUNT);      
      }

    }
  }

  if (msg.event === "MDS_TIMER_60SECONDS") {
    initMarket(function() {
      // MDS.log("MarketPlace 60s MARKET UPDATE");
    });

    // check keypair for mode...
    MDS.cmd("checkmode", function (res) {
      if (res.status) {
        READ_MODE = res.response.mode === "READ";
      }
    });

    ORDERSEND_COUNTER += 1;
    LISTINGS_REBALANCE_COUNTER += 1;

    if (!READ_MODE) {
      
      if (ACCOUNT) {
        checkForExpiredDEXCoins(ACCOUNT);
      }

      if (LISTINGS_REBALANCE_COUNTER % 5 === 0) {
        // re-calculate balances
        checkLiquidityChange();
      }

      // re-publish every 60 mins...
      if (ORDERSEND_COUNTER % 60 === 0 || !PUBLISHED_ORDERBOOK) {
          // MDS.log("@60MIN - attempting to re-publish your order-book...");
          // MDS.notify("@60MIN - attempting to re-publish your order-book...");

        publishOrderbook(function({status, message}) {
          if (!status) {
            MDS.log("Failed to re-publish your order-book, " + message);
            MDS.notify("Failed to re-publish your order-book, " + message);
            PUBLISHED_ORDERBOOK = false;
            return;
          }
          // POSTED!
          PUBLISHED_ORDERBOOK = true;
          MDS.notify("Re-published your order-book successfully...");
          MDS.log("Re-published your order-book successfully...");
        });
      
      } else {
        // This will run every minute except every 30th minute
        checkIfMyOrderbookChangedAndPublish();
      }
    }
    
    
  }
  

  if (msg.event === "MDS_TIMER_10SECONDS") {
    if (ACCOUNT && !READ_MODE) {
      // Make sure to keep 10 coins at a time to manage all purchase requests
      coinManager(ACCOUNT.mxAddress, ACCOUNT.publicKey);
      // Run the check immediately
      checkForRelevantPurchaseRequests();
    }
  }

  if (msg.event === "NOTIFYCOIN") {
    var coin = msg.data.coin;
    var stateVars = coin.state;
    var uid = coin.state['66'];
    var isSpentCoinDex = coin.spent;

    // if this is a DEX Contract lock up coin
    if (coin.miniaddress === DEX_ADDRESS) {
      // add purchase event...
      if (!isSpentCoinDex) {

        var tokenid = stateVars[2];

        getTokenByTokenID(tokenid, function({error, tokenData}) {
          if (error) {
            MDS.log(error);
            return;
          } else {
            insertPurchaseRequestEvent(stateVars, uid, JSON.stringify(tokenData), coin.coinid);
          }
        })
      }
      
    }

    if (coin.address === COIN_EVENT_NOTIFY) {
      var isCancelled = coin.state['67'];

      
      updatePurchaseRequestEvent(uid, isCancelled === "FALSE" ? 1 : 2, function() {}); // set status to cancelled/spent
    }
  }
});



