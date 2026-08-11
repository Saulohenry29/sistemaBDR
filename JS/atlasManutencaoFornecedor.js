/* =========================================================
   ATLAS MANUTENÇÃO — PORTAL DO FORNECEDOR
   Arquivo definitivo: JS/atlasManutencaoFornecedor.js
========================================================= */
(function(){
  "use strict";

  const $=(s,c=document)=>c.querySelector(s);
  const $$=(s,c=document)=>[...c.querySelectorAll(s)];
  const state={token:null,dados:null};

  function db(){return window.client||window.supabaseClient||globalThis.client;}
  function brl(v){return Number(v||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});}
  function numero(v){
    if(typeof v==="number")return v||0;
    const s=String(v??"").trim();
    if(!s)return 0;
    if(s.includes(","))return Number(s.replace(/\./g,"").replace(",","."))||0;
    return Number(s)||0;
  }
  function esc(v){return String(v??"").replace(/[&<>'"]/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[ch]));}

  function mostrarErro(msg){
    $("#portalLoading").hidden=true;
    $("#portalConteudo").hidden=true;
    $("#portalErro").hidden=false;
    $("#portalErroTexto").textContent=msg;
  }

  function preencher(d){
    state.dados=d;
    const m=d.manutencao||{},p=d.patrimonio||{},o=d.orcamento||{};
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
    $("#maoObra").value=o.mao_obra||"";
    $("#frete").value=o.frete||"";
    $("#outrosCustos").value=o.outros_custos||"";
    $("#desconto").value=o.desconto||"";
    $("#prazoDias").value=o.prazo_dias||"";
    $("#garantiaDias").value=o.garantia_dias||"";
    $("#observacoes").value=o.observacoes||"";
    $("#urlOrcamento").value=o.url_orcamento||"";

    const itens=Array.isArray(o.itens)?o.itens:[];
    $("#itensOrcamento").innerHTML="";
    if(itens.length)itens.forEach(i=>adicionarItem(i));
    else adicionarItem();
    recalcular();

    $("#portalLoading").hidden=true;
    $("#portalConteudo").hidden=false;
  }

  function adicionarItem(item={}){
    const row=document.createElement("div");
    row.className="forn-item-row";
    row.innerHTML=`
      <input class="item-desc" placeholder="Peça / material" value="${esc(item.descricao||"")}">\n      <input class="item-ref" placeholder="Código / referência" value="${esc(item.codigo_referencia||"")}">
      <input class="item-qtd" type="number" min="0" step="0.001" value="${item.quantidade??1}" aria-label="Quantidade">
      <input class="item-unit" type="number" min="0" step="0.01" value="${item.valor_unitario??0}" aria-label="Valor unitário">
      <strong class="item-total">${brl(item.valor_total||0)}</strong>
      <button class="item-remove" type="button" title="Remover">×</button>`;
    row.querySelectorAll("input").forEach(i=>i.addEventListener("input",recalcular));
    row.querySelector(".item-remove").onclick=()=>{row.remove();if(!$("#itensOrcamento").children.length)adicionarItem();recalcular();};
    $("#itensOrcamento").appendChild(row);
    recalcular();
  }

  function itensPayload(){
    return $$(".forn-item-row").map(row=>{
      const quantidade=numero(row.querySelector(".item-qtd").value)||1;
      const valor_unitario=numero(row.querySelector(".item-unit").value);
      return {descricao:row.querySelector(".item-desc").value.trim(),codigo_referencia:row.querySelector(".item-ref")?.value.trim()||"",quantidade,valor_unitario,valor_total:quantidade*valor_unitario};
    }).filter(i=>i.descricao);
  }

  function recalcular(){
    let pecas=0;
    $$(".forn-item-row").forEach(row=>{
      const qtd=numero(row.querySelector(".item-qtd").value)||1;
      const unit=numero(row.querySelector(".item-unit").value);
      const total=qtd*unit;pecas+=total;
      row.querySelector(".item-total").textContent=brl(total);
    });
    const total=Math.max(0,pecas+numero($("#maoObra")?.value)+numero($("#frete")?.value)+numero($("#outrosCustos")?.value)-numero($("#desconto")?.value));
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
      const {data:estado,error:erroEstado}=await db().rpc(
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
            `A BDR já recebeu este orçamento` +
            (estado.valor_total!=null ? ` no valor de <b>${brl(estado.valor_total)}</b>` : "") +
            `. Este link foi encerrado e não permite novas alterações.`;
        }
        if(paragrafos[1]){
          paragrafos[1].textContent=
            "Se a BDR solicitar um ajuste, será disponibilizado um novo acesso.";
        }

        $("#ordemCodigo").textContent=estado.codigo||"Ordem de manutenção";
        return;
      }

      const {data,error}=await db().rpc(
        "atlas_manutencao_fornecedor_dados",
        {p_token:state.token}
      );

      if(error) throw error;
      preencher(data);

    }catch(e){
      console.error(e);
      mostrarErro(e.message||"Link inválido ou expirado.");
    }
  }

  async function enviar(){
    const fornecedor=$("#fornecedorNome").value.trim();
    const diagnostico=$("#diagnostico").value.trim();
    const servico=$("#servicoRecomendado").value.trim();
    if(fornecedor.length<2){alert("Informe o nome da empresa/oficina.");return;}
    if(diagnostico.length<5){alert("Informe o diagnóstico com pelo menos 5 caracteres.");return;}
    if(servico.length<5){alert("Informe o serviço recomendado.");return;}

    const botao=$("#btnEnviarOrcamento");
    botao.disabled=true;botao.textContent="Enviando orçamento...";
    try{
      const payload={
        fornecedor_nome:fornecedor,
        diagnostico,
        causa_provavel:$("#causaProvavel").value.trim(),
        servico_recomendado:servico,
        mao_obra_descricao:$("#maoObraDescricao").value.trim(),
        mao_obra:numero($("#maoObra").value),
        frete:numero($("#frete").value),
        outros_custos:numero($("#outrosCustos").value),
        desconto:numero($("#desconto").value),
        prazo_dias:numero($("#prazoDias").value)||null,
        garantia_dias:numero($("#garantiaDias").value)||null,
        observacoes:$("#observacoes").value.trim(),
        url_orcamento:$("#urlOrcamento").value.trim(),
        itens:itensPayload()
      };
      const {data,error}=await db().rpc("atlas_manutencao_fornecedor_enviar_orcamento",{p_token:state.token,p_orcamento:payload});
      if(error)throw error;
      $("#portalConteudo").hidden=true;
      $("#portalSucesso").hidden=false;
      $("#sucessoTotal").textContent=brl(data?.valor_total||recalcular());
    }catch(e){
      console.error(e);alert(e.message||"Não foi possível enviar o orçamento.");
      botao.disabled=false;botao.textContent="Enviar orçamento para a BDR";
    }
  }

  document.addEventListener("DOMContentLoaded",()=>{
    $("#btnAdicionarItem").onclick=()=>adicionarItem();
    ["maoObra","frete","outrosCustos","desconto"].forEach(id=>$("#"+id).addEventListener("input",recalcular));
    $("#btnEnviarOrcamento").onclick=enviar;
    carregar();
  });
})();
