-- =====================================================================
-- Imagem padrão de felicitação (MySQL)
-- =====================================================================
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS felicitacoes_imagem (
  id                  TINYINT      NOT NULL DEFAULT 1 PRIMARY KEY,
  nome                TEXT         NOT NULL,
  tipo                VARCHAR(15)  NOT NULL,
  tamanho             INT          NOT NULL,
  largura             INT          NOT NULL,
  altura              INT          NOT NULL,
  sha256              TEXT         NOT NULL,
  dados               LONGBLOB     NOT NULL,
  versao              INT          NOT NULL DEFAULT 1,
  atualizado_em       DATETIME     NOT NULL DEFAULT NOW(),
  atualizado_por      INT,
  atualizado_por_nome TEXT,
  CONSTRAINT feli_img_id_check   CHECK (id = 1),
  CONSTRAINT feli_img_tipo_check CHECK (tipo IN ('image/png', 'image/jpeg')),
  CONSTRAINT feli_img_tam_check  CHECK (tamanho > 0 AND tamanho <= 5242880),
  CONSTRAINT fk_felimg_atu FOREIGN KEY (atualizado_por) REFERENCES usuarios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
