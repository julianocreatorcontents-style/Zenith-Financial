import { describe, it, expect, vi } from 'vitest';
import { BcbMarketRateAdapter } from './BcbMarketRateAdapter';
import type { BcbFetcher } from './BcbMarketRateAdapter';

const okJson = (body: unknown): Awaited<ReturnType<BcbFetcher>> => ({
  ok: true,
  status: 200,
  json: async () => body,
});

const errorRes = (status: number): Awaited<ReturnType<BcbFetcher>> => ({
  ok: false,
  status,
  json: async () => ({}),
});

describe('BcbMarketRateAdapter — validações', () => {
  it('rejeita PRE com erro claro', async () => {
    const fetcher = vi.fn<BcbFetcher>();
    const adapter = new BcbMarketRateAdapter(fetcher);
    await expect(
      adapter.getAnnualRate('PRE', new Date('2026-01-15')),
    ).rejects.toThrow(/PRE/);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('rejeita Date inválido', async () => {
    const fetcher = vi.fn<BcbFetcher>();
    const adapter = new BcbMarketRateAdapter(fetcher);
    await expect(
      adapter.getAnnualRate('CDI', new Date('invalid')),
    ).rejects.toThrow();
  });
});

describe('BcbMarketRateAdapter — URL do BCB', () => {
  it('CDI usa série 12', async () => {
    const fetcher = vi.fn<BcbFetcher>().mockResolvedValue(
      okJson([{ data: '15/01/2026', valor: '0.052765' }]),
    );
    const adapter = new BcbMarketRateAdapter(fetcher);
    await adapter.getAnnualRate('CDI', new Date('2026-01-15'));
    const url = fetcher.mock.calls[0]![0];
    expect(url).toContain('bcdata.sgs.12');
  });

  it('SELIC usa série 11', async () => {
    const fetcher = vi.fn<BcbFetcher>().mockResolvedValue(
      okJson([{ data: '15/01/2026', valor: '0.052765' }]),
    );
    const adapter = new BcbMarketRateAdapter(fetcher);
    await adapter.getAnnualRate('SELIC', new Date('2026-01-15'));
    const url = fetcher.mock.calls[0]![0];
    expect(url).toContain('bcdata.sgs.11');
  });

  it('URL contém janela de 7 dias em formato DD/MM/YYYY', async () => {
    const fetcher = vi.fn<BcbFetcher>().mockResolvedValue(
      okJson([{ data: '15/01/2026', valor: '0.052765' }]),
    );
    const adapter = new BcbMarketRateAdapter(fetcher);
    await adapter.getAnnualRate('CDI', new Date('2026-01-15'));
    const url = fetcher.mock.calls[0]![0];
    expect(url).toContain('dataInicial=08/01/2026');
    expect(url).toContain('dataFinal=15/01/2026');
  });
});

describe('BcbMarketRateAdapter — conversão diária → anual', () => {
  it('CDI 0.052765%/dia → ≈ 14.18% a.a. (base 252)', async () => {
    const fetcher = vi.fn<BcbFetcher>().mockResolvedValue(
      okJson([{ data: '15/01/2026', valor: '0.052765' }]),
    );
    const adapter = new BcbMarketRateAdapter(fetcher);
    const rate = await adapter.getAnnualRate('CDI', new Date('2026-01-15'));
    expect(rate).toBeCloseTo(14.18, 1);
  });

  it('pega o último entry quando o BCB retorna vários dias', async () => {
    const fetcher = vi.fn<BcbFetcher>().mockResolvedValue(
      okJson([
        { data: '10/01/2026', valor: '0.050000' },
        { data: '13/01/2026', valor: '0.050500' },
        { data: '14/01/2026', valor: '0.052765' },
      ]),
    );
    const adapter = new BcbMarketRateAdapter(fetcher);
    const rate = await adapter.getAnnualRate('CDI', new Date('2026-01-15'));
    expect(rate).toBeCloseTo(14.18, 1);
  });
});

describe('BcbMarketRateAdapter — cache', () => {
  it('segunda chamada para a mesma data não faz nova requisição', async () => {
    const fetcher = vi.fn<BcbFetcher>().mockResolvedValue(
      okJson([{ data: '15/01/2026', valor: '0.052765' }]),
    );
    const adapter = new BcbMarketRateAdapter(fetcher);
    await adapter.getAnnualRate('CDI', new Date('2026-01-15'));
    await adapter.getAnnualRate('CDI', new Date('2026-01-15'));
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('datas diferentes fazem chamadas separadas', async () => {
    const fetcher = vi.fn<BcbFetcher>().mockResolvedValue(
      okJson([{ data: '15/01/2026', valor: '0.052765' }]),
    );
    const adapter = new BcbMarketRateAdapter(fetcher);
    await adapter.getAnnualRate('CDI', new Date('2026-01-15'));
    await adapter.getAnnualRate('CDI', new Date('2026-01-16'));
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('indexers diferentes não compartilham cache', async () => {
    const fetcher = vi.fn<BcbFetcher>().mockResolvedValue(
      okJson([{ data: '15/01/2026', valor: '0.052765' }]),
    );
    const adapter = new BcbMarketRateAdapter(fetcher);
    await adapter.getAnnualRate('CDI', new Date('2026-01-15'));
    await adapter.getAnnualRate('SELIC', new Date('2026-01-15'));
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});

describe('BcbMarketRateAdapter — erros', () => {
  it('HTTP 500 lança erro', async () => {
    const fetcher = vi.fn<BcbFetcher>().mockResolvedValue(errorRes(500));
    const adapter = new BcbMarketRateAdapter(fetcher);
    await expect(
      adapter.getAnnualRate('CDI', new Date('2026-01-15')),
    ).rejects.toThrow(/HTTP 500/);
  });

  it('resposta vazia (fim de semana sem fallback) lança erro', async () => {
    const fetcher = vi.fn<BcbFetcher>().mockResolvedValue(okJson([]));
    const adapter = new BcbMarketRateAdapter(fetcher);
    await expect(
      adapter.getAnnualRate('CDI', new Date('2026-01-15')),
    ).rejects.toThrow(/não retornou dados/);
  });

  it('valor não numérico lança erro', async () => {
    const fetcher = vi.fn<BcbFetcher>().mockResolvedValue(
      okJson([{ data: '15/01/2026', valor: 'abc' }]),
    );
    const adapter = new BcbMarketRateAdapter(fetcher);
    await expect(
      adapter.getAnnualRate('CDI', new Date('2026-01-15')),
    ).rejects.toThrow(/não numérico/);
  });

  it('erro de rede (fetcher lança) propaga com contexto', async () => {
    const fetcher = vi.fn<BcbFetcher>().mockRejectedValue(new Error('ECONNREFUSED'));
    const adapter = new BcbMarketRateAdapter(fetcher);
    await expect(
      adapter.getAnnualRate('CDI', new Date('2026-01-15')),
    ).rejects.toThrow(/BCB request falhou.*ECONNREFUSED/);
  });
});
