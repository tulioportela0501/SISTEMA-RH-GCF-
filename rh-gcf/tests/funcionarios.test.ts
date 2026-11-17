import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { CHAVES_CAMPOS, SECOES } from "@/lib/domain/campos";
import { camposACompletar, camposDiferentes, mesmoValorCampo } from "@/lib/domain/comparacao";
import { eventosNoPeriodo } from "@/lib/domain/eventos";
import { gerarArquivo, planilhaCalendario, type ContextoExportacao } from "@/lib/excel/exportar";
import type { Funcionario } from "@/lib/domain/tipos";

const ctx: ContextoExportacao = { geradoEm: new Date("2026-11-16T16:00:00Z"), usuario: "Teste", hoje: "2026-11-16" };

function funcionario(id: number, v: Partial<Funcionario>): Funcionario {
  const vazio = Object.fromEntries(CHAVES_CAMPOS.map((k) => [k, null])) as unknown as Funcionario;
  return { ...vazio, id, status_vinculo: "ATIVO", desligado_em: null, origem: "MANUAL", linha_planilha: null, cor_planilha: null, versao: 1, criado_em: "2026-01-10T12:00:00Z", atualizado_em: "2026-01-10T12:00:00Z", ...v };
}

describe("Seções do cadastro (aba Base)", () => {
  it("quatro seções com os nomes pedidos", () => {
    expect(Object.values(SECOES).map((s) => s.titulo)).toEqual(["Dados do funcionário", "Informações familiares", "Controle de férias", "Controle interno e benefícios"]);
  });
});

describe("Importação: comparação com o cadastro", () => {
  const atual = funcionario(1, {
    nome: "Ana Souza",
    situacao: "Efetivo",
    modalidade: "Presencial",
    admissao: "2020-03-02",
    nascimento: "1990-05-24",
    email: "Ana@X.com",
    telefone: "(98) 98888-0000",
    plano_saude: "—",
    armario: "12",
  });

  it("formatação diferente não é diferença", () => {
    expect(mesmoValorCampo("nome", "ANA SOUZA", "Ana Souza")).toBe(true);
    expect(mesmoValorCampo("email", "ana@x.com", "Ana@X.com")).toBe(true);
    expect(mesmoValorCampo("telefone", "98988880000", "(98) 98888-0000")).toBe(true);
    expect(mesmoValorCampo("telefone", "+55 98 98888-0000", "(98) 98888-0000")).toBe(true);
    expect(mesmoValorCampo("nascimento", "2000-05-24", "1990-05-24")).toBe(true); // aniversário: só dia e mês
    expect(mesmoValorCampo("plano_saude", "Não se aplica", "—")).toBe(true);
    expect(mesmoValorCampo("ifood", "ok", "OK")).toBe(true);
    expect(mesmoValorCampo("admissao", "2020-03-02", "2020-03-03")).toBe(false);
  });

  it("separa o que completa (vazio no sistema) do que substitui (diferente) e nunca apaga", () => {
    const planilha = { nome: "Ana Souza", situacao: "Efetivo", modalidade: "Home Office", admissao: "2020-03-02", email: "ana@x.com", telefone: "", armario: null, conjuge: "Pedro" };
    expect(camposACompletar(atual, planilha)).toEqual(["conjuge"]);
    expect(camposDiferentes(atual, planilha)).toEqual(["modalidade"]);
    // telefone vazio e armário vazio na planilha: o sistema mantém
    expect(camposDiferentes(atual, planilha)).not.toContain("telefone");
    expect(camposDiferentes(atual, planilha)).not.toContain("armario");
  });
});

describe("Datas comemorativas no formato da aba Calendário", () => {
  it("eventos dos funcionários com os nomes da planilha original", async () => {
    const f = funcionario(1, {
      nome: "MARCELO",
      situacao: "Efetivo",
      modalidade: "Presencial",
      admissao: "2016-11-25",
      nascimento: "1985-12-01",
      conjuge: "ABDEJANE",
      aniv_conjuge: "1987-01-04",
      filho1: "JI SUNG",
      aniv_filho1: "2015-11-20",
      ferias1_inicio: "2026-12-18",
      ferias1_fim: "2027-01-01",
    });
    const desligado = funcionario(2, { nome: "SAIU", situacao: "Efetivo", modalidade: "Presencial", admissao: "2018-11-30", nascimento: "1990-11-30", status_vinculo: "DESLIGADO" });
    const eventos = eventosNoPeriodo({ funcionarios: [f, desligado], datasComemorativas: [], datasCliente: [] }, "2026-11-16", "2027-11-15", "2026-11-16");
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(await gerarArquivo(planilhaCalendario(eventos, ctx, "próximos 12 meses", "Todas"))) as unknown as ArrayBuffer);
    const ws = wb.getWorksheet("Calendário")!;
    const linhas = ws.getRows(7, ws.rowCount - 6)!.map((r) => (r.values as unknown[]).slice(1, 7));
    const por = (evento: string) => linhas.find((l) => l[4] === evento);
    expect(por("Aniversário de Filho(a)")).toEqual([new Date(Date.UTC(2026, 10, 20)), 4, "MARCELO", "Presencial", "Aniversário de Filho(a)", "JI SUNG"]);
    expect(por("Aniversário de Empresa")).toEqual([new Date(Date.UTC(2026, 10, 25)), 9, "MARCELO", "Presencial", "Aniversário de Empresa", "10 anos de empresa"]);
    expect(por("Aniversário do Funcionário")?.slice(0, 3)).toEqual([new Date(Date.UTC(2026, 11, 1)), 15, "MARCELO"]);
    expect(por("Início de Férias (1)")?.[0]).toEqual(new Date(Date.UTC(2026, 11, 18)));
    expect(por("Fim de Férias (1)")?.[0]).toEqual(new Date(Date.UTC(2027, 0, 1)));
    expect(por("Aniversário do Cônjuge")?.[5]).toBe("ABDEJANE");
    // Desligados não geram datas
    expect(linhas.some((l) => l[2] === "SAIU")).toBe(false);
    // Ordenado pela próxima data
    const datas = linhas.map((l) => (l[0] as Date).getTime());
    expect([...datas].sort((a, b) => a - b)).toEqual(datas);
  });
});
