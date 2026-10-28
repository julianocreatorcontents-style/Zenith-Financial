/**
 * Shared application types for Zenith Financial.
 * Single-user model: each document belongs to a single uid.
 */

export type AssetType = 'liquidity' | 'investment' | 'physical';

export interface Asset {
  id: string;
  name: string;
  value: number;
  type: AssetType;
  detail: string;
  uid: string;
  emissor?: string;
  valorInvestido?: number;
  taxaInflacao?: number;
  vencimento?: any;
  subcategoria?: string;
  estrategia?: string;
  strategy?: 'FIXED_INCOME_TIERED' | 'FIXED_INCOME_SIMPLE';
  investmentPolicy?: any;
  investmentStartDate?: any;
  createdAt: any;
  updatedAt?: any;
  change?: string;
  originalValue?: number;
  baseBalance?: number;
  currentValue?: number;
  accumulatedYield?: number;
  yieldSinceAnchor?: number;
  dailyYield?: number;
  daysInvested?: number;
  yieldPercent?: number;
  yieldStartDate?: Date | null;
  monthEndValue?: number;
  monthYieldRemaining?: number;
}

export interface UserProfile {
  uid: string;
  displayName: string;
  photoURL?: string;
  email?: string;
  cpf?: string;
  investor_profile?: 'Conservador' | 'Sofisticado' | 'Arrojado';
}

export interface Transaction {
  id: string;
  label: string;
  value: number;
  type: 'in' | 'out' | 'yield';
  date: any; // Firestore timestamp
  uid: string;
  assetId?: string;
  applied?: boolean;
  category?: string;
  partialBalance?: number;
  categoria_primaria?: string;
  etiqueta_personalizada?: string;
  metodo_origem?: string;
  status?: 'Confirmado' | 'Futuro';
  contexto_ia?: {
    insight: string;
    tendencia: 'Alta' | 'Baixa' | 'Estável';
  };
}

export interface DDA {
  id: string;
  beneficiary: string;
  value: number;
  dueDate: any;
  status: 'pending' | 'accepted' | 'rejected';
  uid: string;
  cpf?: string;
}

export interface ColorValue {
  hex: string;
  opacity?: number;
  label?: string;
}

export interface AdvancedInterface {
  interface_estilo?: string;
  cor_texto?: string;
  cor_numeros?: string;
  cor_componentes?: string;
  tipo_grafico?: string;
  fundo_grafico_estilo?: string;
  fundo_opacidade?: number;
  cor_texto_grafico?: string;
  [key: string]: any;
}

export interface CategorySlot {
  id: string;
  nome: string;
  cor_destaque: ColorValue;
  visivel_no_dash: boolean;
  config_avancada: AdvancedInterface;
  ia_insights_buffer: Record<string, any>;
}

export interface MasterStates {
  modo_privacidade: boolean;
  insights_ia_ativo: boolean;
  idioma: string;
  tema_global: 'Escuro' | 'Claro' | 'Contraste';
  dashboard_management_expanded: boolean;
}

export interface ChartSlot {
  id: string;
  label: string;
  visible: boolean;
  type: string;
  visualType?: 'Candles' | 'Linha' | 'Área' | 'Barra' | 'Coluna';
  color?: string;
  opacity?: number;
  isGradient?: boolean;
  granularity?: 'Ano' | 'Mês' | 'Dia';
  timeframe?: '7D' | '15D' | '30D' | '6M' | '1A';
  predictiveInsights?: boolean;
  tooltipsEnabled?: boolean;
  touchToZoom?: boolean;
  projectionTargetYear?: number | string;
  projectionTargetMonth?: number | string;
  projectionIncludeCashFlow?: boolean;
  evolutionViewMode?: 'historico' | 'projecao';
  projectionTaxMode?: 'liquido' | 'bruto';
  monthlyContribution?: number;
}

export interface ZenithConfig {
  master_states: MasterStates;
  categories: Record<string, CategorySlot>;
  charts?: Record<string, ChartSlot>;
  metrics?: Record<string, ChartSlot>;
  dashboard_order?: string[];
}

export interface Settings {
  theme: 'dark' | 'light' | 'high-contrast';
  language: 'pt-BR' | 'en-US';
  privacyMode: boolean;
  activeWidgets: string[];
  yieldColor: string;
  granularity: 'day' | 'month' | 'year';
  customTerms: Record<string, string>;
  zenith_config?: ZenithConfig;
  ui_config?: any; // Keep for backward compatibility during transition
}
