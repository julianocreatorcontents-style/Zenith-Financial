/**
 * Zenith Financial - Domain Port: IAIProvider
 * Contrato genérico e agnóstico de provedor de Inteligência Artificial.
 * Não possui dependência de SDKs específicos (Google, OpenAI, Anthropic, etc.).
 */

export type AIRole = 'user' | 'model' | 'system';

export interface AIInlineData {
  data: string; // Base64
  mimeType: string;
}

export interface AIFunctionCall {
  id?: string;
  name: string;
  args: Record<string, unknown>;
}

export interface AIFunctionResponse {
  id?: string;
  name: string;
  response: Record<string, unknown>;
}

export interface AIContentPart {
  text?: string;
  inlineData?: AIInlineData;
  functionCall?: AIFunctionCall;
  functionResponse?: AIFunctionResponse;
  /**
   * Assinatura opaca do raciocínio do modelo, devolvida pela API.
   * Deve ser reenviada junto da parte correspondente em turnos seguintes
   * (exigido por modelos Gemini 3 com function calling).
   */
  thoughtSignature?: string;
}

export interface AIMessage {
  role: AIRole;
  parts: AIContentPart[];
}

export type AIToolPropertyType = 'string' | 'number' | 'boolean' | 'object' | 'array';

export interface AIToolProperty {
  type: AIToolPropertyType;
  description?: string;
  enum?: string[];
  items?: AIToolProperty;
  properties?: Record<string, AIToolProperty>;
  required?: string[];
}

export interface AIToolDeclaration {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, AIToolProperty>;
    required?: string[];
  };
}

export interface AIGenerateOptions {
  model?: string;
  temperature?: number;
  tools?: AIToolDeclaration[];
  disableThinking?: boolean;
  onStatus?: (status: string) => void;
}

export interface AIGenerateResult {
  text: string;
  modelUsed: string;
  functionCalls?: AIFunctionCall[];
  /**
   * Partes originais retornadas pelo modelo, incluindo `thoughtSignature`.
   * Devem ser reenviadas como turno `model` antes dos `functionResponse`
   * para preservar o raciocínio exigido pelo provedor.
   */
  modelParts?: AIContentPart[];
  rawCandidateContent?: unknown;
}

export interface IAIProvider {
  readonly id: string;
  readonly name: string;

  listSupportedModels(): Promise<string[]>;

  generateContent(
    messages: AIMessage[],
    options?: AIGenerateOptions
  ): Promise<AIGenerateResult>;
}
