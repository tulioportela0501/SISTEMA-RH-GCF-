import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { CAMPOS_LISTA, CHAVES_CAMPOS } from "@/lib/domain/campos";
import { analisarCadastro } from "@/lib/domain/pendencias";
import { aplicarPlanilha, descreverConsulta, filtrosColunasSchema, ordenarPlanilha, passaFiltro, preferenciaPlanilhaSchema, textoCelula, valoresDaColuna } from "@/lib/domain/planilha";
import { gerarArquivo, planilhaFuncionarios, type ContextoExportacao } from "@/lib/excel/exportar";
import { lerPlanilha } from "@/lib/excel/importar";
import type { Funcionario } from "@/lib/domain/tipos";

const ctx: ContextoExportacao = { geradoEm: new Date("2026-11-16T16:00:00Z"), usuario: "Teste", hoje: "2026-11-16" };

function funcionario(id: number, v: Partial<Funcionario>): Funcionario {
  const vazio = Object.fromEntries(CHAVES_CAMPOS.map((k) => [k, null])) as unknown as Funcionario;
  return { ...vazio, id, status_vinculo: "ATIVO", desligado_em: null, origem: "MANUAL", linha_planilha: null, cor_planilha: null, versao: 1, criado_em: "2026-01-10T12:00:00Z", atualizado_em: "2026-01-10T12:00:00Z", ...v };
}

const LISTA = [
  funcionario(1, { nome: "Ana Souza", situacao: "Efetivo", modalidade: "Presencial", admissao: "2020-03-02", nascimento: "1990-05-24", email: "ana@gcf.com", telefone: "(98) 98888-0000", ifood: "OK", plano_saude: "—" }),
  funcionario(2, { nome: "Bruno Lima", situacao: "Efetivo", modalidade: "Home Office", admissao: "2019-01-10", nascimento: "1985-11-20", ifood: "Pendente", status_vinculo: "DESLIGADO" }),
  funcionario(3, { nome: "Carla Dias", situacao: "Estagiário", modalidade: "Presencial", admissao: "2026-08-01", nascimento: "2003-05-02", telefone: "98 97777-1234" }),
  funcionario(4, { nome: "Davi Rocha", situacao: "Home office", modalidade: "Home Office", admissao: null, email: "davi@gcf.com", ifood: "OK" }),
].map((f) => ({ ...f, analise: analisarCadastro(f) }));

const ids = (l: { id: number }[]) => l.map((f) => f.id);

