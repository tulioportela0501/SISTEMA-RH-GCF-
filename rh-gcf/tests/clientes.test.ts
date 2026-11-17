/**
 * Importação de clientes: reconhecimento das abas, leitura dos formatos conhecidos e análise de duplicidades.
 * As planilhas são montadas aqui mesmo (os dados reais não acompanham o código).
 */
import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { CAMPOS_LISTA } from "@/lib/domain/campos";
import { analisarEventosEmpresa, analisarImportacaoClientes, anosDeParceria, chaveNomeCliente, filtrarDatasCliente, pendenciasDataCliente } from "@/lib/domain/clientes";
import { TIPOS_DATA_CLIENTE, type DataCliente } from "@/lib/domain/tipos";
import { lerPlanilha, lerPlanilhaClientes } from "@/lib/excel/importar";
import { papelDoCabecalho } from "@/lib/excel/clientes";
import { anosDoDetalhe, tipoDoEvento } from "@/lib/excel/calendario";
import { normalizarTexto } from "@/lib/excel/normalizar";

const VERMELHO = { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: "FFFF0000" } };
const utc = (a: number, m: number, d: number) => new Date(Date.UTC(a, m - 1, d));

/** Aba Base no formato da planilha RH GCF (34 colunas), com um desligado e duas linhas COMEMORAR. */
function abaBase(wb: ExcelJS.Workbook) {
  const ws = wb.addWorksheet("Base");
  ws.addRow(CAMPOS_LISTA.map((c) => c.cabecalho));
  const linha = (v: Partial<Record<string, unknown>>) => ws.addRow(CAMPOS_LISTA.map((c) => v[c.chave] ?? null));
  linha({ nome: "Ana Souza", situacao: "Efetivo", modalidade: "Presencial", admissao: utc(2020, 3, 2), nascimento: utc(1990, 5, 24), email: "ana@x.com", plano_saude: "—" });
  const r = linha({ nome: "Bruno Lima", situacao: "Efetivo", modalidade: "Home Office", admissao: utc(2019, 1, 10) });
  for (let c = 1; c <= 34; c++) r.getCell(c).fill = VERMELHO;
  linha({ nome: "CLIENTES DO MÊS", modalidade: "COMEMORAR", nascimento: utc(2000, 11, 1) });
  linha({ nome: "Dia do Contador", modalidade: "COMEMORAR", nascimento: utc(2000, 9, 22) });
  return ws;
}

async function buffer(wb: ExcelJS.Workbook): Promise<Buffer> {
  return Buffer.from(await wb.xlsx.writeBuffer());
}

function existente(p: Partial<DataCliente> & { id: number; cliente_nome: string; tipo_data: string }): DataCliente {
  return {
    cnpj: null,
    data_evento: null,
    inicio_parceria: null,
    recorrente: true,
    observacoes: null,
    situacao_cliente: "ATIVO",
    ativo: true,
    versao: 1,
    codigo: null,
    tributacao: null,
    responsavel_fiscal: null,
    responsavel_contabil: null,
    responsavel_dp: null,
    dados_extras: {},
    inicio_parceria_precisao: "DIA",
    whatsapp: null,
    nao_enviar: false,
    nao_enviar_motivo: null,
    ...p,
  };
}

describe("Reconhecimento das colunas de clientes", () => {
  it("classifica os cabeçalhos da exportação do sistema e da lista de aniversários do GCF", () => {
    const papel = (t: string) => papelDoCabecalho(normalizarTexto(t));
    expect(papel("Nome ou razão social")).toBe("cliente");
    expect(papel("Razão Social")).toBe("cliente");
    expect(papel("Empresa")).toBe("cliente");
    expect(papel("CNPJ")).toBe("cnpj");
    expect(papel("Situação do cliente")).toBe("situacao");
    expect(papel("Situação do evento")).toBe("ativoEvento");
    expect(papel("Tipo de data comemorativa")).toBe("tipo");
    expect(papel("Data do evento")).toBe("data");
    expect(papel("Data de início da parceria")).toBe("parceria");
    expect(papel("Anos de parceria")).toBe("calculada");
    expect(papel("Quantidade de anos de parceria")).toBe("calculada");
    expect(papel("Cód.")).toBe("codigo");
    expect(papel("Contato")).toBe("contato");
    expect(papel("Nascimento")).toBe("nascimento");
    expect(papel("Data de fundação")).toBe("fundacao");
    expect(papel("Mês (nome)")).toBe("calculada");
    expect(papel("Idade")).toBe("calculada");
    expect(papel("Status")).toBe("status");
    expect(papel("Observação")).toBe("observacoes");
  });

  it("os tipos usados pela importação existem na lista do formulário", () => {
    expect(TIPOS_DATA_CLIENTE).toContain("Aniversário de parceria");
    expect(TIPOS_DATA_CLIENTE).toContain("Aniversário do sócio ou responsável");
  });
});

