# Documento de Handoff — Zenith Financial (Fase 2.3 concluída)

**Instruções:** Cole este documento no início de uma nova conversa com o texto: "Continue este projeto a partir do documento de handoff abaixo."

## Estado Atual
- Repositório: github.com/julianocreatorcontents-style/Zenith-Financial
- Branch principal: `main` (limpa, com merge da Fase 2.3)
- Domínio + Adapters: **178 testes verdes**
- UI: O `YieldProjectionCard` está integrado na Home (substituiu o card "RENDIMENTOS"), usa os 3 temas globais e exibe os logos das instituições via Clearbit.

## Próximo Passo: Fase 3 (Configuração de Investimentos)
O motor está rodando com os dados de DEMO no card porque o Firestore ainda não tem os campos `strategy` e `investmentPolicy` nos assets reais.
Para colocar os dados reais da usuária, precisamos:
1. Criar uma tela/modal para a usuária configurar um ativo: escolher a instituição, a taxa base, o bônus e a convenção (252/365).
2. Salvar esses dados no Firestore (coleção `assets`).
3. O `YieldProjectionCard` vai ler esses dados automaticamente (já que ele usa o `assetToInvestment`).
4. (Opcional) Criar um gráfico de evolução do patrimônio usando as projeções.

## ⚠️ GOTCHAS CRÍTICOS (Termux)
1. **NUNCA rode `bun install` no Termux.** O Bun quebra o Vitest. Se precisar reinstalar: `rm -rf node_modules && npm install`.
2. **Use `npm` para os testes.** (`bun run test:domain` chama o `vitest` local).
3. **Heredoc no Termux:** Se travar, use delimitadores únicos e divida em partes menores que 60 linhas.
4. **Antigravity CLI:** Não use para escrever arquivos, o patch está instável.
