/* =========================================================
   ATLAS ETIQUETA INDIVIDUAL RÁPIDA V1
   Arquivo: JS/patrimonio/patrimonio-etiqueta-individual.js

   Objetivo:
   - manter o iframe vivo depois da primeira abertura;
   - enviar os dados já carregados do patrimônio;
   - não consultar patrimônio novamente no Supabase;
   - mostrar a prévia somente quando configuração + QR estiverem prontos;
   - preservar ENTER para imprimir e ESC para fechar.
========================================================= */
(function(global){
  "use strict";

  if(global.AtlasEtiquetaIndividualRapida?.__loaded) return;

  let bridgePronta = false;
  let etiquetaPronta = false;
  let carregandoFrame = false;
  let tokenAtual = 0;
  let timerFalha = null;
  let dadosPendentes = null;

  const FRAME_URL =
    "etiqueta-impressao.html?embed=1&preview=1&fast=1&b1=20261116-b1-referencia-git07";

  function patrimonioAtual(){
    try{
      if(typeof patrimonioSelecionado !== "undefined"){
        return patrimonioSelecionado || null;
      }
    }catch(e){}

    return global.patrimonioSelecionado || null;
  }

  function codigoAtual(){
    const p = patrimonioAtual() || {};

    return String(
      p.codigo_qr ||
      p.codigo_antigo ||
      p.codigo_bem ||
      ""
    ).trim();
  }

  function informarImpressao(texto, erro=false){
    const status=document.getElementById("statusEtiquetaOficial");
    if(status){
      status.textContent=texto;
      status.classList.toggle("pronto",!erro);
      status.setAttribute("role","status");
      status.setAttribute("aria-live","polite");
    }
  }

  function definirEstado(pronta, texto){
    const modal = document.getElementById("modalEtiquetaBg");
    const botao = document.getElementById(
      "btnImprimirEtiquetaOficial"
    );
    const status = document.getElementById(
      "statusEtiquetaOficial"
    );

    etiquetaPronta = !!pronta;

    if(modal){
      modal.classList.toggle(
        "atlas-etiqueta-carregando",
        !pronta
      );

      modal.classList.toggle(
        "atlas-etiqueta-pronta",
        pronta
      );
    }

    if(botao){
      botao.disabled = !pronta;
      botao.textContent = pronta
        ? "🖨 Imprimir etiqueta"
        : "⏳ Preparando etiqueta...";
    }

    if(status){
      status.textContent =
        texto ||
        (pronta
          ? "Prévia pronta para impressão."
          : "Preparando configuração e QR Code...");

      status.classList.toggle("pronto", pronta);
    }
  }

  function dadosDaEtiqueta(token){
    const p = patrimonioAtual() || {};
    const codigo = codigoAtual();

    return {
      token,
      codigo,
      codigo_qr:codigo,
      item:p.nome_bem || "ITEM",
      nome_bem:p.nome_bem || "ITEM",
      local:
        p.localizacao ||
        p.obra_nome ||
        "SEM OBRA",
      localizacao:
        p.localizacao ||
        p.obra_nome ||
        "SEM OBRA",
      obra_id:p.obra_id || null,
      perfil_id:p.perfil_impressao_id || null,
      // Apenas a NIIMBOT B1 usa a prévia em PNG. Outras impressoras
      // continuam com a visualização e impressão HTML tradicionais.
      impressora_b1:preferenciaB1()
    };
  }

  function enviarDados(){
    if(!bridgePronta || !dadosPendentes) return;

    const frame = document.getElementById("bdrEtiquetaFrame");
    if(!frame?.contentWindow) return;

    frame.contentWindow.postMessage(
      {
        tipo:"ATLAS_ETIQUETA_ATUALIZAR",
        dados:dadosPendentes
      },
      location.origin
    );
  }

  function garantirFrame(){
    const frame = document.getElementById("bdrEtiquetaFrame");
    if(!frame) return false;

    if(bridgePronta){
      enviarDados();
      return true;
    }

    if(carregandoFrame) return true;

    carregandoFrame = true;

    frame.onload = () => {
      /*
       * O documento carregou. A confirmação oficial ainda virá por
       * ATLAS_ETIQUETA_BRIDGE_PRONTA.
       */
    };

    frame.onerror = () => {
      carregandoFrame = false;
      bridgePronta = false;
      definirEstado(false, "Falha ao carregar a prévia.");
    };

    frame.src = FRAME_URL;

    return true;
  }

  function abrir(){
    const codigo = codigoAtual();

    if(!codigo){
      if(typeof global.atlasAvisoEtiqueta === "function"){
        global.atlasAvisoEtiqueta(
          "Esse patrimônio não possui código para imprimir etiqueta."
        );
      }else{
        alert(
          "Esse patrimônio não possui código para imprimir etiqueta."
        );
      }
      return;
    }

    const modal = document.getElementById("modalEtiquetaBg");

    if(!modal){
      alert("A área de impressão não foi carregada.");
      return;
    }

    tokenAtual += 1;
    dadosPendentes = dadosDaEtiqueta(tokenAtual);

    clearTimeout(timerFalha);
    definirEstado(false, "Preparando etiqueta...");
    modal.classList.add("ativo");

    garantirFrame();
    enviarDados();

    timerFalha = setTimeout(() => {
      if(!etiquetaPronta){
        definirEstado(
          false,
          "A prévia está demorando mais que o normal."
        );
      }
    }, 8000);
  }

  function fechar(){
    tokenAtual += 1;
    dadosPendentes = null;
    etiquetaPronta = false;

    clearTimeout(timerFalha);

    document.getElementById("modalEtiquetaBg")
      ?.classList.remove(
        "ativo",
        "atlas-etiqueta-pronta",
        "atlas-etiqueta-carregando"
      );
  }

  let imprimindoB1 = false;
  function preferenciaB1(){
    try {
      const raw = localStorage.getItem("usuario_logado") || localStorage.getItem("usuarioLogado");
      const usuario = JSON.parse(raw || "null");
      return !!usuario?.id && localStorage.getItem(`atlas:impressora:${usuario.id}`) === "niimbot-b1";
    } catch (_) { return false; }
  }
  function obterDriverB1(){
    // Bluefy funcionou em documento principal, não na integração dentro de iframes.
    // O shell Atlas é same-origin e carrega uma instância própria do MESMO driver.
    // Assim o requestDevice(), GATT e toda a impressão pertencem à janela principal,
    // mantendo o clique, o modal e a imagem gerada pelo Patrimônio intactos.
    try {
      const principal = global.top;
      if(principal && principal !== global &&
         principal.location.origin === global.location.origin &&
         principal.document?.getElementById("atlasFrameWrap")) {
        return principal.Niimbot || null;
      }
    } catch(error) {
      console.warn("ATLAS B1: janela principal inacessível", error);
    }
    // Acesso direto a patrimonio.html continua funcionando no notebook/Android.
    return global.Niimbot || null;
  }

  async function imprimirB1(frame){
    if(imprimindoB1) return;
    const api = obterDriverB1();
    if(!api?.isSupported?.()){
      const mensagem = global.top !== global
        ? "Bluetooth da janela principal não disponível. Feche e abra o Atlas atualizado no Bluefy."
        : "Bluetooth indisponível. No iPhone, abra o Atlas pelo Bluefy.";
      informarImpressao(mensagem, true);
      global.atlasAvisoEtiqueta?.(mensagem);
      return;
    }

    // Mesmo fluxo direto da demonstração validada fisicamente no Bluefy:
    // um clique chama printImage(), sem connect() separado e sem esperas extras.
    // Quando embutido no shell, a chamada usa o BLE do documento principal.
    imprimindoB1 = true;
    const botao = document.getElementById("btnImprimirEtiquetaOficial");
    if(botao) botao.disabled = true;
    try{
      const imagem = frame.contentWindow.AtlasEtiquetaImagemB1.obterImagem();
      if(typeof imagem !== "string" || !imagem.startsWith("data:image/png")){
        throw new Error("A imagem PNG da prévia ainda não está pronta.");
      }

      // Mesma seleção e parâmetros da B1 no registry.json do projeto de
      // referência (exceto offset_y_px, já incorporado na arte do Atlas).
      const model = {
        name_prefixes:["B1"], task:"b1", density:3,
        label_type:1, speed:1
      };
      const size = { w_px:384, h_px:240, dpi:203 };
      informarImpressao("Selecione a NIIMBOT B1 na janela Bluetooth...");
      await api.printImage(imagem, {
        model, size, density:3, copies:1,
        onProgress:(etapa)=>{
          const s = String(etapa||"");
          const traducao = {
            "connecting…":"Selecione a NIIMBOT B1 na janela Bluetooth...",
            "configuring…":"B1 conectada. Configurando impressão...",
            "sending image…":"Enviando a imagem para a B1...",
            "printing…":"Aguardando a confirmação da impressão...",
            "ok":"Impressão confirmada pela B1."
          };
          informarImpressao(traducao[s] || (s.startsWith("printing… ")
            ? "Imprimindo: "+s.slice("printing… ".length)
            : s));
        }
      });
      global.atlasAvisoEtiqueta?.("Etiqueta enviada à NIIMBOT B1. Confira a impressão.");
      fechar();
    }catch(error){
      console.error("ATLAS B1: impressão não confirmada", error);
      const motivo = String(error?.message||error||"Falha desconhecida");
      informarImpressao("B1 não confirmou: "+motivo+" Confira a impressora antes de repetir.", true);
      global.atlasAvisoEtiqueta?.("NIIMBOT: "+motivo);
    }finally{
      imprimindoB1 = false;
      if(botao) botao.disabled = !etiquetaPronta;
    }
  }

  function imprimir(){
    if(!etiquetaPronta){
      if(typeof global.atlasAvisoEtiqueta === "function"){
        global.atlasAvisoEtiqueta(
          "A etiqueta ainda está sendo preparada."
        );
      }
      return;
    }

    const frame = document.getElementById("bdrEtiquetaFrame");

    if(!frame?.contentWindow){
      alert("A prévia da etiqueta não está disponível.");
      return;
    }

    if(preferenciaB1()){
      imprimirB1(frame);
      return;
    }
    try{
      frame.contentWindow.focus();
      frame.contentWindow.postMessage(
        {tipo:"ATLAS_ETIQUETA_IMPRIMIR"},
        location.origin
      );

      setTimeout(fechar, 700);
    }catch(error){
      console.error(
        "ATLAS: falha ao imprimir etiqueta individual.",
        error
      );
      definirEstado(false, "Falha ao abrir a impressão.");
    }
  }

  global.addEventListener("message", event => {
    if(event.origin !== location.origin) return;

    const mensagem = event.data || {};

    if(mensagem.tipo === "ATLAS_ETIQUETA_BRIDGE_PRONTA"){
      bridgePronta = true;
      carregandoFrame = false;
      enviarDados();
      return;
    }

    if(mensagem.tipo === "ATLAS_ETIQUETA_PRONTA"){
      // Uma notificação tardia da prévia não pode ocultar o andamento da
      // conexão Bluetooth ou reabilitar o botão enquanto a B1 imprime.
      if(imprimindoB1) return;
      const tokenRecebido = Number(mensagem.token || 0);

      if(
        tokenRecebido &&
        tokenRecebido !== Number(tokenAtual)
      ){
        return;
      }

      clearTimeout(timerFalha);
      definirEstado(
        true,
        "Prévia pronta. Confira e clique em imprimir."
      );
      return;
    }

    if(mensagem.tipo === "ATLAS_ETIQUETA_ERRO"){
      definirEstado(
        false,
        "Erro na prévia: " + String(mensagem.erro||"Não foi possível preparar a etiqueta.")
      );
    }
  });

  /*
   * Substitui apenas as funções públicas da etiqueta individual.
   * Todo o restante do patrimônio permanece intacto.
   */
  global.abrirModalEtiquetaBDR = abrir;
  global.fecharModalEtiqueta = fechar;
  global.imprimirEtiquetaModalBDR = imprimir;

  document.addEventListener("keydown", event => {
    const modal = document.getElementById("modalEtiquetaBg");
    if(!modal?.classList.contains("ativo")) return;

    if(event.key === "Escape"){
      event.preventDefault();
      event.stopImmediatePropagation();
      fechar();
      return;
    }

    if(event.key === "Enter"){
      event.preventDefault();
      event.stopImmediatePropagation();

      if(etiquetaPronta){
        imprimir();
      }
    }
  }, true);

  global.AtlasEtiquetaIndividualRapida = {
    __loaded:true,
    versao:"1.0",
    abrir,
    fechar,
    imprimir,
    reiniciarFrame(){
      const frame = document.getElementById("bdrEtiquetaFrame");

      bridgePronta = false;
      carregandoFrame = false;

      if(frame){
        frame.removeAttribute("src");
      }
    }
  };

  void 0;
})(window);
