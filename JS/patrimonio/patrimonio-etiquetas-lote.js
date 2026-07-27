(function(global){
"use strict";

/* =========================================================
   ATLAS PATRIMÔNIO — IMPRESSÃO DE ETIQUETAS EM LOTE V1
   - Não abre nova aba.
   - Carrega etiqueta-lote.html dentro de um modal.
   - Inicia a impressão automaticamente.
   - Fecha o modal quando a impressão é encerrada.
========================================================= */

let tokenAtual = 0;
let timerSeguranca = null;
let impressaoIniciada = false;

const el = id => document.getElementById(id);

function definirStatus(texto){
  const status = el("atlasEtiquetasLoteStatus");
  if(status) status.textContent = texto;
}

function mostrarCarregamento(visivel){
  const carregando = el("atlasEtiquetasLoteCarregando");
  if(carregando) carregando.hidden = !visivel;
}

function limparFrame(){
  const frame = el("atlasEtiquetasLoteFrame");
  if(!frame) return;
  frame.onload = null;
  frame.onerror = null;
  frame.src = "about:blank";
}

function finalizar(){
  definirStatus("Impressão finalizada.");
  setTimeout(() => {
    fechar();
    if(typeof global.bdrCancelarSelecaoEtiquetas === "function"){
      global.bdrCancelarSelecaoEtiquetas();
    }
  }, 450);
}

function conectarEventosImpressao(frame, token){
  try{
    const janela = frame.contentWindow;
    if(!janela) return;

    janela.addEventListener("beforeprint", () => {
      if(token !== tokenAtual) return;
      impressaoIniciada = true;
      definirStatus("Janela de impressão aberta.");
    }, {once:true});

    janela.addEventListener("afterprint", () => {
      if(token !== tokenAtual) return;
      finalizar();
    }, {once:true});
  }catch(erro){
    console.warn("Atlas: não foi possível conectar o encerramento da impressão.", erro);
  }
}

function abrir(codigos){
  const lista = Array.isArray(codigos)
    ? [...new Set(codigos.map(v => String(v || "").trim()).filter(Boolean))]
    : [];

  if(!lista.length) return;

  const modal = el("atlasEtiquetasLoteModal");
  const frame = el("atlasEtiquetasLoteFrame");
  const resumo = el("atlasEtiquetasLoteResumo");

  if(!modal || !frame){
    alert("A área de impressão em lote não foi carregada corretamente.");
    return;
  }

  tokenAtual += 1;
  const token = tokenAtual;
  impressaoIniciada = false;
  clearTimeout(timerSeguranca);

  if(resumo){
    resumo.textContent = `${lista.length} etiqueta(s) selecionada(s)`;
  }

  definirStatus("Preparando etiquetas...");
  mostrarCarregamento(true);
  modal.classList.add("ativo");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("atlas-modal-aberto");

  frame.onload = () => {
    if(token !== tokenAtual) return;
    if(frame.src === "about:blank") return;

    mostrarCarregamento(false);
    definirStatus("Abrindo configuração da impressora...");
    conectarEventosImpressao(frame, token);

    /*
     * A página recebe auto=1 e realiza a própria preparação.
     * O pequeno fallback abaixo ajuda versões antigas de etiqueta-lote.html
     * que apenas montam a prévia, mas não chamam print automaticamente.
     */
    setTimeout(() => {
      if(token !== tokenAtual || impressaoIniciada) return;
      try{
        frame.contentWindow?.focus();
        frame.contentWindow?.print();
      }catch(erro){
        console.warn("Atlas: impressão automática indisponível.", erro);
        definirStatus("Etiquetas prontas. Use a impressão do navegador.");
      }
    }, 1400);
  };

  frame.onerror = () => {
    if(token !== tokenAtual) return;
    mostrarCarregamento(false);
    definirStatus("Não foi possível preparar as etiquetas.");
  };

  const url =
    "etiqueta-lote.html?modal=1&auto=1&codigos=" +
    encodeURIComponent(lista.join(",")) +
    "&t=" + Date.now();

  frame.src = url;

  // Segurança: se o navegador não disparar afterprint, não fecha durante o diálogo.
  // Apenas atualiza o texto para permitir fechamento manual.
  timerSeguranca = setTimeout(() => {
    if(token !== tokenAtual) return;
    definirStatus("Impressão preparada. O modal fechará após concluir ou cancelar.");
  }, 8000);
}

function fechar(){
  tokenAtual += 1;
  clearTimeout(timerSeguranca);
  impressaoIniciada = false;

  const modal = el("atlasEtiquetasLoteModal");
  modal?.classList.remove("ativo");
  modal?.setAttribute("aria-hidden", "true");
  document.body.classList.remove("atlas-modal-aberto");

  mostrarCarregamento(true);
  definirStatus("Carregando...");
  limparFrame();
}

document.addEventListener("keydown", event => {
  if(event.key === "Escape" && el("atlasEtiquetasLoteModal")?.classList.contains("ativo")){
    fechar();
  }
});

global.AtlasEtiquetasLote = {
  abrir,
  fechar
};

})(window);
