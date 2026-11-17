import "server-only";
import { ipDaRequisicao } from "./auth";
import type { Ator } from "./historico";
import type { UsuarioSessao } from "@/lib/domain/tipos";

export async function atorDe(u: UsuarioSessao): Promise<Ator> {
  return { id: u.id, nome: u.nome, ip: await ipDaRequisicao() };
}