describe("Planilha de funcionários não vira cliente", () => {
  it("a aba Base e as linhas COMEMORAR (CLIENTES DO MÊS) não são lidas como clientes", async () => {
    const wb = new ExcelJS.Workbook();
    abaBase(wb);
    const r = await lerPlanilha(await buffer(wb));
    expect(r.funcionarios.map((f) => f.valores.nome)).toEqual(["Ana Souza", "Bruno Lima"]);
    expect(r.datasComemorativas.map((d) => d.titulo)).toEqual(["CLIENTES DO MÊS", "Dia do Contador"]);
    expect(r.clientes.abas).toHaveLength(0);
    expect(r.clientes.clientes).toHaveLength(0);
    // Na aba Datas do Cliente o arquivo não é recusado: a prévia mostra o que há em cada aba
    const c = await lerPlanilhaClientes(await buffer(wb));
    expect(c.clientes).toHaveLength(0);
    expect(c.base).toMatchObject({ aba: "Base", comemorar: 2 });
    expect(c.base!.colaboradores.map((x) => x.nome)).toEqual(["Ana Souza", "Bruno Lima"]);
  });

  it("lê a aba de clientes do mesmo arquivo, sem misturar com os funcionários", async () => {
    const wb = new ExcelJS.Workbook();
    abaBase(wb);
    const ws = wb.addWorksheet("Clientes");
    ws.addRow(["Razão social", "CNPJ", "Início da parceria", "Situação"]);
    ws.addRow(["Alfa Comércio Ltda", "11.222.333/0001-81", utc(2018, 4, 1), "Ativo"]);
    const r = await lerPlanilha(await buffer(wb));
    expect(r.funcionarios).toHaveLength(2);
    expect(r.clientes.abas.map((a) => a.nome)).toEqual(["Clientes"]);
    expect(r.clientes.clientes).toHaveLength(1);
    expect(r.abas.find((a) => a.nome === "Clientes")?.uso).toBe("clientes");
    const c = r.clientes.clientes[0];
    expect(c.cliente_nome).toBe("Alfa Comércio Ltda");
    expect(c.cnpj).toBe("11.222.333/0001-81");
    expect(c.eventos).toEqual([{ tipo_data: "Aniversário de parceria", tipoInformado: true, data_evento: null, inicio_parceria: "2018-04-01", inicio_parceria_precisao: "DIA", erro: null }]);
  });

  it("arquivo só de clientes na importação de funcionários: orienta a usar a aba Datas do Cliente", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Clientes");
    ws.addRow(["Cliente", "CNPJ"]);
    ws.addRow(["Alfa", "11222333000181"]);
    await expect(lerPlanilha(await buffer(wb))).rejects.toThrow(/Datas do Cliente/);
  });

  it("planilha sem relação de clientes: mensagem clara", async () => {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet("Plan1").addRow(["Produto", "Preço"]);
    await expect(lerPlanilhaClientes(await buffer(wb))).rejects.toThrow(/Não encontrei uma relação de clientes/);
  });
});

