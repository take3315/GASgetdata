//Input treasury wallet addresses
const mywalletaddresses = [
  "0x24dd242c3c4061b1fcaa5119af608b56afbaea95",
  "0x153d9dd730083e53615610a0d2f6f95ab5a0bc01",
  "0x4534f4968006ca9eca3bac922022c7ecba066e9e",
  "0xdc94eeeb3260d0b9bf22849e8f5d236d286cdba1"
];
//Input tokens you want to exclude (c-token and BPT V2 are double counted hence excluded)
const notcount = ["0xbc5f4f9332d8415aaf31180ab4661c9141cc84e4", "0x70e36f6bf80a52b3b46b3af8e106cc0ed743e8e4", "0x4ddc2d193948926d02f9b1fe9e1daa0718270ed5"];
//Input ccy to use
const currency = "jpy";
//Input target google sheet name
const bssheet_name = 'シート1';
//Input target google sheet name
const plsheet_name = 'シート2';


//function to retrieve data, store in Sheets and set trigger for next run on month end
function getalldata() {

  var scriptProperties = PropertiesService.getScriptProperties();
  var USERNAME = scriptProperties.getProperty('ZerionAPI');
  var sheet_id = scriptProperties.getProperty('Google_Sheets_ID');
  var sheet = SpreadsheetApp.openById(sheet_id).getSheetByName(bssheet_name);
  var today = new Date();
  var suburl = 'https://api.thegraph.com/subgraphs/name/balancer-labs/balancer';
  var output = [];
  var authheader = { "Authorization": "Basic " + Utilities.base64Encode(USERNAME + ":") };
  var params = { "method": "GET", "headers": authheader };

  for (var a = 0; a < mywalletaddresses.length; a++) {
    var myaddress = mywalletaddresses[a];
    var url = `https://api.zerion.io/v1/wallets/${myaddress}/positions/?currency=${currency}&sort=value`;

    var json = JSON.parse(UrlFetchApp.fetch(url, params));

    for (var i = 0; i < json.data.length; i++) {
      var obj = json.data[i];
      if (obj.attributes.fungible_info.symbol == "BPT-V1") {
        var lpTokenAddress = obj.attributes.fungible_info.implementations[0].address;
        var lpTokenQuery = `
            query {
              pool(id: "${lpTokenAddress}") {
              totalShares
              tokens {
                  symbol
                  balance
                  address
                  name
                }
              }
            }
            `;
        var lpTokenResponse = UrlFetchApp.fetch(suburl, {
          'method': 'post',
          'payload': JSON.stringify({ 'query': lpTokenQuery }),
          'contentType': 'application/json'
        });
        var lpTokenJson = JSON.parse(lpTokenResponse.getContentText());

        for (var j = 0; j < lpTokenJson.data.pool.tokens.length; j++) {
          var underlyingToken = lpTokenJson.data.pool.tokens[j].symbol;
          var underlyingTokenBalance = lpTokenJson.data.pool.tokens[j].balance * obj.attributes.quantity.numeric / lpTokenJson.data.pool.totalShares;
          var underlyingTokenaddress = lpTokenJson.data.pool.tokens[j].address;
          var underlyingTokenname = lpTokenJson.data.pool.tokens[j].name;
          var url2 = `https://api.zerion.io/v1/fungibles/${underlyingTokenaddress}?currency=${currency}`
          var bptTokenPrice = JSON.parse(UrlFetchApp.fetch(url2, params));

          output.push([
            Utilities.formatDate(today, 'UTC', 'yyyy-MM-dd\'T\'HH:mm:ss\'Z\''),
            'Balancer Pool BPT-V1',
            'deposit',
            underlyingTokenBalance,
            underlyingTokenBalance * bptTokenPrice.data.attributes.market_data.price,
            bptTokenPrice.data.attributes.market_data.price,
            underlyingTokenname,
            underlyingToken,
            obj.relationships.chain.data.id,
            underlyingTokenaddress
          ]);
        }
      } else

        if (!notcount.includes(obj.attributes.fungible_info.implementations[0].address)) {
          output.push([
            Utilities.formatDate(today, 'UTC', 'yyyy-MM-dd\'T\'HH:mm:ss\'Z\''),
            obj.attributes.name,
            obj.attributes.position_type,
            obj.attributes.quantity.numeric,
            obj.attributes.value,
            obj.attributes.price,
            obj.attributes.fungible_info.name,
            obj.attributes.fungible_info.symbol,
            obj.relationships.chain.data.id,
            obj.attributes.fungible_info.implementations[0].address
          ]);
        }
    };
  };

  var startRow = sheet.getLastRow() + 1;
  var rowLength = output.length;
  var colLength = output[0].length;
  var range = sheet.getRange(startRow, 1, rowLength, colLength);
  range.setValues(output);
  sheet.getRange(startRow, 1, sheet.getLastRow() - startRow + 1, colLength).sort([{ column: 1, ascending: true }, { column: 5, ascending: false }]);
  getpldata();
  setTrigger();
}

