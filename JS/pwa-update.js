/* BDR ERP - Atualização PWA (janela principal) */
(function () {
  'use strict';
  if (window !== window.top || window.BDRPwaUpdate || !('serviceWorker' in navigator)) return;
  const sw = navigator.serviceWorker;
  const KEY = 'bdr_pwa_update_receipt';
  const loginPage = /(?:^|\/)login\.html$/i.test(location.pathname);
  let registration, initialController = sw.controller, pending = null;
  let busy = false, reloading = false, changed = false, timer, checking = false;
  let bar, heading, detail, action;
  const watched = new WeakSet();

  function render(state, message) {
    if (!loginPage) return;
    if (!bar) {
      bar = document.createElement('aside');
      bar.id = 'bdrPwaUpdate';
      bar.setAttribute('role', 'region');
      bar.setAttribute('aria-label', 'Atualização do sistema');
      bar.innerHTML = '<div class="bdr-pwa-symbol" aria-hidden="true"></div><div class="bdr-pwa-copy" role="status" aria-live="polite"><strong></strong><span></span></div><button type="button">Atualizar agora</button>';
      heading = bar.querySelector('strong'); detail = bar.querySelector('.bdr-pwa-copy span'); action = bar.querySelector('button');
      action.addEventListener('click', atualizar);
      document.body.appendChild(bar);
    }
    clearTimeout(timer);
    bar.dataset.state = state;
    heading.textContent = ({ready:'Nova versão disponível',working:'Atualizando sistema…',success:'Sistema atualizado com sucesso!',error:'Não foi possível atualizar'})[state];
    detail.textContent = message || ({ready:'Atualize quando terminar sua atividade.',working:'Preparando a nova versão.',success:'Você já está utilizando a nova versão.',error:'Verifique a conexão e tente novamente.'})[state];
    action.hidden = state === 'working' || state === 'success';
    action.disabled = state === 'working';
    action.textContent = state === 'error' ? 'Tentar novamente' : 'Atualizar agora';
    if (state === 'success') timer = setTimeout(() => { if (bar) bar.remove(); bar = null; }, 4500);
  }

  function watch(worker) {
    if (!worker || watched.has(worker)) return;
    watched.add(worker);
    const check = () => {
      if (worker.state === 'installed' && sw.controller) { pending = worker; if (!busy) render('ready'); }
      if (worker.state === 'redundant' && pending === worker) { pending = null; if (!busy) refreshNotice(); }
    };
    worker.addEventListener('statechange', check); check();
  }
  function refreshNotice() {
    if (busy) return;
    if (registration?.waiting && sw.controller) { pending = registration.waiting; render('ready'); }
    else if (changed) render('ready');
    else if (bar && bar.dataset.state === 'ready') { bar.remove(); bar = null; }
  }
  function workerVersion(worker) {
    return new Promise(resolve => {
      if (!worker || typeof MessageChannel !== 'function') return resolve(null);
      const channel = new MessageChannel();
      const finish = value => { clearTimeout(timeout); channel.port1.close(); resolve(value); };
      const timeout = setTimeout(() => finish(null), 1500);
      channel.port1.onmessage = e => finish(typeof e.data?.version === 'string' ? e.data.version : null);
      try { worker.postMessage({type:'BDR_GET_VERSION'}, [channel.port2]); } catch (_) { finish(null); }
    });
  }
  function waitForController(target) {
    return new Promise((resolve, reject) => {
      let timeout;
      const cleanup = () => { clearTimeout(timeout); sw.removeEventListener('controllerchange', check); };
      const check = () => { if (sw.controller === target) { cleanup(); resolve(); } };
      sw.addEventListener('controllerchange', check);
      timeout = setTimeout(() => { cleanup(); reject(new Error('A nova versão ainda não assumiu o controle. Tente novamente.')); }, 18000);
      try { if (target.state === 'installed') target.postMessage({type:'SKIP_WAITING'}); check(); }
      catch (error) { cleanup(); reject(error); }
    });
  }
  async function checkUpdate() {
    if (checking || busy || !registration || !navigator.onLine) return;
    checking = true;
    try { await registration.update(); watch(registration.installing); refreshNotice(); }
    catch (_) { /* Sem conexão: manter versão atual. */ }
    finally { checking = false; }
  }
  async function atualizar() {
    if (!loginPage || busy || reloading) return;
    if (!navigator.onLine) { render('error', 'Sem conexão. Reconecte-se e tente novamente.'); return; }
    const loginFilled = Array.from(document.querySelectorAll('#formLogin input:not([type=checkbox])')).some(input => input.value);
    if (loginFilled && !window.confirm('Salve ou conclua o que estiver fazendo antes de atualizar. A página será recarregada. Continuar?')) return;
    busy = true; render('working');
    try {
      registration = registration || await sw.getRegistration();
      if (!registration) throw new Error('Serviço de atualização indisponível.');
      const target = registration.waiting || (pending && ['installed','activating'].includes(pending.state) ? pending : null);
      if (target && target !== sw.controller) await waitForController(target);
      else if (!changed && !target) {
        await registration.update();
        if (registration.waiting && registration.waiting !== sw.controller) await waitForController(registration.waiting);
        else if (registration.installing) throw new Error('A nova versão está sendo preparada. Tente novamente em instantes.');
        else if (!changed) { busy = false; if (bar) { bar.remove(); bar = null; } return; }
      }
      const version = await workerVersion(sw.controller);
      if (!version) throw new Error('Não foi possível confirmar a nova versão. Tente novamente.');
      try { sessionStorage.setItem(KEY, JSON.stringify({version, at:Date.now()})); } catch (_) { /* A atualização não depende de armazenamento da interface. */ }
      reloading = true;
      location.reload();
    } catch (error) { busy = false; render('error', error.message || 'Tente novamente.'); }
  }
  async function init() {
    const legacy = document.getElementById('bdrUpdateBar'); if (legacy) legacy.hidden = true;
    sw.addEventListener('controllerchange', () => {
      const controller = sw.controller;
      if (initialController && controller && controller !== initialController) { changed = true; if (!busy) render('ready'); }
      if (!initialController && controller) initialController = controller;
    });
    try {
      registration = await sw.register('./service-worker.js', {updateViaCache:'none'});
      registration.addEventListener('updatefound', () => watch(registration.installing));
      watch(registration.installing); refreshNotice();
      let receipt = null;
      if (loginPage) {
        try { receipt = JSON.parse(sessionStorage.getItem(KEY) || 'null'); sessionStorage.removeItem(KEY); } catch (_) {}
      }
      if (receipt && Date.now() - receipt.at < 120000 && await workerVersion(sw.controller) === receipt.version && !registration.waiting && !changed) render('success');
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkUpdate(); });
      window.addEventListener('online', checkUpdate);
      checkUpdate();
    } catch (error) { console.warn('BDR: atualização PWA indisponível.', error); }
  }
  window.BDRPwaUpdate = { atualizar };
  window.bdrAtualizarAgora = atualizar;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true}); else init();
})();
