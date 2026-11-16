-- ATLAS / BDR: catalogo tecnico compartilhado para cadastro de patrimonio.
-- A tabela nao contem obra_id, patrimonio_id, serie, placa, valores ou dados pessoais.
-- Acesso de leitura ao papel anon e temporario para compatibilidade com contas legadas.
-- Nao altera registros da tabela public.patrimonio nem suas politicas RLS.

CREATE SCHEMA atlas_private;
REVOKE ALL ON SCHEMA atlas_private FROM PUBLIC, anon, authenticated;

CREATE TABLE public.atlas_catalogo_patrimonio (
  chave text PRIMARY KEY,
  nome_bem text NOT NULL CHECK (btrim(nome_bem) <> ''),
  marca text NOT NULL DEFAULT '',
  modelo text NOT NULL DEFAULT '',
  tipo_item text NOT NULL DEFAULT '',
  tipo_outro text NOT NULL DEFAULT '',
  combustivel text NOT NULL DEFAULT '',
  potencia text NOT NULL DEFAULT '',
  ncm text NOT NULL DEFAULT '' CHECK (ncm = '' OR ncm ~ '^[0-9]{8}$'),
  revisado boolean NOT NULL DEFAULT false,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.atlas_catalogo_patrimonio ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.atlas_catalogo_patrimonio FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.atlas_catalogo_patrimonio TO anon, authenticated;

CREATE POLICY atlas_catalogo_patrimonio_leitura
  ON public.atlas_catalogo_patrimonio
  FOR SELECT TO anon, authenticated
  USING (true);

-- Copia apenas caracteristicas tecnicas de patrimonios ja cadastrados.
-- Um modelo por combinacao nome + marca + modelo; prefere o registro mais completo.
WITH normalizados AS (
  SELECT
    id,
    upper(regexp_replace(btrim(coalesce(nome_bem, '')), '[[:space:]]+', ' ', 'g')) AS nome_bem,
    upper(regexp_replace(btrim(coalesce(marca, '')), '[[:space:]]+', ' ', 'g')) AS marca,
    upper(regexp_replace(btrim(coalesce(modelo, '')), '[[:space:]]+', ' ', 'g')) AS modelo,
    upper(btrim(coalesce(tipo_item, ''))) AS tipo_item,
    upper(btrim(coalesce(tipo_outro, ''))) AS tipo_outro,
    upper(btrim(coalesce(combustivel, ''))) AS combustivel,
    upper(btrim(coalesce(potencia, ''))) AS potencia,
    CASE WHEN btrim(coalesce(ncm, '')) ~ '^[0-9]{8}$'
      THEN btrim(ncm) ELSE '' END AS ncm
  FROM public.patrimonio
  WHERE btrim(coalesce(nome_bem, '')) <> ''
), com_chave AS (
  SELECT *, md5(concat_ws(chr(31), nome_bem, marca, modelo)) AS chave
  FROM normalizados
), melhores AS (
  SELECT DISTINCT ON (chave)
    chave, nome_bem, marca, modelo, tipo_item, tipo_outro, combustivel, potencia, ncm
  FROM com_chave
  ORDER BY chave,
    (CASE WHEN ncm <> '' THEN 8 ELSE 0 END
      + CASE WHEN tipo_item <> '' THEN 4 ELSE 0 END
      + CASE WHEN tipo_outro <> '' THEN 2 ELSE 0 END
      + CASE WHEN combustivel <> '' THEN 2 ELSE 0 END
      + CASE WHEN potencia <> '' THEN 2 ELSE 0 END) DESC,
    id DESC
)
INSERT INTO public.atlas_catalogo_patrimonio
  (chave, nome_bem, marca, modelo, tipo_item, tipo_outro, combustivel, potencia, ncm)
SELECT chave, nome_bem, marca, modelo, tipo_item, tipo_outro, combustivel, potencia, ncm
FROM melhores;

-- Atualiza o catalogo somente quando o registro de origem foi gravado por
-- uma sessao Supabase Auth autorizada para a obra. Contas legadas podem ler,
-- mas nao conseguem inserir novos padroes no catalogo ate serem migradas.
CREATE FUNCTION atlas_private.atlas_catalogar_patrimonio()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $func$
DECLARE
  v_nome text;
  v_marca text;
  v_modelo text;
  v_tipo text;
  v_tipo_outro text;
  v_combustivel text;
  v_potencia text;
  v_ncm text;
  v_chave text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.atlas_tem_acesso_obra(NEW.obra_id) THEN
    RETURN NEW;
  END IF;

  v_nome := upper(regexp_replace(btrim(coalesce(NEW.nome_bem, '')), '[[:space:]]+', ' ', 'g'));
  IF v_nome = '' THEN RETURN NEW; END IF;
  v_marca := upper(regexp_replace(btrim(coalesce(NEW.marca, '')), '[[:space:]]+', ' ', 'g'));
  v_modelo := upper(regexp_replace(btrim(coalesce(NEW.modelo, '')), '[[:space:]]+', ' ', 'g'));
  v_tipo := upper(btrim(coalesce(NEW.tipo_item, '')));
  v_tipo_outro := upper(btrim(coalesce(NEW.tipo_outro, '')));
  v_combustivel := upper(btrim(coalesce(NEW.combustivel, '')));
  v_potencia := upper(btrim(coalesce(NEW.potencia, '')));
  v_ncm := CASE WHEN btrim(coalesce(NEW.ncm, '')) ~ '^[0-9]{8}$'
    THEN btrim(NEW.ncm) ELSE '' END;
  v_chave := md5(concat_ws(chr(31), v_nome, v_marca, v_modelo));

  INSERT INTO public.atlas_catalogo_patrimonio AS atual
    (chave, nome_bem, marca, modelo, tipo_item, tipo_outro, combustivel, potencia, ncm)
  VALUES
    (v_chave, v_nome, v_marca, v_modelo, v_tipo, v_tipo_outro, v_combustivel, v_potencia, v_ncm)
  ON CONFLICT (chave) DO UPDATE SET
    tipo_item = CASE WHEN atual.tipo_item = '' THEN EXCLUDED.tipo_item ELSE atual.tipo_item END,
    tipo_outro = CASE WHEN atual.tipo_outro = '' THEN EXCLUDED.tipo_outro ELSE atual.tipo_outro END,
    combustivel = CASE WHEN atual.combustivel = '' THEN EXCLUDED.combustivel ELSE atual.combustivel END,
    potencia = CASE WHEN atual.potencia = '' THEN EXCLUDED.potencia ELSE atual.potencia END,
    ncm = CASE WHEN atual.ncm = '' THEN EXCLUDED.ncm ELSE atual.ncm END,
    atualizado_em = now()
  WHERE NOT atual.revisado
    AND ((atual.tipo_item = '' AND EXCLUDED.tipo_item <> '')
      OR (atual.tipo_outro = '' AND EXCLUDED.tipo_outro <> '')
      OR (atual.combustivel = '' AND EXCLUDED.combustivel <> '')
      OR (atual.potencia = '' AND EXCLUDED.potencia <> '')
      OR (atual.ncm = '' AND EXCLUDED.ncm <> ''));

  RETURN NEW;
END;
$func$;

REVOKE ALL ON FUNCTION atlas_private.atlas_catalogar_patrimonio() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER atlas_catalogar_patrimonio_trg
  AFTER INSERT OR UPDATE OF nome_bem, marca, modelo, tipo_item, tipo_outro, combustivel, potencia, ncm
  ON public.patrimonio
  FOR EACH ROW EXECUTE FUNCTION atlas_private.atlas_catalogar_patrimonio();

-- Reversao (somente se necessario, em transacao separada):
-- DROP TRIGGER atlas_catalogar_patrimonio_trg ON public.patrimonio;
-- DROP FUNCTION atlas_private.atlas_catalogar_patrimonio();
-- DROP TABLE public.atlas_catalogo_patrimonio;
-- DROP SCHEMA atlas_private;
