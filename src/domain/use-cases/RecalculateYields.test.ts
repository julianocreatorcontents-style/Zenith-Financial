import { describe, it, expect } from 'vitest';
import { isErr } from '../shared/Result';
import { Money } from '../money/Money';
import { Investment } from '../investment/Investment';
import { RecalculateYields } from './RecalculateYields';
import type { YieldPolicy } from '../yield/YieldPolicy';
import type { Indexer } from '../yield/YieldPolicy';
import type { ClockPort } from '../ports/ClockPort';
import type { MarketRatePort } from '../ports/MarketRatePort';
import type { InvestmentRepoPort } from '../ports/InvestmentRepoPort';

class FakeClock implements ClockPort {
  constructor(private readonly fixed: Date) {}
  today(): Date { return this.fixed; }
}

class FakeMarket implements MarketRatePort {
  constructor(private readonly rates: Record<string, number>) {}
  async getAnnualRate(indexer: Indexer, _date: Date): Promise<number> {
    const r = this.rates[indexer];
    if (r === undefined) throw new Error(`Sem taxa para ${indexer}`);
    return r;
  }
}

class FakeRepo implements InvestmentRepoPort {
  constructor(private readonly investments: Investment[], private readonly fail = false) {}
  async findByUser(_userId: string): Promise<Investment[]> {
    if (this.fail) throw new Error('repo down');
    return this.investments;
  }
}

const payPolicy = (): YieldPolicy => ({
  indexer: 'CDI',
  rateType: 'PERCENT_INDEXER',
  dayCountConvention: 'CALENDAR_DAYS_365',
  rateTiers: [
    { upTo: Money.fromBRL(5000), baseRateValue: 110, bonusRateValue: 29 },
    { upTo: null, baseRateValue: 80, bonusRateValue: 0 },
  ],
});

const make99Pay = (startDate: Date): Investment =>
  Investment.create({
    id: 'inv-99',
    name: '99Pay',
    principal: Money.fromBRL(5000),
    currentBalance: Money.fromBRL(5069.81),
    startDate,
    policy: payPolicy(),
    taxDisplayMode: 'GROSS',
  });

const CDI_1365 = { CDI: 13.65 };

describe('RecalculateYields — casos básicos', () => {
  it('lista vazia retorna ok([])', async () => {
    const uc = new RecalculateYields(
      new FakeRepo([]),
      new FakeMarket(CDI_1365),
      new FakeClock(new Date('2026-10-24')),
    );
    const result = await uc.execute('user-1');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual([]);
  });

  it('99Pay R$ 5069,81 → dailyGross ≈ R$ 2,40', async () => {
    const inv = make99Pay(new Date('2026-01-15'));
    const uc = new RecalculateYields(
      new FakeRepo([inv]),
      new FakeMarket(CDI_1365),
      new FakeClock(new Date('2026-10-24')),
    );
    const result = await uc.execute('user-1');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value[0]!.dailyGross.toBRL()).toBeCloseTo(2.40, 2);
  });
});

describe('RecalculateYields — IR e IOF', () => {
  it('investimento 15 dias: IR 22.5% + IOF 50% sobre gross yield', async () => {
    const inv = Investment.create({
      id: 'inv-15',
      name: 'CDB curto',
      principal: Money.fromBRL(5000),
      currentBalance: Money.fromBRL(5069.81),
      startDate: new Date('2026-04-01'),
      policy: payPolicy(),
      taxDisplayMode: 'GROSS',
    });
    const uc = new RecalculateYields(
      new FakeRepo([inv]),
      new FakeMarket(CDI_1365),
      new FakeClock(new Date('2026-04-16')),
    );
    const result = await uc.execute('user-1');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const p = result.value[0]!;
    expect(p.daysInvested).toBe(15);
    expect(p.cumulativeGrossYield.toBRL()).toBeCloseTo(69.81, 2);
    expect(p.irProvision.toBRL()).toBeCloseTo(15.71, 1);
    expect(p.iofProvision.toBRL()).toBeCloseTo(34.91, 1);
  });

  it('investimento 200 dias: IR 20% e IOF 0', async () => {
    const inv = Investment.create({
      id: 'inv-200',
      name: 'CDB médio',
      principal: Money.fromBRL(5000),
      currentBalance: Money.fromBRL(5100),
      startDate: new Date('2026-01-01'),
      policy: payPolicy(),
      taxDisplayMode: 'GROSS',
    });
    const uc = new RecalculateYields(
      new FakeRepo([inv]),
      new FakeMarket(CDI_1365),
      new FakeClock(new Date('2026-07-20')),
    );
    const result = await uc.execute('user-1');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const p = result.value[0]!;
    expect(p.irProvision.toBRL()).toBeCloseTo(20.0, 2);
    expect(p.iofProvision.toBRL()).toBeCloseTo(0, 2);
  });

  it('netRedemption = balance - IR - IOF', async () => {
    const inv = make99Pay(new Date('2026-01-15'));
    const uc = new RecalculateYields(
      new FakeRepo([inv]),
      new FakeMarket(CDI_1365),
      new FakeClock(new Date('2026-10-24')),
    );
    const result = await uc.execute('user-1');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const p = result.value[0]!;
    const expected = p.currentBalance.subtract(p.irProvision).subtract(p.iofProvision);
    expect(p.netRedemption.equals(expected)).toBe(true);
  });
});

