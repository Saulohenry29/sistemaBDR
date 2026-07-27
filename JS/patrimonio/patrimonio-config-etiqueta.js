/* ATLAS Patrimônio — acesso ao editor oficial de etiquetas */
function aplicarPermissaoConfigurarEtiquetas(){
  const botao=document.getElementById("btnConfigurarEtiquetas");
  if(!botao)return;
  const autorizado=Boolean(window.AtlasOwnerMode?.ativo());
  botao.hidden=!autorizado;
  botao.style.display=autorizado?"inline-flex":"none";
}
window.addEventListener("DOMContentLoaded", aplicarPermissaoConfigurarEtiquetas);
window.addEventListener("load", aplicarPermissaoConfigurarEtiquetas);
window.addEventListener("atlas:owner-mode-changed", aplicarPermissaoConfigurarEtiquetas);


function abrirModalConfiguracaoEtiqueta(){
  if(!window.AtlasOwnerMode?.ativo()){
    window.AtlasOwnerMode?.mensagem("amarelo","Área protegida","Ative o modo OWNER para editar etiquetas.");
    return;
  }
  const modal = document.getElementById('atlasConfigEtiquetaModal');
  const frame = document.getElementById('atlasConfigEtiquetaFrame');
  if(!modal || !frame) return;

  if(!frame.src){
    frame.src = frame.dataset.src;
  }else{
    frame.contentWindow?.location.reload();
  }

  modal.classList.add('ativo');
  modal.setAttribute('aria-hidden','false');
  document.body.style.overflow = 'hidden';
}

function fecharModalConfiguracaoEtiqueta(){
  const modal = document.getElementById('atlasConfigEtiquetaModal');
  if(!modal) return;
  modal.classList.remove('ativo');
  modal.setAttribute('aria-hidden','true');
  document.body.style.overflow = '';
}

window.addEventListener('message', event => {
  if(event.data?.tipo === 'atlas:fechar-config-etiqueta' || event.data?.tipo === 'ATLAS_FECHAR_ETIQUETA_CONFIG'){
    fecharModalConfiguracaoEtiqueta();
  }

  if(event.data?.tipo === 'atlas:etiqueta-config-salva'){
    document.querySelectorAll('.bdr-etiqueta-frame').forEach(frame => {
      try{
        frame.contentWindow?.AtlasEtiquetaConfig?.aplicar(event.data.config);
      }catch(error){}
    });
  }
});

window.addEventListener('keydown', event => {
  if(event.key === 'Escape'){
    fecharModalConfiguracaoEtiqueta();
  }
});

document.getElementById('atlasConfigEtiquetaModal')?.addEventListener('click', event => {
  if(event.target.id === 'atlasConfigEtiquetaModal'){
    fecharModalConfiguracaoEtiqueta();
  }
});
