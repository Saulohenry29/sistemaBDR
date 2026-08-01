/* =========================================================
   ATLAS EXPEDIÇÃO NOVA — CARREGADOR DE MÓDULOS V1.2
========================================================= */
(function(global){
  'use strict';

  if(global.AtlasExpedicaoLoader?.__loaded) return;

  const carregados = new Map();

  const base = {
    modal:['./JS/AtlasModal.js'],
    workflow:['./JS/atlasWorkflow.js'],
    reservas:['./JS/AtlasGestorReservas.js'],
    logistica:[
      './JS/AtlasModal.js',
      './JS/atlasWorkflow.js',
      './JS/AtlasLogistica.js'
    ],
    fiscal:[
      './JS/AtlasModal.js',
      './JS/atlasWorkflow.js',
      './JS/AtlasFiscal.js'
    ],
    scanner:[
      'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js',
      './JS/AtlasModal.js',
      './JS/atlasWorkflow.js',
      './JS/AtlasLogistica.js',
      './JS/AtlasFiscal.js',
      './JS/AtlasSeparacaoQR.js'
    ],
    visual:[
      './JS/bdrUppercase.js',
      './JS/AtlasMotion.js',
      './JS/bdrMenuMobileAtivo.js',
      './JS/atlasTopbar.js'
    ],
    pwa:['./JS/pwa-update.js']
  };

  function carregarScript(src){
    if(carregados.has(src)) return carregados.get(src);

    const urlCompleta = new URL(src,location.href).href;
    const existente = [...document.scripts].find(s=>s.src===urlCompleta);

    if(existente){
      const p = Promise.resolve(src);
      carregados.set(src,p);
      return p;
    }

    const p = new Promise((resolve,reject)=>{
      const s = document.createElement('script');
      s.src = src;
      s.async = false;
      s.onload = ()=>resolve(src);
      s.onerror = ()=>{
        carregados.delete(src);
        reject(new Error('Falha ao carregar '+src));
      };
      document.head.appendChild(s);
    });

    carregados.set(src,p);
    return p;
  }

  async function modulo(nome){
    const lista = base[nome] || [];
    for(const src of lista) await carregarScript(src);
    return true;
  }

  function esconderLoading(){
    const el=document.getElementById('atlasExpedicaoLoading');
    if(el){
      el.classList.add('oculto');
      setTimeout(()=>el.remove(),250);
    }
  }

  async function prepararAba(nome){
    if(nome==='solicitacoes') await modulo('fiscal');
    if(nome==='separacao') await modulo('scanner');
    if(nome==='retirada'||nome==='transito') await modulo('logistica');
    return true;
  }

  function instalarAbaLazy(){
    const original=global.abrirAba;
    if(typeof original!=='function') return;

    global.abrirAba=async function(nome,btn){
      try{
        await prepararAba(nome);
      }catch(e){
        console.error(e);
        try{
          await modulo('modal');
          global.AtlasModal?.erro?.(
            'Não foi possível carregar esta etapa: '+(e?.message||e)
          );
        }catch(_){}
        return false;
      }

      return original(nome,btn);
    };
  }

  function instalarAcoesLazy(){
    const mapa={
      iniciarSeparacaoAtlas:'scanner',
      abrirSeparacaoQR:'scanner',
      finalizarSeparacaoAtlas:'logistica',
      enviarPedidoAtlas:'logistica',
      receberPedidoAtlas:'logistica',
      abrirDadosFiscais:'fiscal',
      autorizarTodosAtlas:'fiscal',
      confirmarAprovacaoParcialAtlas:'fiscal',
      recusarTodosAtlas:'workflow'
    };

    Object.entries(mapa).forEach(([nome,mod])=>{
      let tentativas=0;

      const t=setInterval(()=>{
        tentativas++;

        const original=global[nome];

        if(typeof original==='function'&&!original.__lazy){
          const fn=async function(...args){
            try{
              await modulo(mod);
              return await original.apply(this,args);
            }catch(e){
              console.error('Falha na ação '+nome,e);
              try{
                await modulo('modal');
                global.AtlasModal?.erro?.(e?.message||String(e));
              }catch(_){}
              return false;
            }
          };

          fn.__lazy=true;
          fn.__original=original;
          global[nome]=fn;
          clearInterval(t);
        }else if(tentativas>60){
          clearInterval(t);
        }
      },100);
    });
  }

  async function iniciar(){
    try{
      if(typeof global.verificarLogin==='function') global.verificarLogin();

      await carregarScript('./JS/expedicao/expedicaoCore.js');

      instalarAbaLazy();
      instalarAcoesLazy();
      esconderLoading();

      const aba=new URLSearchParams(location.search).get('aba');

      if(aba){
        const btn=[...document.querySelectorAll('.tab-btn')]
          .find(b=>(b.getAttribute('onclick')||'').includes("'"+aba+"'"));

        await global.abrirAba?.(aba,btn||null);
      }

      const idle=global.requestIdleCallback||((fn)=>setTimeout(fn,800));
      idle(()=>modulo('visual').catch(console.warn));
      idle(()=>modulo('pwa').catch(console.warn));

      console.log(
        '✅ ATLAS EXPEDIÇÃO NOVA V1.2 carregada — Fiscal e Workflow sob demanda'
      );
    }catch(e){
      esconderLoading();
      console.error('Atlas Expedição Nova: falha na inicialização',e);

      try{
        await modulo('modal');
        global.AtlasModal?.erro?.(
          'Não foi possível abrir a Expedição: '+(e?.message||e)
        );
      }catch(_){}
    }
  }

  global.AtlasExpedicaoLoader={
    __loaded:true,
    versao:'1.2-fiscal-workflow-lazy',
    modulo,
    prepararAba,
    iniciar
  };

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',iniciar,{once:true});
  }else{
    iniciar();
  }
})(window);
