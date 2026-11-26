/* BDR ERP - Service Worker V4 SAFE OFFLINE */
const BDR_CACHE_VERSION = "bdr-erp-v4.0.12-pwa-login";

const BDR_ASSETS = [
  "./",
  "./index.html",
  "./login.html",
  "./atlas.html",
  "./dashboard.html",
  "./estoque.html",
  "./expedicao.html",
  "./patrimonio.html",
  "./usuarios.html",
  "./relatorios.html",
  "./empresa.html",
  "./entrada.html",
  "./triagem.html",
  "./etiqueta-impressao.html",
  "./etiqueta-lote.html",
  "./etiqueta-config.html",
  "./manifest.json",

  "./icons/icon-192.png",
  "./icons/icon-512.png",

  "./assets/logo-bdr.png",
  "./assets/obra-bdr.jpg",
  "./imagens/engrenagem.png",

  "./CSS/layout-bdr.css",
  "./CSS/responsivo-bdr.css",
  "./CSS/bdr-fix-menu-final.css",

  "./JS/pwa-install.js",
  "./JS/atlasBadge.js",
  "./JS/atlasBadge.js?v=20261126-pwa-update",
  "./JS/pwa-update.js",
  "./JS/pwa-update.js?v=20261126-pwa-login",
  "./CSS/pwa-update.css?v=20261126-pwa-update",
  "./JS/supabaseClient.js",
  "./JS/auth.js",
  "./JS/bdrCore.js",
  "./JS/bdrSessaoRealtime.js",
  "./JS/offlineDB.js",
  "./JS/offlineSync.js",
  "./JS/offlineQueue.js",
  "./JS/bdrLocalCache.js",
  "./JS/atlasEtiquetaConfig.js",
  "./JS/atlasPrintCenter.js",
  "./JS/atlasQRCode/qrcode.min.js",
  "./JS/atlasQRCode.js",
  "./JS/impressao/atlasEtiquetaImagemB1.js",
  "./JS/impressao/niimbot.js",
  "./JS/patrimonio/patrimonio-etiqueta-individual.js",

  "./JS/entrada.js",
  "./JS/triagem.js",
  "./JS/estoque.js",
  "./JS/expedicao.js",
  "./JS/patrimonioService.js",
  "./JS/patrimonio/patrimonio.js",
  "./JS/movimentacao.js",
  "./JS/usuarios.js"
];


/* =========================================================
   CACHE SEGURO
   ---------------------------------------------------------
   O navegador pode carregar MP3 em partes usando HTTP 206.
   O Cache Storage não aceita respostas parciais.

   Esta função salva somente respostas completas e válidas.
========================================================= */
async function bdrSalvarRespostaCompletaNoCache(cacheName, request, response){
  try{
    if(!response) return false;

    // Resposta parcial de áudio/vídeo: não pode entrar no Cache Storage.
    if(response.status === 206) return false;

    // Evita guardar erros, redirecionamentos problemáticos e respostas inválidas.
    if(!response.ok) return false;

    const cache = await caches.open(cacheName);
    await cache.put(request, response.clone());
    return true;
  }catch(error){
    console.warn("BDR SW: resposta não armazenada no cache:", request.url, error);
    return false;
  }
}

const BDR_UPDATE_CRITICAL = new Set(["./index.html", "./login.html", "./atlas.html", "./JS/pwa-update.js?v=20261126-pwa-login", "./CSS/pwa-update.css?v=20261126-pwa-update", "./JS/atlasBadge.js?v=20261126-pwa-update"]);

self.addEventListener("install", event => {
  // Atualizações aguardam autorização; a primeira instalação ativa normalmente.
  event.waitUntil(
    caches.open(BDR_CACHE_VERSION).then(async cache => {
      for(const asset of BDR_ASSETS){
        try{ await cache.add(new Request(asset, {cache:"reload"})); }
        catch(e){
          if(BDR_UPDATE_CRITICAL.has(asset)) throw e;
          console.warn("Cache parcial:", asset, e.message || e);
        }
      }
    })
  );
});

async function bdrLimparBadgeExterno(){
  try{
    if(typeof self.navigator?.clearAppBadge==="function"){
      await self.navigator.clearAppBadge();
    }
  }catch(_){}
}

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith("bdr-erp-") && k !== BDR_CACHE_VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
      .then(() => bdrLimparBadgeExterno())
  );
});

