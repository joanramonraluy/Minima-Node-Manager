function initSql() {
  const createEventTableQuery = `
        CREATE TABLE IF NOT EXISTS event (
            id INT AUTO_INCREMENT PRIMARY KEY,
            type ENUM('listing', 'purchaseRequest', 'cancelListing') NOT NULL,
            data TEXT NOT NULL,
            transactionUID VARCHAR(255),
            txpowid VARCHAR(255),
            tokendata TEXT NOT NULL,
            coinid VARCHAR(255),
            status TINYINT NOT NULL DEFAULT 0,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_type_uid (type, transactionUID),
            INDEX idx_status (status)
        )    
    `;

  const createPurchasesTableQuery = `
    CREATE TABLE IF NOT EXISTS purchases (
      id INT AUTO_INCREMENT PRIMARY KEY,
      uid VARCHAR(255) NOT NULL,
      data TEXT NOT NULL,
      txpowid VARCHAR(255) NOT NULL,
      creation_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_uid (uid)
    )
  `;

  const blockListQuery = `
    CREATE TABLE IF NOT EXISTS blocklist (
      id INT AUTO_INCREMENT PRIMARY KEY,
      uid VARCHAR(255) NOT NULL,
      username VARCHAR(255) NOT NULL,
      profile TEXT NOT NULL,
      note TEXT NOT NULL,
      status TINYINT NOT NULL DEFAULT 0,
      creation_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_blocked_uid (uid)
    )
  `;

  const hiddenQuery = `
    CREATE TABLE IF NOT EXISTS hidden (
      id INT AUTO_INCREMENT PRIMARY KEY,
      uid VARCHAR(255) NOT NULL,      
      extradata TEXT NOT NULL,
      status TINYINT NOT NULL DEFAULT 0,
      creation_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_hidden_uid (uid)
    )
  `;

  MDS.sql(createEventTableQuery, function () {
    // MDS.log("Event table created: " + JSON.stringify(res));
  });

  MDS.sql(createPurchasesTableQuery, function () {
    // MDS.log("Purchases table created: " + JSON.stringify(res));
  });

  MDS.sql(blockListQuery, function () {
    // MDS.log("Block list table created: " + JSON.stringify(res));
  });

  MDS.sql(hiddenQuery, function () {
    // MDS.log("Block list table created: " + JSON.stringify(res));
  });
}

function insertPurchaseRequestEvent(stateVars, transactionUID, tokendata, coinid) {
  var mergeQuery = `
    MERGE INTO event AS target
    USING (VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)) 
    AS source (type, data, transactionUID, tokendata, coinid, status, timestamp, last_updated)
    ON target.transactionUID = source.transactionUID
    WHEN NOT MATCHED THEN
      INSERT (type, data, transactionUID, tokendata, coinid, status, timestamp, last_updated)
      VALUES (source.type, source.data, source.transactionUID, source.tokendata, source.coinid, source.status, source.timestamp, source.last_updated)`;

  // Prepare the parameters to be inserted
  var params = ["purchaseRequest", stateVars, transactionUID, tokendata, coinid, 0];

  // Use the parameterize function to safely create the final SQL query
  var finalQuery = cleanseForSQL(mergeQuery, params);

  // Log the final query
  // MDS.log('final query: ' + finalQuery);

  // Execute the final query
  MDS.sql(finalQuery, function () {
    // MDS.log(JSON.stringify(res));
  });
}

function updatePurchaseRequestEvent(transactionUID, status, callback) {
  var updateQuery = `
        UPDATE event 
        SET status = ?,
          last_updated = CURRENT_TIMESTAMP
        WHERE type = 'purchaseRequest' AND transactionUID = ?
    `;

  // Prepare the parameters
  var params = [status, transactionUID];

  // Use a helper function to safely create the SQL query
  var finalQuery = cleanseForSQL(updateQuery, params);

  // MDS.log('final query: ' + finalQuery);

  MDS.sql(finalQuery, function (res) {
    // MDS.log(JSON.stringify(res));
    callback(res);
  });
}

function insertPurchase(uid, data, txpowid) {
    var insertQuery = `INSERT INTO purchases (uid, data, txpowid) VALUES (?, ?, ?)`;
    var params = [uid, JSON.stringify(data), txpowid];
    var finalQuery = cleanseForSQL(insertQuery, params);
    
    MDS.sql(finalQuery, function (res) {
      // MDS.log("Purchase inserted: " + JSON.stringify(res));
    });
}

