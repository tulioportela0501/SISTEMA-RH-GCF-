import { exigirUsuarioApi, json, rota } from "@/lib/server/http";
import { consultarHistorico, filtrosDaUrl } from "@/lib/server/historico-consulta";

// Somente consulta: não existem rotas para editar ou excluir o histórico.
export const GET = rota(async (req) => {
  await exigirUsuarioApi(req);
  return json(await consultarHistorico(filtrosDaUrl(new URL(req.url).searchParams)));
});
