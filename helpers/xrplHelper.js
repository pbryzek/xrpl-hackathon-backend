const xrpl = require("xrpl");
const Decimal = require("decimal.js");
const fs = require("fs").promises; // Use promises for async/await support
const path = require("path");
const WALLETS_FILE = path.resolve(__dirname, "../data/wallets.json");
const ISSUER_XRPL_ADDRESS = "rF35kVEfmp5XyFtYMcmWEZK5BTgHBJtY9";

class CruBuyData {
  constructor(num_crus_purchased, num_crus_open_orders, date, buyTxLink, currencyCode) {
    this.num_crus_purchased = num_crus_purchased;
    this.num_crus_open_orders = num_crus_open_orders;
    this.date = date;
    this.buyTxLink = buyTxLink;
    this.currencyCode = currencyCode;
  }
}

async function tecPathCheck(client, address) {
  try {
    // 🔹 Get XRPL reserve requirements
    const serverInfo = await client.request({ command: "server_info" });
    const { reserve_base_xrp, reserve_inc_xrp } = serverInfo.result.info.validated_ledger;
    const baseReserve = new Decimal(reserve_base_xrp);
    const incReserve = new Decimal(reserve_inc_xrp);
    console.log("Checking balance for address:", address);
    // 🔹 Get the wallet's current XRP balance
    const accountInfo = await client.request({ command: "account_info", account: address });
    const xrpBalance = new Decimal(accountInfo.result.account_data.Balance).div(1000000); // Convert drops to XRP
    // 🔹 Calculate required reserve based on account's objects (trust lines, offers, etc.)
    const ownerCount = new Decimal(accountInfo.result.account_data.OwnerCount);
    const requiredReserve = baseReserve.plus(ownerCount.mul(incReserve));
    const availableBalance = xrpBalance.minus(requiredReserve);
    console.log(`Available Balance: ${availableBalance} XRP`);

    // 🔹 If available balance is too low, fund the account
    if (availableBalance.lt(10)) {
      // Adjust minimum reserve as needed
      console.log("Not enough XRP, funding account...");
      return await fundAccount(client, address);
    }
    return null;
  } catch (error) {
    console.error("Error in tecPathCheck:", error.message);
    return null;
  }
}

// 🔹 Funding function for Testnet (Use a pre-funded account for production)
async function fundAccount(client, address) {
  console.log("Funding wallet:", address);
  const result = await client.fundWallet({ wallet: { classicAddress: address } });
  console.log("Funded successfully:", result);
  return result;
}

/**
 * Sets up a Trust Line if needed
 */
async function setupTrustLine(client, wallet, classicAddress, currencyCode, issuerAddress) {
  const trustSetTx = {
    TransactionType: "TrustSet",
    Account: classicAddress,
    LimitAmount: {
      currency: currencyCode,
      issuer: issuerAddress,
      value: "1000000",
    },
  };

  const preparedTrustSet = await client.autofill(trustSetTx);
  const signedTrustSet = wallet.sign(preparedTrustSet);
  return await client.submitAndWait(signedTrustSet.tx_blob);
}

/**
 * Fetches existing offers from the XRPL DEX
 */
async function getExistingOffers(client, currencyCode, issuerAddress) {
  try {
    const response = await client.request({
      command: "book_offers",
      taker_gets: {
        currency: currencyCode, // The asset being purchased (CRU)
        issuer: issuerAddress,
      },
      taker_pays: {
        currency: "XRP",
        issuer: issuerAddress,
      },
      ledger_index: "validated",
      limit: 10, // Fetch up to 10 offers
    });

    return response.result.offers || [];
  } catch (error) {
    console.error("Error fetching existing offers:", error);
    return [];
  }
}

/**
 * Places a Buy Order for CRUs on XRPL DEX
 */
async function purchaseCruViaMakeOfferABI(client, classicAddress, offer, amount) {
  console.log("purchaseCruViaMakeOfferABI flow 1");
  const preBuyAmt = await getBalancefromLines(classicAddress, client, offer.TakerGets.currency);
  console.log("purchaseCruViaMakeOfferABI" + offer);
  const cruResults = await offerCreate(client, classicAddress, offer.TakerGets, offer.TakerPays, amount);
  if (!cruResults.success) {
    return cruResults;
  }
  return handleCruOfferResult(
    classicAddress,
    cruResults,
    offer.TakerGets.value,
    preBuyAmt,
    offer.TakerGets.currency,
    client
  );
}

