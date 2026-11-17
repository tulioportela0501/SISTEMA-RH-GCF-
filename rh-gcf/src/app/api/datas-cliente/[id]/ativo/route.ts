import { z } from "zod";
import { exigirUsuarioApi, idDaRota, json, lerCorpo, rota } from "@/lib/server/http";
import { alterarAtivoDataCliente } from "@/lib/server/datas";
import { atorDe } from "@/lib/server/ator";

type Ctx = { params: Promise<{ id: string }> };

export const POST = rota<Ctx>(async (req, ctx) => {
  const u = await exigirUsuarioApi(req);
  const { ativo } = await lerCorpo(req, z.object({ ativo: z.boolean() }));
  await alterarAtivoDataCliente(idDaRota((await ctx.params).id), ativo, await atorDe(u), u.id);
  return json({ ok: true });
});
