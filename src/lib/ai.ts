import type {
  IAIProvider,
  AIToolDeclaration,
  AIMessage,
} from '../domain/ports/IAIProvider';
import {
  GeminiProvider,
  InvalidApiKeyError,
  MissingApiKeyError,
  GEMINI_PRIMARY_MODELS,
} from './adapters/GeminiProvider';

export { InvalidApiKeyError, MissingApiKeyError };

export const GEMINI_API_KEY_STORAGE = 'zenith_gemini_api_key';
export const PRIMARY_MODELS = GEMINI_PRIMARY_MODELS;

/**
 * Carrega a chave da API de IA do storage persistente (Preferences nativo em produção, localStorage na web).
 */
export async function loadStoredApiKey(): Promise<string> {
  try {
    const { Capacitor } = await import('@capacitor/core');
    if (Capacitor.isNativePlatform()) {
      const { Preferences } = await import('@capacitor/preferences');
      const { value } = await Preferences.get({ key: GEMINI_API_KEY_STORAGE });
      return value ?? '';
    }
  } catch {
    // fallback to localStorage
  }
  try {
    return localStorage.getItem(GEMINI_API_KEY_STORAGE) ?? '';
  } catch {
    return '';
  }
}

/**
 * Testa a validade de uma chave de API do Gemini fazendo uma chamada real de listagem de modelos.
 * Retorna 'ok' se a chave funcionar, ou uma string de erro amigável se inválida.
 */
export async function testApiKey(key: string): Promise<{ valid: boolean; error?: string }> {
  if (!key || key.trim().length <= 10) {
    return { valid: false, error: 'Chave muito curta ou inválida.' };
  }
  try {
    await getSupportedModels(key.trim());
    return { valid: true };
  } catch (err) {
    if (err instanceof InvalidApiKeyError) {
      return { valid: false, error: 'Chave inválida. Verifique no Google AI Studio.' };
    }
    if (err instanceof MissingApiKeyError) {
      return { valid: false, error: 'Chave não informada.' };
    }
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('API_KEY_INVALID') || message.includes('401') || message.includes('403')) {
      return { valid: false, error: 'Chave rejeitada pela API. Verifique permissões.' };
    }
    // Network error ou outros — não bloquear o salvamento (chave pode ser válida)
    return { valid: false, error: 'Não foi possível verificar a chave. Verifique sua conexão.' };
  }
}

/**
 * Fábrica do provedor padrão de IA (Google Gemini).
 */
export function createAIProvider(apiKey: string): IAIProvider {
  return new GeminiProvider({ apiKey });
}

function resolveProvider(providerOrKey: IAIProvider | string): IAIProvider {
  if (typeof providerOrKey === 'string') {
    return createAIProvider(providerOrKey);
  }
  return providerOrKey;
}

export async function getSupportedModels(apiKey: string): Promise<string[]> {
  const provider = createAIProvider(apiKey);
  return provider.listSupportedModels();
}

export function validateApiKey(key: string | null): boolean {
  return Boolean(key && key.trim().length > 10);
}

// ==========================================
// HELPER DE MENSAGENS DE ERRO
// ==========================================

export function getAiErrorMessage(error: unknown, language: string = 'pt-BR'): string {
  const isPt = language.startsWith('pt');
  if (error instanceof MissingApiKeyError) {
    return isPt
      ? 'Chave da API Gemini não configurada. Vá em Configurações para adicioná-la.'
      : 'Gemini API key not configured. Go to Settings to add it.';
  }
  if (error instanceof InvalidApiKeyError) {
    return isPt
      ? 'Chave da API Gemini inválida. Verifique nas Configurações.'
      : 'Invalid Gemini API key. Check Settings.';
  }
  if (error instanceof Error) {
    if (error.message?.includes('API_KEY_INVALID') || error.message?.includes('401')) {
      return isPt
        ? 'Chave da API inválida ou expirada. Verifique nas configurações.'
        : 'Invalid or expired API key. Check Settings.';
    }
    return isPt
      ? `Erro ao processar com IA: ${error.message}`
      : `AI processing error: ${error.message}`;
  }
  return isPt
    ? 'Erro desconhecido ao processar com IA.'
    : 'Unknown AI processing error.';
}

