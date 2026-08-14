/* =========================================================
   ATLAS WORKFLOW MANUTENÇÃO
   Arquivo definitivo: JS/atlasWorkflowManutencao.js
   Responsabilidade: regras de negócio, status, histórico,
   link do fornecedor e atualização do patrimônio.
========================================================= */
(function(){
  "use strict";

  if(window.AtlasWorkflowManutencao?.__loaded) return;

  const STATUS = Object.freeze({
    AGUARDANDO_ENVIO:"AGUARDANDO_ENVIO",
    ENVIADA_FORNECEDOR:"ENVIADA_FORNECEDOR",
    AGUARDANDO_ORCAMENTO:"AGUARDANDO_ORCAMENTO",
    ORCAMENTO_RECEBIDO:"ORCAMENTO_RECEBIDO",
    AGUARDANDO_APROVACAO:"AGUARDANDO_APROVACAO",
    ORCAMENTO_APROVADO:"ORCAMENTO_APROVADO",
    AJUSTE_SOLICITADO:"AJUSTE_SOLICITADO",
    ORCAMENTO_RECUSADO:"ORCAMENTO_RECUSADO",
    EM_MANUTENCAO:"EM_MANUTENCAO",
    AGUARDANDO_PECA:"AGUARDANDO_PECA",
    SERVICO_CONCLUIDO:"SERVICO_CONCLUIDO",
    AGUARDANDO_RECEBIMENTO:"AGUARDANDO_RECEBIMENTO",
    RECEBIDA:"RECEBIDA",
    FINALIZADA:"FINALIZADA",
    SEM_CONSERTO:"SEM_CONSERTO",
    RETORNO_GARANTIA:"RETORNO_GARANTIA",
    CANCELADA:"CANCELADA",
    AGUARDANDO_BAIXA:"AGUARDANDO_BAIXA"
  });

  const NEXT = Object.freeze({
    [STATUS.AGUARDANDO_ENVIO]:[STATUS.AGUARDANDO_ORCAMENTO, STATUS.CANCELADA],
    [STATUS.ENVIADA_FORNECEDOR]:[STATUS.AGUARDANDO_ORCAMENTO, STATUS.CANCELADA],
    [STATUS.AGUARDANDO_ORCAMENTO]:[STATUS.ORCAMENTO_RECEBIDO, STATUS.CANCELADA],
    [STATUS.ORCAMENTO_RECEBIDO]:[STATUS.AGUARDANDO_APROVACAO, STATUS.ORCAMENTO_APROVADO, STATUS.AJUSTE_SOLICITADO, STATUS.ORCAMENTO_RECUSADO],
    [STATUS.AGUARDANDO_APROVACAO]:[STATUS.ORCAMENTO_APROVADO, STATUS.AJUSTE_SOLICITADO, STATUS.ORCAMENTO_RECUSADO],
    [STATUS.AJUSTE_SOLICITADO]:[STATUS.AGUARDANDO_ORCAMENTO, STATUS.ORCAMENTO_RECEBIDO, STATUS.CANCELADA],
    [STATUS.ORCAMENTO_APROVADO]:[STATUS.EM_MANUTENCAO, STATUS.CANCELADA],
    [STATUS.EM_MANUTENCAO]:[STATUS.AGUARDANDO_PECA, STATUS.SERVICO_CONCLUIDO, STATUS.SEM_CONSERTO],
    [STATUS.AGUARDANDO_PECA]:[STATUS.EM_MANUTENCAO, STATUS.SERVICO_CONCLUIDO, STATUS.SEM_CONSERTO],
    [STATUS.SERVICO_CONCLUIDO]:[STATUS.AGUARDANDO_RECEBIMENTO],
    [STATUS.AGUARDANDO_RECEBIMENTO]:[STATUS.RECEBIDA],
    [STATUS.RECEBIDA]:[STATUS.FINALIZADA, STATUS.RETORNO_GARANTIA, STATUS.AGUARDANDO_BAIXA],
    [STATUS.RETORNO_GARANTIA]:[STATUS.AGUARDANDO_ORCAMENTO, STATUS.EM_MANUTENCAO],
    [STATUS.SEM_CONSERTO]:[STATUS.AGUARDANDO_BAIXA, STATUS.FINALIZADA]
  });

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
    }catch(_){ return null; }
  }

  function usuarioNome(){
    const u = usuarioAtual();
    return u?.nome || u?.usuario || "SISTEMA";
  }

  function empresaAtualId(){
    const u = usuarioAtual();
    return Number(u?.empresa_id || 17);
  }

  function moedaNumero(v){
    if(typeof v === "number") return Number.isFinite(v) ? v : 0;
    const s = String(v ?? "").trim();
    if(!s) return 0;
    if(s.includes(",")) return Number(s.replace(/\./g, "").replace(",", ".")) || 0;
    return Number(s) || 0;
  }

  function tokenSeguro(){
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, b => b.toString(16).padStart(2,"0")).join("");
  }

  function urlFornecedor(token){
    const ambiente = window.AtlasAmbienteDominio;

    if(!ambiente?.urlFornecedor){
      throw new Error(
        "Configuração de ambiente/domínio não carregada. " +
        "Verifique JS/atlasAmbienteDominio.js."
      );
    }

    return ambiente.urlFornecedor(token);
  }


  async function historico(manutencaoId, statusAnterior, statusNovo, acao, observacao, usuario){
    try{
      const banco = db();

      const {error} = await banco.rpc(
        "atlas_manutencao_registrar_historico",
        {
          p_manutencao_id:Number(manutencaoId),
          p_status_anterior:statusAnterior || null,
          p_status_novo:statusNovo || null,
          p_acao:acao || "ATUALIZACAO",
          p_observacao:observacao || null,
          p_usuario:usuario || usuarioNome()
        }
      );

      if(error) throw error;
    }catch(error){
      console.warn(
        "Atlas Manutenção: histórico não gravado",
        error?.message || error
      );
    }
  }

  async function buscar(id){
    const banco = db();
    if(!banco) throw new Error("Supabase não carregado.");
    const {data,error} = await banco
      .from("manutencoes_patrimonio")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if(error) throw error;
    return data;
  }

  async function abertaPorPatrimonio(patrimonioId){
    const banco = db();
    const encerrados = [STATUS.FINALIZADA, STATUS.CANCELADA, STATUS.ORCAMENTO_RECUSADO, "FECHADA"];
    const {data,error} = await banco
      .from("manutencoes_patrimonio")
      .select("*")
      .eq("patrimonio_id", patrimonioId)
      .order("id", {ascending:false})
      .limit(20);
    if(error) throw error;
    return (data || []).find(m => !encerrados.includes(String(m.status || "").toUpperCase())) || null;
  }

  async function gerarCodigo(id){
    return `MAN-${new Date().getFullYear()}-${String(id).padStart(6,"0")}`;
  }

  async function notificarResponsaveis(manutencao, titulo, mensagem, tipo="MANUTENCAO"){
    try{
      const banco = db();
      const atual = usuarioAtual();
      const {data:usuarios,error} = await banco
        .from("usuarios_sistema")
        .select("id,nome,perfil,empresa_id,ativo,permissoes")
        .eq("ativo", true);
      if(error) throw error;

      const lista = (usuarios || []).filter(u => {
        if(manutencao?.empresa_id && String(u.empresa_id) !== String(manutencao.empresa_id)) return false;
        if(atual?.id && String(u.id) === String(atual.id)) return false;
        const perms = String(u.permissoes || "").toUpperCase();
        const owner = Number(u.id) === 1;
        const acessaManutencao =
          perms.includes("MANUTENCAO_VER") ||
          perms.includes("MANUTENCAO_ANALISAR_ORCAMENTO") ||
          perms.includes("MANUTENCAO_APROVAR") ||
          perms.includes("MANUTENCAO_RECEBER");

        return owner || (
          perms.includes("RECEBER_NOTIFICACOES") &&
          acessaManutencao
        );
      });

      if(window.AtlasGestorNotificacoes?.criarNotificacao){
        for(const u of lista){
          await window.AtlasGestorNotificacoes.criarNotificacao({
            usuario_destino_id:u.id,
            empresa_id:manutencao?.empresa_id || u.empresa_id || empresaAtualId(),
            tipo,
            titulo,
            mensagem,
            link:`manutencao.html?id=${manutencao.id}`,
            patrimonio_id:manutencao.patrimonio_id || null
          });
        }
      }
    }catch(e){
      console.warn("Atlas Manutenção: notificação não enviada", e?.message || e);
    }
  }

  async function criarOrdem(patrimonio, dados){
    const banco = db();
    if(!banco) throw new Error("Supabase não carregado.");
    if(!patrimonio?.id) throw new Error("Patrimônio inválido.");

    const existente = await abertaPorPatrimonio(patrimonio.id);
    if(existente){
      throw new Error(`Já existe uma manutenção aberta (${existente.codigo || "#"+existente.id}).`);
    }

    const agora = new Date().toISOString();
    const payload = {
      patrimonio_id:patrimonio.id,
      codigo_patrimonio:patrimonio.codigo_qr || patrimonio.codigo_antigo || null,
      nome_patrimonio:patrimonio.nome_bem || null,
      obra_id:patrimonio.obra_id || null,
      empresa_id:patrimonio.empresa_id || empresaAtualId(),
      status:STATUS.AGUARDANDO_ENVIO,
      motivo:dados.defeito_informado,
      tipo_manutencao:dados.tipo_manutencao || "CORRETIVA",
      prioridade:dados.prioridade || "NORMAL",
      fornecedor_nome:dados.fornecedor_nome || null,
      fornecedor:dados.fornecedor_nome || null,
      fornecedor_email:dados.fornecedor_email || null,
      fornecedor_whatsapp:dados.fornecedor_whatsapp || null,
      destino_fornecedor:dados.destino_fornecedor || null,
      previsao_envio:dados.previsao_envio || null,
      responsavel_entrega:usuarioNome(),
      destino_retorno:dados.destino_retorno || patrimonio.localizacao || null,
      observacao:dados.observacao || null,
      usuario_abertura:usuarioNome(),
      data_entrada:agora,
      data_criacao:agora
    };

    const {data,error} = await banco
      .from("manutencoes_patrimonio")
      .insert([payload])
      .select("*")
      .single();
    if(error) throw error;

    const codigo = await gerarCodigo(data.id);
    const {data:ordem,error:erroCodigo} = await banco
      .from("manutencoes_patrimonio")
      .update({codigo})
      .eq("id", data.id)
      .select("*")
      .single();
    if(erroCodigo) throw erroCodigo;

    // Mantém compatibilidade com os status atuais do patrimônio.
    const {error:erroPatrimonio} = await banco
      .from("patrimonio")
      .update({status:"MANUTENCAO"})
      .eq("id", patrimonio.id);
    if(erroPatrimonio) throw erroPatrimonio;

    await historico(ordem.id, null, STATUS.AGUARDANDO_ENVIO, "ORDEM_CRIADA",
      `Ordem criada para ${patrimonio.codigo_qr || patrimonio.nome_bem}. Defeito: ${dados.defeito_informado}`);

    await notificarResponsaveis(
      ordem,
      "🔧 Nova ordem de manutenção",
      `${codigo} criada para ${patrimonio.codigo_qr || patrimonio.nome_bem}. Aguardando envio.`,
      "MANUTENCAO_CRIADA"
    );

    return ordem;
  }

  async function gerarOuBuscarLink(manutencaoId, dias=7){
    const banco = db();

    /*
      O navegador não acessa atlas_manutencao_links diretamente.
      A RPC SECURITY DEFINER é a única porta para criar/recuperar o token.
    */
    const {data,error} = await banco.rpc(
      "atlas_manutencao_gerar_link",
      {
        p_manutencao_id:Number(manutencaoId),
        p_dias:Math.max(1,Number(dias)||7)
      }
    );

    if(error) throw error;

    const linkRow = data && typeof data === "object" ? data : null;

    if(!linkRow?.token){
      throw new Error(
        "O Atlas não recebeu um token válido do servidor para esta manutenção."
      );
    }

    return {
      id:linkRow.id ?? null,
      manutencao_id:linkRow.manutencao_id ?? Number(manutencaoId),
      token:linkRow.token,
      ativo:linkRow.ativo !== false,
      expira_em:linkRow.expira_em || null,
      criado_em:linkRow.criado_em || null,
      url:urlFornecedor(linkRow.token)
    };
  }

  async function registrarSaida(id, dados={}){
    const banco = db();
    const ordem = await buscar(id);

    if(!ordem) throw new Error("Ordem não encontrada.");

    const statusAtual = String(ordem.status || "").toUpperCase();

    if(![
      STATUS.AGUARDANDO_ENVIO,
      STATUS.ENVIADA_FORNECEDOR,
      STATUS.AGUARDANDO_ORCAMENTO
    ].includes(statusAtual)){
      throw new Error(
        `A ordem está em ${ordem.status} e não permite registrar saída.`
      );
    }

    const responsavel = usuarioNome();

    const {data,error} = await banco.rpc(
      "atlas_manutencao_registrar_saida_com_link",
      {
        p_manutencao_id:Number(id),
        p_responsavel_entrega:responsavel,
        p_meio_transporte:dados.meio_transporte || null,
        p_motorista:dados.motorista || null,
        p_placa:dados.placa || null,
        p_previsao_retorno:dados.previsao_retorno || null,
        p_fornecedor_nome:dados.fornecedor_nome || ordem.fornecedor_nome || ordem.fornecedor || null,
        p_fornecedor_email:String(dados.fornecedor_email || ordem.fornecedor_email || "").trim().toLowerCase() || null,
        p_fornecedor_whatsapp:dados.fornecedor_whatsapp || ordem.fornecedor_whatsapp || null,
        p_dias_link:7
      }
    );

    if(error) throw error;

    if(!data?.token){
      throw new Error("A saída foi registrada, mas o servidor não retornou o link do fornecedor.");
    }

    const ordemAtualizada = await buscar(id);

    return {
      ordem:ordemAtualizada || ordem,
      parcial:false,
      link:{
        id:data.link_id || null,
        manutencao_id:Number(id),
        token:data.token,
        ativo:true,
        expira_em:data.expira_em || null,
        url:urlFornecedor(data.token)
      }
    };
  }

  async function prepararLinkFornecedor(id){
    const ordem = await buscar(id);

    if(!ordem) throw new Error("Ordem não encontrada.");

    const status = String(ordem.status || "").toUpperCase();

    if(![
      STATUS.ENVIADA_FORNECEDOR,
      STATUS.AGUARDANDO_ORCAMENTO,
      STATUS.AJUSTE_SOLICITADO
    ].includes(status)){
      throw new Error(
        `A ordem está em ${ordem.status} e não permite gerar link do fornecedor.`
      );
    }

    return {
      ordem,
      link:await gerarOuBuscarLink(id, 7),
      parcial:false
    };
  }

  async function mudarStatus(id, novoStatus, observacao=""){
    const banco = db();
    const ordem = await buscar(id);
    if(!ordem) throw new Error("Ordem não encontrada.");
    const anterior = String(ordem.status || "").toUpperCase();
    const novo = String(novoStatus || "").toUpperCase();

    const permitidos = NEXT[anterior] || [];
    if(permitidos.length && !permitidos.includes(novo)){
      throw new Error(`Transição não permitida: ${anterior} → ${novo}.`);
    }

    const patch = {status:novo};
    const agora = new Date().toISOString();
    if(novo === STATUS.ORCAMENTO_APROVADO){
      patch.aprovado_por = usuarioNome();
      patch.aprovado_em = agora;
      patch.motivo_decisao = observacao || null;
    }
    if([STATUS.AJUSTE_SOLICITADO, STATUS.ORCAMENTO_RECUSADO].includes(novo)) patch.motivo_decisao = observacao || null;
    if(novo === STATUS.EM_MANUTENCAO) patch.data_inicio_servico = agora;
    if(novo === STATUS.SERVICO_CONCLUIDO || novo === STATUS.AGUARDANDO_RECEBIMENTO) patch.data_conclusao_servico = agora;
    if(novo === STATUS.RECEBIDA) patch.data_recebimento = agora;
    if(novo === STATUS.FINALIZADA) patch.data_finalizacao = agora;

    const {data,error} = await banco
      .from("manutencoes_patrimonio")
      .update(patch)
      .eq("id", id)
      .select("*")
      .single();
    if(error) throw error;

    if([
      STATUS.ORCAMENTO_APROVADO,
      STATUS.AJUSTE_SOLICITADO,
      STATUS.ORCAMENTO_RECUSADO
    ].includes(novo)){
      try{
        const statusOrcamento =
          novo === STATUS.ORCAMENTO_APROVADO ? "APROVADO" :
          novo === STATUS.AJUSTE_SOLICITADO ? "AJUSTE_SOLICITADO" :
          "RECUSADO";

        const {error:erroOrcamento} = await banco.rpc(
          "atlas_manutencao_atualizar_status_orcamento",
          {
            p_manutencao_id:Number(id),
            p_status:statusOrcamento
          }
        );

        if(erroOrcamento) throw erroOrcamento;
      }catch(e){
        console.warn(
          "Atlas Manutenção: não foi possível atualizar status do orçamento.",
          e?.message || e
        );
      }
    }

    await historico(id, anterior, novo, "STATUS_ALTERADO", observacao || `${anterior} → ${novo}`);

    try{
      let tipoNotificacao="MANUTENCAO_STATUS";
      let tituloNotificacao="🔧 Manutenção atualizada";

      if([
        STATUS.ORCAMENTO_RECEBIDO,
        STATUS.ORCAMENTO_APROVADO,
        STATUS.AJUSTE_SOLICITADO,
        STATUS.ORCAMENTO_RECUSADO
      ].includes(novo)){
        tipoNotificacao="MANUTENCAO_ORCAMENTO";
        tituloNotificacao="💰 Orçamento de manutenção atualizado";
      }else if([
        STATUS.RECEBIDA,
        STATUS.FINALIZADA,
        STATUS.AGUARDANDO_RECEBIMENTO
      ].includes(novo)){
        tipoNotificacao="MANUTENCAO_RETORNO";
        tituloNotificacao="📦 Retorno de manutenção";
      }

      await notificarResponsaveis(
        data,
        tituloNotificacao,
        `${data.codigo || "#"+data.id} • ${data.codigo_patrimonio || "Patrimônio"} • ${anterior} → ${novo}`,
        tipoNotificacao
      );
    }catch(e){
      console.warn("Atlas Manutenção: falha ao notificar mudança de status",e?.message||e);
    }

    if(novo === STATUS.FINALIZADA){
      await banco.from("patrimonio").update({status:"ESTOQUE"}).eq("id", ordem.patrimonio_id);
    }

    return data;
  }

  async function registrarRecebimento(id, dados={}){
    const banco = db();

    const condicao = String(dados.condicao || "PERFEITO").toUpperCase();
    const destino = String(dados.destino || "ESTOQUE").toUpperCase();

    const {data,error} = await banco.rpc(
      "atlas_manutencao_registrar_recebimento",
      {
        p_manutencao_id:Number(id),
        p_condicao:condicao,
        p_destino:destino,
        p_obra_destino_id:
          dados.obra_destino_id ? Number(dados.obra_destino_id) : null,
        p_observacao:String(dados.observacao || "").trim() || null,
        p_usuario:usuarioNome()
      }
    );

    if(error) throw error;
    if(!data || typeof data !== "object"){
      throw new Error("O servidor não retornou o resultado do recebimento.");
    }

    return data;
  }

  async function carregarOrcamento(manutencaoId){
    const banco = db();

    /*
      A chave pública do navegador não lê diretamente as tabelas internas
      de orçamento. A RPC retorna somente o último orçamento da ordem.
    */
    const {data,error} = await banco.rpc(
      "atlas_manutencao_orcamento_interno",
      {p_manutencao_id:Number(manutencaoId)}
    );

    if(error) throw error;

    if(!data || typeof data !== "object") return null;
    if(!data.id) return null;

    return {
      ...data,
      itens:Array.isArray(data.itens) ? data.itens : []
    };
  }

  async function carregarHistorico(manutencaoId){
    const banco = db();

    const {data,error} = await banco.rpc(
      "atlas_manutencao_historico_interno",
      {p_manutencao_id:Number(manutencaoId)}
    );

    if(error) throw error;

    return Array.isArray(data) ? data : [];
  }


  window.AtlasWorkflowManutencao = {
    __loaded:true,
    versao:"1.6-saida-atomica",
    STATUS,
    NEXT,
    buscar,
    abertaPorPatrimonio,
    criarOrdem,
    registrarSaida,
    prepararLinkFornecedor,
    gerarOuBuscarLink,
    mudarStatus,
    registrarRecebimento,
    carregarOrcamento,
    carregarHistorico,
    moedaNumero
  };

  console.log("✅ ATLAS WORKFLOW MANUTENÇÃO carregado - saída/token atômicos e responsável da sessão");
})();
