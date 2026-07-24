/* =========================================================
   ATLAS UI — TOPO COMPACTO AO ROLAR
   Carregue este arquivo nas telas que usam .bdr-topbar.
========================================================= */
(function(){
  "use strict";

  let agendado = false;

  function atualizar(){
    document.body.classList.toggle(
      "atlas-topo-compacto",
      window.scrollY > 55
    );
    agendado = false;
  }

  window.addEventListener("scroll", function(){
    if(agendado) return;
    agendado = true;
    window.requestAnimationFrame(atualizar);
  }, {passive:true});

  atualizar();
})();