function deletePurchase(uid, callback) {
  var deleteQuery = `DELETE FROM purchases WHERE uid = ?`;
  var params = [uid];
  var finalQuery = cleanseForSQL(deleteQuery, params);

  MDS.sql(finalQuery, function (res) {
    if (!res.status) {
      return callback({status: false, error: res.error})
    }

    return callback({status: res.status});      
  });
}

function getPurchaseEventJoin(page, itemsPerPage, callback) {
  // First check if tables exist
  var checkTablesQuery = "SELECT COUNT(*) as table_count FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME IN ('EVENT', 'PURCHASES')";

  MDS.sql(checkTablesQuery, function(checkRes) {
    if (checkRes.error || !checkRes.rows || checkRes.rows[0].TABLE_COUNT < 2) {
      callback({ error: "Required tables do not exist. Please run initSql() first." });
      return;
    }

    // If tables exist, proceed with join query
    var joinQuery = "SELECT " +
      "p.id AS purchase_id, " +
      "p.uid AS purchase_uid, " +
      "CAST(p.data AS VARCHAR) AS purchase_data, " +
      "p.creation_time AS purchase_creation_time, " +
      "e.id AS event_id, " +
      "e.type AS event_type, " +
      "e.coinid AS event_coinid, " +
      "CAST(e.data AS VARCHAR) AS event_data, " +
      "e.transactionUID, " +
      "e.status AS event_status, " +
      "e.timestamp AS event_timestamp " +
      "FROM purchases p " +
      "LEFT JOIN event e ON p.uid = e.transactionUID AND e.type = 'purchaseRequest' " +
      "ORDER BY COALESCE(e.timestamp, p.creation_time) DESC " +
      "LIMIT ? OFFSET ?";

    var countQuery = "SELECT COUNT(*) as total FROM purchases p " +
      "LEFT JOIN event e ON p.uid = e.transactionUID AND e.type = 'purchaseRequest'";


    MDS.sql(countQuery, function(countRes) {
      if (countRes.error) {
        callback({ error: "Error executing count query: " + countRes.error });
        return;
      }

      var totalItems = countRes.rows[0].TOTAL;
      var offset = (page - 1) * itemsPerPage;
      var params = [itemsPerPage, offset];
      var finalQuery = cleanseForSQL(joinQuery, params);
      MDS.sql(finalQuery, function (res) {
        if (res.error) {
          MDS.log("Error in join query: " + JSON.stringify(res.error));
          callback({ error: "Error executing join query: " + res.error });
        } else {
          // Parse the JSON strings back to objects after retrieval
          if (res.rows) {
            res.rows = res.rows.map(function(row) {
              var newRow = {};
              for (var key in row) {
                if (Object.prototype.hasOwnProperty.call(row, key)) {
                  newRow[key] = row[key];
                }
              }
              newRow.PURCHASE_DATA = JSON.parse(cleanseForJSON(row.PURCHASE_DATA) || '{}');
              newRow.EVENT_DATA = row.EVENT_DATA ? JSON.parse(cleanseForJSON(row.EVENT_DATA)) : null;
              return newRow;
            });
          }

          callback({ rows: res.rows, totalItems: totalItems });
        }
      });
    });
  });
}

function cleanseForSQL(query, params) {
  return query.replace(/\?/g, function () {
    var param = params.shift();

    // Check for strings
    if (typeof param === "string") {
      // Escape single quotes and backslashes
      return "'" + param.replace(/'/g, "''").replace(/\\/g, "\\\\") + "'";
    }

    // Check for objects (assumed to be JSON)
    if (typeof param === "object") {
      // Convert object to a JSON string and escape single quotes and backslashes
      return (
        "'" +
        JSON.stringify(param)
          .replace(/'/g, "''") // Escape single quotes
          .replace(/\\/g, "\\\\") +
        "'"
      ); // Escape backslashes
    }

    // Return the parameter as-is for numbers, booleans, etc.
    return param !== null ? param : "NULL";
  });
}

function cleanseForJSON(data) {
  return data
    .replace(/''/g, "'") // Convert double single quotes to a single quote
    .replace(/\\\\/g, "\\"); // Convert double backslashes to a single backslash
}

