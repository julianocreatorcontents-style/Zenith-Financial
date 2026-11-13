import { z } from 'zod';
import { parseTransactionDate } from './finance/parsers';

/**
 * @Agente01 - Arquiteto/DevSecOps
 * Esquema de Validação para a entidade Transação (Transaction)
 * Garante integridade de dados antes da persistência no Firestore.
 *
 * Sprint 3 — T2 (A4+B2): Validação obrigatória em todos os writes de transactions.
 * Todos os pontos de escrita devem chamar validateTransactionForWrite() antes do writeBatch/setDoc.
 * Erros retornam ValidationError tipado — o caller decide como exibir na UI.
 *
 * Sprint 4a — R1: `date` deixou de ser `z.any()`. Decisão D1 = (A) com reutilização
 * do parser do domínio (`parseTransactionDate`), e não `z.coerce.date()`:
 * `z.coerce.date()` chama `new Date(value)` e NÃO entende Firestore Timestamp
 * (`{ toDate() }` / `{ seconds }`), que é justamente o formato em que as datas
 * chegam do Firestore em `getTransactionIssues()`. O parser do domínio aceita
 * Date, Timestamp, epoch (s/ms), ISO e DD/MM/AAAA, e normaliza tudo para Date.
 */

/**
 * Campo `date` de Transaction: valida via parser do domínio e normaliza para Date.
 * `undefined`/`null`/string inválida são rejeitados com mensagem no campo `date`.
 *
 * Nota de diagnóstico (Sprint 4a): `parseTransactionDate` faz *rollover* de datas de
 * calendário impossíveis — `'2026-13-45'` vira 2027-02-14 via `new Date(2026, 12, 45)`.
 * Como `src/lib/finance/parsers.ts` está fora do escopo autorizado deste sprint, a
 * checagem estrita de calendário é feita aqui (`hasValidCalendarDate`) e o
 * comportamento do parser fica registrado como débito R1-PARSER.
 */
const CALENDAR_PREFIX_PATTERNS = [
  /^(\d{4})-(\d{1,2})-(\d{1,2})(?!\d)/, // ISO: YYYY-MM-DD (com ou sem hora)
  /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})(?!\d)/, // BR: DD/MM/AAAA
];

function hasValidCalendarDate(value: unknown): boolean {
  if (typeof value !== 'string') return true;
  const raw = value.trim();

  for (const pattern of CALENDAR_PREFIX_PATTERNS) {
    const match = pattern.exec(raw);
    if (!match) continue;

    const isIso = pattern === CALENDAR_PREFIX_PATTERNS[0];
    const year = Number(isIso ? match[1] : match[3]);
    const month = Number(match[2]); // ISO: YYYY-[MM]-DD | BR: DD-[MM]-YYYY
    const day = Number(isIso ? match[3] : match[1]);
    const normalizedYear = year < 100 ? year + 2000 : year;

    if (month < 1 || month > 12 || day < 1 || day > 31) return false;

    const date = new Date(normalizedYear, month - 1, day);
    return (
      date.getFullYear() === normalizedYear &&
      date.getMonth() === month - 1 &&
      date.getDate() === day
    );
  }

  // Outros formatos: delega integralmente ao parser do domínio.
  return true;
}

export const TransactionDateSchema = z
  .custom<Date>(
    (value) => parseTransactionDate(value) !== null && hasValidCalendarDate(value),
    {
      message:
        'Data inválida: use ISO 8601 (2026-11-13), DD/MM/AAAA, Date ou Timestamp do Firestore',
    }
  )
  .transform((value) => parseTransactionDate(value) as Date);

/**
 * Erro tipado de validação. Retornado por validateTransactionForWrite.
 * Nunca é um throw genérico — permite ao caller inspecionar os campos com problema.
 */
