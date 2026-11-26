(function(global){
  "use strict";
  const FILES_BASE="https://arquivos.sathtech.com.br";
  const NOTIFICACOES_EDITAVEIS=[
    ["NOTIF_PATRIMONIO_CRIACAO","Patrimônio criado","Criação de patrimônio."],["NOTIF_PATRIMONIO_ETIQUETA","Impressão de etiqueta","Impressão de etiquetas."],["NOTIF_PATRIMONIO_MOVIMENTACAO","Movimentação de patrimônio","Transferências e movimentações."],["NOTIF_PATRIMONIO_STATUS","Status do patrimônio","Mudanças de status."],["NOTIF_ESTOQUE_MOVIMENTACAO","Movimentações de estoque","Entradas e saídas."],["NOTIF_ESTOQUE_BAIXO","Estoque baixo","Item em nível baixo."],["NOTIF_INVENTARIO_ANDAMENTO","Andamento do inventário","Andamento e divergências."],["NOTIF_INVENTARIO_FINALIZADO","Inventário finalizado","Conclusão de inventário."]
  ];
  const MODOS=["NOTIF_MODO_SOM","NOTIF_MODO_VISUAL","NOTIF_MODO_SILENCIOSO"];
  let usuario=null,permissoesOriginais=new Set(),obras=[],alterado=false;
  let avatarEdicao=null;
  const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)], db=()=>global.supabaseClient||global.client||null;
  function usuarioLocal(){try{const raw=localStorage.getItem("usuario_logado")||localStorage.getItem("usuarioLogado");return raw?JSON.parse(raw):null}catch(_){return null}}
  function setUsuarioLocal(d){localStorage.setItem("usuario_logado",JSON.stringify(d));localStorage.setItem("usuarioLogado",JSON.stringify(d));localStorage.setItem("perfil_usuario",d?.perfil||"");try{parent.dispatchEvent(new CustomEvent("atlas:usuario-atualizado"))}catch(_){}}
  function listaPermissoes(v){return String(v||"").split(",").map(x=>x.trim().toUpperCase()).filter(Boolean)}
  function iniciais(n){return String(n||"U").trim().split(/\s+/).slice(0,2).map(x=>x[0]||"").join("").toUpperCase()}
  function esc(v){return String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;")}
  function avatarUrl(path){const p=String(path||"").trim();if(!p)return"";return /^https?:\/\//i.test(p)?p:`${FILES_BASE}/files/${p.replace(/^\/+/,"")}`}
  function obraIds(u){const ids=[],p=Number(u?.obra_id);if(Number.isFinite(p)&&p>0)ids.push(p);let a=u?.obras_liberadas;if(typeof a==="string")a=a.split(/[,;|]/);if(!Array.isArray(a))a=a?[a]:[];a.map(x=>Number(String(x??"").trim())).filter(x=>Number.isFinite(x)&&x>0).forEach(x=>ids.push(x));return[...new Set(ids)]}
  function nomeObra(id){const o=obras.find(x=>String(x.id)===String(id));return o?`${o.codigo_obra||""}${o.codigo_obra?" - ":""}${o.nome||"Obra"}`:`Obra ${id}`}
  function mensagem(t,erro=false){const el=$("#accountMessage");if(!el)return;el.textContent=t;el.classList.toggle("error",erro);el.hidden=false;clearTimeout(mensagem.timer);mensagem.timer=setTimeout(()=>el.hidden=true,3200)}
  async function carregarUsuarioAtual(){const local=usuarioLocal();if(!local?.id){parent.location.replace("../login.html");return false}usuario=local;if(db()&&navigator.onLine){const {data,error}=await db().from("usuarios_sistema").select("id,nome,usuario,email,perfil,perfil_rapido,empresa_id,obra_id,obras_liberadas,permissoes,ativo,ultimo_acesso,foto_url").eq("id",local.id).maybeSingle();if(!error&&data){usuario={...local,...data};setUsuarioLocal(usuario)}}permissoesOriginais=new Set(listaPermissoes(usuario.permissoes));return true}
  async function carregarObras(){if(!db()||!navigator.onLine)return;const {data,error}=await db().from("obras").select("id,codigo_obra,nome").order("codigo_obra",{ascending:true});if(!error)obras=data||[]}
  function renderAvatar(){const box=$("#accountAvatar"),url=avatarUrl(usuario?.foto_url);box.innerHTML="";if(url){const img=document.createElement("img");img.src=url;img.alt="Foto do perfil";img.referrerPolicy="no-referrer";img.onerror=()=>{box.innerHTML=`<span>${esc(iniciais(usuario?.nome))}</span>`};box.appendChild(img)}else box.innerHTML=`<span>${esc(iniciais(usuario?.nome))}</span>`}
  function renderDados(){const nome=usuario?.nome||usuario?.usuario||"Usuário";$("#accountName").textContent=nome;$("#accountLogin").textContent=usuario?.usuario?`@${usuario.usuario}`:"Conta Atlas";$("#accountStatus").textContent=usuario?.ativo===false?"INATIVO":"ATIVO";$("#profileEmail").textContent=usuario?.email||"-";$("#profileRole").textContent=usuario?.perfil||"-";$("#fieldNome").textContent=nome;$("#fieldUsuario").textContent=usuario?.usuario||"-";$("#fieldEmail").textContent=usuario?.email||"-";$("#fieldPerfil").textContent=usuario?.perfil||"-";$("#fieldObra").textContent=usuario?.obra_id?nomeObra(usuario.obra_id):"Nenhuma obra principal";renderAvatar()}
  function renderNotificacoes(){const box=$("#notifOptions");box.innerHTML=NOTIFICACOES_EDITAVEIS.map(([p,t,d])=>`<label class="notif-option"><span><strong>${esc(t)}</strong><small>${esc(d)}</small></span><input type="checkbox" data-notif="${p}" ${permissoesOriginais.has(p)?"checked":""}></label>`).join("");const modo=MODOS.find(x=>permissoesOriginais.has(x))||"NOTIF_MODO_SOM";const r=$(`input[name="notifMode"][value="${modo}"]`);if(r)r.checked=true;$$('[data-notif],input[name="notifMode"]').forEach(el=>el.addEventListener("change",()=>{alterado=true;$("#saveInfo").textContent="Alterações ainda não salvas."}))}

  // Impressora preferida: escolha local por usuário, sem mudanças no banco.
  // O botão principal usa o driver já carregado pelo shell Atlas.
  // O botão alternativo preserva a conexão direta de teste anterior.
  let impressoraBLE=null;
  let conectandoImpressora=false;
  let conexaoAtlasConfirmada=false;
  let tokenAlternativa=0;

  const B1_SERVICO="e7810a71-73ae-499d-8c15-faa9aef0c3f2";
  const B1_CARACTERISTICA="bef8d6c9-9c21-4c9e-b632-bd58c1009f9f";
  const B1_MODELO={name_prefixes:["B1"],task:"b1",density:3,label_type:1,speed:1};

  function chaveImpressora(){return "atlas:impressora:"+String(usuario?.id||"")}
  function impressoraSelecionada(){return $('input[name="accountPrinter"]:checked')?.value||"sistema"}
  function obterDriverB1(){
    try{
      const principal=global.top;
      if(principal&&principal!==global&&
         principal.location.origin===global.location.origin&&
         principal.document?.getElementById("atlasFrameWrap")){
        return principal.Niimbot||null;
      }
    }catch(e){console.warn("Atlas Minha Conta: shell Bluetooth inacessível",e)}
    return global.Niimbot||null;
  }
  function guardarPreferenciaB1(){
    if(!usuario?.id)return;
    try{
      localStorage.setItem(chaveImpressora(),"niimbot-b1");
      const info=$("#printerSaveInfo");
      if(info)info.textContent="NIIMBOT B1 salva como preferência neste aparelho.";
    }catch(e){console.warn("Atlas Minha Conta: preferência não pôde ser gravada",e)}
  }
  function renderImpressora(){
    if(!usuario?.id)return;
    let valor="sistema";
    try{if(localStorage.getItem(chaveImpressora())==="niimbot-b1")valor="niimbot-b1"}catch(_){}
    const radio=$('input[name="accountPrinter"][value="'+valor+'"]');
    if(radio)radio.checked=true;
    atualizarDetalhesImpressora();
  }
  function atualizarEstadoBLE(){
    const status=$("#printerStatus"),info=$("#printerConnectionInfo");
    const principal=$("#btnConnectPrinter"),alternativo=$("#btnConnectPrinterAlternative");
    const desligar=$("#btnDisconnectPrinter");
    if(!status||!info||!principal||!alternativo||!desligar)return;
    const b1=impressoraSelecionada()==="niimbot-b1";
    const alternativaAtiva=Boolean(impressoraBLE?.gatt?.connected);
    const reconhecidaNoDriver=Boolean(obterDriverB1()?.printer);
    const sessaoAtlas=conexaoAtlasConfirmada;
    const algum=alternativaAtiva||sessaoAtlas;
    status.className="printer-status"+(algum&&b1?" connected":"");
    if(!b1){
      status.textContent="Impressão padrão";
    }else if(sessaoAtlas){
      status.textContent="B1 conectada pelo Atlas";
    }else if(alternativaAtiva){
      status.textContent="Bluetooth alternativo ativo";
    }else if(reconhecidaNoDriver){
      status.textContent="B1 reconhecida pelo Atlas";
    }else{
      status.textContent="Bluetooth desconectado";
    }
    info.textContent=sessaoAtlas
      ?"A conexão foi iniciada pelo Atlas. Patrimônio pode reutilizá-la enquanto o Bluetooth permanecer ativo."
      :alternativaAtiva
        ?"Modo alternativo: conexão de teste. Ao sair de Minha Conta, ela será liberada para não bloquear Patrimônio."
        :reconhecidaNoDriver
          ?"A impressora já foi reconhecida pelo Atlas nesta sessão. Conecte novamente se o Bluetooth tiver caído."
          :"Escolha um dos métodos de conexão. No iPhone, use o navegador Bluefy.";
    principal.hidden=false;
    alternativo.hidden=false;
    principal.disabled=conectandoImpressora||alternativaAtiva;
    alternativo.disabled=conectandoImpressora||sessaoAtlas;
    desligar.hidden=!algum&&!reconhecidaNoDriver;
    desligar.disabled=conectandoImpressora;
  }
  function atualizarDetalhesImpressora(){
    const details=$("#accountPrinterDetails");
    if(details)details.hidden=impressoraSelecionada()!=="niimbot-b1";
    atualizarEstadoBLE();
  }
  // Opção principal: o mesmo objeto NIIMBOT que imprime etiquetas no Patrimônio.
  // O connect() é chamado imediatamente no clique, preservando a ativação BLE.
  async function conectarImpressora(){
    if(conectandoImpressora)return;
    if(impressoraBLE?.gatt?.connected){
      mensagem("Desconecte o modo alternativo antes de conectar pelo Atlas.",true);
      return;
    }
    const api=obterDriverB1();
    if(!api?.isSupported?.()){
      mensagem("Bluetooth do Atlas indisponível. Abra o Atlas pelo Bluefy no iPhone ou tente a conexão alternativa.",true);
      return;
    }
    conectandoImpressora=true;
    atualizarEstadoBLE();
    try{
      await api.connect(B1_MODELO);
      conexaoAtlasConfirmada=true;
      guardarPreferenciaB1();
      mensagem("B1 conectada pelo Atlas. Você já pode imprimir no Patrimônio.");
    }catch(e){
      conexaoAtlasConfirmada=false;
      mensagem(e?.name==="NotFoundError"||e?.name==="NotAllowedError"
        ?"Seleção Bluetooth cancelada ou não permitida. Tente novamente ou utilize o modo alternativo."
        :"Falha na conexão pelo Atlas: "+String(e?.message||e)+". Você pode tentar o modo alternativo.",true);
    }finally{
      conectandoImpressora=false;
      atualizarEstadoBLE();
    }
  }
  // Plano B: preserva a conexão Web Bluetooth direta anterior, independente
  // do driver de impressão. É um teste; o Atlas usa sua própria sessão para imprimir.
  async function conectarImpressoraAlternativa(){
    if(conectandoImpressora)return;
    if(conexaoAtlasConfirmada){
      mensagem("A B1 já foi conectada pelo Atlas. Desconecte antes de testar o modo alternativo.",true);
      return;
    }
    if(!navigator.bluetooth?.requestDevice){
      mensagem("Bluetooth Web indisponível. No iPhone, abra o Atlas pelo Bluefy.",true);
      return;
    }
    if(impressoraBLE?.gatt?.connected){atualizarEstadoBLE();return}
    conectandoImpressora=true;
    const tentativa=++tokenAlternativa;
    atualizarEstadoBLE();
    let device=null;
    try{
      device=await navigator.bluetooth.requestDevice({
        filters:[{namePrefix:"B1"},{namePrefix:"NIIMBOT"}],
        optionalServices:[B1_SERVICO]
      });
      if(tentativa!==tokenAlternativa)return;
      const servidor=await device.gatt.connect();
      const servico=await servidor.getPrimaryService(B1_SERVICO);
      await servico.getCharacteristic(B1_CARACTERISTICA);
      if(tentativa!==tokenAlternativa)return;
      if(impressoraBLE&&impressoraBLE!==device){
        impressoraBLE.removeEventListener("gattserverdisconnected",atualizarEstadoBLE);
      }
      impressoraBLE=device;
      impressoraBLE.addEventListener("gattserverdisconnected",atualizarEstadoBLE);
      guardarPreferenciaB1();
      mensagem("Conexão alternativa validada. Para imprimir, use a conexão do Atlas no Patrimônio.");
    }catch(e){
      if(tentativa===tokenAlternativa){
        mensagem(e?.name==="NotFoundError"
          ?"Seleção cancelada. Você pode tentar novamente."
          :"Falha na conexão alternativa: "+String(e?.message||e),true);
      }
    }finally{
      if(device!==impressoraBLE&&device?.gatt?.connected){
        try{device.gatt.disconnect()}catch(_){}
      }
      if(tentativa===tokenAlternativa)conectandoImpressora=false;
      atualizarEstadoBLE();
    }
  }
  function liberarConexaoAlternativa(){
    tokenAlternativa++;
    if(impressoraBLE){
      try{impressoraBLE.removeEventListener("gattserverdisconnected",atualizarEstadoBLE)}catch(_){}
      try{if(impressoraBLE.gatt?.connected)impressoraBLE.gatt.disconnect()}catch(_){}
      impressoraBLE=null;
    }
    conectandoImpressora=false;
    atualizarEstadoBLE();
  }
  function desconectarImpressora(){
    if(conectandoImpressora)return;
    liberarConexaoAlternativa();
    const api=obterDriverB1();
    if(api?.disconnect){
      try{Promise.resolve(api.disconnect()).catch(e=>console.warn("Atlas Minha Conta: desconexão BLE",e))}
      catch(e){console.warn("Atlas Minha Conta: desconexão BLE",e)}
    }
    conexaoAtlasConfirmada=false;
    atualizarEstadoBLE();
    mensagem("Bluetooth desconectado. A preferência da impressora permanece salva.");
  }
  function salvarImpressora(){
    if(!usuario?.id)return mensagem("Entre na sua conta para salvar a impressora.",true);
    const valor=impressoraSelecionada();
    if(!["sistema","niimbot-b1"].includes(valor))return mensagem("Impressora inválida.",true);
    try{
      localStorage.setItem(chaveImpressora(),valor);
      $("#printerSaveInfo").textContent="Preferência salva neste dispositivo.";
      mensagem("Preferência de impressora salva neste dispositivo.");
    }catch(_){mensagem("Não foi possível salvar a preferência neste navegador.",true)}
  }
  function renderObras(filtro=""){const ids=obraIds(usuario),box=$("#accountWorks");$("#worksCount").textContent=`${ids.length} ${ids.length===1?"acesso":"acessos"}`;const q=String(filtro).trim().toLowerCase(),vis=ids.filter(id=>nomeObra(id).toLowerCase().includes(q));box.innerHTML=vis.length?vis.map(id=>`<span class="work-chip"><i class="fa-solid fa-building"></i>${esc(nomeObra(id))}</span>`).join(""):`<div class="empty">${ids.length?"Nenhum acesso encontrado.":"Nenhuma obra/setor liberado."}</div>`}
  function fecharEditorAvatar(){
    const modal=$("#avatarEditor");
    if(modal){modal.hidden=true;modal.setAttribute("aria-hidden","true")}
    if(avatarEdicao?.url)URL.revokeObjectURL(avatarEdicao.url);
    avatarEdicao=null;
    const input=$("#avatarInput");if(input)input.value="";
  }
  function atualizarCropAvatar(){
    if(!avatarEdicao)return;
    const img=$("#avatarCropImage"),crop=$("#avatarCrop");
    if(!img||!crop)return;
    const cw=crop.clientWidth,ch=crop.clientHeight;
    const base=Math.max(cw/avatarEdicao.largura,ch/avatarEdicao.altura);
    const escala=base*avatarEdicao.zoom;
    avatarEdicao.escala=escala;
    img.style.width=`${avatarEdicao.largura*escala}px`;
    img.style.height=`${avatarEdicao.altura*escala}px`;
    img.style.transform=`translate3d(${avatarEdicao.x}px,${avatarEdicao.y}px,0)`;
  }
  function limitarCropAvatar(){
    if(!avatarEdicao)return;
    const crop=$("#avatarCrop");if(!crop)return;
    const w=avatarEdicao.largura*avatarEdicao.escala,h=avatarEdicao.altura*avatarEdicao.escala;
    const limiteX=Math.max(0,(w-crop.clientWidth)/2),limiteY=Math.max(0,(h-crop.clientHeight)/2);
    avatarEdicao.x=Math.max(-limiteX,Math.min(limiteX,avatarEdicao.x));
    avatarEdicao.y=Math.max(-limiteY,Math.min(limiteY,avatarEdicao.y));
  }
  async function abrirEditorAvatar(arquivo){
    if(!arquivo)return;
    if(!["image/jpeg","image/png","image/webp"].includes(arquivo.type)){mensagem("Use uma imagem JPG, PNG ou WebP.",true);return}
    if(arquivo.size>5*1024*1024){mensagem("A imagem deve ter no máximo 5 MB.",true);return}
    const url=URL.createObjectURL(arquivo),img=$("#avatarCropImage"),modal=$("#avatarEditor"),zoom=$("#avatarZoom");
    try{
      await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=reject;img.src=url});
      avatarEdicao={arquivo,url,largura:img.naturalWidth,altura:img.naturalHeight,x:0,y:0,zoom:1,escala:1,arrastando:false};
      zoom.value="1";modal.hidden=false;modal.setAttribute("aria-hidden","false");
      requestAnimationFrame(()=>{atualizarCropAvatar();limitarCropAvatar();atualizarCropAvatar()});
    }catch(_){URL.revokeObjectURL(url);mensagem("Não foi possível abrir esta imagem.",true)}
  }
  async function gerarAvatarRecortado(){
    if(!avatarEdicao)throw new Error("Selecione uma foto.");
    const crop=$("#avatarCrop"),img=$("#avatarCropImage"),saida=640;
    const canvas=document.createElement("canvas");canvas.width=saida;canvas.height=saida;
    const ctx=canvas.getContext("2d",{alpha:false});ctx.fillStyle="#ffffff";ctx.fillRect(0,0,saida,saida);
    const fator=saida/crop.clientWidth;
    const dw=avatarEdicao.largura*avatarEdicao.escala*fator,dh=avatarEdicao.altura*avatarEdicao.escala*fator;
    const dx=(saida-dw)/2+avatarEdicao.x*fator,dy=(saida-dh)/2+avatarEdicao.y*fator;
    ctx.drawImage(img,dx,dy,dw,dh);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/webp",.9));
    if(!blob)throw new Error("Não foi possível preparar a foto.");
    return new File([blob],"avatar.webp",{type:"image/webp"});
  }
  async function enviarAvatar(arquivo){if(!arquivo)return;const btn=$("#btnSalvarAvatar"),btnTexto=$("#btnAlterarFotoTexto");if(btn)btn.disabled=true;if(btnTexto)btnTexto.disabled=true;try{const {data:{session},error}=await db().auth.getSession();if(error||!session)throw new Error("Sua sessão segura expirou. Entre novamente.");const form=new FormData();form.append("avatar",arquivo);const resp=await fetch(`${FILES_BASE}/api/avatars`,{method:"POST",headers:{Authorization:`Bearer ${session.access_token}`},body:form});const result=await resp.json();if(!resp.ok||!result?.user?.foto_url)throw new Error(result?.error||"Não foi possível atualizar a foto.");usuario={...usuario,foto_url:result.user.foto_url};setUsuarioLocal(usuario);renderAvatar();fecharEditorAvatar();mensagem("Foto do perfil atualizada.")}catch(e){mensagem(e?.message||"Não foi possível atualizar a foto.",true)}finally{if(btn)btn.disabled=false;if(btnTexto)btnTexto.disabled=false}}
  async function salvarPreferencias(){if(!usuario?.id||!db()){mensagem("Não foi possível acessar o banco de dados.",true);return}const btn=$("#btnSalvarPreferencias");btn.disabled=true;try{const editaveis=new Set([...NOTIFICACOES_EDITAVEIS.map(x=>x[0]),...MODOS]),novas=new Set([...permissoesOriginais].filter(x=>!editaveis.has(x)));$$('[data-notif]').forEach(el=>{if(el.checked)novas.add(el.dataset.notif)});const modo=$("input[name='notifMode']:checked")?.value||"NOTIF_MODO_SOM";MODOS.forEach(x=>novas.delete(x));novas.add(modo);novas.add("RECEBER_NOTIFICACOES");const permissoes=[...novas].join(",");const {data,error}=await db().rpc("atualizar_minhas_preferencias",{p_permissoes:permissoes});if(error)throw error;const retorno=Array.isArray(data)?data[0]:data;usuario={...usuario,permissoes:retorno?.permissoes||permissoes};permissoesOriginais=new Set(listaPermissoes(usuario.permissoes));setUsuarioLocal(usuario);alterado=false;$("#saveInfo").textContent="Preferências salvas.";mensagem("Preferências de notificação salvas.")}catch(e){mensagem(e?.message||"Não foi possível salvar as preferências.",true)}finally{btn.disabled=false}}
  function eventos(){
    const abrir=()=>$("#avatarInput")?.click();
    $("#btnAlterarFoto")?.addEventListener("click",abrir);$("#btnAlterarFotoTexto")?.addEventListener("click",abrir);
    $("#avatarInput")?.addEventListener("change",e=>abrirEditorAvatar(e.target.files?.[0]));
    $("#btnFecharAvatar")?.addEventListener("click",fecharEditorAvatar);$("#btnCancelarAvatar")?.addEventListener("click",fecharEditorAvatar);
    $("#avatarEditor")?.addEventListener("click",e=>{if(e.target.id==="avatarEditor")fecharEditorAvatar()});
    $("#avatarZoom")?.addEventListener("input",e=>{if(!avatarEdicao)return;avatarEdicao.zoom=Number(e.target.value)||1;atualizarCropAvatar();limitarCropAvatar();atualizarCropAvatar()});
    const crop=$("#avatarCrop");
    crop?.addEventListener("pointerdown",e=>{if(!avatarEdicao)return;avatarEdicao.arrastando=true;avatarEdicao.px=e.clientX;avatarEdicao.py=e.clientY;crop.setPointerCapture(e.pointerId);crop.classList.add("dragging")});
    crop?.addEventListener("pointermove",e=>{if(!avatarEdicao?.arrastando)return;avatarEdicao.x+=e.clientX-avatarEdicao.px;avatarEdicao.y+=e.clientY-avatarEdicao.py;avatarEdicao.px=e.clientX;avatarEdicao.py=e.clientY;limitarCropAvatar();atualizarCropAvatar()});
    const soltar=e=>{if(!avatarEdicao)return;avatarEdicao.arrastando=false;crop?.classList.remove("dragging");try{if(e?.pointerId!=null&&crop?.hasPointerCapture(e.pointerId))crop.releasePointerCapture(e.pointerId)}catch(_){}};
    crop?.addEventListener("pointerup",soltar);crop?.addEventListener("pointercancel",soltar);
    // Preserva a conexão do Atlas entre módulos; libera apenas o modo alternativo.
    global.addEventListener("atlas:desativar",liberarConexaoAlternativa);
    $("#btnSalvarAvatar")?.addEventListener("click",async()=>{try{await enviarAvatar(await gerarAvatarRecortado())}catch(e){mensagem(e?.message||"Não foi possível preparar a foto.",true)}});
    global.addEventListener("keydown",e=>{if(e.key==="Escape"&&!$("#avatarEditor")?.hidden)fecharEditorAvatar()});
    $("#btnTrocarSenha")?.addEventListener("click",()=>parent.location.href="../alterar-senha.html");$("#btnSalvarPreferencias")?.addEventListener("click",salvarPreferencias);$$(`input[name="accountPrinter"]`).forEach(r=>r.addEventListener("change",()=>{$("#printerSaveInfo").textContent="Preferência ainda não salva.";atualizarDetalhesImpressora()}));$("#btnConnectPrinter")?.addEventListener("click",conectarImpressora);$("#btnConnectPrinterAlternative")?.addEventListener("click",conectarImpressoraAlternativa);$("#btnDisconnectPrinter")?.addEventListener("click",desconectarImpressora);$("#btnSavePrinter")?.addEventListener("click",salvarImpressora);$("#btnToggleWorks")?.addEventListener("click",()=>{const c=$("#worksContent"),b=$("#btnToggleWorks");c.hidden=!c.hidden;b.classList.toggle("open",!c.hidden)});$("#worksSearch")?.addEventListener("input",e=>renderObras(e.target.value));global.addEventListener("beforeunload",e=>{if(alterado){e.preventDefault();e.returnValue=""}})
  }
  async function iniciar(){if(!await carregarUsuarioAtual())return;await carregarObras();renderDados();renderNotificacoes();renderImpressora();renderObras();eventos()}
  global.AtlasMinhaConta={iniciar,salvarPreferencias};if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",iniciar);else iniciar();
})(window);
