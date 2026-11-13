# Zenith Financial 🚀

Aplicativo financeiro mobile-first moderno e inteligente, construído com foco em alta performance, privacidade e arquitetura limpa.

## 🛠️ Stack Tecnológica

- **Frontend:** React 19 + TypeScript + Vite + Tailwind CSS
- **Mobile Engine:** Capacitor 8 (Android)
- **State & Backend:** Firebase / Cloud Firestore
- **AI Engine:** Arquitetura Multi-Provedor com injeção de dependência (`IAIProvider`)
- **Domain Testing:** Vitest

---

## 💻 Comandos Principais

### 1. Desenvolvimento Local
Inicia o servidor de desenvolvimento com hot-reload:
```bash
npm run dev
```

### 2. Testes de Domínio
Executa a suíte completa de testes unitários do núcleo de domínio (`src/domain/`):
```bash
npm run test:domain
```
> **Nota:** Nunca execute `npm test`; use sempre `npm run test:domain`.

### 3. Build & Sincronização Mobile
Gera o bundle web otimizado de produção e sincroniza os assets nativos no projeto Android Capacitor:
```bash
npm run build:android
```

---

## 🏛️ Arquitetura

O projeto segue princípios de arquitetura limpa com isolamento estrito de camadas:
- **`src/domain/`**: Núcleo 100% puro de lógica financeira e regras de negócio, sem dependências de frameworks de UI ou Firebase.
- **`src/lib/adapters/`**: Adaptadores de infraestrutura e serviços externos (Firebase, BCB, Provedores de IA).
- **`src/views/` e `src/components/`**: Camada de apresentação modularizada. Componentes de tela atuam apenas como orquestradores de layout, delegando a renderização a subcomponentes especializados (ex: `src/components/dashboard/`, `src/components/ai/`).
- **`src/hooks/`**: Orquestração e gerenciamento de estado desacoplados.

---

## 💰 Convenção de Aritmética Monetária

O Zenith mantém **duas convenções** de representação monetária (decisão registrada no Sprint 3):

| Camada | Convenção | Uso |
|---|---|---|
| `src/domain/money/Money.ts` | centavos inteiros (`Money`) | domínio puro (tipo opaco) |
| `src/lib/finance/calculators.ts` | `number` + `roundCurrency()` | totais de dashboard, projeções |
| `src/hooks/useTransactionsData.ts` | `number` + `roundCurrency()` | `partialBalance` persistido |

**Regra:** não misturar `Money` e `number` em um mesmo fluxo de persistência.
Conversão legítima: `Money.fromBRL(number)` na entrada e `.toBRL()` na saída.
Todo valor monetário persistido/exibido passa por `roundCurrency()` na fronteira.

Limitação conhecida: `Math.round(value * 100)` não é half-up em fronteiras de ponto
flutuante (ex.: `1.005 → 1.00`). `Money.fromBRL` e `roundCurrency` compartilham a mesma
fórmula, portanto concordam entre si. A migração completa para `Money` está planejada
para o Sprint 4+ (`src/lib/finance/monetary.test.ts` congela o baseline atual).

