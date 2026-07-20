(function(global){
"use strict";
const STORAGE_KEY="atlas_etiqueta_config_v7";
const LEGACY_KEY="atlas_etiqueta_config_v6";
const TEST_KEY="atlas_etiqueta_teste_v7";
const DB_TABLE="configuracoes_etiqueta";
const DB_KEY="PADRAO_GLOBAL";
const PADRAO=Object.freeze({
 nome:"Padrão Atlas 55x35",impressora:"Elgin L42 Pro Full",
 larguraPapelMm:55,alturaPapelMm:35,larguraMm:50,alturaMm:31,paddingMm:1.5,bordaMm:.35,raioMm:1.6,topoAlturaMm:12.3,
 logoEngrenagemMm:7.2,logoBdrMm:9.1,logoSubMm:2.2,qrMm:11.3,fonteLocalMm:2.45,fonteItemMm:2.45,fonteCodigoMm:3.55,
 moverEngrenagemXmm:0,moverEngrenagemYmm:0,moverBdrXmm:0,moverBdrYmm:0,moverSubXmm:0,moverSubYmm:0,moverQrXmm:0,moverQrYmm:0,
 moverLocalXmm:0,moverLocalYmm:0,moverItemXmm:0,moverItemYmm:0,moverCodigoXmm:0,moverCodigoYmm:0,
 fonteBdr:"Arial",pesoBdr:900,italicoBdr:false,maiusculoBdr:true,espacoBdrMm:-.65,alinharBdr:"left",
 fonteSub:"Arial",pesoSub:700,italicoSub:true,maiusculoSub:false,espacoSubMm:0,alinharSub:"right",
 fonteLocal:"Arial",pesoLocal:800,italicoLocal:false,maiusculoLocal:false,espacoLocalMm:0,alinharLocal:"left",
 fonteItem:"Arial",pesoItem:800,italicoItem:false,maiusculoItem:false,espacoItemMm:0,alinharItem:"left",
 fonteCodigo:"Arial",pesoCodigo:900,italicoCodigo:false,maiusculoCodigo:true,espacoCodigoMm:0,alinharCodigo:"right",
 mostrarEngrenagem:true,mostrarBdr:true,mostrarSub:true,mostrarQr:true,mostrarLocal:true,mostrarItem:true,mostrarCodigo:true,
 calibracaoXmm:0,calibracaoYmm:0,escalaImpressao:1
});
const num=(v,p)=>Number.isFinite(Number(v))?Number(v):p;
function normalizar(input={}){
 const cfg={...PADRAO,...(input||{})};
 for(const k of Object.keys(PADRAO)){
  if(typeof PADRAO[k]==="number") cfg[k]=num(cfg[k],PADRAO[k]);
  else if(typeof PADRAO[k]==="boolean") cfg[k]=cfg[k]===false?false:Boolean(cfg[k]);
  else cfg[k]=String(cfg[k]??PADRAO[k]);
 }
 cfg.larguraPapelMm=Math.max(20,Math.min(120,cfg.larguraPapelMm));
 cfg.alturaPapelMm=Math.max(10,Math.min(100,cfg.alturaPapelMm));
 cfg.larguraMm=Math.max(10,Math.min(cfg.larguraPapelMm,cfg.larguraMm));
 cfg.alturaMm=Math.max(8,Math.min(cfg.alturaPapelMm,cfg.alturaMm));
 cfg.escalaImpressao=Math.max(.75,Math.min(1.25,cfg.escalaImpressao));
 cfg.calibracaoXmm=Math.max(-10,Math.min(10,cfg.calibracaoXmm));
 cfg.calibracaoYmm=Math.max(-10,Math.min(10,cfg.calibracaoYmm));
 return cfg;
}
function ajustarDentroDoPapel(input){
 const cfg=normalizar(input);
 const escalaMaxX=(cfg.larguraPapelMm-2*Math.abs(cfg.calibracaoXmm))/cfg.larguraMm;
 const escalaMaxY=(cfg.alturaPapelMm-2*Math.abs(cfg.calibracaoYmm))/cfg.alturaMm;
 const segura=Math.max(.75,Math.min(cfg.escalaImpressao,escalaMaxX,escalaMaxY,1.25));
 cfg.escalaImpressao=Number(segura.toFixed(3));
 return normalizar(cfg);
}
function carregar(){
 try{
  const raw=localStorage.getItem(STORAGE_KEY)||localStorage.getItem(LEGACY_KEY);
  return normalizar(raw?JSON.parse(raw):{});
 }catch(e){console.warn("Atlas Etiquetas: padrão restaurado.",e);return normalizar();}
}
function salvar(cfg){const v=normalizar(cfg);localStorage.setItem(STORAGE_KEY,JSON.stringify(v));return v;}
function salvarTeste(cfg){sessionStorage.setItem(TEST_KEY,JSON.stringify(normalizar(cfg)));}
function carregarTeste(){try{const raw=sessionStorage.getItem(TEST_KEY);return raw?normalizar(JSON.parse(raw)):null}catch{return null}}
function db(){return global.client||global.supabaseClient||null;}
async function carregarBanco(){
 const c=db(); if(!c)return null;
 try{
  const {data,error}=await c.from(DB_TABLE).select("chave,layout_json,offset_x_mm,offset_y_mm,escala,updated_at").eq("chave",DB_KEY).maybeSingle();
  if(error)throw error; if(!data)return null;
  const cfg=normalizar({...(data.layout_json||{}),calibracaoXmm:data.offset_x_mm??0,calibracaoYmm:data.offset_y_mm??0,escalaImpressao:data.escala??1});
  salvar(cfg); return cfg;
 }catch(e){console.warn("Atlas Etiquetas: padrão do banco indisponível.",e);return null;}
}
async function salvarBanco(cfg,usuario=null){
 const c=db(); if(!c)throw new Error("Supabase não está disponível.");
 const v=normalizar(cfg);
 const payload={chave:DB_KEY,nome:v.nome,layout_json:v,offset_x_mm:v.calibracaoXmm,offset_y_mm:v.calibracaoYmm,escala:v.escalaImpressao,ativo:true,updated_at:new Date().toISOString(),updated_by:usuario?.id??null};
 const {data,error}=await c.from(DB_TABLE).upsert(payload,{onConflict:"chave"}).select().single();
 if(error)throw error; salvar(v); return data;
}
function aplicar(cfg){
 cfg=normalizar(cfg||carregar()); const r=document.documentElement;
 const vars={"--papel-w":`${cfg.larguraPapelMm}mm`,"--papel-h":`${cfg.alturaPapelMm}mm`,"--arte-w":`${cfg.larguraMm}mm`,"--arte-h":`${cfg.alturaMm}mm`,"--padding":`${cfg.paddingMm}mm`,"--borda":`${cfg.bordaMm}mm`,"--raio":`${cfg.raioMm}mm`,"--topo-h":`${cfg.topoAlturaMm}mm`,"--gear-size":`${cfg.logoEngrenagemMm}mm`,"--bdr-size":`${cfg.logoBdrMm}mm`,"--sub-size":`${cfg.logoSubMm}mm`,"--qr-size":`${cfg.qrMm}mm`,"--local-size":`${cfg.fonteLocalMm}mm`,"--item-size":`${cfg.fonteItemMm}mm`,"--codigo-size":`${cfg.fonteCodigoMm}mm`,"--gear-x":`${cfg.moverEngrenagemXmm}mm`,"--gear-y":`${cfg.moverEngrenagemYmm}mm`,"--bdr-x":`${cfg.moverBdrXmm}mm`,"--bdr-y":`${cfg.moverBdrYmm}mm`,"--sub-x":`${cfg.moverSubXmm}mm`,"--sub-y":`${cfg.moverSubYmm}mm`,"--qr-x":`${cfg.moverQrXmm}mm`,"--qr-y":`${cfg.moverQrYmm}mm`,"--local-x":`${cfg.moverLocalXmm}mm`,"--local-y":`${cfg.moverLocalYmm}mm`,"--item-x":`${cfg.moverItemXmm}mm`,"--item-y":`${cfg.moverItemYmm}mm`,"--codigo-x":`${cfg.moverCodigoXmm}mm`,"--codigo-y":`${cfg.moverCodigoYmm}mm`,"--font-bdr":`${cfg.fonteBdr},sans-serif`,"--weight-bdr":cfg.pesoBdr,"--style-bdr":cfg.italicoBdr?"italic":"normal","--transform-bdr":cfg.maiusculoBdr?"uppercase":"none","--letter-bdr":`${cfg.espacoBdrMm}mm`,"--align-bdr":cfg.alinharBdr,"--font-sub":`${cfg.fonteSub},sans-serif`,"--weight-sub":cfg.pesoSub,"--style-sub":cfg.italicoSub?"italic":"normal","--transform-sub":cfg.maiusculoSub?"uppercase":"none","--letter-sub":`${cfg.espacoSubMm}mm`,"--align-sub":cfg.alinharSub,"--font-local":`${cfg.fonteLocal},sans-serif`,"--weight-local":cfg.pesoLocal,"--style-local":cfg.italicoLocal?"italic":"normal","--transform-local":cfg.maiusculoLocal?"uppercase":"none","--letter-local":`${cfg.espacoLocalMm}mm`,"--align-local":cfg.alinharLocal,"--font-item":`${cfg.fonteItem},sans-serif`,"--weight-item":cfg.pesoItem,"--style-item":cfg.italicoItem?"italic":"normal","--transform-item":cfg.maiusculoItem?"uppercase":"none","--letter-item":`${cfg.espacoItemMm}mm`,"--align-item":cfg.alinharItem,"--font-codigo":`${cfg.fonteCodigo},sans-serif`,"--weight-codigo":cfg.pesoCodigo,"--style-codigo":cfg.italicoCodigo?"italic":"normal","--transform-codigo":cfg.maiusculoCodigo?"uppercase":"none","--letter-codigo":`${cfg.espacoCodigoMm}mm`,"--align-codigo":cfg.alinharCodigo,"--print-x":`${cfg.calibracaoXmm}mm`,"--print-y":`${cfg.calibracaoYmm}mm`,"--print-scale":cfg.escalaImpressao};
 Object.entries(vars).forEach(([k,v])=>r.style.setProperty(k,String(v)));
 const vis={engrenagem:cfg.mostrarEngrenagem,bdr:cfg.mostrarBdr,sub:cfg.mostrarSub,qr:cfg.mostrarQr,local:cfg.mostrarLocal,item:cfg.mostrarItem,codigo:cfg.mostrarCodigo};
 Object.entries(vis).forEach(([id,on])=>document.querySelectorAll(`[data-el="${id}"]`).forEach(el=>el.style.display=on?"":"none"));
 return cfg;
}
function usuarioAtualSeguro(){for(const k of ["usuario_logado","usuarioLogado","bdr_usuario","atlas_usuario","usuarioAtual"]){try{const raw=localStorage.getItem(k)||sessionStorage.getItem(k);if(raw){const v=JSON.parse(raw);return v.usuario||v.user||v}}catch{}}return null;}
global.AtlasEtiquetaV7={PADRAO,STORAGE_KEY,TEST_KEY,normalizar,ajustarDentroDoPapel,carregar,salvar,salvarTeste,carregarTeste,carregarBanco,salvarBanco,aplicar,usuarioAtualSeguro,DB_TABLE,DB_KEY};
global.AtlasEtiquetaV6=global.AtlasEtiquetaV7;global.AtlasEtiquetaConfig=global.AtlasEtiquetaV7;
})(window);
