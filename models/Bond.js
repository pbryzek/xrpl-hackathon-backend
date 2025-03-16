class Bond {
  static MATURITY_LENGTH = 6;
  static NUM_PFMUS = 0.1;
  constructor(name, issuer, amount, interestRate, description) {
    this.pfmus_capacity = Bond.NUM_PFMUS;
    this.pfmus_staked = 0;
    this.pfmus = [];
    this.name = name;
    this.issuer = issuer;
    this.interestRate = interestRate;
    this.amount = amount;
    this.createdDate = new Date();
    this.maturityDate = this.createdDate.setMonth(this.createdDate.getMonth() + Bond.MATURITY_LENGTH);
    this.description = description;
    this.investors = [];
  }

  getPfmuAmount() {
    let totalAmount = 0;
    for (let pfmu in this.pfmus) {
      totalAmount += pfmu.amount;
    }
    return totalAmount;
  }

  getDetails() {
    return {
      name: this.name,
      issuer: this.issuer,
      amount: this.amount,
      interestRate: this.interestRate,
      createdDate: this.createdDate,
      maturityDate: this.maturityDate,
      description: this.description,
      investors: this.investors,
    };
  }
}

module.exports = Bond;
