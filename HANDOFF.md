# Documento de Handoff — Zenith Financial (Fase 4 concluída)

**Instruções:** Cole este documento no início de uma nova conversa com o texto: "Continue este projeto a partir do documento de handoff abaixo."

## Estado Atual
- Repositório: github.com/julianocreatorcontents-style/Zenith-Financial
- Branch principal: `main` (Fases 1, 2, 3 e 4 concluídas)
- Domínio + Adapters: **184 testes verdes**
- Lint & Types: **0 erros** em `node node_modules/typescript/bin/tsc --noEmit` e `tsc -p tsconfig.domain.json --noEmit`.
- Segurança Firestore: `firestore.rules` implantado com isolamento estrito single-user por `uid` em todas as coleções (`users`, `settings`, `assets`, `transactions`, `ddas`, `user_rules`, `trash`, `installments`).
- UI & Projeção:
  - Card "Evolução do Patrimônio" possui seletor alternável **Histórico / Projeção**.
  - A projeção patrimonial de 12 meses é calculada pelo adapter `calculateNetWorthProjection`, alimentado pelas taxas reais e faixas (`YieldCalculator.projectTiered`).
  - O `YieldProjectionCard` na Home exibe rendimentos brutos/líquidos com limites de faixa e logos via Clearbit.
- CRUD & Persistência:
  - `InvestmentPolicyModal` permite configurar e criar ativos com taxas base, bônus e convenções (252/365).
  - Sincronização em tempo real via listeners `onSnapshot` do Firestore.

## Próximos Passos (Fase 5)
1. **Projeção Líquida no Gráfico (Opcional)**: aplicar tabela regressiva de IR e IOF individualmente por ativo na curva de projeção para paridade com o card de rendimentos.
2. **Histórico de Taxas & Dinamismo BCB**: desacoplar a taxa CDI padrão fixa (13,65%) consumindo a taxa mais recente via `BcbMarketRateAdapter`.
3. **Otimização de Bundles (Spark Plan)**: converter `xlsx` para importação dinâmica assíncrona (`import('xlsx')`) no ingestion hub, reduzindo ~430 kB do bundle inicial.
4. **Decomposição do Monolito `App.tsx`**: modularizar abas e seções (Dashboard, Carteira, Transações, Ingestão) em subviews dedicadas.

## ⚠️ GOTCHAS CRÍTICOS (Termux)
1. **NUNCA rode `bun install` no Termux.** Use `npm install`.
2. **Testes:** os scripts `npm run ...` falham com `not found` por causa do shebang `/usr/bin/env`. Rode direto:
   - `node node_modules/vitest/vitest.mjs run`
   - `node node_modules/typescript/bin/tsc --noEmit`
   - `node node_modules/typescript/bin/tsc -p tsconfig.domain.json --noEmit`
3. **Heredoc:** Divida blocos em partes menores que 60 linhas.
4. **Antigravity CLI:** Não use para escrever arquivos, o patch está instável.
5. **Firebase CLI:** Token expira a cada 1 hora. Se o script de leitura falhar, rode `firebase projects:list` para renovar.
