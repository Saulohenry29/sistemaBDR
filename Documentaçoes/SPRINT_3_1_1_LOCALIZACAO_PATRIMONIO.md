# Sprint 3.1.1 — Recebimento atualiza localização do patrimônio

## Correção
Ao confirmar recebimento normal, o Atlas agora atualiza o patrimônio com:

- `obra_id = obra_destino_id`
- `localizacao = nome da obra destino`
- `status = ESTOQUE / EM_USO / MANUTENCAO` conforme escolhido no recebimento

## Segurança
O recebimento agora bloqueia pedidos antigos sem `obra_destino_id` válido, evitando transferir patrimônio para obra inexistente.

## Arquivo principal
- `JS/AtlasLogistica.js`