describe('RecalculateYields — edge cases', () => {
  it('daysInvested = 0 → IR = 0, IOF = 0, netRedemption = currentBalance', async () => {
    const inv = make99Pay(new Date('2026-10-24'));
    const uc = new RecalculateYields(
      new FakeRepo([inv]),
      new FakeMarket(CDI_1365),
      new FakeClock(new Date('2026-10-24')),
    );
    const result = await uc.execute('user-1');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const p = result.value[0]!;
    expect(p.irProvision.toBRL()).toBeCloseTo(0, 2);
    expect(p.iofProvision.toBRL()).toBeCloseTo(0, 2);
    expect(p.netRedemption.equals(p.currentBalance)).toBe(true);
  });

  it('perda (balance < principal) → IR = 0, IOF = 0', async () => {
    const inv = Investment.create({
      id: 'inv-loss',
      name: 'Perda',
      principal: Money.fromBRL(5000),
      currentBalance: Money.fromBRL(4900),
      startDate: new Date('2026-01-01'),
      policy: payPolicy(),
      taxDisplayMode: 'GROSS',
    });
    const uc = new RecalculateYields(
      new FakeRepo([inv]),
      new FakeMarket(CDI_1365),
      new FakeClock(new Date('2026-10-24')),
    );
    const result = await uc.execute('user-1');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const p = result.value[0]!;
    expect(p.irProvision.toBRL()).toBeCloseTo(0, 2);
    expect(p.iofProvision.toBRL()).toBeCloseTo(0, 2);
  });

  it('FIXED não chama MarketRatePort (taxa 0 é passada)', async () => {
    const fixedPolicy: YieldPolicy = {
      indexer: 'PRE',
      rateType: 'FIXED',
      dayCountConvention: 'BUSINESS_DAYS_252',
      rateTiers: [{ upTo: null, baseRateValue: 11.5, bonusRateValue: 0 }],
    };
    const inv = Investment.create({
      id: 'inv-fixed',
      name: 'Prefixado',
      principal: Money.fromBRL(1000),
      currentBalance: Money.fromBRL(1000),
      startDate: new Date('2026-01-01'),
      policy: fixedPolicy,
      taxDisplayMode: 'NET',
    });
    const emptyMarket: MarketRatePort = {
      async getAnnualRate() { throw new Error('não deveria ser chamado'); },
    };
    const uc = new RecalculateYields(
      new FakeRepo([inv]),
      emptyMarket,
      new FakeClock(new Date('2026-10-24')),
    );
    const result = await uc.execute('user-1');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value[0]!.dailyGross.toBRL()).toBeGreaterThan(0);
  });
});

describe('RecalculateYields — projeções', () => {
  it('30 < 60 < 90 dias, todos > saldo atual', async () => {
    const inv = make99Pay(new Date('2026-01-15'));
    const uc = new RecalculateYields(
      new FakeRepo([inv]),
      new FakeMarket(CDI_1365),
      new FakeClock(new Date('2026-10-24')),
    );
    const result = await uc.execute('user-1');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const p = result.value[0]!;
    expect(p.projected30Days.isGreaterThan(p.currentBalance)).toBe(true);
    expect(p.projected60Days.isGreaterThan(p.projected30Days)).toBe(true);
    expect(p.projected90Days.isGreaterThan(p.projected60Days)).toBe(true);
  });
});

describe('RecalculateYields — erros', () => {
  it('market falha → Result.err', async () => {
    const inv = make99Pay(new Date('2026-01-15'));
    const badMarket: MarketRatePort = {
      async getAnnualRate() { throw new Error('BCB offline'); },
    };
    const uc = new RecalculateYields(
      new FakeRepo([inv]),
      badMarket,
      new FakeClock(new Date('2026-10-24')),
    );
    const result = await uc.execute('user-1');
    expect(result.ok).toBe(false);
    if (isErr(result)) expect(result.error.message).toContain('BCB');
  });

  it('repo falha → Result.err', async () => {
    const uc = new RecalculateYields(
      new FakeRepo([], true),
      new FakeMarket(CDI_1365),
      new FakeClock(new Date('2026-10-24')),
    );
    const result = await uc.execute('user-1');
    expect(result.ok).toBe(false);
    if (isErr(result)) expect(result.error.message).toContain('repo');
  });
});
