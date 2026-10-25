cd ~/Zenith-Financial

cat > HANDOFF.md <<'HANDOFF_EOF'
# Documento de Handoff — Zenith Financial (Fase 2.2 concluída)

**Instruções:** Cole este documento inteiro no início de uma nova conversa com o texto: "Continue este projeto a partir do documento de handoff abaixo."

## 1. Estado atual do projeto

| Item | Valor |
|---|---|
| Repositório | https://github.com/julianocreatorcontents-style/Zenith-Financial |
| Branch principal | main (limpa, sincronizada) |
| Último commit | c08f0a6 — card de rendimento (YieldProjectionCard) |
| Domínio completo | 178 testes verdes |
| Próximo passo | Fase 2.3 — Refatorar App.tsx e plugar o card |

### Histórico recente


## 2. O que está pronto

### Domínio Puro (`src/domain/`)
- Money: centavos inteiros, imutável.
- Rate: basis points inteiros.
- YieldCalculator: 252 vs 365 dias, faixas (RateTier), arredondamento por tier.
- IncomeTaxPolicy e IofPolicy: tabelas regressivas exatas.
- Investment: entidade validada com daysInvested.
- RecalculateYields: use case de projeção diária e 30/60/90 dias.
- Result<T>: tratamento funcional de erros.

### Adapters (`src/lib/adapters/`)
- assetToInvestment: converte RawAssetDoc (Firestore) em Investment.
- BcbMarketRateAdapter: busca CDI/Selic na API do BCB, com cache em memória e janela de 7 dias.
- FirestoreInvestmentRepo: implementa InvestmentRepoPort filtrando por uid e strategy.
- SystemClockAdapter: implementa ClockPort.

### UI Isolada (`src/views/`)
- YieldProjectionCard.tsx: componente standalone que lê os assets e exibe rendimento bruto/líquido e projeções 30/90 dias. Provado contra extratos reais (99Pay R$ 2,40, MP R$ 3,82/R$ 4,86).
- Ainda não está plugado no App.tsx principal.

## 3. GOTCHAS CRÍTICOS (não perder)

1. NUNCA rode bun install no Termux. O Bun 1.4.4 symlinka o Vitest para um cache global quebrado. Se precisar reinstalar: `rm -rf node_modules && npm install`.
2. Use npm para testar. O script test:domain roda `vitest run` e varre src/domain + src/lib/adapters.
3. Heredoc trava se >60 linhas. Divida em partes com delimitadores únicos (P1_OK, P2_OK).
4. O agy (Antigravity) está instável. Não use para escrever arquivos.
5. noUncheckedIndexedAccess: true no tsconfig.domain.json. Não desligar. Exige guards como `if (tier === undefined) throw...`.

## 4. Próximos passos — Fase 2.3 (Wire-up real)

O card funciona em isolamento. O próximo passo é integrá-lo ao app principal sem quebrar nada.

### O problema
O App.tsx tem ~4000 linhas (194 KB) e concentra toda a lógica de Firestore (onSnapshot, getDocs, writeBatch). Não há InvestmentsView.tsx isolado. Mexer nele às cegas é arriscado.

### Plano sugerido
1. Adicionar React Testing Library (RTL) e configurar jsdom no Vitest.
2. Extrair componentes do App.tsx (começando pelos cards do dashboard) para arquivos separados em src/components/.
3. Criar um hook useInvestments(uid) que carrega RawAssetDoc do Firestore e usa o assetToInvestment.
4. Plugar o `<YieldProjectionCard assets={assets} cdi={cdi} />` no dashboard do App.tsx.
5. Testar o fluxo (Firestore mockado) com RTL.

## 5. Comandos essenciais

```bash
cd ~/Zenith-Financial
git status && git log --oneline -3
bun run test:domain   # 178 passed
bun run dev           # sobe o app original na porta 3000


---

## Confirmar que o arquivo foi criado

Após colar o bloco acima, rode:

```bash
wc -l HANDOFF.md
head -5 HANDOFF.md


