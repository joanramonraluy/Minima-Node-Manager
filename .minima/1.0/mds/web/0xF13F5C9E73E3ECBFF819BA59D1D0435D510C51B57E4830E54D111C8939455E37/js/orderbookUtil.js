/**
 * Block an order book owner
 * @param username - The name of the order book owner when we blocked them
 * @param publicKey - The public key of the order book owner
 * @param profile - The users profile picture
 * @param note - (optional) A note attached to the blocking action
 * @param status - User blocked status
 * @param callback
 */
function manageUserBlock(username, publicKey, note, status, profile, callback) {
    var query = "MERGE INTO blocklist AS target" +
        " USING (VALUES ( ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP ) ) " +
        " AS source (uid, username, profile, note, status, creation_time, last_updated) " +
        " ON target.uid = source.uid " +
        " WHEN MATCHED THEN UPDATE SET " +
        " target.status = CASE WHEN target.status <> source.status THEN source.status ELSE target.status END, " +
        " target.note = CASE WHEN target.note <> source.note THEN source.note ELSE target.note END, " +
        " target.profile = CASE WHEN target.profile <> source.profile THEN source.profile ELSE target.profile END, " +
        " target.last_updated = CURRENT_TIMESTAMP " +
        " WHEN NOT MATCHED THEN INSERT (uid, username, profile, note, status, creation_time, last_updated) " +
        " VALUES (source.uid, source.username, source.profile, source.note, source.status, source.creation_time, source.last_updated)"

    var cleanQuery = cleanseForSQL(query, [publicKey, username, profile, note, status]);
    MDS.sql(cleanQuery, function (res) {
        callback(res.status);
    });
}

/**
 * hide listings
 * @param tokenid - The listing tokenid
 * @param extradata - A listings properties
 * @param status - Listing status
 * @param callback
 */
function manageListing(tokenid, extradata, status, callback) {
    var query = "MERGE INTO hidden AS target" +
        " USING (VALUES ( ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP ) ) " +
        " AS source (uid, extradata, status, creation_time, last_updated) " +
        " ON target.uid = source.uid " +
        " WHEN MATCHED THEN UPDATE SET " +
        " target.status = CASE WHEN target.status <> source.status THEN source.status ELSE target.status END, " +
        " target.extradata = CASE WHEN target.extradata <> source.extradata THEN source.extradata ELSE target.extradata END, " +
        " target.last_updated = CURRENT_TIMESTAMP " +
        " WHEN NOT MATCHED THEN INSERT (uid, extradata, status, creation_time, last_updated) " +
        " VALUES (source.uid, source.extradata, source.status, source.creation_time, source.last_updated)"

    var cleanQuery = cleanseForSQL(query, [tokenid, extradata, status]);
    MDS.sql(cleanQuery, function (res) {
        callback(res.status);
    });
}

/**
 * Get the list of blocked users
 * @param callback
 */
function getHiddenList(callback) {
    var query = "SELECT * FROM hidden";
    var cleanQuery = cleanseForSQL(query, [ 0 ]);


    MDS.sql(cleanQuery, function (res) {
        callback(res.rows);
    });
}
/**
 * Get the list of blocked users
 * @param callback
 */
function getBlockList(callback) {
    var query = "SELECT * FROM blocklist";
    var cleanQuery = cleanseForSQL(query, [ 0 ]);


    MDS.sql(cleanQuery, function (res) {
        callback(res.rows);
    });
}

