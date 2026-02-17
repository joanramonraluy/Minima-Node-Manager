var MY_ORDERBOOK_CACHE = '_myOrderbook';
var PREVIOUS_MARKET = '_prevMarket';


function createOrderbook(listings, account) {
  var oB = {
    age: Number.MAX_VALUE,
    listings: listings,
    owner: [account],
    publicKey: account.publicKey
  }
  return oB;
}

function addToOrderBook(newEntry, orderbook) {
  var updatedListings = [];
  var seenTokenIds = {}; // Track the latest listing by tokenid

  for (var j = 0; j < orderbook.listings.length; j++) {
    var listing = orderbook.listings[j];

    // If we haven't seen this tokenid before, or this listing is newer (smaller age), add it
    if (
      !seenTokenIds[listing.tokenid] ||
      listing.age < seenTokenIds[listing.tokenid].age
    ) {
      seenTokenIds[listing.tokenid] = listing; // Update with the latest (newer) listing
    }
  }

  // Add or replace the new entry
  seenTokenIds[newEntry.tokenid] = newEntry;

  // Convert the seenTokenIds object to an array of the latest listings
  updatedListings = Object.values(seenTokenIds);

  // Set the `enable` property for the new entry
  updatedListings.forEach(function (listing) {
    if (listing.tokenid === newEntry.tokenid) {
      listing.enable = true; // Ensure the new entry is enabled
    }
  });


  orderbook.listings = updatedListings;

  // return new orderbook
  return orderbook;
}

function removeFromOrderBook(tokenId, orderbook) {
  var myListings = [];
  var cancelledListing = null;
  var seenTokenIds = {}; // Track the latest listing by tokenid

  for (var j = 0; j < orderbook.listings.length; j++) {
    var listing = orderbook.listings[j];

    // Check if this is the listing we want to cancel
    if (listing.tokenid === tokenId) {
      cancelledListing = Object.assign({}, listing); // Keep track of the canceled listing
      cancelledListing.enable = false; // Disable the listing (cancel)

      // Update the seenTokenIds to ensure we are tracking the cancelled listing
      seenTokenIds[listing.tokenid] = cancelledListing; // Always track the cancelled listing
    } else {
      // For other listings, ensure we only keep the latest version (smaller age)
      if (
        !seenTokenIds[listing.tokenid] ||
        listing.age < seenTokenIds[listing.tokenid].age
      ) {
        seenTokenIds[listing.tokenid] = listing;
      }
    }
  }
  

  // Convert the seenTokenIds object to an array of the latest listings
  myListings = Object.values(seenTokenIds);

  orderbook.listings = myListings;

  // Return only the user's updated listings and the cancelled listing
  return { orderbook, cancelledListing };
}

// create new listing on our orderbook
function createNewListing(
  account,
  token,
  price,
  confirmed,
  category,
  callback
) {
  getTokenHexData(token.tokenid, function (error, tokenData) {
    if (error) {
      return callback({
        status: false,
        message: "Failed to fetch token data: " + error,
      });
    }

    getMyOrderbook(function ({orderbook}) {
      // Create the new listing item
      var newEntry = {
        enable: true,
        tokenid: token.tokenid,
        data: tokenData,
        price: price,
        available: confirmed,
        category: category,
      };

      // Update my order book and return the new market
      var updatedOrderbook = addToOrderBook(newEntry, orderbook);


      // Create the state variable to broadcast
      var stateVariable = {
        0: "[" + account.publicKey + "]", // no longer tracks
        1: "[" + JSON.stringify(account) + "]",
        101: JSON.stringify(updatedOrderbook.listings),
      };

      // Broadcast to network
      broadcastToNetwork(account, stateVariable, function (res) {
        if (!res.status) {
          return callback({
            status: false,
            message: res.error ? res.error : "Broadcasting to network failed",
            response: res,
          });
        }

        // todo: cache latest orderbook
        setMyOrderbook(updatedOrderbook, function () {MDS.log("Your orderbook has been updated")})

        callback({status: true, message: "New orders sent successfully, will take some time to reflect to the rest of the network"});
      });
    });
  });
}

