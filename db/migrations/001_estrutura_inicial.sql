-- =====================================================================
-- Sistema RH GCF — estrutura inicial
-- Datas sem horário são DATE (dia civil). Horários são TIMESTAMPTZ.
-- Fuso de referência do negócio: America/Fortaleza (aplicado na aplicação).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Usuários e sessões
-- ---------------------------------------------------------------------
CREATE TABLE usuarios (
  id                      SERIAL PRIMARY KEY,
  nome                    TEXT        NOT NULL,
  login                   TEXT        NOT NULL UNIQUE,
  senha_hash              TEXT        NOT NULL,
  perfil                  TEXT        NOT NULL CHECK (perfil IN ('ADMIN', 'USUARIO')),
  ativo                   BOOLEAN     NOT NULL DEFAULT TRUE,
  tentativas_falhas       INTEGER     NOT NULL DEFAULT 0,
  bloqueado_ate           TIMESTAMPTZ,
  ultimo_login_em         TIMESTAMPTZ,
  criado_em               TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em           TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT usuarios_login_minusculo CHECK (login = lower(login))
);

CREATE TABLE sessoes (
  id             BIGSERIAL PRIMARY KEY,
  usuario_id     INTEGER     NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  token_hash     TEXT        NOT NULL UNIQUE,
  criado_em      TIMESTAMPTZ NOT NULL DEFAULT now(),
  expira_em      TIMESTAMPTZ NOT NULL,
  ultimo_uso_em  TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip             TEXT,
  user_agent     TEXT
);
CREATE INDEX sessoes_usuario_idx ON sessoes (usuario_id);
CREATE INDEX sessoes_expira_idx ON sessoes (expira_em);

