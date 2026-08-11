/* =========================================================
   ATLAS MANUTENÇÃO
   Arquivo definitivo: JS/atlasManutencao.js
   - Modal no Patrimônio
   - Central de manutenção
   - Compartilhamento do link do fornecedor
   - Análise e impressão de orçamento
========================================================= */
(function(){
  "use strict";

  if(window.AtlasManutencao?.__loaded) return;

  /* =========================================================
     CONFIGURAÇÕES RÁPIDAS — pode alterar manualmente
     =========================================================
     pdfTopoMm:
       aumenta = orçamento desce na folha
       diminui = orçamento sobe na folha

     manutencoesPorPagina:
       quantidade inicial exibida na lista da Central
  ========================================================= */
  const ATLAS_MANUT_CONFIG = {
    pdfTopoMm: 18,
    pdfMargemLateralMm: 9,
    pdfMargemInferiorMm: 9,
    manutencoesPorPagina: 5,
    opcoesPorPagina: [5,10,15,20]};

  const $ = (s,c=document)=>c.querySelector(s);
  const $$ = (s,c=document)=>[...c.querySelectorAll(s)];

  const state = {
    ordens:[],
    selecionada:null,
    orcamento:null,
    historico:[],
    realtime:null,

    // Paginação da lista de ordens da Central.
    pagina:1,
    porPagina:ATLAS_MANUT_CONFIG.manutencoesPorPagina
  };

  function wf(){
    if(!window.AtlasWorkflowManutencao) throw new Error("AtlasWorkflowManutencao não carregado.");
    return window.AtlasWorkflowManutencao;
  }

  function db(){
    return window.client || window.supabaseClient || window.clientSupabase || globalThis.client;
  }

  function esc(v){
    return String(v ?? "").replace(/[&<>'"]/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[ch]));
  }

  function brl(v){
    return Number(v || 0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
  }

  function dataHora(v){
    if(!v) return "-";
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleString("pt-BR");
  }

  function data(v){
    if(!v) return "-";
    const d = new Date(`${String(v).slice(0,10)}T12:00:00`);
    return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString("pt-BR");
  }

  function labelStatus(s){
    const map = {
      AGUARDANDO_ENVIO:"Aguardando envio",
      ENVIADA_FORNECEDOR:"Enviada ao fornecedor",
      AGUARDANDO_ORCAMENTO:"Aguardando orçamento",
      ORCAMENTO_RECEBIDO:"Orçamento recebido",
      AGUARDANDO_APROVACAO:"Aguardando aprovação",
      ORCAMENTO_APROVADO:"Orçamento aprovado",
      AJUSTE_SOLICITADO:"Ajuste solicitado",
      ORCAMENTO_RECUSADO:"Orçamento recusado",
      EM_MANUTENCAO:"Em manutenção",
      AGUARDANDO_PECA:"Aguardando peça",
      SERVICO_CONCLUIDO:"Serviço concluído",
      AGUARDANDO_RECEBIMENTO:"Aguardando recebimento",
      RECEBIDA:"Recebida",
      FINALIZADA:"Finalizada",
      SEM_CONSERTO:"Sem conserto",
      RETORNO_GARANTIA:"Retorno em garantia",
      CANCELADA:"Cancelada",
      AGUARDANDO_BAIXA:"Aguardando baixa"
    };
    return map[String(s||"").toUpperCase()] || String(s || "-").replaceAll("_"," ");
  }

  function statusClass(s){
    const v = String(s||"").toUpperCase();
    if(["FINALIZADA","RECEBIDA","SERVICO_CONCLUIDO","ORCAMENTO_APROVADO"].includes(v)) return "ok";
    if(["ORCAMENTO_RECUSADO","CANCELADA","SEM_CONSERTO","AGUARDANDO_BAIXA"].includes(v)) return "danger";
    if(["ORCAMENTO_RECEBIDO","AGUARDANDO_APROVACAO","AJUSTE_SOLICITADO"].includes(v)) return "warning";
    if(["EM_MANUTENCAO","AGUARDANDO_PECA"].includes(v)) return "active";
    return "neutral";
  }

  function usuarioAtual(){
    try{
      return JSON.parse(
        localStorage.getItem("usuario_logado") ||
        localStorage.getItem("usuarioLogado") ||
        localStorage.getItem("usuarioAtual") ||
        "null"
      );
    }catch(_){
      return null;
    }
  }


  /* =========================================================
     ACESSO À MANUTENÇÃO POR OBRA
     - MASTER / OWNER: visualizam todas as obras.
     - Demais perfis: visualizam somente a obra principal
       e as obras explicitamente presentes em obras_liberadas.
     ========================================================= */
  function perfilAtual(){
    const u=usuarioAtual();
    return String(u?.perfil_rapido || u?.perfil || "").trim().toUpperCase();
  }

  function usuarioVeTodasAsObras(){
    return ["MASTER","OWNER"].includes(perfilAtual());
  }

  function normalizarListaObras(valor){
    if(valor === null || valor === undefined || valor === "") return [];

    let bruto=valor;

    // usuarios_sistema.obras_liberadas é texto e pode chegar como JSON.
    if(typeof bruto==="string"){
      const texto=bruto.trim();
      if(!texto) return [];

      try{
        const parsed=JSON.parse(texto);
        if(Array.isArray(parsed)) bruto=parsed;
        else if(parsed !== null && parsed !== undefined) bruto=[parsed];
      }catch(_){
        bruto=texto.split(/[,;|]/);
      }
    }

    if(!Array.isArray(bruto)) bruto=[bruto];

    return [...new Set(
      bruto
        .flatMap(item=>{
          // Aceita também objetos eventualmente armazenados no login.
          if(item && typeof item==="object"){
            return [
              item.id,
              item.obra_id,
              item.value
            ];
          }
          return [item];
        })
        .map(v=>String(v ?? "").trim())
        .filter(v=>/^\d+$/.test(v))
        .map(Number)
        .filter(Number.isFinite)
    )];
  }

  function obrasPermitidasUsuario(){
    const u=usuarioAtual();
    if(!u) return [];

    const ids=[];

    const principal=Number(u.obra_id);
    if(Number.isFinite(principal) && principal>0) ids.push(principal);

    normalizarListaObras(u.obras_liberadas).forEach(id=>ids.push(id));

    return [...new Set(ids)];
  }

  function usuarioPodeVerObra(obraId){
    if(usuarioVeTodasAsObras()) return true;

    const id=Number(obraId);
    if(!Number.isFinite(id) || id<=0) return false;

    return obrasPermitidasUsuario().includes(id);
  }

  function usuarioPodeVerOrdem(ordem){
    if(!ordem) return false;
    return usuarioPodeVerObra(ordem.obra_id);
  }

  function atualizarTopbarUsuario(){
    const u = usuarioAtual();
    const nome = u?.nome || u?.usuario || "-";
    const perfil = u?.perfil_rapido || u?.perfil || "-";

    const nomeEl = $("#usuarioNome");
    const perfilEl = $("#usuarioPerfil");

    if(nomeEl) nomeEl.textContent = `Olá, ${nome}`;
    if(perfilEl) perfilEl.textContent = String(perfil).toUpperCase();
  }

  function emailNormalizado(v){
    return String(v || "").trim().toLowerCase();
  }

  function aplicarEmailMinusculo(campo){
    if(!campo) return;

    const normalizar = (preservarCursor=false) => {
      const inicio = preservarCursor ? campo.selectionStart : null;
      const fim = preservarCursor ? campo.selectionEnd : null;
      const novo = emailNormalizado(campo.value);

      if(campo.value !== novo){
        campo.value = novo;
        if(preservarCursor && inicio !== null && fim !== null){
          try{ campo.setSelectionRange(inicio, fim); }catch(_){}
        }
      }
    };

    campo.setAttribute("data-bdr-sem-uppercase", "");
    normalizar(false);
    campo.addEventListener("input", () => normalizar(true));
    campo.addEventListener("change", () => normalizar(false));
    campo.addEventListener("blur", () => normalizar(false));
  }

  function aviso(msg,tipo="ok"){
    let el = $("#atlasManutToast");
    if(!el){
      el = document.createElement("div");
      el.id="atlasManutToast";
      el.className="atlas-manut-toast";
      document.body.appendChild(el);
    }
    el.className=`atlas-manut-toast ${tipo}`;
    el.textContent=msg;
    el.classList.add("show");
    clearTimeout(el.__timer);
    el.__timer=setTimeout(()=>el.classList.remove("show"),2600);
  }

  function modalBase(id,titulo,corpo,rodape=""){
    const antigo = document.getElementById(id);
    if(antigo) antigo.remove();
    const bg=document.createElement("div");
    bg.id=id;
    bg.className="atlas-manut-modal-bg";
    bg.innerHTML=`
      <div class="atlas-manut-modal" role="dialog" aria-modal="true">
        <div class="atlas-manut-modal-head">
          <div>
            <h2>${titulo}</h2>
            <small>Atlas • Gestão de Manutenção</small>
          </div>
          <button type="button" class="atlas-manut-close" data-close>×</button>
        </div>
        <div class="atlas-manut-modal-body">${corpo}</div>
        ${rodape?`<div class="atlas-manut-modal-foot">${rodape}</div>`:""}
      </div>`;
    document.body.appendChild(bg);
    bg.querySelector("[data-close]").onclick=()=>bg.remove();
    bg.addEventListener("click",e=>{if(e.target===bg)bg.remove();});
    return bg;
  }

  function confirmarAtlas(titulo, mensagem, textoConfirmar="Confirmar"){
    return new Promise(resolve => {
      const corpo = `
        <div class="atlas-manut-confirm">
          <div class="atlas-manut-confirm-icon">✓</div>
          <div>
            <h3>${esc(titulo)}</h3>
            <p>${esc(mensagem)}</p>
          </div>
        </div>`;

      const bg = modalBase(
        "atlasManutConfirm",
        titulo,
        corpo,
        `<button class="atlas-btn light" data-nao>Cancelar</button>
         <button class="atlas-btn primary" data-sim>${esc(textoConfirmar)}</button>`
      );

      const finalizar = valor => {
        if(bg.isConnected) bg.remove();
        resolve(valor);
      };

      bg.querySelector("[data-nao]").onclick = () => finalizar(false);
      bg.querySelector("[data-sim]").onclick = () => finalizar(true);
      bg.querySelector("[data-close]").onclick = () => finalizar(false);
    });
  }

  function pedirTextoAtlas(titulo, rotulo, valorInicial="", obrigatorio=false){
    return new Promise(resolve => {
      const corpo = `
        <label class="atlas-manut-dialog-label">
          ${esc(rotulo)}
          <textarea id="atlasManutDialogTexto"
            data-bdr-sem-uppercase
            placeholder="Digite aqui...">${esc(valorInicial)}</textarea>
        </label>`;

      const bg = modalBase(
        "atlasManutTexto",
        titulo,
        corpo,
        `<button class="atlas-btn light" data-cancelar-dialog>Cancelar</button>
         <button class="atlas-btn primary" data-confirmar-dialog>Confirmar</button>`
      );

      const campo = $("#atlasManutDialogTexto", bg);

      const fechar = valor => {
        if(bg.isConnected) bg.remove();
        resolve(valor);
      };

      bg.querySelector("[data-cancelar-dialog]").onclick = () => fechar(null);
      bg.querySelector("[data-close]").onclick = () => fechar(null);
      bg.querySelector("[data-confirmar-dialog]").onclick = () => {
        const valor = campo.value.trim();

        if(obrigatorio && valor.length < 3){
          aviso("Informe uma justificativa.","danger");
          campo.focus();
          return;
        }

        fechar(valor);
      };

      setTimeout(() => {
        campo.focus();
        campo.setSelectionRange(campo.value.length, campo.value.length);
      }, 0);
    });
  }

  async function abrir(patrimonio){
    if(!patrimonio?.id){
      aviso("Selecione um patrimônio primeiro.","danger");
      return;
    }

    /*
      Mesmo que a tela Patrimônio já filtre os itens, esta validação
      impede abrir manualmente a rotina para patrimônio de outra obra.
    */
    const obraPatrimonio=patrimonio.obra_id || patrimonio.localizacao_id;
    if(!usuarioVeTodasAsObras() && !usuarioPodeVerObra(obraPatrimonio)){
      aviso("Este patrimônio pertence a uma obra não liberada para o seu usuário.","danger");
      return;
    }

    try{
      const aberta = await wf().abertaPorPatrimonio(patrimonio.id);
      if(aberta){
        const corpo=`
          <div class="atlas-manut-existing">
            <div class="atlas-manut-icon">🔧</div>
            <div>
              <h3>Já existe uma manutenção aberta</h3>
              <p><b>${esc(aberta.codigo||"#"+aberta.id)}</b> • ${esc(labelStatus(aberta.status))}</p>
              <p>${esc(aberta.motivo||"")}</p>
            </div>
          </div>`;
        const bg=modalBase("atlasManutModalExistente","Manutenção em andamento",corpo,
          `<button class="atlas-btn light" data-close2>Fechar</button>
           <button class="atlas-btn primary" data-abrir>🔧 Abrir central da manutenção</button>`);
        bg.querySelector("[data-close2]").onclick=()=>bg.remove();
        bg.querySelector("[data-abrir]").onclick=()=>location.href=`manutencao.html?id=${aberta.id}`;
        return;
      }
    }catch(e){
      console.warn("Atlas Manutenção: não foi possível checar ordem aberta",e);
    }

    const hoje=new Date().toISOString().slice(0,10);
    const corpo=`
      <div class="atlas-manut-patrimonio-resumo">
        <div><small>Patrimônio</small><strong>${esc(patrimonio.codigo_qr||patrimonio.codigo_antigo||"-")}</strong></div>
        <div><small>Item</small><strong>${esc(patrimonio.nome_bem||"-")}</strong></div>
        <div><small>Marca / Modelo</small><strong>${esc([patrimonio.marca,patrimonio.modelo].filter(Boolean).join(" • ")||"-")}</strong></div>
        <div><small>Obra atual</small><strong>${esc(patrimonio.localizacao||patrimonio.obra_nome||"-")}</strong></div>
      </div>

      <div class="atlas-manut-form-grid">
        <label>Tipo de manutenção
          <select id="amTipo">
            <option value="CORRETIVA">Corretiva</option>
            <option value="PREVENTIVA">Preventiva</option>
            <option value="GARANTIA">Garantia</option>
            <option value="INSPECAO">Inspeção / diagnóstico</option>
          </select>
        </label>
        <label>Prioridade
          <select id="amPrioridade">
            <option value="NORMAL">Normal</option>
            <option value="ALTA">Alta</option>
            <option value="URGENTE">Urgente</option>
          </select>
        </label>
        <label class="wide">Defeito informado *
          <textarea id="amDefeito" placeholder="Ex.: não liga, ruído excessivo, vazamento, quebra do mandril..."></textarea>
        </label>
        <label>Fornecedor / oficina
          <input id="amFornecedor" placeholder="Ex.: Oficina Silva">
        </label>
        <label>Destino / endereço
          <input id="amDestino" placeholder="Ex.: Oficina Silva - Centro">
        </label>
        <label>WhatsApp do fornecedor
          <input id="amWhatsapp" placeholder="Ex.: 65 99999-9999">
        </label>
        <label>E-mail do fornecedor
          <input id="amEmail" type="email" data-bdr-sem-uppercase placeholder="orcamento@oficina.com.br">
        </label>
        <label>Previsão de envio
          <input id="amPrevisao" type="date" value="${hoje}">
        </label>
        <label>Responsável pela entrega
          <input id="amResponsavel" value="${esc(usuarioAtual()?.nome||usuarioAtual()?.usuario||"")}" readonly data-bdr-sem-uppercase>
          <small class="atlas-field-hint">Preenchido automaticamente pelo usuário logado.</small>
        </label>
        <label class="wide">Destino de retorno
          <input id="amRetorno" value="${esc(patrimonio.localizacao||"")}" placeholder="Obra/setor para onde o item deve retornar">
        </label>
        <label class="wide">Observação
          <textarea id="amObs" placeholder="Informações adicionais, acessórios enviados, cuidados etc."></textarea>
        </label>
      </div>
      <div class="atlas-manut-note">📷 Fotos e vídeos serão ligados à ordem na próxima etapa. Nesta versão de teste, registre a observação e o fornecedor.</div>`;

    const bg=modalBase("atlasManutModalCriar","🔧 Enviar para manutenção",corpo,
      `<button class="atlas-btn light" data-cancelar>Cancelar</button>
       <button class="atlas-btn primary" data-criar>🛠 Criar ordem de manutenção</button>`);
    bg.querySelector("[data-cancelar]").onclick=()=>bg.remove();
    aplicarEmailMinusculo($("#amEmail",bg));

    bg.querySelector("[data-criar]").onclick=async()=>{
      const botao=bg.querySelector("[data-criar]");
      const defeito=$("#amDefeito",bg).value.trim();
      if(defeito.length<5){aviso("Informe o defeito com pelo menos 5 caracteres.","danger");return;}
      botao.disabled=true;botao.textContent="Criando...";
      try{
        const ordem=await wf().criarOrdem(patrimonio,{
          tipo_manutencao:$("#amTipo",bg).value,
          prioridade:$("#amPrioridade",bg).value,
          defeito_informado:defeito,
          fornecedor_nome:$("#amFornecedor",bg).value.trim(),
          destino_fornecedor:$("#amDestino",bg).value.trim(),
          fornecedor_whatsapp:$("#amWhatsapp",bg).value.trim(),
          fornecedor_email:emailNormalizado($("#amEmail",bg).value),
          previsao_envio:$("#amPrevisao",bg).value||null,
          responsavel_entrega:usuarioAtual()?.nome || usuarioAtual()?.usuario || "SISTEMA",
          destino_retorno:$("#amRetorno",bg).value.trim(),
          observacao:$("#amObs",bg).value.trim()
        });
        bg.remove();
        const abrirCentral = await confirmarAtlas(
          "Ordem criada com sucesso",
          `${ordem.codigo} foi criada e está aguardando o envio para manutenção. Deseja abrir a Central agora?`,
          "Abrir Central"
        );

        if(abrirCentral){
          location.href=`manutencao.html?id=${ordem.id}`;
        }else{
          location.reload();
        }
      }catch(e){
        console.error(e);aviso(e.message||"Erro ao criar manutenção.","danger");
        botao.disabled=false;botao.textContent="🛠 Criar ordem de manutenção";
      }
    };
  }

  function filtros(){
    const busca=$("#manutBusca")?.value.trim().toLowerCase()||"";
    const status=$("#manutFiltroStatus")?.value||"";
    return state.ordens.filter(o=>{
      const texto=[o.codigo,o.codigo_patrimonio,o.nome_patrimonio,o.fornecedor_nome,o.fornecedor,o.motivo].join(" ").toLowerCase();
      return (!busca||texto.includes(busca)) && (!status||String(o.status||"").toUpperCase()===status);
    });
  }

  function atualizarKpis(){
    const lista=state.ordens;
    const set=(id,v)=>{const e=$("#"+id);if(e)e.textContent=v;};
    set("manutKpiTotal",lista.length);
    set("manutKpiEnvio",lista.filter(x=>x.status==="AGUARDANDO_ENVIO").length);
    set("manutKpiOrcamento",lista.filter(x=>["AGUARDANDO_ORCAMENTO","ORCAMENTO_RECEBIDO","AGUARDANDO_APROVACAO"].includes(x.status)).length);
    set("manutKpiExecucao",lista.filter(x=>["ORCAMENTO_APROVADO","EM_MANUTENCAO","AGUARDANDO_PECA"].includes(x.status)).length);
    set("manutKpiRetorno",lista.filter(x=>["SERVICO_CONCLUIDO","AGUARDANDO_RECEBIMENTO","RECEBIDA"].includes(x.status)).length);
    set("manutKpiCusto",brl(lista.reduce((s,x)=>s+Number(x.valor_orcamento||0),0)));
  }

  function garantirPaginacao(){
    const lista=$("#manutLista");
    if(!lista) return null;

    /*
      A paginação pertence ao mesmo painel da lista.
      O HTML atual já traz o container pronto; o fallback existe
      apenas para compatibilidade com alguma cópia antiga da página.
    */
    let pag=$("#manutPaginacao");

    if(!pag){
      pag=document.createElement("div");
      pag.id="manutPaginacao";
      pag.className="atlas-manut-pagination";
      pag.setAttribute("aria-label","Paginação das ordens de manutenção");

      const painelLista=lista.closest(".atlas-manut-pane.left");
      (painelLista || lista.parentElement)?.appendChild(pag);
    }

    if(pag.dataset.atlasPaginacaoLigada==="1") return pag;
    pag.dataset.atlasPaginacaoLigada="1";

    pag.addEventListener("click",e=>{
      const btn=e.target.closest("[data-pagina]");
      if(!btn || btn.disabled) return;

      const destino=Number(btn.dataset.pagina);
      if(!Number.isFinite(destino) || destino<1) return;

      state.pagina=destino;
      renderLista();
    });

    return pag;
  }

  function paginasVisiveis(atual,total){
    if(total<=5) return Array.from({length:total},(_,i)=>i+1);

    const paginas=new Set([1,total,atual-1,atual,atual+1]);
    return [...paginas]
      .filter(p=>p>=1 && p<=total)
      .sort((a,b)=>a-b);
  }

  function renderPaginacao(totalItens){
    const pag=garantirPaginacao();
    if(!pag) return;

    const totalPaginas=Math.max(1,Math.ceil(totalItens/state.porPagina));
    state.pagina=Math.min(Math.max(1,state.pagina),totalPaginas);

    const inicio=totalItens ? ((state.pagina-1)*state.porPagina)+1 : 0;
    const fim=totalItens ? Math.min(totalItens,state.pagina*state.porPagina) : 0;
    const visiveis=paginasVisiveis(state.pagina,totalPaginas);

    let anterior=null;
    const botoes=[];

    visiveis.forEach(p=>{
      if(anterior!==null && p-anterior>1){
        botoes.push(`<span class="atlas-manut-page-dots">…</span>`);
      }

      botoes.push(`
        <button type="button"
          class="atlas-manut-page-btn ${p===state.pagina?"active":""}"
          data-pagina="${p}"
          ${p===state.pagina?'aria-current="page"':""}
          title="Página ${p}">
          ${p}
        </button>`);

      anterior=p;
    });

    const options=ATLAS_MANUT_CONFIG.opcoesPorPagina.map(qtd=>
      `<option value="${qtd}" ${Number(qtd)===Number(state.porPagina)?"selected":""}>${qtd}</option>`
    ).join("");

    pag.innerHTML=`
      <div class="atlas-manut-page-summary">
        Mostrando <strong>${inicio}</strong> a <strong>${fim}</strong> de <strong>${totalItens}</strong> ordens
      </div>

      <div class="atlas-manut-page-buttons">
        <button type="button"
          class="atlas-manut-page-btn nav"
          data-pagina="1"
          ${state.pagina===1?"disabled":""}
          title="Primeira página">«</button>

        <button type="button"
          class="atlas-manut-page-btn nav"
          data-pagina="${state.pagina-1}"
          ${state.pagina===1?"disabled":""}
          title="Página anterior">‹</button>

        ${botoes.join("")}

        <button type="button"
          class="atlas-manut-page-btn nav"
          data-pagina="${state.pagina+1}"
          ${state.pagina===totalPaginas?"disabled":""}
          title="Próxima página">›</button>

        <button type="button"
          class="atlas-manut-page-btn nav"
          data-pagina="${totalPaginas}"
          ${state.pagina===totalPaginas?"disabled":""}
          title="Última página">»</button>
      </div>

      <label class="atlas-manut-page-size">
        <span>Itens por página:</span>
        <select id="atlasManutPorPagina" aria-label="Itens por página">
          ${options}
        </select>
      </label>`;

    const seletor=$("#atlasManutPorPagina",pag);
    if(seletor){
      seletor.onchange=()=>{
        state.porPagina=Number(seletor.value)||ATLAS_MANUT_CONFIG.manutencoesPorPagina;
        state.pagina=1;
        renderLista();
      };
    }
  }

  function renderLista(){
    const box=$("#manutLista");
    if(!box)return;

    const lista=filtros();
    const totalPaginas=Math.max(1,Math.ceil(lista.length/state.porPagina));

    if(state.pagina>totalPaginas) state.pagina=totalPaginas;
    if(state.pagina<1) state.pagina=1;

    if(!lista.length){
      box.innerHTML=`<div class="atlas-manut-empty"><i class="fa-solid fa-screwdriver-wrench"></i><h3>Nenhuma manutenção encontrada</h3><p>As ordens criadas pelo Patrimônio aparecerão aqui.</p></div>`;
      renderPaginacao(0);
      return;
    }

    const inicio=(state.pagina-1)*state.porPagina;
    const pagina=lista.slice(inicio,inicio+state.porPagina);

    box.innerHTML=pagina.map(o=>`
      <button class="atlas-manut-row ${String(state.selecionada?.id)===String(o.id)?"selected":""}" data-id="${o.id}" type="button">
        <div class="atlas-manut-row-code"><strong>${esc(o.codigo||"#"+o.id)}</strong><small>${esc(o.codigo_patrimonio||"-")}</small></div>
        <div class="atlas-manut-row-item"><strong>${esc(o.nome_patrimonio||"Patrimônio")}</strong><small>${esc(o.fornecedor_nome||o.fornecedor||"Fornecedor ainda não definido")}</small></div>
        <div class="atlas-manut-row-status"><span class="atlas-manut-status ${statusClass(o.status)}">${esc(labelStatus(o.status))}</span></div>
        <div class="atlas-manut-row-value"><strong>${brl(o.valor_orcamento||0)}</strong><small>${dataHora(o.data_criacao||o.data_entrada)}</small></div>
        <span class="atlas-manut-row-open">Abrir</span>
      </button>`).join("");

    renderPaginacao(lista.length);
  }

  async function carregar(){
    if(!db()) throw new Error("Supabase não carregado.");

    const u=usuarioAtual();
    if(!u) throw new Error("Sessão do usuário não encontrada.");

    let consulta=db()
      .from("manutencoes_patrimonio")
      .select("*")
      .order("id",{ascending:false})
      .limit(1000);

    /*
      MASTER / OWNER enxergam tudo.
      Os demais usuários recebem do Supabase somente registros
      das obras que estão liberadas para eles.
    */
    if(!usuarioVeTodasAsObras()){
      const obras=obrasPermitidasUsuario();

      if(!obras.length){
        state.ordens=[];
        state.selecionada=null;
        state.orcamento=null;
        state.historico=[];
        atualizarKpis();
        renderLista();
        renderDetalhe();
        return;
      }

      if(obras.length===1){
        consulta=consulta.eq("obra_id",obras[0]);
      }else{
        consulta=consulta.in("obra_id",obras);
      }
    }

    const {data,error}=await consulta;
    if(error) throw error;

    // Defesa adicional no cliente: nunca mantém ordem fora das obras permitidas.
    state.ordens=usuarioVeTodasAsObras()
      ? (data||[])
      : (data||[]).filter(usuarioPodeVerOrdem);

    // Se a ordem selecionada deixou de pertencer ao escopo, limpa o detalhe.
    if(state.selecionada && !state.ordens.some(o=>String(o.id)===String(state.selecionada.id))){
      state.selecionada=null;
      state.orcamento=null;
      state.historico=[];
    }

    atualizarKpis();
    renderLista();
    renderDetalhe();
  }

  function acoesPorStatus(ordem){
    const s=String(ordem.status||"").toUpperCase();
    const b=[];
    const temOrcamento=Boolean(state.orcamento?.id);

    if(s==="AGUARDANDO_ENVIO") b.push(`<button class="atlas-btn primary" data-action="saida">🚚 Registrar saída</button>`);
    if(["ENVIADA_FORNECEDOR","AGUARDANDO_ORCAMENTO","AJUSTE_SOLICITADO"].includes(s)) b.push(`<button class="atlas-btn dark" data-action="link">🔗 Gerar / Copiar link do fornecedor</button>`);

    /*
      O orçamento vira documento permanente da ordem.
      Depois de recebido ele continua acessível, inclusive após finalizar.
    */
    if(temOrcamento){
      b.push(`<button class="atlas-btn light" data-action="ver-orcamento">📄 Ver orçamento</button>`);
      }

    if(["ORCAMENTO_RECEBIDO","AGUARDANDO_APROVACAO"].includes(s)){
      b.push(`<button class="atlas-btn dark" data-action="encaminhar">📨 Encaminhar</button>`);
      b.push(`<button class="atlas-btn success" data-action="aprovar">✅ Aprovar</button>`);
      b.push(`<button class="atlas-btn warning" data-action="ajuste">↩ Solicitar ajuste</button>`);
      b.push(`<button class="atlas-btn danger" data-action="recusar">✕ Recusar</button>`);
    }
    /*
      Fluxo simplificado:
      orçamento aprovado já significa serviço autorizado.
      Depois disso, a empresa apenas aguarda o patrimônio voltar.
    */
    if([
      "ORCAMENTO_APROVADO",
      "EM_MANUTENCAO",
      "AGUARDANDO_PECA",
      "SERVICO_CONCLUIDO",
      "AGUARDANDO_RECEBIMENTO"
    ].includes(s)){
      b.push(`<button class="atlas-btn primary" data-action="receber">📦 Registrar recebimento</button>`);
    }

    // RECEBIDA só permanece quando houve divergência no retorno.
    if(s==="RECEBIDA" && String(ordem.resultado_recebimento||"").toUpperCase()==="DIVERGENCIA"){
      b.push(`<span class="atlas-manut-inline-warning">⚠️ Recebimento com divergência — requer análise.</span>`);
    }
    return b.join("");
  }

  function rolarParaDetalheNoMobile(){
    /*
      No desktop os painéis têm rolagem própria.
      No tablet/celular a página é uma coluna; depois de selecionar
      uma ordem, levamos o usuário até o painel de detalhe.
    */
    if(!window.matchMedia?.("(max-width: 1200px)")?.matches) return;

    const detalhe=$("#manutDetalhe");
    if(!detalhe) return;

    requestAnimationFrame(()=>{
      setTimeout(()=>{
        detalhe.scrollIntoView({
          behavior:"smooth",
          block:"start",
          inline:"nearest"
        });
      },40);
    });
  }

  async function selecionar(id){
    /*
      A Central só permite selecionar ordens que já vieram da consulta
      filtrada por obra. Não buscamos mais um ID arbitrário no Workflow,
      evitando abrir manutenção de outra obra pela URL.
    */
    const ordem=state.ordens.find(x=>String(x.id)===String(id));

    if(!ordem){
      aviso("Esta manutenção não está disponível para as obras liberadas ao seu usuário.","danger");

      // Remove ?id=... inválido/sem permissão sem recarregar a página.
      try{
        const url=new URL(location.href);
        if(url.searchParams.has("id")){
          url.searchParams.delete("id");
          history.replaceState(null,"",url.pathname + url.search + url.hash);
        }
      }catch(_){}

      state.selecionada=null;
      state.orcamento=null;
      state.historico=[];
      renderLista();
      renderDetalhe();
      return;
    }

    if(!usuarioPodeVerOrdem(ordem)){
      aviso("Você não possui acesso à obra desta manutenção.","danger");
      return;
    }

    state.selecionada=ordem;

    try{
      state.orcamento=await wf().carregarOrcamento(ordem.id);
    }catch(e){
      console.error("Atlas Manutenção: erro ao carregar orçamento.",e);
      state.orcamento=null;
    }

    try{
      state.historico=await wf().carregarHistorico(ordem.id);
    }catch(e){
      console.error("Atlas Manutenção: erro ao carregar histórico.",e);
      state.historico=[];
    }

    renderLista();
    renderDetalhe();
    rolarParaDetalheNoMobile();
  }

  function renderDetalhe(){
    const box=$("#manutDetalhe");if(!box)return;
    const app=$("#atlasManutencaoApp");
    const o=state.selecionada;

    /*
      No mobile, o painel de detalhe só entra no fluxo depois que
      uma ordem é escolhida. No desktop ele continua sempre visível.
    */
    app?.classList.toggle("has-selection",Boolean(o));

    if(!o){
      box.innerHTML=`<div class="atlas-manut-detail-empty">Selecione uma ordem para acompanhar o fluxo.</div>`;
      return;
    }
    const orc=state.orcamento;
    const custo=Number(orc?.valor_total ?? o.valor_orcamento ?? 0);
    box.innerHTML=`
      <div class="atlas-manut-detail-head">
        <div>
          <span class="atlas-manut-status ${statusClass(o.status)}">${esc(labelStatus(o.status))}</span>
          <h2>${esc(o.codigo||"#"+o.id)} • ${esc(o.nome_patrimonio||"Patrimônio")}</h2>
          <p>${esc(o.codigo_patrimonio||"-")} • ${esc(o.motivo||"Sem defeito informado")}</p>
        </div>
        <div class="atlas-manut-detail-value"><small>Orçamento atual</small><strong>${brl(custo)}</strong></div>
      </div>
      <div class="atlas-manut-actions">${acoesPorStatus(o)}</div>
      <div class="atlas-manut-detail-grid">
        <section class="atlas-manut-card">
          <h3>📋 Dados da ordem</h3>
          ${linha("Tipo",o.tipo_manutencao||"-")}
          ${linha("Prioridade",o.prioridade||"-")}
          ${linha("Fornecedor",o.fornecedor_nome||o.fornecedor||"-")}
          ${linha("Responsável pela entrega",o.responsavel_entrega||"-")}
          ${linha("Envio",dataHora(o.data_envio))}
          ${linha("Previsão de retorno",data(o.previsao_retorno))}
        </section>
        <section class="atlas-manut-card">
          <h3>💰 Orçamento do fornecedor</h3>
          ${orc?renderResumoOrcamento(orc):`<div class="atlas-manut-noquote">Ainda não recebemos orçamento pelo link do fornecedor.</div>`}
        </section>
      </div>
      <section class="atlas-manut-card atlas-manut-history">
        <h3>🕘 Histórico</h3>
        ${state.historico.length?state.historico.map(h=>`
          <div class="atlas-manut-history-row">
            <span class="dot"></span>
            <div><strong>${esc(labelStatus(h.status_novo)||h.acao||"Atualização")}</strong><small>${esc(h.observacao||h.acao||"")} • ${esc(h.usuario||"SISTEMA")} • ${dataHora(h.criado_em)}</small></div>
          </div>`).join(""):`<div class="atlas-manut-noquote">Histórico ainda não registrado.</div>`}
      </section>`;

    $$('[data-action]',box).forEach(btn=>btn.onclick=()=>executarAcao(btn.dataset.action));
  }

  function linha(rotulo,valor){return `<div class="atlas-manut-line"><span>${esc(rotulo)}</span><strong>${esc(valor)}</strong></div>`;}

  function renderResumoOrcamento(orc){
    return `
      ${linha("Diagnóstico",orc.diagnostico||"-")}
      ${linha("Peças",brl((orc.itens||[]).reduce((s,i)=>s+Number(i.valor_total||0),0)))}
      ${orc.mao_obra_descricao ? linha("Serviço / mão de obra",orc.mao_obra_descricao) : ""}
      ${linha("Mão de obra",brl(orc.mao_obra))}
      ${linha("Frete",brl(orc.frete))}
      ${linha("Prazo",orc.prazo_dias?`${orc.prazo_dias} dia(s)`:"-")}
      ${linha("Garantia",orc.garantia_dias?`${orc.garantia_dias} dia(s)`:"-")}
      <div class="atlas-manut-total"><span>Total</span><strong>${brl(orc.valor_total)}</strong></div>`;
  }

  function verOrcamento(){
    const o=state.selecionada;
    const orc=state.orcamento;

    if(!o || !orc){
      aviso("Esta ordem ainda não possui orçamento registrado.","danger");
      return;
    }

    const itens=(orc.itens||[]).length
      ? (orc.itens||[]).map(i=>`
          <tr>
            <td>${esc(i.descricao||"-")}</td>
            <td>${esc(i.codigo_referencia||"-")}</td>
            <td>${esc(i.quantidade||1)}</td>
            <td>${brl(i.valor_unitario||0)}</td>
            <td><strong>${brl(i.valor_total||0)}</strong></td>
          </tr>`).join("")
      : `<tr><td colspan="5" class="atlas-manut-budget-empty">Nenhuma peça/material informado.</td></tr>`;

    const corpo=`
      <div class="atlas-manut-budget-head">
        <div>
          <small>Ordem</small>
          <strong>${esc(o.codigo||"#"+o.id)}</strong>
        </div>
        <div>
          <small>Patrimônio</small>
          <strong>${esc(o.codigo_patrimonio||"-")} • ${esc(o.nome_patrimonio||"-")}</strong>
        </div>
        <div>
          <small>Fornecedor</small>
          <strong>${esc(orc.fornecedor_nome||o.fornecedor_nome||o.fornecedor||"-")}</strong>
        </div>
        <div>
          <small>Versão</small>
          <strong>${esc(orc.versao||1)}</strong>
        </div> 
      </div>

      <section class="atlas-manut-budget-section">
        <h3>Diagnóstico e serviço</h3>
        ${linha("Diagnóstico",orc.diagnostico||"-")}
        ${linha("Causa provável",orc.causa_provavel||"-")}
        ${linha("Serviço recomendado",orc.servico_recomendado||"-")}
        ${orc.mao_obra_descricao ? linha("Descrição da mão de obra",orc.mao_obra_descricao) : ""}
      </section>

      <section class="atlas-manut-budget-section">
        <h3>Peças e materiais</h3>
        <div class="atlas-manut-budget-table-wrap">
          <table class="atlas-manut-budget-table">
            <thead>
              <tr>
                <th>Descrição</th>
                <th>Referência</th>
                <th>Qtd.</th>
                <th>Unitário</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>${itens}</tbody>
          </table>
        </div>
      </section>

      <section class="atlas-manut-budget-section">
        <h3>Valores e condições</h3>
        <div class="atlas-manut-budget-values">
          ${linha("Mão de obra",brl(orc.mao_obra))}
          ${linha("Frete",brl(orc.frete))}
          ${linha("Outros custos",brl(orc.outros_custos))}
          ${linha("Desconto",brl(orc.desconto))}
          ${linha("Prazo",orc.prazo_dias?`${orc.prazo_dias} dia(s)`:"-")}
          ${linha("Garantia",orc.garantia_dias?`${orc.garantia_dias} dia(s)`:"-")}
        </div>
        <div class="atlas-manut-budget-total">
          <span>Total do orçamento</span>
          <strong>${brl(orc.valor_total)}</strong>
        </div>
      </section>`;

    const bg=modalBase(
      "atlasManutVerOrcamento",
      "Orçamento da manutenção",
      corpo,
      `<button class="atlas-btn light" data-fechar-orcamento>Fechar</button>
       <button class="atlas-btn dark" data-imprimir-orcamento>🖨 Imprimir / PDF</button>`
    );

    bg.querySelector("[data-fechar-orcamento]").onclick=()=>bg.remove();
    bg.querySelector("[data-imprimir-orcamento]").onclick=()=>imprimirOrcamento();
  }

  async function executarAcao(acao){
    const o=state.selecionada;if(!o)return;
    try{
      if(acao==="saida") return abrirRegistrarSaida(o);
      if(acao==="link") return mostrarLink(o.id);
      if(acao==="ver-orcamento") return verOrcamento();
      if(acao==="imprimir") return imprimirOrcamento();
      if(acao==="encaminhar") return encaminharOrcamento();
      if(acao==="aprovar") return decisao("ORCAMENTO_APROVADO","Aprovar orçamento",true);
      if(acao==="ajuste") return decisao("AJUSTE_SOLICITADO","Solicitar ajuste",true);
      if(acao==="recusar") return decisao("ORCAMENTO_RECUSADO","Recusar orçamento",true);
      if(acao==="receber"){
        return abrirRecebimento(o);
      }
      aviso("Status atualizado.");await carregar();await selecionar(o.id);
    }catch(e){console.error(e);aviso(e.message||"Não foi possível executar a ação.","danger");}
  }

  function telefoneSomenteNumeros(v){
    let n=String(v||"").replace(/\D/g,"");
    if(n && !n.startsWith("55")) n="55"+n;
    return n;
  }

  async function avisarFornecedorAprovacao(ordem, orcamento){
    const fornecedor=ordem.fornecedor_nome||ordem.fornecedor||"Fornecedor";
    const valor=brl(orcamento?.valor_total ?? ordem.valor_orcamento ?? 0);

    const mensagem=
      `Olá, ${fornecedor}! A BDR Construart aprovou o orçamento ` +
      `${ordem.codigo||"#"+ordem.id}, referente ao patrimônio ` +
      `${ordem.nome_patrimonio||ordem.codigo_patrimonio||""}, no valor de ${valor}. ` +
      `O serviço está autorizado conforme o orçamento enviado. ` +
      `Após a conclusão, favor combinar a devolução do patrimônio com a equipe responsável da BDR.`;

    const corpo=`
      <div class="atlas-manut-provider-approved">
        <div class="atlas-manut-provider-approved-icon">✅</div>
        <div>
          <h3>Orçamento aprovado e serviço autorizado</h3>
          <p>Agora envie a confirmação ao fornecedor.</p>
        </div>
      </div>

      <label class="atlas-manut-dialog-label">
        Mensagem
        <textarea id="atlasMsgFornecedorAprovado" data-bdr-sem-uppercase>${esc(mensagem)}</textarea>
      </label>`;

    const bg=modalBase(
      "atlasManutFornecedorAprovado",
      "Avisar fornecedor",
      corpo,
      `<button class="atlas-btn light" data-fechar-aviso>Fechar</button>
       <button class="atlas-btn dark" data-copiar-aviso>📋 Copiar</button>
       <button class="atlas-btn light" data-email-aviso>✉️ E-mail</button>
       <button class="atlas-btn success" data-whatsapp-aviso>💬 WhatsApp</button>`
    );

    const campo=$("#atlasMsgFornecedorAprovado",bg);

    bg.querySelector("[data-fechar-aviso]").onclick=()=>bg.remove();

    bg.querySelector("[data-copiar-aviso]").onclick=async()=>{
      try{
        await navigator.clipboard.writeText(campo.value);
        aviso("Mensagem copiada.");
      }catch(_){
        campo.select();
        document.execCommand("copy");
        aviso("Mensagem copiada.");
      }
    };

    bg.querySelector("[data-whatsapp-aviso]").onclick=()=>{
      const numero=telefoneSomenteNumeros(ordem.fornecedor_whatsapp);
      if(!numero){
        aviso("O fornecedor não possui WhatsApp informado.","danger");
        return;
      }
      window.open(
        `https://wa.me/${numero}?text=${encodeURIComponent(campo.value)}`,
        "_blank",
        "noopener"
      );
    };

    bg.querySelector("[data-email-aviso]").onclick=()=>{
      const email=emailNormalizado(ordem.fornecedor_email);
      if(!email){
        aviso("O fornecedor não possui e-mail informado.","danger");
        return;
      }

      const assunto=`Orçamento aprovado - ${ordem.codigo||"Manutenção BDR"}`;
      location.href=
        `mailto:${encodeURIComponent(email)}` +
        `?subject=${encodeURIComponent(assunto)}` +
        `&body=${encodeURIComponent(campo.value)}`;
    };
  }

  async function carregarObrasParaRecebimento(){
    try{
      const {data,error}=await db()
        .from("obras")
        .select("id,codigo_obra,nome,ativa,ativo")
        .order("codigo_obra",{ascending:true});

      if(error) throw error;

      return (data||[]).filter(o =>
        o.ativa !== false && o.ativo !== false
      );
    }catch(e){
      console.warn("Atlas Manutenção: não foi possível carregar obras.",e);
      return [];
    }
  }

  async function abrirRecebimento(ordem){
    const obras=await carregarObrasParaRecebimento();

    const options=obras.map(o=>
      `<option value="${esc(o.id)}">${esc(o.codigo_obra||"")} - ${esc(o.nome||"Obra")}</option>`
    ).join("");

    const corpo=`
      <div class="atlas-manut-receipt-grid">
        <section class="atlas-manut-receipt-section">
          <h3>Condição do patrimônio</h3>

          <label class="atlas-manut-radio-card">
            <input type="radio" name="atlasCondicaoRetorno" value="PERFEITO" checked>
            <span>
              <strong>✅ Recebido em perfeito estado</strong>
              <small>O patrimônio foi conferido e pode voltar à operação.</small>
            </span>
          </label>

          <label class="atlas-manut-radio-card">
            <input type="radio" name="atlasCondicaoRetorno" value="DIVERGENCIA">
            <span>
              <strong>⚠️ Recebido com divergência</strong>
              <small>Há problema, diferença ou pendência a ser tratada.</small>
            </span>
          </label>
        </section>

        <section class="atlas-manut-receipt-section">
          <h3>Destino após o recebimento</h3>

          <label class="atlas-manut-radio-card">
            <input type="radio" name="atlasDestinoRetorno" value="ESTOQUE" checked>
            <span><strong>📦 Estoque</strong><small>Disponível novamente no estoque.</small></span>
          </label>

          <label class="atlas-manut-radio-card">
            <input type="radio" name="atlasDestinoRetorno" value="EM_USO">
            <span><strong>✅ Colocar em uso</strong><small>Volta para utilização na obra atual.</small></span>
          </label>

          <label class="atlas-manut-radio-card">
            <input type="radio" name="atlasDestinoRetorno" value="OUTRA_OBRA">
            <span><strong>🏗️ Outra obra/setor</strong><small>Transfere o patrimônio após a conferência.</small></span>
          </label>

          <div id="atlasRecebimentoOutraObra" hidden>
            <label class="atlas-manut-dialog-label">
              Obra / setor de destino
              <select id="atlasRecebimentoObra">
                <option value="">Selecione...</option>
                ${options}
              </select>
            </label>
          </div>
        </section>
      </div>

      <label class="atlas-manut-dialog-label">
        Observação
        <textarea id="atlasRecebimentoObs" data-bdr-sem-uppercase
          placeholder="Ex.: patrimônio conferido, teste realizado, condição visual...">Patrimônio recebido e conferido.</textarea>
      </label>`;

    const bg=modalBase(
      "atlasManutRecebimento",
      "Registrar recebimento",
      corpo,
      `<button class="atlas-btn light" data-cancelar-recebimento>Cancelar</button>
       <button class="atlas-btn primary" data-confirmar-recebimento>📦 Confirmar recebimento</button>`
    );

    const outraObra=$("#atlasRecebimentoOutraObra",bg);

    $$('input[name="atlasDestinoRetorno"]',bg).forEach(radio=>{
      radio.addEventListener("change",()=>{
        outraObra.hidden=
          bg.querySelector('input[name="atlasDestinoRetorno"]:checked')?.value !== "OUTRA_OBRA";
      });
    });

    bg.querySelector("[data-cancelar-recebimento]").onclick=()=>bg.remove();

    bg.querySelector("[data-confirmar-recebimento]").onclick=async()=>{
      const btn=bg.querySelector("[data-confirmar-recebimento]");
      const condicao=
        bg.querySelector('input[name="atlasCondicaoRetorno"]:checked')?.value || "PERFEITO";
      const destino=
        bg.querySelector('input[name="atlasDestinoRetorno"]:checked')?.value || "ESTOQUE";
      const obraId=$("#atlasRecebimentoObra",bg)?.value || null;
      const observacao=$("#atlasRecebimentoObs",bg).value.trim();

      if(destino==="OUTRA_OBRA" && !obraId){
        aviso("Selecione a obra/setor de destino.","danger");
        return;
      }

      btn.disabled=true;
      btn.textContent="Registrando...";

      try{
        const resultado=await wf().registrarRecebimento(ordem.id,{
          condicao,
          destino,
          obra_destino_id:obraId,
          observacao
        });

        bg.remove();

        if(condicao==="DIVERGENCIA"){
          aviso("Recebimento registrado com divergência.","warning");
        }else{
          aviso("Patrimônio recebido e manutenção finalizada.");
        }

        await carregar();
        await selecionar(ordem.id);
      }catch(e){
        console.error(e);
        aviso(e.message||"Não foi possível registrar o recebimento.","danger");
        btn.disabled=false;
        btn.textContent="📦 Confirmar recebimento";
      }
    };
  }


  async function decisao(status,titulo,exigeMotivo){
    const motivo = await pedirTextoAtlas(
      titulo,
      exigeMotivo ? "Observação / justificativa" : "Observação",
      "",
      exigeMotivo
    );

    if(motivo === null) return;

    const ordemAntes={...state.selecionada};
    const orcamentoAntes=state.orcamento ? {...state.orcamento} : null;

    if(status==="ORCAMENTO_APROVADO"){
      /*
        Um único clique:
        ORCAMENTO_RECEBIDO -> ORCAMENTO_APROVADO -> EM_MANUTENCAO
        O estado ORCAMENTO_APROVADO fica registrado no histórico, mas
        não exige um segundo botão "Iniciar manutenção".
      */
      await wf().mudarStatus(
        state.selecionada.id,
        "ORCAMENTO_APROVADO",
        String(motivo || "").trim()
      );

      await wf().mudarStatus(
        state.selecionada.id,
        "EM_MANUTENCAO",
        "Orçamento aprovado. Serviço autorizado ao fornecedor."
      );

      aviso("Orçamento aprovado e serviço autorizado.");

      await carregar();
      await selecionar(ordemAntes.id);

      await avisarFornecedorAprovacao(
        {...ordemAntes,...state.selecionada},
        orcamentoAntes || state.orcamento
      );

      return;
    }

    await wf().mudarStatus(
      state.selecionada.id,
      status,
      String(motivo || "").trim()
    );

    aviso(`${titulo} registrado.`);
    await carregar();
    await selecionar(state.selecionada.id);
  }


  function abrirRegistrarSaida(o){
    const corpo=`
      <div class="atlas-manut-form-grid">
        <label>Fornecedor / oficina
          <input id="arsFornecedor" value="${esc(o.fornecedor_nome||o.fornecedor||"")}">
        </label>
        <label>Responsável pela entrega
          <input id="arsResponsavel" value="${esc(usuarioAtual()?.nome||usuarioAtual()?.usuario||"")}" readonly data-bdr-sem-uppercase>
          <small class="atlas-field-hint">Vinculado ao usuário que está registrando a saída.</small>
        </label>
        <label>Meio de transporte
          <select id="arsTransporte"><option>VEÍCULO DA EMPRESA</option><option>TRANSPORTADORA</option><option>FORNECEDOR RETIRA</option><option>OUTRO</option></select>
        </label>
        <label>Motorista / transportador
          <input id="arsMotorista" placeholder="Nome do motorista ou transportadora">
        </label>
        <label>Placa
          <input id="arsPlaca" placeholder="ABC1D23">
        </label>
        <label>Previsão de retorno
          <input id="arsRetorno" type="date">
        </label>
        <label>WhatsApp fornecedor
          <input id="arsWhatsapp" value="${esc(o.fornecedor_whatsapp||"")}">
        </label>
        <label>E-mail fornecedor
          <input id="arsEmail" type="email" data-bdr-sem-uppercase value="${esc(emailNormalizado(o.fornecedor_email||""))}">
        </label>
      </div>`;
    const bg=modalBase("atlasManutSaida","🚚 Registrar saída para manutenção",corpo,
      `<button class="atlas-btn light" data-cancel>Cancelar</button><button class="atlas-btn primary" data-save>Registrar saída e gerar link</button>`);
    bg.querySelector("[data-cancel]").onclick=()=>bg.remove();
    aplicarEmailMinusculo($("#arsEmail",bg));

    bg.querySelector("[data-save]").onclick=async()=>{
      const b=bg.querySelector("[data-save]");b.disabled=true;
      try{
        const r=await wf().registrarSaida(o.id,{
          fornecedor_nome:$("#arsFornecedor",bg).value.trim(),
          responsavel_entrega:usuarioAtual()?.nome || usuarioAtual()?.usuario || "SISTEMA",
          meio_transporte:$("#arsTransporte",bg).value,
          motorista:$("#arsMotorista",bg).value.trim(),
          placa:$("#arsPlaca",bg).value.trim().toUpperCase(),
          previsao_retorno:$("#arsRetorno",bg).value||null,
          fornecedor_whatsapp:$("#arsWhatsapp",bg).value.trim(),
          fornecedor_email:emailNormalizado($("#arsEmail",bg).value)
        });
        bg.remove();

        // Atualiza imediatamente o estado local antes de qualquer nova ação.
        if(r?.ordem){
          state.ordens = state.ordens.map(item =>
            String(item.id) === String(r.ordem.id) ? {...item,...r.ordem} : item
          );
          state.selecionada = {...(state.selecionada || {}),...r.ordem};
        }

        await carregar();
        await selecionar(o.id);

        if(r?.parcial){
          aviso(
            r.mensagem || "Saída registrada. Falta concluir a geração do link.",
            "warning"
          );
          return;
        }

        aviso("Saída registrada. Link do fornecedor disponível.");

        if(r?.link){
          await mostrarLink(o.id,r.link);
        }
      }catch(e){
        console.error(e);

        /*
          Mesmo em erro, recarrega a ordem do banco.
          Assim, se a primeira etapa já tiver sido salva, o botão
          Registrar saída desaparece e não permite duplicar a operação.
        */
        try{
          await carregar();
          await selecionar(o.id);
        }catch(_){}

        aviso(e.message||"Erro ao registrar saída.","danger");
        b.disabled=false;
      }
    };
  }

  async function mostrarLink(id,linkPronto){
    try{
      let l = linkPronto;

      if(!l){
        const preparado = await wf().prepararLinkFornecedor(id);
        l = preparado.link;

        if(preparado?.ordem){
          state.ordens = state.ordens.map(item =>
            String(item.id) === String(preparado.ordem.id)
              ? {...item,...preparado.ordem}
              : item
          );
          state.selecionada = {...(state.selecionada || {}),...preparado.ordem};
          atualizarKpis();
          renderLista();
          renderDetalhe();
        }
      }
      if(!l?.url){
        throw new Error(
          "O link do fornecedor ainda não foi gerado. Tente novamente em alguns segundos."
        );
      }

      const o=state.ordens.find(x=>String(x.id)===String(id))||state.selecionada||{};
      const msg=`Olá! A BDR Construart encaminhou a ordem de manutenção ${o.codigo||"#"+id}. Por favor, acesse o link abaixo para preencher diagnóstico e orçamento:\n\n${l.url}`;
      const corpo=`
        <div class="atlas-link-box">
          <div class="atlas-link-icon">🔗</div>
          <div><h3>Link seguro do fornecedor</h3><p>Válido até ${dataHora(l.expira_em)}. O fornecedor verá apenas esta ordem.</p></div>
        </div>
        <input class="atlas-link-input" id="linkFornecedor" readonly value="${esc(l.url)}">
        <div class="atlas-share-grid">
          <button class="atlas-share whatsapp" data-whats>💬 Enviar pelo WhatsApp</button>
          <button class="atlas-share email" data-email>✉️ Enviar por e-mail</button>
          <button class="atlas-share copy" data-copy>📋 Copiar link</button>
        </div>
        <div class="atlas-manut-note">Quando o fornecedor clicar em <b>Enviar orçamento</b>, o Atlas muda automaticamente para <b>Orçamento recebido</b> e a Central de Manutenção atualiza.</div>`;
      const bg=modalBase("atlasManutLink","📨 Encaminhar ao fornecedor",corpo,`<button class="atlas-btn primary" data-ok>Concluir</button>`);
      bg.querySelector("[data-ok]").onclick=()=>bg.remove();
      bg.querySelector("[data-copy]").onclick=async()=>{await navigator.clipboard.writeText(l.url);aviso("Link copiado.");};
      bg.querySelector("[data-whats]").onclick=()=>window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`,"_blank","noopener");
      bg.querySelector("[data-email]").onclick=()=>location.href=`mailto:${encodeURIComponent(emailNormalizado(o.fornecedor_email||""))}?subject=${encodeURIComponent("Orçamento de manutenção "+(o.codigo||""))}&body=${encodeURIComponent(msg)}`;
    }catch(e){console.error(e);aviso(e.message||"Erro ao gerar link.","danger");}
  }


  async function encaminharOrcamento(){
    const o=state.selecionada;
    if(!o) return;

    let orc=state.orcamento;

    if(!orc){
      try{
        orc=await wf().carregarOrcamento(o.id);
        state.orcamento=orc;
      }catch(e){
        console.error("Atlas Manutenção: não foi possível carregar orçamento para encaminhar.",e);
      }
    }

    if(!orc){
      aviso("O orçamento foi recebido, mas os detalhes ainda não puderam ser carregados.","danger");
      return;
    }
    const maoObraTexto=orc.mao_obra_descricao
      ? `\nMão de obra / serviço: ${orc.mao_obra_descricao}`
      : "";
    const resumo=`Orçamento de manutenção ${o.codigo||""}\nPatrimônio: ${o.codigo_patrimonio||"-"} - ${o.nome_patrimonio||"-"}\nFornecedor: ${orc.fornecedor_nome||o.fornecedor_nome||o.fornecedor||"-"}${maoObraTexto}\nTotal: ${brl(orc.valor_total)}\nPrazo: ${orc.prazo_dias||"-"} dia(s)\nGarantia: ${orc.garantia_dias||"-"} dia(s)\n\nAbra o Atlas para análise e aprovação.`;
    const corpo=`<div class="atlas-link-box"><div class="atlas-link-icon">📨</div><div><h3>Encaminhar orçamento para outro responsável</h3><p>Use WhatsApp, e-mail ou copie o resumo. Para documento formal, use Imprimir / PDF.</p></div></div><textarea id="resumoEncaminhar" style="width:100%;min-height:170px;margin-top:12px;padding:10px;border:1px solid #d4dde7;border-radius:9px">${esc(resumo)}</textarea><div class="atlas-share-grid" style="margin-top:10px"><button class="atlas-share whatsapp" data-w>💬 WhatsApp</button><button class="atlas-share email" data-e>✉️ E-mail</button><button class="atlas-share copy" data-c>📋 Copiar resumo</button></div>`;
    const bg=modalBase("atlasEncaminharOrcamento","📨 Encaminhar orçamento",corpo,`<button class="atlas-btn primary" data-ok>Concluir</button>`);
    bg.querySelector("[data-ok]").onclick=()=>bg.remove();
    bg.querySelector("[data-w]").onclick=()=>window.open(`https://wa.me/?text=${encodeURIComponent(resumo)}`,"_blank","noopener");
    bg.querySelector("[data-e]").onclick=()=>location.href=`mailto:?subject=${encodeURIComponent("Orçamento de manutenção "+(o.codigo||""))}&body=${encodeURIComponent(resumo)}`;
    bg.querySelector("[data-c]").onclick=async()=>{await navigator.clipboard.writeText(resumo);aviso("Resumo copiado.");};
  }
  function montarHtmlOrcamentoCompacto(o,orc,opcoes={}){
    const modoLote=Boolean(opcoes.modoLote);
    const pecas=(orc.itens||[]).map(i=>`
      <tr>
        <td>${esc(i.descricao||"-")}</td>
        <td>${esc(i.codigo_referencia||"-")}</td>
        <td class="num">${esc(i.quantidade||1)}</td>
        <td class="num">${brl(i.valor_unitario||0)}</td>
        <td class="num strong">${brl(i.valor_total||0)}</td>
      </tr>`).join("") || `<tr><td colspan="5" class="empty">Sem peças ou materiais informados.</td></tr>`;

    const dataOrc=orc.enviado_em||orc.atualizado_em||"";
    const fornecedor=orc.fornecedor_nome||o.fornecedor_nome||o.fornecedor||"-";

    return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>${esc(o.codigo||"Orçamento de manutenção")}</title>
<style>
  @page{size:A4 portrait;margin:${ATLAS_MANUT_CONFIG.pdfTopoMm}mm ${ATLAS_MANUT_CONFIG.pdfMargemLateralMm}mm ${ATLAS_MANUT_CONFIG.pdfMargemInferiorMm}mm}
  *{box-sizing:border-box}
  html,body{margin:0;padding:0}
  body{font-family:Arial,Helvetica,sans-serif;color:#172033;font-size:9.3px;line-height:1.3;background:#fff}
  .sheet{width:100%;max-width:192mm;margin:0 auto}
  .header{display:flex;justify-content:space-between;gap:14px;align-items:flex-start;border-bottom:2px solid #b5121b;padding:0 0 7px;margin-bottom:7px}
  .brand h1{margin:0;color:#b5121b;font-size:17px;letter-spacing:.1px}
  .brand p{margin:2px 0 0;color:#64748b;font-size:8px}
  .doc{text-align:right;min-width:56mm}
  .doc strong{display:block;font-size:12px;color:#172033}
  .doc span{display:block;color:#64748b;font-size:8px;margin-top:2px}
  .meta{display:grid;grid-template-columns:1fr 1fr 1fr;gap:5px;margin-bottom:6px}
  .meta .cell{border:1px solid #dbe3ec;border-radius:5px;padding:5px 6px;min-height:31px}
  .label{display:block;color:#64748b;text-transform:uppercase;font-weight:700;font-size:6.8px;letter-spacing:.25px;margin-bottom:2px}
  .value{font-weight:700;font-size:8.7px;overflow-wrap:anywhere}
  .section{border:1px solid #dbe3ec;border-radius:6px;margin-top:6px;break-inside:avoid}
  .section-title{padding:4px 6px;border-bottom:1px solid #e5eaf0;background:#f8fafc;font-weight:800;color:#9f1018;font-size:8.5px}
  .section-body{padding:5px 6px}
  .text-grid{display:grid;grid-template-columns:1fr 1fr;gap:5px 10px}
  .text-item.full{grid-column:1/-1}
  .text-item p{margin:1px 0 0;white-space:pre-wrap;overflow-wrap:anywhere}
  table{width:100%;border-collapse:collapse;font-size:8px}
  th{background:#f8fafc;color:#475569;text-transform:uppercase;font-size:6.8px;letter-spacing:.15px}
  th,td{padding:3.5px 4px;border-bottom:1px solid #e7ebf0;text-align:left;vertical-align:top}
  td.num,th.num{text-align:right;white-space:nowrap}
  td.strong{font-weight:800}
  .empty{text-align:center;color:#94a3b8;padding:8px}
  .costs{display:grid;grid-template-columns:1fr 1fr;gap:2px 14px}
  .cost-line{display:flex;justify-content:space-between;gap:12px;padding:2px 0;border-bottom:1px dotted #e5e7eb}
  .cost-line span:first-child{color:#64748b}
  .conditions{display:flex;gap:14px;flex-wrap:wrap;margin-top:5px;padding-top:4px;border-top:1px solid #eef2f6;color:#475569}
  .total-row{display:flex;justify-content:flex-end;align-items:baseline;gap:10px;margin-top:6px;padding-top:6px;border-top:2px solid #fecaca}
  .total-row span{font-size:9px;font-weight:700;color:#64748b}
  .total-row strong{font-size:18px;color:#b5121b}
  .footer{display:flex;justify-content:space-between;gap:10px;margin-top:7px;padding-top:5px;border-top:1px solid #e5e7eb;color:#94a3b8;font-size:6.8px}
  .no-print{margin:12px auto 0;text-align:center}
  .no-print button{border:0;border-radius:7px;padding:8px 13px;font-weight:700;cursor:pointer;background:#172033;color:#fff}
  @media print{.no-print{display:none}.sheet{max-width:none}.section{break-inside:avoid}}
</style>
</head>
<body>
<div class="sheet">
  <header class="header">
    <div class="brand">
      <h1>BDR CONSTRUART</h1>
      <p>Gestão de Manutenção Patrimonial</p>
    </div>
    <div class="doc">
      <strong>ORÇAMENTO DE MANUTENÇÃO</strong>
      <span>${esc(o.codigo||"-")}</span>
    </div>
  </header>

  <section class="meta">
    <div class="cell"><span class="label">Patrimônio</span><span class="value">${esc(o.codigo_patrimonio||"-")}</span></div>
    <div class="cell"><span class="label">Item</span><span class="value">${esc(o.nome_patrimonio||"-")}</span></div>
    <div class="cell"><span class="label">Fornecedor</span><span class="value">${esc(fornecedor)}</span></div>
    <div class="cell"><span class="label">Tipo</span><span class="value">${esc(o.tipo_manutencao||"-")}</span></div>
    <div class="cell"><span class="label">Prioridade</span><span class="value">${esc(o.prioridade||"-")}</span></div>
    <div class="cell"><span class="label">Data do orçamento</span><span class="value">${dataOrc?dataHora(dataOrc):"-"}</span></div>
  </section>

  <section class="section">
    <div class="section-title">Diagnóstico e serviço</div>
    <div class="section-body text-grid">
      <div class="text-item full"><span class="label">Defeito informado</span><p>${esc(o.motivo||"-")}</p></div>
      <div class="text-item"><span class="label">Diagnóstico</span><p>${esc(orc.diagnostico||"-")}</p></div>
      <div class="text-item"><span class="label">Causa provável</span><p>${esc(orc.causa_provavel||"-")}</p></div>
      <div class="text-item full"><span class="label">Serviço recomendado</span><p>${esc(orc.servico_recomendado||"-")}</p></div>
      ${orc.mao_obra_descricao?`<div class="text-item full"><span class="label">Descrição da mão de obra</span><p>${esc(orc.mao_obra_descricao)}</p></div>`:""}
    </div>
  </section>

  <section class="section">
    <div class="section-title">Peças e materiais</div>
    <div class="section-body" style="padding:0 6px 3px">
      <table>
        <thead><tr><th>Descrição</th><th>Referência</th><th class="num">Qtd.</th><th class="num">Unitário</th><th class="num">Total</th></tr></thead>
        <tbody>${pecas}</tbody>
      </table>
    </div>
  </section>

  <section class="section">
    <div class="section-title">Valores e condições</div>
    <div class="section-body">
      <div class="costs">
        <div class="cost-line"><span>Mão de obra</span><strong>${brl(orc.mao_obra||0)}</strong></div>
        <div class="cost-line"><span>Frete</span><strong>${brl(orc.frete||0)}</strong></div>
        <div class="cost-line"><span>Outros custos</span><strong>${brl(orc.outros_custos||0)}</strong></div>
        <div class="cost-line"><span>Desconto</span><strong>-${brl(orc.desconto||0)}</strong></div>
      </div>
      <div class="conditions">
        <span><b>Prazo:</b> ${orc.prazo_dias||"-"} dia(s)</span>
        <span><b>Garantia:</b> ${orc.garantia_dias||"-"} dia(s)</span>
        ${orc.observacoes?`<span><b>Observação:</b> ${esc(orc.observacoes)}</span>`:""}
      </div>
      <div class="total-row"><span>TOTAL DO ORÇAMENTO</span><strong>${brl(orc.valor_total||0)}</strong></div>
    </div>
  </section>

  <footer class="footer">
    <span>Documento gerado pelo BDR Construart</span>
    <span>${modoLote?"Documento preparado para impressão em lote":"Orçamento vinculado à ordem "+esc(o.codigo||"-")}</span>
  </footer>
</div>
</body>
</html>`;
  }

  async function imprimirOrcamento(){
    const o=state.selecionada;
    if(!o) return;

    let orc=state.orcamento;

    if(!orc){
      try{
        orc=await wf().carregarOrcamento(o.id);
        state.orcamento=orc;
      }catch(e){
        console.error("Atlas Manutenção: não foi possível carregar orçamento para PDF.",e);
      }
    }

    if(!orc){
      aviso("O orçamento foi recebido, mas os detalhes ainda não puderam ser carregados.","danger");
      return;
    }

    const html=montarHtmlOrcamentoCompacto(o,orc,{modoLote:false});
    const w=window.open("","_blank","width=900,height=820");
    if(!w){
      aviso("O navegador bloqueou a janela de impressão. Libere pop-ups para o Atlas.","danger");
      return;
    }

    w.document.open();
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(()=>w.print(),300);
  }

  function iniciarCentral(){
    atualizarTopbarUsuario();

    const root=$("#atlasManutencaoApp");if(!root)return;
    $("#manutBusca")?.addEventListener("input",()=>{
      state.pagina=1;
      renderLista();
    });
    $("#manutFiltroStatus")?.addEventListener("change",()=>{
      state.pagina=1;
      renderLista();
    });
    $("#manutLista")?.addEventListener("click",e=>{const row=e.target.closest("[data-id]");if(row)selecionar(row.dataset.id);});
    $("#btnManutAtualizar")?.addEventListener("click",async()=>{await carregar();aviso("Central atualizada.");});
    carregar().then(async()=>{
      const id=new URLSearchParams(location.search).get("id");
      if(id) await selecionar(id);
    }).catch(e=>{
      console.error(e);
      root.innerHTML=`<div class="atlas-manut-setup"><h2>⚠️ Estrutura de manutenção ainda não preparada</h2><p>${esc(e.message||e)}</p><p>Execute primeiro <b>SQL/atlas_manutencao.sql</b> no Supabase.</p></div>`;
    });

    try{
      state.realtime=db().channel("atlas-manutencao-central")
        .on("postgres_changes",{event:"*",schema:"public",table:"manutencoes_patrimonio"},async()=>{
          await carregar();
          if(state.selecionada) await selecionar(state.selecionada.id);
        }).subscribe();
    }catch(e){console.warn("Realtime manutenção indisponível",e);}
  }

  window.AtlasManutencao={
    __loaded:true,
    /* versão interna oculta */
    abrir,
    carregar,
    selecionar,
    mostrarLink,
    imprimirOrcamento
  };

  document.addEventListener("DOMContentLoaded",iniciarCentral);
  console.log("✅ ATLAS MANUTENÇÃO carregado - acesso por obra ativo, JS sem CSS injetado");
})();
