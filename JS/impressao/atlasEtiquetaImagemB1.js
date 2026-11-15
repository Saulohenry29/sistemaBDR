
/* Rasterização direta da etiqueta oficial em Canvas 2D (sem SVG foreignObject).
   Preserva medidas/posições calculadas do DOM; não modifica impressão convencional. */
(function(global){
  "use strict";

  const W=384,H=240,MARGIN=4;
  const CHAVE_INCLINACAO="atlas:niimbot-b1:angulo";
  const CHAVE_DESLOCAMENTO_X="atlas:niimbot-b1:deslocamento-x-mm";
  const DESLOCAMENTO_X_PADRAO_MM=2;
  const LARGURA_ETIQUETA_MM=50; // raster B1 384 px para etiqueta de 50 mm

  // Somente B1, sem persistir no banco. Zero reproduz o posicionamento anterior.
  function deslocamentoXmm(){
    try{
      const salvo=localStorage.getItem(CHAVE_DESLOCAMENTO_X);
      if(salvo===null)return DESLOCAMENTO_X_PADRAO_MM;
      const valor=Number(salvo);
      return Number.isFinite(valor)?Math.max(0,Math.min(3,valor)):DESLOCAMENTO_X_PADRAO_MM;
    }catch(_){return DESLOCAMENTO_X_PADRAO_MM;}
  }

  function inclinacaoLocal(){
    try{
      // Migração única: o teste anterior usava -0.6° para anular
      // uma compensação fixa +0.6° que foi removida desta versão.
      const migracao="atlas:niimbot-b1:rotacao-consolidada";
      if(localStorage.getItem(migracao)!=="1"){
        if(localStorage.getItem(CHAVE_INCLINACAO)==="-0.6")
          localStorage.setItem(CHAVE_INCLINACAO,"0");
        localStorage.setItem(migracao,"1");
      }
      const valor=Number(localStorage.getItem(CHAVE_INCLINACAO)||0);
      return Number.isFinite(valor) ? Math.max(-2,Math.min(2,valor)) : 0;
    }catch(_){return 0;}
  }

  // Rotação opcional e EXCLUSIVA do PNG B1. Não altera DOM, Elgin nem
  // o raster original quando o ângulo está em 0° (padrão).
  function corrigirInclinacao(original){
    const graus=inclinacaoLocal();
    if(Math.abs(graus)<0.001)return original;

    const rad=graus*Math.PI/180;
    const cos=Math.abs(Math.cos(rad)),sen=Math.abs(Math.sin(rad));
    const larguraGirada=W*cos+H*sen;
    const alturaGirada=H*cos+W*sen;
    const encaixe=Math.min(1,(W-2)/larguraGirada,(H-2)/alturaGirada);
    const corrigida=document.createElement("canvas");
    corrigida.width=W;
    corrigida.height=H;
    const contexto=corrigida.getContext("2d");
    if(!contexto)throw new Error("Canvas de calibração B1 indisponível.");
    contexto.fillStyle="#fff";
    contexto.fillRect(0,0,W,H);
    contexto.translate(W/2,H/2);
    contexto.rotate(rad);
    contexto.scale(encaixe,encaixe);
    contexto.drawImage(original,-W/2,-H/2);
    return corrigida;
  }

  function imagem(elemento){
    return new Promise((resolve,reject)=>{
      if(elemento.complete && elemento.naturalWidth>0)return resolve();
      if(elemento.complete && !elemento.naturalWidth)return reject(new Error("Imagem da etiqueta indisponível."));
      elemento.addEventListener("load",resolve,{once:true});
      elemento.addEventListener("error",()=>reject(new Error("Imagem da etiqueta indisponível.")),{once:true});
    });
  }

  function tamanhoTexto(ctx,texto,maxWidth){
    if(ctx.measureText(texto).width<=maxWidth)return texto;

    const reticencias="…";
    let inicio=0,fim=texto.length;

    while(inicio<fim){
      const meio=Math.ceil((inicio+fim)/2);
      if(ctx.measureText(texto.slice(0,meio)+reticencias).width<=maxWidth)inicio=meio;
      else fim=meio-1;
    }

    return texto.slice(0,inicio)+reticencias;
  }

  function fonte(style){
    return `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  }

  function texto(ctx,elemento,base,escala){
    const style=getComputedStyle(elemento);
    const r=elemento.getBoundingClientRect();

    let value=elemento.textContent||"";

    if(style.textTransform==="uppercase")
      value=value.toLocaleUpperCase("pt-BR");

    if(style.textTransform==="lowercase")
      value=value.toLocaleLowerCase("pt-BR");

    ctx.save();
    ctx.fillStyle=style.color;
    ctx.font=fonte(style);
    ctx.textBaseline="top";

    const x=r.left-base.left;
    const y=r.top-base.top;
    const width=r.width;

    if(style.textOverflow==="ellipsis")
      value=tamanhoTexto(ctx,value,width);

    // O Canvas aceita um maxWidth que comprime os glifos horizontalmente.
    // No Android, métricas de fontes diferentes das do Windows podem provocar
    // exatamente esse efeito. Em dispositivos móveis, preferimos truncar o
    // texto ao espaço disponível, sem deformar o desenho da fonte.
    const movel=/Android|iPhone|iPad|iPod/i.test(navigator.userAgent||"");
    if(movel && ctx.measureText(value).width>width){
      value=tamanhoTexto(ctx,value,width);
    }
    const measured=ctx.measureText(value).width;
    const align=style.textAlign;

    let tx=x;

    if(align==="right"||align==="end")
      tx+=width-measured;
    else if(align==="center")
      tx+=(width-measured)/2;

    if("letterSpacing" in ctx)
      ctx.letterSpacing=style.letterSpacing;

    const fs=parseFloat(style.fontSize)||12;

    const ty=y+Math.max(0,(r.height-fs)/2);
    if(movel)ctx.fillText(value,tx,ty);
    else ctx.fillText(value,tx,ty,width); // notebook: mantém saída já validada

    ctx.restore();
  }

  function borda(ctx,width,height,style){
    const after=getComputedStyle(
      document.getElementById("label"),
      "::after"
    );

    const stroke=parseFloat(after.borderTopWidth)||1;
    const radius=parseFloat(style.borderTopLeftRadius)||0;
    const offset=stroke/2;

    ctx.strokeStyle=after.borderTopColor||"#111";
    ctx.lineWidth=stroke;

    ctx.beginPath();
    ctx.roundRect(
      offset,
      offset,
      width-stroke,
      height-stroke,
      Math.max(0,radius-stroke/2)
    );
    ctx.stroke();
  }

  async function gerar(){
    const label=document.getElementById("label");

    if(!label||!document.body.classList.contains("ready"))
      throw new Error("Etiqueta ainda não está pronta.");

    await document.fonts.ready;

    const gear=label.querySelector(".gear");
    const qr=label.querySelector(".qr");

    await Promise.all([
      imagem(gear),
      imagem(qr)
    ]);

    const base=label.getBoundingClientRect();

    if(!base.width||!base.height)
      throw new Error("Etiqueta sem dimensões.");

    const canvas=document.createElement("canvas");
    canvas.width=W;
    canvas.height=H;

    const ctx=canvas.getContext("2d",{
      willReadFrequently:false
    });

    if(!ctx)
      throw new Error("Canvas não disponível.");

    ctx.fillStyle="#fff";
    ctx.fillRect(0,0,W,H);

    // Posição original do PNG, preservada exatamente quando X=0 mm.
    const escalaOriginal=Math.min(
      (W-MARGIN*2)/base.width,
      (H-MARGIN*2)/base.height
    );
    const xOriginal=(W-base.width*escalaOriginal)/2-1;

    // +2 mm à direita por padrão, somente na B1. A posição da borda
    // esquerda avança 2 mm; se necessário, o desenho é reduzido de forma
    // PROPORCIONAL para preservar a borda direita dentro dos 384 pixels.
    // Nunca cortar a borda/QR por deslocar um raster que já ocupava o papel.
    const dx=xOriginal+deslocamentoXmm()*(W/LARGURA_ETIQUETA_MM);
    const scale=Math.min(escalaOriginal,(W-MARGIN-dx)/base.width);
    const dy=(H-base.height*scale)/2;

    ctx.translate(dx,dy);
    ctx.scale(scale,scale);

    ctx.fillStyle="#fff";
    ctx.fillRect(0,0,base.width,base.height);

    for(const element of [gear,qr]){
      const r=element.getBoundingClientRect();

      ctx.drawImage(
        element,
        r.left-base.left,
        r.top-base.top,
        r.width,
        r.height
      );
    }

    for(const selector of [
      ".bdr",
      ".sub",
      ".local",
      ".item",
      ".codigo"
    ]){
      const element=label.querySelector(selector);

      if(element)
        texto(ctx,element,base,scale);
    }

    borda(
      ctx,
      base.width,
      base.height,
      getComputedStyle(label)
    );

    try{
      return corrigirInclinacao(canvas).toDataURL("image/png");
    }catch(e){
      throw new Error(
        "Falha ao exportar etiqueta: "+e.message
      );
    }
  }

  global.AtlasEtiquetaImagemB1={gerar};

})(window);
