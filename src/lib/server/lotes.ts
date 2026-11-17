import "server-only";
import { query, queryOne } from "./db";

/** Prévias com mais de 24 horas são canceladas e os dados pessoais descartados. */
export async function limparPreviasAntigas(): Promise<void> {
  await query(
    `UPDATE lotes_importacao SET status = 'CANCELADA', previa = jsonb_build_object('arquivo', previa->'arquivo', 'resumo', previa->'resumo')
      WHERE status = 'PREVIA' AND criado_em < now() - interval '24 hours'`,
  );
}

export interface ImportacaoAnterior {
  arquivo: string;
  em: string;
  por: string | null;
}

/** O mesmo arquivo (mesmo conteúdo) já foi importado antes? */
export async function arquivoJaImportado(sha256: string): Promise<ImportacaoAnterior | null> {
  const r = await queryOne<{ arquivo_nome: string; confirmado_em: Date; nome: string | null }>(
    `SELECT l.arquivo_nome, l.confirmado_em, u.nome FROM lotes_importacao l LEFT JOIN usuarios u ON u.id = l.confirmado_por
      WHERE l.arquivo_sha256 = $1 AND l.status = 'CONFIRMADA' ORDER BY l.confirmado_em DESC LIMIT 1`,
    [sha256],
  );
  return r ? { arquivo: r.arquivo_nome, em: new Date(r.confirmado_em).toISOString(), por: r.nome } : null;
}
