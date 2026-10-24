import { z } from 'zod';

/**
 * @Agente01 - Arquiteto/DevSecOps
 * Esquema de Validação para a entidade Transação (Transaction)
 * Garante integridade de dados antes da persistência no Firestore.
 */

export const TransactionSchema = z.object({
  id: z.string().optional(),
  label: z.string().min(1, "O título é obrigatório").max(100, "Título muito longo"),
  value: z.number().positive("O valor deve ser sempre um número positivo"),
  type: z.enum(['in', 'out', 'yield']),
  date: z.any(), // Firestore Timestamp ou Date
  uid: z.string().min(1, "UID do usuário é obrigatório"),
  partialBalance: z.number().optional(),
  categoria_primaria: z.string().max(50, "Categoria muito longa").optional(),
  etiqueta_personalizada: z.string().max(100, "Etiqueta muito longa").optional(),
  metodo_origem: z.string().max(50, "Método de origem muito longo").optional(),
  status: z.enum(['Confirmado', 'Futuro']).optional(),
  contexto_ia: z.object({
    insight: z.string().optional(),
    tendencia: z.enum(['Alta', 'Baixa', 'Estável']).optional()
  }).optional(),
  createdAt: z.any().optional()
});

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