function cancelListing(account, token, callback) {
  getMyOrderbook(function ({orderbook}) {

    // Use the separate method to cancel the listing
    var { orderbook: updatedOrderbook, cancelledListing} = removeFromOrderBook(
      token.tokenid,
      orderbook
    );
    // console.log("updatedListings", updatedListings);
    // If no listing was found to cancel, return an error
    if (!cancelledListing) {
      return callback({
        status: false,
        message: "Listing with tokenid not found: " + token.tokenid,
      });
    }

    // Prepare the state variable to broadcast
    var stateVariable = {
      0: account.publicKey,
      1: "[" + JSON.stringify(account) + "]",
      101: JSON.stringify(updatedOrderbook.listings), // Updated listings
    };

    // Broadcast the updated listings to the network
    broadcastToNetwork(account, stateVariable, function (res) {
      if (!res.status) {
        return callback({
          status: false,
          message: "Broadcasting to network failed",
          response: res,
        });
      }
    });

    setMyOrderbook(updatedOrderbook, function () {MDS.log("Your orderbook has been updated")})

    return callback({
      status: true,
      message:
        "Listing with tokenid : " +
        token.tokenid +
        " was cancelled, take some time to reflect",
    });
  });
}

function broadcastToNetwork(account, stateVars, callback) {
  MDS.cmd(
    `send fromaddress:${account.mxAddress} signkey:${
      account.publicKey
    } amount:${SHOUTOUT_FEE} tokenid:0x00 address:${LISTING_ADDRESS} state:${JSON.stringify(
      stateVars
    )}`,
    (resp) => {
      // MDS.log(JSON.stringify(resp, null, 2));
      callback(resp);
    }
  );
}

// get on-chain market data, get an hour and a couple of mins backward only..
function getAllListingCoins(callback) {
  MDS.cmd("coins depth:80 address:" + LISTING_ADDRESS, function (res) {
    callback(res.response);
  });
}

// parse the coin's metadata and return a Seller object
function processListingCoin(coin) {
  if (!coin || typeof coin !== "object") {
    MDS.log("Invalid coin object provided to processListingCoin");
    return null;
  }

  try {
    var pubKey = getStateVariable(coin, 0);
    var owner = getStateVariable(coin, 1);
    var listings = getStateVariable(coin, 101);

    var missingFields = [];
    if (!pubKey) missingFields.push("state[0]");
    if (!owner) missingFields.push("state[1]");
    if (!listings) missingFields.push("state[101]");

    if (missingFields.length > 0) {
      MDS.log(
        "Missing " +
          missingFields.join(", ") +
          " for coin: " +
          JSON.stringify(coin)
      );
      return null;
    }

    var currKey = pubKey.slice(1, -1);
    var isBlocked = false;
    getBlockList(function (blockList) {
      for (var b = 0; b < blockList.length; b++) {
        var blockedUser = blockList[b];

        if (blockedUser.UID === currKey && blockedUser.STATUS === "1") {
          isBlocked = true;
        }
      }
    });

    if (isBlocked) {
      return null;
    }

    var parsedOwner, parsedListings;
    try {
      parsedOwner = JSON.parse(owner);
      parsedListings = JSON.parse(listings);
    } catch (parseError) {
      MDS.log(
        "Error parsing owner or listings JSON for coin: " +
          JSON.stringify(coin) +
          " - Error: " +
          parseError.message
      );
      return null;
    }



    return {
      publicKey: pubKey.slice(1, -1), // remove brackets
      owner: parsedOwner,
      listings: parsedListings,
      age: coin.age,
    };
  } catch (e) {
    MDS.log(
      "Error processing listing coin: " +
        JSON.stringify(coin) +
        " - Error: " +
        e.message
    );
    return null;
  }
}

