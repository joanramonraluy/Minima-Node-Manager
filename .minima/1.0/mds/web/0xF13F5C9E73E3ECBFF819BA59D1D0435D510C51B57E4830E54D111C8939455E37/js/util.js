function getTokenHexData(tokenId, callback) {
    MDS.cmd("tokens action:export tokenid:" + tokenId, function(resp) {
        if (!resp.status) {
            callback(new Error("Error exporting token data: " + resp.error), null);
        } else {
            callback(null, resp.response.data);
        }
    });
}

function getTokenByTokenID(tokenid, callback) {
    MDS.cmd(`tokens tokenid:${tokenid}`, (res) => {
        if (!res.status)
            callback({error: "Token could not be found" + res.error ? res.error : ""});
        // return token data
        callback({tokenData: res.response});
    });
}



function importTokenByHexData(hexData, callback) {
    MDS.cmd("tokens action:import data:" + hexData, function(res) {
        if (!res.status) {
            var errorMessage = "Token could not be imported";
            if (res.error) {
                errorMessage += ": " + res.error;
            }
            callback(new Error(errorMessage), null);
        } else {
            callback(null, res.response.token);
        }
    });
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

