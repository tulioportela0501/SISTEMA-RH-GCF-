import "server-only";
import { query } from "./db";
import { ErroHttp } from "./http";
import { CHAVE_PREFERENCIA_PLANILHA, PREFERENCIA_PADRAO, preferenciaPlanilhaSchema, type PreferenciaPlanilha } from "@/lib/domain/planilha";

/** Preferências aceitas (cada chave com a sua validação). */
const ESQUEMAS = { [CHAVE_PREFERENCIA_PLANILHA]: preferenciaPlanilhaSchema } as const;
type Chave = keyof typeof ESQUEMAS;

function esquema(chave: string) {
  const e = ESQUEMAS[chave as Chave];
  if (!e) throw new ErroHttp(404, "Preferência desconhecida.");
  return e;
}

export async function obterPreferenciaPlanilha(usuarioId: number): Promise<PreferenciaPlanilha> {
  const r = await query<{ valor: unknown }>("SELECT valor FROM preferencias_usuario WHERE usuario_id = $1 AND chave = $2", [usuarioId, CHAVE_PREFERENCIA_PLANILHA]);
  const v = preferenciaPlanilhaSchema.safeParse(r[0]?.valor);
  return v.success ? v.data : PREFERENCIA_PADRAO;
}

export async function salvarPreferencia(usuarioId: number, chave: string, valor: unknown): Promise<unknown> {
  const dados = esquema(chave).parse(valor);
  await query(
    `INSERT INTO preferencias_usuario (usuario_id, chave, valor, atualizado_em) VALUES ($1, $2, $3, now())
     ON CONFLICT (usuario_id, chave) DO UPDATE SET valor = EXCLUDED.valor, atualizado_em = now()`,
    [usuarioId, chave, JSON.stringify(dados)],
  );
  return dados;
}

export async function apagarPreferencia(usuarioId: number, chave: string): Promise<void> {
  esquema(chave);
  await query("DELETE FROM preferencias_usuario WHERE usuario_id = $1 AND chave = $2", [usuarioId, chave]);
}
