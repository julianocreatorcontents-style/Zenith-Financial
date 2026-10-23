import { GoogleGenAI, Type } from '@google/genai';

export const GEMINI_API_KEY_STORAGE = 'zenith_gemini_api_key';

const MODEL = 'gemini-3-flash-preview';

export class MissingApiKeyError extends Error {
  constructor() {
    super('Gemini API key not configured');
    this.name = 'MissingApiKeyError';
  }
}

export class InvalidApiKeyError extends Error {
  constructor() {
    super('Invalid Gemini API key');
    this.name = 'InvalidApiKeyError';
  }
}

export interface UserRule {
  pattern: string;
  category: string;
}

export interface ExtractedTransaction {
  label: string;
  value: number;
  type: 'in' | 'out' | 'yield';
  category?: string;
  categoria_primaria?: string;
}

export interface ExtractedAsset {
  name: string;
  value: number;
  type: 'liquidity' | 'investment' | 'physical';
  subcategoria?: string;
  emissor?: string;
}

export interface ExtractedAssetsResult {
  ativos: ExtractedAsset[];
  insight?: string;
  total_detectado?: number;
}

export interface ExtractTransactionInput {
  text: string;
  userRules?: UserRule[];
}

export interface ExtractDocumentInput {
  data: string;
  mimeType?: string;
  userRules?: UserRule[];
}

export interface ExtractAssetsInput {
  data?: string;
  mimeType?: string;
  text?: string;
  investorProfile?: string;
}

function isInvalidApiKeyError(error: unknown): boolean {
  const status = (error as { status?: unknown })?.status;
  const message = error instanceof Error ? error.message : String(error);

  return (
    status === 401 ||
    status === 403 ||
    /api[\s_-]?key|api_key_invalid|invalid authentication|permission_denied|unauthenticated/i.test(message)
  );
}

function rethrowAiError(error: unknown): never {
  if (isInvalidApiKeyError(error)) throw new InvalidApiKeyError();
  throw error instanceof Error ? error : new Error(String(error));
}

async function generate(apiKey: string, contents: unknown, config?: unknown) {
  const key = apiKey?.trim();
  if (!key) throw new MissingApiKeyError();

  const ai = new GoogleGenAI({ apiKey: key });

  try {
    return await ai.models.generateContent({
      model: MODEL,
      contents: contents as never,
      config: config as never,
    });
  } catch (error) {
    rethrowAiError(error);
  }
}

function parseJson<T>(text: string | undefined): T {
  if (!text) throw new Error('Empty AI response');
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error('Invalid AI response');
  }
}

function rulesToPrompt(rules: UserRule[] = [], subject: 'texto' | 'emissor'): string {
  return rules
    .map(r => `- Se ${subject === 'texto' ? 'o texto' : 'o emissor'} for similar a "${r.pattern}", use category="${r.category}"`)
    .join('\n');
}

export async function extractTransaction(
  apiKey: string,
  input: ExtractTransactionInput,
): Promise<ExtractedTransaction> {
  const rulesStr = rulesToPrompt(input.userRules, 'texto');

  const response = await generate(
    apiKey,
    [{
      text: `Atue como Especialista em IA Financeira. Analise este texto: "${input.text}".
          Extraia os dados financeiros:
          - label: O que foi comprado ou de onde veio o dinheiro.
          - value: O valor numérico.
          - type: 'in' (entrada), 'out' (saída), 'yield' (rendimento).
          - category: Categoria sugerida.
          
          REGRAS DE AUTOMAÇÃO PERSONALIZADAS:
          ${rulesStr}

          REGRAS DE AUTOMAÇÃO PADRÃO:
          - Se o texto mencionar "Fatura", "Energia", "Luz", "Enel", "CPFL", etc., defina type="out" e category="Moradia".
          
          Retorne APENAS JSON: { "label": "...", "value": 0, "type": "in|out|yield", "category": "..." }`
    }],
    { responseMimeType: 'application/json' },
  );

  const data = parseJson<ExtractedTransaction>(response.text);
  if (data.category && !data.categoria_primaria) {
    data.categoria_primaria = data.category;
  }
  return data;
}

