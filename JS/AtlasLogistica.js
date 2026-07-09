/* =========================================================
   ATLAS LOGÍSTICA V1.3 - Sprint 3.1.2
   Arquivo: JS/AtlasLogistica.js

   Responsável por:
   • Finalizar separação
   • Liberar pedido para retirada
   • Registrar motorista / veículo / placa
   • Colocar pedido em EM_TRANSITO
   • Confirmar recebimento no destino
   • Acionar Workflow, Notificações e Event Store

   Regra oficial:
   Origem → Destino. Nunca fixar CD.
========================================================= */
(function(){
  "use strict";

  if(window.AtlasLogistica && window.AtlasLogistica.__loaded) return;

  const AtlasLogistica = {
    __loaded:true,
    versao:"1.3.1-sprint-3.1.3-ajustes-transito"
  };

  function db(){
    return window.client || window.supabaseClient || window.clientSupabase || globalThis.client;
  }

  function usuarioAtual(){
    try{
      return JSON.parse(
        localStorage.getItem("usuario_logado") ||
        localStorage.getItem("usuarioLogado") ||
        localStorage.getItem("usuarioAtual") ||
        "null"
      );
    }catch(e){ return null; }
  }

  function nomeUsuario(){
    const u = usuarioAtual();
    return u?.nome || u?.usuario || "SISTEMA";
  }

  function emitir(evento, dados){
    try{
      if(window.AtlasEvents && typeof window.AtlasEvents.emit === "function"){
        window.AtlasEvents.emit(evento, dados || {});
      }
    }catch(e){}
  }

  async function buscarPedido(pedidoId){
    if(window.AtlasWorkflow?.buscarPedido) return await window.AtlasWorkflow.buscarPedido(pedidoId);
    const banco = db();
    const { data, error } = await banco.from("pedidos_retirada").select("*").eq("id", pedidoId).single();
    if(error) throw error;
    return data;
  }

  async function buscarItensPedido(pedidoId){
    if(window.AtlasWorkflow?.buscarItensPedido) return await window.AtlasWorkflow.buscarItensPedido(pedidoId);
    const banco = db();
    const { data, error } = await banco.from("itens_retirada").select("*").eq("pedido_id", pedidoId);
    if(error) throw error;
    return Array.isArray(data) ? data : [];
  }

  async function finalizarSeparacao(pedidoId){
    if(!window.AtlasWorkflow?.finalizarSeparacao){
      throw new Error("AtlasWorkflow.finalizarSeparacao não carregado.");
    }

    const resultado = await window.AtlasWorkflow.finalizarSeparacao(pedidoId);

    emitir("pedido.liberado_retirada", {
      modulo:"EXPEDICAO",
      pedido_id:Number(pedidoId),
      usuario_nome:nomeUsuario(),
      descricao:"Separação finalizada. Pedido aguardando retirada."
    });

    return resultado;
  }

  async function enviarPedido(pedidoId, dadosTransporte){
    const banco = db();
    if(!banco) throw new Error("Supabase não carregado.");

    const pedido = await buscarPedido(pedidoId);
    const agora = new Date().toISOString();
    const payloadPedido = {
      motorista_nome: dadosTransporte?.motorista_nome || dadosTransporte?.motorista || null,
      veiculo_placa: dadosTransporte?.veiculo_placa || dadosTransporte?.placa || null,
      transportadora: dadosTransporte?.transportadora || dadosTransporte?.veiculo || null,
      observacao_transporte: dadosTransporte?.observacao_transporte || dadosTransporte?.observacao || null,
      data_saida_cd: agora,
      usuario_saida_cd: nomeUsuario()
    };

    const { error:errPedido } = await banco
      .from("pedidos_retirada")
      .update(payloadPedido)
      .eq("id", pedidoId);

    if(errPedido) throw errPedido;

    if(!window.AtlasWorkflow?.enviarPedido){
      throw new Error("AtlasWorkflow.enviarPedido não carregado.");
    }

    const resultado = await window.AtlasWorkflow.enviarPedido(pedidoId, payloadPedido);

    // Patrimônio fica em trânsito, mas ainda não troca para o destino.
    const itens = await buscarItensPedido(pedidoId);
    for(const item of itens.filter(i => i.patrimonio_id && !["RECUSADO","CANCELADO"].includes(String(i.status || "").toUpperCase()))){
      try{
        await banco.from("patrimonio").update({ status:"EM_TRANSITO" }).eq("id", item.patrimonio_id);
      }catch(e){ console.warn("AtlasLogistica: não foi possível marcar patrimônio em trânsito", item.patrimonio_id, e?.message || e); }
    }

    emitir("pedido.em_transito", {
      modulo:"LOGISTICA",
      pedido_id:Number(pedidoId),
      usuario_nome:nomeUsuario(),
      obra_origem_id:pedido.obra_origem_id || null,
      obra_destino_id:pedido.obra_destino_id || pedido.obra_id || null,
      descricao:"Pedido saiu da origem e está em trânsito.",
      dados_json:{...payloadPedido}
    });

    return resultado;
  }

  async function buscarObraPorId(obraId){
    if(!obraId) return null;
    const banco = db();
    const { data, error } = await banco
      .from("obras")
      .select("id,codigo_obra,nome")
      .eq("id", obraId)
      .maybeSingle();

    if(error){
      console.warn("AtlasLogistica: falha ao buscar obra destino", obraId, error.message);
      return null;
    }
    return data || null;
  }

  function nomeObraFormatado(obra){
    if(!obra) return null;
    const cod = String(obra.codigo_obra || "").trim();
    const nome = String(obra.nome || "").trim();
    if(cod && nome && !nome.startsWith(cod)) return `${cod} - ${nome}`;
    return nome || cod || null;
  }

  async function receberPedido(pedidoId, dadosRecebimento){
    const banco = db();
    if(!banco) throw new Error("Supabase não carregado.");

    const agora = new Date().toISOString();
    const payloadPedido = {
      usuario_recebimento:nomeUsuario(),
      data_recebimento:agora,
      usuario_recebimento_obra:nomeUsuario(),
      data_recebimento_obra:agora,
      divergencia:!!dadosRecebimento?.divergencia,
      observacao_divergencia:dadosRecebimento?.observacao || null
    };

    const { error:errPedido } = await banco
      .from("pedidos_retirada")
      .update(payloadPedido)
      .eq("id", pedidoId);

    if(errPedido) throw errPedido;

    if(!window.AtlasWorkflow?.receberPedido){
      throw new Error("AtlasWorkflow.receberPedido não carregado.");
    }

    const resultado = await window.AtlasWorkflow.receberPedido(pedidoId, dadosRecebimento || {});

    const evento = dadosRecebimento?.divergencia ? "pedido.recebido_divergencia" : "pedido.recebido";
    emitir(evento, {
      modulo:"LOGISTICA",
      pedido_id:Number(pedidoId),
      usuario_nome:nomeUsuario(),
      descricao:dadosRecebimento?.divergencia ? "Pedido recebido com divergência." : "Pedido recebido sem divergência.",
      dados_json:{...payloadPedido}
    });

    if(!dadosRecebimento?.divergencia){
      const pedido = await buscarPedido(pedidoId);
      const itens = await buscarItensPedido(pedidoId);

      // REGRA OFICIAL SPRINT 3.1.1:
      // Recebimento só pode transferir patrimônio para obra_destino_id válido.
      // Não usa mais obra_id antigo do pedido, para evitar obra fantasma.
      const destinoId = pedido.obra_destino_id ? Number(pedido.obra_destino_id) : null;
      if(!destinoId){
        throw new Error("Destino inválido: este pedido não possui obra_destino_id. Corrija o destino do pedido antes de receber.");
      }

      const obraDestino = await buscarObraPorId(destinoId);
      if(!obraDestino){
        throw new Error("Destino inválido: a obra/setor destino não existe mais no cadastro. Corrija o destino antes de receber.");
      }

      const localizacaoDestino = nomeObraFormatado(obraDestino);
      const statusFinal = String(dadosRecebimento?.status_final || "ESTOQUE").toUpperCase();
      const statusPermitidos = ["ESTOQUE", "EM_USO", "MANUTENCAO"];
      const statusPatrimonio = statusPermitidos.includes(statusFinal) ? statusFinal : "ESTOQUE";

      for(const item of itens.filter(i => i.patrimonio_id && !["RECUSADO","CANCELADO"].includes(String(i.status || "").toUpperCase()))){
        const { error:errPat } = await banco
          .from("patrimonio")
          .update({
            obra_id: destinoId,
            localizacao: localizacaoDestino,
            status: statusPatrimonio
          })
          .eq("id", item.patrimonio_id);

        if(errPat){
          console.warn("AtlasLogistica: falha ao transferir patrimônio", item.patrimonio_id, errPat.message);
          throw errPat;
        }

        try{
          await banco
            .from("itens_retirada")
            .update({
              status:"RECEBIDO",
              usuario_recebimento:nomeUsuario(),
              data_recebimento:agora
            })
            .eq("id", item.id);
        }catch(e){ console.warn("AtlasLogistica: item recebido não atualizado", e?.message || e); }

        emitir("patrimonio.transferido", {
          modulo:"PATRIMONIO",
          pedido_id:Number(pedidoId),
          patrimonio_id:Number(item.patrimonio_id),
          usuario_nome:"Atlas",
          obra_origem_id:pedido.obra_origem_id || null,
          obra_destino_id:destinoId,
          descricao:"Patrimônio transferido automaticamente para a obra destino após recebimento.",
          dados_json:{
            patrimonio_codigo:item.patrimonio_codigo || null,
            patrimonio_nome:item.patrimonio_nome || null,
            status_final:statusPatrimonio,
            localizacao_destino:localizacaoDestino
          }
        });
      }
    }

    return resultado;
  }

  AtlasLogistica.buscarPedido = buscarPedido;
  AtlasLogistica.buscarItensPedido = buscarItensPedido;
  AtlasLogistica.finalizarSeparacao = finalizarSeparacao;
  AtlasLogistica.enviarPedido = enviarPedido;
  AtlasLogistica.buscarObraPorId = buscarObraPorId;
  AtlasLogistica.receberPedido = receberPedido;

  window.AtlasLogistica = AtlasLogistica;
  console.log("✅ ATLAS LOGÍSTICA V1.3.1 carregado - recebimento + data trânsito");
})();
