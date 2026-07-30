/* =========================================================
   ATLAS GESTOR DE NOTIFICAÇÕES V1.2
   Arquivo: JS/atlasGestorNotificacoes.js
   Sprint 2.6: Central oficial de destinatários

   Responsabilidade:
   - decidir quem deve receber notificações;
   - respeitar obra/setor, cargo/perfil e permissões;
   - evitar notificar o próprio solicitante no pedido.criado;
   - criar notificações na tabela oficial notificacoes;
   - emitir eventos para AtlasEvents / AtlasEventStore / sininho.
========================================================= */
(function(){
  "use strict";

  if(window.AtlasGestorNotificacoes && window.AtlasGestorNotificacoes.__loaded){
    console.warn("AtlasGestorNotificacoes já carregado. Ignorando duplicado.");
    return;
  }

  const Gestor = {
    __loaded:true,
    versao:"1.8-preferencia-notificacoes-estrita"
  };

  const PERFIS_OPERACIONAIS = ["MASTER", "ADMIN", "ALMOXARIFE", "ALMOXARIFADO", "SUPERVISOR", "GESTOR", "LOGISTICA", "LOGÍSTICA"];

  const PERMISSOES_EXPEDICAO = [
    "RECEBER_NOTIFICACOES_EXPEDICAO",
    "RECEBER_NOTIFICACOES_MOVIMENTACOES",
    "RECEBER_NOTIFICACOES",
    "EXPEDICAO_APROVAR",
    "EXPEDICAO_SEPARAR",
    "EXPEDICAO_ENTREGAR",
    "APROVAR_PEDIDO_ORIGEM"
  ];

  const BLOQUEIOS_EXPEDICAO = [
    "NAO_RECEBER_NOTIFICACOES_EXPEDICAO",
    "NAO_RECEBER_MOVIMENTACOES",
    "BLOQUEAR_NOTIFICACOES_EXPEDICAO"
  ];

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

  function empresaAtualId(){
    const u = usuarioAtual();
    return Number(u?.empresa_id || 17);
  }

  function texto(v){ return String(v || "").trim(); }
  function upper(v){ return texto(v).toUpperCase(); }

  function emitir(evento, payload){
    try{
      if(window.AtlasEvents && typeof window.AtlasEvents.emit === "function"){
        return window.AtlasEvents.emit(evento, payload || {});
      }
      window.dispatchEvent(new CustomEvent("atlas:" + evento, {
        detail:{ evento, payload:payload || {}, criado_em:new Date().toISOString(), origem:"AtlasGestorNotificacoes" }
      }));
      return true;
    }catch(e){
      console.warn("AtlasGestorNotificacoes: falha ao emitir evento", evento, e?.message || e);
      return false;
    }
  }

  function listaObrasLiberadas(u){
    return texto(u?.obras_liberadas)
      .split(/[;,|]/)
      .map(x => x.trim())
      .filter(Boolean);
  }

  function permissoesUsuario(u){
    return upper(u?.permissoes);
  }

  function listaPermissoesUsuario(u){
    return texto(u?.permissoes)
      .split(",")
      .map(item => upper(item))
      .filter(Boolean);
  }

  function usuarioAceitaNotificacoes(u){
    if(!u || u.ativo === false) return false;

    return listaPermissoesUsuario(u)
      .includes("RECEBER_NOTIFICACOES");
  }

  function possuiAlgumaPermissao(u, lista){
    const p = permissoesUsuario(u);
    return (lista || []).some(x => p.includes(x));
  }

  function estaBloqueadoExpedicao(u){
    return possuiAlgumaPermissao(u, BLOQUEIOS_EXPEDICAO);
  }

  function perfilOperacional(u){
    return PERFIS_OPERACIONAIS.includes(upper(u?.perfil)) || PERFIS_OPERACIONAIS.includes(upper(u?.cargo));
  }

  function podeAprovarPedido(u){
    if(!u || u.ativo === false || estaBloqueadoExpedicao(u)) return false;
    const perfil = upper(u?.perfil || u?.cargo);
    return ["MASTER","ADMIN","GESTOR","SUPERVISOR"].includes(perfil) ||
      possuiAlgumaPermissao(u, ["EXPEDICAO_APROVAR","APROVAR_PEDIDO_ORIGEM"]);
  }

  function podeSepararPedido(u){
    if(!u || u.ativo === false || estaBloqueadoExpedicao(u)) return false;
    const perfil = upper(u?.perfil || u?.cargo);
    return ["MASTER","ADMIN","ALMOXARIFE","ALMOXARIFADO","LOGISTICA","LOGÍSTICA"].includes(perfil) ||
      possuiAlgumaPermissao(u, ["EXPEDICAO_SEPARAR"]);
  }

  function podeReceberExpedicao(u){
    if(!u || u.ativo === false) return false;
    if(estaBloqueadoExpedicao(u)) return false;

    /*
     * Regra oficial:
     * perfil MASTER/ADMIN não recebe por padrão.
     * A opção "Receber notificações e sininho" precisa estar marcada.
     */
    return usuarioAceitaNotificacoes(u);
  }

  function usuarioTemAcessoObra(u, obraId){
    if(!obraId) return false;
    const obraTxt = String(obraId);
    if(String(u?.obra_id || "") === obraTxt) return true;
    if(listaObrasLiberadas(u).includes(obraTxt)) return true;
    return false;
  }

  function usuarioGlobal(u){
    const perfil = upper(u?.perfil);
    const perms = permissoesUsuario(u);
    return perfil === "MASTER" || perms.includes("VER_TODAS_OBRAS") || perms.includes("NOTIFICACOES_GLOBAIS");
  }

  function usuarioPodeAtenderQualquerOrigem(u){
    const perms = permissoesUsuario(u);
    return usuarioGlobal(u) ||
      perms.includes("VER_ESTOQUE_OUTRAS_OBRAS") ||
      perms.includes("EXPEDICAO_SEPARAR_TODAS_OBRAS");
  }

  function mesmoSolicitante(u, pedido){
    const logado = usuarioAtual();
    const logadoId = logado?.id || logado?.usuario_id || null;
    const solicitante = upper(pedido?.solicitante || pedido?.usuario_criacao);
    const usuarioCriacaoId = pedido?.usuario_criacao_id || pedido?.usuario_id || pedido?.solicitante_id || null;

    if(usuarioCriacaoId && String(u?.id || "") === String(usuarioCriacaoId)) return true;
    if(logadoId && String(u?.id || "") === String(logadoId)) return true;
    if(solicitante && [upper(u?.nome), upper(u?.usuario), upper(u?.email)].includes(solicitante)) return true;
    return false;
  }

  function unicoPorId(lista){
    const mapa = new Map();
    (lista || []).forEach(u => {
      if(u && u.id != null) mapa.set(String(u.id), u);
    });
    return Array.from(mapa.values());
  }

  async function buscarUsuariosEmpresa(empresaId){
    const banco = db();
    if(!banco) throw new Error("Supabase não carregado.");

    const campos = "id,nome,usuario,email,empresa_id,obra_id,perfil,cargo,ativo,permissoes,obras_liberadas";

    async function buscar(comFiltroEmpresa){
      let query = banco
        .from("usuarios_sistema")
        .select(campos)
        .eq("ativo", true);

      if(comFiltroEmpresa && empresaId){
        query = query.eq("empresa_id", empresaId);
      }

      const { data, error } = await query;
      if(error) throw error;
      return Array.isArray(data) ? data : [];
    }

    // Primeiro tenta por empresa. Se o pedido não tiver empresa_id correto
    // ou o usuário logado estiver em empresa diferente, não deixa a notificação morrer.
    let lista = await buscar(true);
    if(!lista.length){
      lista = await buscar(false);
    }

    return lista;
  }

  function filtrarResponsaveisOrigem(usuarios, pedido, origemId){
    const base = (usuarios || [])
      .filter(u => u && u.ativo !== false)
      .filter(podeAprovarPedido)
      .filter(u => !mesmoSolicitante(u, pedido));

    // Regra oficial Sprint 2.6.2:
    // 1) Usuários da origem/CD/setor do pedido ou com obra liberada recebem.
    // 2) MASTER/ADMIN globais com permissão explícita também recebem, mesmo sem obra_id.
    // 3) Se não houver ninguém por origem nem global com permissão, usa global operacional como fallback.
    //
    // Importante: não retornamos apenas porOrigem, porque o Saulo pode ser MASTER global
    // e receber todas as notificações de expedição sem estar vinculado ao CD.
    const porOrigem = base.filter(u => usuarioTemAcessoObra(u, origemId));

    const globaisComPermissao = base.filter(u =>
      usuarioGlobal(u) && possuiAlgumaPermissao(u, PERMISSOES_EXPEDICAO)
    );

    const combinados = unicoPorId([...porOrigem, ...globaisComPermissao]);
    if(combinados.length) return combinados;

    const globaisOperacionais = base.filter(usuarioGlobal);
    return unicoPorId(globaisOperacionais);
  }

  function filtrarDestinoSolicitante(usuarios, pedido){
    const destinoId = pedido?.obra_destino_id || pedido?.obra_id || null;
    const solicitante = upper(pedido?.solicitante || pedido?.usuario_criacao);

    return unicoPorId((usuarios || [])
      .filter(u => u && u.ativo !== false)
      .filter(u => {
        const mesmoNome = solicitante && [upper(u.nome), upper(u.usuario), upper(u.email)].includes(solicitante);
        return mesmoNome || usuarioTemAcessoObra(u, destinoId);
      })
    );
  }

  function resumoItens(itens){
    const lista = Array.isArray(itens) ? itens : [];
    if(!lista.length) return "Itens: não carregados.";

    const nomes = lista.slice(0, 6).map(i => {
      const nome = texto(
        i.patrimonio_nome ||
        i.produto_nome ||
        i.descricao ||
        i.nome ||
        i.patrimonio_codigo ||
        i.produto_id ||
        i.patrimonio_id ||
        i.id ||
        "Item"
      );
      const codigo = texto(i.patrimonio_codigo || i.codigo || "");
      const qtd = Math.max(1, Number(i.quantidade || i.quantidade_solicitada || 1));
      return (codigo && codigo !== nome ? codigo + " — " : "") + nome + " • Qtd: " + qtd;
    });

    let msg = "Itens: " + nomes.join("; ");
    if(lista.length > nomes.length){
      msg += "; +" + (lista.length - nomes.length) + " item(ns)";
    }
    return msg;
  }

  function mensagemPedidoCriado(pedido, itens){
    return "Pedido " + (pedido.codigo || "#" + pedido.id) +
      " aguardando análise. Solicitante: " + (pedido.solicitante || pedido.usuario_criacao || "-") +
      ". " + resumoItens(itens);
  }

  async function criarNotificacao({ usuario_destino_id, empresa_id, tipo, titulo, mensagem, link, pedido_id, obra_origem_id, obra_destino_id, patrimonio_id, produto_id }){
    const banco = db();
    if(!banco) throw new Error("Supabase não carregado.");
    if(!usuario_destino_id) return false;

    /*
     * Proteção central:
     * nenhuma rotina pode inserir notificação para usuário que
     * desmarcou RECEBER_NOTIFICACOES.
     */
    const { data: usuarioDestino, error: erroUsuarioDestino } = await banco
      .from("usuarios_sistema")
      .select("id,ativo,permissoes")
      .eq("id", usuario_destino_id)
      .maybeSingle();

    if(erroUsuarioDestino){
      console.warn(
        "AtlasGestorNotificacoes: falha ao validar preferência do destinatário.",
        erroUsuarioDestino.message || erroUsuarioDestino
      );
      return false;
    }

    if(!usuarioAceitaNotificacoes(usuarioDestino)){
      console.info(
        "AtlasGestorNotificacoes: notificação ignorada. " +
        "O usuário não está marcado para receber notificações.",
        usuario_destino_id
      );
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
      patrimonio_id: patrimonio_id || null,
      produto_id: produto_id || null,
      created_at: new Date().toISOString()
    };

    const { data, error } = await banco.from("notificacoes").insert([payload]).select("id").single();
    if(error) throw error;

    emitir("notificacao.criada", {
      modulo:"CORE",
      descricao:"Notificação criada pelo Atlas Gestor de Notificações.",
      notificacao:{ ...payload, id:data?.id || null },
      usuario_destino_id,
      pedido_id: payload.pedido_id,
      obra_origem_id: payload.obra_origem_id,
      obra_destino_id: payload.obra_destino_id,
      tipo: payload.tipo,
      titulo: payload.titulo
    });

    return true;
  }

  async function notificarLista(usuarios, payloadBase){
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

    if(typeof window.bdrCarregarNotificacoes === "function"){
      try{ await window.bdrCarregarNotificacoes(); }catch(e){}
    }

    return total;
  }

  async function notificarPedidoCriado(pedido, itens){
    const empresaId = pedido?.empresa_id || empresaAtualId();
    const origemId = pedido?.obra_origem_id || null;
    const destinoId = pedido?.obra_destino_id || pedido?.obra_id || null;

    const usuarios = await buscarUsuariosEmpresa(empresaId);
    const responsaveis = filtrarResponsaveisOrigem(usuarios, pedido, origemId);

    if(!responsaveis.length){
      return { ok:false, motivo:"Nenhum responsável habilitado para receber notificações da origem.", origemId, destinoId };
    }

    const total = await notificarLista(responsaveis, {
      empresa_id: empresaId,
      tipo:"PEDIDO_CRIADO",
      titulo:"📋 Novo pedido recebido",
      mensagem:mensagemPedidoCriado(pedido, itens),
      link:"expedicao.html?aba=solicitacoes",
      pedido_id:pedido.id,
      obra_origem_id:origemId,
      obra_destino_id:destinoId
    });

    emitir("pedido.criado", {
      modulo:"EXPEDICAO",
      empresa_id:empresaId,
      pedido_id:pedido.id,
      obra_origem_id:origemId,
      obra_destino_id:destinoId,
      usuario_nome:pedido.solicitante || pedido.usuario_criacao || null,
      descricao:"Pedido criado e notificado para a origem.",
      dados_json:{ notificacoes:total, itens:(itens || []).length }
    });

    return { ok:true, notificacoes:total, origemId, destinoId, destinatarios:responsaveis.map(u => ({id:u.id,nome:u.nome,perfil:u.perfil,obra_id:u.obra_id})) };
  }

  async function notificarDestinoPedido(pedido, tipo, titulo, mensagem, link){
    const empresaId = pedido?.empresa_id || empresaAtualId();
    const usuarios = await buscarUsuariosEmpresa(empresaId);
    const destino = filtrarDestinoSolicitante(usuarios, pedido);

    const total = await notificarLista(destino, {
      empresa_id:empresaId,
      tipo,
      titulo,
      mensagem,
      link:link || "expedicao.html?aba=historico",
      pedido_id:pedido.id,
      obra_origem_id:pedido.obra_origem_id || null,
      obra_destino_id:pedido.obra_destino_id || pedido.obra_id || null
    });

    return { ok:true, notificacoes:total, destinatarios:destino.map(u => ({id:u.id,nome:u.nome,perfil:u.perfil,obra_id:u.obra_id})) };
  }



  async function notificarSeparacaoPedido(pedido, usuarioAprovador){
    const empresaId = pedido?.empresa_id || empresaAtualId();
    const origemId = pedido?.obra_origem_id || null;
    const destinoId = pedido?.obra_destino_id || pedido?.obra_id || null;
    const itens = Array.isArray(pedido?.itens_retirada) ? pedido.itens_retirada : [];

    const usuarios = await buscarUsuariosEmpresa(empresaId);

    /*
      REGRA OFICIAL ATLAS:
      - Pedido novo: somente quem aprova.
      - Pedido autorizado: somente equipe operacional de separação.
      - ALMOXARIFE/ALMOXARIFADO não depende da obra do pedido para receber,
        pois pode separar itens de qualquer origem liberada no catálogo.
      - MASTER/ADMIN não entram aqui automaticamente.
    */
    let separadores = unicoPorId(
      (usuarios || [])
        .filter(u => u && u.ativo !== false)
        .filter(u => !estaBloqueadoExpedicao(u))
        .filter(u => {
          const perfil = upper(u?.perfil || u?.cargo);
          const perfilAlmox = ["ALMOXARIFE","ALMOXARIFADO","LOGISTICA","LOGÍSTICA"].includes(perfil);
          const permissaoSeparar = possuiAlgumaPermissao(u, ["EXPEDICAO_SEPARAR"]);
          const recebeNotif = possuiAlgumaPermissao(u, [
            "RECEBER_NOTIFICACOES",
            "RECEBER_NOTIFICACOES_EXPEDICAO",
            "RECEBER_NOTIFICACOES_MOVIMENTACOES"
          ]);
          return (perfilAlmox || permissaoSeparar) && recebeNotif;
        })
    );

    // Fallback seguro: se ninguém tiver a permissão de notificação configurada,
    // usa os perfis de almoxarifado/logística ativos.
    if(!separadores.length){
      separadores = unicoPorId(
        (usuarios || [])
          .filter(u => u && u.ativo !== false)
          .filter(u => !estaBloqueadoExpedicao(u))
          .filter(u => ["ALMOXARIFE","ALMOXARIFADO","LOGISTICA","LOGÍSTICA"]
            .includes(upper(u?.perfil || u?.cargo)))
      );
    }

    console.table(separadores.map(u => ({
      id:u.id,
      nome:u.nome,
      perfil:u.perfil,
      obra_id:u.obra_id,
      permissoes:u.permissoes,
      etapa:"SEPARACAO",
      pedido:pedido?.codigo || pedido?.id
    })));

    const total = await notificarLista(separadores, {
      empresa_id:empresaId,
      tipo:"PEDIDO_AGUARDANDO_SEPARACAO",
      titulo:"📦 Pedido aguardando separação",
      mensagem:
        "Pedido " + (pedido?.codigo || "#" + pedido?.id) +
        " foi autorizado por " + (usuarioAprovador || "responsável") +
        " e já pode ser separado. " + resumoItens(itens),
      link:"expedicao.html?aba=separacao",
      pedido_id:pedido?.id || null,
      obra_origem_id:origemId,
      obra_destino_id:destinoId
    });

    return {
      ok:total > 0,
      notificacoes:total,
      destinatarios:separadores.map(u => ({
        id:u.id,
        nome:u.nome,
        perfil:u.perfil,
        obra_id:u.obra_id
      }))
    };
  }

  async function diagnosticarPedidoCriado(pedido, itens){
    const empresaId = pedido?.empresa_id || empresaAtualId();
    const origemId = pedido?.obra_origem_id || null;
    const usuarios = await buscarUsuariosEmpresa(empresaId);
    const linhas = (usuarios || []).map(u => ({
      id:u.id,
      nome:u.nome,
      perfil:u.perfil,
      empresa_id:u.empresa_id,
      obra_id:u.obra_id,
      ativo:u.ativo,
      tem_permissao:possuiAlgumaPermissao(u, PERMISSOES_EXPEDICAO),
      bloqueado:estaBloqueadoExpedicao(u),
      operacional:perfilOperacional(u),
      acesso_origem:usuarioTemAcessoObra(u, origemId),
      global:usuarioGlobal(u),
      mesmo_solicitante:mesmoSolicitante(u, pedido),
      pode_receber:podeReceberExpedicao(u)
    }));
    console.table(linhas);
    return linhas;
  }

  Gestor.buscarUsuariosEmpresa = buscarUsuariosEmpresa;
  Gestor.filtrarResponsaveisOrigem = filtrarResponsaveisOrigem;
  Gestor.filtrarDestinoSolicitante = filtrarDestinoSolicitante;
  Gestor.criarNotificacao = criarNotificacao;
  Gestor.notificarLista = notificarLista;
  Gestor.notificarPedidoCriado = notificarPedidoCriado;
  Gestor.notificarDestinoPedido = notificarDestinoPedido;
  Gestor.notificarSeparacaoPedido = notificarSeparacaoPedido;
  Gestor.usuarioPodeAtenderQualquerOrigem = usuarioPodeAtenderQualquerOrigem;
  Gestor.podeReceberExpedicao = podeReceberExpedicao;
  Gestor.usuarioTemAcessoObra = usuarioTemAcessoObra;
  Gestor.diagnosticarPedidoCriado = diagnosticarPedidoCriado;

  window.AtlasGestorNotificacoes = Gestor;

  console.log("✅ ATLAS GESTOR NOTIFICAÇÕES V1.7 carregado - destinatários corretos por etapa");
})();
