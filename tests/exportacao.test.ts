/**
 * Exportação para Excel: formato das planilhas e ida e volta (exportar → importar sem duplicar nem perder dados).
 */
import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { CAMPOS_LISTA, CHAVES_CAMPOS } from "@/lib/domain/campos";
import { analisarImportacaoClientes } from "@/lib/domain/clientes";
import { filtrarFuncionarios } from "@/lib/domain/filtros";
import { analisarCadastro } from "@/lib/domain/pendencias";
import type { DataCliente, DataComemorativa, Funcionario } from "@/lib/domain/tipos";
import { classificarCor } from "@/lib/excel/cores";
import { lerPlanilha, lerPlanilhaClientes } from "@/lib/excel/importar";
import {
  dataHoraExcel,
  gerarArquivo,
  planilhaCalendario,
  planilhaClientes,
  planilhaDatasEscritorio,
  planilhaFuncionarios,
  planilhaHistorico,
  planilhaModeloBase,
  textoSeguro,
  type ContextoExportacao,
} from "@/lib/excel/exportar";
import { eventosNoPeriodo } from "@/lib/domain/eventos";

const ctx: ContextoExportacao = { geradoEm: new Date("2026-11-16T16:00:00Z"), usuario: "Teste", hoje: "2026-11-16" };

function funcionario(id: number, v: Partial<Funcionario>): Funcionario {
  const vazio = Object.fromEntries(CHAVES_CAMPOS.map((k) => [k, null])) as unknown as Funcionario;
  return {
    ...vazio,
    id,
    status_vinculo: "ATIVO",
    desligado_em: null,
    origem: "MANUAL",
    linha_planilha: null,
    cor_planilha: null,
    versao: 1,
    criado_em: "2026-01-10T12:00:00Z",
    atualizado_em: "2026-01-10T12:00:00Z",
    ...v,
  };
}

const FUNCIONARIOS: Funcionario[] = [
  funcionario(1, {
    nome: "Ana Souza",
    situacao: "Efetivo",
    modalidade: "Presencial",
    admissao: "2020-03-02",
    nascimento: "1990-05-24",
    email: "ana@x.com",
    telefone: "(98) 98888-0000",
    contato_emergencia: "Mãe",
    plano_saude: "—",
    ferias1_inicio: "2027-07-17",
    ferias1_fim: "2027-07-31",
  }),
  funcionario(2, { nome: "Bruno Lima", situacao: "Efetivo", modalidade: "Home Office", admissao: "2019-01-10", status_vinculo: "DESLIGADO", desligado_em: "2026-10-01" }),
  funcionario(3, { nome: "Carla Dias", situacao: "Estagiário", modalidade: "Presencial", admissao: null }),
];
const COM_ANALISE = FUNCIONARIOS.map((f) => ({ ...f, analise: analisarCadastro(f) }));

const DATAS: DataComemorativa[] = [
  { id: 1, titulo: "Dia do Contador", data: "2000-09-22", recorrente: true, categoria: "Data profissional", descricao: null, ativo: true, origem: "IMPORTACAO", linha_planilha: 40, versao: 1 },
  { id: 2, titulo: "Confraternização", data: "2026-12-18", recorrente: false, categoria: "Evento interno", descricao: "Só este ano", ativo: true, origem: "MANUAL", linha_planilha: null, versao: 1 },
  { id: 3, titulo: "Data antiga", data: "2000-01-05", recorrente: true, categoria: "Data comemorativa", descricao: null, ativo: false, origem: "MANUAL", linha_planilha: null, versao: 1 },
];

const NOVOS_CAMPOS = {
  codigo: null,
  tributacao: null,
  responsavel_fiscal: null,
  responsavel_contabil: null,
  responsavel_dp: null,
  dados_extras: {},
  inicio_parceria_precisao: "DIA" as const,
  whatsapp: null,
  nao_enviar: false,
  nao_enviar_motivo: null,
};