function processListings(books, callback) {
  if (!Array.isArray(books) || typeof callback !== "function") {
    MDS.log("Invalid arguments provided to processListings");
    return callback([]);
  }

  var userBooks = {};
  var totalListings = 0;

  // First pass: group books by user and count total listings
  for (var i = 0; i < books.length; i++) {
    var book = books[i];
    // MDS.log("Orderbooks - " + JSON.stringify(book));
    if (book && typeof book === "object" && book.publicKey) {
      if (!Object.prototype.hasOwnProperty.call(userBooks, book.publicKey)) {
        userBooks[book.publicKey] = [];
      }
      userBooks[book.publicKey].push(book);
      totalListings += Array.isArray(book.listings) ? book.listings.length : 0;
    }
  }

  if (totalListings === 0) {
    return callback([]);
  }

  var updatedBooks = [];
  var processedCount = 0;

  // Process books for each user
  var publicKeys = Object.keys(userBooks);
  for (var j = 0; j < publicKeys.length; j++) {
    var publicKey = publicKeys[j];
    var userBookList = userBooks[publicKey];
    var latestListings = {};

    // Process all books for this user
    for (var k = 0; k < userBookList.length; k++) {
      var currentBook = userBookList[k];
      if (Array.isArray(currentBook.listings)) {
        for (var l = 0; l < currentBook.listings.length; l++) {
          var listing = currentBook.listings[l];
          if (listing && listing.tokenid) {
            if (
              !Object.prototype.hasOwnProperty.call(
                latestListings,
                listing.tokenid
              ) ||
              currentBook.age < latestListings[listing.tokenid].bookAge
            ) {
              latestListings[listing.tokenid] = {
                listing: listing,
                bookAge: currentBook.age,
              };
            }
          }
          processedCount++;
        }
      }
    }
  

    // Interface ListingCoinData
    // Create an updated book with the latest listings for this user
    var updatedBook = {
      publicKey: publicKey,
      owner: userBookList[0].owner, // Assuming owner is the same for all books of a user
      listings: [],
      age: Number.MAX_VALUE,
    };


    // Populate listings and find the smallest age
    var listingKeys = Object.keys(latestListings);
    for (var m = 0; m < listingKeys.length; m++) {
      updatedBook.listings.push(latestListings[listingKeys[m]].listing);
    }
    for (var n = 0; n < userBookList.length; n++) {
      if (userBookList[n].age < updatedBook.age) {
        updatedBook.age = userBookList[n].age;
      }
    }
    updatedBooks.push(updatedBook);
  }

  // Check if all listings have been processed
  if (processedCount === totalListings) {
    finalizeListings(updatedBooks, callback);
  } else {
    MDS.log(
      "Warning: Processed count doesn't match total listings. Processed: " +
        processedCount +
        ", Total: " +
        totalListings
    );
    finalizeListings(updatedBooks, callback);
  }
}

function finalizeListings(updatedBooks, callback) {
  var tokenIdsToProcess = [];
  var seenTokenIds = {};

  for (var i = 0; i < updatedBooks.length; i++) {
    var book = updatedBooks[i];
    for (var j = 0; j < book.listings.length; j++) {
      var listing = book.listings[j];
      if (
        !Object.prototype.hasOwnProperty.call(seenTokenIds, listing.tokenid)
      ) {
        seenTokenIds[listing.tokenid] = true;
        tokenIdsToProcess.push(listing.tokenid);
      }
    }
  }

  if (tokenIdsToProcess.length === 0) {
    return callback(updatedBooks);
  }

  callback(updatedBooks);
}

function areCoinsEqual(coin1, coin2) {
  // List of fields to compare
  var fieldsToCompare = ['coinid', 'amount', 'address', 'miniaddress', 'tokenid', 'storestate'];
  
  // Compare basic fields
  for (var i = 0; i < fieldsToCompare.length; i++) {
    var field = fieldsToCompare[i];
    if (coin1[field] !== coin2[field]) {
      return false;
    }
  }
  
  // Compare state array
  if (coin1.state.length !== coin2.state.length) {
    return false;
  }
  
  for (var j = 0; j < coin1.state.length; j++) {
    if (coin1.state[j].port !== coin2.state[j].port ||
        coin1.state[j].type !== coin2.state[j].type ||
        coin1.state[j].data !== coin2.state[j].data) {
      return false;
    }
  }
  
  return true;
}

// Function to compare two arrays of coins
function areMarketsEqual(market1, market2) {
  if (market1.length !== market2.length) {
    return false;
  }
  
  for (var i = 0; i < market1.length; i++) {
    if (!areCoinsEqual(market1[i], market2[i])) {
      return false;
    }
  }
  
  return true;
}

function cache (key, value) {
  MDS.keypair.set(key, JSON.stringify(value), function (resp) {
    MDS.log("@Caching : " + key + " @status:" + resp.status);
  });
}

function getCache (key, callback) {
  MDS.keypair.get(key, function (resp) {
    const isCached = resp.status;

    if (isCached) {
      return callback(resp.value);
    }

    callback(null);
  });
}

function initializeMyOrderbook () {
  getAccount(function (account) {
    const initBook = createOrderbook([], account);
    setMyOrderbook(initBook, function () {
      // MDS.log("Your orderbook has been inited");
    });
  });
}