// ==========================================
// EXTRAÇÃO DE DOCUMENTOS (OCR/Texto → Transação)
// ==========================================

export interface DocumentInput {
  data?: string;       // base64 para imagens/PDFs
  mimeType?: string;
  text?: string;       // texto direto
}

export interface ExtractedTransaction {
  label: string;
  value: number;
  type: 'in' | 'out';
  category?: string;
}

export async function extractDocument(
  providerOrKey: IAIProvider | string,
  input: DocumentInput
): Promise<ExtractedTransaction> {
  const provider = resolveProvider(providerOrKey);

  const prompt = `Analise este documento financeiro e extraia os dados da transação principal.
Retorne APENAS um JSON válido (sem markdown) com os campos:
- label: descrição curta da transação
- value: valor numérico (sem símbolo de moeda)
- type: "in" para receita/entrada ou "out" para despesa/saída
- category: categoria (ex: Alimentação, Transporte, Salário, etc.)

Exemplo de resposta: {"label":"Supermercado Extra","value":157.90,"type":"out","category":"Alimentação"}`;

  const parts: AIMessage['parts'] = [{ text: prompt }];
  if (input.data && input.mimeType) {
    parts.unshift({ inlineData: { data: input.data, mimeType: input.mimeType } });
  } else if (input.text) {
    parts.push({ text: input.text });
  }

  const response = await provider.generateContent([{ role: 'user', parts }]);
  const text = response.text || '';
  const jsonMatch = text.match(/\{[\s\S]*?\}/);
  if (!jsonMatch) throw new Error('IA não retornou JSON válido.');

  return JSON.parse(jsonMatch[0]) as ExtractedTransaction;
}

// ==========================================
// EXTRAÇÃO DE ATIVOS (Documentos → Carteira)
// ==========================================

export interface AssetInput {
  data?: string;
  mimeType?: string;
  text?: string;
  investorProfile?: string;
}

export interface ExtractedAssetItem {
  name: string;
  type: string;
  value: number;
  quantity?: number;
  ticker?: string;
}

export interface ExtractedAssets {
  ativos: ExtractedAssetItem[];
  insight?: string;
}

export async function extractAssets(
  providerOrKey: IAIProvider | string,
  input: AssetInput
): Promise<ExtractedAssets> {
  const provider = resolveProvider(providerOrKey);

  const prompt = `Analise este documento de investimentos e extraia todos os ativos encontrados.
${input.investorProfile ? `Perfil do investidor: ${input.investorProfile}` : ''}

Retorne APENAS um JSON válido (sem markdown) com:
- ativos: array de objetos, cada um com: { name, type, value, quantity, ticker (se houver) }
- insight: uma frase curta sobre a carteira

Exemplo: {"ativos":[{"name":"Tesouro Selic 2029","type":"Renda Fixa","value":5000,"quantity":1}],"insight":"Carteira conservadora focada em renda fixa."}`;

  const parts: AIMessage['parts'] = [{ text: prompt }];
  if (input.data && input.mimeType) {
    parts.unshift({ inlineData: { data: input.data, mimeType: input.mimeType } });
  } else if (input.text) {
    parts.push({ text: input.text });
  }

  const response = await provider.generateContent([{ role: 'user', parts }]);
  const text = response.text || '';
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('IA não retornou JSON válido.');

  return JSON.parse(jsonMatch[0]) as ExtractedAssets;
}

// ==========================================
// DEFINIÇÃO DAS FERRAMENTAS (Agnósticas de SDK)
// ==========================================

const createTransactionTool: AIToolDeclaration = {
  name: "createTransaction",
  description: "Cria um novo lançamento financeiro (despesa, receita ou rendimento) na carteira.",
  parameters: {
    type: "object",
    properties: {
      type: { 
        type: "string", 
        enum: ["in", "out", "yield"], 
        description: "Tipo do lançamento: 'in' para receita/entrada, 'out' para despesa/saída, 'yield' para rendimento." 
      },
      value: { 
        type: "number", 
        description: "O valor numérico do lançamento em Reais (R$). Ex: 45.50" 
      },
      label: { 
        type: "string", 
        description: "A descrição do lançamento (ex: 'Almoço Restaurante', 'Salário', 'Dividendos')." 
      },
      category: {
        type: "string",
        description: "Categoria do lançamento (ex: 'Alimentação', 'Transporte', 'Moradia', 'Lazer', 'Saúde', 'Salário', 'Investimentos', 'Outros')."
      },
      date: { 
        type: "string", 
        description: "A data do lançamento no formato YYYY-MM-DD (ex: 2026-11-06). Use a data de hoje se o usuário não especificar." 
      },
      assetName: {
        type: "string",
        description: "Nome ou emissor da conta/ativo associado se especificado pelo usuário (ex: 'Nubank', 'Inter', 'Itaú')."
      }
    },
    required: ["type", "value", "label"],
  },
};

