import { z } from "zod";
import { exigirUsuarioApi, rota } from "@/lib/server/http";
import { exportarFelicitacoes } from "@/lib/server/exportacao";
import { atorDe } from "@/lib/server/ator";
import { hojeFortaleza, partes } from "@/lib/domain/datas";

const parametros = z.object({
  escopo: z.enum(["lista", "mes", "pendentes", "enviadas", "historico"]).default("mes"),
  ano: z.coerce.number().int().min(2000).max(2200).optional(),
  mes: z.coerce.number().int().min(1).max(12).optional(),
  // Lista exibida na Central: filtro de status e pesquisa
  status: z.enum(["todos", "pendentes", "PENDENTE", "PREPARADO", "ABERTO", "ENVIADO", "NAO_ENVIAR"]).default("todos"),
  busca: z.string().trim().max(120).optional(),
});

// Exporta a Central de Felicitações para Excel. Somente leitura.
export const GET = rota(async (req) => {
  const u = await exigirUsuarioApi(req);
  const p = parametros.parse(Object.fromEntries(new URL(req.url).searchParams));
  const hoje = partes(hojeFortaleza());
  return exportarFelicitacoes({ escopo: p.escopo, ano: p.ano ?? hoje.ano, mes: p.mes ?? hoje.mes, status: p.status, busca: p.busca }, u, await atorDe(u));
});
