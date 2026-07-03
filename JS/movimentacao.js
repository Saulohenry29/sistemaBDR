/* =========================================================
   BDR ERP - MOVIMENTAÇÃO SIMPLES DE PATRIMÔNIO
   Arquivo: JS/movimentacao.js
   V10.3 - offline first compatível com bdrSyncEngine.js
========================================================= */

function bdrMovUsuarioAtual(){
  try{
    return JSON.parse(localStorage.getItem("usuario_logado") || localStorage.getItem("usuarioLogado") || "null");
  }catch(e){ return null; }
}

async function bdrMovOnlineReal(){
  if(navigator.onLine === false) return false;

  if(typeof window.bdrOnline === "function"){
    try{ if(window.bdrOnline() === false) return false; }catch(e){}
  }

  if(typeof window.bdrOnlineReal === "function"){
    try{ return await window.bdrOnlineReal(); }catch(e){ return false; }
  }

  return navigator.onLine !== false;
}

async function moverPatrimonio(id, novoStatus, novaLocal){
  const usuario = bdrMovUsuarioAtual();
  const online = await bdrMovOnlineReal();

  if(!online){
    if(window.BDRSync && typeof window.BDRSync.atualizar === "function"){
      await window.BDRSync.atualizar("patrimonio", { codigo_qr:id }, {
        status: novoStatus,
        localizacao: novaLocal,
        updated_at: new Date().toISOString()
      }, {
        origem:"movimentacao.js",
        acao:"MOVER_PATRIMONIO",
        responsavel:usuario?.nome || "SISTEMA"
      });
    }else if(typeof salvarOffline === "function"){
      await salvarOffline("mover_patrimonio", "patrimonio", {
        codigo_qr:id,
        novoStatus,
        novaLocal,
        empresa_id:null,
        responsavel:usuario?.nome || "SISTEMA",
        observacao:"movimentação registrada offline",
        criado_offline_em:new Date().toISOString()
      });
    }else{
      throw new Error("Nenhum mecanismo offline carregado: bdrSyncEngine.js/offlineQueue.js.");
    }

    alert("📦 Sem internet. Movimentação salva no aparelho e será sincronizada quando a internet voltar.");
    return;
  }

  const { data: atual, error } = await client
    .from("patrimonio")
    .select("*")
    .eq("codigo_qr", id)
    .single();

  if(error || !atual){
    alert("Patrimônio não encontrado");
    return;
  }

  await client.from("movimentacoes").insert([{
    patrimonio_id: atual.id,
    status_anterior: atual.status,
    status_novo: novoStatus,
    local_anterior: atual.localizacao,
    local_novo: novaLocal,
    responsavel: usuario?.nome || "SISTEMA"
  }]);

  await client
    .from("patrimonio")
    .update({
      status: novoStatus,
      localizacao: novaLocal,
      updated_at:new Date().toISOString()
    })
    .eq("codigo_qr", id);

  alert("Movimentação registrada com sucesso!");
}

document.addEventListener("keydown", function(e){
  if(e.key === "Escape"){
    document.querySelectorAll(".modal-bg.ativo, .modal.ativo").forEach(m=>{
      m.classList.remove("ativo");
    });

    const modalDetalhe = document.getElementById("modalDetalhe");
    if(modalDetalhe) modalDetalhe.classList.remove("ativo");

    const dropdown = document.getElementById("dropdownUser");
    if(dropdown) dropdown.classList.remove("ativo");

    const notif = document.getElementById("notifDropdown");
    if(notif) notif.classList.remove("ativo");
  }
});

console.log("✅ movimentacao.js V10.3 carregado - offline first");
