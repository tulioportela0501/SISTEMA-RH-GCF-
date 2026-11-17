-- =====================================================================
-- Clientes da planilha geral (Início GCF) e Central de Felicitações (MySQL)
-- =====================================================================
SET NAMES utf8mb4;

ALTER TABLE datas_cliente
  ADD COLUMN codigo                    TEXT,
  ADD COLUMN tributacao                TEXT,
  ADD COLUMN responsavel_fiscal        TEXT,
  ADD COLUMN responsavel_contabil      TEXT,
  ADD COLUMN responsavel_dp            TEXT,
  ADD COLUMN dados_extras              JSON         NOT NULL DEFAULT (JSON_OBJECT()),
  ADD COLUMN inicio_parceria_precisao  VARCHAR(5)   NOT NULL DEFAULT 'DIA',
  ADD COLUMN whatsapp                  TEXT,
  ADD COLUMN nao_enviar                TINYINT(1)   NOT NULL DEFAULT 0,
  ADD COLUMN nao_enviar_motivo         TEXT;

ALTER TABLE datas_cliente
  ADD CONSTRAINT datas_cli_precisao_check CHECK (inicio_parceria_precisao IN ('DIA', 'MES'));

CREATE INDEX datas_cliente_cnpj_idx ON datas_cliente (cnpj(30));

-- Configuração global das felicitações
CREATE TABLE IF NOT EXISTS felicitacoes_config (
  id              TINYINT     NOT NULL DEFAULT 1 PRIMARY KEY,
  dia_padrao      TINYINT     NOT NULL DEFAULT 1,
  versao          INT         NOT NULL DEFAULT 1,
  atualizado_em   DATETIME    NOT NULL DEFAULT NOW(),
  atualizado_por  INT,
  CONSTRAINT feli_cfg_id_check   CHECK (id = 1),
  CONSTRAINT feli_cfg_dia_check  CHECK (dia_padrao BETWEEN 1 AND 28),
  CONSTRAINT fk_felcfg_atu  FOREIGN KEY (atualizado_por) REFERENCES usuarios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO felicitacoes_config (id) VALUES (1);

-- Modelos de mensagem de felicitação
CREATE TABLE IF NOT EXISTS felicitacoes_modelos (
  id              INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  nome            TEXT         NOT NULL,
  texto           TEXT         NOT NULL,
  padrao          TINYINT(1)   NOT NULL DEFAULT 0,
  ativo           TINYINT(1)   NOT NULL DEFAULT 1,
  versao          INT          NOT NULL DEFAULT 1,
  criado_em       DATETIME     NOT NULL DEFAULT NOW(),
  atualizado_em   DATETIME     NOT NULL DEFAULT NOW(),
  criado_por      INT,
  atualizado_por  INT,
  CONSTRAINT fk_felmod_cri FOREIGN KEY (criado_por)    REFERENCES usuarios(id),
  CONSTRAINT fk_felmod_atu FOREIGN KEY (atualizado_por) REFERENCES usuarios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Apenas um modelo pode ser padrão: índice funcional (NULL é ignorado no UNIQUE)
CREATE UNIQUE INDEX felicitacoes_modelos_um_padrao
  ON felicitacoes_modelos ((CASE WHEN padrao = 1 THEN 1 ELSE NULL END));

INSERT INTO felicitacoes_modelos (nome, texto, padrao) VALUES (
  'Aniversário de parceria',
  '💙 Hoje celebramos {anos} anos de parceria com a {empresa}!\n\nO Grupo Conceito Fiscal agradece pela confiança em nosso trabalho.\n\nÉ uma alegria fazer parte da sua trajetória e contribuir para o crescimento do seu negócio.\n\nQue nossa parceria continue por muitos anos, com grandes conquistas e resultados!\n\nGrupo Conceito Fiscal — O conceito certo para o seu sucesso empresarial.',
  1
);

-- Felicitações enviadas/preparadas
CREATE TABLE IF NOT EXISTS felicitacoes (
  id                       BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
  data_cliente_id          INT,
  cliente_nome             TEXT         NOT NULL,
  cnpj                     TEXT,
  ano                      INT          NOT NULL,
  anos_parceria            INT          NOT NULL,
  inicio_gcf               TEXT         NOT NULL,
  data_felicitacao         DATE         NOT NULL,
  status                   VARCHAR(15)  NOT NULL,
  canal                    VARCHAR(20)  NOT NULL DEFAULT 'WHATSAPP_MANUAL',
  whatsapp                 TEXT,
  mensagem                 TEXT,
  modelo_id                INT,
  motivo                   TEXT,
  preparado_em             DATETIME,
  preparado_por            INT,
  preparado_por_nome       TEXT,
  whatsapp_aberto_em       DATETIME,
  whatsapp_aberto_por      INT,
  whatsapp_aberto_por_nome TEXT,
  enviado_em               DATETIME,
  enviado_por              INT,
  enviado_por_nome         TEXT,
  com_imagem               TINYINT(1)   NOT NULL DEFAULT 0,
  imagem_sha256            TEXT,
  versao                   INT          NOT NULL DEFAULT 1,
  criado_em                DATETIME     NOT NULL DEFAULT NOW(),
  atualizado_em            DATETIME     NOT NULL DEFAULT NOW(),
  CONSTRAINT feli_status_check CHECK (status IN ('PREPARADO', 'ABERTO', 'ENVIADO', 'NAO_ENVIAR')),
  CONSTRAINT feli_canal_check  CHECK (canal  IN ('WHATSAPP_MANUAL', 'WHATSAPP_API', 'N8N')),
  CONSTRAINT fk_feli_dc    FOREIGN KEY (data_cliente_id) REFERENCES datas_cliente(id) ON DELETE SET NULL,
  CONSTRAINT fk_feli_mod   FOREIGN KEY (modelo_id)       REFERENCES felicitacoes_modelos(id) ON DELETE SET NULL,
  CONSTRAINT fk_feli_prep  FOREIGN KEY (preparado_por)   REFERENCES usuarios(id),
  CONSTRAINT fk_feli_wabo  FOREIGN KEY (whatsapp_aberto_por) REFERENCES usuarios(id),
  CONSTRAINT fk_feli_env   FOREIGN KEY (enviado_por)     REFERENCES usuarios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Uma felicitação por cliente+ano; NULL em data_cliente_id não viola o UNIQUE (NULLs distintos)
CREATE UNIQUE INDEX felicitacoes_unica    ON felicitacoes (data_cliente_id, ano);
CREATE INDEX        felicitacoes_status_idx ON felicitacoes (status, ano);
