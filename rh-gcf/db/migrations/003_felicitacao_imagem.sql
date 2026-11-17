-- ---------------------------------------------------------------
-- Felicitação com imagem
--  * Imagem padrão de felicitação (PNG ou JPG) guardada no banco:
--    não se perde ao reiniciar o sistema e entra no backup (pg_dump).
--  * Etapas registradas: Felicitação preparada → WhatsApp aberto → Enviado (confirmado pelo funcionário).
-- ---------------------------------------------------------------

CREATE TABLE felicitacoes_imagem (
  id                  SMALLINT    PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  nome                TEXT        NOT NULL,
  tipo                TEXT        NOT NULL CHECK (tipo IN ('image/png', 'image/jpeg')),
  tamanho             INTEGER     NOT NULL CHECK (tamanho > 0 AND tamanho <= 5242880),
  largura             INTEGER     NOT NULL,
  altura              INTEGER     NOT NULL,
  sha256              TEXT        NOT NULL,
  dados               BYTEA       NOT NULL,
  versao              INTEGER     NOT NULL DEFAULT 1,
  atualizado_em       TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_por      INTEGER     REFERENCES usuarios(id),
  atualizado_por_nome TEXT
);

-- Nova etapa "WhatsApp aberto". PREPARADO passa a significar "Felicitação preparada" (mensagem e imagem prontas).
ALTER TABLE felicitacoes DROP CONSTRAINT IF EXISTS felicitacoes_status_check;
ALTER TABLE felicitacoes
  ADD COLUMN whatsapp_aberto_em       TIMESTAMPTZ,
  ADD COLUMN whatsapp_aberto_por      INTEGER REFERENCES usuarios(id),
  ADD COLUMN whatsapp_aberto_por_nome TEXT,
  ADD COLUMN com_imagem               BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN imagem_sha256            TEXT;

-- Na versão anterior, PREPARADO era gravado ao abrir o WhatsApp: esses registros passam a "WhatsApp aberto".
UPDATE felicitacoes
   SET status = 'ABERTO',
       whatsapp_aberto_em = preparado_em,
       whatsapp_aberto_por = preparado_por,
       whatsapp_aberto_por_nome = preparado_por_nome
 WHERE status = 'PREPARADO';

ALTER TABLE felicitacoes ADD CONSTRAINT felicitacoes_status_check CHECK (status IN ('PREPARADO', 'ABERTO', 'ENVIADO', 'NAO_ENVIAR'));
