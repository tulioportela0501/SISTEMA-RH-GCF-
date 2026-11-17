import { ErroHttp, exigirUsuarioApi, json, rota } from "@/lib/server/http";
import { eventosDoPeriodo } from "@/lib/server/consultas";
import { diferencaDias, isDataISO } from "@/lib/domain/datas";

export const GET = rota(async (req) => {
  await exigirUsuarioApi(req);
  const sp = new URL(req.url).searchParams;
  const inicio = sp.get("inicio") ?? "";
  const fim = sp.get("fim") ?? "";
  if (!isDataISO(inicio) || !isDataISO(fim) || fim < inicio) throw new ErroHttp(400, "Período inválido.");
  if (diferencaDias(inicio, fim) > 400) throw new ErroHttp(400, "Período máximo de 400 dias.");
  return json({ eventos: await eventosDoPeriodo(inicio, fim) });
});
