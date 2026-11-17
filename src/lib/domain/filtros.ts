/**
 * Filtros da aba Funcionários. A tela e a exportação usam a mesma função,
 * para a planilha exportada trazer exatamente o que aparece na lista.
 */
import { normalizarNome } from "@/lib/excel/normalizar";
import type { AnaliseCadastro } from "./pendencias";
import type { StatusVinculo } from "./tipos";

export type FiltroVinculo = "todos" | "ativos" | "desligados";
export type FiltroCadastro = "completos" | "incompletos";

export interface FiltrosFuncionarios {
  filtro: FiltroVinculo;
  busca?: string | null;
  situacao?: string | null;
  modalidade?: string | null;
  cadastro?: FiltroCadastro | null;
}

type Filtravel = { status_vinculo: StatusVinculo; situacao: string | null; modalidade: string | null; nome: string | null; analise: Pick<AnaliseCadastro, "nivel"> };

/** Situação e modalidade são comparadas sem diferenciar maiúsculas (ex.: "Home office" e "Home Office"). */
const mesmoValor = (a: string | null, b: string) => (a ?? "").trim().toLowerCase() === b.trim().toLowerCase();

export function filtrarFuncionarios<T extends Filtravel>(lista: T[], f: FiltrosFuncionarios): T[] {
  const termo = normalizarNome(f.busca);
  return lista.filter((x) => {
    if (f.filtro === "ativos" && x.status_vinculo !== "ATIVO") return false;
    if (f.filtro === "desligados" && x.status_vinculo !== "DESLIGADO") return false;
    if (f.situacao && !mesmoValor(x.situacao, f.situacao)) return false;
    if (f.modalidade && !mesmoValor(x.modalidade, f.modalidade)) return false;
    if (f.cadastro === "completos" && x.analise.nivel !== "COMPLETO") return false;
    if (f.cadastro === "incompletos" && x.analise.nivel === "COMPLETO") return false;
    if (termo && !normalizarNome(x.nome).includes(termo)) return false;
    return true;
  });
}

/** Descrição legível dos filtros (subtítulo da planilha exportada). */
export function descreverFiltrosFuncionarios(f: FiltrosFuncionarios): string {
  const partes = [`Status: ${f.filtro === "ativos" ? "Ativos" : f.filtro === "desligados" ? "Desligados" : "Todos"}`];
  if (f.situacao) partes.push(`Situação: ${f.situacao}`);
  if (f.modalidade) partes.push(`Modalidade: ${f.modalidade}`);
  if (f.cadastro) partes.push(`Cadastros ${f.cadastro}`);
  if (f.busca?.trim()) partes.push(`Pesquisa: "${f.busca.trim()}"`);
  return partes.join(" · ");
}
