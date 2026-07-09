# Sprint 3.1.2 - Expedição Final

## Objetivo
Fechar o fluxo de Expedição até o recebimento, garantindo que o patrimônio seja atualizado corretamente no destino.

## Principais correções
- Recebimento atualiza `obra_id`.
- Recebimento atualiza `localizacao` com o nome da obra destino.
- Recebimento atualiza `status` conforme opção escolhida: ESTOQUE, EM_USO ou MANUTENCAO.
- Bloqueio para pedido antigo sem `obra_destino_id` válido.
- Correção de contraste nos cartões do AtlasModal.

## Arquivos
- `expedicao.html`
- `JS/AtlasModal.js`
- `JS/AtlasLogistica.js`
- `JS/expedicao.js`
- `JS/atlasWorkflow.js`
- `JS/AtlasGestorReservas.js`

## Teste recomendado
1. Criar pedido novo.
2. Aprovar.
3. Separar.
4. Enviar com motorista/veículo/placa.
5. Receber no destino.
6. Escolher status final.
7. Conferir no patrimônio se local e status foram atualizados.
