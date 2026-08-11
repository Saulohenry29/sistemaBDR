/* =========================================================
   ATLAS / BDR
   CONTROLE DE ACESSO
   Arquivo oficial: JS/atlasControleAcesso.js

   RESPONSABILIDADE
   - Atualizar a sessão do usuário com os dados atuais do Supabase.
   - Aplicar imediatamente permissões/obras atualizadas.
   - Perfil nunca concede acesso; somente permissões explícitas.
   - Somente o usuário ID 1 possui acesso absoluto.
   - Impedir acesso direto a páginas não autorizadas.
   - Manter o usuário logado ao redirecionar para um módulo permitido.

   IMPORTANTE
   - O menu visual continua em JS/bdrMenuPermissoes.js.
   - Nenhuma senha é consultada por este arquivo.
========================================================= */
(function(global){
  "use strict";

  const INTERVALO_SINCRONIA_MS = 30000;
  const INTERVALO_MINIMO_MS = 5000;

  let sincronizando = null;
  let ultimaSincronia = 0;

  function usuarioLocal(){
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

  function salvarUsuarioLocal(usuario){
    if(!usuario) return;
    localStorage.setItem("usuario_logado", JSON.stringify(usuario));
    localStorage.setItem("usuarioLogado", JSON.stringify(usuario));
    localStorage.setItem("perfil_usuario", usuario.perfil || "");
  }

  function limparSessao(){
    localStorage.removeItem("usuario_logado");
    localStorage.removeItem("usuarioLogado");
    localStorage.removeItem("perfil_usuario");
  }

  function cliente(){
    return global.client || global.supabaseClient || null;
  }

  function gestorMenu(){
    return global.BDRMenuPermissoes || null;
  }

  function paginaLogin(){
    return String(location.pathname || "").toLowerCase().endsWith("/login.html");
  }

  function voltarParaLogin(){
    if(paginaLogin()) return;
    location.replace("login.html");
  }

  async function buscarUsuarioAtualNoBanco(local){
    const db = cliente();
    if(!db || !local?.id) return local;

    /*
      Consulta deliberadamente limitada aos campos necessários.
      Nunca usar select("*") em usuarios_sistema porque a tabela possui
      informações de autenticação que não devem ser trazidas para o navegador.
    */
    const campos = [
      "id",
      "nome",
      "usuario",
      "email",
      "perfil",
      "perfil_rapido",
      "empresa_id",
      "obra_id",
      "obras_liberadas",
      "permissoes",
      "ativo",
      "ultimo_login",
      "foto_url",
      "telefone",
      "cargo",
      "trocar_senha",
      "senha_provisoria",
      "observacao_acesso"
    ].join(",");

    const {data, error} = await db
      .from("usuarios_sistema")
      .select(campos)
      .eq("id", local.id)
      .maybeSingle();

    if(error){
      throw error;
    }

    if(!data){
      throw new Error("Usuário atual não encontrado.");
    }

    return {...local, ...data};
  }

  function aplicarAcesso(usuario){
    const menu = gestorMenu();
    if(!menu) return false;

    menu.prepararBotoes?.();
    menu.aplicarMenu?.(usuario);

    if(menu.temAcessoPagina?.(usuario)){
      document.documentElement.style.visibility = "visible";
      return false;
    }

    const destino = menu.primeiraPaginaPermitida?.(usuario) || "login.html";
    const atual = String(location.pathname.split("/").pop() || "").toLowerCase();

    document.documentElement.style.visibility = "hidden";

    if(atual !== String(destino).toLowerCase()){
      location.replace(destino);
      return true;
    }

    return false;
  }

  async function sincronizar({forcar=false}={}){
    const agora = Date.now();

    if(!forcar && agora - ultimaSincronia < INTERVALO_MINIMO_MS){
      return usuarioLocal();
    }

    if(sincronizando) return sincronizando;

    sincronizando = (async()=>{
      const local = usuarioLocal();

      if(!local){
        voltarParaLogin();
        return null;
      }

      try{
        const atualizado = await buscarUsuarioAtualNoBanco(local);

        if(atualizado?.ativo === false){
          limparSessao();
          voltarParaLogin();
          return null;
        }

        salvarUsuarioLocal(atualizado);
        ultimaSincronia = Date.now();
        aplicarAcesso(atualizado);
        return atualizado;
      }catch(error){
        /*
          Falha de rede não derruba a sessão.
          O Atlas continua com a última sessão conhecida e tenta novamente
          quando houver foco/conectividade.
        */
        console.warn("Atlas Controle de Acesso: sessão atual não pôde ser sincronizada; usando cache local.", error);
        ultimaSincronia = Date.now();
        aplicarAcesso(local);
        return local;
      }finally{
        sincronizando = null;
      }
    })();

    return sincronizando;
  }

  async function iniciar(){
    /*
      Evita exibir uma página protegida antes de confirmar as permissões
      atuais do usuário no banco.
    */
    document.documentElement.style.visibility = "hidden";
    await sincronizar({forcar:true});
  }

  function solicitarSincronia(){
    sincronizar().catch(()=>{});
  }

  global.AtlasControleAcesso = {
    iniciar,
    sincronizar,
    aplicarAcesso,
    usuarioLocal
  };

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", iniciar, {once:true});
  }else{
    iniciar();
  }

  global.addEventListener("focus", solicitarSincronia);
  global.addEventListener("online", solicitarSincronia);
  document.addEventListener("visibilitychange", ()=>{
    if(document.visibilityState === "visible") solicitarSincronia();
  });

  setInterval(solicitarSincronia, INTERVALO_SINCRONIA_MS);

  console.log("✅ ATLAS CONTROLE DE ACESSO carregado - sessão e permissões sincronizadas");
})(window);
