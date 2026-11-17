/**
 * Leitura da aba "Calendário" da planilha RH GCF (gerada por fórmulas a partir da aba Base).
 *
 * Colunas: Próxima Data | Dias Restantes | Colaborador | Modalidade | Evento | Detalhe.
 * Cada linha é classificada pela coluna EVENTO (acentos, caixa e espaços não importam).
 * A coluna Modalidade não é usada para classificar.
 */
import type ExcelJS from "exceljs";
import type { EventoEmpresaLido, LeituraCalendario, TipoEventoCalendario } from "@/lib/domain/clientes";
import { dataDeValor, textoDeValor, valorCru } from "./celulas";
import { normalizarTexto } from "./normalizar";

export function tipoDoEvento(evento: string | null | undefined): TipoEventoCalendario | null {
  const n = normalizarTexto(evento ?? "");
  if (!n) return null;
  if (n === "aniversariodeempresa" || n === "aniversariodaempresa") return "EMPRESA";
  if (n === "aniversariodofuncionario" || n === "aniversariodefuncionario" || n === "aniversariodocolaborador") return "FUNCIONARIO";
  if (n.startsWith("aniversariodefilho") || n.startsWith("aniversariodofilho")) return "FILHO";
  if (n === "aniversariodoconjuge" || n === "aniversariodeconjuge") return "CONJUGE";
  if (n.startsWith("iniciodeferias") || n.startsWith("iniciodasferias")) return "FERIAS_INICIO";
  if (n.startsWith("fimdeferias") || n.startsWith("fimdasferias")) return "FERIAS_FIM";
  return "OUTRO";
}

/** "10 anos de empresa" → 10; "1 ano de empresa" → 1. */
export function anosDoDetalhe(detalhe: string | null): number | null {
  const m = /(\d+)\s*anos?\b/i.exec(detalhe ?? "");
  return m ? Number(m[1]) : null;
}

interface Colunas {
  linha: number;
  data: number;
  nome: number;
  evento: number;
  modalidade: number | null;
  detalhe: number | null;
}

function encontrarCabecalho(ws: ExcelJS.Worksheet): Colunas | null {
  const limite = Math.min(ws.rowCount, 15);
  for (let r = 1; r <= limite; r++) {
    const c: Partial<Colunas> = { linha: r, modalidade: null, detalhe: null };
    ws.getRow(r).eachCell({ includeEmpty: false }, (cell, col) => {
      const n = normalizarTexto(textoDeValor(valorCru(cell)) ?? "");
      if (!c.data && (n === "proximadata" || n === "data")) c.data = col;
      else if (!c.nome && (n === "colaborador" || n === "nome" || n === "funcionario")) c.nome = col;
      else if (!c.evento && n === "evento") c.evento = col;
      else if (c.modalidade == null && n === "modalidade") c.modalidade = col;
      else if (c.detalhe == null && n === "detalhe") c.detalhe = col;
    });
    if (c.data && c.nome && c.evento) return c as Colunas;
  }
  return null;
}

/** Procura a aba Calendário (pelo nome ou pelo cabeçalho) e classifica os eventos. */
export function lerCalendario(wb: ExcelJS.Workbook): LeituraCalendario | null {
  const candidatas = [...wb.worksheets].sort((a, b) => Number(normalizarTexto(b.name) === "calendario") - Number(normalizarTexto(a.name) === "calendario"));
  for (const ws of candidatas) {
    const cab = encontrarCabecalho(ws);
    if (!cab) continue;
    const porTipo: LeituraCalendario["porTipo"] = {};
    const empresa: EventoEmpresaLido[] = [];
    let total = 0;
    for (let r = cab.linha + 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const evento = textoDeValor(valorCru(row.getCell(cab.evento)));
      const nome = textoDeValor(valorCru(row.getCell(cab.nome)));
      const tipo = tipoDoEvento(evento);
      if (!tipo || !nome) continue; // linhas vazias (fórmulas sem resultado)
      total++;
      porTipo[tipo] = (porTipo[tipo] ?? 0) + 1;
      if (tipo !== "EMPRESA") continue;
      const detalhe = cab.detalhe ? textoDeValor(valorCru(row.getCell(cab.detalhe))) : null;
      empresa.push({
        aba: ws.name,
        linha: r,
        nome: nome.replace(/\s+/g, " ").trim(),
        data: dataDeValor(valorCru(row.getCell(cab.data)), false).data,
        anos: anosDoDetalhe(detalhe),
        detalhe,
        modalidade: cab.modalidade ? textoDeValor(valorCru(row.getCell(cab.modalidade))) : null,
        evento: evento!,
      });
    }
    return { aba: ws.name, linhaCabecalho: cab.linha, totalEventos: total, porTipo, empresa };
  }
  return null;
}
