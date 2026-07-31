/* =========================================================
   ATLAS EXPEDIÇÃO NOVA — CARREGADOR DE MÓDULOS V1.0
   - Abre a tela com o núcleo mínimo.
   - Carrega scanner, fiscal, logística e reservas sob demanda.
   - Mantém compatibilidade com as funções atuais.
========================================================= */
(function(global){
  'use strict';
  if(global.AtlasExpedicaoLoader?.__loaded) return;

  const carregados=new Map();
  const base={
    modal:['./JS/AtlasModal.js'],
    workflow:['./JS/atlasWorkflow.js'],
    reservas:['./JS/AtlasGestorReservas.js'],
    logistica:['./JS/AtlasLogistica.js','./JS/atlasWorkflow.js'],
    fiscal:['./JS/AtlasFiscal.js','./JS/atlasWorkflow.js'],
    scanner:[
      'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js',
      './JS/AtlasSeparacaoQR.js',
      './JS/AtlasLogistica.js',
      './JS/AtlasFiscal.js',
      './JS/atlasWorkflow.js'
    ],
    visual:['./JS/bdrUppercase.js','./JS/AtlasMotion.js','./JS/bdrMenuMobileAtivo.js','./JS/atlasTopbar.js'],
    pwa:['./JS/pwa-update.js']
  };

  function carregarScript(src){
    if(carregados.has(src)) return carregados.get(src);
    const existente=[...document.scripts].find(s=>s.src===new URL(src,location.href).href);
    if(existente){ const p=Promise.resolve(); carregados.set(src,p); return p; }
    const p=new Promise((resolve,reject)=>{
      const s=document.createElement('script'); s.src=src; s.async=false;
      s.onload=()=>resolve(src); s.onerror=()=>reject(new Error('Falha ao carregar '+src));
      document.head.appendChild(s);
    });
    carregados.set(src,p); return p;
  }

  async function modulo(nome){
    const lista=base[nome]||[];
    for(const src of lista) await carregarScript(src);
    return true;
  }

  function esconderLoading(){
    const el=document.getElementById('atlasExpedicaoLoading');
    if(el){ el.classList.add('oculto'); setTimeout(()=>el.remove(),250); }
  }

  async function prepararAba(nome){
    if(nome==='separacao') await modulo('scanner');
    if(nome==='retirada'||nome==='transito') await modulo('logistica');
    return true;
  }

  function instalarAbaLazy(){
    const original=global.abrirAba;
    if(typeof original!=='function') return;
    global.abrirAba=async function(nome,btn){
      try{ await prepararAba(nome); }catch(e){ console.warn(e); }
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
      abrirDadosFiscais:'fiscal'
    };
    Object.entries(mapa).forEach(([nome,mod])=>{
      let tentativas=0;
      const t=setInterval(()=>{
        tentativas++;
        const original=global[nome];
        if(typeof original==='function'&&!original.__lazy){
          const fn=async function(...args){ await modulo(mod); return original.apply(this,args); };
          fn.__lazy=true; global[nome]=fn; clearInterval(t);
        } else if(tentativas>30) clearInterval(t);
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
        const btn=[...document.querySelectorAll('.tab-btn')].find(b=>(b.getAttribute('onclick')||'').includes("'"+aba+"'"));
        await global.abrirAba?.(aba,btn||null);
      }

      const idle=global.requestIdleCallback||((fn)=>setTimeout(fn,800));
      idle(()=>modulo('visual').catch(console.warn));
      idle(()=>modulo('pwa').catch(console.warn));
      console.log('✅ ATLAS EXPEDIÇÃO NOVA V1 carregada — módulos sob demanda');
    }catch(e){
      esconderLoading();
      console.error('Atlas Expedição Nova: falha na inicialização',e);
      alert('Não foi possível abrir a Expedição Nova: '+(e.message||e));
    }
  }

  global.AtlasExpedicaoLoader={__loaded:true,modulo,prepararAba,iniciar};
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',iniciar,{once:true}); else iniciar();
})(window);
