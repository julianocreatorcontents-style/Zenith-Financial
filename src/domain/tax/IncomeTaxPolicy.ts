import { Money } from "../money/Money";

export class IncomeTaxPolicy {
  static rateFor(daysInvested: number): number {
    if (daysInvested < 1) {
      throw new Error("daysInvested must be at least 1");
    }

    if (daysInvested <= 180) {
      return 0.225;
    }

    if (daysInvested <= 360) {
      return 0.2;
    }

    if (daysInvested <= 720) {
      return 0.175;
    }

    return 0.15;
  }

  static calculate(grossYield: Money, daysInvested: number): Money {
    return grossYield.multiply(IncomeTaxPolicy.rateFor(daysInvested));
  }
}