describe("Formatos de listas de clientes", () => {
  it("lista de aniversários do GCF (Cód. | Empresa | Contato | Nascimento | … | Status | WhatsApp | Observação)", async () => {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet("Resumo").addRow(["LISTA DE ANIVERSÁRIOS — CLIENTES GCF"]);
    const ws = wb.addWorksheet("Aniversariantes");
    ws.addRow(["Cód.", "Empresa", "Contato", "Nascimento", "Dia", "Mês", "Mês (nome)", "Idade", "Status", "WhatsApp", "Observação"]);
    ws.addRow([30, "DG Cardoso Ltda", "Nilton Cesar", utc(1975, 3, 15), { formula: "DAY(D2)", result: 15 }, 3, "Março", 51, "Completo", "(98) 99999-0000", null]);
    ws.addRow([30, "DG Cardoso Ltda", "Maria Cardoso", utc(1980, 7, 2), 2, 7, "Julho", 46, "Completo", null, "Sócia"]);
    ws.addRow([44, "Granvel", "NAO TEM", null, null, null, null, null, "Pendente", null, "Sem contato identificado"]);
    ws.addRow([12, "Beta ME", "João", "15/03", null, null, null, null, "Pendente", null, null]);
    const pend = wb.addWorksheet("Pendências");
    pend.addRow(["Cód.", "Empresa", "Contato", "O que falta"]);
    pend.addRow([44, "Granvel", "—", "Sem contato identificado"]);

    const r = await lerPlanilhaClientes(await buffer(wb));
    expect(r.abas.map((a) => a.nome)).toEqual(["Aniversariantes"]);
    expect(r.clientes).toHaveLength(4);
    const [nilton, maria, granvel, beta] = r.clientes;
    expect(nilton.cliente_nome).toBe("DG Cardoso Ltda");
    expect(nilton.contato).toBe("Nilton Cesar");
    expect(nilton.situacao_cliente).toBeNull(); // "Completo" não é situação do cliente
    // Código e WhatsApp agora têm campos próprios (não vão mais para as observações)
    expect(nilton.observacoes).toBe("Contato: Nilton Cesar");
    expect(nilton.codigo).toBe("30");
    expect(nilton.whatsapp).toBe("+5598999990000");
    expect(nilton.eventos).toEqual([{ tipo_data: "Aniversário do sócio ou responsável", tipoInformado: true, data_evento: "1975-03-15", inicio_parceria: null, inicio_parceria_precisao: "DIA", erro: null }]);
    expect(maria.observacoes).toBe("Contato: Maria Cardoso · Sócia");
    expect(maria.whatsapp).toBeNull();
    expect(granvel.contato).toBeNull();
    expect(granvel.eventos).toHaveLength(0);
    expect(beta.eventos[0].erro).toMatch(/data completa/);

    const { registros, resumo } = analisarImportacaoClientes(r.clientes, []);
    // Dois contatos da mesma empresa = duas datas diferentes (não é duplicidade)
    expect(registros.filter((x) => x.acao === "NOVO")).toHaveLength(2);
    expect(resumo).toMatchObject({ novos: 2, corrigir: 2, duplicados: 0 });
    expect(registros.find((x) => x.dados.cliente_nome === "Granvel")?.motivo).toMatch(/Nenhuma data/);
  });

  it("lista simples com título acima: NOME | NASCIMENTO | EMPRESA ('30 - RAZÃO SOCIAL')", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Plan1");
    ws.addRow(["LISTA DE CLIENTES"]);
    ws.addRow(["NOME", "DATA DE NASCIMENTO", "EMPRESA"]);
    ws.addRow(["NILTON CESAR", utc(1975, 3, 15), "30 - DG CARDOSO LTDA"]);
    ws.addRow(["NAO TEM", "NAO TEM", "39 - GRANVEL COMERCIO"]);
    const r = await lerPlanilhaClientes(await buffer(wb));
    expect(r.abas[0].linhaCabecalho).toBe(2);
    expect(r.clientes[0]).toMatchObject({ cliente_nome: "DG CARDOSO LTDA", contato: "NILTON CESAR", observacoes: "Contato: NILTON CESAR", codigo: "30" });
    expect(r.clientes[1]).toMatchObject({ cliente_nome: "GRANVEL COMERCIO", contato: null, eventos: [] });
  });

  it("CNPJ: completa zeros perdidos no Excel, rejeita dígito errado e não grava CPF", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Clientes");
    ws.addRow(["Cliente", "CNPJ", "Data de fundação"]);
    ws.addRow(["Zero Ltda", 6990590000123, utc(2001, 2, 3)]); // 06.990.590/0001-23 virou número (perdeu o zero)
    ws.addRow(["Errado", "11.222.333/0001-82", utc(2001, 2, 3)]);
    ws.addRow(["Pessoa", "123.456.789-09", utc(2001, 2, 3)]);
    const r = await lerPlanilhaClientes(await buffer(wb));
    expect(r.clientes[0].cnpj).toBe("06.990.590/0001-23");
    expect(r.clientes[1].erros.join()).toMatch(/CNPJ .* inválido/);
    expect(r.clientes[2].cnpj).toBeNull();
    expect(r.clientes[2].avisos.join()).toMatch(/CPF/);
    expect(r.clientes[0].eventos[0].tipo_data).toBe("Aniversário de fundação da empresa");
  });
});

