/* =========================================================
   ATLAS EXPEDIÇÃO — DADOS DO CATÁLOGO
   Busca paginada no Supabase. O navegador recebe somente o necessário.
========================================================= */
(function(global){
  "use strict";

  if(global.AtlasExpedicaoCatalogo?.__loaded) return;

  const STATUS_TODOS=["ESTOQUE","NO ESTOQUE","DISPONIVEL","EM_USO","MANUTENCAO","RESERVADO"];

  function db(){
    return global.client || global.supabaseClient || global.clientSupabase || globalThis.client;
  }

  function limparBusca(valor){
    return String(valor||"").trim().replace(/[(),]/g," ").replace(/\s+/g," ").slice(0,80);
  }

  function statuses(status){
    const s=String(status||"TODOS").toUpperCase();
    if(s==="TODOS") return STATUS_TODOS;
    if(s==="ESTOQUE") return ["ESTOQUE","NO ESTOQUE","DISPONIVEL"];
    return [s];
  }

  function aplicarEscopo(query,obraIds){
    if(Array.isArray(obraIds) && obraIds.length){
      return query.in("obra_id",obraIds);
    }
    return query;
  }

  function aplicarBusca(query,tabela,busca){
    const termo=limparBusca(busca);
    if(termo.length<2) return query;

    if(tabela==="patrimonio"){
      return query.or(`nome_bem.ilike.%${termo}%,codigo_qr.ilike.%${termo}%`);
    }

    return query.or(`descricao.ilike.%${termo}%,codigo.ilike.%${termo}%`);
  }


  const cachePaginacao = new Map();

  function chaveConsulta({busca="",status="TODOS",obraIds=null,limite=24}={}){
    const obras=Array.isArray(obraIds)?[...obraIds].map(Number).sort((a,b)=>a-b):null;
    return JSON.stringify({
      busca:limparBusca(busca),
      status:String(status||"TODOS").toUpperCase(),
      obras,
      limite:Number(limite)||24
    });
  }

  async function contarSeguro(tabela,{busca="",status="TODOS",obraIds=null}={}){
    let q=db()
      .from(tabela)
      .select("id",{count:"exact",head:true})
      .in("status",statuses(status));

    q=aplicarEscopo(q,obraIds);
    q=aplicarBusca(q,tabela,busca);

    const {count,error}=await q;
    if(error) throw error;
    return Number(count||0);
  }

  async function buscarFaixaSegura(tabela,{
    busca="",
    status="TODOS",
    inicio=0,
    limite=12,
    total=0,
    obraIds=null
  }={}){
    const totalSeguro=Math.max(0,Number(total)||0);
    const inicioSeguro=Math.max(0,Number(inicio)||0);
    const limiteSeguro=Math.max(1,Number(limite)||1);

    // Evita Range Not Satisfiable (HTTP 416) quando a fonte acabou.
    if(!totalSeguro || inicioSeguro >= totalSeguro){
      return [];
    }

    const fim=Math.min(
      totalSeguro-1,
      inicioSeguro+limiteSeguro-1
    );

    let q=db()
      .from(tabela)
      .select("*")
      .in("status",statuses(status))
      .order("id",{ascending:false});

    q=aplicarEscopo(q,obraIds);
    q=aplicarBusca(q,tabela,busca);

    const {data,error}=await q.range(inicioSeguro,fim);
    if(error) throw error;
    return data||[];
  }

  function calcularCotas(totalPatrimonios,totalProdutos,limite){
    const pat=Math.max(0,Number(totalPatrimonios)||0);
    const prod=Math.max(0,Number(totalProdutos)||0);
    const porPagina=Math.max(1,Number(limite)||24);
    const total=pat+prod;

    if(!total) return {pat:0,prod:0,totalPaginas:1};
    if(!pat) return {
      pat:0,
      prod:porPagina,
      totalPaginas:Math.max(1,Math.ceil(prod/porPagina))
    };
    if(!prod) return {
      pat:porPagina,
      prod:0,
      totalPaginas:Math.max(1,Math.ceil(pat/porPagina))
    };

    let quotaPat=Math.round(porPagina*(pat/total));
    quotaPat=Math.max(1,Math.min(porPagina-1,quotaPat));
    const quotaProd=porPagina-quotaPat;

    return {
      pat:quotaPat,
      prod:quotaProd,
      totalPaginas:Math.max(
        1,
        Math.ceil(pat/quotaPat),
        Math.ceil(prod/quotaProd)
      )
    };
  }

  async function buscar({busca="",status="TODOS",pagina=0,limite=24,obraIds=null}={}){
    if(!db()) throw new Error("Supabase não carregado.");

    const paginaAtual=Math.max(0,Number(pagina)||0);
    const limitePagina=Math.max(1,Number(limite)||24);
    const key=chaveConsulta({busca,status,obraIds,limite:limitePagina});

    let meta=cachePaginacao.get(key);

    if(!meta){
      const [totalPatrimonios,totalProdutos]=await Promise.all([
        contarSeguro("patrimonio",{busca,status,obraIds}),
        contarSeguro("estoque_produtos",{busca,status,obraIds})
      ]);

      const cotas=calcularCotas(totalPatrimonios,totalProdutos,limitePagina);

      meta={
        totalPatrimonios,
        totalProdutos,
        total:Number(totalPatrimonios+totalProdutos),
        quotaPat:cotas.pat,
        quotaProd:cotas.prod,
        totalPaginas:cotas.totalPaginas
      };

      cachePaginacao.set(key,meta);
    }

    const [patrimonios,produtos]=await Promise.all([
      meta.quotaPat
        ? buscarFaixaSegura("patrimonio",{
            busca,status,obraIds,
            inicio:paginaAtual*meta.quotaPat,
            limite:meta.quotaPat,
            total:meta.totalPatrimonios
          })
        : Promise.resolve([]),

      meta.quotaProd
        ? buscarFaixaSegura("estoque_produtos",{
            busca,status,obraIds,
            inicio:paginaAtual*meta.quotaProd,
            limite:meta.quotaProd,
            total:meta.totalProdutos
          })
        : Promise.resolve([])
    ]);

    return {
      patrimonios,
      produtos,
      total:meta.total,
      totalPatrimonios:meta.totalPatrimonios,
      totalProdutos:meta.totalProdutos,
      totalPaginas:meta.totalPaginas,
      temMais:paginaAtual+1<meta.totalPaginas,
      pagina:paginaAtual,
      limite:limitePagina
    };
  }

  function limparCachePaginacao(){
    cachePaginacao.clear();
  }

  async function contarTabela(tabela,status,obraIds){
    let q=db().from(tabela).select("id",{count:"exact",head:true}).in("status",statuses(status));
    q=aplicarEscopo(q,obraIds);
    const {count,error}=await q;
    if(error) throw error;
    return Number(count||0);
  }

  async function kpis({obraIds=null}={}){
    const nomes=["TODOS","ESTOQUE","EM_USO","MANUTENCAO","RESERVADO"];
    const pares=await Promise.all(nomes.map(async status=>{
      const [a,b]=await Promise.all([
        contarTabela("patrimonio",status,obraIds),
        contarTabela("estoque_produtos",status,obraIds)
      ]);
      return [status,a+b];
    }));
    return Object.fromEntries(pares);
  }

  global.AtlasExpedicaoCatalogo=Object.freeze({
    __loaded:true,
    buscar,
    kpis
  });

  console.info("✅ ATLAS EXPEDIÇÃO CATÁLOGO carregado — busca paginada");
})(window);
