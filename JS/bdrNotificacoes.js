/* =========================================================
   BDR NOTIFICAÇÕES V10.2 - OFFLINE SAFE LIMPO
   - Não chama bdrOnlineReal() em setInterval
   - Não consulta Supabase quando estiver offline
   - Usa somente usuario_destino_id na tabela notificacoes
   - Evita erro: column notificacoes.usuario_id does not exist
========================================================= */
(function(){
  'use strict';

  const BDR_NOTIF = {
    versao: '10.2-offline-safe',
    intervaloMs: 30000,
    timer: null,
    carregando: false,
    paradoOffline: false,
    ultimoTotal: 0,
    errosSeguidos: 0
  };

  function temSupabase(){
    return !!(window.client && typeof window.client.from === 'function');
  }

  function onlineLocalRapido(){
    // IMPORTANTE: nunca chamar bdrOnlineReal() aqui.
    if(navigator.onLine === false) return false;

    if(typeof window.bdrOnline === 'function'){
      try{ return window.bdrOnline() !== false; }
      catch(e){ return navigator.onLine !== false; }
    }

    return navigator.onLine !== false;
  }

  function usuarioAtualSeguro(){
    try{
      if(typeof window.usuarioAtual === 'function') return window.usuarioAtual();

      const raw =
        localStorage.getItem('usuario_logado') ||
        localStorage.getItem('usuarioLogado') ||
        localStorage.getItem('usuarioAtual') ||
        sessionStorage.getItem('usuario_logado') ||
        sessionStorage.getItem('usuarioAtual');

      return raw ? JSON.parse(raw) : null;
    }catch(e){
      return null;
    }
  }

  function badgeEl(){
    return document.getElementById('notifBadge') ||
           document.getElementById('badgeNotificacoes') ||
           document.getElementById('notificacoesBadge') ||
           document.getElementById('sininhoBadge') ||
           document.querySelector('[data-bdr-badge-notificacoes]');
  }

  function listaEl(){
    return document.getElementById('notifLista') ||
           document.getElementById('listaNotificacoes') ||
           document.getElementById('notificacoesLista') ||
           document.querySelector('[data-bdr-lista-notificacoes]');
  }

  function dropdownEl(){
    return document.getElementById('notifDropdown') ||
           document.getElementById('notificacoesDropdown') ||
           document.querySelector('[data-bdr-dropdown-notificacoes]');
  }

  function escapeHtml(v){
    return String(v ?? '')
      .replaceAll('&','&amp;')
      .replaceAll('<','&lt;')
      .replaceAll('>','&gt;')
      .replaceAll('"','&quot;')
      .replaceAll("'",'&#039;');
  }

  function atualizarBadge(total){
    const qtd = Number(total || 0);
    BDR_NOTIF.ultimoTotal = qtd;

    const badge = badgeEl();
    if(!badge) return;

    if(qtd > 0){
      badge.innerText = String(qtd);
      badge.style.display = 'inline-flex';
      badge.hidden = false;
    }else{
      badge.innerText = '0';
      badge.style.display = 'none';
      badge.hidden = true;
    }
  }

  function renderOffline(){
    atualizarBadge(0);
    const lista = listaEl();
    if(lista) lista.innerHTML = '<div class="notif-item">📴 Offline. Notificações pausadas.</div>';
  }

  function renderVazio(){
    atualizarBadge(0);
    const lista = listaEl();
    if(lista) lista.innerHTML = '<div class="notif-item">Nenhuma notificação no momento.</div>';
  }

  function renderErro(){
    atualizarBadge(0);
    const lista = listaEl();
    if(lista) lista.innerHTML = '<div class="notif-item">⚠️ Notificações indisponíveis no momento.</div>';
  }

  function renderNotificacoes(rows){
    const lista = listaEl();
    if(!lista) return;

    if(!Array.isArray(rows) || !rows.length){
      renderVazio();
      return;
    }

    lista.innerHTML = rows.map(n => {
      const titulo = escapeHtml(n.titulo || n.tipo || 'Notificação');
      const mensagem = escapeHtml(n.mensagem || '');
      const data = n.created_at ? escapeHtml(new Date(n.created_at).toLocaleString('pt-BR')) : '';
      const link = n.link ? escapeHtml(n.link) : '';

      const item = `
        <div class="notif-item" data-id="${escapeHtml(n.id || '')}">
          <strong>${titulo}</strong>
          <div>${mensagem}</div>
          <small>${data}</small>
        </div>`;

      return link ? `<a href="${link}" style="text-decoration:none;color:inherit">${item}</a>` : item;
    }).join('');
  }

  async function carregarNotificacoes(){
    if(BDR_NOTIF.carregando) return;

    if(!onlineLocalRapido()){
      pararNotificacoesOffline();
      return;
    }

    if(!temSupabase()){
      renderVazio();
      return;
    }

    const usuario = usuarioAtualSeguro();
    const usuarioId = usuario?.id || usuario?.usuario_id;
    const empresaId = usuario?.empresa_id;

    if(!usuarioId){
      renderVazio();
      return;
    }

    BDR_NOTIF.carregando = true;

    try{
      let query = window.client
        .from('notificacoes')
        .select('*')
        .eq('usuario_destino_id', usuarioId)
        .order('created_at', { ascending:false })
        .limit(20);

      if(empresaId){
        query = query.eq('empresa_id', empresaId);
      }

      const { data, error } = await query;
      if(error) throw error;

      BDR_NOTIF.errosSeguidos = 0;

      const rows = Array.isArray(data) ? data : [];
      const naoLidas = rows.filter(n => !n.lida && !n.visualizada && !n.read_at).length;

      atualizarBadge(naoLidas);
      renderNotificacoes(rows);
    }catch(err){
      const msg = String(err?.message || err || '').toLowerCase();

      if(!onlineLocalRapido() || msg.includes('failed to fetch') || msg.includes('err_name_not_resolved') || msg.includes('network')){
        pararNotificacoesOffline();
        return;
      }

      BDR_NOTIF.errosSeguidos++;
      console.warn('BDR notificações: erro ao carregar:', err?.message || err);
      renderErro();

      // Se o banco estiver retornando erro de estrutura/SQL, para o timer para evitar flood.
      if(BDR_NOTIF.errosSeguidos >= 2 || msg.includes('does not exist') || msg.includes('bad request')){
        pararTimer();
      }
    }finally{
      BDR_NOTIF.carregando = false;
    }
  }

  function iniciarTimer(){
    if(BDR_NOTIF.timer) return;

    BDR_NOTIF.timer = setInterval(() => {
      if(!onlineLocalRapido()){
        pararNotificacoesOffline();
        return;
      }
      carregarNotificacoes();
    }, BDR_NOTIF.intervaloMs);
  }

  function pararTimer(){
    if(BDR_NOTIF.timer){
      clearInterval(BDR_NOTIF.timer);
      BDR_NOTIF.timer = null;
    }
  }

  function pararNotificacoesOffline(){
    BDR_NOTIF.paradoOffline = true;
    pararTimer();
    renderOffline();
  }

  async function iniciarNotificacoes(){
    if(!onlineLocalRapido()){
      pararNotificacoesOffline();
      return;
    }

    BDR_NOTIF.paradoOffline = false;
    BDR_NOTIF.errosSeguidos = 0;
    await carregarNotificacoes();
    iniciarTimer();
  }

  function toggleNotificacoes(event){
    if(event) event.stopPropagation();

    const drop = dropdownEl();
    if(!drop) return;

    document.getElementById('dropdownUser')?.classList.remove('ativo');
    drop.classList.toggle('ativo');

    if(drop.classList.contains('ativo') && onlineLocalRapido()){
      carregarNotificacoes();
    }
  }

  window.addEventListener('offline', () => pararNotificacoesOffline());

  window.addEventListener('online', () => {
    if(typeof window.bdrResetOnlineReal === 'function'){
      try{ window.bdrResetOnlineReal(); }catch(e){}
    }
    iniciarNotificacoes();
  });

  document.addEventListener('visibilitychange', () => {
    if(document.visibilityState === 'visible') iniciarNotificacoes();
  });

  document.addEventListener('click', () => dropdownEl()?.classList.remove('ativo'));

  document.addEventListener('DOMContentLoaded', () => iniciarNotificacoes());

  window.BDR_NOTIF = BDR_NOTIF;
  window.toggleNotificacoes = toggleNotificacoes;
  window.bdrIniciarNotificacoes = iniciarNotificacoes;
  window.bdrPararNotificacoesOffline = pararNotificacoesOffline;
  window.bdrCarregarNotificacoes = carregarNotificacoes;

  console.log('✅ BDR NOTIFICAÇÕES V10.2 carregado - offline safe');
})();