-- Tentativas de login (limite por IP contra força bruta)
CREATE TABLE tentativas_login (
  id           BIGSERIAL PRIMARY KEY,
  login        TEXT,
  ip           TEXT,
  sucesso      BOOLEAN     NOT NULL,
  ocorrido_em  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX tentativas_login_ip_idx ON tentativas_login (ip, ocorrido_em);

-- ---------------------------------------------------------------------
-- Importação da planilha (prévia + conferência antes de gravar)
-- ---------------------------------------------------------------------
CREATE TABLE lotes_importacao (
  id              SERIAL PRIMARY KEY,
  arquivo_nome    TEXT        NOT NULL,
  arquivo_sha256  TEXT        NOT NULL,
  status          TEXT        NOT NULL DEFAULT 'PREVIA' CHECK (status IN ('PREVIA', 'CONFIRMADA', 'CANCELADA')),
  previa          JSONB       NOT NULL,
  resumo          JSONB,
  criado_por      INTEGER     REFERENCES usuarios(id),
  criado_em       TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmado_por  INTEGER     REFERENCES usuarios(id),
  confirmado_em   TIMESTAMPTZ
);

-- ---------------------------------------------------------------------
-- Funcionários — os 34 campos da aba Base + controle interno
-- ---------------------------------------------------------------------
CREATE TABLE funcionarios (
  id                  SERIAL PRIMARY KEY,
  -- Seção 1 — Dados pessoais e profissionais
  nome                TEXT,
  situacao            TEXT,
  modalidade          TEXT,
  admissao            DATE,
  nascimento          DATE,
  email               TEXT,
  telefone            TEXT,
  armario             TEXT,
  contato_emergencia  TEXT,
  -- Seção 2 — Informações familiares
  conjuge             TEXT,
  aniv_conjuge        DATE,
  filho1              TEXT,
  aniv_filho1         DATE,
  filho2              TEXT,
  aniv_filho2         DATE,
  filho3              TEXT,
  aniv_filho3         DATE,
  -- Seção 3 — Controle de férias
  ferias1_inicio      DATE,
  ferias1_fim         DATE,
  ferias2_inicio      DATE,
  ferias2_fim         DATE,
  -- Seção 4 — Cadastros e acessos internos (valores originais preservados)
  zap_contabil        TEXT,
  cadastro_porta      TEXT,
  planilha_interna    TEXT,
  ifood               TEXT,
  lojinha             TEXT,
  plano_saude         TEXT,
  farda               TEXT,
  botom               TEXT,
  aso                 TEXT,
  coalize             TEXT,
  sittax              TEXT,
  salvar_documentos   TEXT,
  dominio             TEXT,
  -- Controle interno (não existe na planilha)
  status_vinculo      TEXT        NOT NULL DEFAULT 'ATIVO' CHECK (status_vinculo IN ('ATIVO', 'DESLIGADO')),
  desligado_em        DATE,
  origem              TEXT        NOT NULL DEFAULT 'MANUAL' CHECK (origem IN ('MANUAL', 'IMPORTACAO')),
  lote_importacao_id  INTEGER     REFERENCES lotes_importacao(id),
  linha_planilha      INTEGER,
  cor_planilha        TEXT,
  versao              INTEGER     NOT NULL DEFAULT 1,
  criado_em           TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em       TIMESTAMPTZ NOT NULL DEFAULT now(),
  criado_por          INTEGER     REFERENCES usuarios(id),
  atualizado_por      INTEGER     REFERENCES usuarios(id)
);
CREATE INDEX funcionarios_status_idx ON funcionarios (status_vinculo);
CREATE INDEX funcionarios_nome_idx ON funcionarios (lower(nome));

-- ---------------------------------------------------------------------
-- Datas comemorativas do escritório (eventos internos, datas profissionais)
-- ---------------------------------------------------------------------
CREATE TABLE datas_comemorativas (
  id                  SERIAL PRIMARY KEY,
  titulo              TEXT        NOT NULL,
  data                DATE        NOT NULL,
  recorrente          BOOLEAN     NOT NULL DEFAULT TRUE,
  categoria           TEXT        NOT NULL DEFAULT 'Data comemorativa',
  descricao           TEXT,
  ativo               BOOLEAN     NOT NULL DEFAULT TRUE,
  origem              TEXT        NOT NULL DEFAULT 'MANUAL' CHECK (origem IN ('MANUAL', 'IMPORTACAO')),
  lote_importacao_id  INTEGER     REFERENCES lotes_importacao(id),
  linha_planilha      INTEGER,
  versao              INTEGER     NOT NULL DEFAULT 1,
  criado_em           TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em       TIMESTAMPTZ NOT NULL DEFAULT now(),
  criado_por          INTEGER     REFERENCES usuarios(id),
  atualizado_por      INTEGER     REFERENCES usuarios(id)
);

-- ---------------------------------------------------------------------
-- Datas do cliente
-- ---------------------------------------------------------------------
CREATE TABLE datas_cliente (
  id                        SERIAL PRIMARY KEY,
  cliente_nome              TEXT        NOT NULL,
  cnpj                      TEXT,
  tipo_data                 TEXT        NOT NULL,
  data_evento               DATE,
  inicio_parceria           DATE,
  recorrente                BOOLEAN     NOT NULL DEFAULT TRUE,
  observacoes               TEXT,
  situacao_cliente          TEXT        NOT NULL DEFAULT 'ATIVO' CHECK (situacao_cliente IN ('ATIVO', 'INATIVO')),
  ativo                     BOOLEAN     NOT NULL DEFAULT TRUE,
  versao                    INTEGER     NOT NULL DEFAULT 1,
  criado_em                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em             TIMESTAMPTZ NOT NULL DEFAULT now(),
  criado_por                INTEGER     REFERENCES usuarios(id),
  atualizado_por            INTEGER     REFERENCES usuarios(id),
  CONSTRAINT datas_cliente_tem_data CHECK (data_evento IS NOT NULL OR inicio_parceria IS NOT NULL)
);
CREATE INDEX datas_cliente_nome_idx ON datas_cliente (lower(cliente_nome));

-- ---------------------------------------------------------------------
-- Histórico — somente consulta: UPDATE, DELETE e TRUNCATE são bloqueados no banco
-- ---------------------------------------------------------------------
CREATE TABLE historico (
  id              BIGSERIAL PRIMARY KEY,
  ocorrido_em     TIMESTAMPTZ NOT NULL,
  usuario_id      INTEGER,
  usuario_nome    TEXT        NOT NULL,
  operacao        TEXT        NOT NULL,
  entidade        TEXT        NOT NULL,
  entidade_id     INTEGER,
  registro_nome   TEXT,
  campo           TEXT,
  campo_label     TEXT,
  valor_anterior  TEXT,
  valor_novo      TEXT,
  descricao       TEXT        NOT NULL,
  sensivel        BOOLEAN     NOT NULL DEFAULT FALSE,
  ip              TEXT,
  lote_id         INTEGER,
  hash_anterior   TEXT,
  hash            TEXT        NOT NULL
);
CREATE INDEX historico_ocorrido_idx ON historico (ocorrido_em DESC);
CREATE INDEX historico_entidade_idx ON historico (entidade, entidade_id);

CREATE OR REPLACE FUNCTION historico_somente_leitura() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'O histórico é protegido: operação % não permitida.', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER historico_bloqueia_update_delete
  BEFORE UPDATE OR DELETE ON historico
  FOR EACH ROW EXECUTE FUNCTION historico_somente_leitura();

CREATE TRIGGER historico_bloqueia_truncate
  BEFORE TRUNCATE ON historico
  FOR EACH STATEMENT EXECUTE FUNCTION historico_somente_leitura();