function initMarket(callback) {
  getAllListingCoins(function (listingCoins) {
    // I reduce computational costs by checking if market has changed before processing...
    // getCache(PREVIOUS_MARKET, function (oldListingCoins) {
    //   if (oldListingCoins && areMarketsEqual(JSON.parse(oldListingCoins), listingCoins)) {
    //     return callback("Market already in synchronized state, no need for re-computation.");
    //   }
    //   // synchronize
    //   cache('_prevMarket', listingCoins, function () {})
    // })

    // market unavailable or empty
    const isMarketEmpty = !Array.isArray(listingCoins) || listingCoins.length === 0;

    if (isMarketEmpty) {

      // have you been offline and haven't re-broadcast your cached order book since?
      getCache(MY_ORDERBOOK_CACHE, function (myCachedOrderbook) {
        // I have something cached...
        if (myCachedOrderbook) {
          const myOrderbook = JSON.parse(myCachedOrderbook);
          var hasEnabledListing = false;
          if (myOrderbook.listings.length > 0) {
            for (var i = 0; i < myOrderbook.listings.length; i++) {
              const listing = myOrderbook.listings[i];
              if (listing.enable) {
                hasEnabledListing = true;
              }
            }
          }

          if (hasEnabledListing) {
            publishOrderbook(function () {
              MDS.log("@SyncOrderbook : Re-broadcasted your order book to the network");
            })
          } else {
            // re-init orderbook since anyway all my listings are disabled...
            initializeMyOrderbook();
          }
        } else {
          // This is a fresh install and I require an initialisation
          initializeMyOrderbook();
        }
      });

      return setMarket([], function () {
        callback({
          status: false,
          message: "Market is still empty",
        });
      });
    }

    // Market is live and has order books
    var bundle = [];
    for (var i = 0; i < listingCoins.length; i++) {
      // We process each coin & check if valid then return it parsed correctly - (removing brackets from pub keys)
      var processedCoin = processListingCoin(listingCoins[i]);
      if (processedCoin !== null) {
        bundle.push(processedCoin);
      }
    }

    if (bundle.length === 0) {
      return setMarket([], function () {
        callback({
          status: false,
          message: "No valid listings found",
        });
      });
    }

    processListings(bundle, function (updatedBundle) {

      // Check if we have a cached order book
      getMyOrderbook(function({status}) {
        // Yes already cached no need to re-init
        if (status) {
          return;
        } 
        // This is a re-install and we already have an orderbook on-chain, cache it...
        for (var i = 0; i < updatedBundle.length; i++) {
          const bundle = updatedBundle[i];
          var saved = false;
          getAccount(function(account) {
            if (bundle.publicKey === account.publicKey) {
              var enabledListings = [];
              
              for (var j = 0; j < bundle.listings.length; j++) {
                var listing = bundle.listings[j];
                if (listing.enable) {
                  enabledListings.push(listing);
                }
              }
              
              if (enabledListings.length > 0) {
                var updatedBundle = {
                  age: Number.MAX_VALUE,
                  owner: "[" + bundle.owner + "]",
                  publicKey: bundle.publicKey,
                  listings: enabledListings
                };
                
                setMyOrderbook(updatedBundle, function () {
                  saved = true;
                  MDS.log("Your orderbook has been saved with " + enabledListings.length + " enabled listing(s)");
                });
              }
            }
            
            // No orderbook found or no enabled listings, initialize it...
            if (!saved) {
              MDS.log("No valid orderbook found, initializing...");
              
              var initBook = createOrderbook([], account);
              setMyOrderbook(initBook, function () {
                // MDS.log("Your orderbook has been initialized");
              });
            }
          });
        }
      });

      setMarket(updatedBundle, function () {
        callback({
          status: true,
          message: "Market initialized",
          market: updatedBundle,
        });
      });
    });
  });
}