//trigger property, run when getdata function is ran then set new trigger for next month-end at midnight -2 mins.
function setTrigger() {
  let triggers = ScriptApp.getScriptTriggers();
  for (let trigger of triggers) {
    let funcName = trigger.getHandlerFunction();
    if (funcName == 'getalldata') {
      ScriptApp.deleteTrigger(trigger);
    }
  }

  let now = new Date();
  let y = now.getFullYear();
  let m = now.getMonth();
  let date = new Date(y, m + 2, 0, 23, 58);
  ScriptApp.newTrigger('getalldata').timeBased().inTimezone("Asia/Tokyo").at(date).create();
}


function getpldata() {

  var scriptProperties = PropertiesService.getScriptProperties();
  var USERNAME = scriptProperties.getProperty('ZerionAPI');
  var sheet_id = scriptProperties.getProperty('Google_Sheets_ID');
  var sheet = SpreadsheetApp.openById(sheet_id).getSheetByName(plsheet_name);
  var output = [];
  var now = new Date();
  var y = now.getFullYear();
  var m = now.getMonth();
  var firstdayofmonth = new Date(y, m, 1, 00, 00);
  var dateISO = Utilities.formatDate(firstdayofmonth, 'UTC', 'yyyy-MM-dd\'T\'HH:mm:ss\'Z\'');
  var authheader = { "Authorization": "Basic " + Utilities.base64Encode(USERNAME + ":") };
  var params = { "method": "GET", "headers": authheader };
  var txjpPricedata = JSON.parse(UrlFetchApp.fetch('https://api.zerion.io/v1/fungibles/0x961dd84059505d59f82ce4fb87d3c09bec65301d?currency=jpy', params));
  var txjpPrice = txjpPricedata.data.attributes.market_data.price;


  for (var a = 0; a < mywalletaddresses.length; a++) {
    var myaddress = mywalletaddresses[a];
    var url = `https://api.zerion.io/v1/wallets/${myaddress}/transactions/?currency=${currency}`;
    var json = JSON.parse(UrlFetchApp.fetch(url, params));

    for (var i = 0; i < json.data.length; i++) {
      var obj = json.data[i];
      var dateStr = obj.attributes.mined_at;

      if (new Date(dateStr) > new Date(dateISO)) {

        if (obj.attributes.transfers.length > 0) {

          for (var j = 0; j < obj.attributes.transfers.length; j++) {

            var transfer = obj.attributes.transfers[j];
            var transferName = "";
            var transferSymbol = "";
            var transferDirection = "";
            var transferQuantity = "";
            var transferValue = "";
            var transferPrice = "";
            var isNFT = "N";

            if (transfer.fungible_info) {

              transferName = transfer.fungible_info.name;
              transferSymbol = transfer.fungible_info.symbol;
              transferDirection = transfer.direction;
              transferQuantity = transfer.quantity.numeric;
              transferValue = transfer.value;
              transferPrice = transfer.price;

              if (transferSymbol == "TXJP") {
                transferPrice = txjpPrice;
                transferValue = transfer.quantity.numeric * txjpPrice;
              }

            } else if (transfer.nft_info) {

              isNFT = "Yes";
              transferName = transfer.nft_info.name;
              transferDirection = transfer.direction;
              transferQuantity = transfer.quantity.numeric;
              transferValue = transfer.value;
              transferPrice = transfer.price;

            }

            output.push([
              obj.attributes.mined_at,
              obj.relationships.chain.data.id,
              obj.attributes.operation_type,
              transferDirection,
              isNFT,
              transferSymbol,
              transferName,
              transferQuantity,
              transferPrice,
              transferValue,
              obj.attributes.fee.fungible_info.symbol,
              obj.attributes.fee.quantity.numeric,
              obj.attributes.fee.price,
              obj.attributes.fee.value,
              obj.attributes.hash
            ]);
          }
        } else {

          output.push([
            obj.attributes.mined_at,
            obj.relationships.chain.data.id,
            obj.attributes.operation_type,
            "",
            "N",
            "",
            "",
            "",
            "",
            "",
            obj.attributes.fee.fungible_info.symbol,
            obj.attributes.fee.quantity.numeric,
            obj.attributes.fee.price,
            obj.attributes.fee.value,
            obj.attributes.hash
          ]);
        }
      }
    }
  }
  var startRow = sheet.getLastRow() + 1;
  var rowLength = output.length;
  var colLength = output[0].length;
  var range = sheet.getRange(startRow, 1, rowLength, colLength);
  range.setValues(output);
  var lastrow = sheet.getLastRow();
  var lastcol = sheet.getLastColumn();
  sheet.getRange(2, 1, lastrow, lastcol).sort(1);

}

//at first run this function to set properties namely Zerion API and Google Sheets ID 
function setProperty() {

  const scriptProperties = PropertiesService.getScriptProperties();
  scriptProperties.setProperties({
    'ZerionAPI': "zk_dev_your key",
    'Google_Sheets_ID': "your sheet id"
  });
}