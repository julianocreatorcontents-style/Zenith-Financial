# AUDITORIA_FRONTEND.md - Zenith Financial Dashboard

**Data da Auditoria:** 06 de Abril de 2026
**Status Geral:** Funcional com lacunas de UX e inconsistências de navegação ("Fios Soltos").

---

## 1. Mapeamento de UI (A Face do Software)

### BottomNavigationBar (NAV DOCK)
- **Status:** ✅ Funcional.
- **Vínculos:**
    - `Início` -> `setCurrentTab('Início')` (Linha 2235)
    - `Carteira` -> `setCurrentTab('Carteira')` (Linha 2236)
    - `FAB (Plus)` -> `setIsIngestionHubOpen(true)` (Linha 2241)
    - `Histórico` -> `setCurrentTab('Transações')` (Linha 2248)
    - `Mais` -> `setCurrentTab('Mais')` (Linha 2249)
- **Observação:** As funções `onClick` estão corretamente vinculadas ao estado `currentTab`.

### Gráfico de Pizza (Asset Allocation & Category Distribution)
- **Status:** ⚠️ Lacuna de Interatividade.
- **Investigação:**
    - `CHART_ALOC_ATIV` (Linhas 1218-1232): O componente `Pie` e `Cell` **não possuem** eventos `onClick`.
    - `CHART_DIST_CATEG` (Linhas 1347-1361): O componente `Pie` e `Cell` **não possuem** eventos `onClick`.
- **Veredito:** Não existe funcionalidade de filtro ao clicar nos setores do gráfico.

### Card 'A Receber' (METRIC_ARECEBER)
- **Status:** ✅ Conectado.
- **Investigação:**
    - O card é um `MiniMetricCard` (Linha 1046).
    - Ele **não possui** propriedade clicável no container principal (apenas botão de configurações).
    - O componente `SplitsList` (Linha 1060) está injetado como `children` e é visível diretamente no card, permitindo a visualização dos devedores (Valdemar, Linda, etc.) sem necessidade de um modal extra.

### Inputs e Câmera (Scanner QR/Boleto)
- **Status:** ⚠️ Simulação via File Picker.
- **Investigação:**
    - O botão `scanner` no `IngestionHub` (Linha 2642) chama `handleUniversalIngestion('scanner')`.
    - `handleUniversalIngestion` (Linha 628) cria um elemento `<input type="file" accept="image/*,application/pdf">`.
- **Veredito:** Não utiliza a API nativa `navigator.mediaDevices.getUserMedia`. Depende da capacidade do navegador/sistema operacional de abrir a câmera através do seletor de arquivos.

---

## 2. Sincronização de Estado (Data Binding)

### Campo `pix_key`
- **Status:** ✅ Sincronizado.
- **Caminho do Dado:**
    1. Carregado do Firestore no `Profile Listener` (Linha 421).
    2. Armazenado no estado `profile` (Linha 305).
    3. Injetado no `SplitsList` via prop `pixKey={profile?.pix_key}` (Linha 1065).
    4. Utilizado na função `handleCopyPix` (Linha 1505) para cópia no clipboard.

### Seletor de Participantes (ReviewModal)
- **Status:** ✅ Dados Reais.
- **Investigação:**
    - O `ReviewModal` (Linha 2691) recebe a prop `users`.
    - A variável `users` é alimentada por um `onSnapshot` na coleção `users` (Linha 340).
- **Veredito:** O seletor consome dados reais do banco de dados, não sendo um array estático.

---

## 3. Detecção de Código Morto (Resquícios)

### Remanescentes de Projetos Anteriores
- **Status:** 🔍 Limpo.
- **Investigação:** Não foram encontrados termos como "Commercial Partner" ou lógica de negócios estranha ao Zenith Financial no código fonte (`src/`). Resquícios apenas em licenças de bibliotecas no `node_modules`.

### Fios Soltos (Loose Wires)
1. **Navegação 'Carteira' vs 'Investimentos':**
    - O Nav Dock define `currentTab` como `'Carteira'` (Linha 2236).
    - A renderização condicional do "Coming Soon" verifica `currentTab === 'Investimentos'` (Linha 1997).
    - **Resultado:** Ao clicar em 'Carteira', o usuário verá uma tela vazia (ou apenas o fundo) em vez da mensagem "Em breve", pois o ID não bate.
2. **Botão 'Mais':**
    - O Nav Dock define `currentTab` como `'Mais'` (Linha 2249).
    - A renderização condicional (Linha 1997) inclui `Mais`, então este funciona (mostra "Em breve").
3. **Botão de Configurações nos Cards:**
    - Todos os `MiniMetricCard` possuem um botão de engrenagem que chama `setIsHeritageSettingsOpen(true)` (Linha 2864).
    - O modal `HeritageSettings` está implementado, mas as configurações de "Cor Principal" ou "Opacidade" aplicadas lá podem não refletir em todos os sub-componentes se o `resolveStyle` não estiver perfeitamente mapeado.

---

## 4. Veredito de Estabilidade (Auditor)

As importações de `lucide-react` e `motion/react` estão corretas e seguem os padrões da versão 12 do Motion. O sistema é estável, mas requer ajuste na lógica de `currentTab` para evitar telas brancas na navegação e a implementação de `onClick` nos gráficos para atender à expectativa de interatividade do usuário.

**Assinado:**
*Agente 05 (Auditor)*
*Agente 02 (Builder)*