const deleteTransactionTool: AIToolDeclaration = {
  name: "deleteTransaction",
  description: "Exclui ou move para a lixeira um lançamento financeiro pelo ID ou buscando pelo nome/descrição mais recente.",
  parameters: {
    type: "object",
    properties: {
      transactionId: {
        type: "string",
        description: "ID do lançamento se identificado a partir do contexto."
      },
      searchLabel: {
        type: "string",
        description: "Nome ou descrição do lançamento que deve ser excluído (ex: 'Mercado', 'Almoço')."
      }
    },
    required: []
  }
};

const updateTransactionTool: AIToolDeclaration = {
  name: "updateTransaction",
  description: "Atualiza um lançamento financeiro existente (mudando valor, descrição, categoria ou data).",
  parameters: {
    type: "object",
    properties: {
      transactionId: {
        type: "string",
        description: "ID do lançamento a atualizar, se identificado no contexto."
      },
      searchLabel: {
        type: "string",
        description: "Nome ou descrição do lançamento existente a ser alterado."
      },
      newLabel: {
        type: "string",
        description: "Nova descrição do lançamento."
      },
      newValue: {
        type: "number",
        description: "Novo valor em Reais (R$)."
      },
      newCategory: {
        type: "string",
        description: "Nova categoria do lançamento."
      },
      newType: {
        type: "string",
        enum: ["in", "out", "yield"],
        description: "Novo tipo ('in', 'out' ou 'yield')."
      },
      newDate: {
        type: "string",
        description: "Nova data no formato YYYY-MM-DD."
      }
    },
    required: []
  }
};

const createAssetTool: AIToolDeclaration = {
  name: "createAsset",
  description: "Cadastra um novo ativo ou investimento na carteira do usuário.",
  parameters: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "Nome do ativo ou investimento (ex: 'CDB 110% CDI Nubank', 'Tesouro Selic 2029', 'Conta Corrente Inter')."
      },
      type: {
        type: "string",
        enum: ["liquidity", "investment", "physical"],
        description: "Tipo: 'liquidity' (conta corrente, reserva imediata), 'investment' (renda fixa, ações, FIIs), 'physical' (imóveis, veículos, bens físicos)."
      },
      value: {
        type: "number",
        description: "Saldo atual ou valor investido inicial em Reais (R$)."
      },
      subcategoria: {
        type: "string",
        description: "Subcategoria opcional (ex: 'CDB', 'Ações', 'FIIs', 'Tesouro Direto', 'Conta Corrente', 'Cripto', 'Imóvel', 'Veículo')."
      },
      institution: {
        type: "string",
        description: "Instituição financeira ou emissor (ex: 'Nubank', 'Banco Inter', 'XP Investimentos', 'BTG')."
      }
    },
    required: ["name", "type", "value"]
  }
};

const updateAssetBalanceTool: AIToolDeclaration = {
  name: "updateAssetBalance",
  description: "Atualiza o saldo e/ou rendimento de um ativo ou conta existente na carteira do usuário.",
  parameters: {
    type: "object",
    properties: {
      assetId: {
        type: "string",
        description: "ID do ativo se identificado no contexto."
      },
      assetName: {
        type: "string",
        description: "Nome ou instituição do ativo para localização (ex: 'Cofrinho 99Pay', '99Pay', 'Nubank', 'Inter')."
      },
      newBalance: {
        type: "number",
        description: "Novo saldo total corrigido em Reais (R$). Ex: 5011.48"
      },
      dailyYield: {
        type: "number",
        description: "Último rendimento em Reais se mencionado no extrato (ex: 2.19)."
      },
      yieldDate: {
        type: "string",
        description: "Data do rendimento ou extrato no formato YYYY-MM-DD (ex: 2026-11-05)."
      }
    },
    required: ["newBalance"]
  }
};

