/* Atlas: regra patrimonial compartilhada entre dashboard e relatórios. */
(function(){
  'use strict';
function status(p){return p?.ativo===false?"INATIVO":String(p?.status??"").trim().toUpperCase();}
function ativo(p){return !!p&&p.ativo===true&&!["BAIXADO","INATIVO"].includes(status(p));}
function numero(v){if(v===null||v===undefined||String(v).trim()==="")return null;let s=String(v).trim().replace(/R\$/gi,"").replace(/\s/g,"");if(s.includes(","))s=s.replace(/\./g,"").replace(",",".");const n=Number(s);return Number.isFinite(n)?n:null;}
function valor(p){for(const v of [p?.valor_bem,p?.valor_aquisicao]){const n=numero(v);if(n!==null&&n>0)return n;}return null;}
function centavos(p){return Math.round((valor(p)??0)*100);}
function total(lista){return lista.reduce((s,p)=>s+(ativo(p)?centavos(p):0),0)/100;}
  window.AtlasPatrimonial=Object.freeze({status,ativo,numero,valor,centavos,total});
})();
