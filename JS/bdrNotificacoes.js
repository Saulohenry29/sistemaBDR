/* =========================================================
   BDR NOTIFICAÇÕES V11.0 - DEFINITIVO
   - Protege contra carregamento duplicado
   - Usa bdrOnlineReal() como fonte de verdade quando existir
   - Não fica preso em bdrOnline() false se bdrOnlineReal() true
   - Não consulta Supabase quando estiver offline real
   - Usa usuario_destino_id na tabela notificacoes
   - Contador sem fantasma
   - Busca somente notificações não lidas
   - Abrir o sininho NÃO marca como lida
   - Clicar no item marca como lida; se tiver link, navega depois
   - Exibe e salva lida_em no horário de Mato Grosso (America/Cuiaba)
   - Toca som e anima o sininho quando chega notificação nova
   - Mostra sino cortado quando offline
   - Áudio liberado somente após clique real do usuário
   - Abrir o sininho não limpa; clicar no item marca como lido
========================================================= */
(function(){
  'use strict';

  if(window.BDR_NOTIF && window.BDR_NOTIF.__loaded){
    console.warn('BDR notificações já carregado. Ignorando duplicado.');
    return;
  }

  const BDR_NOTIF = {
    __loaded: true,
    versao: '11.1-atlas-event-bus',
    intervaloMs: 30000,
    timer: null,
    carregando: false,
    marcandoLidas: false,
    paradoOffline: false,
    ultimoTotal: 0,
    errosSeguidos: 0,
    ultimaVerificacaoOnline: 0,
    ultimoOnlineReal: null,
    primeiraCargaConcluida: false,
    audioLiberado: false,
    audioCtx: null,
    ultimoAvisoEm: 0
  };

  function temSupabase(){
    return !!(window.client && typeof window.client.from === 'function');
  }

  async function onlineLocalRapido(){
    if(navigator.onLine === false) return false;

    // Fonte oficial quando existir: internet real do bdrCore.js
    if(typeof window.bdrOnlineReal === 'function'){
      try{
        const ok = await window.bdrOnlineReal();
        BDR_NOTIF.ultimaVerificacaoOnline = Date.now();
        BDR_NOTIF.ultimoOnlineReal = !!ok;
        return !!ok;
      }catch(e){
        BDR_NOTIF.ultimoOnlineReal = false;
        return false;
      }
    }

    // Fallback antigo, usado só se não existir bdrOnlineReal.
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

  function notifBtnEl(){
    return document.querySelector('.notif-btn') ||
           document.querySelector('[data-bdr-btn-notificacoes]');
  }

  function aplicarCssSininho(){
    if(document.getElementById('bdrNotifAnimCss')) return;

    const css = document.createElement('style');
    css.id = 'bdrNotifAnimCss';
    css.textContent = `
      @keyframes bdrBellShake{
        0%{transform:rotate(0deg) scale(1)}
        15%{transform:rotate(-16deg) scale(1.08)}
        30%{transform:rotate(14deg) scale(1.08)}
        45%{transform:rotate(-10deg) scale(1.06)}
        60%{transform:rotate(8deg) scale(1.06)}
        75%{transform:rotate(-4deg) scale(1.03)}
        100%{transform:rotate(0deg) scale(1)}
      }
      @keyframes bdrBadgePulse{
        0%{transform:scale(1)}
        50%{transform:scale(1.28)}
        100%{transform:scale(1)}
      }
      .notif-btn.bdr-notif-animando i{
        animation:bdrBellShake .75s ease-in-out 0s 2;
        transform-origin:50% 0%;
      }
      .notif-badge.bdr-badge-pulse{
        animation:bdrBadgePulse .75s ease-in-out 0s 2;
      }
      .notif-btn.bdr-notif-offline{
        opacity:.75;
        filter:grayscale(.25);
      }
      .notif-btn.bdr-notif-offline i{
        color:#6b7280!important;
      }
    `;
    document.head.appendChild(css);
  }

  function setIconeOffline(offline){
    const btn = notifBtnEl();
    const icon = btn?.querySelector('i');
    if(!btn || !icon) return;

    if(offline){
      btn.classList.add('bdr-notif-offline');
      icon.className = 'fa-regular fa-bell-slash';
      btn.title = 'Notificações pausadas offline';
    }else{
      btn.classList.remove('bdr-notif-offline');
      icon.className = 'fa-regular fa-bell';
      btn.title = 'Notificações';
    }
  }

  function usuarioInteragiuComPagina(event){
    if(event && event.isTrusted === false) return false;

    // userActivation é suportado em Chrome/Edge e evita tentar áudio cedo demais.
    if(navigator.userActivation && !navigator.userActivation.hasBeenActive){
      return false;
    }

    return true;
  }

  async function liberarAudioNotificacao(event){
    if(BDR_NOTIF.audioLiberado) return true;
    if(!usuarioInteragiuComPagina(event)) return false;

    try{
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if(!AudioCtx) return false;

      if(!BDR_NOTIF.audioCtx){
        BDR_NOTIF.audioCtx = new AudioCtx();
      }

      if(BDR_NOTIF.audioCtx.state === 'suspended'){
        await BDR_NOTIF.audioCtx.resume();
      }

      if(BDR_NOTIF.audioCtx.state === 'running'){
        BDR_NOTIF.audioLiberado = true;
        removerListenersAudio();
        return true;
      }
    }catch(e){
      // Navegador pode bloquear mesmo após o primeiro gesto. Mantém listeners ativos.
      BDR_NOTIF.audioLiberado = false;
    }

    return false;
  }

  function adicionarListenersAudio(){
    document.addEventListener('click', liberarAudioNotificacao, { passive:true });
    document.addEventListener('pointerdown', liberarAudioNotificacao, { passive:true });
    document.addEventListener('touchstart', liberarAudioNotificacao, { passive:true });
    document.addEventListener('keydown', liberarAudioNotificacao);
  }

  function removerListenersAudio(){
    document.removeEventListener('click', liberarAudioNotificacao);
    document.removeEventListener('pointerdown', liberarAudioNotificacao);
    document.removeEventListener('touchstart', liberarAudioNotificacao);
    document.removeEventListener('keydown', liberarAudioNotificacao);
  }

  function tocarSomNotificacao(){
    if(!BDR_NOTIF.audioLiberado) return;
    if(!BDR_NOTIF.audioCtx || BDR_NOTIF.audioCtx.state !== 'running') return;

    try{
      const ctx = BDR_NOTIF.audioCtx;
      const agora = ctx.currentTime;

      const ganho = ctx.createGain();
      ganho.gain.setValueAtTime(0.0001, agora);
      ganho.gain.exponentialRampToValueAtTime(0.16, agora + 0.015);
      ganho.gain.exponentialRampToValueAtTime(0.0001, agora + 0.20);
      ganho.connect(ctx.destination);

      const osc1 = ctx.createOscillator();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(880, agora);
      osc1.frequency.setValueAtTime(1175, agora + 0.09);
      osc1.connect(ganho);
      osc1.start(agora);
      osc1.stop(agora + 0.21);
    }catch(e){}
  }

  function animarSininho(){
    aplicarCssSininho();

    const btn = notifBtnEl();
    const badge = badgeEl();

    if(btn){
      btn.classList.remove('bdr-notif-animando');
      void btn.offsetWidth;
      btn.classList.add('bdr-notif-animando');
      setTimeout(() => btn.classList.remove('bdr-notif-animando'), 1700);
    }

    if(badge){
      badge.classList.remove('bdr-badge-pulse');
      void badge.offsetWidth;
      badge.classList.add('bdr-badge-pulse');
      setTimeout(() => badge.classList.remove('bdr-badge-pulse'), 1700);
    }
  }

  function avisarNovaNotificacao(){
    const agora = Date.now();
    if(agora - Number(BDR_NOTIF.ultimoAvisoEm || 0) < 700) return;
    BDR_NOTIF.ultimoAvisoEm = agora;
    tocarSomNotificacao();
    animarSininho();
  }

  function escapeHtml(v){
    return String(v ?? '')
      .replaceAll('&','&amp;')
      .replaceAll('<','&lt;')
      .replaceAll('>','&gt;')
      .replaceAll('"','&quot;')
      .replaceAll("'",'&#039;');
  }

  /* =========================================================
     HORÁRIO OFICIAL BDR
     Banco salva timestamp sem timezone. Para não aparecer horário
     adiantado, o sininho trata o horário como UTC e exibe em MT.
  ========================================================= */
  function bdrDataComoUTC(valor){
    if(!valor) return null;

    const txt = String(valor).trim();

    // Se já vier com timezone, mantém.
    if(/[zZ]$|[+-]\d{2}:?\d{2}$/.test(txt)){
      return new Date(txt);
    }

    // Timestamp sem timezone do Supabase: considera UTC.
    return new Date(txt.replace(' ', 'T') + 'Z');
  }

  function formatarDataBDR(valor){
    const data = bdrDataComoUTC(valor);
    if(!data || isNaN(data.getTime())) return '';

    return data.toLocaleString('pt-BR', {
      timeZone: 'America/Cuiaba',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function agoraCuiabaParaSQL(){
    const partes = new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Cuiaba',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).formatToParts(new Date());

    const obj = {};
    partes.forEach(p => obj[p.type] = p.value);

    return `${obj.year}-${obj.month}-${obj.day} ${obj.hour}:${obj.minute}:${obj.second}`;
  }

  function atualizarBadge(total){
    const qtd = Number(total || 0);
    BDR_NOTIF.ultimoTotal = qtd;

    const badge = badgeEl();
    if(!badge) return;

    if(qtd > 0){
      badge.innerText = qtd > 99 ? '99+' : String(qtd);
      badge.style.display = 'inline-flex';
      badge.hidden = false;
    }else{
      badge.innerText = '0';
      badge.style.display = 'none';
      badge.hidden = true;
    }
  }

  function renderOffline(){
    setIconeOffline(true);
    atualizarBadge(0);
    const lista = listaEl();
    if(lista) lista.innerHTML = '<div class="notif-item">📴 Offline. Notificações pausadas.</div>';
  }

  function renderVazio(){
    setIconeOffline(false);
    atualizarBadge(0);
    const lista = listaEl();
    if(lista) lista.innerHTML = '<div class="notif-item">Nenhuma notificação no momento.</div>';
  }

  function renderErro(){
    setIconeOffline(false);
    atualizarBadge(0);
    const lista = listaEl();
    if(lista) lista.innerHTML = '<div class="notif-item">⚠️ Notificações indisponíveis no momento.</div>';
  }

  function notificacaoNaoLida(n){
    return String(n.status || '').toUpperCase() !== 'LIDA' &&
           n.lida !== true;
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
      const data = n.created_at ? escapeHtml(formatarDataBDR(n.created_at)) : '';
      const link = n.link ? escapeHtml(n.link) : '';
      const classeLida = notificacaoNaoLida(n) ? 'nao-lida' : 'lida';

      return `
        <div class="notif-item ${classeLida}" data-id="${escapeHtml(n.id || '')}" data-link="${link}" role="button" tabindex="0" title="Clique para abrir e marcar como lida">
          <strong>${titulo}</strong>
          <div>${mensagem}</div>
          <small>${data}</small>
        </div>`;
    }).join('');
  }

  async function carregarNotificacoes(){
    if(BDR_NOTIF.carregando) return;

    const online = await onlineLocalRapido();
    if(!online){
      pararNotificacoesOffline();
      return;
    }

    BDR_NOTIF.paradoOffline = false;
    setIconeOffline(false);

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
        .eq('lida', false)
        .order('created_at', { ascending:false })
        .limit(20);

      if(empresaId){
        query = query.eq('empresa_id', empresaId);
      }

      const { data, error } = await query;
      if(error) throw error;

      BDR_NOTIF.errosSeguidos = 0;

      const rows = Array.isArray(data) ? data : [];
      const naoLidas = rows.filter(notificacaoNaoLida).length;
      const totalAnterior = Number(BDR_NOTIF.ultimoTotal || 0);
      const primeiraCarga = !BDR_NOTIF.primeiraCargaConcluida;

      atualizarBadge(naoLidas);
      renderNotificacoes(rows);

      if(!primeiraCarga && naoLidas > totalAnterior){
        avisarNovaNotificacao();
      }

      BDR_NOTIF.primeiraCargaConcluida = true;
    }catch(err){
      const msg = String(err?.message || err || '').toLowerCase();
      const aindaOnline = await onlineLocalRapido();

      if(!aindaOnline || msg.includes('failed to fetch') || msg.includes('err_name_not_resolved') || msg.includes('network') || msg.includes('connection')){
        pararNotificacoesOffline();
        return;
      }

      BDR_NOTIF.errosSeguidos++;
      console.warn('BDR notificações: erro ao carregar:', err?.message || err);
      renderErro();

      if(BDR_NOTIF.errosSeguidos >= 2 || msg.includes('does not exist') || msg.includes('bad request')){
        pararTimer();
      }
    }finally{
      BDR_NOTIF.carregando = false;
    }
  }

  async function marcarNotificacaoComoLida(id, link){
    if(!id) return;
    if(BDR_NOTIF.marcandoLidas) return;
    if(!(await onlineLocalRapido())) return;
    if(!temSupabase()) return;

    const usuario = usuarioAtualSeguro();
    const usuarioId = usuario?.id || usuario?.usuario_id;
    const empresaId = usuario?.empresa_id;

    if(!usuarioId) return;

    BDR_NOTIF.marcandoLidas = true;

    try{
      let query = window.client
        .from('notificacoes')
        .update({
          lida: true,
          lida_em: agoraCuiabaParaSQL(),
          status: 'LIDA'
        })
        .eq('id', id)
        .eq('usuario_destino_id', usuarioId);

      if(empresaId){
        query = query.eq('empresa_id', empresaId);
      }

      const { error } = await query;
      if(error) throw error;

      await carregarNotificacoes();

      if(link){
        window.location.href = link;
      }

    }catch(e){
      console.warn('BDR notificações: erro ao marcar item como lido:', e?.message || e);
      if(link){
        window.location.href = link;
      }
    }finally{
      BDR_NOTIF.marcandoLidas = false;
    }
  }

  async function marcarComoLidas(){
    // Mantido apenas para compatibilidade com telas antigas.
    // A regra oficial V10.9 é: abrir o sino NÃO limpa; clicar no item marca como lida.
    return;
  }

  function iniciarTimer(){
    if(BDR_NOTIF.timer) return;

    BDR_NOTIF.timer = setInterval(async () => {
      if(!(await onlineLocalRapido())){
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
    if(!(await onlineLocalRapido())){
      pararNotificacoesOffline();
      return;
    }

    BDR_NOTIF.paradoOffline = false;
    BDR_NOTIF.errosSeguidos = 0;
    await carregarNotificacoes();
    iniciarTimer();
  }

  async function toggleNotificacoes(event){
    if(event) event.stopPropagation();

    const drop = dropdownEl();
    if(!drop) return;

    document.getElementById('dropdownUser')?.classList.remove('ativo');
    drop.classList.toggle('ativo');

    if(drop.classList.contains('ativo')){
      if(await onlineLocalRapido()){
        await carregarNotificacoes();
      }else{
        pararNotificacoesOffline();
      }
    }
  }


  async function tratarAtlasNotificacaoCriada(payload){
    try{
      // Atualiza o sininho imediatamente quando o Atlas criar uma notificação.
      // O som só toca se o navegador já tiver liberado áudio após interação real.
      await carregarNotificacoes();
      avisarNovaNotificacao();
    }catch(e){
      console.warn('BDR Notificações: falha ao processar evento Atlas:', e?.message || e);
    }
  }

  function registrarAtlasEventBus(){
    try{
      if(window.AtlasEvents && typeof window.AtlasEvents.on === 'function'){
        window.AtlasEvents.on('notificacao.criada', tratarAtlasNotificacaoCriada);
        window.AtlasEvents.on('pedido.criado', () => {
          try{ animarSininho(); }catch(e){}
        });
      }

      // Fallback para eventos DOM caso o Event Bus carregue depois ou não exista.
      window.addEventListener('atlas:notificacao.criada', e => tratarAtlasNotificacaoCriada(e?.detail?.payload || e?.detail || {}));
      window.addEventListener('atlas:pedido.criado', () => {
        try{ animarSininho(); }catch(e){}
      });
    }catch(e){
      console.warn('BDR Notificações: não foi possível registrar Atlas Event Bus:', e?.message || e);
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


  document.addEventListener('DOMContentLoaded', () => {
    aplicarCssSininho();
    adicionarListenersAudio();
    registrarAtlasEventBus();

    const drop = dropdownEl();
    if(drop){
      drop.addEventListener('click', async e => {
        e.stopPropagation();
        const item = e.target.closest('.notif-item[data-id]');
        if(!item) return;
        const id = item.getAttribute('data-id');
        const link = item.getAttribute('data-link') || '';
        await marcarNotificacaoComoLida(id, link);
      });

      drop.addEventListener('keydown', async e => {
        if(e.key !== 'Enter' && e.key !== ' ') return;
        const item = e.target.closest('.notif-item[data-id]');
        if(!item) return;
        e.preventDefault();
        const id = item.getAttribute('data-id');
        const link = item.getAttribute('data-link') || '';
        await marcarNotificacaoComoLida(id, link);
      });
    }

    iniciarNotificacoes();
  });

  window.BDR_NOTIF = BDR_NOTIF;
  window.toggleNotificacoes = toggleNotificacoes;
  window.bdrIniciarNotificacoes = iniciarNotificacoes;
  window.bdrPararNotificacoesOffline = pararNotificacoesOffline;
  window.bdrCarregarNotificacoes = carregarNotificacoes;
  window.bdrAvisarNovaNotificacao = avisarNovaNotificacao;
  window.bdrMarcarNotificacoesComoLidas = marcarComoLidas;
  window.bdrMarcarNotificacaoComoLida = marcarNotificacaoComoLida;

  console.log('✅ BDR NOTIFICAÇÕES V11.1 carregado - Atlas Event Bus');
})();
