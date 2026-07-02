/* =========================================================
   BDR NOTIFICAÇÕES GLOBAL - SUPABASE
   Arquivo único para TODAS as páginas.

   - Online: sino normal, badge e som.
   - Offline: sino cortado vermelho, sem badge, sem som e sem busca Supabase.
========================================================= */
(function(){
  "use strict";

  if(window.BDR_NOTIFICACOES_GLOBAL_ATIVO){
    console.warn("BDR Notificações: já iniciado nesta página.");
    return;
  }

  window.BDR_NOTIFICACOES_GLOBAL_ATIVO = true;

  const CANAL_NOME = "bdr_notificacoes_global_v1";
  const STORAGE_SOM = "bdr_som_liberado";

  let notificacoes = [];
  let canal = null;
  let intervalo = null;
  let primeiraCarga = true;
  let ultimoTotal = 0;
  let audioCtx = null;

  function db(){
    if(typeof window.db === "function"){
      try{
        const banco = window.db();
        if(banco) return banco;
      }catch(e){}
    }

    return window.client ||
           window.supabaseClient ||
           window.clientSupabase ||
           globalThis.client ||
           null;
  }

  function usuarioAtual(){
    try{
      const raw = localStorage.getItem("usuario_logado") || localStorage.getItem("usuarioLogado");
      return raw ? JSON.parse(raw) : null;
    }catch(e){
      return null;
    }
  }

  function perfilUsuario(){
    return String(usuarioAtual()?.perfil || "").toUpperCase();
  }

  function permissoesUsuario(){
    const u = usuarioAtual();

    if(Array.isArray(u?.permissoes)){
      return u.permissoes.map(x => String(x).trim().toUpperCase()).filter(Boolean);
    }

    return String(u?.permissoes || "")
      .split(",")
      .map(x => x.trim().toUpperCase())
      .filter(Boolean);
  }

  function podeReceberNotificacoes(){
    const perfil = perfilUsuario();
    const ps = permissoesUsuario();

    return ["MASTER","ADMIN","ALMOXARIFE","ALMOXARIFADO"].includes(perfil) ||
      ps.includes("RECEBER_NOTIFICACOES") ||
      ps.includes("NOTIFICACOES") ||
      ps.includes("VER_NOTIFICACOES");
  }

  function podeVerTodasNotificacoes(){
    const ps = permissoesUsuario();
    return ps.includes("NOTIFICACOES_TODAS") || ps.includes("VER_TODAS_NOTIFICACOES");
  }

  function escapeHtml(txt){
    return String(txt ?? "").replace(/[&<>'"]/g, c => ({
      "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;"
    }[c]));
  }

  function dataBR(data){
    if(!data) return "";
    const texto = String(data);
    let d;

    if(texto.includes("T")) d = new Date(texto);
    else d = new Date(texto.replace(" ", "T") + "-04:00");

    if(isNaN(d.getTime())) return "";

    return d.toLocaleString("pt-BR", {
      timeZone: "America/Cuiaba",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  function aplicarCss(){
    if(document.getElementById("bdrNotificacoesCss")) return;

    const style = document.createElement("style");
    style.id = "bdrNotificacoesCss";
    style.textContent = `
      .notif-wrap{position:relative!important;}
      .notif-btn{position:relative!important;width:38px!important;height:38px!important;border:none!important;border-radius:50%!important;background:#fff!important;color:#111827!important;display:flex!important;align-items:center!important;justify-content:center!important;cursor:pointer!important;padding:0!important;outline:none!important;box-shadow:none!important;caret-color:transparent!important;user-select:none!important;-webkit-user-select:none!important;-webkit-tap-highlight-color:transparent!important;}
      .notif-btn:hover{background:#fff1f2!important;color:#d71920!important;transform:translateY(-1px)!important;}
      .notif-btn.notif-offline{background:#fee2e2!important;color:#dc2626!important;border:1px solid #fecaca!important;}
      .notif-btn.notif-offline:hover{background:#fecaca!important;color:#b91c1c!important;}
      .notif-btn.notif-offline .fa-bell:before,
      .notif-btn.notif-offline .fa-regular.fa-bell:before,
      .notif-btn.notif-offline .fa-solid.fa-bell:before{content:"\\f1f6"!important;font-family:"Font Awesome 6 Free"!important;font-weight:900!important;}
      .notif-badge{position:absolute!important;top:-3px!important;right:-4px!important;min-width:18px!important;height:18px!important;padding:0 5px!important;border-radius:999px!important;background:#dc2626!important;color:#fff!important;font-size:10px!important;font-weight:900!important;display:none;align-items:center!important;justify-content:center!important;border:2px solid #fff!important;}
      .notif-dropdown{position:absolute!important;top:50px!important;right:0!important;width:380px!important;background:#fff!important;border:1px solid #e5e7eb!important;border-radius:14px!important;box-shadow:0 18px 35px rgba(15,23,42,.18)!important;overflow:hidden!important;display:none;z-index:99999!important;}
      .notif-dropdown.ativo{display:block!important;}
      .notif-head{padding:12px 14px!important;font-weight:900!important;color:#d71920!important;background:#fff5f5!important;border-bottom:1px solid #fecaca!important;display:flex!important;justify-content:space-between!important;align-items:center!important;gap:8px!important;}
      .notif-list{max-height:350px!important;overflow:auto!important;}
      .notif-item{padding:11px 14px!important;border-bottom:1px solid #f1f5f9!important;font-size:12px!important;color:#374151!important;cursor:pointer!important;line-height:1.35!important;}
      .notif-item:hover{background:#fff1f2!important;}
      .notif-item strong{display:block!important;color:#111827!important;margin-bottom:3px!important;}
      .notif-item small{color:#6b7280!important;}
      .notif-empty{padding:14px!important;font-size:12px!important;color:#6b7280!important;line-height:1.45!important;}
      .notif-empty button{border:0!important;border-radius:9px!important;padding:8px 10px!important;background:#111827!important;color:#fff!important;font-size:11px!important;font-weight:900!important;cursor:pointer!important;}
      @media(max-width:900px){.notif-dropdown{right:-120px!important;width:310px!important;}}
    `;
    document.head.appendChild(style);
  }

  function atualizarEstadoSinoOffline(offline=false){
    const btn = document.querySelector(".notif-btn");
    const badge = document.getElementById("notifBadge");
    if(!btn) return;

    if(offline){
      btn.classList.add("notif-offline");
      btn.title = "Offline - notificações pausadas";
      if(badge){
        badge.style.display = "none";
        badge.innerText = "0";
      }
    }else{
      btn.classList.remove("notif-offline");
      btn.title = "Notificações";
    }
  }

  async function liberarSom(){
    try{
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if(!Ctx) return false;
      if(!audioCtx) audioCtx = new Ctx();
      if(audioCtx.state === "suspended") await audioCtx.resume();
      localStorage.setItem(STORAGE_SOM, "SIM");
      return true;
    }catch(e){ return false; }
  }

  function tocarSom(){
    try{
      if(navigator.onLine === false) return;
      if(localStorage.getItem(STORAGE_SOM) !== "SIM") return;
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if(!Ctx) return;
      if(!audioCtx) audioCtx = new Ctx();

      [880, 1175].forEach((freq, i) => {
        const delay = i * 0.16;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime + delay);
        gain.gain.setValueAtTime(0.0001, audioCtx.currentTime + delay);
        gain.gain.linearRampToValueAtTime(0.22, audioCtx.currentTime + delay + 0.02);
        gain.gain.linearRampToValueAtTime(0.0001, audioCtx.currentTime + delay + 0.13);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(audioCtx.currentTime + delay);
        osc.stop(audioCtx.currentTime + delay + 0.16);
      });
      if(navigator.vibrate) navigator.vibrate([100,50,100]);
    }catch(e){}
  }

  window.bdrLiberarSomSininho = liberarSom;
  window.bdrTestarSomSininho = function(){ liberarSom().then(tocarSom); };
  document.addEventListener("click", liberarSom, { passive:true });
  document.addEventListener("touchstart", liberarSom, { passive:true });

  function montarFiltroDestinatario(u){
    const partes = [];
    if(u?.id) partes.push(`usuario_destino_id.eq.${u.id}`);
    if(u?.obra_id) partes.push(`obra_destino_id.eq.${u.obra_id}`);
    return partes.join(",");
  }

  async function carregar(){
    if(navigator.onLine === false){
      notificacoes = [];
      atualizarEstadoSinoOffline(true);
      atualizarTela("Offline. O sininho está pausado.");
      return;
    }

    atualizarEstadoSinoOffline(false);

    const banco = db();
    const u = usuarioAtual();

    if(!banco || !u || !podeReceberNotificacoes()){
      notificacoes = [];
      atualizarTela();
      return;
    }

    let query = banco
      .from("notificacoes")
      .select("*")
      .eq("lida", false)
      .order("created_at", { ascending:false })
      .limit(50);

    if(u.empresa_id) query = query.eq("empresa_id", u.empresa_id);

    const filtro = montarFiltroDestinatario(u);

    if(!podeVerTodasNotificacoes()){
      if(!filtro){
        notificacoes = [];
        atualizarTela();
        return;
      }
      query = query.or(filtro);
    }

    const { data, error } = await query;

    if(error){
      console.warn("BDR Notificações:", error.message);
      notificacoes = [];
      atualizarTela("Erro ao buscar notificações.");
      return;
    }

    notificacoes = data || [];
    const totalAtual = notificacoes.length;

    if(!primeiraCarga && totalAtual > ultimoTotal) tocarSom();

    primeiraCarga = false;
    ultimoTotal = totalAtual;
    atualizarTela();
  }

  async function marcarComoLidas(ids){
    if(navigator.onLine === false) return;
    const banco = db();
    if(!banco || !ids?.length) return;

    const { error } = await banco
      .from("notificacoes")
      .update({ lida:true, status:"LIDA", lida_em:new Date().toISOString() })
      .in("id", ids);

    if(error){
      console.warn("BDR Notificações: erro ao marcar lida:", error.message);
      return;
    }

    notificacoes = notificacoes.filter(n => !ids.includes(n.id));
    atualizarTela();
  }

  window.bdrMarcarTodasNotificacoesLidas = async function(){
    await marcarComoLidas(notificacoes.map(n => n.id));
  };

  window.bdrAbrirNotificacao = async function(id, link){
    if(navigator.onLine === false) return;
    await marcarComoLidas([id]);
    if(link) window.location.href = link;
  };

  window.bdrCriarNotificacao = async function(dados={}){
    if(navigator.onLine === false){
      console.warn("BDR Notificações: offline, não foi possível criar agora.");
      return { error:{ message:"Offline" } };
    }

    const banco = db();
    const u = usuarioAtual();
    if(!banco) return { error:{ message:"Supabase não carregado" } };

    const payload = {
      empresa_id: dados.empresa_id ?? u?.empresa_id ?? null,
      usuario_destino_id: dados.usuario_destino_id ?? null,
      obra_destino_id: dados.obra_destino_id ?? null,
      obra_origem_id: dados.obra_origem_id ?? null,
      pedido_id: dados.pedido_id ?? null,
      patrimonio_id: dados.patrimonio_id ?? null,
      produto_id: dados.produto_id ?? null,
      tipo: dados.tipo || "GERAL",
      titulo: dados.titulo || "Nova notificação",
      mensagem: dados.mensagem || "Você tem uma nova atualização.",
      link: dados.link || null,
      status: "NAO_LIDA",
      lida: false
    };

    const { data, error } = await banco.from("notificacoes").insert([payload]).select();
    if(error) console.warn("BDR Notificações: erro ao criar:", error.message);
    return { data, error };
  };

  function atualizarTela(msgErro=""){
    aplicarCss();

    const badge = document.getElementById("notifBadge");
    const lista = document.getElementById("notifLista");
    const head = document.querySelector(".notif-head");
    const offline = navigator.onLine === false;

    atualizarEstadoSinoOffline(offline);

    if(head){
      head.innerHTML = offline
        ? `<span>🔕 Notificações offline</span><small style="font-size:11px;color:#dc2626;font-weight:900;">Pausado</small>`
        : `<span>🔔 Central de notificações</span><small style="font-size:11px;color:#6b7280;font-weight:800;">Global</small>`;
    }

    if(!badge || !lista) return;

    if(offline){
      badge.style.display = "none";
      lista.innerHTML = `<div class="notif-empty">🔕 Você está offline. O sininho está pausado e volta automaticamente quando a internet retornar.</div>`;
      return;
    }

    if(!podeReceberNotificacoes()){
      badge.style.display = "none";
      lista.innerHTML = `<div class="notif-empty">Notificações desativadas para este usuário.</div>`;
      return;
    }

    const total = notificacoes.length;
    badge.innerText = total > 9 ? "9+" : total;
    badge.style.display = total > 0 ? "inline-flex" : "none";

    if(msgErro){
      lista.innerHTML = `<div class="notif-empty">${escapeHtml(msgErro)}</div>`;
      return;
    }

    if(total === 0){
      lista.innerHTML = `<div class="notif-empty">Nenhuma notificação nova no momento.</div>`;
      return;
    }

    lista.innerHTML = notificacoes.map(n => {
      const id = Number(n.id);
      const titulo = escapeHtml(n.titulo || "Notificação");
      const mensagem = escapeHtml(n.mensagem || "");
      const data = escapeHtml(dataBR(n.created_at));
      const link = escapeHtml(n.link || "");

      return `
        <div class="notif-item" onclick="bdrAbrirNotificacao(${id}, '${link}')">
          <strong>🔴 ${titulo}</strong>
          <span>${mensagem}</span><br>
          <small>${data}</small>
        </div>
      `;
    }).join("") + `
      <div class="notif-empty">
        <button onclick="bdrMarcarTodasNotificacoesLidas()">Marcar tudo como lido</button>
      </div>
    `;
  }

  window.toggleNotificacoes = function(event){
    if(event) event.stopPropagation();
    const dropdown = document.getElementById("notifDropdown");
    if(!dropdown) return;

    dropdown.classList.toggle("ativo");
    document.getElementById("dropdownUser")?.classList.remove("ativo");
    document.getElementById("userDropdown")?.classList.remove("show");
    document.getElementById("userMenuTop")?.classList.remove("open");
    atualizarTela();
  };

  function fechar(){
    document.getElementById("notifDropdown")?.classList.remove("ativo");
  }

  document.addEventListener("click", fechar);
  document.addEventListener("keydown", e => { if(e.key === "Escape") fechar(); });

  function iniciarRealtime(){
    if(navigator.onLine === false) return;
    const banco = db();
    if(!banco || typeof banco.channel !== "function" || canal) return;

    try{
      canal = banco
        .channel(CANAL_NOME)
        .on("postgres_changes", { event:"*", schema:"public", table:"notificacoes" }, carregar)
        .subscribe();
    }catch(e){
      console.warn("BDR Notificações: realtime não iniciado.", e);
    }
  }

  function pararRealtime(){
    const banco = db();
    try{
      if(canal && banco && typeof banco.removeChannel === "function") banco.removeChannel(canal);
    }catch(e){}
    canal = null;
  }

  function pausarOffline(){
    if(intervalo) clearInterval(intervalo);
    intervalo = null;
    pararRealtime();
    notificacoes = [];
    atualizarEstadoSinoOffline(true);
    atualizarTela("Offline. O sininho está pausado.");
  }

  function voltarOnline(){
    setTimeout(() => {
      if(navigator.onLine === false) return;
      atualizarEstadoSinoOffline(false);
      carregar();
      iniciarRealtime();
      if(intervalo) clearInterval(intervalo);
      intervalo = setInterval(carregar, 30000);
    }, 1500);
  }

  window.addEventListener("offline", pausarOffline);
  window.addEventListener("online", voltarOnline);

  function iniciar(){
    aplicarCss();
    atualizarTela();

    if(navigator.onLine === false){
      pausarOffline();
      return;
    }

    atualizarEstadoSinoOffline(false);
    carregar();
    iniciarRealtime();

    if(intervalo) clearInterval(intervalo);
    intervalo = setInterval(carregar, 30000);
  }

  if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar);
  else iniciar();

})();
