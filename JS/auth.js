/* =========================================================
   BDR AUTH - TRANSIÇÃO SEGURA PARA SUPABASE AUTH
   - Usuários migrados: senha validada exclusivamente pelo Supabase Auth.
   - Usuários ainda não migrados: login legado temporário até migração.
   - Nunca grava senha no localStorage.
========================================================= */
function getClient(){
  return window.client || window.supabaseClient || null;
}

function bdrEstaOnline(){
  return navigator.onLine === true;
}

function mostrarMensagemAuth(texto, cor="red"){
  const msg = document.getElementById("mensagem");
  if(!msg) return;
  msg.style.color = cor;
  msg.textContent = texto || "";
}

function senhaEhTemporariaBDR(usuario){
  return usuario?.senha_temporaria === true ||
         usuario?.senha_provisoria === true ||
         usuario?.trocar_senha === true ||
         String(usuario?.senha_temporaria).toLowerCase() === "true" ||
         String(usuario?.senha_provisoria).toLowerCase() === "true" ||
         String(usuario?.trocar_senha).toLowerCase() === "true";
}

function destinoPadraoBDR(usuario){
  const perms = String(usuario?.permissoes || "").toUpperCase();
  if(perms.includes("DASHBOARD_VER")) return "atlas.html#m=dashboard";
  if(perms.includes("PATRIMONIO_VER")) return "atlas.html#m=patrimonio";
  if(perms.includes("ESTOQUE_VER")) return "atlas.html#m=estoque";
  if(perms.includes("EXPEDICAO_VER")) return "atlas.html#m=expedicao";
  if(perms.includes("RELATORIOS_VER")) return "atlas.html#m=relatorios";
  return "atlas.html#m=dashboard";
}

async function buscarUsuarioLoginBDR(db, login){
  const campos = "id,nome,usuario,email,senha,perfil,empresa_id,obra_id,ativo,permissoes,obras_liberadas,foto_url,telefone,cargo,senha_provisoria,trocar_senha,senha_temporaria,auth_user_id,auth_status,owner_sistema";

  let resp = await db
    .from("usuarios_sistema")
    .select(campos)
    .eq("usuario", login)
    .limit(1);

  if(resp.error) throw resp.error;
  if(resp.data?.[0]) return resp.data[0];

  resp = await db
    .from("usuarios_sistema")
    .select(campos)
    .eq("email", login)
    .limit(1);

  if(resp.error) throw resp.error;
  return resp.data?.[0] || null;
}

function salvarSessaoAtlas(usuario, login){
  const usuarioSessao = {...usuario};
  delete usuarioSessao.senha;

  localStorage.setItem("usuario_logado", JSON.stringify(usuarioSessao));
  localStorage.setItem("usuarioLogado", JSON.stringify(usuarioSessao));
  localStorage.setItem("perfil_usuario", usuarioSessao.perfil || "");
  localStorage.setItem("bdr_login_cache_em", new Date().toISOString());
  window.AtlasSessao?.registrarLogin();

  if(document.getElementById("lembrar")?.checked){
    localStorage.setItem("bdr_login_lembrado", login);
  }else{
    localStorage.removeItem("bdr_login_lembrado");
  }

  return usuarioSessao;
}

