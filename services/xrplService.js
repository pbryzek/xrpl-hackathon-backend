const xrpl = require("xrpl");
const fs = require("fs").promises;
const path = require("path");
const WALLETS_FILE = path.resolve(__dirname, "../data/wallets.json");
require("dotenv").config(); // Load environment variables

const { setupTrustLine } = require("../helpers/xrplHelper");

class XRPLStaking {
  // Static properties from the first class
  static XRPL_SERVER = "wss://s.altnet.rippletest.net:51233"; // XRPL Testnet
  static ISSUER_ADDRESS = "rhGiVDJ56vmEHbiVJ4KZRCPysudgWaRzu3"; // Change to actual issuer'
  static ISSUER_XRPL_ADDRESS = "rF35kVEfmp5XyFtYMcmWEZK5BTgHBJtY9";
  static PFMU_XRP_CONVERSION = 10.5;
  static STAKING_ACCOUNT_SECRET = process.env.STAKING_ACCOUNT_SECRET; // Staking Account Private Key

  // PFMU and GBOND Currency Codes
  ///static PFMU_CURRENCY_HEX = "50464D552D4252412D3033313832303234AABBCCDD";
  static PFMU_CURRENCY = "PFMU-BRA-03182024";
  //static PFMU_CURRENCY_HEX = "50464D552D4252412D3033313832303234AABBCCDD";
  static GBOND_CURRENCY_PREFIX = "GBOND-";
  static GBOND_CURRENCY = XRPLStaking.GBOND_CURRENCY_PREFIX + XRPLStaking.PFMU_CURRENCY;

  static PFMU_TOKEN = {
    currency: XRPLStaking.PFMU_CURRENCY_HEX,
    issuer: "rAzPNHTi8ydnARBRDUFVobEHpJ6SmbZqv",
  };

  constructor() {
    // Initialize properties from the second class
    this.client = null;
    this.issuerWallet = null; // Will be set after connecting
  }

  async encodeCurrency(currency) {
    if (currency.length > 3) {
      let hex = Buffer.from(currency, "utf8").toString("hex").toUpperCase();
      return (hex + "0".repeat(40)).slice(0, 40); // ✅ Ensure 40-character HEX
    }
    return currency; // ✅ If it's 3 characters (ISO), use it as-is
  }

  // ✅ Connect to XRPL (from the first class)
  async connectClient() {
    this.client = new xrpl.Client(XRPLStaking.XRPL_SERVER);
    await this.client.connect();
    this.issuerWallet = xrpl.Wallet.fromSeed(process.env.ISSUER_WALLET_SECRET);
    console.log("✅ Connected to XRPL");
  }

  // ✅ Disconnect from XRPL (from the first class)
  async disconnectClient() {
    if (this.client) {
      await this.client.disconnect();
      console.log("✅ Disconnected from XRPL");
    }
  }

  async createEscrow(classicAddress) {
    try {
      await this.connectClient();
      let walletJson = await getWalletByClassicAddress(classicAddress);

      const wallet = xrpl.Wallet.fromSeed(walletJson.seed);
      console.log(`Wallet address: ${wallet.address}`);

      // Set the escrow release time (Unix timestamp, must be in the future)
      const finishAfter = Math.floor(Date.now() / 1000) + 60; // 1 minutes from now

      const escrowTx = {
        TransactionType: "EscrowCreate",
        Account: classicAddress,
        Amount: xrpl.xrpToDrops("10"), // 10 XRP
        Destination: XRPLStaking.ISSUER_ADDRESS,
        FinishAfter: finishAfter, // Timestamp after which funds can be released
        Fee: "12", // Adjust based on network conditions
      };

      // Submit transaction
      const preparedTx = await client.autofill(escrowTx);
      const signedTx = wallet.sign(preparedTx);
      const result = await client.submitAndWait(signedTx.tx_blob);

      console.log("Escrow transaction result:", result);
    } finally {
      await this.disconnectClient();
    }
  }

