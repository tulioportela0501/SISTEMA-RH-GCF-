import { z } from "zod";
import { exigirUsuarioApi, idDaRota, json, lerCorpoOpcional, rota } from "@/lib/server/http";
import { cancelarImportacao } from "@/lib/server/importacao";
import { confirmarImportacaoClientes } from "@/lib/server/importacao-clientes";
import { atorDe } from "@/lib/server/ator";

type Ctx = { params: Promise<{ id: string }> };

const corpoSchema = z.object({ substituir: z.array(z.string().max(300)).max(5000).default([]) });

// Confirma e grava os clientes conferidos na prévia.
// "substituir" lista os registros em que o usuário confirmou trocar os valores do sistema pelos da planilha.
export const POST = rota<Ctx>(async (req, ctx) => {
  const u = await exigirUsuarioApi(req, { perfil: "ADMIN" });
  const { substituir } = await lerCorpoOpcional(req, corpoSchema);
  const resultado = await confirmarImportacaoClientes(idDaRota((await ctx.params).id), substituir, await atorDe(u), u.id);
  return json({ resultado });
});

export const DELETE = rota<Ctx>(async (req, ctx) => {
  await exigirUsuarioApi(req, { perfil: "ADMIN" });
  await cancelarImportacao(idDaRota((await ctx.params).id));
  return json({ ok: true });
});