async function handleCruOfferResult(cruWalletAddress, cruResults, amount, preBuyAmt, currencyCode, client) {
  console.log("handleCruOfferResult");
  console.log(cruResults);
  const transResult = cruResults?.data?.result?.meta?.TransactionResult ?? "";
  if (transResult && transResult === "tesSUCCESS") {
    return await handleSuccessfulCruOffer(cruWalletAddress, cruResults, amount, preBuyAmt, currencyCode, client);
  } else if (transResult === "tecUNFUNDED_OFFER") {
    return createFailJSON(`CRUs failed to buy because of insufficient funds. Attempted to buy ${amount} PFMUs.`);
  }
  const isAccepted = cruResults.data.result.accepted;
  if (isAccepted) {
    return await handleSuccessfulCruOffer(cruWalletAddress, cruResults, amount, preBuyAmt, currencyCode, client);
  }
  return createFailJSON(`CRUs failed to buy. Unaccounted for status: ${transResult}`);
}

async function getLatestLedgerSequence(client) {
  const ledgerResponse = await client.request({
    command: "ledger",
    ledger_index: "validated",
  });
  return ledgerResponse.result.ledger_index;
}

async function prepareSignSubmitTxWithRetry(client, transactionJson, wallet, maxAttempts = 3) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    console.log(`prepareSignSubmitTxWithRetry loop attempt: ${attempt}`);
    try {
      // 🔹 Set transaction expiry (LastLedgerSequence)
      console.log("Flow 2");
      const latestLedgerSequence = await getLatestLedgerSequence(client);
      console.log("Flow 3");

      transactionJson.LastLedgerSequence = latestLedgerSequence + 500;
      // 🔹 Prepare, sign, and submit transaction
      console.log("Flow 4");
      console.log(transactionJson);

      //let tx_prepared = await client.autofill(transactionJson);
      let tx_prepared = await client.autofill({
        ...transactionJson,
        NetworkID: 21337,
      });
      console.log("Flow 5");
      console.log(tx_prepared);
      const tx_signed = wallet.sign(tx_prepared);
      console.log("Flow 6");
      console.log(tx_signed);
      //const tx_result = await client.submitAndWait(tx_signed.tx_blob);

      const tx_result = await client.request({
        command: "submit",
        tx_blob: tx_signed.tx_blob,
      });

      console.log("Flow 7");
      const balance = await client.request({
        command: "account_info",
        account: ISSUER_XRPL_ADDRESS,
        ledger_index: "validated",
      });
      console.log("Account Balance:", balance.result.account_data.Balance / 1000000, "XRP");
      return createSuccessJSON("Transaction submitted", tx_result);
    } catch (error) {
      console.log(`Attempt ${attempt} failed: ${error.message}`);
      // 🔹 Retry logic: If max attempts reached and error is NOT tefPAST_SEQ, return failure
      if (!error.message.includes("tefPAST_SEQ") && attempt === maxAttempts) {
        return createFailJSON("Max retry attempts reached for transaction submission");
      }
    }
  }
}

async function getWalletByClassicAddress(classicAddress) {
  try {
    const data = await fs.readFile(WALLETS_FILE, "utf-8");
    const wallets = JSON.parse(data);
    for (const wallet of wallets) {
      console.log(wallet);
      if (wallet.classicAddress == classicAddress) {
        return wallet;
      }
    }
  } catch (error) {
    console.error("Error reading JSON file:", error);
    return null;
  }
  return null;
}

async function offerCreate(client, classicAddress, takerGets, takerPays, amount) {
  await tecPathCheck(client, classicAddress);
  console.log("offerCreate takerPays: ", takerPays);
  console.log("offerCreate takerGets: ", takerGets);

  let takerGetsStr = "" + takerGets.value * 100000;
  let takerPaysStr = "" + takerPays.value * 10000;

  const offerCreateTx = {
    TransactionType: "OfferCreate",
    Account: classicAddress,
    TakerGets: takerGets,
    TakerPays: takerPaysStr,
  };
  console.log("offerCreate offerCreateTx: ", offerCreateTx);
  let wallet = await getWalletByClassicAddress(classicAddress);
  let xrplWallet = xrpl.Wallet.fromSeed(process.env.ISSUER_WALLET_SECRET);

  console.log("offerCreate xrplWallet: ", xrplWallet);

  return await prepareSignSubmitTxWithRetry(client, offerCreateTx, xrplWallet);
}

