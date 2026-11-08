/**
 * Zenith Financial - Adapter: GeminiProvider
 * Implementação da porta IAIProvider utilizando o SDK @google/genai.
 * Isola toda a instanciação, schemas de tipos e nuances do Google Gemini.
 */

import { Type } from '@google/genai';
import type {
  IAIProvider,
  AIMessage,
  AIGenerateOptions,
  AIGenerateResult,
  AIToolDeclaration,
  AIToolProperty,
  AIFunctionCall,
} from '../../domain/ports/IAIProvider';

export async function getGenAI() {
  return await import('@google/genai');
}

export interface GeminiProviderConfig {
  apiKey: string;
  preferredModels?: string[];
}

export class InvalidApiKeyError extends Error {
  constructor(message = 'Chave da API Gemini inválida. Verifique nas configurações.') {
    super(message);
    this.name = 'InvalidApiKeyError';
  }
}

export class MissingApiKeyError extends Error {
  constructor(message = 'Chave da API Gemini não configurada. Configure-a nas configurações.') {
    super(message);
    this.name = 'MissingApiKeyError';
  }
}

export const GEMINI_PRIMARY_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-3-flash-preview',
  'gemini-3.1-flash-lite-preview',
];

export class GeminiProvider implements IAIProvider {
  readonly id = 'gemini';
  readonly name = 'Google Gemini';

  private readonly apiKey: string;
  private cachedModels: string[] | null = null;

  constructor(config: GeminiProviderConfig) {
    if (!config.apiKey || !config.apiKey.trim()) {
      throw new MissingApiKeyError();
    }
    this.apiKey = config.apiKey.trim();
  }