function publishOrderbook(callback) {
  MDS.cmd("maxima", function (resp) {
    getAccount(function (getAcc) {
      getMyOrderbook(function ({status, orderbook, message}) {
        if (!status || (orderbook && orderbook.listings.length === 0)) {
          // nothing to publish since our order book is empty
          MDS.log("60MIN: Re-publish order-book paused: " + message);
          return;
        }

        var hasEnabledListing = false;
        // check if they have at least 1 enabled listing that should be re-broadcasted
        for (var e = 0; e < orderbook.listings.length; e++) {
          var listing = orderbook.listings[e];
          // they have one
          if (listing.enable) {
            hasEnabledListing = true;
          }
        }
        // if no enabled listing then no need to re-publish book
        if (!hasEnabledListing) {
          return;
        }

        // Create the state variable to broadcast
        var stateVariable = {
          0: "[" + getAcc.publicKey + "]",
          1: "["+ JSON.stringify(
            {
              publicKey: getAcc.publicKey,
              name: resp.response.name,
              profile: resp.response.icon,
              address: getAcc.address,
              mxAddress: getAcc.mxaddress,
            },
          ) + "]",
          101: JSON.stringify(orderbook.listings),
        };
        // re-create to work for the broadcast
        const acc = {
          publicKey: getAcc.publicKey,
          name: resp.response.name,
          profile: resp.response.icon,
          address: getAcc.address,
          mxAddress: getAcc.mxaddress,
        }

        // Broadcast to network
        broadcastToNetwork(acc, stateVariable, function (res) {

          if (!res.status) {
            MDS.log(res.error ? res.error : res.message ? res.message : "Failed to broadcast");
            return callback({
              status: false,
              message: "Broadcasting to network failed",
              response: res,
            });
          }

          callback({status: true, message: "60MIN: Orders re-published to the network!"});
        });
      });
    });
  });
}

function checkIfMyOrderbookChangedAndPublish() {
  getMyOrderbook(function ({status, orderbook}) {
    if (!status) {
      // Nothing to process since orderbook not cached yet...
      return;
    }

    getPreviousOlderbook(function (prevOrderbook) {
      if (!prevOrderbook) {
        // Cache the book...
        setPreviousOrderbook(orderbook, function() {
          MDS.log("Previous orderbook has been cached.");
        });

        return;
      }

      // Now let's check ... 
      if (prevOrderbook !== JSON.stringify(orderbook)) {
        // Orderbook has changed...
        MDS.log("Orderbook changed, re-publishing...");
        setPreviousOrderbook(orderbook, function() {});
        
        publishOrderbook(function () {
          // MDS.log(JSON.stringify(res));
        });
      } else {
        // Nothing to publish...
        // MDS.log("Orderbook change: No changes detected, no need to re-publish.");
        return;
      }

      // Cache the book...
      setPreviousOrderbook(orderbook, function() {});
    });
  });
}

// This is to be called every 5 mins as to not spam Balance as it's a heavy call...
// Then update cached orderbook
function checkLiquidityChange() {
  getMyOrderbook(function ({status}) {
    if (status) {
      // MDS.log("Order-book re-calculated... update balance for listings");
    }
  })
}

function setMarket(orderbook, callback) {
  MDS.keypair.set("_market", JSON.stringify(orderbook), function () {
    // MDS.log(JSON.stringify(res, 0 , 2));
    return callback("Market has been cached.");
  });
}

// Market order book listings cached
function getMarket(callback) {
  MDS.keypair.get("_market", function (res) {
    var cached = res.status;

    if (cached) {
      const book = JSON.parse(res.value);
      callback(book);
    } else {
      callback([]);
    }
  });
}
// Just our orderbook
function setMyOrderbook(orderbook, callback) {
  MDS.keypair.set(MY_ORDERBOOK_CACHE, JSON.stringify(orderbook), function () {
    // MDS.log(JSON.stringify(res, 0 , 2));
    return callback("Your listings have been cached.");
  });
}

function setPreviousOrderbook(orderbook, callback) {
  MDS.keypair.set("_olderOrderbook", JSON.stringify(orderbook), function () {
    // MDS.log(JSON.stringify(res, 0 , 2));
    return callback("Your listings have been cached.");
  });
}

function getPreviousOlderbook(callback) {
  MDS.keypair.get("_olderOrderbook", function (res) {    
    if (res.status) {        
      return callback(res.value);
    }

    return callback(null);
  });
}