  // ✅ Stake PFMU Tokens
  async stakePFMU(walletSecret, pfmu) {
    console.log("stakePFMU");

    // TODO enable XRPL logic.
    if (true) {
      return;
    }
    await this.connectClient();
    const userWallet = xrpl.Wallet.fromSeed(walletSecret);
    const stakingWallet = xrpl.Wallet.fromSeed(XRPLStaking.STAKING_ACCOUNT_SECRET);

    const tx = {
      TransactionType: "Payment",
      Account: userWallet.classicAddress,
      Destination: stakingWallet.classicAddress,
      Amount: {
        currency: XRPLStaking.PFMU_CURRENCY,
        issuer: XRPLStaking.ISSUER_ADDRESS,
        value: pfmu.amount.toString(),
      },
      DestinationTag: 1001, // Staking identifier
    };

    const prepared = await this.client.autofill(tx);
    const signed = userWallet.sign(prepared);
    const result = await this.client.submitAndWait(signed.tx_blob);

    console.log(`✅ PFMU Staked: ${pfmu.amount}`, result);
    await this.disconnectClient();
  }

  // ✅ Reward User with GBOND Tokens
  async rewardGBOND(userAddress, rewardAmount) {
    await this.connectClient();
    const stakingWallet = xrpl.Wallet.fromSeed(XRPLStaking.STAKING_ACCOUNT_SECRET);

    const tx = {
      TransactionType: "Payment",
      Account: stakingWallet.classicAddress,
      Destination: userAddress,
      Amount: {
        currency: XRPLStaking.GBOND_CURRENCY,
        issuer: XRPLStaking.ISSUER_ADDRESS,
        value: rewardAmount.toString(),
      },
      DestinationTag: 1001,
    };

    const prepared = await this.client.autofill(tx);
    const signed = stakingWallet.sign(prepared);
    const result = await this.client.submitAndWait(signed.tx_blob);

    console.log(`✅ GBOND Reward Sent: ${rewardAmount}`, result);
    await this.disconnectClient();
  }

  // ✅ Unstake PFMU After Maturity
  async unstakePFMU(userAddress, unstakeAmount) {
    await this.connectClient();
    const stakingWallet = xrpl.Wallet.fromSeed(XRPLStaking.STAKING_ACCOUNT_SECRET);

    const tx = {
      TransactionType: "Payment",
      Account: stakingWallet.classicAddress,
      Destination: userAddress,
      Amount: {
        currency: XRPLStaking.PFMU_CURRENCY_HEX,
        issuer: XRPLStaking.ISSUER_ADDRESS,
        value: unstakeAmount.toString(),
      },
      DestinationTag: 1001, // Unstake identifier
    };

    const prepared = await this.client.autofill(tx);
    const signed = stakingWallet.sign(prepared);
    const result = await this.client.submitAndWait(signed.tx_blob);

    console.log(`✅ PFMU Unstaked: ${unstakeAmount}`, result);
    await this.disconnectClient();
  }

  async formatOffers(offers, isBuy, currency = "XRP") {
    return offers.map(offer => {
      const takerPays = offer.TakerPays;
      const takerGets = offer.TakerGets;

      const takerPaysAmount =
        typeof takerPays === "string"
          ? parseFloat(takerPays) / 1e6 // XRP in drops
          : parseFloat(takerPays.value);

      const takerGetsAmount =
        typeof takerGets === "string"
          ? parseFloat(takerGets) / 1e6 // XRP in drops
          : parseFloat(takerGets.value);

      const price = isBuy
        ? (takerPaysAmount / takerGetsAmount).toFixed(4)
        : (takerGetsAmount / takerPaysAmount).toFixed(4);

      const amount = isBuy ? takerGetsAmount.toFixed(4) : takerPaysAmount.toFixed(4);
      const totalPrice = (parseFloat(price) * parseFloat(amount)).toFixed(4);

      return {
        price: `${price} (${currency})`,
        amount: `${amount} PFMU-BRA-03182024`,
        totalPrice: `${totalPrice} (${currency})`,
      };
    });
  }

