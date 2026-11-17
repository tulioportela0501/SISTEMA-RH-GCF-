/**
 * Testes com a planilha real. Os dados pessoais NÃO acompanham o código:
 * informe o caminho do arquivo em PLANILHA_TESTE para executar, por exemplo
 *   PLANILHA_TESTE="C:\RH\RH_GCF_Datas_comemorativas.xlsx" npm test
 */
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { lerPlanilha, lerPlanilhaClientes } from "@/lib/excel/importar";
import { proximasOcorrencias } from "@/lib/domain/eventos";
import { montar } from "@/lib/domain/datas";
import type { DataComemorativa } from "@/lib/domain/tipos";

const arquivo = process.env.PLANILHA_TESTE;
const temArquivo = !!arquivo && existsSync(arquivo);

describe.skipIf(!temArquivo)("Importação da planilha real", () => {
  it("lê as 34 colunas, todos os funcionários e as datas COMEMORAR", async () => {
    const r = await lerPlanilha(readFileSync(arquivo!));
    expect(r.colunasEncontradas).toHaveLength(34);
    expect(r.colunasAusentes).toHaveLength(0);
    expect(r.funcionarios.length + r.datasComemorativas.length + r.linhasVazias).toBe(62);
    expect(r.funcionarios).toHaveLength(34);
    expect(r.datasComemorativas).toHaveLength(28);
  });

  it("identifica como desligados somente as linhas com preenchimento vermelho", async () => {
    const r = await lerPlanilha(readFileSync(arquivo!));
    const desligados = r.funcionarios.filter((f) => f.desligadoPelaCor).map((f) => f.linha);
    expect(desligados).toEqual([16, 21, 29, 31, 35]);
    // Amarelos (estagiários destacados) e azuis claros continuam ativos
    for (const linha of [4, 5, 6, 9, 18, 22, 30, 32]) expect(r.funcionarios.find((f) => f.linha === linha)!.desligadoPelaCor).toBe(false);
  });

  it("preserva os valores originais (ex.: '—' nos cadastros internos)", async () => {
    const r = await lerPlanilha(readFileSync(arquivo!));
    const l9 = r.funcionarios.find((f) => f.linha === 9)!;
    expect(l9.valores.plano_saude).toBe("—");
    expect(l9.valores.armario).toBe("9");
    expect(l9.valores.ferias1_inicio).toBe("2027-07-17");
  });

  it("aba Datas do Cliente: o arquivo não é recusado; os 34 Aniversário de Empresa são colaboradores da aba Base", async () => {
    const r = await lerPlanilhaClientes(readFileSync(arquivo!));
    expect(r.clientes).toHaveLength(0);
    expect(r.base?.colaboradores).toHaveLength(34);
    expect(r.calendario?.porTipo.EMPRESA).toBe(34);
    const base = new Map(r.base!.colaboradores.map((c) => [c.nome.trim().toLowerCase(), c]));
    for (const e of r.calendario!.empresa) {
      const c = base.get(e.nome.trim().toLowerCase());
      expect(c, e.nome).toBeDefined();
      // A data do evento é o aniversário da Admissão e o Detalhe traz os anos de empresa
      expect(e.data!.slice(5)).toBe(c!.admissao!.slice(5));
      expect(e.anos).toBe(Number(e.data!.slice(0, 4)) - Number(c!.admissao!.slice(0, 4)));
    }
  });

  it("reproduz a aba Calendário (valores calculados pelo Excel em 03/11/2026)", async () => {
    const r = await lerPlanilha(readFileSync(arquivo!));
    const funcionarios = r.funcionarios.map((f, i) => ({ id: i + 1, ...f.valores, status_vinculo: "ATIVO" as const }));
    const datas: DataComemorativa[] = r.datasComemorativas.map((d, i) => ({
      id: i + 1, titulo: d.titulo, data: d.data, recorrente: true, categoria: d.categoria, descricao: null, ativo: true, origem: "IMPORTACAO", linha_planilha: d.linha, versao: 1,
    }));
    const nossos = proximasOcorrencias({ funcionarios, datasComemorativas: datas, datasCliente: [] }, "2026-11-03", { incluirDesligados: true }).map((e) => {
      const n = /FERIAS_(INICIO|FIM)(\d)/.exec(e.chave);
      const nome =
        e.tipo === "ANIV_EMPRESA" || e.tipo === "ADMISSAO" ? "Aniversário de Empresa"
        : e.tipo === "ANIV_FUNCIONARIO" || e.tipo === "DATA_COMEMORATIVA" ? "Aniversário do Funcionário"
        : e.tipo === "ANIV_CONJUGE" ? "Aniversário do Cônjuge"
        : e.tipo === "ANIV_FILHO" ? "Aniversário de Filho(a)"
        : `${n![1] === "INICIO" ? "Início" : "Fim"} de Férias (${n![2]})`;
      return `${e.data}|${e.titulo.trim()}|${nome}`;
    });

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(arquivo!);
    const cal = wb.getWorksheet("Calendário")!;
    const excel: string[] = [];
    cal.eachRow((row, i) => {
      if (i === 1) return;
      const v = (c: number) => {
        const x = row.getCell(c).value as unknown;
        return x && typeof x === "object" && "result" in (x as object) ? (x as { result: unknown }).result : x;
      };
      const data = v(1);
      if (!(data instanceof Date)) return;
      excel.push(`${montar(data.getUTCFullYear(), data.getUTCMonth() + 1, data.getUTCDate())}|${String(v(3)).trim()}|${v(5)}`);
    });
    expect(excel.length).toBeGreaterThan(100);
    // A aba aux da planilha só calcula as 60 primeiras linhas da Base ("capacidade até 60").
    // As linhas 63 e 64 (CLIENTES DO MÊS de novembro e dezembro) ficavam fora do Calendário do Excel;
    // o sistema não tem esse limite. Fora essas duas, o resultado é idêntico.
    const extras = nossos.filter((x) => !excel.includes(x));
    expect(extras.sort()).toEqual(["2026-12-01|CLIENTES DO MÊS|Aniversário do Funcionário", "2027-11-01|CLIENTES DO MÊS|Aniversário do Funcionário"]);
    expect(nossos.filter((x) => excel.includes(x)).sort()).toEqual([...excel].sort());
  });
});
