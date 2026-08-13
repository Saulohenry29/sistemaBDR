/* =========================================================
   ATLAS MANUTENÇÃO — PORTAL DO FORNECEDOR
   Arquivo oficial: JS/atlasManutencaoFornecedor.js
========================================================= */
(function(){
  "use strict";

  const $=(s,c=document)=>c.querySelector(s);
  const $$=(s,c=document)=>[...c.querySelectorAll(s)];

  const state={token:null,dados:null};

  function db(){
    return window.client||window.supabaseClient||globalThis.client;
  }

  function numero(v){
    if(typeof v==="number") return Number.isFinite(v)?v:0;

    const s=String(v??"")
      .trim()
      .replace(/R\$/gi,"")
      .replace(/\s/g,"");

    if(!s) return 0;

    if(s.includes(",")){
      return Number(s.replace(/\./g,"").replace(",","."))||0;
    }

    return Number(s)||0;
  }

  function brl(v){
    return Number(v||0).toLocaleString("pt-BR",{
      style:"currency",
      currency:"BRL"
    });
  }

  /* =======================================================
     MOEDA BRASILEIRA POR CENTAVOS
     1 -> 0,01 | 1500 -> 15,00 | 123456 -> 1.234,56
  ======================================================= */
  function formatarCentavos(centavos){
    return (Math.max(0,Number(centavos)||0)/100).toLocaleString("pt-BR",{
      minimumFractionDigits:2,
      maximumFractionDigits:2
    });
  }

  function valorEmCentavos(valor){
    return Math.max(0,Math.round(numero(valor)*100));
  }

  function valorCampoMoeda(input){
    return Number(input?.dataset?.centavos||0)/100;
  }

  function cursorFim(input){
    if(!input) return;
    requestAnimationFrame(()=>{
      try{
        const fim=String(input.value||"").length;
        input.setSelectionRange(fim,fim);
      }catch(_){}
    });
  }

  function renderMoeda(input){
    if(!input) return;
    input.value=formatarCentavos(input.dataset.centavos||0);
    cursorFim(input);
  }

  function definirMoeda(input,valor){
    if(!input) return;
    input.dataset.centavos=String(valorEmCentavos(valor));
    renderMoeda(input);
  }

  function adicionarDigitos(input,dado){
    const digitos=String(dado||"").replace(/\D/g,"");
    if(!digitos) return;

    let atual=String(Number(input.dataset.centavos||0));
    if(Number(atual)===0) atual="";

    input.dataset.centavos=String(Number((atual+digitos)||0));
    renderMoeda(input);
  }

  function apagarDigito(input){
    const atual=String(Number(input.dataset.centavos||0));
    input.dataset.centavos=
      atual.length>1
        ? String(Number(atual.slice(0,-1))||0)
        : "0";
    renderMoeda(input);
  }

  function ligarCampoMoeda(input){
    if(!input||input.dataset.moedaLigada==="1") return;

    input.dataset.moedaLigada="1";
    input.type="text";
    input.inputMode="numeric";
    input.autocomplete="off";
    input.removeAttribute("min");
    input.removeAttribute("max");
    input.removeAttribute("step");

    definirMoeda(input,input.value);

    const suportaBeforeInput=("onbeforeinput" in input);

    if(suportaBeforeInput){
      input.addEventListener("beforeinput",e=>{
        const tipo=String(e.inputType||"");
        const dado=String(e.data||"");

        if(tipo==="insertText"||tipo==="insertCompositionText"){
          if(!/^[0-9.,]+$/.test(dado)){
            e.preventDefault();
            return;
          }

          e.preventDefault();

          // Vírgula e ponto são opcionais.
          adicionarDigitos(input,dado);
          recalcular();
          return;
        }

        if(tipo==="deleteContentBackward"){
          e.preventDefault();
          apagarDigito(input);
          recalcular();
          return;
        }

        if(tipo==="deleteContentForward"){
          e.preventDefault();
          input.dataset.centavos="0";
          renderMoeda(input);
          recalcular();
        }
      });
    }else{
      input.addEventListener("keydown",e=>{
        if(e.ctrlKey||e.metaKey||e.altKey) return;

        if(/^[0-9]$/.test(e.key)){
          e.preventDefault();
          adicionarDigitos(input,e.key);
          recalcular();
          return;
        }

        if(e.key==="Backspace"){
          e.preventDefault();
          apagarDigito(input);
          recalcular();
          return;
        }

        if(e.key==="Delete"){
          e.preventDefault();
          input.dataset.centavos="0";
          renderMoeda(input);
          recalcular();
          return;
        }

        if(e.key===","||e.key==="."){
          e.preventDefault();
        }
      });
    }

    input.addEventListener("paste",e=>{
      e.preventDefault();

      const texto=String(e.clipboardData?.getData("text")||"");
      const digitos=texto.replace(/\D/g,"");

      if(!digitos) return;

      input.dataset.centavos=String(Number(digitos)||0);
      renderMoeda(input);
      recalcular();
    });

    input.addEventListener("focus",()=>cursorFim(input));
    input.addEventListener("click",()=>cursorFim(input));
    input.addEventListener("blur",()=>{
      renderMoeda(input);
      recalcular();
    });
  }

  function esc(v){
    return String(v??"").replace(/[&<>'"]/g,ch=>({
      "&":"&amp;",
      "<":"&lt;",
      ">":"&gt;",
      "'":"&#39;",
      '"':"&quot;"
    }[ch]));
  }

  function mostrarErro(msg){
    $("#portalLoading").hidden=true;
    $("#portalConteudo").hidden=true;
    $("#portalSucesso").hidden=true;
    $("#portalErro").hidden=false;
    $("#portalErroTexto").textContent=msg;
  }

  function preencher(d){
    state.dados=d;

    const m=d?.manutencao||{};
    const p=d?.patrimonio||{};
    const o=d?.orcamento||{};

    $("#ordemCodigo").textContent=m.codigo||"Ordem de manutenção";
    $("#patCodigo").textContent=p.codigo||"-";
    $("#patNome").textContent=p.nome||"-";
    $("#patMarcaModelo").textContent=[p.marca,p.modelo].filter(Boolean).join(" • ")||"-";
    $("#patSerie").textContent=p.numero_serie||"-";
    $("#patLocal").textContent=p.localizacao||"-";
    $("#defeitoInformado").textContent=m.motivo||"-";

    $("#fornecedorNome").value=o.fornecedor_nome||m.fornecedor_nome||"";
    $("#diagnostico").value=o.diagnostico||"";
    $("#causaProvavel").value=o.causa_provavel||"";
    $("#servicoRecomendado").value=o.servico_recomendado||"";
    $("#maoObraDescricao").value=o.mao_obra_descricao||"";

    definirMoeda($("#maoObra"),o.mao_obra||0);
    definirMoeda($("#frete"),o.frete||0);
    definirMoeda($("#outrosCustos"),o.outros_custos||0);
    definirMoeda($("#desconto"),o.desconto||0);

    $("#prazoDias").value=o.prazo_dias||"";
    $("#garantiaDias").value=o.garantia_dias||"";
    $("#observacoes").value=o.observacoes||"";
    $("#urlOrcamento").value=o.url_orcamento||"";

    const itens=Array.isArray(o.itens)?o.itens:[];

    $("#itensOrcamento").innerHTML="";

    if(itens.length){
      itens.forEach(i=>adicionarItem(i));
    }else{
      adicionarItem();
    }

    recalcular();

    $("#portalLoading").hidden=true;
    $("#portalErro").hidden=true;
    $("#portalConteudo").hidden=false;
  }

  function adicionarItem(item={}){
    const row=document.createElement("div");
    row.className="forn-item-row";

    row.innerHTML=`
      <input class="item-desc" type="text" placeholder="Peça / material" value="${esc(item.descricao||"")}">
      <input class="item-ref" type="text" placeholder="Código / referência" value="${esc(item.codigo_referencia||"")}">
      <input class="item-qtd" type="number" min="0" step="0.001" value="${item.quantidade??1}" aria-label="Quantidade">
      <input class="item-unit forn-money" type="text" inputmode="numeric" autocomplete="off" data-moeda-brl value="0,00" aria-label="Valor unitário">
      <strong class="item-total">R$ 0,00</strong>
      <button class="item-remove" type="button" title="Remover peça" aria-label="Remover peça">×</button>
    `;

    const unitario=$(".item-unit",row);

    ligarCampoMoeda(unitario);
    definirMoeda(unitario,item.valor_unitario||0);

    $(".item-qtd",row).addEventListener("input",recalcular);
    $(".item-desc",row).addEventListener("input",recalcular);
    $(".item-ref",row).addEventListener("input",recalcular);

    $(".item-remove",row).addEventListener("click",()=>{
      row.remove();
      if(!$("#itensOrcamento").children.length) adicionarItem();
      recalcular();
    });

    $("#itensOrcamento").appendChild(row);
    recalcular();
  }

  function itensPayload(){
    return $$(".forn-item-row")
      .map(row=>{
        const quantidade=numero($(".item-qtd",row).value)||1;
        const valor_unitario=valorCampoMoeda($(".item-unit",row));

        return {
          descricao:$(".item-desc",row).value.trim(),
          codigo_referencia:$(".item-ref",row).value.trim(),
          quantidade,
          valor_unitario,
          valor_total:quantidade*valor_unitario
        };
      })
      .filter(i=>i.descricao);
  }

  function recalcular(){
    let pecas=0;

    $$(".forn-item-row").forEach(row=>{
      const qtd=numero($(".item-qtd",row).value)||1;
      const unit=valorCampoMoeda($(".item-unit",row));
      const total=qtd*unit;

      pecas+=total;
      $(".item-total",row).textContent=brl(total);
    });

    const total=Math.max(
      0,
      pecas+
      valorCampoMoeda($("#maoObra"))+
      valorCampoMoeda($("#frete"))+
      valorCampoMoeda($("#outrosCustos"))-
      valorCampoMoeda($("#desconto"))
    );

    $("#totalPecasTabela").textContent=brl(pecas);
    $("#totalPecas").textContent=brl(pecas);
    $("#totalOrcamento").textContent=brl(total);

    return total;
  }

  async function carregar(){
    state.token=new URLSearchParams(location.search).get("t");

    if(!state.token){
      mostrarErro("O link não contém um token de acesso.");
      return;
    }

    try{
      const banco=db();
      if(!banco) throw new Error("Conexão com o banco de dados indisponível.");

      const {data:estado,error:erroEstado}=await banco.rpc(
        "atlas_manutencao_fornecedor_estado",
        {p_token:state.token}
      );

      if(erroEstado) throw erroEstado;

      if(estado?.bloqueado){
        $("#portalLoading").hidden=true;
        $("#portalConteudo").hidden=true;
        $("#portalErro").hidden=true;
        $("#portalSucesso").hidden=false;

        const titulo=$("#portalSucesso h2");
        const paragrafos=$$("#portalSucesso p");

        if(titulo) titulo.textContent="Orçamento já enviado";

        if(paragrafos[0]){
          paragrafos[0].innerHTML=
            `A BDR já recebeu este orçamento`+
            (estado.valor_total!=null?` no valor de <b>${brl(estado.valor_total)}</b>`:"")+
            `. Este link foi encerrado e não permite novas alterações.`;
        }

        if(paragrafos[1]){
          paragrafos[1].textContent=
            "Se a BDR solicitar um ajuste, será disponibilizado um novo acesso.";
        }

        $("#ordemCodigo").textContent=estado.codigo||"Ordem de manutenção";
        return;
      }

      const {data,error}=await banco.rpc(
        "atlas_manutencao_fornecedor_dados",
        {p_token:state.token}
      );

      if(error) throw error;

      preencher(data);

    }catch(e){
      console.error("ATLAS fornecedor:",e);
      mostrarErro(e?.message||"Link inválido ou expirado.");
    }
  }

  async function enviar(){
    const fornecedor=$("#fornecedorNome").value.trim();
    const diagnostico=$("#diagnostico").value.trim();
    const servico=$("#servicoRecomendado").value.trim();

    if(fornecedor.length<2){
      alert("Informe o nome da empresa/oficina.");
      $("#fornecedorNome").focus();
      return;
    }

    if(diagnostico.length<5){
      alert("Informe o diagnóstico com pelo menos 5 caracteres.");
      $("#diagnostico").focus();
      return;
    }

    if(servico.length<5){
      alert("Informe o serviço recomendado.");
      $("#servicoRecomendado").focus();
      return;
    }

    const botao=$("#btnEnviarOrcamento");
    botao.disabled=true;
    botao.textContent="Enviando orçamento...";

    try{
      const payload={
        fornecedor_nome:fornecedor,
        diagnostico,
        causa_provavel:$("#causaProvavel").value.trim(),
        servico_recomendado:servico,
        mao_obra_descricao:$("#maoObraDescricao").value.trim(),
        mao_obra:valorCampoMoeda($("#maoObra")),
        frete:valorCampoMoeda($("#frete")),
        outros_custos:valorCampoMoeda($("#outrosCustos")),
        desconto:valorCampoMoeda($("#desconto")),
        prazo_dias:numero($("#prazoDias").value)||null,
        garantia_dias:numero($("#garantiaDias").value)||null,
        observacoes:$("#observacoes").value.trim(),
        url_orcamento:$("#urlOrcamento").value.trim(),
        itens:itensPayload()
      };

      const banco=db();
      if(!banco) throw new Error("Conexão com o banco de dados indisponível.");

      const {data,error}=await banco.rpc(
        "atlas_manutencao_fornecedor_enviar_orcamento",
        {
          p_token:state.token,
          p_orcamento:payload
        }
      );

      if(error) throw error;

      $("#portalConteudo").hidden=true;
      $("#portalSucesso").hidden=false;
      $("#sucessoTotal").textContent=brl(data?.valor_total??recalcular());

    }catch(e){
      console.error("ATLAS fornecedor:",e);
      alert(e?.message||"Não foi possível enviar o orçamento.");
      botao.disabled=false;
      botao.textContent="Enviar orçamento para a BDR";
    }
  }

  document.addEventListener("DOMContentLoaded",()=>{
    $$("[data-moeda-brl]").forEach(ligarCampoMoeda);
    $("#btnAdicionarItem").addEventListener("click",()=>adicionarItem());
    $("#btnEnviarOrcamento").addEventListener("click",enviar);
    carregar();
    console.info("✅ ATLAS PORTAL DO FORNECEDOR carregado");
  });

})();