  async getBuyOffers() {
    console.log("getBuyOffers");
    await this.connectClient();

    try {
      const xrpBuyResponse = await this.client.request({
        command: "book_offers",
        taker_pays: { currency: "XRP" },
        taker_gets: XRPLStaking.PFMU_TOKEN,
        ledger_index: "validated",
      });

      console.log("xrpBuyResponse", xrpBuyResponse);
      const formattedXRPBuyOffers = await this.formatOffers(xrpBuyResponse.result.offers, true, "XRP");
      const usdBuyResponse = await this.client.request({
        command: "book_offers",
        taker_pays: { currency: "USD", issuer: "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B" },
        taker_gets: XRPLStaking.PFMU_TOKEN,
        ledger_index: "validated",
      });

      console.log("usdBuyResponse", usdBuyResponse);
      const formattedUSDBuyOffers = await this.formatOffers(usdBuyResponse.result.offers, true, "USD");
      console.log(formattedUSDBuyOffers);
      const combinedBuyOffers = [...formattedXRPBuyOffers, ...formattedUSDBuyOffers];
      console.log("Buy Offers:\n", combinedBuyOffers);
      return combinedBuyOffers;
    } catch (error) {
      console.error("Error fetching getBuyOffers:", error.message);
    } finally {
      await this.disconnectClient();
    }
  }

  async getSellOffers() {
    try {
      console.log("Sell Offers: 1");

      await this.connectClient();

      const xrpSellResponse = await this.client.request({
        command: "book_offers",
        taker_pays: {
          currency: await this.encodeCurrency(XRPLStaking.PFMU_CURRENCY),
          issuer: "rAzPNHTi8ydnARBRDUFVobEHpJ6SmbZqv",
        },
        taker_gets: { currency: "XRP" },
        ledger_index: "validated",
      });

      console.log("Sell Offers: 3");

      const formattedXRPSellOffers = await this.formatOffers(xrpSellResponse.result.offers, false, "XRP");
      /*
      const usdSellResponse = await this.client.request({
        command: "book_offers",
        taker_pays: XRPLStaking.PFMU_TOKEN,
        taker_gets: { currency: "USD", issuer: "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B" },
        ledger_index: "validated",
      });
      */

      const usdSellResponse = await this.client.request({
        command: "book_offers",
        taker_pays: {
          currency: await this.encodeCurrency(XRPLStaking.PFMU_CURRENCY),
          issuer: "rAzPNHTi8ydnARBRDUFVobEHpJ6SmbZqv",
        },
        taker_gets: { currency: "USD", issuer: "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B" },
        ledger_index: "validated",
      });

      const formattedUSDSellOffers = await this.formatOffers(usdSellResponse.result.offers, false, "USD");
      //const combinedSellOffers = [...formattedXRPSellOffers, ...formattedUSDSellOffers];
      const combinedSellOffers = [...xrpSellResponse.result.offers, ...usdSellResponse.result.offers];
      console.log("Sell Offers:\n", combinedSellOffers);
      return combinedSellOffers;
    } catch (error) {
      console.error("Error fetching getSellOffers:", error.message);
      return [];
    } finally {
      await this.client.disconnect();
    }
    return [];
  }