const CLIENTES: DataCliente[] = [
  { id: 1, cliente_nome: "Alfa Comércio Ltda", cnpj: "11.222.333/0001-81", tipo_data: "Aniversário de parceria", data_evento: null, inicio_parceria: "2018-04-01", recorrente: true, observacoes: null, situacao_cliente: "ATIVO", ativo: true, versao: 1, ...NOVOS_CAMPOS },
  { id: 2, cliente_nome: "Alfa Comércio Ltda", cnpj: "11.222.333/0001-81", tipo_data: "Aniversário do sócio ou responsável", data_evento: "1975-03-15", inicio_parceria: "2018-04-01", recorrente: true, observacoes: "Contato: Nilton Cesar", situacao_cliente: "ATIVO", ativo: true, versao: 1, ...NOVOS_CAMPOS },
  { id: 3, cliente_nome: "Beta ME", cnpj: null, tipo_data: "Aniversário de fundação da empresa", data_evento: "2005-08-20", inicio_parceria: null, recorrente: true, observacoes: "Cliente antigo", situacao_cliente: "INATIVO", ativo: true, versao: 1, ...NOVOS_CAMPOS },
];

async function reabrir(wb: ExcelJS.Workbook): Promise<{ buf: Buffer; wb: ExcelJS.Workbook }> {
  const buf = Buffer.from(await gerarArquivo(wb));
  const novo = new ExcelJS.Workbook();
  await novo.xlsx.load(buf as unknown as ArrayBuffer);
  return { buf, wb: novo };
}

