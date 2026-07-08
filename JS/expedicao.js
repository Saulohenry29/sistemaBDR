/* =========================================================
   ATUALIZADO: EXPEDIÇÃO COM OFFLINE BDR
========================================================= */
/* =========================================================
   BDR ERP - EXPEDIÇÃO MARKETPLACE INTERNO
   Catálogo compacto + carrinho + aprovação + reserva + retirada
========================================================= */
var itensCatalogo = window.itensCatalogo || [];
var carrinho = window.carrinho || [];
window.carrinho = carrinho;
var pedidos = window.pedidos || [];
var obras = window.obras || [];
var filtroAtual = window.filtroAtual || "TODOS";
var pedidoRetiradaAtual = window.pedidoRetiradaAtual || null;

/* =========================================================
   OFFLINE BDR - Expedição
   A tela cria solicitações e muda status mesmo sem internet.
========================================================= */

function ir(p){ window.location.href = p; }
function db(){ return window.client || window.supabaseClient || window.clientSupabase || globalThis.client; }

async function bdrExpOnlineReal(){
  if(navigator.onLine === false) return false;

  // V11.1: a fonte de verdade é o teste real do bdrCore.
  // Não deixe bdrOnline() antigo prender a Expedição em offline fantasma.
  if(typeof window.bdrOnlineReal === "function"){
    try{ return await window.bdrOnlineReal(); }catch(e){ return false; }
  }

  if(typeof window.bdrOnline === "function"){
    try{ return window.bdrOnline() !== false; }catch(e){}
  }

  return navigator.onLine !== false;
}

async function bdrExpOfflineReal(){
  return !(await bdrExpOnlineReal());
}

function bdrExpErroInternet(err){
  const msg = String(err?.message || err || "").toLowerCase();
  return msg.includes("failed to fetch") ||
         msg.includes("internet_disconnected") ||
         msg.includes("networkerror") ||
         msg.includes("err_internet") ||
         msg.includes("err_name_not_resolved");
}

const BDR_EXP_CACHE_KEY = "bdr_expedicao_cache_v1";
const BDR_EXP_STATUS_KEY = "bdr_expedicao_status_offline_v1";

function salvarCacheExpedicao(){
  try{
    localStorage.setItem(BDR_EXP_CACHE_KEY, JSON.stringify({
      itensCatalogo, pedidos, obras, salvo_em:new Date().toISOString()
    }));
  }catch(e){}
}