async function handleSuccessfulCruOffer(cruWalletAddress, cruResults, amount, preBuyAmt, currencyCode, client) {
  const postBuyAmt = await getBalancefromLines(cruWalletAddress, client, currencyCode);

  const boughtAmt = (postBuyAmt - preBuyAmt).toFixed(4);
  console.log("postBuyAmt: ", postBuyAmt);
  console.log("preBuyAmt: ", preBuyAmt);
  console.log("boughtAmt: ", boughtAmt);
  if (boughtAmt > 0) {
    const cruBuyData = createCruBuyData(cruResults, boughtAmt, amount, amtCstToSpend, currencyCode);

    if (spendResult.success) {
      return createSuccessJSON(`All ${amount} CRUs were successfully purchased.`, cruBuyData);
    } else {
      return createSuccessJSON(`${boughtAmt} of ${amount} CRUs successfully purchased.`, cruBuyData);
    }
  } else {
    return createFailJSON(
      `CRUs offer made successfully but not fulfilled for ${cruWalletAddress}. Try a different offer.`
    );
  }
}

/**
 * Creates a CruBuyData object.
 *
 * @param {Object} cruResults - The results of the CRU offer.
 * @param {number} boughtAmt - The amount of CRUs bought.
 * @param {number} amount - The total amount of CRUs attempted to buy.
 * @param {string} currencyCode - The currency code of the CRU token.
 * @return {CruBuyData} A new CruBuyData object.
 */
function createCruBuyData(cruResults, boughtAmt, amount, currencyCode) {
  return new CruBuyData(
    boughtAmt, //num_crus_purchased,
    (amount - boughtAmt).toFixed(4), //num_crus_open_orders,
    xrplDateToIso(cruResults.data.result.date), //date,
    `${XRPL_TX_URL}${cruResults.data.result.hash}`, //buyTxLink,
    fromHexToCurrency(cruResults.data.result.TakerPays.currency) //currencyCode,
  );
}

function fromHexToCurrency(hex) {
  try {
    if (hex.length > 3) {
      const bytes = Buffer.from(hex, "hex");
      const str = bytes.toString("utf8");
      return str.replace(/\0/g, "");
    }
  } catch (error) {
    console.error("Error in fromHexToCurrency: ", error);
  }
  return hex;
}

function xrplDateToIso(xrplDate) {
  const date = new Date((xrplDate + 946684800) * 1000);
  return formatDateToReadableString(date.toISOString());
}

function formatDateToReadableString(dateString) {
  const date = new Date(dateString);
  const timeZone = "GMT";
  const options = {
    timeZone: timeZone,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  };
  return date.toLocaleString("en-US", options) + " " + timeZone;
}

/* purchaseCruViaMakeOfferAbi helper functions*/
async function getBalancefromLines(address, client, currency_code) {
  const accountLine = await accountLinesAPI(address, client);
  return accountLine.result.lines.find(line => line.currency === currency_code)?.balance || 0;
}

async function accountLinesAPI(address, client) {
  return await client.request({
    command: "account_lines",
    account: address,
  });
}

/**
 * Creates a success JSON object with a message and data.
 *
 * @param {string} msg - The success message.
 * @param {any} data - The data to be included in the JSON object.
 * @return {object} The success JSON object.
 */
function createSuccessJSON(msg, data) {
  return {
    success: true,
    message: msg,
    data: data,
  };
}

/**
 * Creates a JSON object with success set to false and a specified message.
 *
 * @param {string} msg - The message to be included in the JSON object.
 * @return {Object} retData - The JSON object with success, message, and data properties.
 */
function createFailJSON(msg) {
  return {
    success: false,
    message: msg,
  };
}

module.exports = {
  setupTrustLine,
  getExistingOffers,
  purchaseCruViaMakeOfferABI,
  getWalletByClassicAddress,
};
