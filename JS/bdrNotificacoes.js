/* =========================================================
   BDR NOTIFICAÇÕES V12.0 - CENTRAL INTELIGENTE
   - Sintaxe validada
   - Pendentes separadas de atualizações
   - X fecha sem navegar
   - Botão de ação apenas quando necessário
   - Marcar todas como lidas
   - Som forte em 3 toques
   - Vibração quando suportada
   - Realtime + fallback por intervalo
   - Compatível com Atlas Event Bus
========================================================= */
(function(){
  'use strict';

  if(window.BDR_NOTIF && window.BDR_NOTIF.__loaded){
    console.warn('BDR notificações já carregado. Ignorando duplicado.');
    return;
  }

  const BDR_NOTIF = {
    __loaded:true,
    versao:'12.1-card-acao-clicavel',
    intervaloMs:10000,
    timer:null,
    carregando:false,
    marcandoLidas:false,
    paradoOffline:false,
    ultimoTotal:0,
    errosSeguidos:0,
    primeiraCargaConcluida:false,
    audioLiberado:false,
    audioCtx:null,
    ultimoAvisoEm:0,
    realtimeChannel:null
  };

  function temSupabase(){
    return !!(window.client && typeof window.client.from === 'function');
  }

  async function onlineReal(){
    if(navigator.onLine === false) return false;

    if(typeof window.bdrOnlineReal === 'function'){
      try{ return !!(await window.bdrOnlineReal()); }
      catch(e){ return false; }
    }

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

  function escapeHtml(v){
    return String(v ?? '')
      .replaceAll('&','&amp;')
      .replaceAll('<','&lt;')
      .replaceAll('>','&gt;')
      .replaceAll('"','&quot;')
      .replaceAll("'",'&#039;');
  }

  function aplicarCss(){
    if(document.getElementById('bdrNotifV12Css')) return;

    const css = document.createElement('style');
    css.id = 'bdrNotifV12Css';
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
      .notif-dropdown{
        width:min(400px,calc(100vw - 24px))!important;
      }
      .notif-head{
        display:flex!important;
        align-items:center!important;
        justify-content:space-between!important;
        gap:10px!important;
      }
      .bdr-notif-limpar-todas{
        border:0;background:#fff;color:#2563eb;font-size:11px;font-weight:900;
        border-radius:9px;padding:7px 9px;cursor:pointer;
      }
      .bdr-notif-grupo-titulo{
        padding:9px 12px 6px;color:#64748b;font-size:10px;font-weight:950;
        text-transform:uppercase;letter-spacing:.08em;background:#f8fafc;
        border-bottom:1px solid #eef2f7;
      }
      .notif-item{
        position:relative;padding:11px 42px 11px 13px!important;
        cursor:default!important;border-bottom:1px solid #eef2f7;
      }
      .notif-item.bdr-notif-acao{
        border-left:4px solid #2563eb;
        background:#eff6ff;
        cursor:pointer!important;
        transition:.16s ease;
      }
      .notif-item.bdr-notif-acao:hover{
        background:#dbeafe;
        transform:translateX(2px);
      }
      .notif-item.bdr-notif-acao::after{
        content:"Clique para abrir";
        display:block;
        margin-top:7px;
        color:#1d4ed8;
        font-size:10px;
        font-weight:900;
      }
      .notif-item.bdr-notif-info{
        border-left:4px solid #16a34a;background:#fff;
      }
      .bdr-notif-fechar{
        position:absolute;top:8px;right:8px;width:27px;height:27px;border:0;
        border-radius:9px;background:#f1f5f9;color:#475569;font-size:15px;
        font-weight:900;cursor:pointer;display:flex;align-items:center;justify-content:center;
      }
      .bdr-notif-fechar:hover{background:#e2e8f0;color:#0f172a}
      .notif-item small{display:block;margin-top:5px;color:#64748b}
      .notif-btn.bdr-notif-offline{opacity:.75;filter:grayscale(.25)}
      .bdr-notif-toast-forte{
        position:fixed;top:14px;left:50%;transform:translate(-50%,-18px);
        width:min(520px,calc(100vw - 24px));background:linear-gradient(135deg,#1d4ed8,#2563eb);
        color:#fff;border-radius:16px;padding:13px 16px;z-index:2147483647;
        box-shadow:0 18px 45px rgba(37,99,235,.34);opacity:0;pointer-events:none;
        transition:.22s ease;font-size:13px;font-weight:900;text-align:center;
      }
      .bdr-notif-toast-forte.ativo{opacity:1;transform:translate(-50%,0)}
      @media(max-width:640px){
        .notif-dropdown{
          position:fixed!important;left:10px!important;right:10px!important;top:82px!important;
          width:auto!important;max-height:calc(100dvh - 170px)!important;
        }
        .notif-list{max-height:calc(100dvh - 230px)!important}
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

  function usuarioInteragiu(event){
    if(event && event.isTrusted === false) return false;
    if(navigator.userActivation && !navigator.userActivation.hasBeenActive) return false;
    return true;
  }

  async function liberarAudio(event){
    if(BDR_NOTIF.audioLiberado) return true;
    if(!usuarioInteragiu(event)) return false;

    try{
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if(!AudioCtx) return false;

      if(!BDR_NOTIF.audioCtx) BDR_NOTIF.audioCtx = new AudioCtx();
      if(BDR_NOTIF.audioCtx.state === 'suspended') await BDR_NOTIF.audioCtx.resume();

      if(BDR_NOTIF.audioCtx.state === 'running'){
        BDR_NOTIF.audioLiberado = true;
        return true;
      }
    }catch(e){}

    return false;
  }

  function registrarLiberacaoAudio(){
    ['click','pointerdown','touchstart','keydown'].forEach(evt => {
      document.addEventListener(evt, liberarAudio, { passive:true });
    });
  }

  function tocarSom(){
    if(!BDR_NOTIF.audioLiberado) return;
    if(!BDR_NOTIF.audioCtx || BDR_NOTIF.audioCtx.state !== 'running') return;

    try{
      const ctx = BDR_NOTIF.audioCtx;
      const inicio = ctx.currentTime + 0.02;

      [0,0.34,0.68].forEach((deslocamento, indice) => {
        const agora = inicio + deslocamento;
        const ganho = ctx.createGain();
        ganho.gain.setValueAtTime(0.0001, agora);
        ganho.gain.exponentialRampToValueAtTime(0.34, agora + 0.018);
        ganho.gain.exponentialRampToValueAtTime(0.0001, agora + 0.25);
        ganho.connect(ctx.destination);

        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(indice === 2 ? 1320 : 880, agora);
        osc.frequency.exponentialRampToValueAtTime(indice === 2 ? 1760 : 1240, agora + 0.16);
        osc.connect(ganho);
        osc.start(agora);
        osc.stop(agora + 0.26);
      });
    }catch(e){}
  }

  function vibrar(){
    try{
      if(typeof navigator.vibrate === 'function'){
        navigator.vibrate([260,120,260,120,480]);
      }
    }catch(e){}
  }

  function mostrarToast(texto){
    let toast = document.getElementById('bdrNotifToastForte');
    if(!toast){
      toast = document.createElement('div');
      toast.id = 'bdrNotifToastForte';
      toast.className = 'bdr-notif-toast-forte';
      document.body.appendChild(toast);
    }

    toast.textContent = texto || '🔔 Nova movimentação no Atlas';
    toast.classList.add('ativo');
    clearTimeout(window.__bdrNotifToastTimer);
    window.__bdrNotifToastTimer = setTimeout(() => toast.classList.remove('ativo'), 4200);
  }

  function animarSininho(){
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

  function avisarNovaNotificacao(mensagem){
    const agora = Date.now();
    if(agora - BDR_NOTIF.ultimoAvisoEm < 850) return;
    BDR_NOTIF.ultimoAvisoEm = agora;

    tocarSom();
    vibrar();
    animarSininho();
    mostrarToast(mensagem);
  }

  function bdrDataComoUTC(valor){
    if(!valor) return null;
    const txt = String(valor).trim();
    if(/[zZ]$|[+-]\d{2}:?\d{2}$/.test(txt)) return new Date(txt);
    return new Date(txt.replace(' ','T') + 'Z');
  }

  function formatarDataBDR(valor){
    const data = bdrDataComoUTC(valor);
    if(!data || Number.isNaN(data.getTime())) return '';

    return data.toLocaleString('pt-BR', {
      timeZone:'America/Cuiaba',
      day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'
    });
  }

  function agoraCuiabaParaSQL(){
    const partes = new Intl.DateTimeFormat('pt-BR', {
      timeZone:'America/Cuiaba',
      year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false
    }).formatToParts(new Date());

    const obj = {};
    partes.forEach(p => { obj[p.type] = p.value; });
    return `${obj.year}-${obj.month}-${obj.day} ${obj.hour}:${obj.minute}:${obj.second}`;
  }

  function atualizarBadge(total){
    const qtd = Number(total || 0);
    BDR_NOTIF.ultimoTotal = qtd;

    const badge = badgeEl();
    if(!badge) return;

    if(qtd > 0){
      badge.textContent = qtd > 99 ? '99+' : String(qtd);
      badge.style.display = 'inline-flex';
      badge.hidden = false;
    }else{
      badge.textContent = '0';
      badge.style.display = 'none';
      badge.hidden = true;
    }
  }

  function renderMensagem(texto){
    const lista = listaEl();
    if(lista) lista.innerHTML = `<div class="notif-item">${escapeHtml(texto)}</div>`;
  }

  function notificacaoNaoLida(n){
    return String(n?.status || '').toUpperCase() !== 'LIDA' && n?.lida !== true;
  }

  function tipoEhAcao(n){
    const tipo = String(n?.tipo || '').toUpperCase();
    return [
      'PEDIDO_CRIADO','PEDIDO_AGUARDANDO_ANALISE','PEDIDO_APROVACAO',
      'PEDIDO_EM_SEPARACAO','PEDIDO_AGUARDANDO_SEPARACAO',
      'PEDIDO_AGUARDANDO_RETIRADA','PEDIDO_AGUARDANDO_RECEBIMENTO',
      'PEDIDO_DIVERGENCIA','PEDIDO_RECEBIDO_DIVERGENCIA'
    ].some(x => tipo.includes(x));
  }

  function rotuloAcao(n){
    const tipo = String(n?.tipo || '').toUpperCase();
    if(tipo.includes('SEPAR')) return 'Abrir separação';
    if(tipo.includes('RETIRADA')) return 'Abrir retirada';
    if(tipo.includes('RECEB')) return 'Confirmar recebimento';
    if(tipo.includes('DIVERGEN')) return 'Analisar divergência';
    if(tipo.includes('APROV') || tipo.includes('CRIADO') || tipo.includes('ANALISE')) return 'Analisar pedido';
    return 'Abrir';
  }

  function linkSeguro(n){
    const tipo = String(n?.tipo || '').toUpperCase();
    const atual = String(n?.link || '').trim();
    if(atual) return atual;
    if(tipo.includes('SEPAR')) return 'expedicao.html?aba=separacao';
    if(tipo.includes('RETIRADA')) return 'expedicao.html?aba=retirada';
    if(tipo.includes('RECEB') || tipo.includes('TRANSITO')) return 'expedicao.html?aba=transito';
    if(tipo.includes('APROV') || tipo.includes('CRIADO') || tipo.includes('ANALISE')) return 'expedicao.html?aba=solicitacoes';
    return '';
  }

  function renderNotificacoes(rows){
    const lista = listaEl();
    if(!lista) return;

    if(!Array.isArray(rows) || !rows.length){
      renderMensagem('Nenhuma notificação no momento.');
      return;
    }

    const pendentes = rows.filter(tipoEhAcao);
    const atualizacoes = rows.filter(n => !tipoEhAcao(n));

    function htmlItem(n){
      const acao = tipoEhAcao(n);
      const link = escapeHtml(linkSeguro(n));
      const titulo = escapeHtml(n.titulo || n.tipo || 'Notificação');
      const mensagem = escapeHtml(n.mensagem || '');
      const data = escapeHtml(formatarDataBDR(n.created_at));

      return `
        <div class="notif-item ${acao ? 'bdr-notif-acao' : 'bdr-notif-info'}"
             data-id="${escapeHtml(n.id || '')}"
             data-link="${link}">
          <button type="button" class="bdr-notif-fechar" data-fechar-notif title="Marcar como lida e remover">×</button>
          <strong>${titulo}</strong>
          <div>${mensagem}</div>
          <small>${data}</small>

        </div>`;
    }

    let html = '';
    if(pendentes.length){
      html += '<div class="bdr-notif-grupo-titulo">Pendentes</div>';
      html += pendentes.map(htmlItem).join('');
    }
    if(atualizacoes.length){
      html += '<div class="bdr-notif-grupo-titulo">Atualizações</div>';
      html += atualizacoes.map(htmlItem).join('');
    }

    lista.innerHTML = html;
  }

  async function carregarNotificacoes(){
    if(BDR_NOTIF.carregando) return;

    if(!(await onlineReal())){
      setIconeOffline(true);
      atualizarBadge(0);
      renderMensagem('📴 Offline. Notificações pausadas.');
      return;
    }

    setIconeOffline(false);
    if(!temSupabase()){
      renderMensagem('Nenhuma notificação no momento.');
      return;
    }

    const usuario = usuarioAtualSeguro();
    const usuarioId = usuario?.id || usuario?.usuario_id;
    const empresaId = usuario?.empresa_id;

    if(!usuarioId){
      renderMensagem('Nenhuma notificação no momento.');
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
        .limit(50);

      if(empresaId) query = query.eq('empresa_id', empresaId);

      const { data, error } = await query;
      if(error) throw error;

      const rows = Array.isArray(data) ? data : [];
      const totalAnterior = BDR_NOTIF.ultimoTotal;
      const naoLidas = rows.filter(notificacaoNaoLida).length;
      const primeiraCarga = !BDR_NOTIF.primeiraCargaConcluida;

      atualizarBadge(naoLidas);
      renderNotificacoes(rows);

      if(!primeiraCarga && naoLidas > totalAnterior){
        const nova = rows[0] || {};
        avisarNovaNotificacao([nova.titulo,nova.mensagem].filter(Boolean).join(' — '));
      }

      BDR_NOTIF.primeiraCargaConcluida = true;
      BDR_NOTIF.errosSeguidos = 0;
    }catch(e){
      BDR_NOTIF.errosSeguidos++;
      console.warn('BDR notificações: erro ao carregar:', e?.message || e);
      renderMensagem('⚠️ Notificações indisponíveis no momento.');
    }finally{
      BDR_NOTIF.carregando = false;
    }
  }

  async function marcarNotificacaoComoLida(id, link){
    if(!id || BDR_NOTIF.marcandoLidas) return;
    if(!(await onlineReal()) || !temSupabase()) return;

    const usuario = usuarioAtualSeguro();
    const usuarioId = usuario?.id || usuario?.usuario_id;
    const empresaId = usuario?.empresa_id;
    if(!usuarioId) return;

    BDR_NOTIF.marcandoLidas = true;
    try{
      let query = window.client
        .from('notificacoes')
        .update({ lida:true, lida_em:agoraCuiabaParaSQL(), status:'LIDA' })
        .eq('id', id)
        .eq('usuario_destino_id', usuarioId);

      if(empresaId) query = query.eq('empresa_id', empresaId);

      const { error } = await query;
      if(error) throw error;

      await carregarNotificacoes();
      if(link) window.location.href = link;
    }catch(e){
      console.warn('BDR notificações: erro ao marcar como lida:', e?.message || e);
      if(link) window.location.href = link;
    }finally{
      BDR_NOTIF.marcandoLidas = false;
    }
  }

  async function marcarTodasComoLidas(){
    if(BDR_NOTIF.marcandoLidas) return;
    if(!(await onlineReal()) || !temSupabase()) return;

    const usuario = usuarioAtualSeguro();
    const usuarioId = usuario?.id || usuario?.usuario_id;
    const empresaId = usuario?.empresa_id;
    if(!usuarioId) return;

    BDR_NOTIF.marcandoLidas = true;
    try{
      let query = window.client
        .from('notificacoes')
        .update({ lida:true, lida_em:agoraCuiabaParaSQL(), status:'LIDA' })
        .eq('usuario_destino_id', usuarioId)
        .eq('lida', false);

      if(empresaId) query = query.eq('empresa_id', empresaId);

      const { error } = await query;
      if(error) throw error;
      await carregarNotificacoes();
    }catch(e){
      console.warn('BDR notificações: erro ao marcar todas:', e?.message || e);
    }finally{
      BDR_NOTIF.marcandoLidas = false;
    }
  }

  function iniciarTimer(){
    if(BDR_NOTIF.timer) return;
    BDR_NOTIF.timer = setInterval(carregarNotificacoes, BDR_NOTIF.intervaloMs);
  }

  function pararTimer(){
    if(BDR_NOTIF.timer){
      clearInterval(BDR_NOTIF.timer);
      BDR_NOTIF.timer = null;
    }
  }

  function pararRealtime(){
    try{
      if(BDR_NOTIF.realtimeChannel && window.client?.removeChannel){
        window.client.removeChannel(BDR_NOTIF.realtimeChannel);
      }
    }catch(e){}
    BDR_NOTIF.realtimeChannel = null;
  }

  function iniciarRealtime(){
    try{
      if(!temSupabase() || typeof window.client.channel !== 'function') return;
      if(BDR_NOTIF.realtimeChannel) return;

      const usuario = usuarioAtualSeguro();
      const usuarioId = usuario?.id || usuario?.usuario_id;
      const empresaId = usuario?.empresa_id;
      if(!usuarioId) return;

      BDR_NOTIF.realtimeChannel = window.client
        .channel('bdr-notif-' + usuarioId + '-' + Date.now())
        .on('postgres_changes', {
          event:'INSERT',schema:'public',table:'notificacoes',
          filter:'usuario_destino_id=eq.' + usuarioId
        }, async payload => {
          const nova = payload?.new || {};
          if(empresaId && nova.empresa_id && String(empresaId) !== String(nova.empresa_id)) return;
          await carregarNotificacoes();
          avisarNovaNotificacao([nova.titulo,nova.mensagem].filter(Boolean).join(' — '));
        })
        .subscribe();
    }catch(e){
      console.warn('BDR notificações: realtime indisponível:', e?.message || e);
    }
  }

  async function iniciarNotificacoes(){
    if(!(await onlineReal())){
      pararTimer();
      pararRealtime();
      setIconeOffline(true);
      renderMensagem('📴 Offline. Notificações pausadas.');
      return;
    }

    await carregarNotificacoes();
    iniciarRealtime();
    iniciarTimer();
  }

  async function toggleNotificacoes(event){
    event?.stopPropagation();
    const drop = dropdownEl();
    if(!drop) return;

    document.getElementById('dropdownUser')?.classList.remove('ativo');
    drop.classList.toggle('ativo');

    if(drop.classList.contains('ativo')) await carregarNotificacoes();
  }

  function registrarEventBus(){
    try{
      const tratar = async payload => {
        await carregarNotificacoes();
        const n = payload?.notificacao || payload || {};
        avisarNovaNotificacao([n.titulo,n.mensagem].filter(Boolean).join(' — '));
      };

      if(window.AtlasEvents?.on){
        window.AtlasEvents.on('notificacao.criada', tratar);
      }

      window.addEventListener('atlas:notificacao.criada', e => {
        tratar(e?.detail?.payload || e?.detail || {});
      });
    }catch(e){}
  }

  document.addEventListener('DOMContentLoaded', () => {
    aplicarCss();
    registrarLiberacaoAudio();
    registrarEventBus();

    const drop = dropdownEl();
    if(drop){
      const head = drop.querySelector('.notif-head');
      if(head && !head.querySelector('[data-marcar-todas]')){
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'bdr-notif-limpar-todas';
        btn.setAttribute('data-marcar-todas','');
        btn.textContent = 'Marcar todas como lidas';
        head.appendChild(btn);
      }

      drop.addEventListener('click', async e => {
        e.stopPropagation();

        if(e.target.closest('[data-marcar-todas]')){
          await marcarTodasComoLidas();
          return;
        }

        const item = e.target.closest('.notif-item[data-id]');
        if(!item) return;

        const id = item.getAttribute('data-id');
        const link = item.getAttribute('data-link') || '';

        if(e.target.closest('[data-fechar-notif]')){
          await marcarNotificacaoComoLida(id, '');
          return;
        }

        if(item.classList.contains('bdr-notif-acao') && link){
          await marcarNotificacaoComoLida(id, link);
        }
      });
    }

    iniciarNotificacoes();
  });

  document.addEventListener('click', e => {
    if(!e.target.closest('.notif-wrap')) dropdownEl()?.classList.remove('ativo');
  });

  document.addEventListener('visibilitychange', () => {
    if(document.visibilityState === 'visible') iniciarNotificacoes();
  });

  window.addEventListener('online', iniciarNotificacoes);
  window.addEventListener('offline', () => {
    pararTimer();
    pararRealtime();
    setIconeOffline(true);
  });

  window.BDR_NOTIF = BDR_NOTIF;
  window.toggleNotificacoes = toggleNotificacoes;
  window.bdrIniciarNotificacoes = iniciarNotificacoes;
  window.bdrCarregarNotificacoes = carregarNotificacoes;
  window.bdrAvisarNovaNotificacao = avisarNovaNotificacao;
  window.bdrMarcarNotificacaoComoLida = marcarNotificacaoComoLida;
  window.bdrMarcarTodasNotificacoesComoLidas = marcarTodasComoLidas;

  console.log('✅ BDR NOTIFICAÇÕES V12.1 carregado - cartão azul clicável');
})();