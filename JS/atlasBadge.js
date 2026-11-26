/* BDR Gestão — indicador de notificações somente no ícone do PWA.
 * O sistema operacional decide a aparência do badge no ícone instalado.
 * Nunca inclui dados de outras obras nem armazena notificações privadas.
 */
(function(global){
  "use strict";
  if(global.AtlasBadge) return;

  // Mantém a interface pública, mas desativa o contador no ícone instalado.
  function limpar(){
    try{
      if(typeof navigator.clearAppBadge==="function"){
        return Promise.resolve(navigator.clearAppBadge()).catch(()=>{});
      }
    }catch(_){}
  }

  function atualizar(){return limpar();}
  limpar();

  // A shell precisa controlar o Service Worker para receber Push com a página fechada.
  // Não solicita permissão de notificações ao carregar a página.
  if("serviceWorker" in navigator && !global.BDRPwaUpdate){
    global.addEventListener("load",()=>{
      navigator.serviceWorker.register("./service-worker.js").catch(error=>{
        console.warn("BDR: Service Worker indisponível.",error?.message||error);
      });
    },{once:true});
  }

  global.AtlasBadge={atualizar,limpar,versao:"20261125-sem-badge01"};
})(window);
