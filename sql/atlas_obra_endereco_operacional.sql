-- PROPOSTA PARA HOMOLOGAÇÃO. Não executar no banco oficial sem autorização e backup.
-- Endereço operacional pertence à obra, não à empresa. Nenhum endereço antigo é inferido.
BEGIN;
DO $guard$ BEGIN
  IF md5(pg_get_functiondef('public.atlas_empresa_obra_operacao(text,jsonb)'::regprocedure)) <> 'dd40b686df9c28beab83ad7b1c776447' THEN
    RAISE EXCEPTION 'Função de cadastro mudou desde a preparação; revisar a migração antes de aplicar.';
  END IF;
END $guard$;
ALTER TABLE public.obras ADD COLUMN endereco_operacional jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.obras ADD CONSTRAINT obras_endereco_operacional_valido CHECK (
  jsonb_typeof(endereco_operacional)='object'
  AND (endereco_operacional - ARRAY['cep','municipio','uf','bairro','logradouro','numero','complemento','referencia','latitude','longitude'])='{}'::jsonb
  AND (NOT (endereco_operacional ? 'cep') OR (jsonb_typeof(endereco_operacional->'cep')='string' AND length(endereco_operacional->>'cep')<=500))
    AND (NOT (endereco_operacional ? 'municipio') OR (jsonb_typeof(endereco_operacional->'municipio')='string' AND length(endereco_operacional->>'municipio')<=500))
    AND (NOT (endereco_operacional ? 'uf') OR (jsonb_typeof(endereco_operacional->'uf')='string' AND length(endereco_operacional->>'uf')<=500))
    AND (NOT (endereco_operacional ? 'bairro') OR (jsonb_typeof(endereco_operacional->'bairro')='string' AND length(endereco_operacional->>'bairro')<=500))
    AND (NOT (endereco_operacional ? 'logradouro') OR (jsonb_typeof(endereco_operacional->'logradouro')='string' AND length(endereco_operacional->>'logradouro')<=500))
    AND (NOT (endereco_operacional ? 'numero') OR (jsonb_typeof(endereco_operacional->'numero')='string' AND length(endereco_operacional->>'numero')<=500))
    AND (NOT (endereco_operacional ? 'complemento') OR (jsonb_typeof(endereco_operacional->'complemento')='string' AND length(endereco_operacional->>'complemento')<=500))
    AND (NOT (endereco_operacional ? 'referencia') OR (jsonb_typeof(endereco_operacional->'referencia')='string' AND length(endereco_operacional->>'referencia')<=500))
  AND (NOT (endereco_operacional ? 'cep') OR endereco_operacional->>'cep' ~ '^[0-9]{8}$')
  AND (NOT (endereco_operacional ? 'uf') OR endereco_operacional->>'uf' IN ('AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'))
  AND ((endereco_operacional ? 'latitude')=(endereco_operacional ? 'longitude'))
  AND CASE WHEN endereco_operacional ? 'latitude' THEN
    jsonb_typeof(endereco_operacional->'latitude')='number' AND jsonb_typeof(endereco_operacional->'longitude')='number'
    AND (endereco_operacional->>'latitude')::numeric BETWEEN -90 AND 90
    AND (endereco_operacional->>'longitude')::numeric BETWEEN -180 AND 180
    ELSE true END
);
COMMENT ON COLUMN public.obras.endereco_operacional IS 'Endereço físico da obra; não usar endereço da empresa como fallback. Coordenadas opcionais.';

