import { Money } from "../money/Money";

const IOF_RATES: readonly number[] = [
  0.96, 0.93, 0.9, 0.86, 0.83,
  0.8, 0.76, 0.73, 0.7, 0.66,
  0.63, 0.6, 0.56, 0.53, 0.5,
  0.46, 0.43, 0.4, 0.36, 0.33,
  0.3, 0.26, 0.23, 0.2, 0.16,
  0.13, 0.1, 0.06, 0.03,
];

export class IofPolicy {
  static rateFor(daysInvested: number): number {
    if (daysInvested < 1) {
      throw new Error("daysInvested must be at least 1");
    }

    return IOF_RATES[daysInvested - 1] ?? 0;
  }

  static calculate(grossYield: Money, daysInvested: number): Money {
    return grossYield.multiply(IofPolicy.rateFor(daysInvested));
  }
}
