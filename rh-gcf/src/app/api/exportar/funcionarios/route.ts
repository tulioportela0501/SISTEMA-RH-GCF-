import { z } from "zod";
import { ErroHttp, exigirUsuarioApi, rota } from "@/lib/server/http";
import { exportarFuncionarios } from "@/lib/server/exportacao";
import { atorDe } from "@/lib/server/ator";
import { CHAVES_CAMPOS, type CampoChave } from "@/lib/domain/campos";
import { filtrosColunasSchema, ordenacaoSchema } from "@/lib/domain/planilha";

const parametros = z.object({
  escopo: z.enum(["filtrados", "todos", "ativos", "desligados"]).default("filtrados"),
  formato: z.enum(["completo", "modelo"]).default("completo"),
  filtro: z.enum(["todos", "ativos", "desligados"]).default("ativos"),
  busca: z.string().max(100).nullish(),
  situacao: z.string().max(60).nullish(),
  modalidade: z.string().max(60).nullish(),
  cadastro: z.enum(["completos", "incompletos"]).nullish(),
  /** Filtros das colunas da Planilha Geral (JSON) */
  colunas: z.string().max(20_000).nullish(),
  /** Ordenação: campo:asc|desc */
  ordem: z.string().max(60).nullish(),
  /** Só estas colunas (separadas por vírgula), na ordem da tela */
  visiveis: z.string().max(1000).nullish(),
});

function lerJson<T>(texto: string | null | undefined, schema: z.ZodType<T>, erro: string): T | undefined {
  if (!texto) return undefined;
  try {
    return schema.parse(JSON.parse(texto));
  } catch {
    throw new ErroHttp(400, erro);
  }
}

// Exporta os funcionários para Excel (.xlsx). Somente leitura.
export const GET = rota(async (req) => {
  const u = await exigirUsuarioApi(req);
  const p = parametros.parse(Object.fromEntries(new URL(req.url).searchParams));
  const colunas = lerJson(p.colunas, filtrosColunasSchema, "Filtros das colunas inválidos.");
  const [campo, direcao] = (p.ordem ?? "").split(":");
  const ordem = p.ordem ? lerJson(JSON.stringify({ campo, direcao }), ordenacaoSchema, "Ordenação inválida.") : undefined;
  const visiveis = p.visiveis
    ? p.visiveis.split(",").filter((k): k is CampoChave => (CHAVES_CAMPOS as string[]).includes(k))
    : undefined;
  if (p.visiveis && !visiveis?.length) throw new ErroHttp(400, "Nenhuma coluna válida para exportar.");
  return exportarFuncionarios(
    { ...p, busca: p.busca ?? null, situacao: p.situacao || null, modalidade: p.modalidade || null, cadastro: p.cadastro ?? null, colunas, ordem, visiveis },
    u,
    await atorDe(u),
  );
});
