# Auditoria Completa da Área de Configurações - Zenith Financial

> **Data da Auditoria:** 09/11/2026  
> **Status:** Análise Diagnóstica (Nenhum arquivo de código foi alterado)

---

## 1. Mapeamento Geral de Arquivos de Configuração

Os arquivos que concentram ou afetam configurações de usuário no app são:

| Arquivo | Responsabilidade |
| :--- | :--- |
| `src/types/app.ts` | Definição das interfaces `Settings`, `ZenithConfig`, `MasterStates`, `ChartSlot`, `CategorySlot`, `FinancialGoalsConfig`. |
| `src/hooks/useUserSettings.ts` | Hook que gerencia o listener e estado de `profile`, `settings` (Firestore `settings/{uid}`), `investorProfile`, `privacyMode` e detecção de biometria. |
| `src/hooks/useZenithData.ts` | Orquestrador principal; expõe `togglePrivacyMode` e `updateGoals`. |
| `src/App.tsx` | Armazena `visualSettings` e `geminiApiKey` (via `localStorage`), aplica o tema (`applyTheme`) e orquestra o `ProfileDrawer` e o modal de Biometria. |
| `src/components/drawers/ProfileDrawer.tsx` | Drawer lateral com páginas: `menu`, `profile`, `notifications`, `settings`, `ai_key` e `trash`. |
| `src/components/HeritageSettings.tsx` | Painel de configurações avançadas do dashboard e estados mestre (embarcado dentro de `ProfileDrawer` na aba `settings`). |
| `src/components/settings/GlobalSettingsSection.tsx` | Seção de controles mestres: Temas Visuais, Idioma, Modo Privacidade e Insights IA Global. |
| `src/components/settings/ChartFilterCard.tsx` | Seção de filtros de visualização de data/período do dashboard (Período, Mês, Dia). |
| `src/components/settings/DashboardSlotConfigItem.tsx` | Item reordenável da lista única do dashboard: visibilidade, cores, opacidade, tipo visual, granularidade, timeframe, IA e parâmetros de projeção. |
| `src/components/CardSettingsPanel.tsx` | Painel de customização visual dos cards (cores, alturas, linhas, fontes, opacidades, eixos). |
| `src/components/dashboard/GoalsProgressChart.tsx` | Card com modal embutido para edição das metas financeiras (`emergencyReserve`, `financialFreedom`). |
| `src/components/InvestmentPolicyModal.tsx` | Modal de políticas de investimento e indexadores (atualmente órfão/desconectado). |

---

## 2. Tabela de Configurações do Usuário

Abaixo está o inventário de todas as configurações identificadas no app:

| Nome da Configuração | Onde é renderizada atualmente (Arquivo) | Componente / Estado Afetado | Onde é persistida |
| :--- | :--- | :--- | :--- |
| **Temas Visuais (Global)** | `src/components/settings/GlobalSettingsSection.tsx` | `masterStates.tema_global` → `applyTheme()` → atributo `data-theme` na raiz `<html>` | Firestore: `zenith_config.master_states.tema_global` & localStorage |
| **Tema Root (Legado)** | *Não renderizada em tela* | `settings.theme` ('dark' \| 'light' \| 'high-contrast') | Firestore: `settings.theme` |
| **Customização Visual de Cards** | `src/components/CardSettingsPanel.tsx` (dentro de `ProfileDrawer.tsx`) | `visualSettings` em `App.tsx` (controla variáveis CSS `--accent`, cores, fontes e alturas) | `localStorage['zenith_visual_settings']` (Não sincroniza no Firestore) |
| **Idioma (Global)** | `src/components/settings/GlobalSettingsSection.tsx` | `masterStates.idioma` ('Português (Brasil)', 'English (US)', 'Español') | Firestore: `zenith_config.master_states.idioma` & localStorage |
| **Idioma Root (i18n do App)** | *Não possui UI própria de alteração* | `settings.language` ('pt-BR' \| 'en-US') → afeta a função `t(pt, en)` de todas as views | Firestore: `settings.language` |
| **Modo Privacidade (Configurações)**| `src/components/settings/GlobalSettingsSection.tsx` | `masterStates.modo_privacidade` | Firestore: `zenith_config.master_states.modo_privacidade` |
| **Modo Privacidade (Dashboard)** | `src/views/HomeView.tsx` (ícone de olho ao lado do Saldo) | `privacyMode` em `useZenithData.ts` e `App.tsx` (mascara saldos e valores em todo o app) | Firestore: `settings.privacyMode` |
| **Insights IA Global (Master Switch)** | `src/components/settings/GlobalSettingsSection.tsx` | `masterStates.insights_ia_ativo` | Firestore: `zenith_config.master_states.insights_ia_ativo` |
| **Chave de API do Gemini** | `src/components/drawers/ProfileDrawer.tsx` (`AiKeySection`) | `geminiApiKey` em `App.tsx` → chamadas do orquestrador de IA em `useZenithData` | `localStorage['zenith_gemini_key']` |
| **Nome de Exibição** | `src/components/drawers/ProfileDrawer.tsx` (`ProfileSection`) | `profile.displayName` → cabeçalho do app e saudação | Firestore: `users/{uid}.displayName` |
| **Foto de Perfil** | `src/components/drawers/ProfileDrawer.tsx` (`ProfileSection`) | `profile.photoURL` → avatar do cabeçalho e drawer | Firestore: `users/{uid}.photoURL` (base64) |
| **Perfil de Investidor** | `src/components/drawers/ProfileDrawer.tsx` (`ProfileSection`) | `investorProfile` → `AssetAllocationChart`, `InvestmentsView` e contexto do prompt da IA | Firestore: `users/{uid}.investor_profile` |
| **Biometria (Ativação Inicial)** | `src/App.tsx` (Modal de confirmação pós-cadastro) | `isBiometryModalOpen` em `useUserSettings.ts` | `localStorage['biometry_{uid}']` & `localStorage['biometry_active_{uid}']` |
| **Ordenação do Dashboard** | `src/components/HeritageSettings.tsx` (`Reorder.Group`) | `localConfig.dashboard_order` → ordem dos blocos na `HomeView` | Firestore: `zenith_config.dashboard_order` & localStorage |
| **Expansão da Gestão do Dash** | `src/components/HeritageSettings.tsx` | `masterStates.dashboard_management_expanded` (abre/fecha sanfona de gestão) | Firestore: `zenith_config.master_states.dashboard_management_expanded` |
| **Visibilidade de Gráfico / Métrica** | `src/components/settings/DashboardSlotConfigItem.tsx` | `ChartSlot.visible` → renderização condicional na `HomeView` | Firestore: `zenith_config.charts[id].visible` ou `metrics[id].visible` |
| **Tipo Visual do Gráfico** | `src/components/settings/DashboardSlotConfigItem.tsx` | `ChartSlot.visualType` ('Candles', 'Linha', 'Área', 'Barra', 'Coluna') | Firestore: `zenith_config.charts[id].visualType` |
| **Cor do Gráfico / Métrica** | `src/components/settings/DashboardSlotConfigItem.tsx` | `ChartSlot.color` → stroke/fill nos gráficos do dashboard | Firestore: `zenith_config.charts[id].color` ou `metrics[id].color` |
| **Opacidade do Gráfico** | `src/components/settings/DashboardSlotConfigItem.tsx` | `ChartSlot.opacity` → opacidade dos cards e gráficos | Firestore: `zenith_config.charts[id].opacity` |
| **Granularidade do Gráfico** | `src/components/settings/DashboardSlotConfigItem.tsx` | `ChartSlot.granularity` ('Ano', 'Mês', 'Dia') | Firestore: `zenith_config.charts[id].granularity` |
| **Timeframe do Gráfico** | `src/components/settings/DashboardSlotConfigItem.tsx` | `ChartSlot.timeframe` ('7D', '15D', '30D', '6M', '1A') | Firestore: `zenith_config.charts[id].timeframe` |
| **IA Insights por Gráfico** | `src/components/settings/DashboardSlotConfigItem.tsx` | `ChartSlot.predictiveInsights` → `PatrimonyEvolutionChart` (exibe predições se disponível) | Firestore: `zenith_config.charts[id].predictiveInsights` |
| **Projeção: Ano Alvo** | `src/components/settings/DashboardSlotConfigItem.tsx` | `ChartSlot.projectionTargetYear` → motor de projeção patrimonial | Firestore: `zenith_config.charts['CHART_EVOL_PATRIMONIO'].projectionTargetYear` |
| **Projeção: Mês Alvo** | `src/components/settings/DashboardSlotConfigItem.tsx` | `ChartSlot.projectionTargetMonth` → motor de projeção patrimonial | Firestore: `zenith_config.charts['CHART_EVOL_PATRIMONIO'].projectionTargetMonth` |
| **Projeção: Incluir Fluxo de Caixa** | `src/components/settings/DashboardSlotConfigItem.tsx` | `ChartSlot.projectionIncludeCashFlow` → soma entradas/saídas agendadas na projeção | Firestore: `zenith_config.charts['CHART_EVOL_PATRIMONIO'].projectionIncludeCashFlow` |
| **Projeção: Modo Histórico/Projeção** | `src/components/settings/DashboardSlotConfigItem.tsx` & `HomeView.tsx` | `ChartSlot.evolutionViewMode` / `evolutionView` ('historico' \| 'projecao') | Firestore: `zenith_config.charts['CHART_EVOL_PATRIMONIO'].evolutionViewMode` |
| **Projeção: Exibição de Impostos** | `src/components/settings/DashboardSlotConfigItem.tsx` & `HomeView.tsx` | `ChartSlot.projectionTaxMode` / `projectionTaxMode` ('liquido' \| 'bruto') | Firestore: `zenith_config.charts['CHART_EVOL_PATRIMONIO'].projectionTaxMode` |
| **Projeção: Aporte Mensal** | `src/components/settings/DashboardSlotConfigItem.tsx` | `ChartSlot.monthlyContribution` → cálculo de juros compostos na projeção | Firestore: `zenith_config.charts['CHART_EVOL_PATRIMONIO'].monthlyContribution` |
| **Filtro do Gráfico (Período/Mês/Dia)**| `src/components/settings/ChartFilterCard.tsx` | Filtro de período e data nos gráficos | Estado local via `onChartFilterChange` |
| **Metas Financeiras (Reserva/Liberdade)**| `src/components/dashboard/GoalsProgressChart.tsx` | `FinancialGoalsConfig` (`emergencyReserve`, `financialFreedom`) | Firestore: `zenith_config.goals` |
| **Termos Customizados** | *Sem UI de alteração* | `settings.customTerms` → lido em `HomeView.tsx` (`settings?.customTerms?.['Saldo']`) | Firestore: `settings.customTerms` |
| **Estilos por Categoria** | *Sem UI de alteração* | `CategorySlot` / `AdvancedInterface` → lido por `resolveStyle()` em `HomeView` | Firestore: `zenith_config.categories` |