  async listSupportedModels(): Promise<string[]> {
    if (this.cachedModels && this.cachedModels.length > 0) {
      return this.cachedModels;
    }

    try {
      const { GoogleGenAI } = await getGenAI();
      const ai = new GoogleGenAI({ apiKey: this.apiKey });
      const listResult = await ai.models.list();
      const found: string[] = [];

      for await (const m of listResult) {
        const item = m as { supportedGenerationMethods?: string[]; name?: string };
        const methods = item.supportedGenerationMethods || [];
        if (methods.includes('generateContent')) {
          const cleanName = (item.name || '').replace(/^models\//, '');
          if (cleanName && cleanName.includes('gemini')) {
            found.push(cleanName);
          }
        }
      }

      if (found.length > 0) {
        const preference = [
          'gemini-2.5-flash',
          'gemini-2.5-flash-lite',
          'gemini-3-flash-preview',
          'gemini-3.1-flash-lite-preview',
          'gemini-2.5-pro',
          'gemini-3-pro-preview',
        ];

        const sorted = found.sort((a, b) => {
          const idxA = preference.indexOf(a);
          const idxB = preference.indexOf(b);
          if (idxA !== -1 && idxB !== -1) return idxA - idxB;
          if (idxA !== -1) return -1;
          if (idxB !== -1) return 1;
          if (a.includes('flash') && !b.includes('flash')) return -1;
          if (!a.includes('flash') && b.includes('flash')) return 1;
          return 0;
        });

        this.cachedModels = sorted;
        return sorted;
      }
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      if (e?.status === 401 || e?.message?.includes('API_KEY_INVALID') || e?.message?.includes('401')) {
        throw new InvalidApiKeyError();
      }
    }

    return GEMINI_PRIMARY_MODELS;
  }

  async generateContent(
    messages: AIMessage[],
    options?: AIGenerateOptions
  ): Promise<AIGenerateResult> {
    const { GoogleGenAI } = await getGenAI();
    const ai = new GoogleGenAI({ apiKey: this.apiKey });

    const contents = this.mapMessagesToGemini(messages);
    const geminiTools = options?.tools ? this.mapToolsToGemini(options.tools) : undefined;

    const supported = await this.listSupportedModels();
    let candidateModels = [...supported];
    if (options?.model) {
      candidateModels = [options.model, ...candidateModels.filter((m) => m !== options.model)];
    }

    let lastError: unknown;
    for (const model of candidateModels.slice(0, 3)) {
      try {
        options?.onStatus?.(`Conectando a ${model}...`);
        const response = await this.executeWithTimeout(
          this.safeGenerate(ai, model, contents, geminiTools, options?.disableThinking ?? true),
          25000,
          `Tempo limite esgotado para o modelo ${model}.`
        );

        const functionCalls: AIFunctionCall[] = [];
        if (response.functionCalls && response.functionCalls.length > 0) {
          for (const fc of response.functionCalls) {
            functionCalls.push({
              id: fc.id,
              name: fc.name || '',
              args: (fc.args as Record<string, unknown>) || {},
            });
          }
        }

        const candidateParts = response.candidates?.[0]?.content?.parts as Array<{ text?: string }> | undefined;
        const text = response.text || candidateParts?.find((p) => p.text)?.text || '';

        return {
          text,
          modelUsed: model,
          functionCalls: functionCalls.length > 0 ? functionCalls : undefined,
          rawCandidateContent: response.candidates?.[0]?.content,
        };
      } catch (err: unknown) {
        lastError = err;
        const e = err as { status?: number; message?: string };
        const msg = String(e?.message || err);
        if (e?.status === 401 || msg.includes('API_KEY_INVALID') || msg.includes('401')) {
          throw new InvalidApiKeyError();
        }
        options?.onStatus?.('Tentando modelo alternativo...');
      }
    }

    const errStr = String((lastError as { message?: string })?.message || lastError);
    if (errStr.includes('503') || errStr.includes('UNAVAILABLE') || errStr.includes('high demand')) {
      throw new Error(
        'Os servidores de IA estão com um pico temporário de alta demanda (503). Por favor, aguarde alguns instantes e tente novamente.'
      );
    }
    throw (lastError instanceof Error ? lastError : new Error(String(lastError)));
  }

  private mapMessagesToGemini(messages: AIMessage[]) {
    return messages.map((m) => {
      const parts = m.parts.map((p) => {
        if (p.text !== undefined) {
          return { text: p.text };
        }
        if (p.inlineData) {
          return { inlineData: p.inlineData };
        }
        if (p.functionCall) {
          return {
            functionCall: {
              name: p.functionCall.name,
              args: p.functionCall.args,
              ...(p.functionCall.id ? { id: p.functionCall.id } : {}),
            },
          };
        }
        if (p.functionResponse) {
          return {
            functionResponse: {
              name: p.functionResponse.name,
              response: { result: p.functionResponse.response },
              ...(p.functionResponse.id ? { id: p.functionResponse.id } : {}),
            },
          };
        }
        return {};
      });

      return {
        role: m.role,
        parts,
      };
    });
  }

  private mapToolsToGemini(tools: AIToolDeclaration[]) {
    return tools.map((t) => ({
      name: t.name,
      description: t.description,
      parameters: {
        type: Type.OBJECT,
        properties: this.mapPropertiesToGemini(t.parameters.properties),
        ...(t.parameters.required ? { required: t.parameters.required } : {}),
      },
    }));
  }

  private mapPropertiesToGemini(props: Record<string, AIToolProperty>): Record<string, unknown> {
    const res: Record<string, unknown> = {};
    for (const [key, prop] of Object.entries(props)) {
      let geminiType = Type.STRING;
      if (prop.type === 'number') geminiType = Type.NUMBER;
      if (prop.type === 'boolean') geminiType = Type.BOOLEAN;
      if (prop.type === 'object') geminiType = Type.OBJECT;
      if (prop.type === 'array') geminiType = Type.ARRAY;

      res[key] = {
        type: geminiType,
        ...(prop.description ? { description: prop.description } : {}),
        ...(prop.enum ? { enum: prop.enum } : {}),
        ...(prop.items ? { items: this.mapPropertiesToGemini({ item: prop.items })['item'] } : {}),
        ...(prop.properties ? { properties: this.mapPropertiesToGemini(prop.properties) } : {}),
      };
    }
    return res;
  }

  private async safeGenerate(
    ai: InstanceType<Awaited<ReturnType<typeof getGenAI>>['GoogleGenAI']>,
    model: string,
    contents: unknown[],
    tools?: unknown[],
    disableThinking = true
  ) {
    type GenerateParams = Parameters<typeof ai.models.generateContent>[0];
    type ContentItem = GenerateParams['contents'];
    type GenerateConfig = GenerateParams['config'];

    const buildConfig = (thinking: boolean): GenerateConfig => {
      const cfg: Record<string, unknown> = {
        automaticFunctionCalling: { disable: true },
      };
      if (tools && tools.length > 0) {
        cfg['tools'] = [{ functionDeclarations: tools }];
      }
      if (thinking && (model.includes('2.5-flash') || model.includes('flash-lite'))) {
        cfg['thinkingConfig'] = { thinkingBudget: 0 };
      }
      return cfg as GenerateConfig;
    };

    try {
      return await ai.models.generateContent({
        model,
        contents: contents as ContentItem,
        config: buildConfig(disableThinking),
      });
    } catch (err: unknown) {
      const errStr = String((err as { message?: string })?.message || err);
      if (errStr.includes('thinking') || errStr.includes('Thinking') || errStr.includes('budget') || errStr.includes('INVALID_ARGUMENT')) {
        return await ai.models.generateContent({
          model,
          contents: contents as ContentItem,
          config: buildConfig(false),
        });
      }
      throw err;
    }
  }

  private executeWithTimeout<T>(promise: Promise<T>, ms: number, errorMsg: string): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(errorMsg)), ms);
    });
    return Promise.race([promise, timeoutPromise]).finally(() => {
      if (timer) clearTimeout(timer);
    });
  }
}
