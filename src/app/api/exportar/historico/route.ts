import { z } from "zod";
import { exigirUsuarioApi, rota } from "@/lib/server/http";
import { exportarHistorico } from "@/lib/server/exportacao";
import { filtrosDaUrl } from "@/lib/server/historico-consulta";
import { atorDe } from "@/lib/server/ator";

const escopoSchema = z.enum(["filtrados", "todos"]).default("filtrados");

// Exporta o histórico (com os mesmos filtros da tela). Somente leitura: o histórico não é alterado.
export const GET = rota(async (req) => {
  const u = await exigirUsuarioApi(req);
  const sp = new URL(req.url).searchParams;
  const escopo = escopoSchema.parse(sp.get("escopo") ?? undefined);
  const { pagina: _p, ...filtros } = filtrosDaUrl(sp);
  return exportarHistorico(filtros, escopo, u, await atorDe(u));
});
