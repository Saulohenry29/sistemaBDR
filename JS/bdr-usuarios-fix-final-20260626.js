/* =========================================================
   BDR USUÁRIOS FIX FINAL 2026-06-26
   Evita salvar permissão sem usuário selecionado e organiza botões.
========================================================= */
(function(){
  "use strict";

  function temUsuarioSelecionado(){
    const nome = document.getElementById("usuarioSelecionadoNome");
    if(!nome) return false;
    const txt = (nome.innerText || "").toLowerCase();
    return !!txt && !txt.includes("nenhum usuário selecionado");
  }

  function atualizarEstadoBotoes(){
    const tem = temUsuarioSelecionado();
    const card = document.getElementById("usuarioSelecionadoCard");
    if(card){
      card.classList.toggle("sem-usuario", !tem);
      card.classList.toggle("com-usuario", tem);
    }

    document.querySelectorAll(".bdr-precisa-usuario").forEach(btn => {
      btn.disabled = !tem;
      btn.classList.toggle("bdr-disabled", !tem);
      btn.title = tem ? (btn.getAttribute("data-title-ok") || btn.title || "") : "Selecione um usuário primeiro";
    });
  }

  function marcarBotoesCriticos(){
    const textos = [
      "Limpar seleção",
      "Liberar tudo",
      "Só CD",
      "Só própria obra",
      "Salvar alterações",
      "Bloquear externo",
      "Salvar obras"
    ];

    document.querySelectorAll("button").forEach(btn => {
      const t = (btn.innerText || "").replace(/\s+/g," ").trim();
      if(textos.some(x => t.includes(x))){
        btn.classList.add("bdr-precisa-usuario");
        if(!btn.getAttribute("data-title-ok")) btn.setAttribute("data-title-ok", btn.title || t);
      }
    });
  }

  function avisoSemUsuario(){
    if(!temUsuarioSelecionado()){
      alert("Selecione um usuário na lista antes de salvar ou aplicar permissões.");
      return true;
    }
    return false;
  }

  function protegerFuncao(nome){
    const original = window[nome];
    if(typeof original !== "function" || original.__bdrProtegida) return;

    const protegida = function(){
      if(avisoSemUsuario()) return;
      return original.apply(this, arguments);
    };
    protegida.__bdrProtegida = true;
    window[nome] = protegida;
  }

  function instalarProtecoes(){
    marcarBotoesCriticos();
    [
      "salvarAlteracoesUsuarioSelecionado",
      "salvarPermissoesUsuarioSelecionado",
      "limparSelecaoPermissao",
      "liberarTudo",
      "aplicarSomenteCD",
      "aplicarPropriaObra",
      "bloquearExterno",
      "salvarLiberacoesObras"
    ].forEach(protegerFuncao);

    const originalSelecionar = window.selecionarUsuario;
    if(typeof originalSelecionar === "function" && !originalSelecionar.__bdrEstado){
      const nova = function(){
        const r = originalSelecionar.apply(this, arguments);
        setTimeout(atualizarEstadoBotoes, 30);
        setTimeout(atualizarEstadoBotoes, 250);
        return r;
      };
      nova.__bdrEstado = true;
      window.selecionarUsuario = nova;
    }

    atualizarEstadoBotoes();
  }

  document.addEventListener("click", function(e){
    const btn = e.target.closest(".bdr-precisa-usuario");
    if(btn && !temUsuarioSelecionado()){
      e.preventDefault();
      e.stopPropagation();
      alert("Selecione um usuário na lista antes de usar esse botão.");
    }
  }, true);

  document.addEventListener("change", function(e){
    if(e.target && (e.target.classList.contains("perm") || e.target.classList.contains("obra-check"))){
      if(!temUsuarioSelecionado()){
        e.preventDefault();
        e.target.checked = false;
        alert("Primeiro selecione um usuário na lista. Depois marque as permissões.");
      }
    }
  }, true);

  document.addEventListener("DOMContentLoaded", instalarProtecoes);
  setTimeout(instalarProtecoes, 300);
  setTimeout(instalarProtecoes, 1000);
  setTimeout(instalarProtecoes, 2000);

  const obs = new MutationObserver(() => {
    marcarBotoesCriticos();
    atualizarEstadoBotoes();
  });

  document.addEventListener("DOMContentLoaded", () => {
    obs.observe(document.body, {childList:true, subtree:true, characterData:true});
  });
})();