async function fazerLogin(){
  const login = document.getElementById("usuario")?.value.trim();
  const senha = document.getElementById("senha")?.value;

  mostrarMensagemAuth("");

  if(!login || !senha){
    mostrarMensagemAuth("Informe usuário e senha.");
    return;
  }

  if(!bdrEstaOnline()){
    mostrarMensagemAuth("Sem internet. Conecte-se para fazer login.");
    return;
  }

  const db = getClient();
  if(!db){
    mostrarMensagemAuth("Erro: serviço de autenticação indisponível.");
    return;
  }

    try{
    // Encerra a sessão Auth anterior antes de consultar o funcionário.
    // Evita que o RLS de outro usuário oculte o cadastro pesquisado.
    const { error: erroSaida } = await db.auth.signOut({
      scope: "local"
    });

    if(erroSaida){
      mostrarMensagemAuth(
        "Não foi possível encerrar a sessão anterior. Atualize a página e tente novamente."
      );
      return;
    }

    const usuario = await buscarUsuarioLoginBDR(db, login);

    if(!usuario || usuario.ativo === false || String(usuario.ativo).toLowerCase() === "false"){
      mostrarMensagemAuth("Usuário ou senha inválidos.");
      return;
    }

    const migrado = String(usuario.auth_status || "LEGADO").toUpperCase() === "ATIVO" && Boolean(usuario.auth_user_id);

    // null/undefined: contas antigas sem marcador no Supabase Auth.
    // true/false: estado explícito da troca obrigatória no servidor.
    let trocaPendenteAuth = null;

    if(migrado){
      // O login visível pode ser "saulo"; o Auth usa o e-mail vinculado internamente.
      if(!usuario.email){
        mostrarMensagemAuth("Cadastro de autenticação incompleto. Procure o administrador.");
        return;
      }

        const { data: authData, error: authError } = await db.auth.signInWithPassword({
        email: String(usuario.email).trim(),
        password: senha
      });

      if(authError || !authData?.user){
        mostrarMensagemAuth("Usuário ou senha inválidos.");
        return;
      }

      trocaPendenteAuth = authData.user.app_metadata?.atlas_troca_senha_pendente;

      // Segurança crítica: o UUID autenticado deve ser exatamente o vinculado ao cadastro Atlas.
      if(String(authData.user.id).toLowerCase() !== String(usuario.auth_user_id).toLowerCase()){
        await db.auth.signOut({scope:"local"});
        mostrarMensagemAuth("Identidade de autenticação inválida.");
        return;
      }

      // Não exibir o Atlas como conectado se a sessão Auth não foi persistida.
      // O cadastro administrativo depende dessa mesma sessão nas telas internas.
      const {data:sessaoVerificada,error:erroSessao}=await db.auth.getSession();
      const token=sessaoVerificada?.session?.access_token;
      if(erroSessao || !token){
        await db.auth.signOut({scope:"local"});
        mostrarMensagemAuth("Não foi possível manter a sessão segura. Atualize a página e entre novamente.");
        return;
      }
      const {data:contaVerificada,error:erroConta}=await db.auth.getUser(token);
      if(erroConta || String(contaVerificada?.user?.id||"").toLowerCase()!==String(usuario.auth_user_id).toLowerCase()){
        await db.auth.signOut({scope:"local"});
        mostrarMensagemAuth("Sua sessão segura não pôde ser confirmada. Entre novamente.");
        return;
      }
    }else{
      // TRANSIÇÃO: somente usuários ainda não migrados podem usar a senha legada.
      if(String(usuario.senha || "") !== String(senha)){
        mostrarMensagemAuth("Usuário ou senha inválidos.");
        return;
      }
    }

    // Para contas Supabase Auth, o marcador explícito do servidor prevalece
    // sobre indicadores legados de senha (que podem continuar preenchidos).
    // Sem marcador, mantém a regra legada por segurança.
    if(migrado && typeof trocaPendenteAuth === "boolean"){
      usuario.trocar_senha = trocaPendenteAuth;
    }
    const usuarioSessao = salvarSessaoAtlas(usuario, login);

    try{
      await db
        .from("usuarios_sistema")
        .update({ ultimo_login: new Date().toISOString() })
        .eq("id", usuario.id);
    }catch(_e){}

    const migracaoSeguraPendente =
      String(usuarioSessao.auth_status || "").toUpperCase() === "AGUARDANDO_ATIVACAO" &&
      Boolean(usuarioSessao.auth_user_id);

    if(migracaoSeguraPendente){
      window.location.href = "alterar-senha.html";
      return;
    }

    // Após a troca concluída no Supabase Auth, não obrigar nova troca
    // apenas porque campos antigos ainda estão marcados no cadastro.
    // O marcador true continua exigindo troca; sem marcador usamos o legado.
    const exigeTroca = migrado
      ? (trocaPendenteAuth === true ||
         (trocaPendenteAuth !== false && senhaEhTemporariaBDR(usuarioSessao)))
      : senhaEhTemporariaBDR(usuarioSessao);
    if(exigeTroca){
      window.location.href = "alterar-senha.html";
      return;
    }

    window.location.href = destinoPadraoBDR(usuarioSessao);
  }catch(e){
    console.error("Erro login:", e);
    mostrarMensagemAuth("Não foi possível autenticar. Tente novamente.");
  }
}

