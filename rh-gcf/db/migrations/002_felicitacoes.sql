-- =====================================================================
-- Clientes da planilha geral (Início GCF) e Central de Felicitações
-- - Dados da planilha geral nas datas do cliente: ID, tributação, responsáveis, demais colunas
-- - Início GCF com precisão de MÊS (a planilha informa mês/ano; o dia não é inventado)
-- - WhatsApp e preferência do cliente de não receber mensagens
-- - Felicitações preparadas/enviadas: uma por cliente e aniversário (sem duplicidade)
-- Envio manual pelo link oficial wa.me: nenhum robô envia mensagens.
-- =====================================================================

ALTER TABLE datas_cliente
  ADD COLUMN codigo                    TEXT,
  ADD COLUMN tributacao                TEXT,
  ADD COLUMN responsavel_fiscal        TEXT,
  ADD COLUMN responsavel_contabil      TEXT,
  ADD COLUMN responsavel_dp            TEXT,
  ADD COLUMN dados_extras              JSONB   NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN inicio_parceria_precisao  TEXT    NOT NULL DEFAULT 'DIA' CHECK (inicio_parceria_precisao IN ('DIA', 'MES')),
  ADD COLUMN whatsapp                  TEXT,
  ADD COLUMN nao_enviar                BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN nao_enviar_motivo         TEXT;

-- Empresa da planilha geral sem "Início GCF" informado: cadastrada assim mesmo (fica como incompleta).
ALTER TABLE datas_cliente DROP CONSTRAINT datas_cliente_tem_data;

CREATE INDEX datas_cliente_cnpj_idx ON datas_cliente (cnpj);

-- Dia do mês usado nas felicitações quando o Início GCF tem só mês e ano
CREATE TABLE felicitacoes_config (
  id              SMALLINT    PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  dia_padrao      SMALLINT    NOT NULL DEFAULT 1 CHECK (dia_padrao BETWEEN 1 AND 28),
  versao          INTEGER     NOT NULL DEFAULT 1,
  atualizado_em   TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_por  INTEGER     REFERENCES usuarios(id)
);
INSERT INTO felicitacoes_config (id) VALUES (1);

CREATE TABLE felicitacoes_modelos (
  id              SERIAL      PRIMARY KEY,
  nome            TEXT        NOT NULL,
  texto           TEXT        NOT NULL,
  padrao          BOOLEAN     NOT NULL DEFAULT FALSE,
  ativo           BOOLEAN     NOT NULL DEFAULT TRUE,
  versao          INTEGER     NOT NULL DEFAULT 1,
  criado_em       TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em   TIMESTAMPTZ NOT NULL DEFAULT now(),
  criado_por      INTEGER     REFERENCES usuarios(id),
  atualizado_por  INTEGER     REFERENCES usuarios(id)
);
CREATE UNIQUE INDEX felicitacoes_modelos_um_padrao ON felicitacoes_modelos (padrao) WHERE padrao;

INSERT INTO felicitacoes_modelos (nome, texto, padrao) VALUES (
  'Aniversário de parceria',
  E'💙 Hoje celebramos {anos} anos de parceria com a {empresa}!\n\nO Grupo Conceito Fiscal agradece pela confiança em nosso trabalho.\n\nÉ uma alegria fazer parte da sua trajetória e contribuir para o crescimento do seu negócio.\n\nQue nossa parceria continue por muitos anos, com grandes conquistas e resultados!\n\nGrupo Conceito Fiscal — O conceito certo para o seu sucesso empresarial.',
  TRUE
);

-- Sem registro = Pendente. PREPARADO = WhatsApp aberto (não significa enviado). ENVIADO só com confirmação do funcionário.
CREATE TABLE felicitacoes (
  id                 BIGSERIAL   PRIMARY KEY,
  data_cliente_id    INTEGER     REFERENCES datas_cliente(id) ON DELETE SET NULL,
  cliente_nome       TEXT        NOT NULL,
  cnpj               TEXT,
  ano                INTEGER     NOT NULL,
  anos_parceria      INTEGER     NOT NULL,
  inicio_gcf         TEXT        NOT NULL,
  data_felicitacao   DATE        NOT NULL,
  status             TEXT        NOT NULL CHECK (status IN ('PREPARADO', 'ENVIADO', 'NAO_ENVIAR')),
  -- Preparado para integrações futuras (n8n / API oficial do WhatsApp)
  canal              TEXT        NOT NULL DEFAULT 'WHATSAPP_MANUAL' CHECK (canal IN ('WHATSAPP_MANUAL', 'WHATSAPP_API', 'N8N')),
  whatsapp           TEXT,
  mensagem           TEXT,
  modelo_id          INTEGER     REFERENCES felicitacoes_modelos(id) ON DELETE SET NULL,
  motivo             TEXT,
  preparado_em       TIMESTAMPTZ,
  preparado_por      INTEGER     REFERENCES usuarios(id),
  preparado_por_nome TEXT,
  enviado_em         TIMESTAMPTZ,
  enviado_por        INTEGER     REFERENCES usuarios(id),
  enviado_por_nome   TEXT,
  versao             INTEGER     NOT NULL DEFAULT 1,
  criado_em          TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em      TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Uma felicitação por cliente e aniversário
CREATE UNIQUE INDEX felicitacoes_unica ON felicitacoes (data_cliente_id, ano) WHERE data_cliente_id IS NOT NULL;
CREATE INDEX felicitacoes_status_idx ON felicitacoes (status, ano);
