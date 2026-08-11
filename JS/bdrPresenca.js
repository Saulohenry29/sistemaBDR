/* =========================================================
   ATLAS / BDR — PRESENÇA DE USUÁRIOS
   Arquivo: JS/bdrPresenca.js

   RESPONSABILIDADE:
   - registrar presença do usuário logado;
   - informar tela, navegador, dispositivo e última atividade;
   - não controlar autenticação e não armazenar dados sensíveis.

   REGRA DE PRESENÇA:
   - o status não depende de foco/visibilityState;
   - se o heartbeat chega recentemente, o usuário está ONLINE;
   - a classificação final é feita no banco pela idade do heartbeat.
========================================================= */
(function(){
  "use strict";

  if(window.BDR_PRESENCA?.__loaded) return;

  const INTERVALO_HEARTBEAT = 30 * 1000;
  const INTERVALO_ATIVIDADE = 15 * 1000;
  let timer = null;
  let ultimoEnvio = 0;

  function client(){
    return window.client || window.supabaseClient || null;
  }

  function usuarioAtual(){
    try{
      const raw = localStorage.getItem("usuario_logado") || localStorage.getItem("usuarioLogado") || localStorage.getItem("usuarioAtual");
      return raw ? JSON.parse(raw) : null;
    }catch(_){ return null; }
  }

  function navegador(){
    const ua = navigator.userAgent || "";
    if(/Edg\//i.test(ua)) return "Edge";
    if(/OPR\//i.test(ua)) return "Opera";
    if(/Chrome\//i.test(ua)) return "Chrome";
    if(/Firefox\//i.test(ua)) return "Firefox";
    if(/Safari\//i.test(ua)) return "Safari";
    return "Navegador";
  }

  function dispositivo(){
    const ua = navigator.userAgent || "";
    if(/iPhone/i.test(ua)) return "iPhone";
    if(/iPad/i.test(ua)) return "iPad";
    if(/Android/i.test(ua)) return /Mobile/i.test(ua) ? "Android" : "Tablet Android";
    if(/Windows/i.test(ua)) return "Windows";
    if(/Macintosh|Mac OS X/i.test(ua)) return "Mac";
    if(/Linux/i.test(ua)) return "Linux";
    return "Dispositivo";
  }

  function telaAtual(){
    const h1 = document.querySelector("main h1, .bdr-main h1, h1");
    const texto = String(h1?.textContent || "").trim();
    if(texto) return texto.slice(0, 80);

    const arquivo = location.pathname.split("/").filter(Boolean).pop() || "dashboard.html";
    return arquivo
      .replace(/\.html?$/i, "")
      .replace(/[-_]+/g, " ")
      .replace(/\b\w/g, letra => letra.toUpperCase())
      .slice(0, 80);
  }

  async function enviar(forcar=false){
    const agora = Date.now();
    if(!forcar && agora - ultimoEnvio < INTERVALO_ATIVIDADE) return;
    if(navigator.onLine === false) return;

    const db = client();
    const usuario = usuarioAtual();
    const usuarioId = Number(usuario?.id || usuario?.usuario_id || 0);
    if(!db || !usuarioId) return;

    ultimoEnvio = agora;

    try{
      const {error} = await db.rpc("atlas_presenca_heartbeat", {
        p_usuario_id: usuarioId,
        p_tela: telaAtual(),
        p_navegador: navegador(),
        p_dispositivo: dispositivo(),
        p_visivel: true
      });
      if(error) throw error;
    }catch(error){
      // A presença nunca pode interromper o uso normal do Atlas.
      if(window.BDR_DEBUG_PRESENCA){
        console.warn("Atlas Presença:", error?.message || error);
      }
    }
  }

  function iniciar(){
    if(!usuarioAtual()) return;

    enviar(true);
    clearInterval(timer);
    timer = setInterval(() => enviar(true), INTERVALO_HEARTBEAT);
  }

  // Interações antecipam o heartbeat, mas não determinam o status.
  ["click","keydown","touchstart","scroll"].forEach(evento => {
    window.addEventListener(evento, () => enviar(false), {passive:true});
  });

  // Ao retornar para a aba/app ou recuperar internet, atualiza imediatamente.
  document.addEventListener("visibilitychange", () => {
    if(document.visibilityState === "visible") enviar(true);
  });
  window.addEventListener("focus", () => enviar(true));
  window.addEventListener("online", () => enviar(true));
  window.addEventListener("pageshow", () => enviar(true));

  window.BDR_PRESENCA = {
    __loaded:true,
    iniciar,
    enviar
  };

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", iniciar);
  }else{
    iniciar();
  }
})();