function verificarLogin(){
  const usuario = localStorage.getItem("usuario_logado") || localStorage.getItem("usuarioLogado");
  if(!usuario){
    window.AtlasSessao?.irLogin();
    return false;
  }
  if(window.top === window) window.AtlasSessao?.iniciar();
  return true;
}

function usuarioLogado(){
  try{
    const usuario = localStorage.getItem("usuario_logado") || localStorage.getItem("usuarioLogado");
    return usuario ? JSON.parse(usuario) : null;
  }catch(_e){
    return null;
  }
}

async function logout(){
  try{
    const db = getClient();
    if(db?.auth) await db.auth.signOut();
  }catch(_e){}

  // Não manter badge privado após saída explícita do usuário.
  try{ window.AtlasBadge?.limpar?.(); }catch(_){ }
  localStorage.removeItem("usuario_logado");
  localStorage.removeItem("usuarioLogado");
  localStorage.removeItem("perfil_usuario");
  localStorage.removeItem("bdr_login_cache_em");
  localStorage.removeItem("atlas_sessao_atividade");
  window.AtlasSessao?.irLogin();
}


/* Sessão central Atlas: inatividade real e identidade Auth, sem pop-ups.
   A janela principal controla o relógio; os módulos em iframe registram
   interações no mesmo relógio. Não alterar o fluxo legado durante a migração. */