describe("Análise da importação de clientes", () => {
  const lido = (p: Partial<Parameters<typeof analisarImportacaoClientes>[0][number]>) => ({
    aba: "Clientes",
    linha: 2,
    cliente_nome: "Alfa Comércio Ltda",
    cnpj: null,
    contato: null,
    situacao_cliente: null,
    recorrente: null,
    ativo: null,
    observacoes: null,
    eventos: [{ tipo_data: "Aniversário de parceria", tipoInformado: true, data_evento: null, inicio_parceria: "2018-04-01", erro: null }],
    erros: [],
    avisos: [],
    ...p,
  });

  it("CNPJ tem prioridade: mesmo CNPJ com outro nome é o mesmo cliente; valores diferentes viram conflito", () => {
    const ex = [existente({ id: 7, cliente_nome: "Alfa Comércio", cnpj: "11.222.333/0001-81", tipo_data: "Aniversário de parceria", inicio_parceria: "2018-05-01" })];
    const { registros } = analisarImportacaoClientes([lido({ cliente_nome: "ALFA LOJAS", cnpj: "11.222.333/0001-81" })], ex);
    expect(registros[0]).toMatchObject({ acao: "ATUALIZAR", existenteId: 7 });
    expect(registros[0].conflitos.map((c) => c.campo).sort()).toEqual(["cliente_nome", "inicio_parceria"]);
    expect(registros[0].dados.cliente_nome).toBe("Alfa Comércio"); // o nome cadastrado é mantido
  });

  it("sem CNPJ, reconhece pelo nome (sem acentos, caixa e LTDA) e só completa campos vazios", () => {
    const ex = [existente({ id: 3, cliente_nome: "ALFA COMERCIO", tipo_data: "Aniversário de parceria", inicio_parceria: "2018-04-01" })];
    const { registros } = analisarImportacaoClientes([lido({ cnpj: "11.222.333/0001-81", observacoes: "Contrato 12" })], ex);
    expect(registros[0].acao).toBe("ATUALIZAR");
    expect(registros[0].completar.map((c) => c.campo)).toEqual(["cnpj", "observacoes"]);
    expect(registros[0].conflitos).toHaveLength(0);
    expect(chaveNomeCliente("Alfa Comércio Ltda.")).toBe(chaveNomeCliente("ALFA COMERCIO"));
  });

  it("já cadastrado com os mesmos dados → ignorado (duplicado); repetido na planilha → ignorado", () => {
    const ex = [existente({ id: 3, cliente_nome: "Alfa Comércio Ltda", cnpj: "11.222.333/0001-81", tipo_data: "Aniversário de parceria", inicio_parceria: "2018-04-01" })];
    const { registros, resumo } = analisarImportacaoClientes(
      [lido({ cnpj: "11.222.333/0001-81" }), lido({ linha: 3, cliente_nome: "Beta", eventos: [{ tipo_data: "Outro", tipoInformado: false, data_evento: "2020-01-01", inicio_parceria: null, erro: null }] }), lido({ linha: 4, cliente_nome: "BETA", eventos: [{ tipo_data: "Outro", tipoInformado: false, data_evento: "2020-01-01", inicio_parceria: null, erro: null }] })],
      ex,
    );
    expect(registros.map((r) => r.acao)).toEqual(["IGNORAR", "NOVO", "IGNORAR"]);
    expect(registros[2].motivo).toMatch(/Duplicado na planilha/);
    expect(resumo).toMatchObject({ novos: 1, ignorados: 2, duplicados: 2 });
    // Tipo não informado: registrado como Outro e marcado como pendência
    expect(registros[1].pendencias).toContain("Tipo de data");
  });

  it("observação da planilha já contida no cadastro não é conflito", () => {
    const ex = [existente({ id: 9, cliente_nome: "DG Cardoso Ltda", tipo_data: "Aniversário do sócio ou responsável", data_evento: "1975-03-15", observacoes: "Contato: Nilton Cesar · Cód. cliente: 30 · WhatsApp: (98) 99999-0000" })];
    const { registros } = analisarImportacaoClientes(
      [lido({ cliente_nome: "DG Cardoso Ltda", contato: "Nilton Cesar", observacoes: "Contato: Nilton Cesar", eventos: [{ tipo_data: "Aniversário do sócio ou responsável", tipoInformado: true, data_evento: "1975-03-15", inicio_parceria: null, erro: null }] })],
      ex,
    );
    expect(registros[0]).toMatchObject({ acao: "IGNORAR", existenteId: 9 });
  });

  it("nada é inventado: o que falta aparece como pendência", () => {
    const { registros } = analisarImportacaoClientes([lido({ eventos: [{ tipo_data: "Aniversário do sócio ou responsável", tipoInformado: true, data_evento: "1970-01-02", inicio_parceria: null, erro: null }] })], []);
    expect(registros[0].dados).toMatchObject({ cnpj: null, inicio_parceria: null, situacao_cliente: "ATIVO" });
    expect(registros[0].pendencias).toEqual(["CNPJ", "Início GCF"]);
  });
});

