# Zenith Financial - Squad de Desenvolvimento AI

## Visão do Projeto
Aplicativo mobile-first financeiro (React 19 + Capacitor + Vite + TypeScript). O núcleo (`src/domain`) é puramente lógico e testável, isolado de UI e Infraestrutura.

## Roadmap de Arquitetura: Multi-Provedor de IA (CONCLUÍDO ✅)
O Zenith não é mais dependente exclusivo do Google Gemini.
1. **Contratos Genéricos**: Interface `IAIProvider` criada em `src/domain/ports/IAIProvider.ts` sem dependência de SDKs específicos.
2. **Adapters**: `GeminiProvider.ts` implementa `IAIProvider` isolando o SDK `@google/genai` e nuances de chamadas/modelos.
3. **Refatoração do ai.ts**: O orquestrador recebe uma instância de `IAIProvider` por injeção de dependência. As 23 ocorrências de `any` em `ai.ts` foram 100% eliminadas com tipagem estrita.

### Regra para Novos Provedores de IA
Para adicionar uma nova IA (ex: OpenAI), crie um novo Adapter em `src/lib/adapters/` implementando `IAIProvider` e adicione os testes em um arquivo `.test.ts`. Nunca importe SDKs de IA diretamente nos componentes (`src/views`) ou no `ai.ts`.

## Arquitetura e Camadas
- **src/domain**: Regras puras. Zero dependência de React/Firebase. Use `Result<T, E>` para erros.
- **src/lib/adapters**: Implementações das portas (BCB, Firestore, futuros Provedores de IA).
- **src/lib/finance/**: Decomposição modular de cálculos financeiros em submódulos (`parsers.ts`, `formatters.ts`, `calculators.ts`) com re-exportação unificada via `index.ts`, substituindo o antigo `finance.ts`.
- **src/views** e **src/components**: Apenas UI. O arquivo `ZenithIAView.tsx` atua apenas como orquestrador. A renderização de mensagens está isolada em `src/components/ai/ChatMessageBubble.tsx`, a barra de input em `ChatInputBar.tsx`, e a lógica de voz no hook `useVoiceRecognition`. Os gráficos e cards do HomeView estão isolados em `src/components/dashboard/`. O `HomeView.tsx` atua apenas como orquestrador de layout (novas visualizações devem ser criadas em componentes próprios dentro dessa pasta, nunca diretamente no `HomeView.tsx`, evitando importar Recharts no `HomeView`). As configurações visuais e painéis do dashboard estão isolados em `src/components/settings/` (ex: `GlobalSettingsSection.tsx`, `ChartFilterCard.tsx`, `DashboardSlotConfigItem.tsx`).
- **src/hooks**: Orquestração de estado e lógica desacoplada. Toda a lógica de execução e chamadas de ferramentas da IA mora em `src/hooks/useAITools.ts`. Os listeners e coleções do Firestore estão isolados em hooks dedicados (`useTransactionsData`, `useAssetsData`, etc.), mantendo `useZenithData.ts` como orquestrador.
- **Regra de Ouro**: Nenhum arquivo novo deve ultrapassar 500 linhas. Se passar, quebre em subcomponentes ou hooks.

## Comandos de Validação (Obrigatórios)
- **Testes**: `npm run test:domain` (NUNCA use `npm test`, não existe).
- **Lint/Typecheck**: `npm run lint` (Deve rodar sem erros).
- **Build**: `npm run build`.

## Convenções de Código
1. **Tipagem Estrita**: Proibido usar `any`. Use generics, `unknown` ou Zod.
2. **Exportação**: Componentes de UI usam `export default` no final (ex: `export default HomeView`). Domínio e adaptadores usam `export` nomeado.
3. **Limpeza**: Não crie arquivos `.bak` (backups manuais são proibidos, use o Git).

## Armadilhas Conhecidas (NÃO PIORE ESTES ARQUIVOS)
- **God Files**: Evite adicionar lógica em `ZenithIAView.tsx` (>1500 linhas), `HomeView.tsx` (>1300 linhas) e `useZenithData.ts` (>1100 linhas). Se for mexer neles para o refactor de IA, extraia subcomponentes/hooks primeiro.
- **Dependências Pesadas**: A lib `xlsx` (~430kB) deve ser importada via lazy loading (`import()`) para não inflar o APK do Android.

# TODO (Para antes do lançamento comercial):
- [x] Renomear o pacote no `package.json` (zenith-financial).
- [x] Deletar arquivos `.bak` residuais e pastas de teste.