describe("Funcionários", () => {
  it("modelo de importação: aba Base com as 34 colunas originais, na mesma ordem", async () => {
    const { wb } = await reabrir(planilhaModeloBase(FUNCIONARIOS, DATAS, ctx));
    const ws = wb.getWorksheet("Base")!;
    // Como a planilha original: título na linha 1, cabeçalho na linha 2, dados a partir da linha 3
    expect(ws.getCell("A1").value).toBe("GRUPO CONCEITO FISCAL · Cadastro de Funcionários");
    const cab = (ws.getRow(2).values as unknown[]).slice(1);
    expect(cab).toEqual(CAMPOS_LISTA.map((c) => c.cabecalho));
    expect(ws.getCell("AH2").value).toBe("Domínio");
    expect(ws.getRow(3).getCell(1).value).toBe("Ana Souza");
    expect(wb.getWorksheet("Instruções")).toBeDefined();
  });

  it("modelo de importação: reimportar devolve os mesmos dados, os desligados pelo vermelho e as datas COMEMORAR", async () => {
    const { buf } = await reabrir(planilhaModeloBase(FUNCIONARIOS, DATAS, ctx));
    const r = await lerPlanilha(buf);
    expect(r.colunasEncontradas).toHaveLength(34);
    expect(r.colunasAusentes).toHaveLength(0);
    expect(r.funcionarios).toHaveLength(3);
    for (const f of FUNCIONARIOS) {
      const lido = r.funcionarios.find((x) => x.valores.nome === f.nome)!;
      for (const k of CHAVES_CAMPOS) expect(lido.valores[k], `${f.nome} → ${k}`).toBe(f[k]);
      expect(lido.desligadoPelaCor).toBe(f.status_vinculo === "DESLIGADO");
    }
    // Só as datas ativas que se repetem todo ano viram linhas COMEMORAR
    expect(r.datasComemorativas.map((d) => [d.titulo, d.data])).toEqual([["Dia do Contador", "2000-09-22"]]);
    expect(r.clientes.clientes).toHaveLength(0);
  });

  it("exportação de funcionários: aba Base igual à original (34 colunas) e aba Controle com status e pendências", async () => {
    const { wb, buf } = await reabrir(planilhaFuncionarios(COM_ANALISE, ctx, "Todos os funcionários"));
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Base", "Controle"]);
    const ws = wb.getWorksheet("Base")!;
    expect(ws.getCell("A1").value).toBe("GRUPO CONCEITO FISCAL · Cadastro de Funcionários");
    expect(ws.model.merges).toContain("A1:AH1");
    const cab = (ws.getRow(2).values as unknown[]).slice(1) as string[];
    expect(cab).toEqual(CAMPOS_LISTA.map((c) => c.cabecalho));
    expect(cab).toHaveLength(34);
    expect(ws.autoFilter).toBeTruthy();
    expect(ws.views[0]).toMatchObject({ state: "frozen", ySplit: 2 });
    const bruno = ws.getRow(4);
    expect(bruno.getCell(1).value).toBe("Bruno Lima");
    const fill = bruno.getCell(1).fill as ExcelJS.FillPattern;
    expect(classificarCor((fill.fgColor?.argb ?? "").slice(2))).toBe("VERMELHO");
    const admissao = ws.getRow(3).getCell(4);
    expect(admissao.value).toEqual(new Date(Date.UTC(2020, 2, 2)));
    expect(admissao.numFmt).toBe("dd/mm/yyyy");
    expect(ws.getRow(3).getCell(5).numFmt).toBe("dd/mm"); // Nascimento: dia e mês, como na original

    const ctl = wb.getWorksheet("Controle")!;
    const cabCtl = (ctl.getRow(6).values as unknown[]).slice(1) as string[];
    expect(cabCtl.slice(0, 7)).toEqual(["Nome", "Situação", "Modalidade", "Status do vínculo", "Desligado em", "Status do cadastro", "Informações faltando"]);
    expect(ctl.getRow(8).getCell(4).value).toBe("Desligado");
    expect(ctl.getRow(9).getCell(6).value).toBe("Cadastro básico incompleto");

    // Reimportar: a aba Base é lida (cabeçalho na linha 2) e a aba Controle não vira funcionário nem cliente
    const r = await lerPlanilha(buf);
    expect(r.colunasEncontradas).toHaveLength(34);
    expect(r.funcionarios).toHaveLength(3);
    expect(r.funcionarios.find((f) => f.valores.nome === "Bruno Lima")?.desligadoPelaCor).toBe(true);
    for (const f of FUNCIONARIOS) {
      const lido = r.funcionarios.find((x) => x.valores.nome === f.nome)!;
      for (const k of CHAVES_CAMPOS) expect(lido.valores[k], `${f.nome} → ${k}`).toBe(f[k]);
    }
    expect(r.clientes.clientes).toHaveLength(0);
  });

  it("filtros iguais aos da tela", () => {
    expect(filtrarFuncionarios(COM_ANALISE, { filtro: "ativos" }).map((f) => f.id)).toEqual([1, 3]);
    expect(filtrarFuncionarios(COM_ANALISE, { filtro: "desligados" }).map((f) => f.id)).toEqual([2]);
    expect(filtrarFuncionarios(COM_ANALISE, { filtro: "todos", busca: "ANA" }).map((f) => f.id)).toEqual([1]);
    expect(filtrarFuncionarios(COM_ANALISE, { filtro: "todos", cadastro: "incompletos" }).map((f) => f.id)).toEqual([2, 3]);
    expect(filtrarFuncionarios(COM_ANALISE, { filtro: "ativos", situacao: "Estagiário" }).map((f) => f.id)).toEqual([3]);
    expect(filtrarFuncionarios(COM_ANALISE, { filtro: "todos", modalidade: "Home Office" }).map((f) => f.id)).toEqual([2]);
    expect(filtrarFuncionarios(COM_ANALISE, { filtro: "todos", modalidade: "presencial", situacao: "efetivo" }).map((f) => f.id)).toEqual([1]);
  });
});

