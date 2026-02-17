var addressScript = "LET type=[dex address]  RETURN SIGNEDBY(*)";


function getAccount(callback) {
    MDS.cmd("keys modifier:0x02", function (resp) {

        MDS.cmd(`runscript script:"${addressScript.replace("*", resp.response.keys[0].publickey)}"`, function(scriptResp) {
            
            var account = {
                publicKey: resp.response.keys[0].publickey,
                address: scriptResp.response.script.address,
                mxaddress: scriptResp.response.script.mxaddress,
            };

            // track and remember script
            MDS.cmd(`newscript trackall:true script:"${addressScript.replace("*", resp.response.keys[0].publickey)}"`, function() {
                callback(account);
            });
        });
    });
}