---

## 3. Diagnóstico de Sobreposições e Conflitos

### 🔴 3.1. Conflito Crítico de Idioma (Desconexão Funcional)
* **O Problema:** No `GlobalSettingsSection.tsx`, alterar o seletor de idioma dispara `onUpdateMaster('idioma', value)` e salva em `zenith_config.master_states.idioma` ('Português (Brasil)', 'English (US)', 'Español').
* **O Efeito Colateral:** TODAS as telas do app, hooks e views usam `settings.language` ('pt-BR' | 'en-US') para alternar textos via `t(pt, en)`. O campo `settings.language` **nunca é atualizado**. 
* **Resultado:** Trocar o idioma no menu de configurações **não traduz o aplicativo**.

### 🔴 3.2. Fragmentação do Tema (Tripla Camada Conflitante)
Existem 3 lugares concorrentes controlando o tema visual:
1. `Settings.theme` ('dark' | 'light' | 'high-contrast'): campo na raiz de `Settings`, ignorado pela UI atual de configurações.
2. `master_states.tema_global` ('Claro' | 'Escuro' | 'Contraste'): alterado em `GlobalSettingsSection.tsx` e aplicado via `applyTheme()`.
3. `CardSettingsPanel.tsx` (`visualSettings`): customização com seletor de cor hexadecimal (`accentColor`, `textColor`, etc.).
* **O Conflito:** Na mesma aba "Configurações" do `ProfileDrawer`, o usuário vê os dois painéis empilhados (`CardSettingsPanel` e `HeritageSettings`). Quando `visualSettings.isCustomEnabled` está ativo, o `App.tsx` executa `if (visualSettings.isCustomEnabled) return;` e **anula qualquer troca no Tema Global**.

### 🔴 3.3. Sobreposição do Modo Privacidade
* **Dashboard (`HomeView.tsx`):** O botão de olho no topo do dashboard chama `togglePrivacyMode()` que grava na raiz do documento: `settings.privacyMode = !privacyMode`.
* **Configurações (`GlobalSettingsSection.tsx`):** O switch de privacidade grava em `zenith_config.master_states.modo_privacidade`.
* **O Conflito:** Alterar o switch nas Configurações não atualiza `settings.privacyMode`. O app acaba mantendo dois booleanos assíncronos para a mesma funcionalidade.

