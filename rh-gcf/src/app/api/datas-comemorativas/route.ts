import { z } from "zod";
import { exigirUsuarioApi, json, lerCorpo, rota } from "@/lib/server/http";
import { dataComemorativaSchema, listarDatasComemorativas, salvarDataComemorativa } from "@/lib/server/datas";
import { atorDe } from "@/lib/server/ator";

export const GET = rota(async (req) => {
  await exigirUsuarioApi(req);
  return json({ datas: await listarDatasComemorativas() });
});

export const POST = rota(async (req) => {
  const u = await exigirUsuarioApi(req);
  const { dados } = await lerCorpo(req, z.object({ dados: dataComemorativaSchema }));
  return json({ data: await salvarDataComemorativa(null, dados, null, await atorDe(u), u.id) }, 201);
});
