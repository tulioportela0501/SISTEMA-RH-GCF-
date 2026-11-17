-- =====================================================================
-- Preferências de visualização por usuário (MySQL)
-- =====================================================================
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS preferencias_usuario (
  usuario_id    INT          NOT NULL,
  chave         VARCHAR(80)  NOT NULL,
  valor         JSON         NOT NULL,
  atualizado_em DATETIME     NOT NULL DEFAULT NOW(),
  PRIMARY KEY (usuario_id, chave),
  CONSTRAINT fk_pref_usr FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
