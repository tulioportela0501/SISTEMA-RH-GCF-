import { z } from "zod";
import { exigirUsuarioApi, json, lerCorpo, rota } from "@/lib/server/http";
import { listarModelos, modeloSchema, salvarModelo } from "@/lib/server/felicitacoes";
import { atorDe } from "@/lib/server/ator";

export const GET = rota(async (req) => {
  await exigirUsuarioApi(req);
  return json({ modelos: await listarModelos() });
});

export const POST = rota(async (req) => {
  const u = await exigirUsuarioApi(req);
  const { dados } = await lerCorpo(req, z.object({ dados: modeloSchema }));
  return json({ modelo: await salvarModelo(null, dados, null, await atorDe(u), u.id) }, 201);
});
