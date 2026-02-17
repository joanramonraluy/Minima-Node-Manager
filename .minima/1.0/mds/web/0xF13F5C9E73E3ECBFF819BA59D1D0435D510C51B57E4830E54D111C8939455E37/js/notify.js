// Notify users on important app life-cycle events

function notifyPurchaseRequest(coin, spent) {
    
    var buyer = getStateVariable(coin, 5);
    var uid = getStateVariable(coin, 66);
    var tokenid = getStateVariable(coin, 2);

    try {
        if (!buyer || !tokenid) {
            throw new Error("Invalid purchase request on parsing buyer or tokenid");
        }
        
        buyer = JSON.parse(buyer)[0];        
        if (!spent) {
            MDS.notify(buyer.name + " wants to buy a token with id ending"+ tokenid.substring(tokenid.length-8, tokenid.length) + " and has receipt id of " + uid);
        } else {
            MDS.notify("You have sent a token with id ending with "+ tokenid.substring(tokenid.length-8, tokenid.length) + " to buyer "+ buyer.name);
        }

    } catch (error) {
        MDS.log("Could not notify purchase request: "+ JSON.parse(coin));
    }

    
    MDS.notify("There is a new purchase request");
}

function notifyPurchaseCancellation(coin) {
    
    var buyer = getStateVariable(coin, 5);
    var tokenid = getStateVariable(coin, 2);

    try {
        if (!buyer || !tokenid) {
            throw new Error("Invalid purchase request on parsing buyer or tokenid");
        }
        
        buyer = JSON.parse(buyer)[0];        
        MDS.notify(buyer.name + " has cancelled his purchase for your token with id ending with " + tokenid.substring(tokenid.length-8, tokenid.length));        

    } catch (error) {
        MDS.log("Could not notify purchase request: "+ JSON.parse(coin));
    }

    
    MDS.notify("There is a new purchase request");
}
