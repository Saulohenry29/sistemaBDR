/* ATLAS — NIIMBOT B1 — Arte canônica 384x240 (203 dpi).
   A etiqueta oficial é calculada em coordenadas físicas fixas, sem
   getBoundingClientRect, viewport, devicePixelRatio ou zoom do navegador.
   A mesma imagem PNG alimenta a prévia e a impressora. Não afeta Elgin. */
(function(global){
  "use strict";
  const W=384,H=240,MARGIN=4,CSS_POR_MM=96/25.4;
  const CHAVE_INCLINACAO="atlas:niimbot-b1:angulo";
  const CHAVE_DESLOCAMENTO_X="atlas:niimbot-b1:deslocamento-x-mm";
  const LARGURA_ETIQUETA_MM=50;
  const DESLOCAMENTO_X_PADRAO_MM=2;
  let imagemAprovada=null;

  function deslocamentoXmm(){
    try{
      const valor=localStorage.getItem(CHAVE_DESLOCAMENTO_X);
      return valor===null?DESLOCAMENTO_X_PADRAO_MM:
        Number.isFinite(Number(valor))?Math.max(0,Math.min(3,Number(valor))):DESLOCAMENTO_X_PADRAO_MM;
    }catch(_){return DESLOCAMENTO_X_PADRAO_MM;}
  }
  function inclinacaoLocal(){
    try{
      const migracao="atlas:niimbot-b1:rotacao-consolidada";
      if(localStorage.getItem(migracao)!=="1"){
        if(localStorage.getItem(CHAVE_INCLINACAO)==="-0.6")
          localStorage.setItem(CHAVE_INCLINACAO,"0");
        localStorage.setItem(migracao,"1");
      }
      const graus=Number(localStorage.getItem(CHAVE_INCLINACAO)||0);
      return Number.isFinite(graus)?Math.max(-2,Math.min(2,graus)):0;
    }catch(_){return 0;}
  }
  function corrigirInclinacao(original){
    const graus=inclinacaoLocal();
    if(Math.abs(graus)<.001)return original;
    const rad=graus*Math.PI/180;
    const larguraGirada=W*Math.abs(Math.cos(rad))+H*Math.abs(Math.sin(rad));
    const alturaGirada=H*Math.abs(Math.cos(rad))+W*Math.abs(Math.sin(rad));
    const ajuste=Math.min(1,(W-2)/larguraGirada,(H-2)/alturaGirada);
    const canvas=document.createElement("canvas");canvas.width=W;canvas.height=H;
    const ctx=canvas.getContext("2d");
    if(!ctx)throw new Error("Canvas de calibração indisponível.");
    ctx.fillStyle="#fff";ctx.fillRect(0,0,W,H);
    ctx.translate(W/2,H/2);ctx.rotate(rad);ctx.scale(ajuste,ajuste);
    ctx.drawImage(original,-W/2,-H/2);
    return canvas;
  }
  function aguardarImagem(elemento){
    return new Promise((resolve,reject)=>{
      if(elemento.complete&&elemento.naturalWidth>0)return resolve();
      if(elemento.complete&&!elemento.naturalWidth)return reject(new Error("Imagem da engrenagem indisponível."));
      elemento.addEventListener("load",resolve,{once:true});
      elemento.addEventListener("error",()=>reject(new Error("Imagem da engrenagem indisponível.")),{once:true});
    });
  }
  function normalizar(cfg){
    const api=global.AtlasEtiquetaConfig;
    const entrada=cfg||api?.carregar?.()||{};
    return api?.normalizar?api.normalizar(entrada):entrada;
  }
  function mm(v,fallback){
    const n=Number(v);
    return Number.isFinite(n)?n: fallback;
  }
  function nomeFonte(v){
    const nome=String(v||"Arial").replace(/[^\w\s-]/g,"").trim();
    return `"${nome||"Arial"}", Arial, sans-serif`;
  }
  function aplicarFonte(ctx,tamanho,fonte,peso,italico){
    ctx.font=`${italico?"italic ":""}${Number(peso)||700} ${tamanho}px ${nomeFonte(fonte)}`;
    ctx.textBaseline="top";
  }
  function larguraTexto(ctx,texto,espaco=0){
    const letras=Array.from(String(texto));
    return letras.reduce((total,caracter,i)=>total+ctx.measureText(caracter).width+(i?espaco:0),0);
  }
  function restringirTexto(ctx,valor,maximo,espaco=0){
    const texto=String(valor||"");
    if(larguraTexto(ctx,texto,espaco)<=maximo)return texto;
    const ret="…";let inicio=0,fim=Array.from(texto).length;
    const letras=Array.from(texto);
    while(inicio<fim){
      const meio=Math.ceil((inicio+fim)/2);
      if(larguraTexto(ctx,letras.slice(0,meio).join("")+ret,espaco)<=maximo)inicio=meio;
      else fim=meio-1;
    }
    return letras.slice(0,inicio).join("")+ret;
  }
  function desenharTexto(ctx,valor,x,y,largura,opcoes={}){
    const espaco=opcoes.espaco||0;
    const normalizado=opcoes.maiusculo?String(valor).toLocaleUpperCase("pt-BR"):String(valor);
    aplicarFonte(ctx,opcoes.tamanho,opcoes.fonte,opcoes.peso,opcoes.italico);
    // A marca nunca pode se transformar em “B…”/“BD…”: quando um
    // perfil salvo aumenta demais a fonte, reduza a palavra COMPLETA,
    // preservando a proporção. Reticências só para Local e Item.
    const texto=opcoes.marcaInteira?normalizado:restringirTexto(ctx,normalizado,largura,espaco);
    const natural=larguraTexto(ctx,texto,espaco);
    const fator=opcoes.marcaInteira&&natural>largura?Math.max(0.01,largura/natural):1;
    const usado=natural*fator;
    let inicio=x;
    if(opcoes.alinhar==="right"||opcoes.alinhar==="end")inicio+=largura-usado;
    if(opcoes.alinhar==="center")inicio+=(largura-usado)/2;
    ctx.fillStyle=opcoes.cor||"#111";
    ctx.save();
    ctx.translate(inicio,y);
    if(fator<1)ctx.scale(fator,fator);
    let pos=0;
    for(const letra of Array.from(texto)){
      ctx.fillText(letra,pos,0);
      pos+=ctx.measureText(letra).width+espaco;
    }
    ctx.restore();
    return {largura:usado,inicio};
  }
  function borda(ctx,x,y,w,h,stroke,raio){
    const metade=stroke/2;
    x+=metade;y+=metade;w-=stroke;h-=stroke;
    const r=Math.min(Math.max(0,raio-metade),w/2,h/2);
    ctx.strokeStyle="#111";ctx.lineWidth=stroke;
    ctx.beginPath();
    if(typeof ctx.roundRect==="function")ctx.roundRect(x,y,w,h,r);
    else{
      ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);ctx.quadraticCurveTo(x+w,y,x+w,y+r);
      ctx.lineTo(x+w,y+h-r);ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
      ctx.lineTo(x+r,y+h);ctx.quadraticCurveTo(x,y+h,x,y+h-r);
      ctx.lineTo(x,y+r);ctx.quadraticCurveTo(x,y,x+r,y);
    }
    ctx.stroke();
  }
  async function gerar(configuracao){
    const label=document.getElementById("label");
    if(!label||!document.body.classList.contains("ready"))
      throw new Error("Etiqueta ainda não está pronta.");
    const gear=label.querySelector(".gear");
    if(!gear)throw new Error("Engrenagem da etiqueta indisponível.");
    await Promise.all([document.fonts.ready,aguardarImagem(gear)]);
    const cfg=normalizar(configuracao);
    // Geometria de referência: 96 CSS px/polegada. Nem tamanho de tela nem
    // fontes ampliadas pelo iOS podem modificar as coordenadas da arte.
    const baseW=mm(cfg.larguraMm,53)*CSS_POR_MM;
    const baseH=mm(cfg.alturaMm,33)*CSS_POR_MM;
    const scaleOriginal=Math.min((W-2*MARGIN)/baseW,(H-2*MARGIN)/baseH);
    const dxOriginal=(W-baseW*scaleOriginal)/2-1;
    const x=dxOriginal+deslocamentoXmm()*(W/LARGURA_ETIQUETA_MM);
    const scale=Math.min(scaleOriginal,(W-MARGIN-x)/baseW);
    const h=baseH*scale,w=baseW*scale,y=(H-h)/2;
    const pixelMm=CSS_POR_MM*scale;
    const conv=(v,def)=>mm(v,def)*pixelMm;
    const pad=conv(cfg.paddingMm,1.7);
    const innerW=w-2*pad;
    const topoH=conv(cfg.topoAlturaMm,13.5);
    // A faixa superior tem altura física limitada. Perfis antigos que
    // salvaram uma fonte muito grande não podem empurrar a marca para
    // cima de Local/Item/Código (nem encobrir o QR).
    const qrW=Math.min(conv(cfg.qrMm,12.5),topoH*.98);
    const gearW=Math.min(conv(cfg.logoEngrenagemMm,8),topoH*.85);
    const fontBdr=Math.min(conv(cfg.logoBdrMm,10.2),topoH*.82);
    const fontSub=Math.min(conv(cfg.logoSubMm,2.5),topoH*.27);
    const fontLocal=conv(cfg.fonteLocalMm,2.65);
    const fontItem=conv(cfg.fonteItemMm,2.65);
    const fontCodigo=conv(cfg.fonteCodigoMm,4);
    const boxLocal=fontLocal*1.15,boxItem=fontItem*1.15;
    const infoH=boxLocal+boxItem;
    const codigoH=fontCodigo;
    const livre=Math.max(0,h-2*pad-topoH-infoH-codigoH);
    const espacamento=livre/2;
    const topoX=x+pad,topoY=y+pad;
    const infoY=topoY+topoH+espacamento;
    const codigoY=infoY+infoH+espacamento;

    const canvas=document.createElement("canvas");canvas.width=W;canvas.height=H;
    const ctx=canvas.getContext("2d",{alpha:false});
    if(!ctx)throw new Error("Canvas da B1 indisponível.");
    ctx.fillStyle="#fff";ctx.fillRect(0,0,W,H);
    const desloc=(nome,eixo)=>conv(cfg[`mover${nome}${eixo}mm`],0);
    if(cfg.mostrarEngrenagem!==false){
      ctx.drawImage(gear,topoX+desloc("Engrenagem","X"),topoY+desloc("Engrenagem","Y"),gearW,gearW);
    }
    const marcaMax=Math.max(1,innerW-qrW-conv(1.5,1.5));
    // Linha da marca tem altura fixa de 0.85 da fonte original.
    const linhaMarca=Math.max(gearW,fontBdr*.85);
    const bdrX=topoX+(cfg.mostrarEngrenagem!==false?gearW:0)+desloc("Bdr","X");
    const bdrY=topoY+desloc("Bdr","Y");
    let marcaW=cfg.mostrarEngrenagem!==false?gearW:0;
    if(cfg.mostrarBdr!==false){
      const marca=desenharTexto(ctx,"BDR",bdrX,bdrY,Math.max(1,marcaMax-marcaW),{
        fonte:cfg.fonteBdr,peso:cfg.pesoBdr,italico:cfg.italicoBdr,
        tamanho:fontBdr,espaco:conv(cfg.espacoBdrMm,-.65),
        cor:"#4b4b4b",maiusculo:cfg.maiusculoBdr!==false,
        alinhar:cfg.alinharBdr,marcaInteira:true
      });
      marcaW=Math.min(marcaMax,marcaW+marca.largura);
    }
    if(cfg.mostrarSub!==false){
      const subY=topoY+linhaMarca-conv(.7,.7)+desloc("Sub","Y");
      const subW=Math.max(1,marcaW);
      desenharTexto(ctx,"Construart",topoX+desloc("Sub","X"),subY,subW,{
        fonte:cfg.fonteSub,peso:cfg.pesoSub,italico:cfg.italicoSub,
        tamanho:fontSub,espaco:conv(cfg.espacoSubMm,0),
        cor:"#555",maiusculo:cfg.maiusculoSub===true,
        alinhar:cfg.alinharSub||"right",marcaInteira:true
      });
    }
    const conteudoLocal=label.querySelector(".local")?.textContent||"Local: SEM OBRA";
    const conteudoItem=label.querySelector(".item")?.textContent||"Item: ITEM";
    const codigo=label.querySelector(".codigo")?.textContent?.trim();
    if(!codigo)throw new Error("Código do patrimônio ausente.");
    if(cfg.mostrarLocal!==false)
      desenharTexto(ctx,conteudoLocal,topoX+desloc("Local","X"),infoY+(boxLocal-fontLocal)/2+desloc("Local","Y"),innerW,{
        fonte:cfg.fonteLocal,peso:cfg.pesoLocal,italico:cfg.italicoLocal,
        tamanho:fontLocal,espaco:conv(cfg.espacoLocalMm,0),
        cor:"#111",maiusculo:cfg.maiusculoLocal===true,alinhar:cfg.alinharLocal
      });
    if(cfg.mostrarItem!==false)
      desenharTexto(ctx,conteudoItem,topoX+desloc("Item","X"),infoY+boxLocal+(boxItem-fontItem)/2+desloc("Item","Y"),innerW,{
        fonte:cfg.fonteItem,peso:cfg.pesoItem,italico:cfg.italicoItem,
        tamanho:fontItem,espaco:conv(cfg.espacoItemMm,0),
        cor:"#111",maiusculo:cfg.maiusculoItem===true,alinhar:cfg.alinharItem
      });
    if(cfg.mostrarCodigo!==false)
      desenharTexto(ctx,codigo,topoX+desloc("Codigo","X"),codigoY+desloc("Codigo","Y"),innerW,{
        fonte:cfg.fonteCodigo,peso:cfg.pesoCodigo,italico:cfg.italicoCodigo,
        tamanho:fontCodigo,espaco:conv(cfg.espacoCodigoMm,0),
        cor:"#111",maiusculo:cfg.maiusculoCodigo!==false,
        alinhar:cfg.alinharCodigo||"right"
      });
    borda(ctx,x,y,w,h,conv(cfg.bordaMm,.45),conv(cfg.raioMm,1.8));
    if(cfg.mostrarQr!==false){
      if(!global.AtlasQRCode?.desenharEmCanvas)
        throw new Error("Gerador de QR Code indisponível.");
      global.AtlasQRCode.desenharEmCanvas(ctx,codigo,{
        x:x+w-pad-qrW+desloc("Qr","X"),
        y:topoY+desloc("Qr","Y"),
        tamanho:qrW,nivel:"M"
      });
    }
    return corrigirInclinacao(canvas).toDataURL("image/png");
  }
  function invalidarImagem(){imagemAprovada=null;}
  function fixarImagem(png){
    if(typeof png!=="string"||!png.startsWith("data:image/png;base64,"))
      throw new Error("Imagem B1 inválida.");
    imagemAprovada=png;return png;
  }
  function obterImagem(){
    if(!imagemAprovada)
      throw new Error("A prévia B1 ainda não está pronta. Abra novamente a etiqueta.");
    return imagemAprovada;
  }
  global.AtlasEtiquetaImagemB1={gerar,invalidarImagem,fixarImagem,obterImagem};
})(window);