CREATE OR REPLACE FUNCTION public.atlas_empresa_obra_operacao(p_acao text, p_dados jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  v_acao text := upper(btrim(coalesce(p_acao,'')));
  v_uid bigint;
  v_usuario text;
  v_owner boolean;
  v_permissoes text;
  v_permitido boolean;
  v_empresa_id bigint;
  v_obra_id bigint;
  v_codigo_obra text;
  v_codigo_sienge text;
  v_nome_obra text;
  v_tabela integer;
  v_nome_empresa text;
  v_codigo_empresa text;
  v_ativo boolean;
  v_referencias jsonb := '[]'::jsonb;
  v_ref record;
  v_existe boolean;
  v_liberadas text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'A operação exige login seguro do Supabase Auth.';
  END IF;
  SELECT id, nome, owner_sistema, permissoes
    INTO v_uid, v_usuario, v_owner, v_permissoes
    FROM public.usuarios_sistema
   WHERE auth_user_id = auth.uid() AND ativo IS TRUE
   LIMIT 1;
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Usuário Atlas ativo não vinculado ao login seguro.';
  END IF;
  v_owner := v_uid=1 AND v_owner IS TRUE;
  v_permissoes := ',' || replace(upper(coalesce(v_permissoes,'')), ' ', '') || ',';
  IF p_dados IS NULL OR jsonb_typeof(p_dados) <> 'object' THEN
    RAISE EXCEPTION 'Dados inválidos para a operação.';
  END IF;

  IF v_acao = 'CRIAR' THEN
    v_permitido := v_owner OR position(',EMPRESAS_CRIAR,' IN v_permissoes) > 0;
    IF NOT v_permitido THEN RAISE EXCEPTION 'Sem permissão para cadastrar obras.'; END IF;
    v_empresa_id := nullif(btrim(coalesce(p_dados->>'empresa_id','')),'')::bigint;
    v_codigo_obra := nullif(btrim(coalesce(p_dados->>'codigo_obra','')),'');
    v_nome_obra := nullif(btrim(coalesce(p_dados->>'nome_obra','')),'');
    v_codigo_sienge := coalesce(nullif(btrim(coalesce(p_dados->>'codigo_sienge','')),''),v_codigo_obra);
    v_tabela := coalesce(nullif(btrim(coalesce(p_dados->>'tabela_insumo','')),'')::integer,2);
    IF v_codigo_obra IS NULL OR v_nome_obra IS NULL OR v_tabela IS NULL OR v_tabela NOT IN (2,3) THEN
      RAISE EXCEPTION 'Informe código da obra, nome e tabela de insumo válida (2 ou 3).';
    END IF;
    -- codigo_obra é UNIQUE global no banco, não apenas dentro da empresa.
    IF EXISTS (SELECT 1 FROM public.obras WHERE codigo_obra=v_codigo_obra) THEN
      RAISE EXCEPTION 'O código de obra % já existe no Atlas. Nenhum registro criado.',v_codigo_obra;
    END IF;
    IF v_empresa_id IS NULL THEN
      IF NOT v_owner THEN RAISE EXCEPTION 'Somente o proprietário pode cadastrar uma nova empresa.'; END IF;
      v_nome_empresa := nullif(btrim(coalesce(p_dados->>'nome_empresa','')),'');
      v_codigo_empresa := nullif(btrim(coalesce(p_dados->>'codigo_empresa','')),'');
      IF v_nome_empresa IS NULL OR v_codigo_empresa IS NULL THEN
        RAISE EXCEPTION 'Informe o nome e o código da nova empresa.';
      END IF;
      IF EXISTS (SELECT 1 FROM public.empresas
                 WHERE upper(btrim(nome))=upper(v_nome_empresa)
                    OR codigo_empresa=v_codigo_empresa) THEN
        RAISE EXCEPTION 'Empresa já cadastrada. Selecione a empresa existente antes de criar outra obra.';
      END IF;
      INSERT INTO public.empresas
        (nome,codigo_empresa,setor_obra,cnpj,endereco,cidade,estado,cep,telefone,observacao,ativa,ativo)
      VALUES
        (v_nome_empresa,v_codigo_empresa,v_nome_obra,
         nullif(btrim(coalesce(p_dados->>'cnpj','')),''),
         nullif(btrim(coalesce(p_dados->>'endereco','')),''),
         nullif(btrim(coalesce(p_dados->>'cidade','')),''),
         nullif(btrim(coalesce(p_dados->>'estado','')),''),
         nullif(btrim(coalesce(p_dados->>'cep','')),''),
         nullif(btrim(coalesce(p_dados->>'telefone','')),''),
         nullif(btrim(coalesce(p_dados->>'observacao','')),''),true,true)
      RETURNING id INTO v_empresa_id;
    ELSE
      IF NOT EXISTS (SELECT 1 FROM public.empresas WHERE id=v_empresa_id) THEN
        RAISE EXCEPTION 'Empresa selecionada não existe.';
      END IF;
      IF NOT v_owner AND NOT EXISTS (
        SELECT 1 FROM public.obras o
         WHERE o.empresa_id=v_empresa_id AND public.atlas_tem_acesso_obra(o.id)
      ) THEN RAISE EXCEPTION 'Você não possui obra autorizada nesta empresa.'; END IF;
    END IF;
    INSERT INTO public.obras
      (empresa_id,codigo_obra,nome,codigo_sienge,tabela_insumo,tabela_insumo_sienge,ativa,ativo,endereco_operacional)
    VALUES
      (v_empresa_id,v_codigo_obra,v_nome_obra,v_codigo_sienge,v_tabela,v_tabela::text,true,true,coalesce(p_dados->'endereco_operacional','{}'::jsonb))
    RETURNING id INTO v_obra_id;
    INSERT INTO public.movimentacoes (tipo,observacao,usuario,empresa_id,obra_destino_id)
    VALUES ('CADASTRO_OBRA_SETOR',format('Obra %s - %s (id %s), empresa %s, tabela Sienge %s',v_codigo_obra,v_nome_obra,v_obra_id,v_empresa_id,v_tabela),v_usuario,v_empresa_id,v_obra_id);
    RETURN jsonb_build_object('id',v_obra_id,'empresa_id',v_empresa_id,'codigo_obra',v_codigo_obra,'nome',v_nome_obra,'endereco_operacional',(SELECT endereco_operacional FROM public.obras WHERE id=v_obra_id));


  ELSIF v_acao IN ('VERIFICAR_EXCLUSAO_OBRA','EXCLUIR_OBRA') THEN
    -- Exclusão não é equivalente a inativação. Exige OWNER absoluto, sem exceção por perfil.
    IF NOT v_owner THEN RAISE EXCEPTION 'Somente o OWNER absoluto pode excluir uma obra.'; END IF;
    v_obra_id := nullif(btrim(coalesce(p_dados->>'obra_id','')),'')::bigint;
    IF v_obra_id IS NULL THEN RAISE EXCEPTION 'Informe a obra a excluir.'; END IF;
    SELECT empresa_id,codigo_obra,nome INTO v_empresa_id,v_codigo_obra,v_nome_obra
      FROM public.obras WHERE id=v_obra_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Obra não encontrada.'; END IF;
    -- Conservador: impede apagar obra com vínculos, inclusive históricos sem FOREIGN KEY.
    FOR v_ref IN
      SELECT c.table_name, c.column_name
      FROM information_schema.columns c
      JOIN information_schema.tables t
        ON t.table_schema=c.table_schema AND t.table_name=c.table_name
      WHERE c.table_schema='public'
        AND t.table_type='BASE TABLE'
        AND c.table_name <> 'obras'
        AND c.data_type IN ('bigint','integer','smallint')
        AND c.column_name LIKE '%obra%id'
      ORDER BY c.table_name,c.column_name
    LOOP
      EXECUTE format('SELECT EXISTS(SELECT 1 FROM public.%I WHERE %I = $1)',
        v_ref.table_name,v_ref.column_name) INTO v_existe USING v_obra_id;
      IF v_existe THEN
        v_referencias := v_referencias || to_jsonb(v_ref.table_name || '.' || v_ref.column_name);
      END IF;
    END LOOP;
    -- Vinculações legadas em CSV também contam como dependências.
    IF EXISTS (
      SELECT 1 FROM public.usuarios_sistema u
       WHERE (',' || regexp_replace(coalesce(u.obras_liberadas,''),'[[:space:]]','','g') || ',')
             LIKE ('%,' || v_obra_id::text || ',%')
    ) THEN
      v_referencias:=v_referencias || to_jsonb('usuarios_sistema.obras_liberadas');
    END IF;
    IF v_acao='VERIFICAR_EXCLUSAO_OBRA' THEN
      RETURN jsonb_build_object('id',v_obra_id,'pode_excluir',jsonb_array_length(v_referencias)=0,
          'vinculos',v_referencias);
    END IF;
    IF jsonb_array_length(v_referencias)>0 THEN
      RAISE EXCEPTION 'Exclusão bloqueada: a obra % possui vínculos (%). Inative a obra em vez de apagar.',
        v_obra_id,v_referencias;
    END IF;
    DELETE FROM public.obras WHERE id=v_obra_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'A obra não foi excluída.'; END IF;
    -- O registro da auditoria mantém só o texto, sem recriar vínculo de obra excluída.
    INSERT INTO public.movimentacoes (tipo,observacao,usuario,empresa_id)
    VALUES ('EXCLUSAO_OBRA',format('OWNER excluiu obra ID %s | código %s | %s | empresa %s',
      v_obra_id,v_codigo_obra,v_nome_obra,v_empresa_id),v_usuario,v_empresa_id);
    RETURN jsonb_build_object('id',v_obra_id,'excluida',true);

  ELSIF v_acao IN ('EDITAR_OBRA','STATUS_OBRA') THEN
    v_obra_id := nullif(btrim(coalesce(p_dados->>'obra_id','')),'')::bigint;
    SELECT empresa_id,codigo_obra,nome INTO v_empresa_id,v_codigo_obra,v_nome_obra
      FROM public.obras WHERE id=v_obra_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Obra não encontrada.'; END IF;
    IF NOT v_owner THEN
      IF v_acao='EDITAR_OBRA' THEN
        v_permitido := position(',EMPRESAS_EDITAR,' IN v_permissoes)>0;
      ELSE
        v_permitido := position(',EMPRESAS_INATIVAR,' IN v_permissoes)>0;
      END IF;
      IF NOT v_permitido OR NOT coalesce(public.atlas_tem_acesso_obra(v_obra_id),false) THEN
        RAISE EXCEPTION 'Sem autorização para modificar esta obra.';
      END IF;
    END IF;
    IF v_acao='STATUS_OBRA' THEN
      IF coalesce(p_dados->>'ativo','') NOT IN ('true','false') THEN
        RAISE EXCEPTION 'Informe explicitamente ativar ou inativar.';
      END IF;
      v_ativo := (p_dados->>'ativo')::boolean;
      UPDATE public.obras SET ativa=v_ativo, ativo=v_ativo WHERE id=v_obra_id;
      INSERT INTO public.movimentacoes (tipo,observacao,usuario,empresa_id,obra_destino_id)
      VALUES ('ALTERACAO_STATUS_OBRA',format('Obra id %s | %s | %s',v_obra_id,v_codigo_obra,CASE WHEN v_ativo THEN 'REATIVADA' ELSE 'INATIVADA' END),v_usuario,v_empresa_id,v_obra_id);
      RETURN jsonb_build_object('id',v_obra_id,'ativa',v_ativo,'ativo',v_ativo);
    END IF;
    v_codigo_obra := nullif(btrim(coalesce(p_dados->>'codigo_obra','')),'');
    v_nome_obra := nullif(btrim(coalesce(p_dados->>'nome_obra','')),'');
    v_codigo_sienge := nullif(btrim(coalesce(p_dados->>'codigo_sienge','')),'');
    v_tabela := nullif(btrim(coalesce(p_dados->>'tabela_insumo','')),'')::integer;
    IF v_codigo_obra IS NULL OR v_nome_obra IS NULL OR v_tabela IS NULL OR v_tabela NOT IN (2,3) THEN
      RAISE EXCEPTION 'Informe código, nome e tabela de insumo (2 ou 3).';
    END IF;
    IF EXISTS (SELECT 1 FROM public.obras WHERE codigo_obra=v_codigo_obra AND id<>v_obra_id) THEN
      RAISE EXCEPTION 'O código de obra % já é usado em outra obra.',v_codigo_obra;
    END IF;
    UPDATE public.obras
       SET codigo_obra=v_codigo_obra,nome=v_nome_obra,codigo_sienge=v_codigo_sienge,
           tabela_insumo=v_tabela,tabela_insumo_sienge=v_tabela::text,
           endereco_operacional=CASE WHEN p_dados ? 'endereco_operacional' THEN p_dados->'endereco_operacional' ELSE endereco_operacional END
     WHERE id=v_obra_id;
    INSERT INTO public.movimentacoes (tipo,observacao,usuario,empresa_id,obra_destino_id)
    VALUES ('EDICAO_OBRA',format('Obra id %s | código %s | %s | Sienge %s | tabela %s',v_obra_id,v_codigo_obra,v_nome_obra,coalesce(v_codigo_sienge,'—'),v_tabela) || CASE WHEN p_dados ? 'endereco_operacional' THEN ' | Endereço operacional informado na edição' ELSE '' END,v_usuario,v_empresa_id,v_obra_id);
    RETURN jsonb_build_object('id',v_obra_id,'empresa_id',v_empresa_id,'codigo_obra',v_codigo_obra,'nome',v_nome_obra,'codigo_sienge',v_codigo_sienge,'tabela_insumo',v_tabela,'tabela_insumo_sienge',v_tabela::text,'endereco_operacional',(SELECT endereco_operacional FROM public.obras WHERE id=v_obra_id));

  ELSIF v_acao='EDITAR_EMPRESA' THEN
    -- Alterar empresa afeta todas as obras vinculadas: requer Owner absoluto.
    IF NOT v_owner THEN RAISE EXCEPTION 'Somente o proprietário pode alterar os dados da empresa.'; END IF;
    v_empresa_id := nullif(btrim(coalesce(p_dados->>'empresa_id','')),'')::bigint;
    IF v_empresa_id IS NULL THEN RAISE EXCEPTION 'Informe a empresa a editar.'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.empresas WHERE id=v_empresa_id) THEN
      RAISE EXCEPTION 'Empresa não encontrada.';
    END IF;
    v_nome_empresa := nullif(btrim(coalesce(p_dados->>'nome_empresa','')),'');
    v_codigo_empresa := nullif(btrim(coalesce(p_dados->>'codigo_empresa','')),'');
    IF v_nome_empresa IS NULL OR v_codigo_empresa IS NULL THEN
      RAISE EXCEPTION 'Nome e código da empresa são obrigatórios.';
    END IF;
    IF EXISTS (SELECT 1 FROM public.empresas
               WHERE id<>v_empresa_id AND (upper(btrim(nome))=upper(v_nome_empresa) OR codigo_empresa=v_codigo_empresa)) THEN
      RAISE EXCEPTION 'Já existe outra empresa com este nome ou código.';
    END IF;
    UPDATE public.empresas SET
      nome=v_nome_empresa,codigo_empresa=v_codigo_empresa,
      setor_obra=nullif(btrim(coalesce(p_dados->>'setor_obra','')),''),
      cnpj=nullif(btrim(coalesce(p_dados->>'cnpj','')),''),
      endereco=nullif(btrim(coalesce(p_dados->>'endereco','')),''),
      cidade=nullif(btrim(coalesce(p_dados->>'cidade','')),''),
      estado=nullif(btrim(coalesce(p_dados->>'estado','')),''),
      cep=nullif(btrim(coalesce(p_dados->>'cep','')),''),
      telefone=nullif(btrim(coalesce(p_dados->>'telefone','')),''),
      observacao=nullif(btrim(coalesce(p_dados->>'observacao','')),'')
    WHERE id=v_empresa_id;
    INSERT INTO public.movimentacoes (tipo,observacao,usuario,empresa_id)
    VALUES ('EDICAO_EMPRESA',format('Dados cadastrais da empresa id %s atualizados: %s',v_empresa_id,v_nome_empresa),v_usuario,v_empresa_id);
    RETURN jsonb_build_object('id',v_empresa_id,'nome',v_nome_empresa);
  ELSE
    RAISE EXCEPTION 'Operação não permitida.';
  END IF;
END;
$function$;
NOTIFY pgrst, 'reload schema';
COMMIT;
