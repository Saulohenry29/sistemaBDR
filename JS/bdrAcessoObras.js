/* =========================================================
   BDR ACESSO OBRAS - SAFE STUB
========================================================= */
(function(){
  "use strict";

  if(window.BDRAcessoObras) return;

  function usuarioAtual(){
    try{
      return JSON.parse(localStorage.getItem("usuario_logado") || localStorage.getItem("usuarioLogado") || "{}");
    }catch(e){
      return {};
    }
  }

  function permissoesUsuario(usuario = usuarioAtual()){
    if(Array.isArray(usuario?.permissoes)){
      return usuario.permissoes.map(p => String(p).trim().toUpperCase()).filter(Boolean);
    }

    return String(usuario?.permissoes || "")
      .split(",")
      .map(p => p.trim().toUpperCase())
      .filter(Boolean);
  }

  function isOwner(usuario = usuarioAtual()){
    return Number(usuario?.id) === 1 || permissoesUsuario(usuario).includes("OWNER");
  }

  function podeVerTodasObras(usuario = usuarioAtual()){
    const ps = permissoesUsuario(usuario);
    return isOwner(usuario) ||
      ps.includes("TODAS_OBRAS_VER") ||
      ps.includes("VER_TODAS_OBRAS");
  }

  function obrasPermitidas(usuario = usuarioAtual()){
    if(podeVerTodasObras(usuario)) return "TODAS";

    const ids = [];

    if(usuario?.obra_id) ids.push(String(usuario.obra_id));

    String(usuario?.obras_liberadas || "")
      .split(",")
      .map(x => x.trim())
      .filter(Boolean)
      .forEach(id => ids.push(String(id)));

    return [...new Set(ids)];
  }

  window.BDRAcessoObras = {
    usuarioAtual,
    permissoesUsuario,
    isOwner,
    podeVerTodasObras,
    obrasPermitidas
  };

  window.bdrUsuarioOwner = isOwner;
  window.bdrPodeVerTodasObras = podeVerTodasObras;
  window.bdrObrasPermitidas = obrasPermitidas;

  console.log("✅ BDR Acesso Obras carregado - safe stub");
})();
