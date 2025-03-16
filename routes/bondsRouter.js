const express = require("express");
const router = express.Router();
const {
  getAllBonds,
  addBond,
  getPendingBonds,
  getClosedBonds,
  getBondById,
  stakePFMU,
  updateBondsFile,
  getActiveBonds,
  getOpenBonds,
} = require("../services/bondService");
const Investor = require("../models/Investor");
const { successJSON, failJSON } = require("../utils/responseUtils");
const Bond = require("../models/Bond");
const XRPLStaking = require("../services/xrplService");

// Get all Active Green Bonds
router.get("/active", async (req, res) => {
  try {
    console.log("active");
    let activeBonds = await getActiveBonds();
    console.log(activeBonds);
    res.status(200).json(successJSON("activeBonds: success", activeBonds));
  } catch (err) {
    res.status(500).json(failJSON(err));
  }
});

// Get all Closed Green Bonds
router.get("/closed", async (req, res) => {
  try {
    const closedBonds = await getClosedBonds();
    res.status(200).json(successJSON("closedBonds: success", closedBonds));
  } catch (err) {
    res.status(500).json(failJSON(err));
  }
});

// Get all Open Green Bonds
router.get("/open", async (req, res) => {
  try {
    const openBonds = await getOpenBonds();
    res.status(200).json(successJSON("open Bonds: success", openBonds));
  } catch (err) {
    res.status(500).json(failJSON(err));
  }
});

// Express API route for pending bonds
router.get("/all", async (req, res) => {
  try {
    const allBonds = await getAllBonds();
    res.status(200).json(successJSON("allBonds: success", { all_bonds: allBonds }));
  } catch (err) {
    console.error("Error fetching all bonds:", err);
    res.status(500).json(failJSON(err.message));
  }
});

// Express API route for pending bonds
router.get("/pending", async (req, res) => {
  try {
    const pendingBonds = await getPendingBonds();
    res.status(200).json(successJSON("pendingBonds: success", { pending_bonds: pendingBonds }));
  } catch (err) {
    console.error("Error fetching pending bonds:", err);
    res.status(500).json(failJSON(err.message));
  }
});

// Get Bond Id
router.get("/:id", async (req, res) => {
  const bond = await getBondById(req.params.id);
  if (!bond) return res.status(404).json(failJSON("Bond not found"));
  res.status(200).json(successJSON("Bond found: success", bond));
});

// Issue a new Green Bond
router.post("/", async (req, res) => {
  try {
    const { name, amount, issuer, interestRate, description } = req.body;
    if (!name || !amount || !issuer || !interestRate || !description) {
      return res
        .status(400)
        .json(failJSON("Missing required fields: name, amount, issuer, interestRate, and description."));
    }
    const newBond = new Bond(name, issuer, amount, interestRate, description);
    await addBond(newBond);
    res.status(200).json(successJSON("Green Bond issued successfully", newBond));
  } catch (err) {
    res.status(500).json(failJSON(err.message));
  }
});

// ✅ Mint Green Bond NFT and Tokenize it
router.post("/mint", async (req, res) => {
  try {
    console.log("Minting new Green Bond NFT...");

    // Create instance of XRPL Staking Service
    let xrpl_service = new XRPLStaking();
    let nftId = await xrpl_service.mintGreenBond(); // Mint the NFT

    if (!nftId) {
      return res.status(500).json(failJSON("Green Bond NFT minting failed."));
    }

    console.log(`🎉 Green Bond NFT Minted: ${nftId}`);

    // Call issue_gbnd_tokens() to fractionalize bond after minting
    await xrpl_service.issueGBNDTokens();

    res.status(200).json(successJSON("Green Bond NFT minted successfully", { nftId }));
  } catch (err) {
    console.error("Error minting Green Bond NFT:", err);
    res.status(500).json(failJSON(err.message));
  }
});

// Stake in a Green Bond
router.post("/:id/stake", async (req, res) => {
  try {
    const { amount, project, walletSecret, issuanceDate, expirationDate } = req.body;
    if (!amount || !project || !issuanceDate || !walletSecret || !expirationDate) {
      return res
        .status(400)
        .json(failJSON("Missing required fields: amount, project, issuanceDate, walletSecret, expirationDate"));
    }
    const bond = await getBondById(req.params.id);
    if (!bond) return res.status(404).json(failJSON("Bond not found"));

    let resStake = await stakePFMU(walletSecret, amount, project, issuanceDate, expirationDate, bond);
    if (!resStake) {
      // TODO: Make API to create Green Bond.
      // ✅ Step 2: Mint Green Bond NFT if not already minted
      if (!bond.nftId) {
        console.log("🔄 No NFT found for this bond. Minting NFT now...");
        let xrplService = new XRPLStaking();
        let nftId = await xrplService.mintGreenBond();
        if (!nftId) {
          return res.status(200).json(successJSON("PFMU stake successful & Green Bond minted", bond));
        }
        console.log(`🎉 Green Bond NFT Minted: ${nftId}`);
        bond.nftId = nftId; // ✅ Store the minted NFT ID
      } else {
        console.log(`✅ Green Bond already has NFT: ${bond.nftId}`);
      }
      return res.status(500).json(failJSON("PFMU staking failed"));
    }
    console.log("✅ Stake successful, checking NFT status...");
    await updateBondsFile(bond);
    res.status(200).json(successJSON("Stake successful", bond));
  } catch (err) {
    console.error("❌ Error during staking & minting:", err);
    res.status(500).json(failJSON(err.message));
  }
});

// Invest in a Green Bond
router.post("/:id/invest", async (req, res) => {
  try {
    const { name, amount, bondId, walletAddress } = req.body;
    if (!name || !amount || !bondId || !walletAddress) {
      return res.status(400).json(failJSON("Missing required fields: name, amount, bondId, walletAddress"));
    }
    const bond = await getBondById(req.params.id);
    if (!bond) return res.status(404).json(failJSON("Bond not found"));
    const investor = new Investor(name, amount, bondId, walletAddress);
    bond.investors.push(investor);
    // TODO: Make API to transfer fractionalized tokens of Green Bond to investor.
    // Error check if there is still fractions/value available.
    await updateBondsFile(bond);
    res.status(200).json(successJSON("Investment successful", bond));
  } catch (err) {
    res.status(500).json(failJSON(err.message));
  }
});

// Issue a new Green Bond
router.post("/:id/tokenize", async (req, res) => {
  try {
    const { walletAddress } = req.body;
    if (!walletAddress) {
      return res.status(400).json(failJSON("Missing required fields: walletAddress"));
    }
    const bond = await getBondById(req.params.id);
    if (!bond) return res.status(404).json(failJSON("Bond not found"));

    // TODO have all of the PFMUs into escrow.
    let xrpl_service = new XRPLStaking();
    if (xrpl_service.tokenizeGreenBond(walletAddress, bond)) {
      res.status(200).json(successJSON("Green Bond tokenized successfully", bond));
    } else {
      res.status(500).json(successJSON("Green Bond tokenized not successfull", bond));
    }
  } catch (err) {
    res.status(500).json(failJSON(err.message));
  }
});
module.exports = router;