### 🔴 3.4. Duplicidade de Controles da Projeção Patrimonial
* Controles de `Modo de Visualização` (Histórico vs Projeção) e `Exibição de Impostos` (Líquido vs Bruto) podem ser alternados diretamente no card da `HomeView` e também dentro da sanfona de expansão de `CHART_EVOL_PATRIMONIO` no `DashboardSlotConfigItem`.

---

## 4. Diagnóstico de Configurações Órfãs e Placebos

### 🟡 4.1. Configurações "Placebo" (Existem na UI mas não exercem efeito)
1. **Insights IA Global (`insights_ia_ativo`):**
   * Existe como switch no `GlobalSettingsSection.tsx` e grava no Firestore.
   * **Realidade:** Nenhuma linha do código de IA (`ZenithIAView.tsx`, `useAITools.ts`, `ai.ts`, etc.) lê essa propriedade. O switch não ativa nem desativa absolutamente nada.
2. **Botão "Sync" no `DashboardSlotConfigItem.tsx`:**
   * Botão com ícone `RefreshCw` estilizado em cada item do dashboard, porém sem nenhum `onClick` ou integração.

### 🟡 4.2. Configurações "Órfãs" (Existem no Modelo/Banco, mas não possuem UI)
1. **Termos Customizados (`settings.customTerms`):**
   * A interface `Settings` define `customTerms: Record<string, string>`.
   * A `HomeView.tsx` lê `settings?.customTerms?.['Saldo']` para permitir renomear rótulos.
   * **Realidade:** Não existe nenhuma tela, modal ou input para o usuário definir esses termos customizados.
2. **Estilização Avançada de Categorias (`zenith_config.categories`):**
   * Tipado em `CategorySlot` e `AdvancedInterface` (`cor_destaque`, `main_color`, `grid_style`, `show_values`, `margin_top`).
   * A `HomeView.tsx` possui a função `resolveStyle()` que consulta esses campos.
   * **Realidade:** Não há nenhuma UI no app para o usuário personalizar os estilos das categorias. Além disso, as categorias padrão de `useUserSettings.ts` (Alimentação, Moradia...) diferem das de `HeritageSettings.tsx` (evolution, allocation, cashflow).
3. **Controles de Gráficos no `ChartSlot`:**
   * `tooltipsEnabled`: suportado nos componentes de gráfico e no `ChartSlot`, mas sem toggle no `DashboardSlotConfigItem`.
   * `isGradient`: suportado nos gráficos, mas sem controle na UI.
   * `touchToZoom`: presente na interface e nos defaults de gráficos, mas sem suporte nos componentes nem UI.
4. **Campos Abandonados na raiz de `Settings`:**
   * `activeWidgets`: array de strings sem uso.
   * `yieldColor`: cor padrão `#00FFA3` nunca lida por nenhum componente.
   * `granularity` ('day' | 'month' | 'year'): abandonada na raiz de `Settings` (cada gráfico usa a sua própria em `ChartSlot`).
5. **Biometria Pós-Onboarding:**
   * O usuário só pode responder sobre biometria uma única vez quando a conta é criada.
   * Não existe nenhum botão ou toggle nas telas de Perfil ou Configurações para ativar ou desativar a biometria posteriormente.
6. **Modal de Políticas de Investimento (`InvestmentPolicyModal.tsx`):**
   * Arquivo completo com presets para contas de rendimento (99Pay, Mercado Pago CDI/Selic), mas **não é importado nem referenciado em nenhum lugar do projeto**.

---

## 5. Resumo Executivo para Próximos Passos

1. **Unificação do Tema e Visual:** Fundir `CardSettingsPanel` e `GlobalSettingsSection` em uma experiência coerente de customização de aparência, evitando que um sobreponha ou quebre o outro.
2. **Correção do Idioma:** Conectar a seleção de idioma do `GlobalSettingsSection` diretamente a `settings.language` para que o app realmente responda à escolha do usuário.
3. **Consolidação do Modo Privacidade:** Utilizar uma única fonte de verdade (`settings.privacyMode`), sincronizando tanto o botão do dashboard quanto o switch de configurações.
4. **Limpeza do Modelo de Dados:** Eliminar campos mortos (`activeWidgets`, `yieldColor`, `Settings.granularity`) ou transformar em recursos reais (como a UI para `customTerms`).
5. **Decisão sobre Placebos e Órfãos:** Decidir se `insights_ia_ativo` deve realmente desligar os recursos de IA ou ser removido; dar ação ao botão Sync ou removê-lo; e incluir o toggle de Biometria na tela de Perfil/Configurações.
