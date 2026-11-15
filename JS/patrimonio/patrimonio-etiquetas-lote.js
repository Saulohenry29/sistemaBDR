(function(global){
"use strict";

/* =========================================================
   ATLAS PATRIMÔNIO — ETIQUETAS EM LOTE
   - Impressora convencional: preserva o diálogo existente do navegador.
   - NIIMBOT B1: um clique inicia a seleção BLE e o lote automaticamente.
   - Indicador compacto de andamento, sem segunda confirmação ou prévia.
   - Não repete lotes não confirmados e não altera dados do banco.
========================================================= */

let tokenAtual = 0;
let timerSeguranca = null;
let impressaoIniciada = false;
let modoB1 = false;
let b1Pronta = false;
let imprimindoB1 = false;
let quantidadeAtual = 0;
let preparacaoB1 = null;

const el = id => document.getElementById(id);

function definirStatus(texto){
  const status = el("atlasEtiquetasLoteStatus");
  if(status) status.textContent = texto;
}

function mostrarCarregamento(visivel){
  const carregando = el("atlasEtiquetasLoteCarregando");
  if(carregando) carregando.hidden = !visivel;
}

function progresso(valor, mostrar=true){
  const barra = el("atlasEtiquetasLoteB1Progresso");
  if(!barra) return;
  barra.hidden = !modoB1 || !mostrar;
  barra.value = Math.max(0, Math.min(100, Number(valor) || 0));
}

function preferenciaB1(){
  try{
    const raw = localStorage.getItem("usuario_logado") || localStorage.getItem("usuarioLogado");
    const usuario = JSON.parse(raw || "null");
    return !!usuario?.id && localStorage.getItem(`atlas:impressora:${usuario.id}`) === "niimbot-b1";
  }catch(_){ return false; }
}

function criarEsperaB1(token){
  let resolver, rejeitar;
  const promessa = new Promise((resolve, reject) => {resolver = resolve; rejeitar = reject;});
  // O seletor Bluetooth pode ficar aberto por vários segundos. O prazo
  // para preparar o lote começa apenas DEPOIS da conexão BLE.
  promessa.catch(() => {});
  preparacaoB1 = {token, promessa, resolver, rejeitar};
  return promessa;
}

async function aguardarPreparacaoB1(promessa){
  let timer;
  try{
    await Promise.race([
      promessa,
      new Promise((_,reject) => {
        timer = setTimeout(() => reject(new Error(
          "Tempo excedido ao preparar o lote. Verifique a conexão e tente novamente."
        )), 35000);
      })
    ]);
  }finally{
    clearTimeout(timer);
  }
}

function limparEsperaB1(motivo){
  if(!preparacaoB1) return;
  preparacaoB1.rejeitar(new Error(motivo || "Preparação encerrada."));
  preparacaoB1 = null;
}

function limparFrame(){
  const frame = el("atlasEtiquetasLoteFrame");
  if(!frame) return;
  frame.onload = null;
  frame.onerror = null;
  frame.src = "about:blank";
}

function finalizar(){
  const token = tokenAtual;
  definirStatus(modoB1
    ? "Lote enviado. Confira as etiquetas na impressora."
    : "Janela de impressão finalizada.");
  setTimeout(() => {
    if(token !== tokenAtual) return;
    fechar();
    if(typeof global.bdrCancelarSelecaoEtiquetas === "function"){
      global.bdrCancelarSelecaoEtiquetas();
    }
  }, modoB1 ? 1500 : 450);
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
    console.warn("Atlas: não foi possível acompanhar a janela de impressão.", erro);
  }
}

function abrir(codigos){
  if(imprimindoB1){
    definirStatus("Aguarde o envio atual antes de iniciar outro lote.");
    return;
  }
  const lista = Array.isArray(codigos)
    ? [...new Set(codigos.map(v => String(v || "").trim()).filter(Boolean))].slice(0,200)
    : [];
  if(!lista.length) return;

  const modal = el("atlasEtiquetasLoteModal");
  const frame = el("atlasEtiquetasLoteFrame");
  const resumo = el("atlasEtiquetasLoteResumo");
  if(!modal || !frame){
    alert("A área de impressão em lote não foi carregada corretamente.");
    return;
  }

  limparEsperaB1("Novo lote iniciado.");
  tokenAtual += 1;
  const token = tokenAtual;
  impressaoIniciada = false;
  modoB1 = preferenciaB1();
  b1Pronta = false;
  quantidadeAtual = lista.length;
  clearTimeout(timerSeguranca);

  if(resumo){
    resumo.textContent = `${lista.length} etiqueta(s) selecionada(s) • ${modoB1 ? "NIIMBOT B1" : "Impressora padrão"}`;
  }
  definirStatus(modoB1 ? "Conectando à NIIMBOT B1..." : "Preparando etiquetas...");
  progresso(0, modoB1);
  mostrarCarregamento(!modoB1);
  modal.classList.toggle("modo-b1", modoB1);
  modal.classList.add("ativo");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("atlas-modal-aberto");

  frame.onload = () => {
    if(token !== tokenAtual) return;
    if(modoB1) return;
    if(frame.contentWindow?.location.href === "about:blank") return;
    mostrarCarregamento(false);
    definirStatus("Abrindo configuração da impressora...");
    conectarEventosImpressao(frame, token);
    // Fluxo convencional intacto, incluindo o fallback para navegadores antigos.
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
    if(modoB1) preparacaoB1?.rejeitar(new Error("Falha ao abrir a página de etiquetas."));
  };

  if(modoB1) criarEsperaB1(token);
  const url = "etiqueta-lote.html?modal=1&codigos=" +
    encodeURIComponent(lista.join(",")) +
    (modoB1 ? "&b1=1&loteToken=" + token : "&auto=1") +
    "&t=" + Date.now();
  frame.src = url;

  if(modoB1){
    // IMPORTANTE: iniciar diretamente no clique em "Imprimir etiquetas".
    // connect() chama requestDevice() antes do primeiro await: preserva
    // a ativação do usuário exigida pelo Web Bluetooth.
    void imprimirB1Automatico(token);
  }else{
    timerSeguranca = setTimeout(() => {
      if(token !== tokenAtual) return;
      definirStatus("Impressão preparada. O modal fechará após concluir ou cancelar.");
    }, 8000);
  }
}

async function imprimirB1Automatico(token){
  if(!modoB1 || imprimindoB1 || token !== tokenAtual) return;
  const api = global.Niimbot;
  if(!api?.isSupported?.()){
    definirStatus("Bluetooth indisponível. Use Chrome ou Edge em HTTPS ou localhost.");
    limparEsperaB1("Bluetooth indisponível.");
    return;
  }

  imprimindoB1 = true;
  const espera = preparacaoB1?.promessa;
  const model = {name_prefixes:["B1","NIIMBOT"], task:"b1", density:3, label_type:1, speed:3};
  const size = {w_px:384, h_px:240, dpi:203};
  let sucesso = false;
  let envioIniciado = false;

  try{
    definirStatus("Selecione a NIIMBOT B1 na janela Bluetooth, se ela aparecer...");
    // PRIMEIRA chamada assíncrona no clique: não aguardar iframe, banco ou imagens antes.
    await api.connect(model);
    if(token !== tokenAtual) return;

    definirStatus("Preparando as imagens das etiquetas...");
    await aguardarPreparacaoB1(espera);
    if(token !== tokenAtual) return;

    const gerador = el("atlasEtiquetasLoteFrame")?.contentWindow?.AtlasEtiquetasLoteB1;
    if(!gerador?.pronta){
      throw new Error("As etiquetas não ficaram prontas para impressão.");
    }

    const imagens = await gerador.gerarImagens((atual,total) => {
      if(token !== tokenAtual) return;
      definirStatus(`Preparando imagem ${atual} de ${total}...`);
      progresso(Math.round(50 * atual / total));
    });
    if(token !== tokenAtual) return;
    if(imagens.length !== quantidadeAtual){
      throw new Error(`Foram preparadas ${imagens.length} de ${quantidadeAtual} etiquetas. Nada foi enviado.`);
    }

    definirStatus(`Enviando ${imagens.length} etiquetas à NIIMBOT B1...`);
    envioIniciado = true;
    await api.printBatch(imagens, {
      model, size,
      onProgress(mensagem){
        if(token !== tokenAtual) return;
        const match = String(mensagem || "").match(/label\s+(\d+)\/(\d+)/i);
        if(match){
          const atual = Number(match[1]);
          const total = Number(match[2]);
          definirStatus(`Enviando etiqueta ${atual} de ${total}. Aguarde...`);
          progresso(50 + Math.round(45 * atual / total));
        }else if(mensagem === "ok"){
          progresso(100);
        }
      }
    });
    sucesso = true;
    progresso(100);
    definirStatus(`Envio de ${quantidadeAtual} etiquetas confirmado. Confira a impressão física.`);
  }catch(erro){
    console.error("ATLAS NIIMBOT B1: lote não confirmado", erro);
    if(token === tokenAtual){
      const mensagem = erro?.name === "NotFoundError" || erro?.name === "NotAllowedError"
        ? "Seleção Bluetooth cancelada ou não permitida. Nenhuma etiqueta foi enviada."
        : envioIniciado
          ? `Lote NÃO confirmado: ${erro?.message || erro}. Confira quantas etiquetas saíram antes de tentar novamente.`
          : `Impressão não iniciada: ${erro?.message || erro} Nenhuma etiqueta foi enviada.`;
      definirStatus(mensagem);
    }
  }finally{
    imprimindoB1 = false;
    limparEsperaB1("Envio encerrado.");
    if(sucesso && token === tokenAtual) finalizar();
  }
}

function fechar(){
  if(imprimindoB1){
    definirStatus("Envio ou conexão em andamento. Aguarde ou cancele a seleção Bluetooth.");
    return;
  }
  tokenAtual += 1;
  clearTimeout(timerSeguranca);
  limparEsperaB1("Lote fechado.");
  impressaoIniciada = false;
  modoB1 = false;
  b1Pronta = false;
  quantidadeAtual = 0;
  const modal = el("atlasEtiquetasLoteModal");
  modal?.classList.remove("ativo", "modo-b1");
  modal?.setAttribute("aria-hidden", "true");
  document.body.classList.remove("atlas-modal-aberto");
  mostrarCarregamento(true);
  definirStatus("Carregando...");
  progresso(0, false);
  limparFrame();
}

global.addEventListener("message", event => {
  if(event.origin !== location.origin || !modoB1) return;
  const frame = el("atlasEtiquetasLoteFrame");
  if(event.source !== frame?.contentWindow) return;
  const mensagem = event.data || {};
  if(String(mensagem.loteToken || "") !== String(tokenAtual)) return;

  if(mensagem.tipo === "ATLAS_ETIQUETAS_LOTE_B1_PRONTAS"){
    mostrarCarregamento(false);
    const ausentes = Array.isArray(mensagem.ausentes) ? mensagem.ausentes : [];
    b1Pronta = !ausentes.length && mensagem.total === quantidadeAtual;
    if(b1Pronta){
      preparacaoB1?.resolver();
    }else{
      preparacaoB1?.rejeitar(new Error(
        `Impressão bloqueada: ${ausentes.length} patrimônio(s) não encontrado(s) ou sem acesso (${ausentes.slice(0,5).join(", ")}).`
      ));
    }
  }else if(mensagem.tipo === "ATLAS_ETIQUETAS_LOTE_B1_ERRO"){
    mostrarCarregamento(false);
    b1Pronta = false;
    preparacaoB1?.rejeitar(new Error(mensagem.erro || "Falha ao preparar o lote."));
  }
});

document.addEventListener("keydown", event => {
  if(event.key === "Escape" && el("atlasEtiquetasLoteModal")?.classList.contains("ativo")){
    fechar();
  }
});

global.AtlasEtiquetasLote = {abrir, fechar};
})(window);
