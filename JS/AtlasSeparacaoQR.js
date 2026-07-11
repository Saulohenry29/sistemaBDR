/* =========================================================
   ATLAS SEPARAÇÃO QR V1.0
   Arquivo: JS/AtlasSeparacaoQR.js

   Fluxo operacional:
   1. Ler QR da posição
   2. Ler QR do item
   3. Confirmar quantidade
   4. Registrar operador/data
   5. Avançar para o próximo item
   6. Concluir pedido apenas quando tudo estiver conferido

   Compatível com:
   - câmera traseira via BarcodeDetector;
   - leitor USB/Bluetooth que digita como teclado;
   - digitação manual.
========================================================= */
(function(){
  "use strict";

  if(window.AtlasSeparacaoQR?.__loaded) return;

  const AtlasSeparacaoQR = {
    __loaded:true,
    versao:"1.0-separacao-guiada"
  };

  const estado = {
    pedido:null,
    itens:[],
    indice:0,
    etapa:"ENDERECO",
    enderecoLido:null,
    itemLido:null,
    stream:null,
    detector:null,
    cameraAtiva:false,
    loopId:null,
    bloqueado:false
  };

  function db(){
    return window.client || window.supabaseClient || window.clientSupabase || globalThis.client;
  }

  function usuarioAtual(){
    try{
      return JSON.parse(
        localStorage.getItem("usuario_logado") ||
        localStorage.getItem("usuarioLogado") ||
        localStorage.getItem("usuarioAtual") ||
        "null"
      );
    }catch(e){ return null; }
  }

  function nomeUsuario(){
    const u = usuarioAtual();
    return u?.nome || u?.usuario || "SISTEMA";
  }

  function esc(v){
    return String(v ?? "").replace(/[&<>'"]/g, c => ({
      "&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"
    }[c]));
  }

  function normalizarCodigo(v){
    return String(v || "")
      .trim()
      .toUpperCase()
      .replace(/\s+/g,"")
      .replace(/^END[-_:]?/,"")
      .replace(/^QR[-_:]?/,"");
  }

  function codigoEnderecoQR(v){
    const n = normalizarCodigo(v);
    return n ? "END-" + n : "";
  }

  function numero(v, fallback=0){
    const n = Number(String(v ?? "").replace(",","."));
    return Number.isFinite(n) ? n : fallback;
  }

  function itemAtual(){
    return estado.itens[estado.indice] || null;
  }

  function itemConferido(i){
    const solicitado = Math.max(1, numero(i?.quantidade, 1));
    const separado = Math.max(0, numero(i?.quantidade_separada, 0));
    return separado >= solicitado &&
      ["SEPARADO","AGUARDANDO_RETIRADA"].includes(String(i?.status || "").toUpperCase());
  }

  function itensPendentes(){
    return estado.itens.filter(i => !itemConferido(i));
  }

  function garantirCss(){
    if(document.getElementById("atlasSeparacaoQrCss")) return;
    const style = document.createElement("style");
    style.id = "atlasSeparacaoQrCss";
    style.textContent = `
      .asq-overlay{
        position:fixed;inset:0;z-index:99999999;
        background:rgba(15,23,42,.72);
        display:flex;align-items:center;justify-content:center;
        padding:12px;backdrop-filter:blur(8px);
      }
      .asq-shell{
        width:min(780px,100%);max-height:96vh;overflow:hidden;
        background:#f8fafc;border-radius:24px;
        box-shadow:0 28px 90px rgba(0,0,0,.38);
        display:grid;grid-template-rows:auto auto 1fr auto;
        border:1px solid rgba(255,255,255,.5);
      }
      .asq-head{
        background:linear-gradient(135deg,#111827,#1e293b);
        color:#fff;padding:16px;display:flex;align-items:center;
        justify-content:space-between;gap:12px;
      }
      .asq-head h2{margin:0;font-size:18px;font-weight:950}
      .asq-head small{display:block;color:#cbd5e1;margin-top:3px;font-weight:750}
      .asq-close{
        width:42px;height:42px;border:0;border-radius:13px;
        background:#fff;color:#b91c1c;font-size:22px;font-weight:950;
      }
      .asq-progress-wrap{padding:12px 16px;background:#fff;border-bottom:1px solid #e2e8f0}
      .asq-progress-top{display:flex;justify-content:space-between;gap:8px;font-size:12px;font-weight:900;color:#475569}
      .asq-progress{height:10px;background:#e2e8f0;border-radius:999px;overflow:hidden;margin-top:8px}
      .asq-progress > div{height:100%;background:linear-gradient(90deg,#2563eb,#16a34a);transition:.25s}
      .asq-body{overflow:auto;padding:16px}
      .asq-item{
        background:#fff;border:1px solid #e2e8f0;border-radius:18px;
        padding:14px;box-shadow:0 5px 20px rgba(15,23,42,.06)
      }
      .asq-title{font-size:19px;font-weight:950;color:#0f172a;line-height:1.25}
      .asq-code{font-size:12px;color:#64748b;font-weight:850;margin-top:4px;overflow-wrap:anywhere}
      .asq-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:12px}
      .asq-mini{background:#f8fafc;border:1px solid #eef2f7;border-radius:13px;padding:10px}
      .asq-mini small{display:block;color:#64748b;font-size:10px;font-weight:900;text-transform:uppercase}
      .asq-mini b{display:block;color:#0f172a;font-size:13px;margin-top:3px;overflow-wrap:anywhere}
      .asq-step{
        margin-top:14px;border-radius:16px;padding:13px;
        border:1px solid #bfdbfe;background:#eff6ff;color:#1e3a8a
      }
      .asq-step.ok{border-color:#86efac;background:#f0fdf4;color:#166534}
      .asq-step.erro{border-color:#fca5a5;background:#fef2f2;color:#991b1b}
      .asq-step-title{font-weight:950;font-size:14px}
      .asq-step-text{font-size:12px;font-weight:750;margin-top:4px;line-height:1.45}
      .asq-reader{display:grid;grid-template-columns:1fr auto;gap:8px;margin-top:10px}
      .asq-reader input{
        width:100%;height:44px;border:1px solid #cbd5e1;border-radius:12px;
        padding:0 12px;font-size:16px;font-weight:900;text-transform:uppercase
      }
      .asq-btn{
        border:0;border-radius:12px;padding:11px 14px;
        font-weight:950;cursor:pointer;display:inline-flex;
        align-items:center;justify-content:center;gap:7px
      }
      .asq-btn-blue{background:#2563eb;color:#fff}
      .asq-btn-green{background:#16a34a;color:#fff}
      .asq-btn-dark{background:#111827;color:#fff}
      .asq-btn-light{background:#fff;color:#0f172a;border:1px solid #cbd5e1}
      .asq-btn-red{background:#dc2626;color:#fff}
      .asq-btn:disabled{opacity:.45;cursor:not-allowed}
      .asq-camera{
        margin-top:12px;background:#020617;border-radius:16px;overflow:hidden;
        position:relative;display:none;min-height:230px
      }
      .asq-camera.ativo{display:block}
      .asq-camera video{width:100%;height:280px;object-fit:cover;display:block}
      .asq-camera-line{
        position:absolute;left:8%;right:8%;top:50%;height:2px;
        background:#22c55e;box-shadow:0 0 16px #22c55e;
        animation:asqScan 1.6s ease-in-out infinite
      }
      @keyframes asqScan{0%,100%{transform:translateY(-70px)}50%{transform:translateY(70px)}}
      .asq-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
      .asq-qtd{display:flex;align-items:center;gap:9px;margin-top:10px}
      .asq-qtd button{width:42px;height:42px;border-radius:12px;border:1px solid #bfdbfe;background:#fff;color:#1d4ed8;font-size:22px;font-weight:950}
      .asq-qtd input{width:100px;height:44px;border:1px solid #93c5fd;border-radius:12px;text-align:center;font-size:18px;font-weight:950}
      .asq-foot{
        padding:12px 16px;background:#fff;border-top:1px solid #e2e8f0;
        display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap
      }
      .asq-toast{
        position:fixed;left:50%;top:18px;transform:translateX(-50%) translateY(-10px);
        z-index:100000000;background:#111827;color:#fff;border-radius:999px;
        padding:11px 16px;font-size:13px;font-weight:950;
        opacity:0;pointer-events:none;transition:.2s;
        box-shadow:0 15px 38px rgba(0,0,0,.25)
      }
      .asq-toast.ativo{opacity:1;transform:translateX(-50%) translateY(0)}
      .asq-toast.ok{background:#166534}.asq-toast.erro{background:#991b1b}
      @media(max-width:640px){
        .asq-overlay{padding:0}
        .asq-shell{width:100%;height:100%;max-height:none;border-radius:0}
        .asq-grid{grid-template-columns:1fr}
        .asq-reader{grid-template-columns:1fr}
        .asq-camera video{height:240px}
        .asq-foot .asq-btn{flex:1}
      }
    `;
    document.head.appendChild(style);
  }

  function audioCtx(){
    try{
      window.__atlasSeparacaoAudio =
        window.__atlasSeparacaoAudio ||
        new (window.AudioContext || window.webkitAudioContext)();
      return window.__atlasSeparacaoAudio;
    }catch(e){ return null; }
  }

  function tom(freq, inicio, duracao, volume=.16){
    const ctx = audioCtx();
    if(!ctx) return;
    const osc = ctx.createOscillator();
    const ganho = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    ganho.gain.setValueAtTime(0.0001, ctx.currentTime + inicio);
    ganho.gain.exponentialRampToValueAtTime(volume, ctx.currentTime + inicio + .01);
    ganho.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + inicio + duracao);
    osc.connect(ganho); ganho.connect(ctx.destination);
    osc.start(ctx.currentTime + inicio);
    osc.stop(ctx.currentTime + inicio + duracao + .03);
  }

  function somSucesso(){
    tom(880,0,.09); tom(1175,.12,.11);
    try{ navigator.vibrate?.([60]); }catch(e){}
  }

  function somErro(){
    tom(220,0,.18,.22); tom(165,.22,.24,.22);
    try{ navigator.vibrate?.([180,80,180]); }catch(e){}
  }

  function somItem(){
    tom(660,0,.08); tom(880,.1,.08); tom(1320,.2,.14);
    try{ navigator.vibrate?.([55,40,55]); }catch(e){}
  }

  function somPedido(){
    tom(523,0,.12); tom(659,.14,.12); tom(784,.28,.12); tom(1047,.42,.25);
    try{ navigator.vibrate?.([80,50,80,50,180]); }catch(e){}
  }

  function toast(msg,tipo=""){
    garantirCss();
    let el = document.getElementById("asqToast");
    if(!el){
      el = document.createElement("div");
      el.id = "asqToast";
      el.className = "asq-toast";
      document.body.appendChild(el);
    }
    el.className = "asq-toast " + tipo;
    el.textContent = msg;
    el.classList.add("ativo");
    clearTimeout(window.__asqToastTimer);
    window.__asqToastTimer = setTimeout(()=>el.classList.remove("ativo"),1900);
  }

  async function carregarPedido(pedidoId){
    const banco = db();
    if(!banco) throw new Error("Supabase não carregado.");

    const pedidoResp = await banco
      .from("pedidos_retirada")
      .select("*")
      .eq("id",pedidoId)
      .maybeSingle();

    if(pedidoResp.error) throw pedidoResp.error;
    if(!pedidoResp.data) throw new Error("Pedido não encontrado.");

    const itensResp = await banco
      .from("itens_retirada")
      .select("*")
      .eq("pedido_id",pedidoId)
      .order("id",{ascending:true});

    if(itensResp.error) throw itensResp.error;

    const itensBase = (itensResp.data || [])
      .filter(i => !["RECUSADO","CANCELADO"].includes(String(i.status || "").toUpperCase()));

    const produtoIds = [...new Set(itensBase.map(i=>Number(i.produto_id)).filter(Boolean))];
    const patrimonioIds = [...new Set(itensBase.map(i=>Number(i.patrimonio_id)).filter(Boolean))];

    let produtos = [];
    let patrimonios = [];

    if(produtoIds.length){
      const r = await banco
        .from("estoque_produtos")
        .select("*")
        .in("id",produtoIds);
      if(r.error) throw r.error;
      produtos = r.data || [];
    }

    if(patrimonioIds.length){
      const r = await banco
        .from("patrimonio")
        .select("*")
        .in("id",patrimonioIds);
      if(r.error) throw r.error;
      patrimonios = r.data || [];
    }

    const mapaProd = new Map(produtos.map(p=>[String(p.id),p]));
    const mapaPat = new Map(patrimonios.map(p=>[String(p.id),p]));

    const itens = itensBase.map(i => {
      const produto = mapaProd.get(String(i.produto_id || ""));
      const patrimonio = mapaPat.get(String(i.patrimonio_id || ""));
      const enderecoEsperado =
        i.endereco_codigo ||
        produto?.localizacao_fisica ||
        patrimonio?.endereco_codigo ||
        patrimonio?.localizacao_fisica ||
        patrimonio?.localizacao ||
        "";

      const codigosValidos = [
        i.patrimonio_codigo,
        produto?.codigo,
        produto?.codigo_qr,
        patrimonio?.codigo_qr,
        patrimonio?.codigo_bem,
        patrimonio?.etiqueta,
        patrimonio?.codigo_antigo
      ].filter(Boolean).map(normalizarCodigo);

      return {
        ...i,
        produto,
        patrimonio,
        endereco_esperado:enderecoEsperado,
        codigos_validos:[...new Set(codigosValidos)]
      };
    });

    estado.pedido = pedidoResp.data;
    estado.itens = itens;
    estado.indice = Math.max(0,itens.findIndex(i=>!itemConferido(i)));
    if(estado.indice < 0) estado.indice = 0;
    estado.etapa = "ENDERECO";
    estado.enderecoLido = null;
    estado.itemLido = null;
  }

  function nomeItem(i){
    return i?.patrimonio_nome ||
      i?.produto?.descricao ||
      i?.patrimonio?.nome_bem ||
      i?.patrimonio_codigo ||
      "Item";
  }

  function codigoItem(i){
    return i?.patrimonio_codigo ||
      i?.produto?.codigo ||
      i?.produto?.codigo_qr ||
      i?.patrimonio?.codigo_qr ||
      ("ITEM-" + (i?.id || "-"));
  }

  function progresso(){
    const total = estado.itens.length;
    const concluidos = estado.itens.filter(itemConferido).length;
    const percentual = total ? Math.round((concluidos/total)*100) : 0;
    return {total,concluidos,percentual};
  }

  function etapaHtml(i){
    const endereco = normalizarCodigo(i?.endereco_esperado);
    const semEndereco = !endereco;
    const etapaEnderecoOk = estado.etapa !== "ENDERECO";
    const etapaItemOk = estado.etapa === "QUANTIDADE" || itemConferido(i);

    return `
      <div class="asq-step ${etapaEnderecoOk ? "ok" : ""}" id="asqStepEndereco">
        <div class="asq-step-title">${etapaEnderecoOk ? "✅" : "1️⃣"} Conferir posição</div>
        <div class="asq-step-text">
          ${semEndereco
            ? "Este item não possui endereço cadastrado. Use a opção Confirmar sem endereço somente após localizar fisicamente o item."
            : `Leia o QR <b>${esc(codigoEnderecoQR(endereco))}</b>.`
          }
        </div>
        ${!etapaEnderecoOk ? `
          <div class="asq-reader">
            <input id="asqCodigoEndereco" autocomplete="off" placeholder="Bipe ou digite o QR da posição">
            <button class="asq-btn asq-btn-blue" onclick="AtlasSeparacaoQR.validarEndereco()">Confirmar</button>
          </div>
          <div class="asq-actions">
            <button class="asq-btn asq-btn-dark" onclick="AtlasSeparacaoQR.abrirCamera('ENDERECO')">📷 Abrir câmera</button>
            ${semEndereco ? `<button class="asq-btn asq-btn-light" onclick="AtlasSeparacaoQR.confirmarSemEndereco()">Continuar sem endereço</button>` : ""}
          </div>` : `
          <div class="asq-step-text">Posição lida: <b>${esc(estado.enderecoLido || endereco)}</b></div>`
        }
      </div>

      <div class="asq-step ${etapaItemOk ? "ok" : ""}" id="asqStepItem">
        <div class="asq-step-title">${etapaItemOk ? "✅" : "2️⃣"} Conferir item</div>
        <div class="asq-step-text">
          ${etapaEnderecoOk
            ? `Leia o QR/código do item <b>${esc(codigoItem(i))}</b>.`
            : "Aguardando a confirmação da posição."
          }
        </div>
        ${etapaEnderecoOk && !etapaItemOk ? `
          <div class="asq-reader">
            <input id="asqCodigoItem" autocomplete="off" placeholder="Bipe ou digite o QR do item">
            <button class="asq-btn asq-btn-blue" onclick="AtlasSeparacaoQR.validarItem()">Confirmar</button>
          </div>
          <div class="asq-actions">
            <button class="asq-btn asq-btn-dark" onclick="AtlasSeparacaoQR.abrirCamera('ITEM')">📷 Abrir câmera</button>
          </div>` : ""
        }
      </div>

      <div class="asq-step ${itemConferido(i) ? "ok" : ""}" id="asqStepQtd">
        <div class="asq-step-title">${itemConferido(i) ? "✅" : "3️⃣"} Confirmar quantidade</div>
        <div class="asq-step-text">
          ${etapaItemOk
            ? "Confira fisicamente a quantidade antes de concluir este item."
            : "Aguardando a leitura do item."
          }
        </div>
        ${etapaItemOk && !itemConferido(i) ? `
          <div class="asq-qtd">
            <button onclick="AtlasSeparacaoQR.ajustarQuantidade(-1)">−</button>
            <input id="asqQtdSeparada" type="number" min="0" max="${Math.max(1,numero(i.quantidade,1))}" step="1" value="${Math.max(1,numero(i.quantidade,1))}">
            <button onclick="AtlasSeparacaoQR.ajustarQuantidade(1)">+</button>
            <b>de ${Math.max(1,numero(i.quantidade,1))}</b>
          </div>
          <div class="asq-actions">
            <button class="asq-btn asq-btn-green" onclick="AtlasSeparacaoQR.confirmarItem()">✅ Confirmar item</button>
          </div>` : ""
        }
      </div>
    `;
  }

  function render(){
    garantirCss();
    const root = document.getElementById("atlasSeparacaoQrRoot");
    if(!root) return;

    const p = estado.pedido;
    const i = itemAtual();
    const prog = progresso();

    if(!p){
      root.innerHTML = "";
      return;
    }

    if(!i){
      root.innerHTML = `
        <div class="asq-overlay">
          <div class="asq-shell">
            <div class="asq-head">
              <div><h2>Separação guiada</h2><small>Pedido sem itens válidos</small></div>
              <button class="asq-close" onclick="AtlasSeparacaoQR.fechar()">×</button>
            </div>
            <div class="asq-body"><div class="asq-step erro">Nenhum item disponível para separação.</div></div>
          </div>
        </div>`;
      return;
    }

    root.innerHTML = `
      <div class="asq-overlay">
        <div class="asq-shell">
          <div class="asq-head">
            <div>
              <h2>📦 Separação guiada</h2>
              <small>${esc("PED-" + p.id)} • ${esc(p.codigo || "")}</small>
            </div>
            <button class="asq-close" onclick="AtlasSeparacaoQR.fechar()">×</button>
          </div>

          <div class="asq-progress-wrap">
            <div class="asq-progress-top">
              <span>${prog.concluidos} de ${prog.total} item(ns) conferido(s)</span>
              <span>${prog.percentual}%</span>
            </div>
            <div class="asq-progress"><div style="width:${prog.percentual}%"></div></div>
          </div>

          <div class="asq-body">
            <div class="asq-item">
              <div class="asq-title">${esc(nomeItem(i))}</div>
              <div class="asq-code">${esc(codigoItem(i))}</div>

              <div class="asq-grid">
                <div class="asq-mini"><small>Item</small><b>${estado.indice+1} de ${estado.itens.length}</b></div>
                <div class="asq-mini"><small>Solicitado</small><b>${Math.max(1,numero(i.quantidade,1))}</b></div>
                <div class="asq-mini"><small>Endereço</small><b>${esc(i.endereco_esperado || "Não cadastrado")}</b></div>
              </div>

              ${etapaHtml(i)}
              <div class="asq-camera" id="asqCameraBox">
                <video id="asqVideo" playsinline muted></video>
                <div class="asq-camera-line"></div>
              </div>
            </div>
          </div>

          <div class="asq-foot">
            <button class="asq-btn asq-btn-light" onclick="AtlasSeparacaoQR.anterior()" ${estado.indice<=0?"disabled":""}>← Anterior</button>
            <button class="asq-btn asq-btn-dark" onclick="AtlasSeparacaoQR.proximo()" ${estado.indice>=estado.itens.length-1?"disabled":""}>Próximo →</button>
            <button class="asq-btn asq-btn-green" onclick="AtlasSeparacaoQR.concluirPedido()" ${prog.concluidos<prog.total?"disabled":""}>Concluir separação</button>
          </div>
        </div>
      </div>`;

    setTimeout(()=>{
      const input = estado.etapa === "ENDERECO"
        ? document.getElementById("asqCodigoEndereco")
        : estado.etapa === "ITEM"
          ? document.getElementById("asqCodigoItem")
          : null;
      input?.focus();
    },80);
  }

  async function abrir(pedidoId){
    try{
      garantirCss();
      fecharCamera();
      let root = document.getElementById("atlasSeparacaoQrRoot");
      if(!root){
        root = document.createElement("div");
        root.id = "atlasSeparacaoQrRoot";
        document.body.appendChild(root);
      }
      root.innerHTML = `<div class="asq-overlay"><div class="asq-shell"><div class="asq-head"><h2>Carregando separação...</h2></div></div></div>`;
      await carregarPedido(pedidoId);
      render();
    }catch(e){
      console.error("AtlasSeparacaoQR:",e);
      toast("Não foi possível abrir a separação: " + (e?.message || e),"erro");
      fechar();
    }
  }

  function fechar(){
    fecharCamera();
    const root = document.getElementById("atlasSeparacaoQrRoot");
    if(root) root.innerHTML = "";
    estado.pedido = null;
    estado.itens = [];
  }

  function marcarErro(id,msg){
    const el = document.getElementById(id);
    if(el){
      el.classList.remove("ok");
      el.classList.add("erro");
      const texto = el.querySelector(".asq-step-text");
      if(texto) texto.innerHTML = esc(msg);
    }
    somErro();
    toast(msg,"erro");
  }

  function validarEndereco(valorForcado){
    const i = itemAtual();
    if(!i) return;
    const lido = normalizarCodigo(valorForcado ?? document.getElementById("asqCodigoEndereco")?.value);
    const esperado = normalizarCodigo(i.endereco_esperado);

    if(!lido){
      marcarErro("asqStepEndereco","Leia ou informe o QR da posição.");
      return;
    }

    if(esperado && lido !== esperado){
      marcarErro("asqStepEndereco",`Posição incorreta. Esperado: ${codigoEnderecoQR(esperado)} • Lido: ${codigoEnderecoQR(lido)}`);
      return;
    }

    estado.enderecoLido = lido;
    estado.etapa = "ITEM";
    fecharCamera();
    somSucesso();
    toast("Posição correta","ok");
    render();
  }

  function confirmarSemEndereco(){
    estado.enderecoLido = "SEM-ENDERECO";
    estado.etapa = "ITEM";
    somSucesso();
    toast("Continuando sem endereço cadastrado","ok");
    render();
  }

  function validarItem(valorForcado){
    const i = itemAtual();
    if(!i) return;
    const lido = normalizarCodigo(valorForcado ?? document.getElementById("asqCodigoItem")?.value);

    if(!lido){
      marcarErro("asqStepItem","Leia ou informe o QR/código do item.");
      return;
    }

    if(!i.codigos_validos.includes(lido)){
      marcarErro("asqStepItem",`Item incorreto. Esperado: ${codigoItem(i)} • Lido: ${lido}`);
      return;
    }

    estado.itemLido = lido;
    estado.etapa = "QUANTIDADE";
    fecharCamera();
    somSucesso();
    toast("Item correto","ok");
    render();
  }

  function ajustarQuantidade(delta){
    const i = itemAtual();
    const input = document.getElementById("asqQtdSeparada");
    if(!i || !input) return;
    const max = Math.max(1,numero(i.quantidade,1));
    const atual = numero(input.value,1);
    input.value = Math.min(max,Math.max(0,atual+numero(delta,0)));
  }

  async function confirmarItem(){
    if(estado.bloqueado) return;
    const banco = db();
    const i = itemAtual();
    if(!banco || !i) return;

    const solicitado = Math.max(1,numero(i.quantidade,1));
    const separado = numero(document.getElementById("asqQtdSeparada")?.value,solicitado);

    if(separado !== solicitado){
      marcarErro("asqStepQtd",`A quantidade precisa ser igual à solicitada. Solicitado: ${solicitado} • Informado: ${separado}.`);
      return;
    }

    estado.bloqueado = true;
    try{
      const agora = new Date().toISOString();
      const operador = nomeUsuario();
      const payload = {
        endereco_codigo: normalizarCodigo(estado.enderecoLido || i.endereco_esperado) || null,
        quantidade_separada: separado,
        usuario_separacao: operador,
        data_separacao: agora,
        usuario_conferencia: operador,
        data_conferencia: agora,
        status:"AGUARDANDO_RETIRADA"
      };

      const { error } = await banco
        .from("itens_retirada")
        .update(payload)
        .eq("id",i.id);

      if(error) throw error;

      Object.assign(i,payload);
      somItem();
      toast("Item conferido e separado","ok");

      const proximoPendente = estado.itens.findIndex((x,idx)=>idx>estado.indice && !itemConferido(x));
      const qualquerPendente = estado.itens.findIndex(x=>!itemConferido(x));

      if(proximoPendente >= 0){
        estado.indice = proximoPendente;
      }else if(qualquerPendente >= 0){
        estado.indice = qualquerPendente;
      }

      estado.etapa = "ENDERECO";
      estado.enderecoLido = null;
      estado.itemLido = null;
      render();
    }catch(e){
      console.error("AtlasSeparacaoQR confirmar item:",e);
      somErro();
      toast("Erro ao salvar item: " + (e?.message || e),"erro");
    }finally{
      estado.bloqueado = false;
    }
  }

  async function concluirPedido(){
    if(estado.bloqueado) return;
    const pendentes = itensPendentes();
    if(pendentes.length){
      somErro();
      toast(`Ainda existem ${pendentes.length} item(ns) pendente(s).`,"erro");
      return;
    }

    estado.bloqueado = true;
    try{
      if(window.AtlasLogistica?.finalizarSeparacao){
        await window.AtlasLogistica.finalizarSeparacao(estado.pedido.id);
      }else if(window.AtlasWorkflow?.finalizarSeparacao){
        await window.AtlasWorkflow.finalizarSeparacao(estado.pedido.id);
      }else{
        throw new Error("Motor de logística não carregado.");
      }

      somPedido();
      toast("Separação concluída com sucesso","ok");
      const pedidoId = estado.pedido.id;
      fechar();

      if(typeof window.carregarTudo === "function"){
        await window.carregarTudo();
      }
      if(typeof window.bdrCarregarNotificacoes === "function"){
        await window.bdrCarregarNotificacoes();
      }

      setTimeout(()=>{
        const proximo = (window.pedidos || []).find(p =>
          Number(p.id) !== Number(pedidoId) &&
          String(p.status || "").toUpperCase() === "EM_SEPARACAO"
        );
        if(proximo){
          toast("Há outro pedido aguardando separação.","");
        }
      },500);
    }catch(e){
      console.error("AtlasSeparacaoQR concluir:",e);
      somErro();
      toast("Erro ao concluir separação: " + (e?.message || e),"erro");
    }finally{
      estado.bloqueado = false;
    }
  }

  function anterior(){
    if(estado.indice <= 0) return;
    estado.indice--;
    estado.etapa = itemConferido(itemAtual()) ? "QUANTIDADE" : "ENDERECO";
    estado.enderecoLido = null;
    estado.itemLido = null;
    fecharCamera();
    render();
  }

  function proximo(){
    if(estado.indice >= estado.itens.length-1) return;
    estado.indice++;
    estado.etapa = itemConferido(itemAtual()) ? "QUANTIDADE" : "ENDERECO";
    estado.enderecoLido = null;
    estado.itemLido = null;
    fecharCamera();
    render();
  }

  async function abrirCamera(tipo){
    const video = document.getElementById("asqVideo");
    const box = document.getElementById("asqCameraBox");
    if(!video || !box) return;

    fecharCamera();

    if(!("BarcodeDetector" in window)){
      somErro();
      toast("A câmera automática não é compatível neste navegador. Use o leitor ou digite o código.","erro");
      return;
    }

    try{
      const formatos = await BarcodeDetector.getSupportedFormats();
      const preferidos = ["qr_code","code_128","code_39","ean_13"].filter(x=>formatos.includes(x));
      estado.detector = new BarcodeDetector({formats:preferidos.length?preferidos:["qr_code"]});
      estado.stream = await navigator.mediaDevices.getUserMedia({
        video:{facingMode:{ideal:"environment"},width:{ideal:1280},height:{ideal:720}},
        audio:false
      });
      video.srcObject = estado.stream;
      await video.play();
      box.classList.add("ativo");
      estado.cameraAtiva = true;

      const detectar = async ()=>{
        if(!estado.cameraAtiva) return;
        try{
          const codigos = await estado.detector.detect(video);
          if(codigos?.length){
            const valor = codigos[0].rawValue || "";
            if(valor){
              if(tipo === "ENDERECO") validarEndereco(valor);
              else validarItem(valor);
              return;
            }
          }
        }catch(e){}
        estado.loopId = requestAnimationFrame(detectar);
      };
      detectar();
    }catch(e){
      console.warn("AtlasSeparacaoQR câmera:",e);
      somErro();
      toast("Não foi possível abrir a câmera. Verifique a permissão.","erro");
      fecharCamera();
    }
  }

  function fecharCamera(){
    estado.cameraAtiva = false;
    if(estado.loopId) cancelAnimationFrame(estado.loopId);
    estado.loopId = null;
    try{ estado.stream?.getTracks()?.forEach(t=>t.stop()); }catch(e){}
    estado.stream = null;
    const box = document.getElementById("asqCameraBox");
    if(box) box.classList.remove("ativo");
  }

  document.addEventListener("keydown",e=>{
    const root = document.getElementById("atlasSeparacaoQrRoot");
    if(!root?.innerHTML) return;

    if(e.key === "Escape"){
      fechar();
      return;
    }

    if(e.key === "Enter"){
      const ativo = document.activeElement;
      if(ativo?.id === "asqCodigoEndereco"){
        e.preventDefault(); validarEndereco();
      }else if(ativo?.id === "asqCodigoItem"){
        e.preventDefault(); validarItem();
      }
    }
  });

  AtlasSeparacaoQR.abrir = abrir;
  AtlasSeparacaoQR.fechar = fechar;
  AtlasSeparacaoQR.validarEndereco = validarEndereco;
  AtlasSeparacaoQR.confirmarSemEndereco = confirmarSemEndereco;
  AtlasSeparacaoQR.validarItem = validarItem;
  AtlasSeparacaoQR.ajustarQuantidade = ajustarQuantidade;
  AtlasSeparacaoQR.confirmarItem = confirmarItem;
  AtlasSeparacaoQR.concluirPedido = concluirPedido;
  AtlasSeparacaoQR.anterior = anterior;
  AtlasSeparacaoQR.proximo = proximo;
  AtlasSeparacaoQR.abrirCamera = abrirCamera;
  AtlasSeparacaoQR.fecharCamera = fecharCamera;
  AtlasSeparacaoQR.normalizarCodigo = normalizarCodigo;

  window.AtlasSeparacaoQR = AtlasSeparacaoQR;
  console.log("✅ ATLAS SEPARAÇÃO QR V1.0 carregado - câmera, leitor e conferência");
})();