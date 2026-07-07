/* =========================================================
   ATLAS WORKFLOW V1.3 - MOTOR DE FLUXO LOGÍSTICO
   Arquivo: JS/atlasWorkflow.js
   Sprint 2.4.2: notificações oficiais via usuarios_sistema
========================================================= */
(function(){
  "use strict";

  const AtlasWorkflow = {
    versao: "1.4-atlas-event-bus"
  };

  const STATUS = {
    SOLICITADO: "SOLICITADO",
    APROVADO: "APROVADO",
    APROVADO_PARCIAL: "APROVADO_PARCIAL",
    RECUSADO: "RECUSADO",
    EM_SEPARACAO: "EM_SEPARACAO",
    AGUARDANDO_RETIRADA: "AGUARDANDO_RETIRADA",
    EM_TRANSITO: "EM_TRANSITO",
    RECEBIDO: "RECEBIDO",
    RECEBIDO_PARCIAL: "RECEBIDO_PARCIAL",
    CANCELADO: "CANCELADO"
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
    }catch(e){
      return null;
    }
  }

  function nomeUsuario(){
    const u = usuarioAtual();
    return u?.nome || u?.usuario || "SISTEMA";
  }

  function usuarioIdAtual(){
    const u = usuarioAtual();
    return u?.id || u?.usuario_id || null;
  }

  function empresaAtualId(){
    const u = usuarioAtual();
    return Number(u?.empresa_id || 17);
  }

  function normalizarStatus(status){
    return String(status || "").trim().toUpperCase().replace(/\s+/g, "_");
  }

  function emitirAtlas(evento, payload){
    try{
      if(window.AtlasEvents && typeof window.AtlasEvents.emit === "function"){
        return window.AtlasEvents.emit(evento, payload || {});
      }
      window.dispatchEvent(new CustomEvent("atlas:" + evento, {
        detail:{ evento, payload:payload || {}, criado_em:new Date().toISOString(), origem:"AtlasWorkflow" }
      }));
      return true;
    }catch(e){
      console.warn("AtlasWorkflow: falha ao emitir evento", evento, e?.message || e);
      return false;
    }
  }

  function perfilEhResponsavel(u){
    const perfil = String(u?.perfil || "").toUpperCase();
    const perms = String(u?.permissoes || "").toUpperCase();

    return ["MASTER", "ADMIN", "ALMOXARIFE", "ALMOXARIFADO"].includes(perfil) ||
      perms.includes("RECEBER_NOTIFICACOES") ||
      perms.includes("RECEBER_NOTIFICACOES_GESTAO") ||
      perms.includes("EXPEDICAO_APROVAR") ||
      perms.includes("EXPEDICAO_SEPARAR") ||
      perms.includes("EXPEDICAO_ENTREGAR");
  }

  function unicoPorId(lista){
    const mapa = new Map();
    (lista || []).forEach(u => {
      if(u && u.id != null) mapa.set(String(u.id), u);
    });
    return Array.from(mapa.values());
  }

  async function buscarPedido(pedidoId){
    const banco = db();
    if(!banco) throw new Error("Supabase não carregado.");

    const { data, error } = await banco
      .from("pedidos_retirada")
      .select("*")
      .eq("id", pedidoId)
      .single();

    if(error) throw error;
    if(!data) throw new Error("Pedido não encontrado.");
    return data;
  }

  async function buscarItensPedido(pedidoId){
    const banco = db();
    if(!banco) throw new Error("Supabase não carregado.");

    const { data, error } = await banco
      .from("itens_retirada")
      .select("*")
      .eq("pedido_id", pedidoId)
      .order("id", { ascending:true });

    if(error) throw error;
    return Array.isArray(data) ? data : [];
  }

  async function buscarUsuariosSistema({ empresa_id, obra_id, incluirTodosResponsaveis=false } = {}){
    const banco = db();
    if(!banco) throw new Error("Supabase não carregado.");

    let query = banco
      .from("usuarios_sistema")
      .select("id,nome,usuario,email,empresa_id,obra_id,perfil,ativo,permissoes,obras_liberadas")
      .eq("ativo", true);

    if(empresa_id){
      query = query.eq("empresa_id", empresa_id);
    }

    const { data, error } = await query;

    if(error){
      console.warn("AtlasWorkflow: erro ao buscar usuarios_sistema:", error.message);
      return [];
    }

    let lista = Array.isArray(data) ? data : [];

    if(obra_id && !incluirTodosResponsaveis){
      const obraTxt = String(obra_id);
      lista = lista.filter(u => {
        const liberadas = String(u.obras_liberadas || "");
        return String(u.obra_id || "") === obraTxt ||
          liberadas.split(/[;,|]/).map(x => x.trim()).includes(obraTxt) ||
          perfilEhResponsavel(u);
      });
    }

    return unicoPorId(lista.filter(perfilEhResponsavel));
  }

  async function buscarUsuariosDestinoPedido(pedido){
    const banco = db();
    if(!banco) throw new Error("Supabase não carregado.");

    const empresaId = pedido.empresa_id || empresaAtualId();
    const destinoId = pedido.obra_destino_id || pedido.obra_id || null;
    const nomeSolicitante = String(pedido.solicitante || pedido.usuario_criacao || "").trim();

    let query = banco
      .from("usuarios_sistema")
      .select("id,nome,usuario,email,empresa_id,obra_id,perfil,ativo,permissoes,obras_liberadas")
      .eq("ativo", true)
      .eq("empresa_id", empresaId);

    const { data, error } = await query;
    if(error){
      console.warn("AtlasWorkflow: erro ao buscar usuários destino:", error.message);
      return [];
    }

    const usuarios = Array.isArray(data) ? data : [];
    const destinoTxt = String(destinoId || "");
    const solicitanteLower = nomeSolicitante.toLowerCase();

    const filtrados = usuarios.filter(u => {
      const nomeIgual = solicitanteLower && String(u.nome || u.usuario || "").toLowerCase().includes(solicitanteLower);
      const mesmaObra = destinoTxt && String(u.obra_id || "") === destinoTxt;
      const obrasLiberadas = String(u.obras_liberadas || "").split(/[;,|]/).map(x => x.trim()).includes(destinoTxt);
      return nomeIgual || mesmaObra || obrasLiberadas;
    });

    return unicoPorId(filtrados);
  }

  async function criarNotificacao({ usuario_destino_id, empresa_id, tipo, titulo, mensagem, link, pedido_id, obra_origem_id, obra_destino_id }){
    const banco = db();
    if(!banco) throw new Error("Supabase não carregado.");

    if(!usuario_destino_id){
      console.warn("AtlasWorkflow: notificação sem usuario_destino_id ignorada.");
      return false;
    }

    const payload = {
      empresa_id: empresa_id || empresaAtualId(),
      usuario_destino_id,
      tipo: tipo || "FLUXO",
      titulo: titulo || "Notificação",
      mensagem: mensagem || "",
      link: link || "expedicao.html",
      lida: false,
      status: "NAO_LIDA",
      pedido_id: pedido_id || null,
      obra_origem_id: obra_origem_id || null,
      obra_destino_id: obra_destino_id || null,
      created_at: new Date().toISOString()
    };

    const { data, error } = await banco.from("notificacoes").insert([payload]).select("id").single();
    if(error) throw error;

    emitirAtlas("notificacao.criada", {
      notificacao:{ ...payload, id:data?.id || null },
      usuario_destino_id: usuario_destino_id,
      pedido_id: pedido_id || null,
      tipo: payload.tipo,
      titulo: payload.titulo
    });

    return true;
  }

  async function notificarUsuarios(usuarios, payloadBase){
    const lista = unicoPorId(usuarios || []);
    let total = 0;

    for(const u of lista){
      const ok = await criarNotificacao({
        ...payloadBase,
        usuario_destino_id: u.id,
        empresa_id: u.empresa_id || payloadBase.empresa_id || empresaAtualId()
      });
      if(ok) total++;
    }

    return total;
  }

  async function registrarHistoricoPedido({ pedido_id, item_id, status_anterior, status_novo, observacao }){
    const banco = db();
    if(!banco) throw new Error("Supabase não carregado.");

    const payload = {
      pedido_id,
      item_id: item_id || null,
      status_anterior: status_anterior || null,
      status_novo: status_novo || null,
      usuario: nomeUsuario(),
      observacao: observacao || "",
      created_at: new Date().toISOString()
    };

    const { error } = await banco.from("historico_pedidos_retirada").insert([payload]);
    if(error) throw error;
    return true;
  }

  async function alterarStatusPedido(pedidoId, novoStatus, observacao){
    const banco = db();
    if(!banco) throw new Error("Supabase não carregado.");

    const pedido = await buscarPedido(pedidoId);
    const statusAnterior = pedido.status || null;
    const statusNovo = normalizarStatus(novoStatus);

    const { error } = await banco
      .from("pedidos_retirada")
      .update({ status: statusNovo })
      .eq("id", pedidoId);

    if(error) throw error;

    await registrarHistoricoPedido({
      pedido_id: pedidoId,
      status_anterior: statusAnterior,
      status_novo: statusNovo,
      observacao: observacao || "Status alterado para " + statusNovo
    });

    return { ...pedido, status: statusNovo, status_anterior: statusAnterior };
  }

  async function registrarMovimentacaoSolicitada(pedidoId){
    const banco = db();
    if(!banco) throw new Error("Supabase não carregado.");

    const pedido = await buscarPedido(pedidoId);
    const itens = await buscarItensPedido(pedidoId);

    const patrimônios = itens.filter(i => i.patrimonio_id);
    if(!patrimônios.length) return { ok:true, criadas:0 };

    const existentes = await banco
      .from("patrimonio_movimentacoes")
      .select("id,patrimonio_id,pedido_id")
      .eq("pedido_id", pedidoId);

    const jaExiste = new Set((existentes.data || []).map(m => String(m.patrimonio_id)));

    const rows = patrimônios
      .filter(i => !jaExiste.has(String(i.patrimonio_id)))
      .map(i => ({
        patrimonio_id: i.patrimonio_id,
        pedido_id: pedidoId,
        empresa_id: pedido.empresa_id || empresaAtualId(),
        obra_origem_id: i.obra_origem_id || pedido.obra_origem_id || null,
        obra_destino_id: i.obra_destino_id || pedido.obra_destino_id || pedido.obra_id || null,
        status: STATUS.SOLICITADO,
        solicitado_por: pedido.solicitante || pedido.usuario_criacao || nomeUsuario(),
        data_solicitacao: new Date().toISOString(),
        observacao: "Movimentação criada automaticamente pelo Atlas Workflow."
      }));

    if(!rows.length) return { ok:true, criadas:0 };

    const { error } = await banco.from("patrimonio_movimentacoes").insert(rows);
    if(error) throw error;

    return { ok:true, criadas:rows.length };
  }

  async function atualizarMovimentacoesPedido(pedidoId, campos){
    const banco = db();
    if(!banco) throw new Error("Supabase não carregado.");

    const { error } = await banco
      .from("patrimonio_movimentacoes")
      .update(campos)
      .eq("pedido_id", pedidoId);

    if(error) throw error;
    return true;
  }

  async function notificarOrigemPedidoCriado(pedidoId){
    const pedido = await buscarPedido(pedidoId);
    const origemId = pedido.obra_origem_id || null;
    const destinoId = pedido.obra_destino_id || pedido.obra_id || null;
    const empresaId = pedido.empresa_id || empresaAtualId();

    await registrarMovimentacaoSolicitada(pedidoId);

    const usuarios = await buscarUsuariosSistema({
      empresa_id: empresaId,
      obra_id: origemId,
      incluirTodosResponsaveis: false
    });

    if(!usuarios.length){
      await registrarHistoricoPedido({
        pedido_id: pedidoId,
        status_anterior: null,
        status_novo: pedido.status || STATUS.SOLICITADO,
        observacao: "Pedido criado, mas nenhum usuário responsável foi encontrado em usuarios_sistema."
      });
      return { ok:false, motivo:"Nenhum responsável encontrado em usuarios_sistema." };
    }

    const total = await notificarUsuarios(usuarios, {
      empresa_id: empresaId,
      tipo: "PEDIDO_CRIADO",
      titulo: "📋 Novo pedido recebido",
      mensagem: "Pedido " + (pedido.codigo || "#" + pedido.id) + " aguardando análise. Solicitante: " + (pedido.solicitante || pedido.usuario_criacao || "-") + ".",
      link: "expedicao.html?aba=solicitacoes",
      pedido_id: pedido.id,
      obra_origem_id: origemId,
      obra_destino_id: destinoId
    });

    await registrarHistoricoPedido({
      pedido_id: pedidoId,
      status_anterior: null,
      status_novo: pedido.status || STATUS.SOLICITADO,
      observacao: "Pedido criado e notificação enviada para " + total + " usuário(s) responsável(is) da origem."
    });

    emitirAtlas("pedido.criado", {
      pedido_id: pedido.id,
      codigo: pedido.codigo || null,
      status: pedido.status || STATUS.SOLICITADO,
      obra_origem_id: origemId,
      obra_destino_id: destinoId,
      notificacoes: total
    });

    return { ok:true, notificacoes:total, origemId, destinoId };
  }

  async function notificarSolicitantePedido(pedido, tipo, titulo, mensagem, link){
    const usuariosDestino = await buscarUsuariosDestinoPedido(pedido);
    return await notificarUsuarios(usuariosDestino, {
      empresa_id: pedido.empresa_id || empresaAtualId(),
      tipo,
      titulo,
      mensagem,
      link: link || "expedicao.html?aba=historico",
      pedido_id: pedido.id,
      obra_origem_id: pedido.obra_origem_id || null,
      obra_destino_id: pedido.obra_destino_id || pedido.obra_id || null
    });
  }

  async function decidirItensPedido(pedidoId, decisoes){
    const banco = db();
    if(!banco) throw new Error("Supabase não carregado.");

    const pedido = await buscarPedido(pedidoId);
    const itens = await buscarItensPedido(pedidoId);
    const usuario = nomeUsuario();
    const agora = new Date().toISOString();

    if(!itens.length) throw new Error("Pedido sem itens.");
    if(!Array.isArray(decisoes) || !decisoes.length) throw new Error("Nenhuma decisão enviada.");

    const mapa = new Map(decisoes.map(d => [String(d.item_id || d.id), d]));

    for(const item of itens){
      const decisao = mapa.get(String(item.id));
      if(!decisao) continue;

      const acao = String(decisao.acao || decisao.status || "").toUpperCase();

      if(["APROVAR", "APROVADO"].includes(acao)){
        const { error } = await banco
          .from("itens_retirada")
          .update({
            status: STATUS.APROVADO,
            usuario_autorizacao: usuario,
            data_autorizacao: agora,
            motivo_recusa: null,
            usuario_recusa: null,
            data_recusa: null
          })
          .eq("id", item.id);
        if(error) throw error;
      }

      if(["RECUSAR", "RECUSADO", "NEGAR"].includes(acao)){
        const motivo = decisao.motivo || decisao.motivo_recusa || "Recusado pela origem.";
        const { error } = await banco
          .from("itens_retirada")
          .update({
            status: STATUS.RECUSADO,
            motivo_recusa: motivo,
            usuario_recusa: usuario,
            data_recusa: agora
          })
          .eq("id", item.id);
        if(error) throw error;
      }
    }

    const itensAtualizados = await buscarItensPedido(pedidoId);
    const aprovados = itensAtualizados.filter(i => String(i.status).toUpperCase() === STATUS.APROVADO).length;
    const recusados = itensAtualizados.filter(i => String(i.status).toUpperCase() === STATUS.RECUSADO).length;
    const total = itensAtualizados.length;

    let statusPedido = STATUS.APROVADO_PARCIAL;
    if(aprovados === total) statusPedido = STATUS.APROVADO;
    if(recusados === total) statusPedido = STATUS.RECUSADO;

    await banco
      .from("pedidos_retirada")
      .update({ status: statusPedido })
      .eq("id", pedidoId);

    await registrarHistoricoPedido({
      pedido_id: pedidoId,
      status_anterior: pedido.status || STATUS.SOLICITADO,
      status_novo: statusPedido,
      observacao: "Decisão de itens registrada por " + usuario + ". Aprovados: " + aprovados + ", recusados: " + recusados + "."
    });

    await atualizarMovimentacoesPedido(pedidoId, {
      status: statusPedido,
      aprovado_por: usuario,
      data_aprovacao: agora
    });

    await notificarSolicitantePedido(
      { ...pedido, status: statusPedido },
      statusPedido === STATUS.RECUSADO ? "PEDIDO_RECUSADO" : "PEDIDO_APROVADO",
      statusPedido === STATUS.RECUSADO ? "❌ Pedido recusado" : "✅ Pedido analisado",
      "Pedido " + (pedido.codigo || "#" + pedido.id) + " foi analisado por " + usuario + ". Status: " + statusPedido + ".",
      "expedicao.html?aba=historico"
    );

    return { ok:true, statusPedido, total, aprovados, recusados };
  }

  async function aprovarTodosItensPedido(pedidoId){
    const itens = await buscarItensPedido(pedidoId);
    return await decidirItensPedido(pedidoId, itens.map(i => ({ item_id:i.id, acao:"APROVAR" })));
  }

  async function recusarTodosItensPedido(pedidoId, motivo){
    const itens = await buscarItensPedido(pedidoId);
    return await decidirItensPedido(pedidoId, itens.map(i => ({ item_id:i.id, acao:"RECUSAR", motivo:motivo || "Recusado pela origem." })));
  }

  async function aprovarItensPedido(pedidoId, decisoes){
    return await decidirItensPedido(pedidoId, decisoes);
  }

  async function aprovarPedido(pedidoId){
    return await aprovarTodosItensPedido(pedidoId);
  }

  async function iniciarSeparacao(pedidoId){
    const pedido = await alterarStatusPedido(pedidoId, STATUS.EM_SEPARACAO, "Pedido entrou em separação.");
    await atualizarMovimentacoesPedido(pedidoId, {
      status: STATUS.EM_SEPARACAO,
      separado_por: nomeUsuario(),
      data_separacao: new Date().toISOString()
    });
    await notificarSolicitantePedido(pedido, "PEDIDO_EM_SEPARACAO", "📦 Pedido em separação", "Pedido " + (pedido.codigo || "#" + pedido.id) + " entrou em separação por " + nomeUsuario() + ".", "expedicao.html?aba=historico");
    return pedido;
  }

  async function finalizarSeparacao(pedidoId){
    const pedido = await alterarStatusPedido(pedidoId, STATUS.AGUARDANDO_RETIRADA, "Separação finalizada. Aguardando motorista/retirada.");
    await atualizarMovimentacoesPedido(pedidoId, {
      status: STATUS.AGUARDANDO_RETIRADA,
      separado_por: nomeUsuario(),
      data_separacao: new Date().toISOString()
    });
    await notificarSolicitantePedido(pedido, "PEDIDO_AGUARDANDO_RETIRADA", "🚚 Pedido aguardando retirada", "Pedido " + (pedido.codigo || "#" + pedido.id) + " foi separado e aguarda motorista/retirada.", "expedicao.html?aba=historico");
    return pedido;
  }

  async function enviarPedido(pedidoId, dadosTransporte){
    const pedido = await alterarStatusPedido(pedidoId, STATUS.EM_TRANSITO, "Pedido enviado.");
    const motorista = dadosTransporte?.motorista_nome || dadosTransporte?.motorista || "-";
    const placa = dadosTransporte?.veiculo_placa || dadosTransporte?.placa || "-";

    await atualizarMovimentacoesPedido(pedidoId, {
      status: STATUS.EM_TRANSITO,
      enviado_por: nomeUsuario(),
      motorista_nome: motorista,
      veiculo_placa: placa,
      veiculo_descricao: dadosTransporte?.veiculo_descricao || dadosTransporte?.veiculo || null,
      data_envio: new Date().toISOString()
    });

    await notificarSolicitantePedido(pedido, "PEDIDO_EM_TRANSITO", "🛣 Pedido em trânsito", "Pedido " + (pedido.codigo || "#" + pedido.id) + " saiu com motorista " + motorista + ", placa " + placa + ".", "expedicao.html?aba=transito");
    return pedido;
  }

  async function receberPedido(pedidoId, dadosRecebimento){
    const banco = db();
    if(!banco) throw new Error("Supabase não carregado.");

    const pedido = await buscarPedido(pedidoId);
    const statusFinal = dadosRecebimento?.divergencia ? "RECEBIDO_COM_DIVERGENCIA" : STATUS.RECEBIDO;
    const atualizado = await alterarStatusPedido(pedidoId, statusFinal, dadosRecebimento?.observacao || "Pedido recebido.");

    await atualizarMovimentacoesPedido(pedidoId, {
      status: statusFinal,
      recebido_por: nomeUsuario(),
      conferencia_status: dadosRecebimento?.divergencia ? "COM_DIVERGENCIA" : "SEM_DIVERGENCIA",
      conferencia_observacao: dadosRecebimento?.observacao || null,
      data_recebimento: new Date().toISOString()
    });

    if(!dadosRecebimento?.divergencia){
      const itens = await buscarItensPedido(pedidoId);
      for(const item of itens.filter(i => i.patrimonio_id && String(i.status || "").toUpperCase() !== STATUS.RECUSADO)){
        await banco
          .from("patrimonio")
          .update({
            obra_id: item.obra_destino_id || pedido.obra_destino_id || pedido.obra_id || null,
            status: "EM_USO"
          })
          .eq("id", item.patrimonio_id);
      }
    }

    const origem = await buscarUsuariosSistema({ empresa_id: pedido.empresa_id || empresaAtualId(), obra_id: pedido.obra_origem_id || null });
    await notificarUsuarios(origem, {
      empresa_id: pedido.empresa_id || empresaAtualId(),
      tipo: "PEDIDO_RECEBIDO",
      titulo: dadosRecebimento?.divergencia ? "⚠️ Pedido recebido com divergência" : "✅ Pedido entregue",
      mensagem: "Pedido " + (pedido.codigo || "#" + pedido.id) + " foi recebido por " + nomeUsuario() + ". Conferência: " + (dadosRecebimento?.divergencia ? "com divergência" : "sem divergência") + ".",
      link: "expedicao.html?aba=historico",
      pedido_id: pedido.id,
      obra_origem_id: pedido.obra_origem_id || null,
      obra_destino_id: pedido.obra_destino_id || pedido.obra_id || null
    });

    return atualizado;
  }

  AtlasWorkflow.STATUS = STATUS;
  AtlasWorkflow.buscarPedido = buscarPedido;
  AtlasWorkflow.buscarItensPedido = buscarItensPedido;
  AtlasWorkflow.buscarUsuariosSistema = buscarUsuariosSistema;
  AtlasWorkflow.criarNotificacao = criarNotificacao;
  AtlasWorkflow.notificarUsuarios = notificarUsuarios;
  AtlasWorkflow.registrarHistoricoPedido = registrarHistoricoPedido;
  AtlasWorkflow.registrarMovimentacaoSolicitada = registrarMovimentacaoSolicitada;
  AtlasWorkflow.alterarStatusPedido = alterarStatusPedido;
  AtlasWorkflow.notificarOrigemPedidoCriado = notificarOrigemPedidoCriado;
  AtlasWorkflow.aprovarPedido = aprovarPedido;
  AtlasWorkflow.aprovarItensPedido = aprovarItensPedido;
  AtlasWorkflow.aprovarTodosItensPedido = aprovarTodosItensPedido;
  AtlasWorkflow.recusarTodosItensPedido = recusarTodosItensPedido;
  AtlasWorkflow.decidirItensPedido = decidirItensPedido;
  AtlasWorkflow.iniciarSeparacao = iniciarSeparacao;
  AtlasWorkflow.finalizarSeparacao = finalizarSeparacao;
  AtlasWorkflow.enviarPedido = enviarPedido;
  AtlasWorkflow.receberPedido = receberPedido;

  window.AtlasWorkflow = AtlasWorkflow;

  console.log("✅ ATLAS WORKFLOW V1.4 carregado - Atlas Event Bus integrado");
})();
