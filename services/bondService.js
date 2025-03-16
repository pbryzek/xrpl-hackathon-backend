const fs = require("fs").promises;
const path = require("path");
const BONDS_FILE = path.resolve(__dirname, "../data/bonds.json");
const WALLETS_FILE = path.resolve(__dirname, "../data/wallets.json");
const XRPLStaking = require("../services/xrplService");
const PFMU = require("../models/Pfmu");

// Add a New Wallet
async function addWallet(userWalletAddress, publicKey, privateKey, classicAddress, seed) {
  try {
    // Get all wallets
    let wallets = await getAllWallets();

    // Find existing wallet index
    const index = wallets.findIndex(wallet => wallet.userWalletAddress === userWalletAddress);
    if (index !== -1) {
      // ✅ Update existing wallet
      console.log(`✅ Wallet is updating.`);
      wallets[index] = {
        ...wallets[index], // Preserve existing properties
        ...newWalletDict, // Overwrite updated fields
      };
    } else {
      // Create new wallet object
      let newWalletDict = {
        userWalletAddress,
        publicKey,
        privateKey,
        classicAddress,
        seed,
      };
      // 🆕 Add new wallet if no match is found
      wallets.push(newWalletDict);
      console.log(`✅ New wallet added.`);
    }

    // Write updated wallets to file
    await writeWalletsToFile(wallets);

    console.log(`✅ Wallet saved successfully.`);
    return true;
  } catch (error) {
    console.error("❌ Error adding wallet:", error);
    return false;
  }
}
async function getWalletByUserAddress(userWalletAddress) {
  try {
    const data = await fs.readFile(WALLETS_FILE, "utf-8");
    const wallets = JSON.parse(data);
    for (const wallet of wallets) {
      console.log(wallet);
      if (wallet.userWalletAddress == userWalletAddress) {
        return wallet;
      }
    }
  } catch (error) {
    console.error("Error reading JSON file:", error);
    return null;
  }
  return null;
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

// Function to get all bonds from JSON file
async function getAllWallets() {
  try {
    const data = await fs.readFile(WALLETS_FILE, "utf-8");
    return JSON.parse(data);
  } catch (error) {
    console.error("Error reading wallets file:", error);
    return [];
  }
}

// Helper function to write bonds to file
async function writeWalletsToFile(wallets) {
  try {
    await fs.writeFile(WALLETS_FILE, JSON.stringify(wallets, null, 2), "utf-8");
    console.log("Bonds file updated successfully!");
  } catch (error) {
    console.error("Error writing bonds file:", error);
  }
}

async function getBondById(id) {
  try {
    const data = await fs.readFile(BONDS_FILE, "utf-8");
    const bonds = JSON.parse(data);
    for (const bond of bonds) {
      console.log(bond.id);
      if (bond.id == id) {
        return bond;
      }
    }
  } catch (error) {
    console.error("Error reading JSON file:", error);
    return null;
  }
}

// Function to get all bonds from JSON file
async function getAllBonds() {
  try {
    const data = await fs.readFile(BONDS_FILE, "utf-8");
    return JSON.parse(data);
  } catch (error) {
    console.error("Error reading bonds file:", error);
    return [];
  }
}

// Function to get pending bonds
async function getPendingBonds() {
  try {
    const bonds = await getAllBonds();
    let pendingBonds = [];
    for (const bond of bonds) {
      let total_pfmus = 0;
      for (const pfmu of bond.pfmus) {
        total_pfmus += pfmu.amount;
      }
      if (total_pfmus < bond.pfmus_capacity) {
        pendingBonds.push(bond);
      }
    }
    return pendingBonds;
  } catch (error) {
    console.error("Error fetching pending bonds:", error);
    return [];
  }
}

function convertPfmuToXrp(numPfmus) {
  const xrpTotal = numPfmus * XRPLStaking.PFMU_XRP_CONVERSION;
  return xrpTotal;
}

function getPfmuStaked(bond) {
  let pfmusStaked = 0;
  for (pfmu of bond.pfmus) {
    pfmusStaked += pfmu.amount;
  }
  console.log("pfmusStaked " + pfmusStaked);
  return pfmusStaked;
}

function getInvestedTotal(bond) {
  let invested = 0;
  for (investor of bond.investors) {
    invested += investor.amount;
  }
  return invested;
}

// Function to get Active bonds: Active defined when pfmus quantity_total >= pfmus_capacity
async function getActiveBonds() {
  const bonds = await getAllBonds();
  let activeBonds = [];
  for (const bond of bonds) {
    let pfmusStaked = getPfmuStaked(bond);
    if (pfmusStaked >= bond.pfmus_capacity) {
      activeBonds.push(bond);
    }
  }
  return activeBonds;
}

// Open bonds are active bonds that haven't met the financial threshold.
async function getOpenBonds() {
  console.log("getOpenBonds");
  try {
    let activeBonds = await getActiveBonds();
    let openBonds = [];
    for (const bond of activeBonds) {
      console.log("bond", bond);

      let pfmusStaked = getPfmuStaked(bond);
      const xrpTotal = convertPfmuToXrp(pfmusStaked);
      let investedTotal = getInvestedTotal(bond);
      // If the total invested is less than the total XRP value then its open
      if (investedTotal < xrpTotal) {
        openBonds.push(bond);
      }
    }
    return openBonds;
  } catch (error) {
    console.error("Error fetching getOpenBonds:", error);
    return [];
  }
}

// Open bonds are active bonds that haven't met the financial threshold.
async function getClosedBonds() {
  try {
    let activeBonds = await getActiveBonds();
    let closedBonds = [];
    for (const bond of activeBonds) {
      let pfmusStaked = getPfmuStaked(bond);
      const xrpTotal = convertPfmuToXrp(pfmusStaked);
      let investedTotal = getInvestedTotal(bond);
      // If the total invested is greater than or equal the total XRP value then its closed
      if (investedTotal >= xrpTotal) {
        closedBonds.push(bond);
      }
    }
    return closedBonds;
  } catch (error) {
    console.error("Error fetching getClosedBonds:", error);
    return [];
  }
}

// Helper function to read existing bonds
const readBondsFromFile = async () => {
  try {
    if (fileExists(BONDS_FILE)) {
      const data = await fs.readFile(BONDS_FILE, "utf8");
      return JSON.parse(data) || [];
    } else {
      return [];
    }
  } catch (error) {
    console.error("Error reading bonds file:", error);
    return [];
  }
};

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

// ✅ Auto-Increment and Add a New Bond
async function addBond(newBond) {
  try {
    // Get all bonds
    const bonds = await getAllBonds();

    // Get the last bond's ID and increment it (fallback to 1 if no bonds exist)
    const lastId = bonds.length > 0 ? Math.max(...bonds.map(bond => bond.id)) : 0;
    const newId = lastId + 1;

    // Assign the new ID to the bond
    const bondWithId = { id: newId, ...newBond };

    // Add to the array and write to file
    bonds.push(bondWithId);
    await writeBondsToFile(bonds);

    console.log(`✅ Bond added successfully with ID: ${newId}`);
    return bondWithId;
  } catch (error) {
    console.error("❌ Error adding bond:", error);
    return null;
  }
}

// Helper function to write bonds to file
async function writeBondsToFile(bonds) {
  try {
    await fs.writeFile(BONDS_FILE, JSON.stringify(bonds, null, 2), "utf-8");
    console.log("Bonds file updated successfully!");
  } catch (error) {
    console.error("Error writing bonds file:", error);
  }
}

// Function to update bond in the file
async function updateBondsFile(updatedBond) {
  try {
    const data = await fs.readFile(BONDS_FILE, "utf-8");
    let bonds = JSON.parse(data);

    // Replace the bond in the array
    bonds = bonds.map(bond => (bond.id === updatedBond.id ? updatedBond : bond));

    // Write back the updated list
    await fs.writeFile(BONDS_FILE, JSON.stringify(bonds, null, 2));
  } catch (error) {
    console.error("Error writing to JSON file:", error);
  }
}

async function stakePFMU(walletSecret, amount, project, issuanceDate, expirationDate, bond) {
  let total_amount = 0;
  for (const bond_pfmu of bond.pfmus) {
    total_amount += bond_pfmu.amount;
  }

  if (total_amount >= bond.pfmus_capacity) {
    console.error("Error unable to stake: as this would exceed the PFMU capacity");
    return false;
  }
  const pfmu = new PFMU(amount, project, issuanceDate, expirationDate);
  const staking = new XRPLStaking();
  let stakeRes = staking.stakePFMU(walletSecret, pfmu);
  if (!stakeRes) {
    return false;
  }

  bond.pfmus.push(pfmu);
  bond.pfmus_staked += pfmu.amount;

  await updateBondsFile(bond);
  return true;
}

// Export the functions
module.exports = {
  updateBondsFile,
  writeBondsToFile,
  readBondsFromFile,
  getBondById,
  getPendingBonds,
  getAllBonds,
  getClosedBonds,
  addBond,
  stakePFMU,
  getActiveBonds,
  getOpenBonds,
  getClosedBonds,
  addWallet,
  getWalletByUserAddress,
  getWalletByClassicAddress,
};
