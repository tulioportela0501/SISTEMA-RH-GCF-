import { z } from "zod";
import { exigirUsuarioApi, idDaRota, json, lerCorpo, lerCorpoOpcional, rota } from "@/lib/server/http";
import { dataClienteSchema, excluirDataCliente, salvarDataCliente } from "@/lib/server/datas";
import { atorDe } from "@/lib/server/ator";

type Ctx = { params: Promise<{ id: string }> };

export const PUT = rota<Ctx>(async (req, ctx) => {
  const u = await exigirUsuarioApi(req);
  const id = idDaRota((await ctx.params).id);
  const { dados, versao } = await lerCorpo(req, z.object({ dados: dataClienteSchema, versao: z.number().int() }));
  return json({ data: await salvarDataCliente(id, dados, versao, await atorDe(u), u.id) });
});

// Excluir é definitivo: somente administradores. O histórico registra o que foi excluído.
export const DELETE = rota<Ctx>(async (req, ctx) => {
  const u = await exigirUsuarioApi(req, { perfil: "ADMIN" });
  const id = idDaRota((await ctx.params).id);
  const { versao } = await lerCorpoOpcional(req, z.object({ versao: z.number().int().nullable().default(null) }));
  await excluirDataCliente(id, versao, await atorDe(u));
  return json({ ok: true });
});