describe("Planilha Geral: filtros por coluna", () => {
  it("valores (situação, modalidade, benefícios) e vazios", () => {
    expect(ids(aplicarPlanilha(LISTA, { vinculo: "todos", colunas: { situacao: { tipo: "valores", valores: ["Efetivo"] } } }))).toEqual([1, 2]);
    expect(ids(aplicarPlanilha(LISTA, { vinculo: "ativos", colunas: { modalidade: { tipo: "valores", valores: ["home office"] } } }))).toEqual([4]);
    expect(ids(aplicarPlanilha(LISTA, { vinculo: "todos", colunas: { ifood: { tipo: "valores", valores: [""] } } }))).toEqual([3]);
    expect(ids(aplicarPlanilha(LISTA, { vinculo: "todos", colunas: { ifood: { tipo: "valores", valores: ["OK", "Pendente"] } } }))).toEqual([1, 2, 4]);
    expect(valoresDaColuna(LISTA, "ifood")).toEqual([
      { valor: "OK", quantidade: 2 },
      { valor: "Pendente", quantidade: 1 },
      { valor: "", quantidade: 1 },
    ]);
  });

  it("período de admissão, dia/mês do nascimento e texto", () => {
    expect(ids(aplicarPlanilha(LISTA, { vinculo: "todos", colunas: { admissao: { tipo: "periodo", de: "2020-01-01", ate: "2026-12-31" } } }))).toEqual([1, 3]);
    expect(ids(aplicarPlanilha(LISTA, { vinculo: "todos", colunas: { admissao: { tipo: "periodo", vazio: "vazios" } } }))).toEqual([4]);
    expect(ids(aplicarPlanilha(LISTA, { vinculo: "todos", colunas: { nascimento: { tipo: "diames", mes: 5 } } }))).toEqual([1, 3]);
    expect(ids(aplicarPlanilha(LISTA, { vinculo: "todos", colunas: { nascimento: { tipo: "diames", mes: 5, dia: 24 } } }))).toEqual([1]);
    expect(ids(aplicarPlanilha(LISTA, { vinculo: "todos", colunas: { email: { tipo: "texto", vazio: "preenchidos" } } }))).toEqual([1, 4]);
    expect(passaFiltro("telefone", "(98) 97777-1234", { tipo: "texto", termo: "977771" })).toBe(true);
    expect(passaFiltro("nome", "João Pereira", { tipo: "texto", termo: "joao" })).toBe(true);
  });

  it("pesquisa geral por nome, e-mail ou telefone", () => {
    expect(ids(aplicarPlanilha(LISTA, { vinculo: "todos", busca: "carla" }))).toEqual([3]);
    expect(ids(aplicarPlanilha(LISTA, { vinculo: "todos", busca: "davi@" }))).toEqual([4]);
    expect(ids(aplicarPlanilha(LISTA, { vinculo: "todos", busca: "98888" }))).toEqual([1]);
  });

  it("ordenação crescente e decrescente, vazios no fim", () => {
    expect(ids(ordenarPlanilha(LISTA, { campo: "admissao", direcao: "asc" }))).toEqual([2, 1, 3, 4]);
    expect(ids(ordenarPlanilha(LISTA, { campo: "admissao", direcao: "desc" }))).toEqual([3, 1, 2, 4]);
    // Nascimento ordena por mês e dia (aniversário), não pelo ano
    expect(ids(ordenarPlanilha(LISTA, { campo: "nascimento", direcao: "asc" }))).toEqual([3, 1, 2, 4]);
    expect(ids(ordenarPlanilha(LISTA, { campo: "nome", direcao: "desc" }))).toEqual([4, 3, 2, 1]);
  });

  it("textos das células e descrição dos filtros", () => {
    expect(textoCelula("admissao", "2020-03-02")).toBe("02/03/2020");
    expect(textoCelula("nascimento", "1990-05-24")).toBe("24/05");
    expect(descreverConsulta({ vinculo: "ativos", colunas: { situacao: { tipo: "valores", valores: ["Efetivo"] } }, ordem: { campo: "nome", direcao: "asc" } })).toBe(
      "Status: Ativos · Situação: Efetivo · Ordem: Nome (crescente)",
    );
  });

  it("valida filtros e preferências vindos de fora", () => {
    expect(filtrosColunasSchema.safeParse({ situacao: { tipo: "valores", valores: ["Efetivo"] } }).success).toBe(true);
    expect(filtrosColunasSchema.safeParse({ inexistente: { tipo: "valores", valores: [] } }).success).toBe(false);
    expect(preferenciaPlanilhaSchema.parse({ ocultas: ["armario"], larguras: { nome: 300 } })).toEqual({ ocultas: ["armario"], larguras: { nome: 300 } });
    expect(preferenciaPlanilhaSchema.safeParse({ ocultas: ["xx"] }).success).toBe(false);
    expect(preferenciaPlanilhaSchema.safeParse({ larguras: { nome: 5000 } }).success).toBe(false);
  });
});

describe("Planilha Geral: importação e exportação", () => {
  it("importa pela posição dos nomes dos cabeçalhos, mesmo com as colunas em outra ordem", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Base");
    const ordem = [...CAMPOS_LISTA].reverse();
    ws.addRow(["GRUPO CONCEITO FISCAL · Cadastro de Funcionários"]);
    ws.addRow(ordem.map((c) => c.cabecalho));
    const ana = LISTA[0];
    ws.addRow(ordem.map((c) => (c.tipo === "data" || c.tipo === "diames" ? (ana[c.chave] ? new Date(`${ana[c.chave]}T00:00:00Z`) : null) : ana[c.chave])));
    const r = await lerPlanilha(Buffer.from(await wb.xlsx.writeBuffer()));
    expect(r.colunasEncontradas).toHaveLength(34);
    expect(r.funcionarios).toHaveLength(1);
    for (const k of CHAVES_CAMPOS) expect(r.funcionarios[0].valores[k] ?? null, k).toBe(ana[k] ?? null);
  });

  it("exporta só as colunas visíveis com os cabeçalhos originais e reimporta sem apagar nada", async () => {
    const wb = planilhaFuncionarios(LISTA, ctx, "Filtro", ["nome", "situacao", "telefone", "ifood"]);
    const buf = Buffer.from(await gerarArquivo(wb));
    const lido = new ExcelJS.Workbook();
    await lido.xlsx.load(buf as unknown as ArrayBuffer);
    const base = lido.getWorksheet("Base")!;
    expect((base.getRow(2).values as unknown[]).slice(1)).toEqual(["Nome", "Situação", "Telefone", "iFood"]);
    expect(base.getRow(3).getCell(4).value).toBe("OK");
    const r = await lerPlanilha(buf);
    expect(r.funcionarios.find((f) => f.valores.nome === "Ana Souza")?.valores.telefone).toBe("(98) 98888-0000");
    // Colunas que não vieram ficam vazias na leitura (na importação, vazio nunca apaga)
    expect(r.funcionarios.find((f) => f.valores.nome === "Ana Souza")?.valores.email ?? null).toBeNull();
  });
});
