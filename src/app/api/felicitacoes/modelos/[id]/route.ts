import { z } from "zod";
import { exigirUsuarioApi, idDaRota, json, lerCorpo, rota } from "@/lib/server/http";
import { modeloSchema, salvarModelo } from "@/lib/server/felicitacoes";
import { atorDe } from "@/lib/server/ator";

type Ctx = { params: Promise<{ id: string }> };

export const PUT = rota<Ctx>(async (req, ctx) => {
  const u = await exigirUsuarioApi(req);
  const id = idDaRota((await ctx.params).id);
  const { dados, versao } = await lerCorpo(req, z.object({ dados: modeloSchema, versao: z.number().int() }));
  return json({ modelo: await salvarModelo(id, dados, versao, await atorDe(u), u.id) });
});
