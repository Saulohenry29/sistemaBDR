/*
  ATLAS Patrimônio — aplicação de permissões.
  Executa após a tela e após os dados de sessão estarem disponíveis.
*/
function atlasAplicarPermissoesPatrimonio(){
  if(typeof aplicarPermissoesTela === "function"){
    aplicarPermissoesTela();
  }
}
window.addEventListener("DOMContentLoaded", atlasAplicarPermissoesPatrimonio);
window.addEventListener("load", atlasAplicarPermissoesPatrimonio);
