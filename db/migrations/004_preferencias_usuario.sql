-- ---------------------------------------------------------------
-- Preferências de visualização de cada usuário (ex.: colunas visíveis e larguras da Planilha Geral de Funcionários).
-- Só aparência: ocultar uma coluna não altera nenhum dado.
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS preferencias_usuario (
  usuario_id    INTEGER     NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  chave         TEXT        NOT NULL CHECK (char_length(chave) <= 80),
  valor         JSONB       NOT NULL,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (usuario_id, chave)
);
