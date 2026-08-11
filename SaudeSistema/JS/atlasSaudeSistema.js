/* =========================================================
   ATLAS — SAÚDE DO SISTEMA
   Arquivo: SaudeSistema/JS/atlasSaudeSistema.js

   RESPONSABILIDADES:
   - consultar métricas técnicas por RPC;
   - renderizar banco, RLS e crescimento;
   - exibir estado da auditoria de login;
   - manter a tela sem números fictícios.
========================================================= */
(function(){
  "use strict";

  if(window.AtlasSaudeSistema?.__loaded) return;

  const $ = (seletor, contexto=document) => contexto.querySelector(seletor);
  const $$ = (seletor, contexto=document) => [...contexto.querySelectorAll(seletor)];

  const state = {
    resumo:null,
    tabelas:[],
    historico:[],
    seguranca:null,
    acessos:[],
    online:[],
    carregando:false,
    timerOnline:null
  };

  function db(){
    return window.client || window.supabaseClient || null;
  }

  function usuarioAtual(){
    return window.AtlasSegurancaSaude?.usuarioAtual?.() || null;
  }

  function ownerId(){
    return Number(usuarioAtual()?.id || 0);
  }

  function formatarBytes(bytes){
    const valor = Number(bytes || 0);
    if(!Number.isFinite(valor) || valor < 0) return "—";

    const unidades = ["B", "KB", "MB", "GB", "TB"];
    let atual = valor;
    let indice = 0;

    while(atual >= 1024 && indice < unidades.length - 1){
      atual /= 1024;
      indice++;
    }

    const casas = indice === 0 ? 0 : atual >= 100 ? 0 : atual >= 10 ? 1 : 2;
    return `${atual.toLocaleString("pt-BR", {maximumFractionDigits:casas})} ${unidades[indice]}`;
  }

  function formatarNumero(valor){
    const numero = Number(valor);
    return Number.isFinite(numero) ? numero.toLocaleString("pt-BR") : "—";
  }

  function formatarDataHora(valor){
    if(!valor) return "—";
    const data = new Date(valor);
    return Number.isNaN(data.getTime()) ? "—" : data.toLocaleString("pt-BR");
  }

  function setTexto(id, valor){
    const el = document.getElementById(id);
    if(el) el.textContent = valor;
  }

  function setEstadoCard(id, estado){
    const el = document.getElementById(id);
    if(!el) return;
    el.dataset.estado = estado || "neutral";
  }

  function atualizarUsuarioTopbar(){
    const usuario = usuarioAtual();
    setTexto("usuarioNome", `Olá, ${usuario?.nome || usuario?.usuario || "-"}`);
    setTexto("usuarioPerfil", String(usuario?.perfil_rapido || usuario?.perfil || "OWNER").toUpperCase());
    setTexto("saudeUsuarioConectado", usuario?.nome || usuario?.usuario || "—");
  }

  async function rpc(nome, args={}){
    const client = db();
    if(!client) throw new Error("Supabase não carregado.");

    const {data, error} = await client.rpc(nome, args);
    if(error) throw error;
    return data;
  }

  function mostrarAviso(mensagem, tipo="info"){
    const box = $("#saudeAviso");
    if(!box) return;

    box.hidden = !mensagem;
    box.dataset.tipo = tipo;
    box.textContent = mensagem || "";
  }

  function renderResumo(){
    const r = state.resumo;
    if(!r) return;

    setTexto("saudeBancoTamanho", formatarBytes(r.database_bytes));
    setTexto("saudeBancoSub", `${formatarNumero(r.total_tabelas)} tabelas • ${formatarNumero(r.total_registros_estimados)} registros estimados`);
    setTexto("saudeBancoAtualizado", `Atualizado ${formatarDataHora(r.coletado_em)}`);

    setTexto("saudeTotalTabelas", formatarNumero(r.total_tabelas));
    setTexto("saudeTotalRegistros", formatarNumero(r.total_registros_estimados));
    setTexto("saudeMaiorTabela", r.maior_tabela || "—");
    setTexto("saudeMaiorTabelaRegistros", formatarNumero(r.maior_tabela_registros));
    setTexto("saudeMaiorTabelaTamanho", formatarBytes(r.maior_tabela_bytes));
    setTexto("saudeUsuariosAtivos", formatarNumero(r.usuarios_ativos));
    setTexto("saudeUltimoLogin", formatarDataHora(r.ultimo_login));

    setTexto("saudeRlsCom", formatarNumero(r.rls_com));
    setTexto("saudeRlsSem", formatarNumero(r.rls_sem));
    setTexto("saudeRlsTotal", formatarNumero(r.total_tabelas));

    const semRls = Number(r.rls_sem || 0);
    const statusTitulo = semRls > 0 ? "REVISÃO RECOMENDADA" : "SAUDÁVEL";
    const statusTexto = semRls > 0
      ? `${formatarNumero(semRls)} tabela(s) sem RLS. Diagnóstico apenas; nenhuma política foi alterada.`
      : "Todas as tabelas monitoradas estão com RLS habilitado.";

    setTexto("saudeStatusGeral", statusTitulo);
    setTexto("saudeStatusSub", statusTexto);
    setEstadoCard("saudeCardStatus", semRls > 0 ? "warning" : "success");

    const total = Number(r.total_tabelas || 0);
    const com = Number(r.rls_com || 0);
    const percentual = total > 0 ? Math.round((com / total) * 100) : 0;
    const barra = $("#saudeRlsBarra");
    if(barra) barra.style.width = `${Math.max(0, Math.min(100, percentual))}%`;
    setTexto("saudeRlsPercentual", `${percentual}% com RLS ativo`);
  }

  function renderTabelas(){
    const corpo = $("#saudeTabelaCorpo");
    if(!corpo) return;

    const lista = state.tabelas.slice(0, 10);

    if(!lista.length){
      corpo.innerHTML = '<tr><td colspan="4" class="atlas-saude-empty-table">Nenhuma métrica de tabela disponível.</td></tr>';
      return;
    }

    corpo.innerHTML = lista.map(item => `
      <tr>
        <td><strong>${esc(item.tabela || "—")}</strong></td>
        <td>${formatarNumero(item.registros_estimados)}</td>
        <td>${formatarBytes(item.tamanho_bytes)}</td>
        <td><span class="atlas-saude-rls ${item.rls_ativo ? "ok" : "warning"}">${item.rls_ativo ? "RLS ativo" : "Sem RLS"}</span></td>
      </tr>
    `).join("");
  }

  function esc(valor){
    return String(valor ?? "").replace(/[&<>"']/g, caractere => ({
      "&":"&amp;",
      "<":"&lt;",
      ">":"&gt;",
      '"':"&quot;",
      "'":"&#39;"
    }[caractere]));
  }

  function renderHistorico(){
    const box = $("#saudeGraficoCrescimento");
    if(!box) return;

    const lista = state.historico || [];
    if(lista.length < 2){
      box.innerHTML = `
        <div class="atlas-saude-empty">
          <i class="fa-solid fa-chart-line"></i>
          <strong>Histórico começando agora</strong>
          <span>O Atlas registra no máximo um snapshot por dia. A projeção ficará mais útil após alguns dias.</span>
        </div>`;
      setTexto("saudeCrescimentoResumo", lista.length ? `Primeiro snapshot: ${formatarBytes(lista[0].database_bytes)}` : "Ainda sem snapshots");
      return;
    }

    const valores = lista.map(item => Number(item.database_bytes || 0));
    const max = Math.max(...valores, 1);
    const min = Math.min(...valores);
    const amplitude = Math.max(max - min, max * 0.08, 1);

    box.innerHTML = `
      <div class="atlas-saude-bars">
        ${lista.map(item => {
          const valor = Number(item.database_bytes || 0);
          const altura = 20 + ((valor - min) / amplitude) * 80;
          const data = new Date(`${item.data_snapshot}T12:00:00`).toLocaleDateString("pt-BR", {day:"2-digit", month:"2-digit"});
          return `
            <div class="atlas-saude-bar-item" title="${esc(data)} • ${esc(formatarBytes(valor))}">
              <span class="atlas-saude-bar-value">${esc(formatarBytes(valor))}</span>
              <div class="atlas-saude-bar" style="height:${Math.max(20, Math.min(100, altura))}%"></div>
              <small>${esc(data)}</small>
            </div>`;
        }).join("")}
      </div>`;

    const primeiro = valores[0];
    const ultimo = valores[valores.length - 1];
    const variacao = ultimo - primeiro;
    setTexto("saudeCrescimentoResumo", `${variacao >= 0 ? "+" : ""}${formatarBytes(Math.abs(variacao))} no período exibido`);
  }

  function renderSeguranca(){
    const s = state.seguranca;

    if(!s || s.auditoria_disponivel !== true){
      setTexto("saudeLoginsSucesso", "—");
      setTexto("saudeLoginsFalha", "—");
      setTexto("saudeBloqueados", "—");
      setTexto("saudeEventosCriticos", "—");
      setTexto("saudeSegurancaEstado", "Auditoria preparada, aguardando integração com o login.");
      renderAcessos();
      return;
    }

    setTexto("saudeLoginsSucesso", formatarNumero(s.logins_sucesso));
    setTexto("saudeLoginsFalha", formatarNumero(s.logins_falha));
    setTexto("saudeBloqueados", formatarNumero(s.contas_bloqueadas));
    setTexto("saudeEventosCriticos", formatarNumero(s.eventos_criticos));
    setTexto("saudeSegurancaEstado", "Dados das últimas 24 horas.");
    renderAcessos();
  }

  function renderAcessos(){
    const box = $("#saudeAcessosRecentes");
    if(!box) return;

    const lista = state.acessos || [];
    if(!lista.length){
      box.innerHTML = `
        <div class="atlas-saude-empty compact">
          <i class="fa-solid fa-shield-halved"></i>
          <strong>Nenhum acesso auditado</strong>
          <span>A captura de tentativas de login será ligada na próxima etapa, sem alterar esta tela.</span>
        </div>`;
      return;
    }

    box.innerHTML = lista.slice(0, 8).map(item => `
      <div class="atlas-saude-access-row">
        <span class="atlas-saude-access-icon ${item.sucesso ? "ok" : "danger"}">
          <i class="fa-solid ${item.sucesso ? "fa-check" : "fa-xmark"}"></i>
        </span>
        <div>
          <strong>${esc(item.usuario_nome || item.usuario_informado || "Usuário não identificado")}</strong>
          <small>${esc(formatarDataHora(item.data_hora))} • ${esc(item.navegador || "Navegador não informado")}</small>
        </div>
        <span class="atlas-saude-access-status ${item.sucesso ? "ok" : "danger"}">${item.sucesso ? "Sucesso" : "Falha"}</span>
      </div>
    `).join("");
  }


  function tempoAtividade(segundos){
    const s = Math.max(0, Number(segundos || 0));
    if(s < 15) return "agora";
    if(s < 60) return `há ${Math.floor(s)} s`;
    return `há ${Math.floor(s / 60)} min`;
  }

  function renderOnline(){
    const box = $("#saudeUsuariosOnline");
    if(!box) return;

    const lista = state.online || [];
    const online = lista.filter(item => item.status === "ONLINE");
    const inativos = lista.filter(item => item.status === "INATIVO");

    setTexto(
      "saudeOnlineResumo",
      `${online.length} online${inativos.length ? ` • ${inativos.length} inativo${inativos.length > 1 ? "s" : ""}` : ""}`
    );

    if(!lista.length){
      box.innerHTML = `<div class="atlas-saude-empty compact"><i class="fa-solid fa-users"></i><strong>Nenhum usuário com presença recente</strong><span>A presença aparece automaticamente quando alguém utiliza o Atlas.</span></div>`;
      return;
    }

    box.innerHTML = lista.map(item => {
      const estaOnline = item.status === "ONLINE";
      return `
        <div class="atlas-saude-online-row">
          <span class="atlas-saude-presence-dot ${estaOnline ? "online" : "away"}"></span>
          <div class="atlas-saude-online-user">
            <strong>${esc(item.nome || item.usuario || "Usuário")}</strong>
            <small>${esc(item.tela || "Atlas")} • ${esc(item.navegador || "Navegador")} / ${esc(item.dispositivo || "Dispositivo")}</small>
          </div>
          <div class="atlas-saude-online-time">
            <strong>${estaOnline ? "Online" : "Inativo"}</strong>
            <small>${esc(tempoAtividade(item.segundos_sem_atividade))}</small>
          </div>
        </div>`;
    }).join("");
  }

  async function atualizarSomenteOnline(){
    try{
      const id = ownerId();
      if(id !== 1) return;

      state.online = await rpc("atlas_saude_usuarios_online", {p_usuario_id:id}).catch(() => []);
      renderOnline();
    }catch(error){
      if(window.BDR_DEBUG_PRESENCA){
        console.warn("Atlas Saúde: presença indisponível.", error);
      }
    }
  }

  function renderPendenciasExternas(){
    setTexto("saudeStorageValor", "Não conectado");
    setTexto("saudeStorageSub", "Management API / Edge Function em etapa futura");
    setTexto("saudeTransferenciaValor", "Não conectado");
    setTexto("saudeTransferenciaSub", "Egress real exige integração segura");
    setTexto("saudePlanoAtual", "Não consultado");
    setTexto("saudePlanoLimites", "Sem limite hardcoded");
    setTexto("saudePlanoUpgrade", "Aguardando capacidade real");
  }

  async function carregar(){
    if(state.carregando) return;
    state.carregando = true;

    const botao = $("#btnSaudeAtualizar");
    if(botao){
      botao.disabled = true;
      botao.classList.add("loading");
    }

    mostrarAviso("", "info");

    try{
      const id = ownerId();
      if(id !== 1) throw new Error("Acesso restrito ao desenvolvedor.");

      const [resumo, tabelas, seguranca] = await Promise.all([
        rpc("atlas_saude_resumo", {p_usuario_id:id}),
        rpc("atlas_saude_tabelas", {p_usuario_id:id}),
        rpc("atlas_saude_seguranca_24h", {p_usuario_id:id}).catch(() => ({auditoria_disponivel:false}))
      ]);

      state.resumo = resumo;
      state.tabelas = Array.isArray(tabelas) ? tabelas : [];
      state.seguranca = seguranca;

      renderResumo();
      renderTabelas();
      renderSeguranca();

      // Snapshot diário: a função faz UPSERT e nunca cria vários registros no mesmo dia.
      await rpc("atlas_saude_capturar_snapshot", {p_usuario_id:id}).catch(error => {
        console.warn("Atlas Saúde: snapshot não registrado.", error);
      });

      state.historico = await rpc("atlas_saude_historico", {p_usuario_id:id, p_dias:30}).catch(() => []);
      state.acessos = await rpc("atlas_saude_acessos_recentes", {p_usuario_id:id, p_limite:8}).catch(() => []);
      state.online = await rpc("atlas_saude_usuarios_online", {p_usuario_id:id}).catch(() => []);

      renderHistorico();
      renderAcessos();
      renderOnline();
      setTexto("saudeUltimaAtualizacao", new Date().toLocaleTimeString("pt-BR", {hour:"2-digit", minute:"2-digit"}));
    }catch(error){
      console.error("Atlas Saúde do Sistema:", error);
      mostrarAviso(
        `Não foi possível carregar as métricas. Execute os SQL da pasta SaudeSistema/SQL no Supabase e tente novamente. Detalhe: ${error.message || error}`,
        "danger"
      );
      setEstadoCard("saudeCardStatus", "danger");
      setTexto("saudeStatusGeral", "INDISPONÍVEL");
      setTexto("saudeStatusSub", "As métricas técnicas não puderam ser consultadas.");
    }finally{
      state.carregando = false;
      if(botao){
        botao.disabled = false;
        botao.classList.remove("loading");
      }
    }
  }

  function iniciar(){
    if(!window.AtlasSegurancaSaude?.exigirAcesso?.()) return;

    atualizarUsuarioTopbar();
    renderPendenciasExternas();

    $("#btnSaudeAtualizar")?.addEventListener("click", carregar);
    carregar();

    // Presença atualiza sozinha sem recarregar todas as métricas do painel.
    clearInterval(state.timerOnline);
    state.timerOnline = setInterval(atualizarSomenteOnline, 30 * 1000);
  }

  window.AtlasSaudeSistema = {
    __loaded:true,
    carregar,
    state
  };

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", iniciar);
  }else{
    iniciar();
  }
})();
