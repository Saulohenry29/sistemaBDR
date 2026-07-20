/* =========================================================
   ARQUIVO: atlasPrintCenter.js
   MÓDULO: Atlas Print Center
   VERSÃO: 4.0.0

   OBJETIVO:
   Gerenciar impressoras, perfis de calibração e o vínculo
   entre cada obra e seu perfil de impressão.

   TABELAS UTILIZADAS:
   - atlas_impressoras
   - atlas_perfis_impressao
   - atlas_obras_impressao

   OBSERVAÇÃO:
   Este arquivo não escolhe a impressora física do Windows.
   Ele aplica o perfil técnico antes de abrir a impressão.
========================================================= */

(function(global){
"use strict";
const T_IMPRESSORAS="atlas_impressoras";
const T_PERFIS="atlas_perfis_impressao";
const T_OBRAS="atlas_obras_impressao";
const db=()=>global.client||global.supabaseClient||global.clientSupabase||null;
const num=(v,p=0)=>Number.isFinite(Number(v))?Number(v):p;
function normalizarImpressora(p={}){return {id:p.id??null,nome:String(p.nome||"Impressora"),fabricante:String(p.fabricante||""),modelo:String(p.modelo||""),tipo:String(p.tipo||"ETIQUETA"),empresa_id:p.empresa_id??null,ativa:p.ativa!==false,observacao:String(p.observacao||"")};}
function normalizarPerfil(p={}){return {id:p.id??null,impressora_id:p.impressora_id??null,nome:String(p.nome||"Perfil de impressão"),largura_mm:num(p.largura_mm,55),altura_mm:num(p.altura_mm,35),arte_largura_mm:num(p.arte_largura_mm,50),arte_altura_mm:num(p.arte_altura_mm,31),deslocamento_x_mm:num(p.deslocamento_x_mm,0),deslocamento_y_mm:num(p.deslocamento_y_mm,0),escala:num(p.escala,1),orientacao:String(p.orientacao||"RETRATO"),ativo:p.ativo!==false,padrao_impressora:p.padrao_impressora===true,observacao:String(p.observacao||""),impressora:p.atlas_impressoras?normalizarImpressora(p.atlas_impressoras):null};}
function cli(){const c=db();if(!c)throw new Error("Supabase indisponível. Verifique JS/supabaseClient.js.");return c;}
async function listarImpressoras(){const {data,error}=await cli().from(T_IMPRESSORAS).select("*").order("nome");if(error)throw error;return (data||[]).map(normalizarImpressora);}
async function salvarImpressora(input){const c=cli(),p=normalizarImpressora(input),payload={nome:p.nome,fabricante:p.fabricante,modelo:p.modelo,tipo:p.tipo,empresa_id:p.empresa_id||null,ativa:p.ativa,observacao:p.observacao,updated_at:new Date().toISOString()};let q=p.id?c.from(T_IMPRESSORAS).update(payload).eq("id",p.id):c.from(T_IMPRESSORAS).insert(payload);const {data,error}=await q.select().single();if(error)throw error;return normalizarImpressora(data);}
async function excluirImpressora(id){const {error}=await cli().from(T_IMPRESSORAS).delete().eq("id",id);if(error)throw error;}
async function listarPerfis(impressoraId=null){let q=cli().from(T_PERFIS).select("*,atlas_impressoras(id,nome,fabricante,modelo,tipo,empresa_id,ativa,observacao)").order("padrao_impressora",{ascending:false}).order("nome");if(impressoraId)q=q.eq("impressora_id",impressoraId);const {data,error}=await q;if(error)throw error;return (data||[]).map(normalizarPerfil);}
async function buscarPerfil(id){if(!id)return null;const {data,error}=await cli().from(T_PERFIS).select("*,atlas_impressoras(*)").eq("id",id).maybeSingle();if(error)throw error;return data?normalizarPerfil(data):null;}
async function salvarPerfil(input){const c=cli(),p=normalizarPerfil(input);if(!p.impressora_id)throw new Error("Selecione a impressora deste perfil.");if(p.padrao_impressora){let q=c.from(T_PERFIS).update({padrao_impressora:false,updated_at:new Date().toISOString()}).eq("impressora_id",p.impressora_id);if(p.id)q=q.neq("id",p.id);const {error:e}=await q;if(e)throw e;}const payload={impressora_id:Number(p.impressora_id),nome:p.nome,largura_mm:p.largura_mm,altura_mm:p.altura_mm,arte_largura_mm:p.arte_largura_mm,arte_altura_mm:p.arte_altura_mm,deslocamento_x_mm:p.deslocamento_x_mm,deslocamento_y_mm:p.deslocamento_y_mm,escala:p.escala,orientacao:p.orientacao,ativo:p.ativo,padrao_impressora:p.padrao_impressora,observacao:p.observacao,updated_at:new Date().toISOString()};let q=p.id?c.from(T_PERFIS).update(payload).eq("id",p.id):c.from(T_PERFIS).insert(payload);const {data,error}=await q.select("*,atlas_impressoras(*)").single();if(error)throw error;return normalizarPerfil(data);}
async function excluirPerfil(id){const {error}=await cli().from(T_PERFIS).delete().eq("id",id);if(error)throw error;}
async function listarVinculos(){const {data,error}=await cli().from(T_OBRAS).select("*").order("obra_id");if(error)throw error;return data||[];}
async function vincularObra({obra_id,impressora_id,perfil_impressao_id,finalidade="ETIQUETA",padrao=true}){const c=cli();if(!obra_id||!impressora_id||!perfil_impressao_id)throw new Error("Obra, impressora e perfil são obrigatórios.");if(padrao){const {error:e}=await c.from(T_OBRAS).update({padrao:false,updated_at:new Date().toISOString()}).eq("obra_id",obra_id).eq("finalidade",finalidade);if(e)throw e;}const payload={obra_id:Number(obra_id),impressora_id:Number(impressora_id),perfil_impressao_id:Number(perfil_impressao_id),finalidade,ativo:true,padrao:Boolean(padrao),updated_at:new Date().toISOString()};const {data,error}=await c.from(T_OBRAS).upsert(payload,{onConflict:"obra_id,finalidade"}).select().single();if(error)throw error;return data;}
async function desvincularObra(obraId,finalidade="ETIQUETA"){const {error}=await cli().from(T_OBRAS).delete().eq("obra_id",obraId).eq("finalidade",finalidade);if(error)throw error;}
async function perfilDaObra(obraId,finalidade="ETIQUETA"){const c=db();if(!c)return null;if(obraId){const {data,error}=await c.from(T_OBRAS).select("perfil_impressao_id,atlas_perfis_impressao(*,atlas_impressoras(*))").eq("obra_id",obraId).eq("finalidade",finalidade).eq("ativo",true).maybeSingle();if(!error&&data?.atlas_perfis_impressao)return normalizarPerfil(data.atlas_perfis_impressao);}const {data,error}=await c.from(T_PERFIS).select("*,atlas_impressoras(*)").eq("padrao_impressora",true).eq("ativo",true).limit(1).maybeSingle();if(error)return null;return data?normalizarPerfil(data):null;}
function aplicarPerfilAoLayout(layout,perfil){if(!perfil)return layout;const imp=perfil.impressora;return {...layout,impressora:imp?[imp.fabricante,imp.modelo].filter(Boolean).join(" ")||imp.nome:perfil.nome,larguraPapelMm:perfil.largura_mm,alturaPapelMm:perfil.altura_mm,larguraMm:perfil.arte_largura_mm,alturaMm:perfil.arte_altura_mm,calibracaoXmm:perfil.deslocamento_x_mm,calibracaoYmm:perfil.deslocamento_y_mm,escalaImpressao:perfil.escala};}
global.AtlasPrintCenter={T_IMPRESSORAS,T_PERFIS,T_OBRAS,normalizarImpressora,normalizarPerfil,listarImpressoras,salvarImpressora,excluirImpressora,listarPerfis,buscarPerfil,salvarPerfil,excluirPerfil,listarVinculos,vincularObra,desvincularObra,perfilDaObra,aplicarPerfilAoLayout};
})(window);
