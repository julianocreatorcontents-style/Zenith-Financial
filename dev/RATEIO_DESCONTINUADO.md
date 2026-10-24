# Rateio Familiar descontinuado

O Rateio Familiar foi um projeto anterior do Zenith Financial e não faz mais parte do produto.

## Status

- O recurso foi removido por completo do código e não possui ponto de entrada na interface.
- Não há pagamentos, cobranças ou acertos financeiros via PIX.
- Foram removidos `RateioFamiliarView`, `personas.ts`, `StorageView`, listeners de `family_members`/`reports` e as coleções correspondentes nas Security Rules.
- O app é 100% focado em finanças pessoais de um único usuário.

## Motivo da desativação

O fluxo dependia de uma chave PIX fixa no código (`CHAVE_PIX`), geração de mensagens de cobrança por persona (`gerarMensagemPersona`) e coleções compartilhadas (`family_members`, `participants`, `splits`, `reports`). Todo esse legado foi eliminado, reduzindo riscos de segurança e de uso indevido.

## Diretriz

Não reativar o Rateio Familiar sem uma revisão completa de segurança, produto e conformidade. Este documento serve como registro da decisão.