const deleteAssetTool: AIToolDeclaration = {
  name: "deleteAsset",
  description: "Exclui ou move para a lixeira um ativo pelo nome ou ID.",
  parameters: {
    type: "object",
    properties: {
      assetId: {
        type: "string",
        description: "ID do ativo se identificado no contexto."
      },
      assetName: {
        type: "string",
        description: "Nome do ativo a ser excluído."
      }
    },
    required: []
  }
};

const updateFinancialGoalsTool: AIToolDeclaration = {
  name: "updateFinancialGoals",
  description: "Atualiza as metas financeiras do usuário (Reserva de Emergência e Liberdade Financeira/Patrimônio Alvo).",
  parameters: {
    type: "object",
    properties: {
      emergencyReserve: {
        type: "number",
        description: "Novo valor alvo para a Reserva de Emergência em Reais (R$). Ex: 25000."
      },
      financialFreedom: {
        type: "number",
        description: "Novo valor alvo para a Liberdade Financeira / Meta de Patrimônio em Reais (R$). Ex: 500000."
      }
    },
    required: []
  }
};

const navigateToTabTool: AIToolDeclaration = {
  name: "navigateToTab",
  description: "Navega para uma tela ou aba específica do aplicativo Zenith.",
  parameters: {
    type: "object",
    properties: {
      tab: {
        type: "string",
        enum: ["Início", "Carteira", "Investimentos", "Armazenamento"],
        description: "Nome exato da aba de destino: 'Início', 'Carteira', 'Investimentos' ou 'Armazenamento'."
      }
    },
    required: ["tab"]
  }
};

const batchUpdateAssetBalancesTool: AIToolDeclaration = {
  name: "batchUpdateAssetBalances",
  description: "Atualiza ou cadastra em lote múltiplos ativos e seus saldos/rendimentos a partir de um extrato consolidado.",
  parameters: {
    type: "object",
    properties: {
      updates: {
        type: "array",
        description: "Lista de ativos e seus saldos a atualizar.",
        items: {
          type: "object",
          properties: {
            assetName: {
              type: "string",
              description: "Nome do ativo ou conta (ex: '99Pay', 'Mercado Pago Cofrinho', 'Cofrinho 99 - O')."
            },
            newBalance: {
              type: "number",
              description: "Novo saldo total do ativo em Reais (R$). Ex: 4543.64"
            },
            dailyYield: {
              type: "number",
              description: "Último rendimento em Reais (R$), se informado no extrato. Ex: 1.85"
            },
            yieldDate: {
              type: "string",
              description: "Data do rendimento/extrato no formato YYYY-MM-DD (ex: '2026-11-05')."
            }
          },
          required: ["assetName", "newBalance"]
        }
      }
    },
    required: ["updates"]
  }
};

const getBalancesTool: AIToolDeclaration = {
  name: "get_balances",
  description: "Retorna os saldos atuais de todas as contas, patrimonio total e ultima sincronizacao.",
  parameters: { type: "object", properties: {} }
};
const getGoalsTool: AIToolDeclaration = {
  name: "get_goals",
  description: "Retorna as metas financeiras e progresso.",
  parameters: { type: "object", properties: {} }
};
const getTransactionsTool: AIToolDeclaration = {
  name: "get_transactions",
  description: "Retorna os lancamentos recentes.",
  parameters: { type: "object", properties: {} }
};

export const allZenithTools: AIToolDeclaration[] = [
  getBalancesTool,
  getGoalsTool,
  getTransactionsTool,
  createTransactionTool,
  deleteTransactionTool,
  updateTransactionTool,
  createAssetTool,
  updateAssetBalanceTool,
  batchUpdateAssetBalancesTool,
  deleteAssetTool,
  updateFinancialGoalsTool,
  navigateToTabTool
];

export interface ChatAIResult {
  text: string;
  modelUsed: string;
}