export async function extractDocument(
  apiKey: string,
  input: ExtractDocumentInput,
): Promise<ExtractedTransaction> {
  const rulesStr = rulesToPrompt(input.userRules, 'emissor');

  const response = await generate(
    apiKey,
    [
      { inlineData: { data: input.data, mimeType: input.mimeType || 'application/octet-stream' } },
      {
        text: `Atue como Especialista em IA Financeira. Analise este documento/imagem.
              1. Identifique o TIPO:
                 - 'in' (ENTRADA): Salário, Pix Recebido, Venda, Resgate.
                 - 'out' (SAÍDA): Fatura, Pagamento, Compra, Boleto, Consumo.
                 - 'yield' (RENDIMENTO): Dividendos, JCP, Rendimento de Aplicação.
              2. Extraia o VALOR TOTAL (number).
              3. Identifique o EMISSOR/ESTABELECIMENTO (label).
              4. Sugira uma CATEGORIA (ex: Moradia, Alimentação, Lazer, Investimentos).
              
              REGRAS DE AUTOMAÇÃO PERSONALIZADAS:
              ${rulesStr}

              REGRAS DE AUTOMAÇÃO PADRÃO:
              - Se o documento for uma "Fatura de Energia", "Conta de Luz" ou similar, defina type="out" e category="Moradia".
              
              Retorne APENAS um JSON: { "label": "...", "value": 0, "type": "in|out|yield", "categoria_primaria": "..." }`
      }
    ],
    { responseMimeType: 'application/json' },
  );

  const data = parseJson<ExtractedTransaction>(response.text);
  if (data.category && !data.categoria_primaria) {
    data.categoria_primaria = data.category;
  }
  return data;
}

export async function extractAssets(
  apiKey: string,
  input: ExtractAssetsInput,
): Promise<ExtractedAssetsResult> {
  const contentPart = input.data
    ? { inlineData: { data: input.data, mimeType: input.mimeType || 'application/octet-stream' } }
    : { text: input.text || '' };

  const response = await generate(
    apiKey,
    [
      {
        parts: [
          {
            text: `Você receberá um documento financeiro em formato de Imagem, PDF ou Texto (Planilha convertida).
                  1. Se for IMAGEM/PDF: Use OCR avançado para ler tabelas, cabeçalhos e rodapés.
                  2. Se for TEXTO/PLANILHA: Analise as colunas de 'Valor', 'Data' e 'Descrição'.
                  3. Identifique o tipo de ativo (CDB, Ações, FII, Tesouro) e o emissor.
                  4. Gere um INSIGHT baseado no Perfil [${input.investorProfile || 'Não informado'}] fornecido.
                  5. Responda APENAS o JSON: { "ativos": [{ "name": "string", "value": 0.0, "type": "investment", "subcategoria": "string", "emissor": "string" }], "insight": "string", "total_detectado": 0.0 }`
          },
          contentPart,
        ]
      }
    ],
    {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          ativos: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                value: { type: Type.NUMBER },
                type: { type: Type.STRING, enum: ['liquidity', 'investment', 'physical'] },
                subcategoria: { type: Type.STRING },
                emissor: { type: Type.STRING }
              }
            }
          },
          insight: { type: Type.STRING },
          total_detectado: { type: Type.NUMBER }
        }
      }
    },
  );

  return parseJson<ExtractedAssetsResult>(response.text);
}

export function getAiErrorMessage(error: unknown, language = 'pt-BR'): string {
  const en = language === 'en-US';

  if (error instanceof MissingApiKeyError) {
    return en
      ? 'Add your Gemini API key to use AI features.'
      : 'Configure sua chave da API Gemini para usar os recursos de IA.';
  }

  if (error instanceof InvalidApiKeyError) {
    return en
      ? 'Your Gemini API key is invalid or expired. Update it to continue.'
      : 'Sua chave da API Gemini é inválida ou expirou. Atualize-a para continuar.';
  }

  return en
    ? 'Could not complete the AI request. Please try again.'
    : 'Não foi possível concluir a solicitação de IA. Tente novamente.';
}
