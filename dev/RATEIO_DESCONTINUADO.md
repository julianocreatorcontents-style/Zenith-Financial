# Rateio Familiar descontinuado

O Rateio Familiar foi um projeto anterior do Zenith Financial e não faz mais parte do produto.

## Status

- O recurso está desativado e não possui ponto de entrada na interface.
- Não haverá pagamentos, cobranças ou acertos financeiros via PIX.
- O componente legado `RateioFamiliarView` foi mantido no código apenas por questões de histórico.
- As abas, botões e menus que davam acesso ao rateio foram removidos da interface.

## Motivo da desativação

O fluxo dependia de uma chave PIX fixa no código (`CHAVE_PIX`) e da geração de mensagens de cobrança por persona (`gerarMensagemPersona`). Esses trechos permanecem no código legado, mas não são mais acessíveis ao usuário.

A remoção do ponto de entrada evita exposição acidental do recurso e reduz riscos de segurança e de uso indevido.

## Diretriz

Não reativar o Rateio Familiar sem uma revisão completa de segurança, produto e conformidade. Caso o código legado seja removido no futuro, este documento serve como registro da decisão.
