# Sprint 2.9 — Atlas Logística

## Objetivo
Completar o fluxo Origem → Destino após a aprovação do pedido.

## Fluxo
Solicitação → Aprovação → Reserva → Separação → Aguardando retirada → Em trânsito → Recebimento → Transferência automática do patrimônio.

## Regras oficiais
- O patrimônio só muda para a obra destino após recebimento confirmado.
- Ao sair da origem, o patrimônio fica `EM_TRANSITO`.
- A saída registra motorista, veículo/transportadora, placa e observação.
- Recebimento com divergência não deve encerrar o fluxo como recebido normal.
- O fluxo é Origem → Destino, nunca CD fixo.

## Arquivos
- `JS/AtlasLogistica.js`: controla trânsito e recebimento.
- `JS/atlasWorkflow.js`: mantém as regras centrais.
- `JS/expedicao.js`: interface de separação, retirada e recebimento.
