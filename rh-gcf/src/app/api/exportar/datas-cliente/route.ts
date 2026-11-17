import { z } from "zod";
import { exigirUsuarioApi, rota } from "@/lib/server/http";
import { exportarClientes } from "@/lib/server/exportacao";
import { atorDe } from "@/lib/server/ator";

const parametros = z.object({
  escopo: z.enum(["todos", "ativos", "inativos", "pesquisa"]).default("todos"),
  filtro: z.enum(["ativos", "inativos", "todos"]).default("todos"),
  busca: z.string().max(100).nullish(),
  mes: z.coerce.number().int().min(1).max(12).nullish(),
});

// Exporta as datas dos clientes para Excel (.xlsx). Somente leitura.
export const GET = rota(async (req) => {
  const u = await exigirUsuarioApi(req);
  const p = parametros.parse(Object.fromEntries(new URL(req.url).searchParams));
  return exportarClientes({ ...p, busca: p.busca ?? null, mes: p.mes ?? null }, u, await atorDe(u));
});
