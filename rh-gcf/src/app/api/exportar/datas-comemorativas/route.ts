import { z } from "zod";
import { exigirUsuarioApi, rota } from "@/lib/server/http";
import { exportarDatasComemorativas } from "@/lib/server/exportacao";
import { atorDe } from "@/lib/server/ator";
import { hojeFortaleza, partes } from "@/lib/domain/datas";

const parametros = z.object({
  conteudo: z.enum(["mes", "ano", "escritorio"]).default("mes"),
  ano: z.coerce.number().int().min(1900).max(2200).optional(),
  mes: z.coerce.number().int().min(1).max(12).optional(),
  grupo: z.enum(["todos", "aniversario", "empresa", "familia", "ferias", "escritorio", "cliente"]).default("todos"),
});

// Exporta as datas comemorativas (calendário do mês, 12 meses ou datas do escritório). Somente leitura.
export const GET = rota(async (req) => {
  const u = await exigirUsuarioApi(req);
  const p = parametros.parse(Object.fromEntries(new URL(req.url).searchParams));
  const hoje = partes(hojeFortaleza());
  return exportarDatasComemorativas({ conteudo: p.conteudo, ano: p.ano ?? hoje.ano, mes: p.mes ?? hoje.mes, grupo: p.grupo }, u, await atorDe(u));
});
