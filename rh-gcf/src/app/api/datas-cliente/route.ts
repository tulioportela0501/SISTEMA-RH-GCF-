import { z } from "zod";
import { exigirUsuarioApi, json, lerCorpo, rota } from "@/lib/server/http";
import { dataClienteSchema, listarDatasCliente, salvarDataCliente } from "@/lib/server/datas";
import { atorDe } from "@/lib/server/ator";

export const GET = rota(async (req) => {
  await exigirUsuarioApi(req);
  return json({ datas: await listarDatasCliente() });
});

export const POST = rota(async (req) => {
  const u = await exigirUsuarioApi(req);
  const { dados } = await lerCorpo(req, z.object({ dados: dataClienteSchema }));
  return json({ data: await salvarDataCliente(null, dados, null, await atorDe(u), u.id) }, 201);
});
