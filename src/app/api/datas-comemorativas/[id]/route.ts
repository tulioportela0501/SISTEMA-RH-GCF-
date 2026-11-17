import { z } from "zod";
import { exigirUsuarioApi, idDaRota, json, lerCorpo, rota } from "@/lib/server/http";
import { dataComemorativaSchema, salvarDataComemorativa } from "@/lib/server/datas";
import { atorDe } from "@/lib/server/ator";

type Ctx = { params: Promise<{ id: string }> };

export const PUT = rota<Ctx>(async (req, ctx) => {
  const u = await exigirUsuarioApi(req);
  const id = idDaRota((await ctx.params).id);
  const { dados, versao } = await lerCorpo(req, z.object({ dados: dataComemorativaSchema, versao: z.number().int() }));
  return json({ data: await salvarDataComemorativa(id, dados, versao, await atorDe(u), u.id) });
});
