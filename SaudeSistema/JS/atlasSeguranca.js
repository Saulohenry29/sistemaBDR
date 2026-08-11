/* =========================================================
   ATLAS SEGURANÇA — SAÚDE DO SISTEMA
   Arquivo: SaudeSistema/JS/atlasSeguranca.js

   REGRA ATUAL:
   - somente usuario_sistema.id = 1 acessa o módulo;
   - o módulo não depende de perfil MASTER/OWNER;
   - a validação ocorre antes da tela ser liberada.

   IMPORTANTE:
   Esta validação protege a interface dentro do modelo atual do Atlas,
   que usa sessão própria no localStorage. A autenticação server-side
   será endurecida em uma etapa futura sem mudar o endereço do módulo.
========================================================= */
(function(){
  "use strict";

  if(window.AtlasSegurancaSaude?.__loaded) return;

  const OWNER_ID = 1;

  function usuarioAtual(){
    try{
      return JSON.parse(
        localStorage.getItem("usuario_logado") ||
        localStorage.getItem("usuarioLogado") ||
        "null"
      );
    }catch(_){
      return null;
    }
  }

  function caminhoRaiz(arquivo){
    return `../${String(arquivo || "").replace(/^\/+/, "")}`;
  }

  function ehDesenvolvedor(usuario = usuarioAtual()){
    return Number(usuario?.id) === OWNER_ID;
  }

  function redirecionarSemAcesso(){
    const usuario = usuarioAtual();

    if(!usuario){
      location.replace(caminhoRaiz("login.html"));
      return false;
    }

    if(!ehDesenvolvedor(usuario)){
      location.replace(caminhoRaiz("dashboard.html"));
      return false;
    }

    return true;
  }

  function liberarTela(){
    document.documentElement.classList.remove("atlas-saude-acesso-pendente");
  }

  function exigirAcesso(){
    if(!redirecionarSemAcesso()) return false;
    liberarTela();
    return true;
  }

  function ir(arquivo){
    location.href = caminhoRaiz(arquivo);
  }

  function logout(){
    localStorage.removeItem("usuario_logado");
    localStorage.removeItem("usuarioLogado");
    localStorage.removeItem("perfil_usuario");
    location.href = caminhoRaiz("login.html");
  }

  window.AtlasSegurancaSaude = {
    __loaded:true,
    OWNER_ID,
    usuarioAtual,
    ehDesenvolvedor,
    exigirAcesso,
    caminhoRaiz,
    ir,
    logout
  };

  // Compatibilidade com os botões do menu/topbar padrão do Atlas.
  window.ir = ir;
  window.logout = logout;

  exigirAcesso();
})();
