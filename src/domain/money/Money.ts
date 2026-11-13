/**
 * Representação monetária imutável baseada em centavos inteiros.
 *
 * # Convenção de Aritmética Monetária — Sprint 3 (Decisão B)
 *
 * O Zenith mantém DUAS convenções de representação monetária:
 *
 * | Camada                        | Convenção           | Notas                              |
 * |-------------------------------|---------------------|------------------------------------|
 * | domain/money/Money.ts (aqui)  | centavos inteiros   | Usado em domínio puro (tipo opaco) |
 * | lib/finance/calculators.ts    | number + roundCurrency | Cálculos de dashboard/projeção  |
 * | hooks/recalculateBalances     | number + roundCurrency | Persistência em Firestore       |
 * | lib/adapters/assetBalance.ts  | number + Number()   | Saldos de ativos                   |
 *
 * **Regra obrigatória**: Não misturar Money e number em um mesmo fluxo de persistência.
 * Conversão legítima: Money.fromBRL(number) na entrada, .toBRL() na saída.
 *
 * Para uniformização completa (migrar todos para Money): Sprint 4+ (decisão pendente).
 * Risco atual: teórico (listas longas de floats). Sem divergência reproduzível (ver T4.1).
 */
export class Money {
  private readonly cents: number;

  private constructor(cents: number) {
    if (!Number.isInteger(cents)) {
      throw new Error("Money.cents must be an integer");
    }
    this.cents = cents;
  }

  static fromBRL(value: number): Money {
    return new Money(Math.round(value * 100));
  }

  static zero(): Money {
    return new Money(0);
  }

  add(other: Money): Money {
    return new Money(this.cents + other.cents);
  }

  subtract(other: Money): Money {
    return new Money(this.cents - other.cents);
  }

  multiply(factor: number): Money {
    return new Money(Math.round(this.cents * factor));
  }

  toBRL(): number {
    return this.cents / 100;
  }

  isGreaterThan(other: Money): boolean {
    return this.cents > other.cents;
  }

  equals(other: Money): boolean {
    return this.cents === other.cents;
  }

  isNegative(): boolean {
    return this.cents < 0;
  }
}
