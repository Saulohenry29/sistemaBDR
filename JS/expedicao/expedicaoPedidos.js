/* =========================================================
   ATLAS EXPEDIÇÃO — DADOS DOS PEDIDOS
   Carrega fluxo ativo + histórico recente, evitando baixar centenas
   de pedidos antigos sem necessidade.
========================================================= */
(function(global){
  "use strict";

  if(global.AtlasExpedicaoPedidos?.__loaded) return;

  const STATUS_ATIVOS=[
    "SOLICITADO","AGUARDANDO_AUTORIZACAO","APROVADO","RESERVADO",
    "EM_SEPARACAO","AGUARDANDO_NFE","AGUARDANDO_RETIRADA",
    "AGUARDANDO_CONFIRMACAO","EM_TRANSITO","TRANSITO"
  ];
  const STATUS_HISTORICO=["ENTREGUE","RECEBIDO","RECEBIDO_PARCIAL","RECEBIDO_COM_DIVERGENCIA","NEGADO"];

  function db(){
    return global.client || global.supabaseClient || global.clientSupabase || globalThis.client;
  }

  async function carregar({limiteAtivos=120,limiteHistorico=30}={}){
    if(!db()) throw new Error("Supabase não carregado.");

    const [ativosRes,historicoRes]=await Promise.all([
      db().from("pedidos_retirada").select("*").in("status",STATUS_ATIVOS).order("id",{ascending:false}).limit(limiteAtivos),
      db().from("pedidos_retirada").select("*").in("status",STATUS_HISTORICO).order("id",{ascending:false}).limit(limiteHistorico)
    ]);

    if(ativosRes.error) throw ativosRes.error;
    if(historicoRes.error) throw historicoRes.error;

    const mapa=new Map();
    [...(ativosRes.data||[]),...(historicoRes.data||[])].forEach(p=>mapa.set(String(p.id),p));
    let lista=[...mapa.values()].sort((a,b)=>Number(b.id)-Number(a.id));

    const ids=lista.map(p=>p.id).filter(Boolean);
    if(ids.length){
      const itensRes=await db().from("itens_retirada").select("*").in("pedido_id",ids);
      if(itensRes.error) throw itensRes.error;
      const porPedido=new Map();
      (itensRes.data||[]).forEach(item=>{
        const chave=String(item.pedido_id);
        if(!porPedido.has(chave)) porPedido.set(chave,[]);
        porPedido.get(chave).push(item);
      });
      lista=lista.map(p=>({...p,itens_retirada:porPedido.get(String(p.id))||[]}));
    }

    const totalRes=await db().from("pedidos_retirada").select("id",{count:"exact",head:true});
    return {pedidos:lista,total:Number(totalRes.count||lista.length)};
  }

  global.AtlasExpedicaoPedidos=Object.freeze({__loaded:true,carregar});
  console.info("✅ ATLAS EXPEDIÇÃO PEDIDOS carregado — ativos + histórico recente");
})(window);
