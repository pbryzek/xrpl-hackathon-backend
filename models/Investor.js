class Investor {
  constructor(name, amount, bondId, walletAddress) {
    this.name = name;
    this.amount = amount;
    this.bondId = bondId;
    this.walletAddress = walletAddress;
    this.timestamp = new Date().toISOString();
  }

  getDetails() {
    return {
      name: this.name,
      amount: this.amount,
      bondId: this.bondId,
      walletAddress: this.walletAddress,
      timestamp: this.timestamp,
    };
  }
}
module.exports = Investor;