self.addEventListener("fetch", event => {
  const req = event.request;
  if(req.method !== "GET") return;

  const url = new URL(req.url);
  if(url.hostname.includes("supabase.co")) return;

  if(url.hostname.includes("cdn.jsdelivr.net") || url.hostname.includes("cdnjs.cloudflare.com")){
    event.respondWith(
      caches.match(req).then(cached => cached || fetch(req).then(resp => {
        bdrSalvarRespostaCompletaNoCache(BDR_CACHE_VERSION, req, resp.clone());
        return resp;
      }).catch(() => cached))
    );
    return;
  }

  if(req.headers.get("accept")?.includes("text/html")){
    event.respondWith(
      fetch(req).then(resp => {
        bdrSalvarRespostaCompletaNoCache(BDR_CACHE_VERSION, req, resp.clone());
        return resp;
      }).catch(async () => await caches.match(req) || new Response("Página indisponível sem conexão. Verifique a rede e tente novamente.", {status:503,headers:{"Content-Type":"text/plain; charset=utf-8"}}))
    );
    return;
  }

  event.respondWith(
    fetch(req).then(resp => {
      bdrSalvarRespostaCompletaNoCache(BDR_CACHE_VERSION, req, resp.clone());
      return resp;
    }).catch(async () => await caches.match(req))
  );
});


/* ---------------------------------------------------------
   PUSH EXTERNO — NOTIFICAÇÕES PRIVADAS
   O servidor autoriza os destinatários; o SW não recebe chaves,
   credenciais nem dados de outras obras.
   Mesmo com o app bloqueado, a notificação abre o login do Atlas.
--------------------------------------------------------- */
const BDR_PUSH_MODULOS=new Set([
  "dashboard","patrimonio","expedicao","manutencao","estoque",
  "usuarios","relatorios","entrada","triagem","movimentacoes",
  "empresa","scanner"
]);

function bdrDestinoPush(link){
  let modulo="dashboard";
  try{
    const u=new URL(String(link||""),self.registration.scope);
    if(u.origin===self.location.origin){
      const nome=u.pathname.split("/").pop().toLowerCase().replace(/\.html$/i,"");
      if(nome==="atlas"){
        const parametros=new URLSearchParams(u.hash.replace(/^#/,""));
        const m=String(parametros.get("m")||"").toLowerCase();
        if(BDR_PUSH_MODULOS.has(m))modulo=m;
      }else if(BDR_PUSH_MODULOS.has(nome)) modulo=nome;
    }
  }catch(_){}
  return new URL("./atlas.html#m="+encodeURIComponent(modulo),self.registration.scope).href;
}

self.addEventListener("push",event=>{
  event.waitUntil((async()=>{
    let dados={};
    try{
      dados=event.data?.json()||{};
    }catch(_){
      // Um payload malformado não pode impedir a notificação.
    }
    if(!dados || typeof dados!=="object") dados={};
    const dadosMensagem=(dados.data && typeof dados.data==="object")?dados.data:dados;
    const notificacao=(dados.notification && typeof dados.notification==="object")?dados.notification:{};
    const id=String(dadosMensagem.notificacao_id||dadosMensagem.id||"").replace(/[^0-9]/g,"").slice(0,30);
    const destino=bdrDestinoPush(dadosMensagem.link||notificacao.link||"dashboard.html");
    const tag=id?"atlas-"+id:"atlas-aviso";
    await self.registration.showNotification("BDR Gestão",{
      body:"Você tem uma nova notificação. Abra o Atlas para conferir.",
      icon:new URL("./icons/icon-192.png",self.registration.scope).href,
      badge:new URL("./icons/icon-192.png",self.registration.scope).href,
      tag,
      renotify:false,
      data:{url:destino},
    });
    // Não exibe contador nem ponto no ícone do PWA.
    await bdrLimparBadgeExterno();
  })());
});

self.addEventListener("notificationclick",event=>{
  event.notification.close();
  event.waitUntil((async()=>{
    const destino=bdrDestinoPush(event.notification?.data?.url||"dashboard.html");
    const janelas=await self.clients.matchAll({type:"window",includeUncontrolled:true});
    for(const janela of janelas){
      try{
        if(new URL(janela.url).origin!==self.location.origin)continue;
        if(typeof janela.navigate==="function"){
          await janela.navigate(destino);
        }
        if(typeof janela.focus==="function") return await janela.focus();
      }catch(_){}
    }
    if(self.clients.openWindow) return await self.clients.openWindow(destino);
  })());
});

self.addEventListener("message", event => {
  if(event.data?.type === "SKIP_WAITING") event.waitUntil(self.skipWaiting());
  if(event.data?.type === "BDR_GET_VERSION" && event.ports?.[0]) event.ports[0].postMessage({version:BDR_CACHE_VERSION});
});
