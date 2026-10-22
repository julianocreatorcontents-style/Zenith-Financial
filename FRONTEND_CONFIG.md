# Zenith Financial - Documentação de Configuração Frontend

Este documento detalha a arquitetura visual, componentes e configurações técnicas da interface do usuário (UI) do Zenith Financial.

---

## 🎨 1. Identidade Visual (Design System)

### Esquema de Cores (CSS Variables)
O sistema utiliza variáveis CSS para suportar múltiplos temas (Dark, Light, High Contrast).

| Variável | Valor (Dark) | Descrição |
| :--- | :--- | :--- |
| `--bg-app` | `#0A0A0A` | Fundo principal da aplicação |
| `--bg-card` | `#111111` | Fundo de cards e containers |
| `--border-card` | `#1A1A1A` | Bordas e divisores sutis |
| `--accent` | `#00FFA3` | Cor de destaque (Verde Zenith) |
| `--trend-up` | `#00FFA3` | Indicadores positivos/lucro |
| `--trend-down` | `#FF003C` | Indicadores negativos/gasto |
| `--trend-yield` | `#9B51E0` | Indicadores de rendimento/dividendos |

### Tipografia
- **UI & Headings:** `Inter` (Sans-serif) para legibilidade e modernidade.
- **Dados & Valores:** `JetBrains Mono` (Monospaced) para alinhamento preciso de números e tabelas financeiras.

---

## 📊 2. Sistema de Gráficos (Recharts)

O Zenith utiliza a biblioteca `Recharts` para visualização de dados com as seguintes configurações:

### A. Gráfico de Evolução do Patrimônio (`AreaChart`)
- **Tipo:** Gráfico de Área com gradiente linear.
- **Configuração:**
  - `stroke`: `--accent`
  - `fill`: Gradiente de `--accent` para transparente.
  - `Tooltip`: Customizado para exibir valores em BRL e variações percentuais.

### B. Distribuição de Categorias & Alocação (`PieChart`)
- **Tipo:** Gráfico de Pizza (Donut style).
- **Interatividade:**
  - Opacidade reduzida para fatias não selecionadas.
  - Legenda interativa que destaca a fatia correspondente ao passar o mouse.

### C. Fluxo de Caixa (`BarChart`)
- **Tipo:** Barras empilhadas ou lado a lado.
- **Cores:** Verde (`--trend-up`) para entradas, Vermelho (`--trend-down`) para saídas.

---

## 🪪 3. Componentes de UI (Cards & Layout)

### Metric Cards (MiniMetricCard)
Cards pequenos usados no topo do dashboard para métricas rápidas.
- **Layout:** Ícone à esquerda, Título (pequeno) e Valor (grande).
- **Animação:** `whileHover={{ y: -5 }}` para profundidade.

### Ingestion Hub (FAB)
Botão flutuante centralizado no Nav Dock.
- **Ação:** Abre o hub de captura (IA Scanner, Manual, PIX).
- **Visual:** Sombra neon intensa (`--accent`) para destacar o CTA principal.

### Parcelas Card (ParcelasView)
Implementação recente para gestão de compromissos.
- **Design:** Bordas arredondadas (`32px`), cabeçalho com status Color-Coded.
- **Detalhamento:** Lista interna de parcelas com barra de rolagem customizada.

---

## ⚡ 4. Animações & Transições (Framer Motion)

- **Route Transitions:** Fade-in e slide-up para novos tabs.
- **Micro-interações:**
  - Botões reduzem de escala ao clicar (`whileTap={{ scale: 0.95 }}`).
  - Cards aparecem com efeito escalonado (staggered) usando `AnimatePresence`.
  - Layout animado (`layout` prop) para filtros dinâmicos na visualização de parcelas.

---

## 🛠️ 5. Configurações Técnicas

- **Layout:** Mobile-first com Grid system para expansão em Desktop (até `max-w-7xl`).
- **Navegação:** `currentTab` state gerencia a renderização condicional dos módulos principais.
- **Privacidade:** O `privacyMode` substitui valores numéricos por `••••••` via condicionais simples no JSX.
- **Ícones:** Padronizados via `lucide-react` com tamanho médio de `20px` (sidebar) e `24px` (nav dock).

---

**Última Atualização:** 24 de Abril de 2026
**Responsável:** Zenith AI Squad