  async getWalletByClassicAddress(classicAddress) {
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

  // ✅ Stake PFMU Tokens
  async tokenizeGreenBond(walletAddress, bond) {
    console.log("tokenizeGreenBond:\n");
    try {
      await this.connectClient();
      const tokenIssuer = process.env.ISSUER_ADDRESS; // Replace with the issuer's XRPL wallet
      const issuerWallet = xrpl.Wallet.fromSeed(process.env.ISSUER_WALLET_SECRET);
      const tokenName = "d_PFMU"; // Derivative token name

      let wallet = await this.getWalletByClassicAddress(walletAddress); //web wallet
      console.log("Wallet :", wallet)
      let xrplWallet = xrpl.Wallet.fromSeed(wallet.seed);         //xrpl wallet

      let totalAmt = 0;
      for (pfmu of bond.pfmus) {
        totalAmt += pfmu.amount;
      }

      // TODO add in the tokenization.
      await this.createEscrow(walletAddress);

      console.log(`Total Staked PFMUs: ${totalAmt}`);

      await setupTrustLine(client, wallet, walletAddress, tokenName, tokenIssuer);

      //Minting new token, and sending it to ourselves
      console.log("Minting d_PFMU...");
      const mintTx = {
        TransactionType: "Payment",
        Account: tokenIssuer,
        Destination: tokenIssuer, // Self-issued tokens
        Amount: {
          currency: tokenName,
          issuer: tokenIssuer,
          value: totalAmt.toString()
        }
      };

      const preparedMint = await client.autofill(mintTx);
      const signedMint = issuerWallet.sign(preparedMint);
      await client.submitAndWait(signedMint.tx_blob);
      console.log(`Minted ${totalAmt} d_PFMU ✅`);

      //sending d_PFMU to user
      console.log("Sending d_PFMU to user...");
      const sendTx = {
        TransactionType: "Payment",
        Account: tokenIssuer,
        Destination: walletAddress, // User's wallet
        Amount: {
          currency: tokenName,
          issuer: tokenIssuer,
          value: totalAmt.toString()
        }
      };
  
      const preparedSend = await client.autofill(sendTx);
      const signedSend = issuerWallet.sign(preparedSend);
      await client.submitAndWait(signedSend.tx_blob);
      console.log(`Sent ${totalAmt} d_PFMU to ${walletAddress} ✅`);

      return true;
    } catch (error) {
      console.error("Error tokenizeGreenBond:", error.message);
    } finally {
      await this.client.disconnect();
      return false;
    }
  }

  // ✅ Mint Green Bond NFT
  async mintGreenBond() {
    try {
      console.log(`🎉 mintGreenBondmintGreenBondmintGreenBond`);
      await this.connectClient();
      // To stake, 1. Send PFMU
      // 2. Receive Derivative PFMU (new token)
      console.log(`🎉 mintGreenBond`);
      console.log(`🎉 this.issuerWallet`);
      console.log(this.issuerWallet);
      const txn = {
        TransactionType: "NFTokenMint",
        Account: this.issuerWallet.classicAddress,
        URI: xrpl.convertStringToHex("https://metadata-url.com/greenbond"),
        NFTokenTaxon: 0,
        Flags: 8,
      };
      console.log(`🎉 txn:`);
      console.log(txn);

      let response = await this.client.submitAndWait(txn, { wallet: this.issuerWallet });
      console.log(`🎉 response: ${response}`);
      if (!response.result.meta) throw new Error("NFT minting failed");
      let GREEN_BOND_NFT_ID = response.result.meta.nftoken_id;
      console.log(`🎉 Green Bond NFT Minted: ${GREEN_BOND_NFT_ID}`);
      return GREEN_BOND_NFT_ID;
    } catch (error) {
      console.error("Error minting Green Bond NFT:", error);
      return null;
    } finally {
      await this.client.disconnect();
    }
  }

  // ✅ Issue fractionalized Green Bond Tokens
  async issueGBNDTokens() {
    try {
      await this.connectClient();

      const txn = {
        TransactionType: "Payment",
        Account: this.issuerWallet.classicAddress,
        Destination: this.issuerWallet.classicAddress,
        Amount: {
          currency: "GBND",
          value: "1000000",
          issuer: this.issuerWallet.classicAddress,
        },
      };

      let response = await this.client.submitAndWait(txn, { wallet: this.issuerWallet });
      console.log("✅ GBND Tokens Issued:", response.result);
    } catch (error) {
      console.error("Error issuing GBND tokens:", error);
    } finally {
      await this.client.disconnect();
    }
  }
}

module.exports = XRPLStaking;
