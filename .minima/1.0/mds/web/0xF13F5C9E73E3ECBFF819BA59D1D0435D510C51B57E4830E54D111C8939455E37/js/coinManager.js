/**
 * Manage the total UTXOs of the Marketplace NFTs/Tokens
 * @param address - The Marketplace wallet address.
 * @param publicKey - The publicKey of the Marketplace wallet address.
 */
function coinManager(address, publicKey) {
    MDS.cmd("balance tokendetails:true address:"+address, function (resp) {
        if (!resp.status) {
            MDS.log(resp.error ? resp.error : "Invalid balance call");

            return;
        }

        
        var nftTokens = [];
        for (var i = 0; i < resp.response.length; i++) {
            var t = resp.response[i];
            if (t.details && t.details.decimals === 0) {
                nftTokens.push(t);
            }
        }

        
        // Step 3: Iterate over the NFT tokens and verify if they require splitting management
        for (var j = 0; j < nftTokens.length; j++) {
            var token = nftTokens[j];
            var tokenCoins = parseInt(token.coins, 10); // total coin count
            var confirmedCoins = parseInt(token.confirmed, 10); // confirmed coin balance
            var unconfirmedCoins = parseInt(token.unconfirmed, 10);

            if (unconfirmedCoins > 0) {
                continue; // Move to the next token for now...
            }
            
            if (confirmedCoins === 1 || tokenCoins >= 10) {
                continue; // Move to the next token without splitting
            }

            var amountToSplit = 0;

            if (confirmedCoins <= 10) {
                if (tokenCoins < confirmedCoins) {
                    // MDS.notify(token.tokenid + " splitting confirmed of "+confirmedCoins + " , to " + tokenCoins);

                    amountToSplit = confirmedCoins;
                }
            } else {
                if (tokenCoins < 5) {
                    // MDS.notify(token.tokenid + " splitting confirmed of "+confirmedCoins + " , to " + tokenCoins);
                    amountToSplit = 10;
                }
            }

            if (amountToSplit > 0) {
                executeSplit(address, publicKey, token, amountToSplit, confirmedCoins);
            }
        }

    });
}


/**
 * Split the coins fed to this method
 * @param address - The address of the Marketplace wallet
 * @param publicKey - The publicKey that belongs to the wallet
 * @param token - The token to split
 * @param amountToSplit - The amount to split
 * @param confirmedCoins - Confirmed balance for the token
 */
function executeSplit(address, publicKey, token, amountToSplit, confirmedCoins) {
    var rawTxn = "send fromaddress:" + address + 
                 " signkey:" + publicKey + 
                 " amount:" + confirmedCoins + 
                 " split:" + amountToSplit + 
                 " tokenid:" + token.tokenid + 
                 " address:" + address;

    MDS.cmd(rawTxn, function (splitResp) {
        // MDS.log(JSON.stringify(splitResp));
        if (splitResp && splitResp.status) {
            MDS.notify("Successfully split coin with id, " + token.tokenid);
            // MDS.log("Successfully split " + token.tokenid + " to ensure " + (confirmedCoins >= 10 ? "10" : confirmedCoins) + " coins");
        }
    });
}


