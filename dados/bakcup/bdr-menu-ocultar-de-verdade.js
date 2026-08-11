/* =========================================================
   ATLAS / BDR
   COMPATIBILIDADE DO MENU LEGADO

   IMPORTANTE:
   - A regra oficial de menu e acesso está em JS/bdrMenuPermissoes.js.
   - Este arquivo permanece com o mesmo nome somente porque páginas
     antigas ainda o carregam.
   - Não possui uma segunda regra de permissão.
========================================================= */
(function(){
  "use strict";

  function aplicar(){
    const gestor = window.BDRMenuPermissoes;

    if(!gestor) return;

    gestor.prepararBotoes?.();
    gestor.aplicarMenu?.();

    /*
      Se a URL atual não for permitida, mantém a sessão e envia
      para o primeiro módulo realmente liberado.
    */
    gestor.redirecionarSeBloqueado?.();
  }

  window.bdrAplicarMenuPadraoUnico = aplicar;
  window.bdrAplicarMenuOcultoVerdade = aplicar;
  window.bdrMenuHardFixAplicar = aplicar;
  window.aplicarMenuPorPermissaoBDR = aplicar;

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", aplicar);
  }else{
    aplicar();
  }

  console.log("✅ BDR MENU COMPATIBILIDADE carregado - regra única em bdrMenuPermissoes.js");
})();