function carregarCacheExpedicao(){
  try{
    const raw = localStorage.getItem(BDR_EXP_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  }catch(e){ return null; }
}

function statusExpOffline(){
  try{ return JSON.parse(localStorage.getItem(BDR_EXP_STATUS_KEY) || "{}"); }
  catch(e){ return {}; }
}

function salvarStatusExpOffline(obj){
  try{ localStorage.setItem(BDR_EXP_STATUS_KEY, JSON.stringify(obj || {})); }catch(e){}
}

function marcarExpPendente(chave, texto){
  const s = statusExpOffline();
  s[chave] = {texto:texto || "⏳ Salvo offline • aguardando internet", data:new Date().toISOString()};
  salvarStatusExpOffline(s);
  aplicarStatusExpTela();
}

function aplicarStatusExpTela(){
  const btn = document.querySelector(".btn-submit");
  const s = statusExpOffline();
  const total = Object.keys(s).length;

  if(btn && total > 0){
    btn.innerHTML = "⏳ Solicitação salva offline";
    btn.style.background = "#f59e0b";
    btn.title = "Existe solicitação aguardando sincronização.";
  }
}

window.addEventListener("bdrOfflineSincronizado", e => {
  if(e.detail?.tipo === "nova_solicitacao" || e.detail?.tipo === "acao_pedido"){
    salvarStatusExpOffline({});
    setTimeout(aplicarStatusExpTela, 200);
  }
});
document.addEventListener("DOMContentLoaded", () => setTimeout(aplicarStatusExpTela, 700));
function valor(id){ return String(document.getElementById(id)?.value || "").trim(); }
function esc(v){ return String(v ?? "").replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function usuarioAtual(){ try{ const u=localStorage.getItem("usuario_logado") || localStorage.getItem("usuarioLogado"); return u ? JSON.parse(u) : null; }catch(e){ return null; } }

/* =========================================================
   ATLAS CARRINHO PERSISTENTE POR USUÁRIO
   - Mantém carrinho após F5/fechar navegador
   - Salva separado por usuário logado
   - Limpa somente após enviar solicitação com sucesso
========================================================= */
function chaveCarrinhoExpedicao(){
  const u = usuarioAtual() || {};
  const id = u.id || u.usuario_id || u.email || u.usuario || u.nome || "anonimo";
  return "atlas_carrinho_expedicao_" + String(id).replace(/[^a-zA-Z0-9_@.-]/g, "_");
}

function carregarCarrinhoExpedicaoSalvo(){
  try{
    const chave = chaveCarrinhoExpedicao();
    const antigo = "carrinhoExpedicao";
    let raw = localStorage.getItem(chave);

    // Compatibilidade com versões anteriores do Atlas.
    if(!raw){
      raw = localStorage.getItem(antigo);
    }

    const lista = raw ? JSON.parse(raw) : [];
    carrinho = Array.isArray(lista) ? lista : [];
    window.carrinho = carrinho;

    if(carrinho.length){
      localStorage.setItem(chave, JSON.stringify(carrinho));
    }

    return carrinho;
  }catch(e){
    carrinho = [];
    window.carrinho = carrinho;
    return carrinho;
  }
}

function limparCarrinhoExpedicaoSalvo(){
  try{
    localStorage.removeItem(chaveCarrinhoExpedicao());
    localStorage.removeItem("carrinhoExpedicao");
  }catch(e){}
  carrinho = [];
  window.carrinho = carrinho;
}
function perfil(){ return String(usuarioAtual()?.perfil || "").toUpperCase(); }
function perms(){ return String(usuarioAtual()?.permissoes || "").toUpperCase(); }
function podeTudo(){ return ["MASTER","ADMIN"].includes(perfil()) || perms().includes("VER_TODAS_OBRAS"); }
function podeVerOutras(){ return podeTudo() || perms().includes("VER_ESTOQUE_OUTRAS_OBRAS"); }
function podeSolicitarOutras(){ return podeTudo() || perms().includes("SOLICITAR_OUTRAS_OBRAS"); }
function podeAlmoxarife(){ return ["MASTER","ADMIN","ALMOXARIFE","ALMOXARIFADO"].includes(perfil()); }
function dataBR(d){ if(!d) return "-"; const x=new Date(String(d).replace(" ","T")); return isNaN(x.getTime()) ? String(d) : x.toLocaleString("pt-BR"); }
function normalStatus(s){ s = String(s || "").toUpperCase().replaceAll(" ","_"); if(["DISPONIVEL","NO_ESTOQUE"].includes(s)) return "ESTOQUE"; return s; }
function rotStatus(s){ const m={ESTOQUE:"ESTOQUE",DISPONIVEL:"ESTOQUE",NO_ESTOQUE:"ESTOQUE",EM_USO:"EM USO",MANUTENCAO:"MANUTENÇÃO",BAIXADO:"BAIXADO",QUEBRADO:"QUEBRADO",RESERVADO:"RESERVADO"}; return m[String(s||"").toUpperCase().replaceAll(" ","_")] || s || "-"; }
function statusClass(s){ return "st-" + String(s || "").toUpperCase().replaceAll(" ","_"); }
function nomeObra(id){ const o=obras.find(x=>String(x.id)===String(id)); return o ? `${o.codigo_obra || "-"} - ${o.nome || "-"}` : "Sem obra"; }
function obraCurta(id, fallback){ const txt = fallback || nomeObra(id); return txt.replace(/^\d+\s*-\s*/,'').slice(0,28); }
function fotoItem(i){ return i.foto_url || i.imagem_url || ""; }
function placeholderIcon(i){ const t = `${i.nome || i.descricao || ""}`.toLowerCase(); if(t.includes("furadeira")||t.includes("parafusadeira")) return "🔩"; if(t.includes("notebook")||t.includes("computador")) return "💻"; if(t.includes("impressora")) return "🖨️"; if(t.includes("solda")) return "⚡"; if(t.includes("capacete")) return "⛑️"; if(t.includes("cadeira")) return "🪑"; return "📦"; }
function carregarTopo(){ const u=usuarioAtual(); document.getElementById("usuarioNome").innerText = u ? "Olá, " + (u.nome || "usuário") : "Olá, usuário"; document.getElementById("usuarioPerfil").innerText = u ? (u.perfil || "-") : "-"; }
function toggleMenuUsuario(e){ e?.stopPropagation(); document.getElementById("dropdownUser")?.classList.toggle("ativo"); document.getElementById("notifDropdown")?.classList.remove("ativo"); }
function toggleNotificacoes(e){ e?.stopPropagation(); document.getElementById("notifDropdown")?.classList.toggle("ativo"); document.getElementById("dropdownUser")?.classList.remove("ativo"); }
document.addEventListener("click",()=>{document.getElementById("dropdownUser")?.classList.remove("ativo");document.getElementById("notifDropdown")?.classList.remove("ativo");});

function abrirAba(nome, btn){ document.querySelectorAll(".tab").forEach(t=>t.classList.remove("active")); document.getElementById("tab-"+nome)?.classList.add("active"); document.querySelectorAll(".tab-btn").forEach(b=>b.classList.remove("active")); btn?.classList.add("active"); renderizarPedidos(); }
function filtrarStatus(st, btn){ filtroAtual = st; document.querySelectorAll(".chip-exp").forEach(b=>b.classList.remove("active")); btn?.classList.add("active"); renderizarCatalogo(); }

async function carregarTudo(){
  if(!db()){ alert("Supabase não carregado."); return; }

  carregarTopo();
  carregarCarrinhoExpedicaoSalvo();

  const onlineReal = await bdrExpOnlineReal();

  if(!onlineReal){
    const cache = carregarCacheExpedicao();
    if(cache){
      itensCatalogo = cache.itensCatalogo || [];
      pedidos = cache.pedidos || [];
      obras = cache.obras || [];
      window.itensCatalogo = itensCatalogo;
      window.pedidos = pedidos;
      window.obras = obras;
      renderizarTudo();
      console.log("📦 Expedição carregada do cache local.");
      return;
    }

    alert("Sem internet e sem cache da expedição. Abra uma vez com internet.");
    return;
  }

  try{
    const ob = await db().from("obras").select("*").eq("ativa",true).order("nome");
    obras = ob.data || [];
    await Promise.all([carregarCatalogo(), carregarPedidos()]);
    salvarCacheExpedicao();
    window.itensCatalogo = itensCatalogo;
    window.pedidos = pedidos;
    window.obras = obras;
    renderizarTudo();
  }catch(e){
    if(bdrExpErroInternet(e)){
      const cache = carregarCacheExpedicao();
      if(cache){
        itensCatalogo = cache.itensCatalogo || [];
        pedidos = cache.pedidos || [];
        obras = cache.obras || [];
        renderizarTudo();
        return;
      }
    }
    throw e;
  }
}


/* =========================================================
   ATLAS SPRINT 2.8.1 - DISPONIBILIDADE REAL DO CATÁLOGO
   Se um patrimônio/item já foi aprovado/reservado em um pedido,
   ele aparece como RESERVADO mesmo que a tabela patrimonio ainda
   esteja com status ESTOQUE.
========================================================= */
async function aplicarReservasNoCatalogoAtlas(lista){
  try{
    if(!Array.isArray(lista) || !lista.length || !db()) return lista;

    const idsPat = lista
      .filter(i => i.patrimonio_id)
      .map(i => Number(i.patrimonio_id))
      .filter(Boolean);

    const idsProd = lista
      .filter(i => i.produto_id && !i.patrimonio_id)
      .map(i => Number(i.produto_id))
      .filter(Boolean);

    if(!idsPat.length && !idsProd.length) return lista;

    const statusBloqueantes = [
      "APROVADO",
      "RESERVADO",
      "EM_SEPARACAO",
      "AGUARDANDO_RETIRADA",
      "AGUARDANDO_CONFIRMACAO",
      "EM_TRANSITO"
    ];

    let reservas = [];

    if(idsPat.length){
      const rPat = await db()
        .from("itens_retirada")
        .select("id,pedido_id,patrimonio_id,produto_id,status,obra_destino_id,patrimonio_codigo,patrimonio_nome")
        .in("patrimonio_id", idsPat)
        .in("status", statusBloqueantes);
      if(!rPat.error && Array.isArray(rPat.data)) reservas.push(...rPat.data);
    }

    if(idsProd.length){
      const rProd = await db()
        .from("itens_retirada")
        .select("id,pedido_id,patrimonio_id,produto_id,status,obra_destino_id,patrimonio_codigo,patrimonio_nome")
        .in("produto_id", idsProd)
        .in("status", statusBloqueantes);
      if(!rProd.error && Array.isArray(rProd.data)) reservas.push(...rProd.data);
    }

    if(!reservas.length) return lista;

    const pedidoIds = [...new Set(reservas.map(r => Number(r.pedido_id)).filter(Boolean))];
    let pedidosMap = {};

    if(pedidoIds.length){
      const rp = await db()
        .from("pedidos_retirada")
        .select("id,codigo,status,obra_nome,obra_destino_id,obra_origem_id,solicitante")
        .in("id", pedidoIds);
      if(!rp.error && Array.isArray(rp.data)){
        rp.data.forEach(p => pedidosMap[String(p.id)] = p);
      }
    }

    const reservaPorPat = {};
    const reservaPorProd = {};

    reservas.forEach(r => {
      const pedido = pedidosMap[String(r.pedido_id)] || {};
      const info = {
        ...r,
        pedido_codigo: pedido.codigo || ("PED-" + r.pedido_id),
        pedido_visual: "PED-" + r.pedido_id,
        pedido_status: pedido.status || r.status,
        solicitante: pedido.solicitante || "-",
        destino_nome: pedido.obra_nome || nomeObra(pedido.obra_destino_id || r.obra_destino_id),
        origem_id: pedido.obra_origem_id || null,
        destino_id: pedido.obra_destino_id || r.obra_destino_id || null
      };

      if(r.patrimonio_id && !reservaPorPat[String(r.patrimonio_id)]) reservaPorPat[String(r.patrimonio_id)] = info;
      if(r.produto_id && !reservaPorProd[String(r.produto_id)]) reservaPorProd[String(r.produto_id)] = info;
    });

    return lista.map(i => {
      const res = i.patrimonio_id ? reservaPorPat[String(i.patrimonio_id)] : reservaPorProd[String(i.produto_id)];
      if(!res) return i;

      return {
        ...i,
        status:"RESERVADO",
        reservado_atlas:true,
        reserva_atlas:res,
        reserva_pedido_id:res.pedido_id,
        reserva_pedido_visual:res.pedido_visual,
        reserva_destino_nome:res.destino_nome,
        reserva_solicitante:res.solicitante
      };
    });
  }catch(e){
    console.warn("Atlas Expedição: falha ao aplicar reservas no catálogo:", e?.message || e);
    return lista;
  }
}

async function carregarCatalogo(){
  const u = usuarioAtual();
  let lista = [];

  const pat = await db().from("patrimonio").select("*").in("status",["ESTOQUE","NO ESTOQUE","DISPONIVEL","EM_USO","MANUTENCAO","RESERVADO"]).order("id",{ascending:false}).limit(1000);
  if(!pat.error){
    lista.push(...(pat.data || []).map(p=>({
      origem_tabela:"patrimonio", id:p.id, codigo:p.codigo_qr, nome:p.nome_bem || "Patrimônio", descricao:p.nome_bem || "Patrimônio", tipo:"PATRIMONIO",
      status:normalStatus(p.status), qtd:1, obra_id:p.obra_id, empresa_id:p.empresa_id, obra_nome:p.localizacao || nomeObra(p.obra_id),
      localizacao:p.localizacao_fisica || p.endereco_codigo || p.localizacao || "-", marca:p.marca, modelo:p.modelo, valor:p.valor_bem, foto_url:p.foto_url,
      estado:p.estado_conservacao || "-", patrimonio_id:p.id, raw:p
    })));
  }

  const est = await db().from("estoque_produtos").select("*").in("status",["DISPONIVEL","ESTOQUE","NO ESTOQUE","EM_USO","MANUTENCAO","RESERVADO"]).order("id",{ascending:false}).limit(1000);
  if(!est.error){
    lista.push(...(est.data || []).map(p=>({
      origem_tabela:"estoque_produtos", id:p.id, codigo:p.codigo, nome:p.descricao || p.produto || "Produto", descricao:p.descricao || p.produto || "Produto", tipo:p.tipo_controle || "CONSUMO",
      status:normalStatus(p.status), qtd:Number(p.quantidade || p.qtd || 0), obra_id:p.obra_id, empresa_id:p.empresa_id, obra_nome:nomeObra(p.obra_id),
      localizacao:p.localizacao_fisica || [p.rua,p.prateleira,p.coluna,p.nivel].filter(Boolean).join("-") || "-", marca:p.marca, modelo:p.modelo, valor:p.valor_unitario, foto_url:p.foto_url,
      estado:p.estado_material || p.condicao || "-", produto_id:p.id, patrimonio_id:p.patrimonio_id, raw:p
    })));
  }

  if(!podeVerOutras()){
    const minhaObra = String(u?.obra_id || "");
    lista = lista.filter(i => ["", minhaObra].includes(String(i.obra_id || "")) || String(i.obra_id || "") === "1" || String(i.obra_nome||"").toUpperCase().includes("CD"));
  }

  // Atlas 2.8.1: antes de renderizar, recalcula disponibilidade real.
  lista = await aplicarReservasNoCatalogoAtlas(lista);

  itensCatalogo = lista.filter(i => !["BAIXADO","QUEBRADO"].includes(normalStatus(i.status)));
  atualizarKPIs();
}

async function carregarPedidos(){
  const r = await db().from("pedidos_retirada").select("*").order("id",{ascending:false}).limit(300);
  if(r.error){ console.warn("Erro pedidos:", r.error.message); pedidos=[]; return; }
  pedidos = r.data || [];
  const ids = pedidos.map(p=>p.id);
  if(ids.length){
    const it = await db().from("itens_retirada").select("*").in("pedido_id", ids);
    const itens = it.data || [];
    pedidos = pedidos.map(p=>({...p, itens_retirada: itens.filter(i=>String(i.pedido_id)===String(p.id))}));
  }
}

function atualizarKPIs(){
  const c = s => itensCatalogo.filter(i=>normalStatus(i.status)===s).length;
  document.getElementById("kpiTotal").innerText = itensCatalogo.length;
  document.getElementById("kpiEstoque").innerText = c("ESTOQUE");
  document.getElementById("kpiUso").innerText = c("EM_USO");
  document.getElementById("kpiManutencao").innerText = c("MANUTENCAO");
  document.getElementById("kpiReservado").innerText = c("RESERVADO");
  document.getElementById("kpiPedidos").innerText = pedidos.length;
  document.getElementById("chipTodos").innerText = itensCatalogo.length;
  document.getElementById("chipEstoque").innerText = c("ESTOQUE");
  document.getElementById("chipUso").innerText = c("EM_USO");
  document.getElementById("chipManutencao").innerText = c("MANUTENCAO");
  document.getElementById("chipReservado").innerText = c("RESERVADO");
}

function renderizarTudo(){ atualizarKPIs(); renderizarCatalogo(); renderizarCarrinho(); renderizarPedidos(); }
function renderizarCatalogo(){
  const grid = document.getElementById("catalogoGrid");
  const busca = valor("buscaCatalogo").toLowerCase();
  let lista = itensCatalogo.filter(i=>{
    const texto = `${i.codigo||""} ${i.nome||""} ${i.descricao||""} ${i.marca||""} ${i.modelo||""} ${i.obra_nome||""} ${i.localizacao||""}`.toLowerCase();
    const st = normalStatus(i.status);
    return texto.includes(busca) && (filtroAtual === "TODOS" || st === filtroAtual);
  });
  if(!lista.length){ grid.innerHTML = `<div class="cart-empty" style="grid-column:1/-1">Nenhum item encontrado.</div>`; return; }
  grid.innerHTML = lista.map(i => cardItem(i)).join("");
}

/* =========================================================
   ATLAS CARRINHO UX - estilo marketplace
   - adiciona sem abrir o modal
   - marca visualmente o card como adicionado
   - sincroniza window/localStorage
   - atualiza contador do topo
========================================================= */
function itemEstaNoCarrinho(item){
  return carrinho.some(c =>
    c.origem_tabela === item.origem_tabela &&
    Number(c.id) === Number(item.id)
  );
}

function sincronizarCarrinhoExpedicao(){
  window.carrinho = carrinho;
  try{
    const json = JSON.stringify(carrinho || []);
    localStorage.setItem(chaveCarrinhoExpedicao(), json);
    // Mantém compatibilidade com versões antigas; pode ser removido no futuro.
    localStorage.setItem("carrinhoExpedicao", json);
  }catch(e){}
  const topo = document.getElementById("cartQtdTopo");
  if(topo) topo.innerText = carrinho.length;
}

function garantirCssCarrinhoAtlas(){
  if(document.getElementById("atlasCarrinhoUxCss")) return;
  const css = document.createElement("style");
  css.id = "atlasCarrinhoUxCss";
  css.textContent = `
    @keyframes atlasPop{
      0%{transform:scale(.86)}
      55%{transform:scale(1.18)}
      100%{transform:scale(1)}
    }
    @keyframes atlasPulse{
      0%{transform:scale(1)}
      45%{transform:scale(1.22)}
      100%{transform:scale(1)}
    }
    .produto-card.produto-no-carrinho{
      border:2px solid #16a34a!important;
      box-shadow:0 8px 24px rgba(22,163,74,.15)!important;
      background:#fff!important;
    }
    .produto-card.produto-reservado-atlas{
      border:2px solid #7c3aed!important;
      box-shadow:0 8px 24px rgba(124,58,237,.12)!important;
    }
    .produto-reserva-atlas{
      margin:4px 0 7px;
      color:#6d28d9;
      font-size:10px;
      font-weight:900;
      line-height:1.2;
      background:#f5f3ff;
      border:1px solid #ddd6fe;
      border-radius:8px;
      padding:4px 6px;
      white-space:nowrap;
      overflow:hidden;
      text-overflow:ellipsis;
    }
    .btn-card-action.adicionado{
      background:#16a34a!important;
      color:#fff!important;
    }
    .btn-card-action.atlas-pop{
      animation:atlasPop .28s ease-out;
    }
    #cartQtdTopo.atlas-pulse, .btn-cart-top.atlas-pulse{
      animation:atlasPulse .32s ease-out;
    }

    .atlas-toast{
      position:fixed;
      right:16px;
      bottom:18px;
      z-index:9999999;
      background:#111827;
      color:#fff;
      padding:10px 13px;
      border-radius:12px;
      box-shadow:0 14px 35px rgba(15,23,42,.25);
      font-size:12px;
      font-weight:900;
      opacity:0;
      transform:translateY(8px);
      transition:.22s ease;
      pointer-events:none;
      max-width:290px;
    }
    .atlas-toast.ativo{opacity:1;transform:translateY(0)}
  `;
  document.head.appendChild(css);
}


function atlasToast(msg){
  try{
    garantirCssCarrinhoAtlas();
    let t = document.getElementById("atlasToastCarrinho");
    if(!t){
      t = document.createElement("div");
      t.id = "atlasToastCarrinho";
      t.className = "atlas-toast";
      document.body.appendChild(t);
    }
    t.innerHTML = msg;
    t.classList.add("ativo");
    clearTimeout(window.__atlasToastTimer);
    window.__atlasToastTimer = setTimeout(()=>t.classList.remove("ativo"), 1700);
  }catch(e){}
}

function atlasMotionPop(el){
  try{
    if(window.AtlasMotion && typeof window.AtlasMotion.pop === "function") return window.AtlasMotion.pop(el);
    if(!el) return;
    el.classList.remove("atlas-pop");
    void el.offsetWidth;
    el.classList.add("atlas-pop");
    setTimeout(()=>el.classList.remove("atlas-pop"), 350);
  }catch(e){}
}

function atlasMotionPulse(el){
  try{
    if(window.AtlasMotion && typeof window.AtlasMotion.pulse === "function") return window.AtlasMotion.pulse(el);
    if(!el) return;
    el.classList.remove("atlas-pulse");
    void el.offsetWidth;
    el.classList.add("atlas-pulse");
    setTimeout(()=>el.classList.remove("atlas-pulse"), 380);
  }catch(e){}
}

function animarCarrinhoTopo(){
  atlasMotionPulse(document.getElementById("cartQtdTopo"));
  atlasMotionPulse(document.querySelector(".btn-cart-top"));
}

function animarBotaoItem(origem,id){
  setTimeout(()=>{
    const sel = `.btn-card-action[data-origem="${String(origem).replace(/"/g,'\\"')}"][data-id="${Number(id)}"]`;
    atlasMotionPop(document.querySelector(sel));
  }, 30);
}

function cardItem(i){
  garantirCssCarrinhoAtlas();
  const st = normalStatus(i.status);
  const noCarrinho = itemEstaNoCarrinho(i);
  const acao = noCarrinho ? "fa-check" : (st === "ESTOQUE" ? "fa-cart-shopping" : st === "EM_USO" ? "fa-eye" : st === "MANUTENCAO" ? "fa-wrench" : "fa-lock");
  const cls = noCarrinho ? "ok adicionado" : (st === "ESTOQUE" ? "ok" : st === "EM_USO" ? "info" : "block");
  const tituloAcao = noCarrinho ? "No carrinho • clique para remover" : (st==='ESTOQUE'?'Adicionar ao carrinho':st==='EM_USO'?'Registrar interesse':'Indisponível');
  const foto = fotoItem(i);
  const reservaInfo = i.reservado_atlas ? `<div class="produto-reserva-atlas">🔒 ${esc(i.reserva_pedido_visual || 'Reservado')} • ${esc(obraCurta(null, i.reserva_destino_nome || 'Destino'))}</div>` : "";
  return `<div class="produto-card ${noCarrinho ? 'produto-no-carrinho' : ''} ${i.reservado_atlas ? 'produto-reservado-atlas' : ''}" onclick="abrirDetalhe('${i.origem_tabela}',${i.id})">
    <button class="btn-card-action ${cls}" data-origem="${esc(i.origem_tabela)}" data-id="${Number(i.id)}" onclick="event.stopPropagation();acaoItem('${i.origem_tabela}',${i.id})" title="${tituloAcao}"><i class="fa-solid ${acao}"></i></button>
    <div class="produto-foto">${foto ? `<img src="${esc(foto)}" onerror="this.outerHTML='<div class=placeholder>${placeholderIcon(i)}</div>'">` : `<div class="placeholder">${placeholderIcon(i)}</div>`}<div class="hover-detalhe">👁 Ver detalhes</div></div>
    <div class="produto-info"><div class="produto-nome">${esc(i.nome)}</div><div class="produto-obra">📍 ${esc(obraCurta(i.obra_id,i.obra_nome))}</div>${reservaInfo}<div class="produto-rodape"><span class="badge-status ${statusClass(st)}">${rotStatus(st)}</span><span class="produto-qtd">${Number(i.qtd||1)} unid</span></div></div>
  </div>`;
}
function buscarItem(origem,id){ return itensCatalogo.find(i=>i.origem_tabela===origem && Number(i.id)===Number(id)); }
function acaoItem(origem,id){
  const item = buscarItem(origem,id);
  if(!item) return;
  const st=normalStatus(item.status);

  // Marketplace Atlas: clicou no check, remove do carrinho.
  if(itemEstaNoCarrinho(item)){
    removerCarrinho(origem,id);
    animarCarrinhoTopo();
    return;
  }

  if(st === "ESTOQUE") addCarrinho(item);
  else if(st === "EM_USO") addInteresse(item);
  else alert("Item indisponível para solicitação no momento.");
}
function addCarrinho(item){
  if(itemEstaNoCarrinho(item)) return;
  carrinho.push({...item, tipo_solicitacao:"RETIRADA"});
  sincronizarCarrinhoExpedicao();
  renderizarCarrinho();
  renderizarCatalogo();
  animarBotaoItem(item.origem_tabela,item.id);
  animarCarrinhoTopo();
  atlasToast("✔ Adicionado ao carrinho<br><small>" + esc(item.nome || item.descricao || "Item") + "</small>");
}
function addInteresse(item){
  if(itemEstaNoCarrinho(item)) return;
  carrinho.push({...item, tipo_solicitacao:"INTERESSE"});
  sincronizarCarrinhoExpedicao();
  renderizarCarrinho();
  renderizarCatalogo();
  animarBotaoItem(item.origem_tabela,item.id);
  animarCarrinhoTopo();
  atlasToast("✔ Adicionado ao carrinho<br><small>" + esc(item.nome || item.descricao || "Item") + "</small>");
}
function removerCarrinho(origem,id){
  carrinho = carrinho.filter(c=>!(c.origem_tabela===origem && Number(c.id)===Number(id)));
  sincronizarCarrinhoExpedicao();
  renderizarCarrinho();
  renderizarCatalogo();
  animarCarrinhoTopo();
  atlasToast("↩ Removido do carrinho");
}
function renderizarCarrinho(){
  sincronizarCarrinhoExpedicao();
  const box=document.getElementById("cartItens");
  const q1=document.getElementById("cartQtd"); if(q1) q1.innerText=carrinho.length;
  const q2=document.getElementById("cartResumoItens"); if(q2) q2.innerText=carrinho.length;
  const q3=document.getElementById("cartResumoObras"); if(q3) q3.innerText=new Set(carrinho.map(c=>String(c.obra_id||""))).size;
  if(!carrinho.length){ box.innerHTML=`<div class="cart-empty">Carrinho vazio.</div>`; return; }
  box.innerHTML = carrinho.map(i=>`<div class="cart-item"><div class="cart-img">${fotoItem(i)?`<img src="${esc(fotoItem(i))}">`:placeholderIcon(i)}</div><div class="cart-info"><strong>${esc(i.nome)}</strong><span>${esc(obraCurta(i.obra_id,i.obra_nome))} • ${i.tipo_solicitacao==='INTERESSE'?'Interesse':'Retirada'}</span></div><button class="cart-remove" onclick="removerCarrinho('${i.origem_tabela}',${i.id})"><i class="fa-solid fa-trash"></i></button></div>`).join("");
}


/* =========================================================
   ATLAS SPRINT 2.4 - MODAL DO CARRINHO
   Corrige botão superior do carrinho e mantém UX Marketplace.
========================================================= */
function abrirModalCarrinho(){
  try{
    sincronizarCarrinhoExpedicao?.();
    renderizarCarrinho?.();
  }catch(e){}

  const modal = document.getElementById("modalCarrinho");
  if(!modal){
    console.warn("Atlas Expedição: modalCarrinho não encontrado.");
    return;
  }
  modal.classList.add("ativo");

  try{
    const painel = modal.querySelector(".modal") || modal;
    atlasMotionPop?.(painel);
  }catch(e){}
}

function fecharModalCarrinho(){
  document.getElementById("modalCarrinho")?.classList.remove("ativo");
}

window.abrirModalCarrinho = abrirModalCarrinho;
window.fecharModalCarrinho = fecharModalCarrinho;

async function enviarSolicitacao(){
  if(!carrinho.length){ alert("Adicione itens ao carrinho."); return; }

  const u = usuarioAtual();

  const grupos = {};
  carrinho.forEach(i => {
    const k = String(i.obra_id || "SEM_ORIGEM");
    if(!grupos[k]) grupos[k] = [];
    grupos[k].push(i);
  });

  /* =========================================================
     OFFLINE: guarda solicitação inteira
  ========================================================= */
  if(!(await bdrExpOnlineReal())){
    if(typeof salvarOffline !== "function") throw new Error("offlineQueue.js não carregado. Não foi possível salvar solicitação offline.");
    await salvarOffline("nova_solicitacao", "pedidos_retirada", {
      grupos,
      solicitante:u?.nome || "Usuário",
      obraDestinoId:u?.obra_id || null,
      obraNome:nomeObra(u?.obra_id || null),
      observacao:valor("obsSolicitacao") || "Solicitação criada offline."
    });

    limparCarrinhoExpedicaoSalvo();
    if(document.getElementById("obsSolicitacao")) document.getElementById("obsSolicitacao").value = "";
    renderizarCarrinho();

    marcarExpPendente("nova_solicitacao_" + Date.now(), "⏳ Solicitação salva offline • aguardando internet");
    alert("📦 Sem internet. Solicitação salva no aparelho e será enviada quando a internet voltar.");
    return;
  }

  for(const origemId of Object.keys(grupos)){
    const itens=grupos[origemId];
    const codigo="EXP-"+new Date().getFullYear()+"-"+String(Date.now()).slice(-6)+"-"+Math.floor(Math.random()*99);
    const obraDestinoId = u?.obra_id || null;

    const pedido = {
      codigo,
      status:"SOLICITADO",
      solicitante:u?.nome||"Usuário",
      usuario_criacao:u?.nome||"Usuário",
      obra_id:obraDestinoId,
      obra_destino_id:obraDestinoId,
      obra_nome:nomeObra(obraDestinoId),
      obra_origem_id:origemId==="SEM_ORIGEM"?null:Number(origemId),
      observacao:valor("obsSolicitacao") || "Solicitação criada pelo catálogo interno."
    };

    const r=await db().from("pedidos_retirada").insert([pedido]).select().single();
    if(r.error){ alert("Erro ao criar solicitação: "+r.error.message); return; }

    const itensPayload=itens.map(i=>({
      pedido_id:r.data.id,
      patrimonio_id:i.patrimonio_id || (i.origem_tabela==="patrimonio"?i.id:null),
      produto_id:i.produto_id || (i.origem_tabela==="estoque_produtos"?i.id:null),
      patrimonio_codigo:i.codigo,
      patrimonio_nome:i.nome,
      endereco_codigo:i.localizacao,
      obra_origem_id:i.obra_id || null,
      obra_destino_id:obraDestinoId,
      status:i.tipo_solicitacao==="INTERESSE"?"INTERESSE":"PENDENTE",
      quantidade:1
    }));

    const ri=await db().from("itens_retirada").insert(itensPayload);
    if(ri.error){ alert("Pedido criado, mas erro nos itens: "+ri.error.message); return; }

    // ATLAS SPRINT 2.3: a tela cria o pedido, mas quem registra histórico,
    // movimentação e notificação oficial é o AtlasWorkflow.
    if(window.AtlasWorkflow && typeof AtlasWorkflow.notificarOrigemPedidoCriado === "function"){
      try{
        await AtlasWorkflow.notificarOrigemPedidoCriado(r.data.id);
      }catch(e){
        console.warn("AtlasWorkflow: falha ao notificar origem:", e?.message || e);
      }
    }else{
      await hist(r.data.id,null,"SOLICITADO",`Solicitação criada por ${u?.nome||"Usuário"}.`);
      await notificarGestao("Nova solicitação de expedição", `${u?.nome||"Usuário"} solicitou ${itens.length} item(ns) de ${nomeObra(origemId)}.`, "expedicao.html?aba=solicitacoes");
    }
  }

  limparCarrinhoExpedicaoSalvo();
  sincronizarCarrinhoExpedicao();
  if(document.getElementById("obsSolicitacao")) document.getElementById("obsSolicitacao").value="";
  renderizarCarrinho();
  renderizarCatalogo();
  alert("Solicitação enviada com sucesso!");
  await carregarTudo();
}
async function hist(pedidoId, anterior, novo, obs){ try{ const u=usuarioAtual(); await db().from("historico_pedidos_retirada").insert([{pedido_id:pedidoId,status_anterior:anterior,status_novo:novo,usuario:u?.nome||"Sistema",observacao:obs}]); }catch(e){} }
async function notificarGestao(titulo,mensagem,link){
  try{
    const us=await db().from("usuarios_sistema").select("usuario,nome,permissoes").ilike("permissoes","%RECEBER_NOTIFICACOES_GESTAO%");
    const rows=(us.data||[]).map(u=>({titulo,mensagem,modulo:"EXPEDICAO",usuario_destino:u.usuario,link,lida:false,criado_em:new Date().toISOString()}));
    if(rows.length) await db().from("bdr_notificacoes").insert(rows);
  }catch(e){ console.warn("Notificação gestão não enviada:",e.message); }
}
function renderizarPedidos(){
  const por = s => pedidos.filter(p=>p.status===s);
  lista("listaSolicitacoes", por("AGUARDANDO_AUTORIZACAO")); lista("listaSeparacao", por("EM_SEPARACAO")); lista("listaReservados", por("AGUARDANDO_RETIRADA")); lista("listaRetirada", por("AGUARDANDO_RETIRADA")); lista("listaTransito", por("EM_TRANSITO")); lista("listaHistorico", pedidos.filter(p=>["ENTREGUE","NEGADO","RECEBIDO_COM_DIVERGENCIA"].includes(p.status)));
}
function lista(id, arr){ const el=document.getElementById(id); if(!el) return; if(!arr.length){ el.innerHTML=`<div class="cart-empty">Nenhum registro encontrado.</div>`; return; } el.innerHTML=arr.map(p=>pedidoHTML(p)).join(""); }
function pedidoHTML(p){ const itens=p.itens_retirada||[]; return `<div class="pedido-card"><div class="pedido-top"><div class="pedido-cod">${esc(p.codigo||"PED-"+p.id)}</div><div><b>${esc(p.obra_nome||"-")}</b><div class="pedido-small">Solicitante: ${esc(p.solicitante||"-")} • Origem: ${esc(nomeObra(p.obra_origem_id))}</div></div><div><span class="badge-status ${statusClass(p.status)}">${esc(p.status)}</span><div class="pedido-small">${itens.length} item(ns)</div></div><div class="pedido-actions">${acoesPedido(p)}</div></div></div>`; }
function acoesPedido(p){ if(p.status==="AGUARDANDO_AUTORIZACAO"&&podeAlmoxarife()) return `<button class="btn-mini btn-ok" onclick="autorizar(${p.id})">Aprovar</button><button class="btn-mini btn-red" onclick="negar(${p.id})">Negar</button>`; if(p.status==="EM_SEPARACAO"&&podeAlmoxarife()) return `<button class="btn-mini btn-ok" onclick="reservar(${p.id})">Reservar</button>`; if(p.status==="AGUARDANDO_RETIRADA"&&podeAlmoxarife()) return `<button class="btn-mini btn-ok" onclick="abrirRetirada(${p.id})">Retirada</button>`; return `<button class="btn-mini btn-blue" onclick="alert('Detalhes em evolução')">Detalhes</button>`; }
async function autorizar(id){
  const payload = {status:"EM_SEPARACAO"};

  if(!(await bdrExpOnlineReal())){
    await salvarOffline("acao_pedido", "pedidos_retirada", {
      id,
      payload,
      historico:{
        pedido_id:id,
        status_anterior:"AGUARDANDO_AUTORIZACAO",
        status_novo:"EM_SEPARACAO",
        usuario:usuarioAtual()?.nome || "Sistema",
        observacao:"Solicitação aprovada offline."
      }
    });
    alert("📦 Aprovação salva offline.");
    return;
  }

  await db().from("pedidos_retirada").update(payload).eq("id",id);
  await hist(id,"AGUARDANDO_AUTORIZACAO","EM_SEPARACAO","Solicitação aprovada.");
  await carregarTudo();
}
async function negar(id){
  const motivo=prompt("Motivo da negativa:")||"Negado";
  const payload = {status:"NEGADO", motivo_recusa:motivo};

  if(!(await bdrExpOnlineReal())){
    await salvarOffline("acao_pedido", "pedidos_retirada", {
      id,
      payload,
      historico:{
        pedido_id:id,
        status_anterior:"AGUARDANDO_AUTORIZACAO",
        status_novo:"NEGADO",
        usuario:usuarioAtual()?.nome || "Sistema",
        observacao:motivo
      }
    });
    alert("📦 Negativa salva offline.");
    return;
  }

  await db().from("pedidos_retirada").update(payload).eq("id",id);
  await hist(id,"AGUARDANDO_AUTORIZACAO","NEGADO",motivo);
  await carregarTudo();
}
async function reservar(id){
  if(!(await bdrExpOnlineReal())){
    await salvarOffline("acao_pedido", "pedidos_retirada", {
      id,
      payload:{status:"AGUARDANDO_RETIRADA"},
      itensPayload:{status:"RESERVADO"},
      historico:{
        pedido_id:id,
        status_anterior:"EM_SEPARACAO",
        status_novo:"AGUARDANDO_RETIRADA",
        usuario:usuarioAtual()?.nome || "Sistema",
        observacao:"Itens reservados offline e aguardando retirada."
      }
    });
    alert("📦 Reserva salva offline.");
    return;
  }

  await db().from("pedidos_retirada").update({status:"AGUARDANDO_RETIRADA"}).eq("id",id);
  await db().from("itens_retirada").update({status:"RESERVADO"}).eq("pedido_id",id);
  await hist(id,"EM_SEPARACAO","AGUARDANDO_RETIRADA","Itens reservados e aguardando retirada.");
  await carregarTudo();
}
function abrirRetirada(id){ pedidoRetiradaAtual=id; document.getElementById("modalRetirada").classList.add("ativo"); }
function fecharModalRetirada(){ document.getElementById("modalRetirada").classList.remove("ativo"); pedidoRetiradaAtual=null; }
async function confirmarRetiradaModal(){
  const id=pedidoRetiradaAtual;
  if(!id) return;

  if(!valor("retMotorista")){
    alert("Informe o motorista/responsável.");
    return;
  }

  const payload = {
    status:"EM_TRANSITO",
    motorista_nome:valor("retMotorista"),
    veiculo_placa:valor("retPlaca"),
    transportadora:valor("retVeiculo"),
    data_saida_cd:new Date().toISOString(),
    usuario_saida_cd:usuarioAtual()?.nome||"Usuário"
  };

  const obs = `Retirado por ${valor("retMotorista")} • ${valor("retPlaca")}`;

  if(!(await bdrExpOnlineReal())){
    await salvarOffline("acao_pedido", "pedidos_retirada", {
      id,
      payload,
      historico:{
        pedido_id:id,
        status_anterior:"AGUARDANDO_RETIRADA",
        status_novo:"EM_TRANSITO",
        usuario:usuarioAtual()?.nome || "Sistema",
        observacao:obs
      }
    });
    fecharModalRetirada();
    alert("📦 Retirada salva offline.");
    return;
  }

  await db().from("pedidos_retirada").update(payload).eq("id",id);
  await hist(id,"AGUARDANDO_RETIRADA","EM_TRANSITO",obs);
  fecharModalRetirada();
  await carregarTudo();
}
function abrirDetalhe(origem,id){ const i=buscarItem(origem,id); if(!i) return; document.getElementById("modalTitulo").innerText=i.nome; document.getElementById("modalConteudo").innerHTML=`<div class="modal-grid"><div class="modal-img">${fotoItem(i)?`<img src="${esc(fotoItem(i))}">`:`<div style="font-size:70px">${placeholderIcon(i)}</div>`}</div><div><div class="det-line"><b>Código:</b> ${esc(i.codigo||"-")}</div><div class="det-line"><b>Obra atual:</b> ${esc(nomeObra(i.obra_id))}</div><div class="det-line"><b>Status:</b> <span class="badge-status ${statusClass(normalStatus(i.status))}">${rotStatus(i.status)}</span></div><div class="det-line"><b>Quantidade:</b> ${esc(i.qtd||1)}</div><div class="det-line"><b>Localização:</b> ${esc(i.localizacao||"-")}</div><div class="det-line"><b>Marca/Modelo:</b> ${esc(i.marca||"-")} / ${esc(i.modelo||"-")}</div><div class="det-line"><b>Estado:</b> ${esc(i.estado||"-")}</div><br><button class="btn-ok" onclick="acaoItem('${i.origem_tabela}',${i.id});fecharModalDetalhe()">${normalStatus(i.status)==='ESTOQUE'?'Adicionar ao carrinho':'Registrar interesse'}</button></div></div>`; document.getElementById("modalDetalhe").classList.add("ativo"); }
function fecharModalDetalhe(){ document.getElementById("modalDetalhe").classList.remove("ativo"); }


window.carregarTudo = carregarTudo;
window.BDRExpedicao = {
  carregarTudo,
  get itensCatalogo(){ return itensCatalogo; },
  get pedidos(){ return pedidos; },
  get obras(){ return obras; },
  get carrinho(){ return carrinho; }
};

function bdrExpedicaoIniciarSeguro(){
  setTimeout(() => {
    carregarTudo().catch(e => console.warn("BDR Expedição: falha ao carregar:", e?.message || e));
  }, 100);
}

if(document.readyState === "loading"){
  document.addEventListener("DOMContentLoaded", bdrExpedicaoIniciarSeguro);
}else{
  bdrExpedicaoIniciarSeguro();
}

window.addEventListener("online", async () => {
  try{ window.bdrResetOnlineReal?.(); }catch(e){}
  await carregarTudo();
});



/* =========================================================
   BDR ESC GLOBAL
   ESC fecha modal, usuário e notificações.
========================================================= */
document.addEventListener("keydown", function(e){
  if(e.key !== "Escape") return;

  document.querySelectorAll(
    ".modal-bg.ativo, .modal.ativo, .dropdown-user.ativo, .notif-dropdown.ativo"
  ).forEach(function(el){
    el.classList.remove("ativo");
  });
});


/* =========================================================
   ATLAS SPRINT 2.3 - APROVAÇÃO PARCIAL POR ITEM
   - Recusar todos
   - Autorizar parcial
   - Autorizar todos
   - Notificação oficial via AtlasWorkflow
========================================================= */
(function(){
  "use strict";

  function isSolicitado(p){
    return ["SOLICITADO","AGUARDANDO_AUTORIZACAO"].includes(String(p?.status || "").toUpperCase());
  }

  function pedidoLocal(id){
    return (window.pedidos || pedidos || []).find(p => Number(p.id) === Number(id));
  }

  function itensDoPedidoLocal(p){
    return Array.isArray(p?.itens_retirada) ? p.itens_retirada : [];
  }

  function itemTituloAtlas(i){
    return esc(i.patrimonio_codigo || i.patrimonio_nome || i.produto_id || ("ITEM-" + i.id));
  }

  renderizarPedidos = function(){
    const todos = window.pedidos || pedidos || [];
    const solicitados = todos.filter(p => isSolicitado(p));
    lista("listaSolicitacoes", solicitados);
    lista("listaSeparacao", todos.filter(p => ["APROVADO","APROVADO_PARCIAL","EM_SEPARACAO"].includes(String(p.status||"").toUpperCase())));
    lista("listaReservados", todos.filter(p => String(p.status||"").toUpperCase()==="AGUARDANDO_RETIRADA"));
    lista("listaRetirada", todos.filter(p => String(p.status||"").toUpperCase()==="AGUARDANDO_RETIRADA"));
    lista("listaTransito", todos.filter(p => String(p.status||"").toUpperCase()==="EM_TRANSITO"));
    lista("listaHistorico", todos.filter(p => ["RECEBIDO","RECEBIDO_PARCIAL","RECUSADO","CANCELADO","ENTREGUE","NEGADO","RECEBIDO_COM_DIVERGENCIA"].includes(String(p.status||"").toUpperCase())));
  };

  acoesPedido = function(p){
    const st = String(p.status || "").toUpperCase();

    if(isSolicitado(p) && podeAlmoxarife()){
      return `
        <button class="btn-mini btn-red" onclick="recusarTodosAtlas(${p.id})">Recusar todos</button>
        <button class="btn-mini btn-blue" onclick="abrirAprovacaoParcialAtlas(${p.id})">Autorizar parcial</button>
        <button class="btn-mini btn-ok" onclick="autorizarTodosAtlas(${p.id})">Autorizar todos</button>`;
    }

    if(["APROVADO","APROVADO_PARCIAL","EM_SEPARACAO"].includes(st) && podeAlmoxarife()){
      return `<button class="btn-mini btn-ok" onclick="reservar(${p.id})">Separar / Reservar</button>`;
    }

    if(st==="AGUARDANDO_RETIRADA" && podeAlmoxarife()){
      return `<button class="btn-mini btn-ok" onclick="abrirRetirada(${p.id})">Retirada</button>`;
    }

    if(st==="EM_TRANSITO"){
      return `<button class="btn-mini btn-blue" onclick="alert('Recebimento pelo destino será a próxima etapa da Sprint.')">Acompanhar</button>`;
    }

    return `<button class="btn-mini btn-blue" onclick="abrirDetalhePedidoAtlas(${p.id})">Detalhes</button>`;
  };

  pedidoHTML = function(p){
    const itens = itensDoPedidoLocal(p);
    const resumoItens = itens.map(i => `${esc(i.patrimonio_codigo || i.patrimonio_nome || 'Item')} - ${esc(i.status || '-')}`).join('<br>');
    return `<div class="pedido-card">
      <div class="pedido-top">
        <div class="pedido-cod">${esc(p.codigo||"PED-"+p.id)}</div>
        <div>
          <b>${esc(p.obra_nome||"-")}</b>
          <div class="pedido-small">Solicitante: ${esc(p.solicitante||"-")} • Origem: ${esc(nomeObra(p.obra_origem_id))}</div>
          <div class="pedido-small" style="margin-top:4px">${resumoItens || 'Sem itens carregados'}</div>
        </div>
        <div><span class="badge-status ${statusClass(p.status)}">${esc(p.status)}</span><div class="pedido-small">${itens.length} item(ns)</div></div>
        <div class="pedido-actions">${acoesPedido(p)}</div>
      </div>
    </div>`;
  };

  window.autorizarTodosAtlas = async function(pedidoId){
    if(!confirm("Autorizar todos os itens deste pedido?")) return;
    if(!window.AtlasWorkflow?.aprovarTodosItensPedido){ alert("AtlasWorkflow Sprint 2.3 não carregado."); return; }
    try{
      await AtlasWorkflow.aprovarTodosItensPedido(pedidoId);
      alert("Pedido autorizado com sucesso. Notificação enviada ao solicitante.");
      await carregarTudo();
      if(typeof window.bdrCarregarNotificacoes === "function") await window.bdrCarregarNotificacoes();
    }catch(e){
      alert("Erro ao autorizar: " + (e?.message || e));
    }
  };

  window.recusarTodosAtlas = async function(pedidoId){
    const motivo = prompt("Motivo para recusar todos os itens:") || "Recusado pela origem.";
    if(!window.AtlasWorkflow?.recusarTodosItensPedido){ alert("AtlasWorkflow Sprint 2.3 não carregado."); return; }
    try{
      await AtlasWorkflow.recusarTodosItensPedido(pedidoId, motivo);
      alert("Pedido recusado. Notificação enviada ao solicitante.");
      await carregarTudo();
      if(typeof window.bdrCarregarNotificacoes === "function") await window.bdrCarregarNotificacoes();
    }catch(e){
      alert("Erro ao recusar: " + (e?.message || e));
    }
  };

  window.abrirAprovacaoParcialAtlas = function(pedidoId){
    const p = pedidoLocal(pedidoId);
    if(!p){ alert("Pedido não encontrado na tela. Atualize a página."); return; }
    const itens = itensDoPedidoLocal(p);
    if(!itens.length){ alert("Pedido sem itens carregados."); return; }

    document.getElementById("modalTitulo").innerText = "Autorizar parcial - " + (p.codigo || ("PED-" + p.id));
    document.getElementById("modalConteudo").innerHTML = `
      <div class="info-box" style="margin-top:0">Escolha item por item. O Atlas vai definir o status geral automaticamente: APROVADO, RECUSADO ou APROVADO_PARCIAL.</div>
      <div style="display:grid;gap:10px;margin-top:12px">
        ${itens.map(i => `
          <div class="cart-item" style="grid-template-columns:1fr 135px;align-items:center">
            <div class="cart-info">
              <strong>${itemTituloAtlas(i)}</strong>
              <span>${esc(i.patrimonio_nome || '')}</span>
              <input id="motivoItem_${i.id}" placeholder="Motivo se recusar" style="margin-top:7px;width:100%;height:36px;border:1px solid #d1d5db;border-radius:9px;padding:0 9px">
            </div>
            <select id="decisaoItem_${i.id}" style="height:38px;border:1px solid #d1d5db;border-radius:9px;padding:0 8px;font-weight:900">
              <option value="APROVAR">Autorizar</option>
              <option value="RECUSAR">Recusar</option>
            </select>
          </div>`).join('')}
      </div>
      <br>
      <button class="btn-ok" onclick="confirmarAprovacaoParcialAtlas(${p.id})">Confirmar seleção</button>
    `;
    document.getElementById("modalDetalhe").classList.add("ativo");
  };

  window.confirmarAprovacaoParcialAtlas = async function(pedidoId){
    const p = pedidoLocal(pedidoId);
    const itens = itensDoPedidoLocal(p);
    const decisoes = itens.map(i => ({
      item_id: i.id,
      acao: document.getElementById("decisaoItem_" + i.id)?.value || "APROVAR",
      motivo: document.getElementById("motivoItem_" + i.id)?.value || ""
    }));

    if(!window.AtlasWorkflow?.aprovarItensPedido){ alert("AtlasWorkflow Sprint 2.3 não carregado."); return; }

    try{
      await AtlasWorkflow.aprovarItensPedido(pedidoId, decisoes);
      fecharModalDetalhe();
      alert("Decisão parcial salva. Notificação enviada ao solicitante.");
      await carregarTudo();
      if(typeof window.bdrCarregarNotificacoes === "function") await window.bdrCarregarNotificacoes();
    }catch(e){
      alert("Erro ao salvar aprovação parcial: " + (e?.message || e));
    }
  };

  window.abrirDetalhePedidoAtlas = function(pedidoId){
    const p = pedidoLocal(pedidoId);
    if(!p) return;
    const itens = itensDoPedidoLocal(p);
    document.getElementById("modalTitulo").innerText = "Detalhes - " + (p.codigo || ("PED-" + p.id));
    document.getElementById("modalConteudo").innerHTML = `
      <div class="det-line"><b>Status:</b> ${esc(p.status || '-')}</div>
      <div class="det-line"><b>Solicitante:</b> ${esc(p.solicitante || '-')}</div>
      <div class="det-line"><b>Origem:</b> ${esc(nomeObra(p.obra_origem_id))}</div>
      <div class="det-line"><b>Destino:</b> ${esc(nomeObra(p.obra_destino_id || p.obra_id))}</div>
      <br>
      ${itens.map(i => `<div class="cart-item"><div class="cart-info"><strong>${itemTituloAtlas(i)}</strong><span>Status: ${esc(i.status || '-')} ${i.motivo_recusa ? '• Motivo: '+esc(i.motivo_recusa) : ''}</span></div></div>`).join('')}
    `;
    document.getElementById("modalDetalhe").classList.add("ativo");
  };

  // Compatibilidade com botões antigos, caso algum HTML cacheado ainda chame autorizar/negar.
  window.autorizar = window.autorizarTodosAtlas;
  window.negar = window.recusarTodosAtlas;

  console.log("✅ ATLAS SPRINT 2.3 patch Expedição carregado - aprovação parcial");
})();


/* =========================================================
   ATLAS SPRINT 2.7 - SOLICITAÇÕES COMPACTAS
   - Lista estilo caixa de entrada
   - Pedido visual PED-ID
   - Modal/Drawer de detalhes com itens completos
   - Mantém aprovação total/parcial/recusa pelo Workflow
========================================================= */
(function(){
  "use strict";

  function atlasEnsureSolicitacoesCss(){
    if(document.getElementById("atlasSolicitacoesCompactasCss")) return;
    const css = document.createElement("style");
    css.id = "atlasSolicitacoesCompactasCss";
    css.textContent = `
      .atlas-pedido-compacto{
        padding:0!important;
        overflow:hidden;
      }
      .atlas-pedido-row{
        display:grid;
        grid-template-columns:110px minmax(0,1fr) 130px 96px;
        gap:12px;
        align-items:center;
        padding:12px 14px;
      }
      .atlas-pedido-numero{
        font-size:16px;
        font-weight:950;
        color:var(--bdr-red,#b91c1c);
        line-height:1.1;
      }
      .atlas-pedido-codigo{
        display:block;
        font-size:10px;
        color:#94a3b8;
        font-weight:800;
        margin-top:4px;
        word-break:break-word;
      }
      .atlas-pedido-main{min-width:0;}
      .atlas-pedido-destino{
        font-size:13px;
        font-weight:950;
        color:#0f172a;
        white-space:nowrap;
        overflow:hidden;
        text-overflow:ellipsis;
      }
      .atlas-pedido-meta,
      .atlas-pedido-itens-resumo{
        font-size:11px;
        color:#64748b;
        font-weight:800;
        margin-top:4px;
        white-space:nowrap;
        overflow:hidden;
        text-overflow:ellipsis;
      }
      .atlas-pedido-itens-resumo{color:#334155;}
      .atlas-pedido-status{text-align:right;}
      .atlas-pedido-status .pedido-small{margin-top:4px;}
      .atlas-pedido-actions{display:flex;justify-content:flex-end;}
      .atlas-btn-abrir{
        background:#2563eb!important;
        color:#fff!important;
        border:0!important;
        border-radius:10px!important;
        padding:9px 13px!important;
        font-size:12px!important;
        font-weight:950!important;
        cursor:pointer;
      }
      .atlas-modal-pedido-head{
        display:grid;
        grid-template-columns:1fr auto;
        gap:12px;
        align-items:start;
        margin-bottom:12px;
      }
      .atlas-modal-pedido-num{
        font-size:22px;
        font-weight:950;
        color:#0f172a;
      }
      .atlas-modal-pedido-codigo{
        font-size:11px;
        color:#64748b;
        font-weight:800;
        margin-top:2px;
      }
      .atlas-modal-grid-info{
        display:grid;
        grid-template-columns:repeat(2,minmax(0,1fr));
        gap:8px;
        margin:12px 0;
      }
      .atlas-info-mini{
        background:#f8fafc;
        border:1px solid #e5e7eb;
        border-radius:12px;
        padding:9px 10px;
      }
      .atlas-info-mini small{
        display:block;
        color:#64748b;
        font-size:10px;
        font-weight:950;
        text-transform:uppercase;
        margin-bottom:3px;
      }
      .atlas-info-mini b{
        color:#0f172a;
        font-size:12px;
        line-height:1.25;
      }
      .atlas-itens-lista{
        display:grid;
        gap:8px;
        max-height:340px;
        overflow:auto;
        padding-right:4px;
      }
      .atlas-item-pedido{
        display:grid;
        grid-template-columns:36px 1fr auto;
        gap:10px;
        align-items:center;
        border:1px solid #e5e7eb;
        border-radius:13px;
        padding:10px;
        background:#fff;
      }
      .atlas-item-ordem{
        width:30px;
        height:30px;
        border-radius:10px;
        background:#eff6ff;
        color:#2563eb;
        display:flex;
        align-items:center;
        justify-content:center;
        font-weight:950;
        font-size:12px;
      }
      .atlas-item-codigo{
        font-size:12px;
        font-weight:950;
        color:#0f172a;
      }
      .atlas-item-nome{
        font-size:11px;
        color:#64748b;
        font-weight:800;
        margin-top:3px;
      }
      .atlas-modal-acoes{
        display:flex;
        gap:8px;
        flex-wrap:wrap;
        margin-top:14px;
        padding-top:12px;
        border-top:1px solid #e5e7eb;
      }
      .atlas-modal-acoes button{
        border:0;
        border-radius:10px;
        padding:10px 12px;
        font-size:12px;
        font-weight:950;
        cursor:pointer;
      }
      @media(max-width:760px){
        .atlas-pedido-row{grid-template-columns:1fr;gap:8px;}
        .atlas-pedido-status{text-align:left;}
        .atlas-pedido-actions{justify-content:flex-start;}
        .atlas-modal-grid-info{grid-template-columns:1fr;}
        .atlas-item-pedido{grid-template-columns:30px 1fr;}
        .atlas-item-pedido .badge-status{grid-column:2;justify-self:start;}
      }
    `;
    document.head.appendChild(css);
  }

  function pedidoCurtoAtlas(p){
    return "PED-" + (p?.id || "-");
  }

  function obraLabelCurtaAtlas(id, fallback){
    const txt = fallback || nomeObra(id) || "-";
    return String(txt).replace(/^\d+\s*-\s*/, "").replace(/^999\s*-\s*/, "");
  }

  function codigoItemAtlas(i){
    const cod = i?.patrimonio_codigo || i?.codigo || i?.codigo_bem;
    if(cod) return String(cod);
    if(i?.patrimonio_id) return "PAT-" + String(i.patrimonio_id).padStart(6,"0");
    if(i?.produto_id) return "EST-" + String(i.produto_id).padStart(6,"0");
    return "ITEM-" + String(i?.id || "-").padStart(6,"0");
  }

  function nomeItemAtlas(i){
    return i?.patrimonio_nome || i?.produto_nome || i?.descricao || i?.nome || "Item solicitado";
  }

  function resumoItensAtlas(itens){
    if(!itens || !itens.length) return "Sem itens carregados";
    const primeiros = itens.slice(0,2).map(i => codigoItemAtlas(i) + " — " + nomeItemAtlas(i));
    const resto = itens.length > 2 ? ` +${itens.length - 2} item(ns)` : "";
    return primeiros.join(" • ") + resto;
  }

  function statusPedidoAtlas(p){
    return String(p?.status || "-").toUpperCase();
  }

  const antigoRenderizarPedidos = window.renderizarPedidos || renderizarPedidos;

  pedidoHTML = function(p){
    atlasEnsureSolicitacoesCss();
    const itens = Array.isArray(p?.itens_retirada) ? p.itens_retirada : [];
    const destino = obraLabelCurtaAtlas(p?.obra_destino_id || p?.obra_id, p?.obra_nome);
    const origem = obraLabelCurtaAtlas(p?.obra_origem_id);
    const st = statusPedidoAtlas(p);
    return `<div class="pedido-card atlas-pedido-compacto">
      <div class="atlas-pedido-row">
        <div>
          <div class="atlas-pedido-numero">${esc(pedidoCurtoAtlas(p))}</div>
          <span class="atlas-pedido-codigo">${esc(p.codigo || "")}</span>
        </div>
        <div class="atlas-pedido-main">
          <div class="atlas-pedido-destino">${esc(destino)}</div>
          <div class="atlas-pedido-meta">${esc(p.solicitante || "-")} • ${esc(origem)} → ${esc(destino)}</div>
          <div class="atlas-pedido-itens-resumo">${esc(resumoItensAtlas(itens))}</div>
        </div>
        <div class="atlas-pedido-status">
          <span class="badge-status ${statusClass(st)}">${esc(st)}</span>
          <div class="pedido-small">${itens.length} item(ns)</div>
        </div>
        <div class="atlas-pedido-actions">
          <button class="atlas-btn-abrir" onclick="abrirDetalhePedidoAtlas(${Number(p.id)})">Abrir</button>
        </div>
      </div>
    </div>`;
  };

  acoesPedido = function(p){
    return `<button class="atlas-btn-abrir" onclick="abrirDetalhePedidoAtlas(${Number(p.id)})">Abrir</button>`;
  };

  window.abrirDetalhePedidoAtlas = function(pedidoId){
    atlasEnsureSolicitacoesCss();
    const p = (window.pedidos || pedidos || []).find(x => Number(x.id) === Number(pedidoId));
    if(!p){ alert("Pedido não encontrado na tela. Atualize a página."); return; }
    const itens = Array.isArray(p.itens_retirada) ? p.itens_retirada : [];
    const st = statusPedidoAtlas(p);
    const destino = obraLabelCurtaAtlas(p.obra_destino_id || p.obra_id, p.obra_nome);
    const origem = obraLabelCurtaAtlas(p.obra_origem_id);
    const podeDecidir = ["SOLICITADO","AGUARDANDO_AUTORIZACAO"].includes(st) && podeAlmoxarife();
    const podeSeparar = ["APROVADO","APROVADO_PARCIAL","EM_SEPARACAO"].includes(st) && podeAlmoxarife();
    const podeRetirar = st === "AGUARDANDO_RETIRADA" && podeAlmoxarife();

    let botoes = `<button style="background:#2563eb;color:#fff" onclick="fecharModalDetalhe()">Fechar</button>`;
    if(podeDecidir){
      botoes = `
        <button style="background:#16a34a;color:#fff" onclick="autorizarTodosAtlas(${Number(p.id)})">Autorizar todos</button>
        <button style="background:#2563eb;color:#fff" onclick="abrirAprovacaoParcialAtlas(${Number(p.id)})">Autorizar parcial</button>
        <button style="background:#b91c1c;color:#fff" onclick="recusarTodosAtlas(${Number(p.id)})">Recusar todos</button>
        <button style="background:#e5e7eb;color:#0f172a" onclick="fecharModalDetalhe()">Fechar</button>`;
    }else if(podeSeparar){
      botoes = `
        <button style="background:#16a34a;color:#fff" onclick="reservar(${Number(p.id)});fecharModalDetalhe()">Separar / Reservar</button>
        <button style="background:#e5e7eb;color:#0f172a" onclick="fecharModalDetalhe()">Fechar</button>`;
    }else if(podeRetirar){
      botoes = `
        <button style="background:#16a34a;color:#fff" onclick="abrirRetirada(${Number(p.id)});fecharModalDetalhe()">Confirmar retirada</button>
        <button style="background:#e5e7eb;color:#0f172a" onclick="fecharModalDetalhe()">Fechar</button>`;
    }

    document.getElementById("modalTitulo").innerText = "Detalhes do pedido";
    document.getElementById("modalConteudo").innerHTML = `
      <div class="atlas-modal-pedido-head">
        <div>
          <div class="atlas-modal-pedido-num">${esc(pedidoCurtoAtlas(p))}</div>
          <div class="atlas-modal-pedido-codigo">Código completo: ${esc(p.codigo || "-")}</div>
        </div>
        <span class="badge-status ${statusClass(st)}">${esc(st)}</span>
      </div>

      <div class="atlas-modal-grid-info">
        <div class="atlas-info-mini"><small>Solicitante</small><b>${esc(p.solicitante || "-")}</b></div>
        <div class="atlas-info-mini"><small>Fluxo</small><b>${esc(origem)} → ${esc(destino)}</b></div>
        <div class="atlas-info-mini"><small>Origem</small><b>${esc(nomeObra(p.obra_origem_id))}</b></div>
        <div class="atlas-info-mini"><small>Destino</small><b>${esc(nomeObra(p.obra_destino_id || p.obra_id))}</b></div>
      </div>

      <h3 style="margin:12px 0 8px;color:#0f172a">Itens do pedido (${itens.length})</h3>
      <div class="atlas-itens-lista">
        ${itens.length ? itens.map((i,idx) => `
          <div class="atlas-item-pedido">
            <div class="atlas-item-ordem">${idx+1}</div>
            <div>
              <div class="atlas-item-codigo">${esc(codigoItemAtlas(i))}</div>
              <div class="atlas-item-nome">${esc(nomeItemAtlas(i))}${i.motivo_recusa ? " • Motivo: " + esc(i.motivo_recusa) : ""}</div>
            </div>
            <span class="badge-status ${statusClass(i.status || 'PENDENTE')}">${esc(i.status || 'PENDENTE')}</span>
          </div>`).join("") : `<div class="cart-empty">Nenhum item carregado.</div>`}
      </div>
      <div class="atlas-modal-acoes">${botoes}</div>
    `;
    document.getElementById("modalDetalhe").classList.add("ativo");
  };

  console.log("✅ ATLAS SOLICITAÇÕES COMPACTAS V1.0 carregado");
})();
