export class Rate {
  private readonly annualBps: number;

  private constructor(annualBps: number) {
    if (!Number.isInteger(annualBps)) {
      throw new Error("Rate.annualBps must be an integer");
    }
    this.annualBps = annualBps;
  }

  static fromPercent(percent: number): Rate {
    return new Rate(Math.round(percent * 100));
  }

  toPercent(): number {
    return this.annualBps / 100;
  }

  toDecimal(): number {
    return this.annualBps / 10000;
  }

  multiply(factor: number): Rate {
    return new Rate(Math.round(this.annualBps * factor));
  }
}