export async function chatWithZenithAI(
  providerOrKey: IAIProvider | string,
  chatHistory: { role: 'user' | 'model'; text: string }[],
  userContext: string,
  onExecuteTool: (name: string, args: Record<string, unknown>) => Promise<unknown>,
  onStatusUpdate?: (status: string) => void,
  preferredModel?: string
): Promise<ChatAIResult> {
  const provider = resolveProvider(providerOrKey);

  const systemPrompt = `Você é a Zenith IA, o assistente financeiro inteligente e agente autônomo do aplicativo Zenith Financial.
Sempre responda em português do Brasil de forma clara, amigável e prestativa.

SUAS CAPACIDADES DE AGENTE:
Você pode executar tarefas reais no app através de chamadas de funções (tools):
1. 'createTransaction': Cria uma despesa ('out'), receita ('in') ou rendimento ('yield').
2. 'deleteTransaction': Exclui/move para a lixeira um lançamento existente.
3. 'updateTransaction': Edita valor, categoria, descrição ou data de uma transação.
4. 'createAsset': Cria um novo ativo ou investimento na carteira do usuário.
5. 'updateAssetBalance': Ajusta o saldo de um ativo ou conta cadastrada.
6. 'deleteAsset': Exclui um ativo da carteira.
7. 'updateFinancialGoals': Atualiza metas de Reserva de Emergência ou Liberdade Financeira.
8. 'navigateToTab': Troca para uma aba do aplicativo ('Início', 'Carteira', 'Investimentos', 'Armazenamento').

DIRETRIZES:
- Se o usuário pedir para realizar uma ação, acione a ferramenta correspondente.
- Se o usuário fornecer extrato ou anotação (ex: "Cofrinho 99Pay: R$ 5.011,48 - Último rendimento (5/11) R$ 2,19"):
  * Identifique o ativo e atualize com 'updateAssetBalance'.
  * Converta valores monetários brasileiros (ex: '5.011,48') para números decimais (5011.48).
  * Se houver menção a rendimento diário ou último rendimento, passe em 'dailyYield' e a data correspondente em 'yieldDate' (formato YYYY-MM-DD).
- Se for apenas tirar dúvidas ou pedir conselhos financeiros, responda com análises precisas baseadas nos dados reais fornecidos.
- Quando executar uma ferramenta com sucesso, dê um retorno afetuoso e claro confirmando os valores e detalhes da operação.


Histórico da conversa até agora:
${chatHistory.map(msg => `${msg.role === 'user' ? 'Usuário' : 'Zenith IA'}: ${msg.text}`).join('\n')}
`;

  try {
    onStatusUpdate?.('Consultando Zenith IA...');
    const conversationContents: AIMessage[] = [
      { role: 'user', parts: [{ text: systemPrompt }] }
    ];

    let response = await provider.generateContent(conversationContents, {
      tools: allZenithTools,
      model: preferredModel,
      onStatus: onStatusUpdate,
    });

    let turns = 0;
    while (response.functionCalls && response.functionCalls.length > 0 && turns < 5) {
      turns++;

      conversationContents.push({
        role: 'model',
        parts: response.functionCalls.map((fc) => ({ functionCall: fc })),
      });

      const functionResponseParts: AIMessage['parts'] = [];
      for (const call of response.functionCalls) {
        let toolResult: unknown;
        try {
          toolResult = await onExecuteTool(call.name, call.args);
        } catch (err: unknown) {
          toolResult = `Erro na execução: ${err instanceof Error ? err.message : String(err)}`;
        }

        functionResponseParts.push({
          functionResponse: {
            name: call.name,
            ...(call.id ? { id: call.id } : {}),
            response: typeof toolResult === 'object' && toolResult !== null
              ? (toolResult as Record<string, unknown>)
              : { output: String(toolResult) }
          }
        });
      }

      conversationContents.push({
        role: 'user',
        parts: functionResponseParts
      });

      onStatusUpdate?.('Finalizando resposta...');
      response = await provider.generateContent(conversationContents, {
        tools: allZenithTools,
        model: preferredModel,
        onStatus: onStatusUpdate,
      });
    }

    return {
      text: response.text || 'Tarefa processada com sucesso.',
      modelUsed: response.modelUsed,
    };
  } catch (error: unknown) {
    console.error('[Zenith IA] Erro:', error);
    throw error;
  }
}