describe("Regras da aba Datas do Cliente", () => {
  it("anos de parceria completos", () => {
    expect(anosDeParceria("2018-11-17", "2026-11-16")).toBe(7);
    expect(anosDeParceria("2018-11-16", "2026-11-16")).toBe(8);
    expect(anosDeParceria(null, "2026-11-16")).toBeNull();
  });
  it("cadastro incompleto: falta CNPJ ou início da parceria", () => {
    expect(pendenciasDataCliente({ cnpj: null, tipo_data: "Aniversário de parceria", data_evento: null, inicio_parceria: "2018-01-01" })).toEqual(["CNPJ"]);
    expect(pendenciasDataCliente({ cnpj: "11.222.333/0001-81", tipo_data: "Outro", data_evento: "2020-01-01", inicio_parceria: "2018-01-01" })).toEqual([]);
  });
  it("filtros: ativos, inativos e pesquisa por nome ou CNPJ", () => {
    const l = [
      existente({ id: 1, cliente_nome: "Alfa", cnpj: "11.222.333/0001-81", tipo_data: "Outro" }),
      existente({ id: 2, cliente_nome: "Beta", tipo_data: "Outro", situacao_cliente: "INATIVO" }),
      existente({ id: 3, cliente_nome: "Gama", tipo_data: "Outro", ativo: false }),
    ];
    expect(filtrarDatasCliente(l, { filtro: "ativos" }).map((d) => d.id)).toEqual([1]);
    expect(filtrarDatasCliente(l, { filtro: "inativos" }).map((d) => d.id)).toEqual([2, 3]);
    expect(filtrarDatasCliente(l, { filtro: "todos", busca: "11222" }).map((d) => d.id)).toEqual([1]);
    expect(filtrarDatasCliente(l, { filtro: "todos", busca: "bet" }).map((d) => d.id)).toEqual([2]);
  });
});

