/**
 * Sprint 4a — T5 (R6): importação de planilha e `assetId`.
 *
 * Decisão D2 = (D): a importação continua aceitando linhas sem conta, porque a UI de
 * destino exigiria alterar `useAppNavigation.ts` / `IngestionModals.tsx` (fora do
 * escopo autorizado). O débito fica registrado como R6-UI.
 *
 * O que este arquivo cobre:
 *   - linha sem assetId continua aceita (não-regressão do CSV/XLSX);
 *   - `mapSpreadsheetRow(row, { assetId })` já herda a conta quando a UI fornecer;
 *   - `assetId` presente porém vazio/inválido é rejeitado pelo schema de importação.
 */

import { describe, it, expect } from 'vitest';
import { mapSpreadsheetRow } from './spreadsheetParser';
import {
  ValidationError,
  validateTransactionForWrite,
  validateTransactionImportRow,
} from './validations';

const RAW_ROW = {
  Data: '13/11/2026',
  Descrição: 'Mercado',
  Valor: '120,50',
  Tipo: 'saida',
  Categoria: 'Alimentação',
};

describe('T5 — R6: importação sem assetId (decisão D2 = D)', () => {
  it('T5.3 — linha sem assetId é aceita e o doc fica sem conta (comportamento atual)', () => {
    const mapped = mapSpreadsheetRow(RAW_ROW);

    expect(mapped.assetId).toBeUndefined();
    expect(() => validateTransactionImportRow(mapped)).not.toThrow();

    // O schema completo de write continua rejeitando (exceção documentada):
    // é exatamente o gap que R6-UI fecha quando a conta for informada na importação.
    expect(() => validateTransactionForWrite(mapped)).toThrow(ValidationError);
  });

  it('T5.3b — assetId vazio na planilha não vira string vazia', () => {
    const mapped = mapSpreadsheetRow(RAW_ROW, { assetId: '   ' });
    expect(mapped.assetId).toBeUndefined();
    expect(() => validateTransactionImportRow(mapped)).not.toThrow();
  });

  it('T5.1 — quando a UI fornecer a conta, todas as linhas herdam o assetId', () => {
    const mapped = mapSpreadsheetRow(RAW_ROW, { assetId: 'asset-abc' });

    expect(mapped.assetId).toBe('asset-abc');
    expect(() => validateTransactionImportRow(mapped)).not.toThrow();
    // Com assetId, a linha passaria a satisfazer o schema completo de write.
    expect(() => validateTransactionForWrite(mapped)).not.toThrow();
  });

  it('T5.2 — assetId presente mas inválido (string vazia) é rejeitado pelo schema', () => {
    expect(() =>
      validateTransactionImportRow({
        label: 'Mercado',
        value: 10,
        type: 'out',
        assetId: '',
      })
    ).toThrow(ValidationError);
  });

  it('T5.4 — data da planilha também passa pelo validador do domínio (R1)', () => {
    expect(() =>
      validateTransactionImportRow({
        label: 'Mercado',
        value: 10,
        type: 'out',
        date: '2026-13-45',
      })
    ).toThrow(ValidationError);

    expect(() =>
      validateTransactionImportRow({
        label: 'Mercado',
        value: 10,
        type: 'out',
        date: '2026-11-13',
      })
    ).not.toThrow();
  });

  it('T5.5 — campos mapeados continuam normalizados', () => {
    const mapped = mapSpreadsheetRow(RAW_ROW);
    expect(mapped.label).toBe('Mercado');
    expect(mapped.value).toBe(120.5);
    expect(mapped.type).toBe('out');
    expect(mapped.date).toBeInstanceOf(Date);
    expect(mapped.categoria_primaria).toBe('Alimentação');
  });
});