(function(){
  'use strict';
  const LIMITE = 2 * 60 * 60 * 1000;
  const CHAVE = 'atlas_sessao_atividade';
  const docs = new WeakSet();
  let iniciado = false, encerrando = false, validacao = null, timer = null;
  let ultimoLogin = null;
  const ler = k => {try{return localStorage.getItem(k);}catch(_){return null;}};
  const sessaoId = () => ler('bdr_login_cache_em') || String(usuarioLogado()?.id || '');
  function atividade(){
    try{const a=JSON.parse(ler(CHAVE)||'null');return a?.login===sessaoId()&&Number.isFinite(a.em)?a.em:null;}catch(_){return null;}
  }
  function salvarAtividade(){
    if(!usuarioLogado()) return;
    try{localStorage.setItem(CHAVE,JSON.stringify({login:sessaoId(),em:Date.now()}));}catch(_){}
  }
  function irLogin(){
    try{window.top.location.replace(new URL('login.html',window.top.location.href).href);}catch(_){window.location.replace('login.html');}
  }
  function expirou(){
    const em=atividade();
    return em!==null && Date.now()-em>=LIMITE;
  }
  async function encerrar(){
    if(window.top!==window){
      try{if(window.top.AtlasSessao)return window.top.AtlasSessao.encerrar();}catch(_){}
    }
    if(encerrando)return;
    encerrando=true;
    clearInterval(timer);
    const login=sessaoId();
    const db=getClient();
    // Remover imediatamente a sessão visual; revogar o refresh token local
    // via SDK quando possível. Não limpar fila offline ou preferências.
    try{window.AtlasBadge?.limpar?.();}catch(_){}
    for(const k of ['usuario_logado','usuarioLogado','perfil_usuario','bdr_login_cache_em',CHAVE]){
      try{localStorage.removeItem(k);}catch(_){}
    }
    try{
      if(db?.auth){
        await Promise.race([db.auth.signOut({scope:'local'}),new Promise(resolve=>setTimeout(resolve,1800))]);
      }
    }catch(_){}
    // Se outro login legítimo já começou em outra aba, não limpar seu token.
    if(!usuarioLogado()&&!ler('bdr_login_cache_em')){
      try{
        const chaveAuth=db?.auth?.storageKey;
        if(typeof chaveAuth==='string'&&/^sb-[a-z0-9]+-auth-token$/.test(chaveAuth))localStorage.removeItem(chaveAuth);
      }catch(_){}
      irLogin();
    }else if(sessaoId()!==login){location.reload();}
  }
  function conferirTempo(){
    if(encerrando)return false;
    if(!usuarioLogado()){irLogin();return false;}
    if(expirou()){void encerrar();return false;}
    return true;
  }
  function anexarDocumento(doc){
    if(!doc||docs.has(doc))return;
    docs.add(doc);
    const interacao=e=>{
      if(!e.isTrusted||doc.hidden||!conferirTempo())return;
      const em=atividade();
      if(em===null||Date.now()-em>=5000)salvarAtividade();
    };
    for(const evento of ['pointerdown','pointermove','keydown','input','wheel','touchstart']){
      doc.addEventListener(evento,interacao,{capture:true,passive:true});
    }
  }
  // getSession já tenta renovar tokens expirados pelo SDK. A renovação
  // explícita é reservada à expiração ou a uma falha de autorização na RPC.
  async function validar({exigirAuth=false,renovar=false}={}){
    if(!conferirTempo())return 'encerrada';
    const u=usuarioLogado();
    const loginAntes=sessaoId();
    const migrado=String(u?.auth_status||'').toUpperCase()==='ATIVO'&&Boolean(u?.auth_user_id);
    if(!migrado&&!exigirAuth)return 'legado';
    if(navigator.onLine===false)return 'offline';
    const db=getClient();
    if(!db?.auth)return 'indisponivel';
    try{
      let {data,error}=await db.auth.getSession();
      if(sessaoId()!==loginAntes)return "indisponivel";
      if(error){
        if(error.status===0||error.status>=500||error.name==='AuthRetryableFetchError'||/fetch|network/i.test(error.message||''))return 'indisponivel';
        if(!migrado)return 'legado';
        await encerrar();return 'encerrada';
      }
      let sessao=data?.session;
      if(sessao&&(renovar||Number(sessao.expires_at||0)*1000<=Date.now())){
        ({data,error}=await db.auth.refreshSession());
        if(sessaoId()!==loginAntes)return "indisponivel";
        if(error){
          if(error.status===0||error.status>=500||error.name==='AuthRetryableFetchError'||/fetch|network/i.test(error.message||''))return 'indisponivel';
          await encerrar();return 'encerrada';
        }
        sessao=data?.session;
      }
      if(!conferirTempo())return 'encerrada';
      if(!sessao?.access_token){
        if(!migrado)return 'legado';
        await encerrar();return 'encerrada';
      }
      if(!u?.auth_user_id||String(sessao.user?.id||'').toLowerCase()!==String(u.auth_user_id).toLowerCase()){
        await encerrar();return 'encerrada';
      }
      return 'valida';
    }catch(_){return 'indisponivel';}
  }
  function verificarSeguro(){
    if(!conferirTempo())return Promise.resolve('encerrada');
    if(!validacao)validacao=validar().finally(()=>{validacao=null;});
    return validacao;
  }
  function iniciar(){
    if(window.top!==window)return Promise.resolve('iframe');
    if(iniciado)return verificarSeguro();
    if(!conferirTempo())return Promise.resolve('encerrada');
    iniciado=true;ultimoLogin=sessaoId();
    if(atividade()===null)salvarAtividade();
    anexarDocumento(document);
    timer=setInterval(()=>{if(conferirTempo()&&!document.hidden)void verificarSeguro();},15000);
    window.addEventListener('focus',()=>void verificarSeguro());
    window.addEventListener('pageshow',()=>void verificarSeguro());
    window.addEventListener('online',()=>void verificarSeguro());
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)void verificarSeguro();});
    window.addEventListener('storage',e=>{
      if(e.key==='bdr_login_cache_em'&&e.newValue&&sessaoId()!==ultimoLogin){location.reload();return;}
      if(e.key==='usuario_logado'||e.key==='usuarioLogado'||e.key===CHAVE||e.key===null)conferirTempo();
    });
    return verificarSeguro();
  }
  window.AtlasSessao={iniciar,anexarDocumento,validar,encerrar,irLogin,conferirTempo,registrarLogin:salvarAtividade};
})();