describe("Planilha RH GCF com aba Calendário", () => {
  /** Mesmo formato da planilha do RH: título na linha 1, cabeçalho da Base na linha 2 e Calendário gerado por fórmulas. */
  function planilhaRH() {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet("Instruções").addRow(["Como usar — RH GCF"]);
    const base = wb.addWorksheet("Base");
    base.addRow(["GRUPO CONCEITO FISCAL · Cadastro de Funcionários"]);
    base.addRow(CAMPOS_LISTA.map((c) => c.cabecalho));
    const linha = (v: Record<string, unknown>) => base.addRow(CAMPOS_LISTA.map((c) => v[c.chave] ?? null));
    linha({ nome: "MARCELO", situacao: "Efetivo", modalidade: "Presencial", admissao: utc(2016, 11, 25) });
    linha({ nome: "BRUNO", situacao: "Home office", modalidade: "Home Office", admissao: utc(2024, 1, 1) });
    linha({ nome: "CLIENTES DO MÊS", modalidade: "COMEMORAR", nascimento: utc(2000, 12, 1) });
    wb.addWorksheet("aux", { state: "hidden" }).addRow(["motor"]);
    const cal = wb.addWorksheet("Calendário");
    cal.addRow(["Próxima Data", "Dias Restantes", "Colaborador", "Modalidade", "Evento", "Detalhe"]);
    const ev = (d: Date, nome: string, mod: string, evento: string, det: string | null) => cal.addRow([{ formula: "A1", result: d }, 1, nome, mod, evento, det]);
    ev(utc(2026, 11, 25), "MARCELO", "Presencial", "Aniversário de Empresa", "10 anos de empresa");
    ev(utc(2027, 1, 1), "BRUNO", "Home Office", "  aniversario  de EMPRESA ", "3 anos de empresa");
    ev(utc(2027, 1, 1), "BRUNO", "Home Office", "Aniversário de Empresa", "3 anos de empresa"); // repetido
    ev(utc(2027, 3, 3), "FULANO DE TAL", "Presencial", "Aniversário de Empresa", "1 ano de empresa"); // não está na Base
    ev(utc(2026, 11, 5), "Dia do Designer Gráfico", "COMEMORAR", "Aniversário do Funcionário", null);
    ev(utc(2026, 11, 9), "MARCELO", "Presencial", "Aniversário de Filho(a)", "JI SUNG");
    ev(utc(2026, 12, 2), "BRUNO", "Home Office", "Aniversário do Cônjuge", "MARIA");
    ev(utc(2027, 1, 10), "BRUNO", "Home Office", "Início de Férias (1)", null);
    ev(utc(2027, 1, 30), "BRUNO", "Home Office", "Fim de Férias (1)", null);
    cal.addRow([{ formula: "IFERROR(x,\"\")", result: "" }, null, { formula: "x", result: "" }, null, { formula: "x", result: "" }, null]);
    return wb;
  }

  it("classifica pela coluna Evento, sem depender de acentos, caixa, espaços ou da Modalidade", () => {
    expect(tipoDoEvento("Aniversário de Empresa")).toBe("EMPRESA");
    expect(tipoDoEvento("  ANIVERSARIO   DE empresa ")).toBe("EMPRESA");
    expect(tipoDoEvento("Aniversário do Funcionário")).toBe("FUNCIONARIO");
    expect(tipoDoEvento("Aniversário de Filho(a)")).toBe("FILHO");
    expect(tipoDoEvento("Aniversário do Cônjuge")).toBe("CONJUGE");
    expect(tipoDoEvento("Início de Férias (2)")).toBe("FERIAS_INICIO");
    expect(tipoDoEvento("Fim de Férias (1)")).toBe("FERIAS_FIM");
    expect(anosDoDetalhe("10 anos de empresa")).toBe(10);
    expect(anosDoDetalhe("1 ano de empresa")).toBe(1);
  });

  it("lê todas as abas sem recusar o arquivo e separa colaboradores, eventos e clientes", async () => {
    const r = await lerPlanilhaClientes(await buffer(planilhaRH()));
    expect(r.clientes).toHaveLength(0);
    expect(r.base?.colaboradores.map((c) => [c.nome, c.admissao])).toEqual([
      ["MARCELO", "2016-11-25"],
      ["BRUNO", "2024-01-01"],
    ]);
    expect(r.calendario).toMatchObject({ aba: "Calendário", linhaCabecalho: 1, totalEventos: 9 });
    expect(r.calendario!.porTipo).toEqual({ EMPRESA: 4, FUNCIONARIO: 1, FILHO: 1, CONJUGE: 1, FERIAS_INICIO: 1, FERIAS_FIM: 1 });
    expect(r.calendario!.empresa[0]).toEqual({
      aba: "Calendário",
      linha: 2,
      nome: "MARCELO",
      data: "2026-11-25",
      anos: 10,
      detalhe: "10 anos de empresa",
      modalidade: "Presencial",
      evento: "Aniversário de Empresa",
    });
  });

  it("Aniversário de Empresa = tempo de casa do colaborador: conferido com a Base, com duplicados apontados", async () => {
    const r = await lerPlanilhaClientes(await buffer(planilhaRH()));
    const p = analisarEventosEmpresa(r.calendario!, r.base, ["Marcelo"]);
    expect(p.eventosEmpresa.map((e) => [e.nome, e.situacao, e.noSistema, e.duplicadoDe])).toEqual([
      ["MARCELO", "TEMPO_DE_CASA", true, null],
      ["BRUNO", "TEMPO_DE_CASA", false, null],
      ["BRUNO", "TEMPO_DE_CASA", false, 3],
      ["FULANO DE TAL", "NAO_ENCONTRADO", false, null],
    ]);
    expect(p.colaboradoresNaBase).toBe(2);
    expect(p.faltamNoSistema).toBe(1);
  });

  it("com uma aba de clientes no mesmo arquivo, só ela vira cliente", async () => {
    const wb = planilhaRH();
    const cl = wb.addWorksheet("Clientes");
    cl.addRow(["Razão social", "CNPJ", "Início da parceria"]);
    cl.addRow(["Alfa Comércio Ltda", "11.222.333/0001-81", utc(2018, 4, 1)]);
    const r = await lerPlanilhaClientes(await buffer(wb));
    expect(r.clientes.map((c) => c.cliente_nome)).toEqual(["Alfa Comércio Ltda"]);
    expect(r.calendario!.empresa).toHaveLength(4);
    const { registros } = analisarImportacaoClientes(r.clientes, []);
    expect(registros.map((x) => x.dados.cliente_nome)).toEqual(["Alfa Comércio Ltda"]);
  });
});
