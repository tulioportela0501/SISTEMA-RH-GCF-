-- =====================================================================
-- Sistema RH GCF — estrutura inicial (MySQL 8.0+)
-- =====================================================================
SET NAMES utf8mb4;

-- Usuários e autenticação
CREATE TABLE IF NOT EXISTS usuarios (
  id                      INT            NOT NULL AUTO_INCREMENT PRIMARY KEY,
  nome                    TEXT           NOT NULL,
  login                   VARCHAR(255)   NOT NULL UNIQUE,
  senha_hash              TEXT           NOT NULL,
  perfil                  VARCHAR(10)    NOT NULL,
  ativo                   TINYINT(1)     NOT NULL DEFAULT 1,
  tentativas_falhas       INT            NOT NULL DEFAULT 0,
  bloqueado_ate           DATETIME,
  ultimo_login_em         DATETIME,
  criado_em               DATETIME       NOT NULL DEFAULT NOW(),
  atualizado_em           DATETIME       NOT NULL DEFAULT NOW(),
  CONSTRAINT usuarios_perfil_check CHECK (perfil IN ('ADMIN', 'USUARIO'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sessoes (
  id             BIGINT         NOT NULL AUTO_INCREMENT PRIMARY KEY,
  usuario_id     INT            NOT NULL,
  token_hash     VARCHAR(255)   NOT NULL UNIQUE,
  criado_em      DATETIME       NOT NULL DEFAULT NOW(),
  expira_em      DATETIME       NOT NULL,
  ultimo_uso_em  DATETIME       NOT NULL DEFAULT NOW(),
  ip             TEXT,
  user_agent     TEXT,
  CONSTRAINT fk_sessoes_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX sessoes_usuario_idx ON sessoes (usuario_id);
CREATE INDEX sessoes_expira_idx  ON sessoes (expira_em);

CREATE TABLE IF NOT EXISTS tentativas_login (
  id           BIGINT      NOT NULL AUTO_INCREMENT PRIMARY KEY,
  login        TEXT,
  ip           TEXT,
  sucesso      TINYINT(1)  NOT NULL,
  ocorrido_em  DATETIME    NOT NULL DEFAULT NOW()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX tentativas_login_ip_idx ON tentativas_login (ip(100), ocorrido_em);

-- Importação da planilha
CREATE TABLE IF NOT EXISTS lotes_importacao (
  id              INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  arquivo_nome    TEXT         NOT NULL,
  arquivo_sha256  TEXT         NOT NULL,
  status          VARCHAR(20)  NOT NULL DEFAULT 'PREVIA',
  previa          JSON         NOT NULL,
  resumo          JSON,
  criado_por      INT,
  criado_em       DATETIME     NOT NULL DEFAULT NOW(),
  confirmado_por  INT,
  confirmado_em   DATETIME,
  CONSTRAINT lotes_status_check CHECK (status IN ('PREVIA', 'CONFIRMADA', 'CANCELADA')),
  CONSTRAINT fk_lotes_criado   FOREIGN KEY (criado_por)    REFERENCES usuarios(id),
  CONSTRAINT fk_lotes_confirm  FOREIGN KEY (confirmado_por) REFERENCES usuarios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Funcionários
CREATE TABLE IF NOT EXISTS funcionarios (
  id                  INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  nome                TEXT,
  situacao            TEXT,
  modalidade          TEXT,
  admissao            DATE,
  nascimento          DATE,
  email               TEXT,
  telefone            TEXT,
  armario             TEXT,
  contato_emergencia  TEXT,
  conjuge             TEXT,
  aniv_conjuge        DATE,
  filho1              TEXT,
  aniv_filho1         DATE,
  filho2              TEXT,
  aniv_filho2         DATE,
  filho3              TEXT,
  aniv_filho3         DATE,
  ferias1_inicio      DATE,
  ferias1_fim         DATE,
  ferias2_inicio      DATE,
  ferias2_fim         DATE,
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
  status_vinculo      VARCHAR(20)  NOT NULL DEFAULT 'ATIVO',
  desligado_em        DATE,
  origem              VARCHAR(20)  NOT NULL DEFAULT 'MANUAL',
  lote_importacao_id  INT,
  linha_planilha      INT,
  cor_planilha        TEXT,
  versao              INT          NOT NULL DEFAULT 1,
  criado_em           DATETIME     NOT NULL DEFAULT NOW(),
  atualizado_em       DATETIME     NOT NULL DEFAULT NOW(),
  criado_por          INT,
  atualizado_por      INT,
  CONSTRAINT funcionarios_status_check  CHECK (status_vinculo IN ('ATIVO', 'DESLIGADO')),
  CONSTRAINT funcionarios_origem_check  CHECK (origem IN ('MANUAL', 'IMPORTACAO')),
  CONSTRAINT fk_func_lote    FOREIGN KEY (lote_importacao_id) REFERENCES lotes_importacao(id),
  CONSTRAINT fk_func_criado  FOREIGN KEY (criado_por)         REFERENCES usuarios(id),
  CONSTRAINT fk_func_atual   FOREIGN KEY (atualizado_por)     REFERENCES usuarios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX funcionarios_status_idx ON funcionarios (status_vinculo);
CREATE INDEX funcionarios_nome_idx   ON funcionarios ((LOWER(nome)));

-- Datas comemorativas
CREATE TABLE IF NOT EXISTS datas_comemorativas (
  id                  INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  titulo              TEXT         NOT NULL,
  data                DATE         NOT NULL,
  recorrente          TINYINT(1)   NOT NULL DEFAULT 1,
  categoria           TEXT         NOT NULL DEFAULT 'Data comemorativa',
  descricao           TEXT,
  ativo               TINYINT(1)   NOT NULL DEFAULT 1,
  origem              VARCHAR(20)  NOT NULL DEFAULT 'MANUAL',
  lote_importacao_id  INT,
  linha_planilha      INT,
  versao              INT          NOT NULL DEFAULT 1,
  criado_em           DATETIME     NOT NULL DEFAULT NOW(),
  atualizado_em       DATETIME     NOT NULL DEFAULT NOW(),
  criado_por          INT,
  atualizado_por      INT,
  CONSTRAINT datas_com_origem_check CHECK (origem IN ('MANUAL', 'IMPORTACAO')),
  CONSTRAINT fk_dc_lote   FOREIGN KEY (lote_importacao_id) REFERENCES lotes_importacao(id),
  CONSTRAINT fk_dc_cri    FOREIGN KEY (criado_por)         REFERENCES usuarios(id),
  CONSTRAINT fk_dc_atu    FOREIGN KEY (atualizado_por)     REFERENCES usuarios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Datas do cliente
CREATE TABLE IF NOT EXISTS datas_cliente (
  id                        INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  cliente_nome              TEXT         NOT NULL,
  cnpj                      TEXT,
  tipo_data                 TEXT         NOT NULL,
  data_evento               DATE,
  inicio_parceria           DATE,
  recorrente                TINYINT(1)   NOT NULL DEFAULT 1,
  observacoes               TEXT,
  situacao_cliente          VARCHAR(10)  NOT NULL DEFAULT 'ATIVO',
  ativo                     TINYINT(1)   NOT NULL DEFAULT 1,
  versao                    INT          NOT NULL DEFAULT 1,
  criado_em                 DATETIME     NOT NULL DEFAULT NOW(),
  atualizado_em             DATETIME     NOT NULL DEFAULT NOW(),
  criado_por                INT,
  atualizado_por            INT,
  CONSTRAINT datas_cli_sit_check CHECK (situacao_cliente IN ('ATIVO', 'INATIVO')),
  CONSTRAINT fk_dca_cri  FOREIGN KEY (criado_por)    REFERENCES usuarios(id),
  CONSTRAINT fk_dca_atu  FOREIGN KEY (atualizado_por) REFERENCES usuarios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX datas_cliente_nome_idx ON datas_cliente ((LOWER(cliente_nome)));

-- Histórico de auditoria (somente inserção — protegido por triggers)
CREATE TABLE IF NOT EXISTS historico (
  id              BIGINT      NOT NULL AUTO_INCREMENT PRIMARY KEY,
  ocorrido_em     DATETIME    NOT NULL,
  usuario_id      INT,
  usuario_nome    TEXT        NOT NULL,
  operacao        TEXT        NOT NULL,
  entidade        TEXT        NOT NULL,
  entidade_id     INT,
  registro_nome   TEXT,
  campo           TEXT,
  campo_label     TEXT,
  valor_anterior  TEXT,
  valor_novo      TEXT,
  descricao       TEXT        NOT NULL,
  sensivel        TINYINT(1)  NOT NULL DEFAULT 0,
  ip              TEXT,
  lote_id         INT,
  hash_anterior   TEXT,
  hash            TEXT        NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX historico_ocorrido_idx ON historico (ocorrido_em DESC);
CREATE INDEX historico_entidade_idx ON historico (entidade(50), entidade_id);

-- Triggers de proteção do histórico (somente leitura após inserção)
CREATE TRIGGER historico_bloqueia_update
  BEFORE UPDATE ON historico
  FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'O histórico é protegido: UPDATE não permitido.';

CREATE TRIGGER historico_bloqueia_delete
  BEFORE DELETE ON historico
  FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'O histórico é protegido: DELETE não permitido.';
