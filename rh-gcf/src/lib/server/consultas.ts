import "server-only";
import { listarFuncionarios } from "./funcionarios";
import { listarDatasCliente, listarDatasComemorativas } from "./datas";
import { obterConfigFelicitacoes } from "./felicitacoes";
import { eventosNoPeriodo, proximasOcorrencias, type Evento, type FontesEventos } from "@/lib/domain/eventos";
import { analisarCadastro, type AnaliseCadastro } from "@/lib/domain/pendencias";
import { hojeFortaleza, mesAtualEProximo, type DataISO } from "@/lib/domain/datas";
import type { Funcionario } from "@/lib/domain/tipos";

export interface FuncionarioResumo extends Funcionario {
  analise: AnaliseCadastro;
}

export async function funcionariosComAnalise(): Promise<FuncionarioResumo[]> {
  const todos = await listarFuncionarios();
  return todos.map((f) => ({ ...f, analise: analisarCadastro(f) }));
}

export async function carregarFontes(): Promise<FontesEventos> {
  const [funcionarios, datasComemorativas, datasCliente, config] = await Promise.all([
    listarFuncionarios(),
    listarDatasComemorativas(),
    listarDatasCliente(),
    obterConfigFelicitacoes(),
  ]);
  return { funcionarios, datasComemorativas, datasCliente, diaFelicitacao: config.dia_padrao };
}

export async function eventosDoPeriodo(inicio: DataISO, fim: DataISO, hoje: DataISO = hojeFortaleza()): Promise<Evento[]> {
  return eventosNoPeriodo(await carregarFontes(), inicio, fim, hoje);
}

/**
 * Dados do dashboard. Tudo é calculado na hora com a data de hoje em America/Fortaleza,
 * então os meses e os alertas mudam sozinhos (inclusive na virada do ano).
 * Funcionários desligados ficam fora dos indicadores de ativos e dos alertas.
 */
export async function dadosDashboard(hoje: DataISO = hojeFortaleza()) {
  const fontes = await carregarFontes();
  const meses = mesAtualEProximo(hoje);
  const ativos = fontes.funcionarios.filter((f) => f.status_vinculo === "ATIVO");
  const estagiarios = ativos.filter((f) => (f.situacao ?? "").toLowerCase().startsWith("estagi")).length;
  const analises = ativos.map((f) => analisarCadastro(f as Funcionario));
  const proximos = proximasOcorrencias(fontes, hoje).filter((e) => e.dias <= 30);

  return {
    hoje,
    meses,
    indicadores: {
      funcionariosAtivos: ativos.length - estagiarios,
      estagiariosAtivos: estagiarios,
      totalAtivos: ativos.length,
      desligados: fontes.funcionarios.length - ativos.length,
      completos: analises.filter((a) => a.nivel === "COMPLETO").length,
      incompletos: analises.filter((a) => a.nivel !== "COMPLETO").length,
    },
    alertas: {
      hoje: proximos.filter((e) => e.dias === 0),
      ate7: proximos.filter((e) => e.dias >= 1 && e.dias <= 7),
      ate15: proximos.filter((e) => e.dias >= 8 && e.dias <= 15),
      ate30: proximos.filter((e) => e.dias >= 16 && e.dias <= 30),
    },
    mesAtual: eventosNoPeriodo(fontes, meses.atual.inicio, meses.atual.fim, hoje),
    proximoMes: eventosNoPeriodo(fontes, meses.proximo.inicio, meses.proximo.fim, hoje),
  };
}
