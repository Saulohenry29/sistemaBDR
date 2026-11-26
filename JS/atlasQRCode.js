/* =========================================================
   ARQUIVO: atlasQRCode.js
   MÓDULO: Atlas QR Code Local
   VERSÃO: 1.0.1

   OBJETIVO:
   - gerar QR Code localmente, sem API externa;
   - manter cache em memória para reaproveitar QR já criado;
   - oferecer o mesmo motor para impressão individual e em lote;
   - permitir pré-geração logo após o cadastro do patrimônio.
========================================================= */
(function(global){
"use strict";

const CACHE = new Map();
const URL_BASE_PADRAO = "https://www.bdrgestao.com.br/etiqueta.html?id=";

function texto(v){ return String(v ?? "").trim(); }
function normalizarTamanho(v, padrao=220){
  const n=Number(v);
  return Number.isFinite(n) ? Math.max(96,Math.min(1024,Math.round(n))) : padrao;
}
function linkPatrimonio(codigo){
  return URL_BASE_PADRAO + encodeURIComponent(texto(codigo));
}
function chaveCache(conteudo,tamanho,nivel){
  return `${nivel}|${tamanho}|${conteudo}`;
}
function nivelCorrecao(nivel="M"){
  const L=global.AtlasQRErrorCorrectLevel;
  if(!L) throw new Error("Atlas QR Core ainda não carregou.");
  return L[String(nivel||"M").toUpperCase()] ?? L.M;
}
function criarMatriz(conteudo,nivel){
  const Core=global.AtlasQRCodeCore;
  if(typeof Core!=="function")
    throw new Error("JS/atlasQRCode/qrcode.min.js não foi carregado.");
  const qr=new Core(0,nivelCorrecao(nivel));
  qr.addData(conteudo);
  qr.make();
  return qr;
}

// Raster direto no tamanho FINAL da impressora: módulos inteiros, sem
// redimensionamento/interpolação. Mantém a mesma URL da prévia oficial.
function desenharEmCanvas(ctx,codigoOuConteudo,opcoes={}){
  if(!ctx || typeof ctx.fillRect!=="function")
    throw new Error("Canvas inválido para QR Code.");

  const codigo=texto(codigoOuConteudo);
  if(!codigo)throw new Error("Código vazio para gerar QR Code.");

  const conteudo=opcoes.conteudoDireto ? codigo : linkPatrimonio(codigo);
  const qr=criarMatriz(conteudo,opcoes.nivel||"M");
  const margem=4; // Quiet zone de quatro módulos em todos os lados.
  const total=qr.getModuleCount()+2*margem;
  const tamanho=Number(opcoes.tamanho);
  const x=Number(opcoes.x), y=Number(opcoes.y);
  if(!Number.isFinite(tamanho)||tamanho<=0||!Number.isFinite(x)||!Number.isFinite(y))
    throw new Error("Área do QR Code inválida.");

  // Em impressora térmica, 1 ponto por módulo perde detalhes facilmente.
  // Permite até 6 px extras para códigos um pouco maiores (ex.: versão 5),
  // sem reduzir o módulo a apenas um ponto da cabeça térmica.
  const modulo=Math.max(2,Math.floor(tamanho/total));
  const lado=total*modulo;
  if(lado>tamanho+6)
    throw new Error("QR Code pequeno demais para impressão B1. Aumente o tamanho do QR no perfil da etiqueta.");
  const esquerda=Math.round(x+(tamanho-lado)/2);
  const topo=Math.round(y+(tamanho-lado)/2);
  ctx.save();
  ctx.setTransform(1,0,0,1,0,0);
  ctx.fillStyle="#ffffff";
  ctx.fillRect(esquerda,topo,lado,lado);
  ctx.fillStyle="#000000";
  for(let linha=0;linha<qr.getModuleCount();linha++){
    for(let coluna=0;coluna<qr.getModuleCount();coluna++){
      if(qr.isDark(linha,coluna))
        ctx.fillRect(esquerda+(coluna+margem)*modulo,topo+(linha+margem)*modulo,modulo,modulo);
    }
  }
  ctx.restore();
  return {tamanho:lado,modulo,modulos:qr.getModuleCount()};
}

function gerarDataURL(conteudo, opcoes={}){
  const valor=texto(conteudo);
  if(!valor) throw new Error("Conteúdo vazio para gerar QR Code.");

  const tamanho=normalizarTamanho(opcoes.tamanho,220);
  const nivel=String(opcoes.nivel||"M").toUpperCase();
  const chave=chaveCache(valor,tamanho,nivel);
  if(CACHE.has(chave)) return CACHE.get(chave);

  const qr=criarMatriz(valor,nivel);

  const modulos=qr.getModuleCount();
  const margem=4;
  const total=modulos+(margem*2);
  const escala=Math.max(1,Math.floor(tamanho/total));
  const desenho=total*escala;

  const canvas=document.createElement("canvas");
  canvas.width=desenho;
  canvas.height=desenho;
  const ctx=canvas.getContext("2d",{alpha:false});
  ctx.fillStyle="#ffffff";
  ctx.fillRect(0,0,desenho,desenho);
  ctx.fillStyle="#000000";

  for(let linha=0;linha<modulos;linha++){
    for(let coluna=0;coluna<modulos;coluna++){
      if(qr.isDark(linha,coluna)){
        ctx.fillRect((coluna+margem)*escala,(linha+margem)*escala,escala,escala);
      }
    }
  }

  const dataURL=canvas.toDataURL("image/png");
  CACHE.set(chave,dataURL);
  return dataURL;
}
function gerarPatrimonio(codigo,opcoes={}){
  return gerarDataURL(linkPatrimonio(codigo),opcoes);
}
async function aplicarEmImagem(imagem,codigoOuConteudo,opcoes={}){
  if(!imagem) throw new Error("Elemento de imagem do QR não encontrado.");
  const dataURL=opcoes.conteudoDireto
    ? gerarDataURL(codigoOuConteudo,opcoes)
    : gerarPatrimonio(codigoOuConteudo,opcoes);
  imagem.src=dataURL;
  imagem.dataset.atlasQrLocal="1";
  if(typeof imagem.decode==="function"){
    try{ await imagem.decode(); }catch(e){}
  }
  return dataURL;
}
function preGerar(codigo,opcoes={}){
  return Promise.resolve(gerarPatrimonio(codigo,opcoes));
}
async function preGerarLista(codigos=[],opcoes={}){
  const unicos=[...new Set((codigos||[]).map(texto).filter(Boolean))];
  const mapa=new Map();
  for(const codigo of unicos){ mapa.set(codigo,gerarPatrimonio(codigo,opcoes)); }
  return mapa;
}
function limparCache(){ CACHE.clear(); }
function quantidadeCache(){ return CACHE.size; }

global.AtlasQRCode={
  versao:"1.0.1",
  linkPatrimonio,
  desenharEmCanvas,
  gerarDataURL,
  gerarPatrimonio,
  aplicarEmImagem,
  preGerar,
  preGerarLista,
  limparCache,
  quantidadeCache
};
})(window);
