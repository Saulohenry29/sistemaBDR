/* BDR Gestão — indicador de notificações no navegador e no PWA.
 * O sistema operacional decide a aparência do badge no ícone instalado.
 * Nunca inclui dados de outras obras nem armazena notificações privadas.
 */
(function(global){
  "use strict";
  if(global.AtlasBadge) return;

  const TITULO_BASE=document.title||"BDR Gestão";
  const ICON_SELECTOR='link[rel~="icon"]';
  const favicon=document.querySelector(ICON_SELECTOR)||document.createElement("link");
  if(!favicon.parentNode){
    favicon.rel="icon";
    document.head.appendChild(favicon);
  }
  const hrefOriginal=favicon.href||new URL("./icons/icon-192.png",location.href).href;
  const imagem=new Image();
  let imagemPronta=false;
  let totalAtual=0;
  let totalAnterior=-1;
  let badgeAtualizado=false;

  function quantidade(total){
    const num=Number(total);
    return Number.isFinite(num)?Math.min(Math.max(0,Math.trunc(num)),9999):0;
  }

  function atualizarBadgeNativo(total){
    try{
      if(total>0 && typeof navigator.setAppBadge==="function"){
        Promise.resolve(navigator.setAppBadge(total)).catch(()=>{});
      }else if(total===0 && typeof navigator.clearAppBadge==="function"){
        Promise.resolve(navigator.clearAppBadge()).catch(()=>{});
      }
    }catch(_){}
  }

  function desenhar(){
    if(!document.head || !favicon) return;
    if(totalAtual===0){
      favicon.href=hrefOriginal;
      return;
    }
    try{
      const tamanho=96;
      const canvas=document.createElement("canvas");
      canvas.width=canvas.height=tamanho;
      const ctx=canvas.getContext("2d");
      if(!ctx) return;
      ctx.clearRect(0,0,tamanho,tamanho);
      if(imagemPronta){
        ctx.drawImage(imagem,5,8,76,76);
      }else{
        // Fallback temporário até carregar o ícone original.
        ctx.fillStyle="#B01018";
        ctx.fillRect(5,8,76,76);
        ctx.fillStyle="#FFFFFF";
        ctx.font="bold 27px sans-serif";
        ctx.textAlign="center";
        ctx.textBaseline="middle";
        ctx.fillText("BDR",43,47);
      }

      const texto=totalAtual>99?"99+":String(totalAtual);
      const raio=totalAtual>99?27:23;
      const centroX=74,centroY=24;
      ctx.beginPath();
      ctx.arc(centroX,centroY,raio,0,2*Math.PI);
      ctx.fillStyle="#C90016";
      ctx.fill();
      ctx.lineWidth=5;
      ctx.strokeStyle="#FFFFFF";
      ctx.stroke();
      ctx.fillStyle="#FFFFFF";
      ctx.textAlign="center";
      ctx.textBaseline="middle";
      ctx.font=totalAtual>99?"bold 20px Arial":"bold 31px Arial";
      ctx.fillText(texto,centroX,centroY+1);

      favicon.href=canvas.toDataURL("image/png");
    }catch(_){
      favicon.href=hrefOriginal;
    }
  }

  function atualizar(total){
    totalAtual=quantidade(total);
    if(badgeAtualizado && totalAtual===totalAnterior) return;
    totalAnterior=totalAtual;
    badgeAtualizado=true;
    document.title=totalAtual>0
      ? "("+(totalAtual>99?"99+":String(totalAtual))+") "+TITULO_BASE
      : TITULO_BASE;
    desenhar();
    atualizarBadgeNativo(totalAtual);
  }

  function limpar(){atualizar(0);}

  imagem.onload=()=>{imagemPronta=true;desenhar();};
  imagem.onerror=()=>{imagemPronta=false;desenhar();};
  imagem.src=hrefOriginal;

  global.AtlasBadge={atualizar,limpar,versao:"20261123-01"};
})(window);