export class ValidationError extends Error {
  constructor(
    public readonly issues: { path: (string | number | symbol)[]; message: string }[],
    message = 'Payload inválido para escrita'
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Valida um payload de transação antes de qualquer write no Firestore.
 *
 * Decisão Sprint 3-T2: (A) schema único aplicado em todos os writes de transactions,
 * com uma exceção documentada: a importação de planilha (ver TransactionImportRowSchema).
 *
 * Cobertura (Sprint 3 + Sprint 4a):
 * - addTransaction             ✅ validateTransactionForWrite
 * - updateTransaction (normal) ✅ validateTransactionForWrite
 * - updateTransaction (par)    ✅ assertValidTransactionPayloads (atômico, R4)
 * - confirmPendingTransaction  ✅ TransactionSchema.parse (mesmo schema)
 * - addTransfer (2 legs)       ✅ validateTransactionForWrite por leg
 * - handleFileUpload (CSV)     ✅ validateTransactionImportRow (exceção documentada; R6-UI pendente)
 * - moveToTrash                ✅ não valida por design (move doc existente, R5)
 * - restoreFromTrash           ✅ não bloqueia; avisa se o doc é legado inválido (R5-A)
 * - useTransactionsCron        📋 aceita doc legado com warning (fora do escopo do 4a)
 *
 * @returns o payload normalizado pelo schema
 * @throws {ValidationError} se o payload violar o schema
 */
export function validateTransactionForWrite(
  payload: Record<string, unknown>
): Transaction {
  const result = TransactionSchema.safeParse(payload);
  if (!result.success) {
    throw new ValidationError(
      result.error.issues.map((i) => ({ path: i.path, message: i.message })),
      `Payload inválido: ${result.error.issues[0]?.message ?? 'schema violation'}`
    );
  }
  return result.data;
}

/**
 * Retorna as issues de validação de um payload de transação, ou `null` se for válido.
 * Usado em código de diagnóstico (ex.: aviso de doc legado no recálculo de saldos)
 * onde rejeitar o write não é desejado.
 */
export function getTransactionIssues(
  payload: unknown
): { path: (string | number | symbol)[]; message: string }[] | null {
  const result = TransactionSchema.safeParse(payload);
  if (result.success) return null;
  return result.error.issues.map((i) => ({ path: i.path, message: i.message }));
}

/**
 * Valida um conjunto de payloads como operação ATÔMICA (ex.: as duas pernas de uma
 * transferência). Valida todos antes de lançar: ou todos passam, ou a operação inteira
 * é rejeitada com as issues de todas as pernas (path prefixado pelo índice da perna).
 *
 * Sprint 4a — R4: usado em `updateTransaction` (branch de transferência), que monta
 * payload novo para as duas pernas. Chamar isto ANTES do writeBatch garante que
 * nenhuma perna é atualizada quando a outra é inválida.
 *
 * @throws {ValidationError} se qualquer payload violar o schema
 */
export function assertValidTransactionPayloads(
  payloads: Record<string, unknown>[],
  message = 'Payload inválido na operação atômica'
): void {
  const issues: { path: (string | number | symbol)[]; message: string }[] = [];

  payloads.forEach((payload, index) => {
    const result = TransactionSchema.safeParse(payload);
    if (result.success) return;
    for (const issue of result.error.issues) {
      issues.push({
        path: [index, ...issue.path],
        message: `[perna ${index + 1}] ${issue.message}`,
      });
    }
  });

  if (issues.length > 0) {
    throw new ValidationError(issues, `${message}: ${issues[0]?.message ?? 'schema violation'}`);
  }
}

/**
 * Schema reduzido para linhas de planilha importadas.
 *
 * Justificativa (exceção documentada à decisão A): `mapSpreadsheetRow()` não produz
 * `assetId` — o payload de importação nunca satisfaz a regra `assetId` obrigatório
 * para type in/out do TransactionSchema. Aplicar o schema completo aqui rejeitaria
 * 100% das linhas e quebraria a importação (regressão identificada no diagnóstico).
 * Este schema valida apenas o que o fluxo realmente fornece.
 */
export const TransactionImportRowSchema = z.object({
  label: z.string().min(1, 'O título é obrigatório').max(100, 'Título muito longo'),
  value: z.number().positive('O valor deve ser sempre um número positivo'),
  type: z.enum(['in', 'out', 'yield']),
  date: TransactionDateSchema.optional(),
  assetId: z.string().min(1, 'assetId vazio').optional(),
  categoria_primaria: z.string().max(50, 'Categoria muito longa').optional(),
  etiqueta_personalizada: z.string().max(100, 'Etiqueta muito longa').optional(),
  metodo_origem: z.string().max(50, 'Método de origem muito longo').optional(),
});

/**
 * Valida uma linha de planilha antes de gravá-la em `transactions`.
 * @throws {ValidationError} se a linha violar o schema de importação
 */
export function validateTransactionImportRow(payload: unknown): void {
  const result = TransactionImportRowSchema.safeParse(payload);
  if (!result.success) {
    throw new ValidationError(
      result.error.issues.map((i) => ({ path: i.path, message: i.message })),
      `Linha de planilha inválida: ${result.error.issues[0]?.message ?? 'schema violation'}`
    );
  }
}

export const TransactionSchema = z.object({
  id: z.string().optional(),
  label: z.string().min(1, "O título é obrigatório").max(100, "Título muito longo"),
  value: z.number().positive("O valor deve ser sempre um número positivo"),
  type: z.enum(['in', 'out', 'yield']),
  date: TransactionDateSchema,
  uid: z.string().min(1, "UID do usuário é obrigatório").optional(),
  assetId: z.string().optional(),
  applied: z.boolean().optional(),
  isRecurring: z.boolean().optional(),
  durationMonths: z.number().nullable().optional(),
  partialBalance: z.number().optional(),
  categoria_primaria: z.string().max(50, "Categoria muito longa").optional(),
  etiqueta_personalizada: z.string().max(100, "Etiqueta muito longa").optional(),
  metodo_origem: z.string().max(50, "Método de origem muito longo").optional(),
  status: z.enum(['Confirmado', 'Futuro']).optional(),
  transferId: z.string().optional(),
  transferRole: z.enum(['out', 'in']).optional(),
  counterpartAssetId: z.string().optional(),
  contexto_ia: z.object({
    insight: z.string().optional(),
    tendencia: z.enum(['Alta', 'Baixa', 'Estável']).optional()
  }).optional(),
  createdAt: z.any().optional()
}).refine(
  (data) => {
    if (data.type === 'out' || data.type === 'in') {
      return Boolean(data.assetId && data.assetId.trim().length > 0);
    }
    return true;
  },
  {
    message: "Selecione a conta de origem/destino (assetId) para entradas e saídas",
    path: ["assetId"],
  }
);

export const UserProfileSchema = z.object({
  uid: z.string(),
  displayName: z.string().optional(),
  email: z.string().email().optional(),
  photoURL: z.string().refine(
    (value) => /^(https?:\/\/|data:image\/(png|jpeg|webp);base64,)/.test(value),
    "URL de foto inválida"
  ).optional(),
  investor_profile: z.enum(['Conservador', 'Sofisticado', 'Arrojado']).default('Conservador'),
  updatedAt: z.any().optional()
});

export const AssetSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, "Nome do ativo é obrigatório"),
  value: z.number().nonnegative("O valor não pode ser negativo"),
  type: z.enum(['liquidity', 'investment', 'physical']),
  detail: z.string().optional(),
  uid: z.string(),
  emissor: z.string().optional(),
  valorInvestido: z.number().optional(),
  taxaInflacao: z.number().optional(),
  vencimento: z.any().optional(),
  subcategoria: z.string().optional(),
  estrategia: z.string().optional(),
  createdAt: z.any().optional()
});

export type Transaction = z.infer<typeof TransactionSchema>;
export type UserProfile = z.infer<typeof UserProfileSchema>;
export type Asset = z.infer<typeof AssetSchema>;
