/* =========================================================
   ATLAS / BDR - MINHA CONTA
   Responsabilidade:
   - consultar os próprios dados;
   - trocar a própria senha;
   - personalizar SOMENTE notificações;
   - consultar obras liberadas.
========================================================= */
(function(global){
  "use strict";

  const NOTIFICACOES_EDITAVEIS = [
    ["NOTIF_PATRIMONIO_CRIACAO","Patrimônio criado","Aviso quando houver criação de patrimônio."],
    ["NOTIF_PATRIMONIO_ETIQUETA","Impressão de etiqueta","Avisos relacionados à impressão de etiquetas."],
    ["NOTIF_PATRIMONIO_MOVIMENTACAO","Movimentação de patrimônio","Transferências e movimentações de patrimônio."],
    ["NOTIF_PATRIMONIO_STATUS","Status do patrimônio","Inativação, reativação e mudanças de status."],
    ["NOTIF_ESTOQUE_MOVIMENTACAO","Movimentações de estoque","Entradas e saídas de estoque."],
    ["NOTIF_ESTOQUE_BAIXO","Estoque baixo","Aviso quando um item atingir nível baixo."],
    ["NOTIF_INVENTARIO_ANDAMENTO","Andamento do inventário","Andamento e divergências de inventário."],
    ["NOTIF_INVENTARIO_FINALIZADO","Inventário finalizado","Aviso quando um inventário for concluído."]
  ];

  const MODOS = [
    "NOTIF_MODO_SOM",
    "NOTIF_MODO_VISUAL",
    "NOTIF_MODO_SILENCIOSO"
  ];

  let usuario = null;
  let permissoesOriginais = new Set();
  let obras = [];
  let alterado = false;

  const $ = (s,root=document)=>root.querySelector(s);
  const $$ = (s,root=document)=>[...root.querySelectorAll(s)];
  const db = ()=>global.supabaseClient || global.client || null;

  function usuarioLocal(){
    try{
      const raw = localStorage.getItem("usuario_logado") || localStorage.getItem("usuarioLogado");
      return raw ? JSON.parse(raw) : null;
    }catch(_){
      return null;
    }
  }

  function setUsuarioLocal(dados){
    localStorage.setItem("usuario_logado",JSON.stringify(dados));
    localStorage.setItem("usuarioLogado",JSON.stringify(dados));
    localStorage.setItem("perfil_usuario",dados?.perfil || "");
  }

  function listaPermissoes(valor){
    return String(valor || "")
      .split(",")
      .map(x=>x.trim().toUpperCase())
      .filter(Boolean);
  }

  function iniciais(nome){
    return String(nome || "U")
      .trim()
      .split(/\s+/)
      .slice(0,2)
      .map(x=>x[0] || "")
      .join("")
      .toUpperCase();
  }

  function esc(v){
    return String(v ?? "")
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;");
  }

  function obraIds(u){
    const ids = [];
    const principal = Number(u?.obra_id);
    if(Number.isFinite(principal) && principal > 0) ids.push(principal);

    let liberadas = u?.obras_liberadas;
    if(typeof liberadas === "string"){
      liberadas = liberadas.split(/[,;|]/);
    }
    if(!Array.isArray(liberadas)) liberadas = liberadas ? [liberadas] : [];

    liberadas
      .map(x=>Number(String(x ?? "").trim()))
      .filter(x=>Number.isFinite(x) && x > 0)
      .forEach(x=>ids.push(x));

    return [...new Set(ids)];
  }

  function nomeObra(id){
    const o = obras.find(x=>String(x.id)===String(id));
    return o ? `${o.codigo_obra || ""}${o.codigo_obra ? " - " : ""}${o.nome || "Obra"}` : `Obra ${id}`;
  }

  function mensagem(texto,erro=false){
    const antigo = $(".atlas-account-message");
    if(antigo) antigo.remove();

    const el=document.createElement("div");
    el.className="atlas-account-message";
    el.textContent=texto;

    if(erro){
      el.style.background="#fff1f2";
      el.style.color="#b91c1c";
      el.style.borderColor="#fecaca";
    }

    document.body.appendChild(el);
    setTimeout(()=>el.remove(),3200);
  }

  async function carregarUsuarioAtual(){
    const local = usuarioLocal();

    if(!local?.id){
      location.replace("../login.html");
      return false;
    }

    usuario = local;

    if(db() && navigator.onLine){
      const {data,error} = await db()
        .from("usuarios_sistema")
        .select("id,nome,usuario,email,perfil,perfil_rapido,empresa_id,obra_id,obras_liberadas,permissoes,ativo,ultimo_acesso")
        .eq("id",local.id)
        .maybeSingle();

      if(!error && data){
        usuario = {...local,...data};
        setUsuarioLocal(usuario);
      }
    }

    permissoesOriginais = new Set(listaPermissoes(usuario.permissoes));
    return true;
  }

  async function carregarObras(){
    if(!db() || !navigator.onLine) return;

    const {data,error}=await db()
      .from("obras")
      .select("id,codigo_obra,nome")
      .order("codigo_obra",{ascending:true});

    if(!error) obras = data || [];
  }

  function renderDados(){
    const nome = usuario?.nome || usuario?.usuario || "Usuário";
    const inicial = iniciais(nome);

    $("#usuarioNome").textContent=`Olá, ${nome}`;
    $("#usuarioPerfil").textContent=usuario?.perfil || "-";
    $("#accountAvatar").textContent=inicial;
    $("#accountName").textContent=nome;
    $("#accountLogin").textContent=usuario?.email || usuario?.usuario || "-";
    $("#accountStatus").textContent=usuario?.ativo === false ? "INATIVO" : "ATIVO";
    $("#fieldNome").textContent=nome;
    $("#fieldUsuario").textContent=usuario?.usuario || "-";
    $("#fieldEmail").textContent=usuario?.email || "-";
    $("#fieldPerfil").textContent=usuario?.perfil || "-";
    $("#fieldObra").textContent=usuario?.obra_id ? nomeObra(usuario.obra_id) : "Nenhuma obra principal";
  }

  function renderNotificacoes(){
    const box=$("#notifOptions");
    box.innerHTML=NOTIFICACOES_EDITAVEIS.map(([perm,titulo,descricao])=>`
      <label class="atlas-notif-option">
        <span>
          <strong>${esc(titulo)}</strong>
          <small>${esc(descricao)}</small>
        </span>
        <input type="checkbox" data-notif="${perm}" ${permissoesOriginais.has(perm) ? "checked" : ""}>
      </label>
    `).join("");

    const modo = MODOS.find(x=>permissoesOriginais.has(x)) || "NOTIF_MODO_SOM";
    const radio=$(`input[name="notifMode"][value="${modo}"]`);
    if(radio) radio.checked=true;

    $$("[data-notif], input[name='notifMode']").forEach(el=>{
      el.addEventListener("change",()=>{
        alterado=true;
        $("#saveInfo").textContent="Alterações ainda não salvas.";
      });
    });
  }

  function renderObras(){
    const box=$("#accountWorks");
    const ids=obraIds(usuario);

    if(!ids.length){
      box.innerHTML='<div class="atlas-account-empty">Nenhuma obra/setor liberado.</div>';
      return;
    }

    box.innerHTML=ids.map(id=>`<span class="atlas-work-chip"><i class="fa-solid fa-building"></i> ${esc(nomeObra(id))}</span>`).join("");
  }

  async function salvarPreferencias(){
    if(!usuario?.id || !db()){
      mensagem("Não foi possível acessar o banco de dados.",true);
      return;
    }

    const btn=$("#btnSalvarPreferencias");
    btn.disabled=true;

    try{
      /*
        Segurança lógica:
        reconstruímos a lista a partir das permissões atuais e só tocamos
        na lista branca de notificações pessoais + modo de aviso.
      */
      const editaveis = new Set([
        ...NOTIFICACOES_EDITAVEIS.map(x=>x[0]),
        ...MODOS
      ]);

      const novas = new Set(
        [...permissoesOriginais].filter(x=>!editaveis.has(x))
      );

      $$("[data-notif]").forEach(el=>{
        if(el.checked) novas.add(el.dataset.notif);
      });

      const modo=$("input[name='notifMode']:checked")?.value || "NOTIF_MODO_SOM";
      MODOS.forEach(x=>novas.delete(x));
      novas.add(modo);
      novas.add("RECEBER_NOTIFICACOES");

      const payload={
        permissoes:[...novas].join(","),
        updated_at:new Date().toISOString()
      };

      const {data,error}=await db()
        .from("usuarios_sistema")
        .update(payload)
        .eq("id",usuario.id)
        .select("id,permissoes,updated_at")
        .maybeSingle();

      if(error) throw error;

      usuario={...usuario,...payload,...(data || {})};
      permissoesOriginais=new Set(listaPermissoes(usuario.permissoes));
      setUsuarioLocal(usuario);
      alterado=false;
      $("#saveInfo").textContent="Preferências salvas.";
      mensagem("Preferências de notificação salvas.");
    }catch(e){
      console.error("Atlas Minha Conta:",e);
      mensagem(e?.message || "Não foi possível salvar as preferências.",true);
    }finally{
      btn.disabled=false;
    }
  }

  function sair(){
    localStorage.removeItem("usuario_logado");
    localStorage.removeItem("usuarioLogado");
    localStorage.removeItem("perfil_usuario");
    location.replace("../login.html");
  }

  async function iniciar(){
    if(!await carregarUsuarioAtual()) return;
    await carregarObras();

    renderDados();
    renderNotificacoes();
    renderObras();

    $("#btnSalvarPreferencias")?.addEventListener("click",salvarPreferencias);

    global.BDRMenuPermissoes?.prepararBotoes?.();
    global.BDRMenuPermissoes?.aplicarMenu?.(usuario);
  }

  global.AtlasMinhaConta={
    iniciar,
    salvarPreferencias,
    sair
  };

  if(document.readyState==="loading"){
    document.addEventListener("DOMContentLoaded",iniciar);
  }else{
    iniciar();
  }

  console.log("✅ ATLAS MINHA CONTA carregado");
})(window);
