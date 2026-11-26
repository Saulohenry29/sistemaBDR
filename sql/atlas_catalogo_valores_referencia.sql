-- ATLAS: preço sugerido agregado por MODELO, nunca por patrimônio/obra/usuário.
-- AUTORIZAÇÃO: o catálogo já permite SELECT para anon (login legado).
-- Somente referências agregadas são expostas; não há PAT, obra, histórico ou dados pessoais.
-- ATENÇÃO: a referência é editável e não define valor contábil obrigatório.
-- Executar uma única vez em transação. O backup privado preserva a tabela anterior.

BEGIN;

CREATE TABLE atlas_private.atlas_catalogo_backup_20261117 AS
SELECT * FROM public.atlas_catalogo_patrimonio;
REVOKE ALL ON atlas_private.atlas_catalogo_backup_20261117
  FROM PUBLIC, anon, authenticated;

ALTER TABLE public.atlas_catalogo_patrimonio
  ADD COLUMN valor_referencia numeric(14,2),
  ADD COLUMN valor_referencia_amostras integer NOT NULL DEFAULT 0
    CHECK (valor_referencia_amostras >= 0);

WITH fonte AS (
  SELECT
    md5(concat_ws(chr(31),
      upper(regexp_replace(btrim(coalesce(p.nome_bem,'')), '[[:space:]]+', ' ', 'g')),
      upper(regexp_replace(btrim(coalesce(p.marca,'')), '[[:space:]]+', ' ', 'g')),
      upper(regexp_replace(btrim(coalesce(p.modelo,'')), '[[:space:]]+', ' ', 'g'))
    )) AS chave,
    p.valor_bem
  FROM public.patrimonio p
  WHERE p.ativo IS TRUE
    AND p.valor_bem > 0
    AND nullif(btrim(p.nome_bem),'') IS NOT NULL
), medianas AS (
  SELECT chave,
    percentile_disc(0.5) WITHIN GROUP (ORDER BY valor_bem) AS valor_ref,
    count(*)::integer AS qtd
  FROM fonte GROUP BY chave
)
UPDATE public.atlas_catalogo_patrimonio c
SET valor_referencia=m.valor_ref,
    valor_referencia_amostras=m.qtd
FROM medianas m WHERE c.chave=m.chave;

-- Recalcula apenas uma chave após uma movimentação do patrimônio.
-- Mantém o catálogo alimentado pelos valores reais sem copiar linhas individuais.
CREATE FUNCTION atlas_private.atlas_catalogo_recalcular_valor(p_chave text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $func$
DECLARE v_preco numeric(14,2); v_qtd integer;
BEGIN
  IF nullif(p_chave,'') IS NULL THEN RETURN; END IF;
  SELECT
    percentile_disc(0.5) WITHIN GROUP (ORDER BY p.valor_bem),
    count(*)::integer
  INTO v_preco,v_qtd
  FROM public.patrimonio p
  WHERE p.ativo IS TRUE
    AND p.valor_bem > 0
    AND md5(concat_ws(chr(31),
      upper(regexp_replace(btrim(coalesce(p.nome_bem,'')), '[[:space:]]+', ' ', 'g')),
      upper(regexp_replace(btrim(coalesce(p.marca,'')), '[[:space:]]+', ' ', 'g')),
      upper(regexp_replace(btrim(coalesce(p.modelo,'')), '[[:space:]]+', ' ', 'g'))
    )) = p_chave;

  UPDATE public.atlas_catalogo_patrimonio c
  SET valor_referencia=v_preco,
      valor_referencia_amostras=v_qtd,
      atualizado_em=now()
  WHERE c.chave=p_chave
    AND (c.valor_referencia IS DISTINCT FROM v_preco
      OR c.valor_referencia_amostras IS DISTINCT FROM v_qtd);
END $func$;

REVOKE ALL ON FUNCTION atlas_private.atlas_catalogo_recalcular_valor(text)
  FROM PUBLIC, anon, authenticated;

CREATE FUNCTION atlas_private.atlas_catalogo_patrimonio_valores_trigger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $func$
DECLARE v_chave_antiga text; v_chave_nova text;
BEGIN
  IF TG_OP IN ('UPDATE','DELETE') THEN
    v_chave_antiga := md5(concat_ws(chr(31),
      upper(regexp_replace(btrim(coalesce(OLD.nome_bem,'')), '[[:space:]]+', ' ', 'g')),
      upper(regexp_replace(btrim(coalesce(OLD.marca,'')), '[[:space:]]+', ' ', 'g')),
      upper(regexp_replace(btrim(coalesce(OLD.modelo,'')), '[[:space:]]+', ' ', 'g'))
    ));
    PERFORM atlas_private.atlas_catalogo_recalcular_valor(v_chave_antiga);
  END IF;

  IF TG_OP IN ('INSERT','UPDATE') THEN
    v_chave_nova := md5(concat_ws(chr(31),
      upper(regexp_replace(btrim(coalesce(NEW.nome_bem,'')), '[[:space:]]+', ' ', 'g')),
      upper(regexp_replace(btrim(coalesce(NEW.marca,'')), '[[:space:]]+', ' ', 'g')),
      upper(regexp_replace(btrim(coalesce(NEW.modelo,'')), '[[:space:]]+', ' ', 'g'))
    ));
    IF v_chave_nova IS DISTINCT FROM v_chave_antiga THEN
      PERFORM atlas_private.atlas_catalogo_recalcular_valor(v_chave_nova);
    END IF;
    RETURN NEW;
  END IF;
  RETURN OLD;
END $func$;

REVOKE ALL ON FUNCTION atlas_private.atlas_catalogo_patrimonio_valores_trigger()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER atlas_catalogo_patrimonio_valores_trg
AFTER INSERT OR UPDATE OF valor_bem,nome_bem,marca,modelo,ativo OR DELETE
ON public.patrimonio FOR EACH ROW
EXECUTE FUNCTION atlas_private.atlas_catalogo_patrimonio_valores_trigger();

COMMIT;

-- REVERSÃO (em transação independente, se necessário):
-- BEGIN;
-- DROP TRIGGER atlas_catalogo_patrimonio_valores_trg ON public.patrimonio;
-- DROP FUNCTION atlas_private.atlas_catalogo_patrimonio_valores_trigger();
-- DROP FUNCTION atlas_private.atlas_catalogo_recalcular_valor(text);
-- ALTER TABLE public.atlas_catalogo_patrimonio
--   DROP COLUMN valor_referencia, DROP COLUMN valor_referencia_amostras;
-- COMMIT;
-- A cópia atlas_private.atlas_catalogo_backup_20261117 fica preservada.