describe("Datas do Cliente", () => {
  it("tem as colunas pedidas, anos de parceria e incompletos", async () => {
    const { wb } = await reabrir(planilhaClientes(CLIENTES, ctx, "Todos os clientes"));
    const ws = wb.getWorksheet("Datas do Cliente")!;
    const cab = (ws.getRow(6).values as unknown[]).slice(1);
    expect(cab.slice(0, 11)).toEqual([
      "Nome ou razão social",
      "CNPJ",
      "ID",
      "Situação do cliente",
      "Tipo de data comemorativa",
      "Data do evento",
      "Início GCF",
      "Anos de parceria",
      "Próximo aniversário",
      "Dias restantes",
      "WhatsApp",
    ]);
    expect(ws.getRow(7).getCell(8).value).toBe(8); // 01/04/2018 → 16/11/2026
    expect(ws.getRow(9).getCell(cab.indexOf("Cadastro") + 1).value).toBe("Incompleto"); // Beta: sem CNPJ e sem início
  });

  it("exportar e importar de novo não duplica nada", async () => {
    const { buf } = await reabrir(planilhaClientes(CLIENTES, ctx, "Todos"));
    const leitura = await lerPlanilhaClientes(buf);
    expect(leitura.clientes).toHaveLength(3);
    expect(leitura.abas[0].ignoradas.join()).toMatch(/Anos de parceria/);
    const { resumo, registros } = analisarImportacaoClientes(leitura.clientes, CLIENTES);
    expect(registros.map((r) => r.motivo)).toEqual(["Já cadastrado com os mesmos dados.", "Já cadastrado com os mesmos dados.", "Já cadastrado com os mesmos dados."]);
    expect(resumo).toMatchObject({ novos: 0, atualizar: 0, ignorados: 3, corrigir: 0 });
  });

  it("em um sistema vazio, a mesma planilha recria os cadastros com os mesmos valores", async () => {
    const { buf } = await reabrir(planilhaClientes(CLIENTES, ctx, "Todos"));
    const { registros } = analisarImportacaoClientes((await lerPlanilhaClientes(buf)).clientes, []);
    expect(registros.map((r) => r.acao)).toEqual(["NOVO", "NOVO", "NOVO"]);
    registros.forEach((r, i) => {
      const { id: _i, ativo: _a, versao: _v, ...original } = CLIENTES[i];
      expect(r.dados).toEqual(original);
    });
  });
});

describe("Datas comemorativas e histórico", () => {
  it("calendário do mês e datas do escritório", async () => {
    const eventos = eventosNoPeriodo({ funcionarios: FUNCIONARIOS, datasComemorativas: DATAS, datasCliente: CLIENTES }, "2026-09-01", "2026-09-30", ctx.hoje);
    const { wb } = await reabrir(planilhaCalendario(eventos, ctx, "setembro de 2026", "Tipo de data: Todas"));
    const ws = wb.getWorksheet("Calendário")!;
    // Mesmas colunas da aba Calendário da planilha original
    expect((ws.getRow(6).values as unknown[]).slice(1, 7)).toEqual(["Próxima Data", "Dias Restantes", "Colaborador", "Modalidade", "Evento", "Detalhe"]);
    const linhas = ws.getRows(7, ws.rowCount - 6)!.map((r) => (r.values as unknown[]).slice(1, 7));
    const contador = linhas.find((l) => l[2] === "Dia do Contador")!;
    expect(contador[0]).toEqual(new Date(Date.UTC(2026, 8, 22)));
    expect(contador[3]).toBe("COMEMORAR");
    const esc = (await reabrir(planilhaDatasEscritorio(DATAS, ctx))).wb.getWorksheet("Datas do escritório")!;
    expect(esc.getRow(6).getCell(1).value).toBe("Dia do Contador");
    expect(esc.getRow(8).getCell(7).value).toBe("Desativada");
  });

  it("histórico com data e hora de Fortaleza", async () => {
    const { wb } = await reabrir(
      planilhaHistorico(
        [{ ocorridoEm: new Date("2026-11-16T15:30:00Z"), usuario: "Maria", operacao: "Edição", entidade: "Funcionário", registro: "Ana", campo: "Telefone", anterior: "(vazio)", novo: "9999", descricao: "Maria alterou…", lote: null }],
        ctx,
        "Sem filtros",
        false,
      ),
    );
    const c = wb.getWorksheet("Histórico")!.getRow(7).getCell(1);
    expect(c.value).toEqual(new Date(Date.UTC(2026, 10, 16, 12, 30, 0)));
    expect(dataHoraExcel("2026-01-01T02:59:00Z")).toEqual(new Date(Date.UTC(2025, 11, 31, 23, 59, 0)));
  });

  it("remove caracteres que o Excel não aceita", () => {
    expect(textoSeguro("a\u0000b\u0007c\nd")).toBe("abc\nd");
  });
});