function checkForExpiredDEXCoins(account) {
  // TODO simplestate true
  MDS.cmd("coins coinage:35 address:"+DEX_ADDRESS, function (res) {

    if (res.status) {
      var allCoins = res.response;
      var relevantCoins = [];

      for (var i = 0; i < allCoins.length; i++) {
        var coin = allCoins[i];

        if (getStateVariable(coin, 0) === account.publicKey) {
          relevantCoins.push(coin);
        }
      }

      if (relevantCoins.length > 0) {
        // collect all expired coins...
        for (var j = 0; j < relevantCoins.length; j++) {
          const expiredCoin = relevantCoins[j];
          MDS.log("Auto collect expired coin(s): Collecting: "+JSON.stringify(expiredCoin));
          collectExpiredCoin(expiredCoin, account);

        }
      }
    }
  })
}

function collectExpiredCoin(expiredCoin, account) {
  const txnid = "cancel_listing_txn_" + randomInteger(1, 1000000000);

 
    const coinNotifyAmount = 0.0001;
    const spendableAmount = new Decimal(expiredCoin.amount).minus(coinNotifyAmount).toString();

    const uid = getStateVariable(expiredCoin, 66);

    const cmd =
      "txncreate id:" +
      txnid +
      ";" +
      "txninput id:" +
      txnid +
      " coinid:" +
      expiredCoin.coinid +
      ";" +
      "txnoutput id:" +
      txnid +
      " storestate:true amount:" +
      coinNotifyAmount +
      " address:" +
      COIN_EVENT_NOTIFY +
      ";" +
      "txnoutput id:" +
      txnid +
      " storestate:false amount:" +
      spendableAmount +
      " address:" +
      account.mxAddress +
      ";" +
      "txnstate id:" 
      + txnid +
      " port:66 value:"+uid+
      ";" +
      "txnstate id:" 
      + txnid +
      " port:67 value:true"+
      ";" +
      "txnsign id:" +
      txnid +
      " publickey:" +
      account.publicKey +
      ";" +
      "txnpost id:" +
      txnid +
      " auto:true txndelete:true;";

    MDS.cmd(cmd, function (res) {
      // Check each response in the array
      for (var i = 0; i < res.length; i++) {

        var cmdResp = res[i]
        if (!cmdResp.status) {
          MDS.log("ERROR collecting expired coin: " + JSON.stringify(cmdResp));
          
          return;
        }
      }

      MDS.cmd("txndelete id:" + txnid, function () {
        MDS.log("Collected expired coin: " + expiredCoin.coinid);
        // Handle successful cancellation
        updatePurchaseRequestEvent(getStateVariable(expiredCoin, 66), 2, function () {});
      });
    });
}

// all our listings
/**
 * 
 * interface Listing {
  data: NFTProps;
  enable: boolean;
  price: number;
  tokenid: string;
  available: string;
  category: string;
}

 *  interface OrderBook {
  publicKey: string;
  owner: Accounts;
  listings: Listing[]; // a string representation of Listing[]...
  age: number;
  }
 */
function getMyOrderbook(callback) {
  MDS.keypair.get(MY_ORDERBOOK_CACHE, function (res) {
    var cached = res.status;
    // First time
    if (!cached) {      
      return callback({status: false, message: "Orderbook not cached yet!"});
    }

    if (cached) {
      const orderbook = JSON.parse(res.value);

      if (orderbook.listings.length === 0) {
        return callback({status: true, message: "Empty orderbook", orderbook: orderbook});
      }
    
      // Loop through my listings, update the available balance
      for (var i = 0; i < orderbook.listings.length; i++) {
        var listing = orderbook.listings[i];

        if (listing.enable) {
          getAccount(function (account) {
            getTotalBalanceForToken(account, listing.tokenid, function(balance) {
              if (!balance.exists) {
                // MDS.log("User does not have this token with id "+ listing.tokenid + " disabling the listing...");
                listing.enable = false;
              } else {
                listing.available = balance.available;            
              }
            });
          })
        }
    
      }
         
    
      // Return only the user's updated listings
      return callback({status: true, message: "Your latest orderbook", orderbook: orderbook});
    }
  });
}

// helper
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

function getTotalBalanceForToken(account, tokenid, callback) {
  MDS.cmd("balance address:" + account.mxaddress, function (resp) {
    if (!resp.status) return callback(0);

    for (var i = 0; i < resp.response.length; i++) {
      var token = resp.response[i];

      if (token.tokenid == tokenid) {
        var availableBalance = new Decimal(token.confirmed).plus(
          token.unconfirmed
        );

        return callback({
          exists: true,
          available: availableBalance.toString(),
        });
      }
    }

    return callback({ exists: false });
  });
}

