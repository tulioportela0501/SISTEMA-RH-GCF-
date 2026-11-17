import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { lerPlanilhaClientes } from "@/lib/excel/importar";
import { decodificarTexto, lerCsvTexto } from "@/lib/excel/csv";
import { analisarImportacaoClientes, anosDeParceria, dataAniversarioParceria, filtrarDatasCliente, formatarInicioGcf, mesDoAniversario, proximoAniversarioParceria } from "@/lib/domain/clientes";
import { proximasOcorrencias } from "@/lib/domain/eventos";
import {
  aniversariosNoPeriodo,
  filtrarFelicitacoes,
  montarMensagem,
  resumirFelicitacoes,
  STATUS_FELICITACAO,
  valoresMensagem,
  variaveisPendentes,
  type RegistroFelicitacao,
} from "@/lib/domain/felicitacoes";
import { formatarWhatsapp, linkWhatsapp, normalizarWhatsapp } from "@/lib/domain/whatsapp";
import type { DataCliente } from "@/lib/domain/tipos";

const TEXTO_PADRAO =
  "💙 Hoje celebramos {anos} anos de parceria com a {empresa}!\n\nO Grupo Conceito Fiscal agradece pela confiança em nosso trabalho.";

function cliente(p: Partial<DataCliente> & { id: number; cliente_nome: string }): DataCliente {
  return {
    cnpj: null,
    tipo_data: "Aniversário de parceria",
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
    inicio_parceria_precisao: "MES",
    whatsapp: null,
    nao_enviar: false,
    nao_enviar_motivo: null,
    ...p,
  };
}

function registro(p: Partial<RegistroFelicitacao> & { data_cliente_id: number; ano: number; status: RegistroFelicitacao["status"] }): RegistroFelicitacao {
  return {
    id: 1,
    cliente_nome: "",
    cnpj: null,
    anos_parceria: 1,
    inicio_gcf: "",
    data_felicitacao: "2026-03-01",
    canal: "WHATSAPP_MANUAL",
    whatsapp: null,
    mensagem: null,
    modelo_id: null,
    motivo: null,
    preparado_em: null,
    preparado_por_nome: null,
    whatsapp_aberto_em: null,
    whatsapp_aberto_por_nome: null,
    com_imagem: false,
    enviado_em: null,
    enviado_por_nome: null,
    versao: 1,
    ...p,
  };
}

function csv(linhas: string[]): Buffer {
  return Buffer.from(linhas.join("\r\n"), "utf-8");
}

describe("WhatsApp", () => {
  it("aceita celulares brasileiros em vários formatos e recusa os inválidos", () => {
    expect(normalizarWhatsapp("(98) 99999-0000")).toBe("+5598999990000");
    expect(normalizarWhatsapp("+55 98 9 9999-0000")).toBe("+5598999990000");
    expect(normalizarWhatsapp("098999990000")).toBe("+5598999990000");
    expect(normalizarWhatsapp("5598999990000")).toBe("+5598999990000");
    expect(normalizarWhatsapp("(98) 3232-0000")).toBeNull(); // fixo
    expect(normalizarWhatsapp("(20) 99999-0000")).toBeNull(); // DDD inexistente
    expect(normalizarWhatsapp("99999-0000")).toBeNull(); // sem DDD
    expect(normalizarWhatsapp("")).toBeNull();
    expect(formatarWhatsapp("+5598999990000")).toBe("(98) 99999-0000");
  });

  it("monta o link oficial wa.me com a mensagem codificada", () => {
    const link = linkWhatsapp("(98) 99999-0000", "💙 Olá, Empresa & Cia!\nLinha 2");
    expect(link).toBe(`https://wa.me/5598999990000?text=${encodeURIComponent("💙 Olá, Empresa & Cia!\nLinha 2")}`);
    expect(new URL(link!).searchParams.get("text")).toBe("💙 Olá, Empresa & Cia!\nLinha 2");
    expect(linkWhatsapp("123", "oi")).toBeNull();
  });
});

describe("Início GCF e anos de parceria", () => {
  it("conta os anos pelo mês de início, sem inventar o dia", () => {
    // 03/2025: em março/2026 completa 1 ano; em março/2027, 2 anos
    expect(anosDeParceria("2025-03-01", "2026-02-28", "MES")).toBe(0);
    expect(anosDeParceria("2025-03-01", "2026-03-01", "MES")).toBe(1);
    expect(anosDeParceria("2025-03-01", "2026-03-31", "MES")).toBe(1);
    expect(anosDeParceria("2025-03-01", "2027-03-01", "MES")).toBe(2);
    // Data exata continua contando pelo dia
    expect(anosDeParceria("2025-03-20", "2026-03-19", "DIA")).toBe(0);
    expect(anosDeParceria("2025-03-20", "2026-03-20", "DIA")).toBe(1);
    expect(formatarInicioGcf("2025-03-01", "MES")).toBe("03/2025");
    expect(formatarInicioGcf("2025-03-20", "DIA")).toBe("20/03/2025");
  });

  it("a data da felicitação usa o dia padrão configurado quando só há mês e ano", () => {
    expect(dataAniversarioParceria("2025-03-01", "MES", 2026, 1)).toBe("2026-03-01");
    expect(dataAniversarioParceria("2025-03-01", "MES", 2026, 10)).toBe("2026-03-10");
    expect(dataAniversarioParceria("2025-02-01", "MES", 2026, 28)).toBe("2026-02-28");
    expect(dataAniversarioParceria("2025-03-20", "DIA", 2026, 10)).toBe("2026-03-20"); // dia real
    const d = cliente({ id: 1, cliente_nome: "Alfa", inicio_parceria: "2025-12-01" });
    expect(proximasOcorrencias({ funcionarios: [], datasComemorativas: [], datasCliente: [d], diaFelicitacao: 5 }, "2026-11-16")[0]).toMatchObject({ data: "2026-12-05", dias: 19 });
  });

  it("próximo aniversário: o mês de início não conta, só a partir de 1 ano", () => {
    expect(proximoAniversarioParceria({ inicio_parceria: "2026-11-16", inicio_parceria_precisao: "DIA" }, "2026-11-16", 1)).toEqual({ data: "2027-11-16", dias: 365, anos: 1 });
    expect(proximoAniversarioParceria({ inicio_parceria: "2026-11-01", inicio_parceria_precisao: "MES" }, "2026-11-16", 10)).toEqual({ data: "2027-11-10", dias: 359, anos: 1 });
    expect(proximoAniversarioParceria({ inicio_parceria: "2025-12-01", inicio_parceria_precisao: "MES" }, "2026-11-16", 10)).toEqual({ data: "2026-12-10", dias: 24, anos: 1 });
    expect(proximoAniversarioParceria({ inicio_parceria: "2020-11-01", inicio_parceria_precisao: "MES" }, "2026-11-16", 10)).toEqual({ data: "2027-11-10", dias: 359, anos: 7 });
    expect(proximoAniversarioParceria({ inicio_parceria: "2020-11-01", inicio_parceria_precisao: "MES" }, "2026-11-16", 20)).toEqual({ data: "2026-11-20", dias: 4, anos: 6 });
    expect(proximoAniversarioParceria({ inicio_parceria: null, inicio_parceria_precisao: "MES" }, "2026-11-16", 1)).toBeNull();
  });

  it("filtra a aba Datas do Cliente pelo mês de aniversário e pela situação", () => {
    const lista = [
      cliente({ id: 1, cliente_nome: "Março", inicio_parceria: "2025-03-01" }),
      cliente({ id: 2, cliente_nome: "Dezembro", inicio_parceria: "2020-12-01" }),
      cliente({ id: 3, cliente_nome: "Inativo de março", inicio_parceria: "2019-03-01", situacao_cliente: "INATIVO" }),
    ];
    expect(mesDoAniversario(lista[0])).toBe(3);
    expect(filtrarDatasCliente(lista, { filtro: "ativos", mes: 3 }).map((d) => d.id)).toEqual([1]);
    expect(filtrarDatasCliente(lista, { filtro: "todos", mes: 3 }).map((d) => d.id)).toEqual([1, 3]);
    expect(filtrarDatasCliente(lista, { filtro: "inativos" }).map((d) => d.id)).toEqual([3]);
  });
});

describe("Planilha geral de clientes (CSV)", () => {
  const CABECALHO = '"Grupo";"ID";"Empresa";"CNPJ";"Tributação";"Res. Fiscal";"Res. Contábil";"Res. DP";"Início GCF";"Sistema Veri"';

  it("lê CSV com ponto e vírgula, aspas e acentos (UTF-8 ou Windows-1252)", () => {
    const texto = '"a";"b;c";"d ""e"""\r\n1;2;3';
    expect(lerCsvTexto(texto)).toEqual([
      ["a", "b;c", 'd "e"'],
      ["1", "2", "3"],
    ]);
    expect(decodificarTexto(Buffer.from([0x54, 0x72, 0x69, 0x62, 0x75, 0x74, 0x61, 0xe7, 0xe3, 0x6f]))).toBe("Tributação"); // latin-1
    expect(decodificarTexto(Buffer.from("﻿Tributação", "utf-8"))).toBe("Tributação");
  });

  it("importa pelo Início GCF (mês/ano), guarda ID, tributação, responsáveis e demais colunas", async () => {
    const leitura = await lerPlanilhaClientes(
      csv([
        CABECALHO,
        '"";"85";"AGEIN EXPERTS LTDA";"35.741.781/0001-50";"Lucro Presumido";"OSMIN";"";"DEBORA";"02/2025";"Cadastrado"',
        '"";"90";"SEM INICIO LTDA";"11.222.333/0001-81";"Simples Nacional";"";"";"";"";""',
        '"";"91";"DATA COMPLETA LTDA";"11.444.777/0001-61";"Lucro Real";"";"";"";"15/08/2019";""',
      ]),
      "planilha_geral.csv",
    );
    expect(leitura.clientes).toHaveLength(3);
    const [agein, semInicio, completa] = leitura.clientes;
    expect(agein).toMatchObject({ cliente_nome: "AGEIN EXPERTS LTDA", cnpj: "35.741.781/0001-50", codigo: "85", tributacao: "Lucro Presumido", responsavel_fiscal: "OSMIN", responsavel_dp: "DEBORA" });
    expect(agein.responsavel_contabil ?? null).toBeNull();
    expect(agein.dados_extras).toEqual({ "Sistema Veri": "Cadastrado" });
    expect(agein.eventos).toEqual([{ tipo_data: "Aniversário de parceria", tipoInformado: true, data_evento: null, inicio_parceria: "2025-02-01", inicio_parceria_precisao: "MES", erro: null }]);
    expect(completa.eventos[0]).toMatchObject({ inicio_parceria: "2019-08-15", inicio_parceria_precisao: "DIA" });
    // Sem Início GCF: entra como incompleto, nada é inventado
    expect(semInicio.eventos[0]).toMatchObject({ inicio_parceria: null, erro: null });

    const { registros, resumo } = analisarImportacaoClientes(leitura.clientes, []);
    expect(resumo).toMatchObject({ novos: 3, corrigir: 0 });
    expect(registros.find((r) => r.dados.cliente_nome === "SEM INICIO LTDA")?.pendencias).toContain("Início GCF");
    expect(registros[0].dados).toMatchObject({ situacao_cliente: "ATIVO", whatsapp: null, nao_enviar: false });
  });

  it("reimportar: atualiza o que mudou, não mexe no WhatsApp digitado e não exclui quem sumiu da planilha", async () => {
    const existentes = [
      cliente({ id: 7, cliente_nome: "AGEIN EXPERTS LTDA", cnpj: "35.741.781/0001-50", codigo: "85", tributacao: "Lucro Presumido", inicio_parceria: "2025-02-01", whatsapp: "+5598999990000", dados_extras: { "Sistema Veri": "Cadastrado" }, responsavel_fiscal: "OSMIN", responsavel_dp: "DEBORA" }),
      cliente({ id: 8, cliente_nome: "QUE SAIU DA PLANILHA LTDA", cnpj: "11.222.333/0001-81", inicio_parceria: "2020-01-01" }),
    ];
    const igual = await lerPlanilhaClientes(csv([CABECALHO, '"";"85";"AGEIN EXPERTS LTDA";"35.741.781/0001-50";"Lucro Presumido";"OSMIN";"";"DEBORA";"02/2025";"Cadastrado"']), "geral.csv");
    const r1 = analisarImportacaoClientes(igual.clientes, existentes);
    expect(r1.registros).toHaveLength(1);
    expect(r1.registros[0]).toMatchObject({ acao: "IGNORAR", existenteId: 7 });

    const mudou = await lerPlanilhaClientes(csv([CABECALHO, '"";"85";"AGEIN EXPERTS LTDA";"35.741.781/0001-50";"Lucro Real";"OSMIN";"";"DEBORA";"01/2025";"Cadastrado"']), "geral.csv");
    const r2 = analisarImportacaoClientes(mudou.clientes, existentes);
    expect(r2.registros).toHaveLength(1); // o cliente 8 não aparece: nada é excluído
    const reg = r2.registros[0];
    expect(reg.existenteId).toBe(7);
    const campos = [...reg.completar, ...reg.conflitos].map((c) => c.campo);
    expect(campos).toEqual(expect.arrayContaining(["tributacao", "inicio_parceria"]));
    expect(campos).not.toContain("whatsapp");
  });

  it("cliente já cadastrado sem Início GCF na planilha: não cria aniversário de parceria vazio", async () => {
    const existentes = [
      cliente({ id: 3, cliente_nome: "Delta ME", tipo_data: "Aniversário de fundação da empresa", data_evento: "2010-02-03", inicio_parceria_precisao: "DIA" }),
      cliente({ id: 4, cliente_nome: "Delta ME", cnpj: "06.990.590/0001-23", tipo_data: "Aniversário do sócio ou responsável", data_evento: "1970-01-02", observacoes: "Contato: João", inicio_parceria_precisao: "DIA" }),
    ];
    const l = await lerPlanilhaClientes(csv([CABECALHO, '"";"7";"Delta ME";"06.990.590/0001-23";"Simples Nacional";"";"";"";"";""', '"";"8";"Nova Sem Início";"11.444.777/0001-61";"";"";"";"";"";""']), "geral.csv");
    const { registros } = analisarImportacaoClientes(l.clientes, existentes);
    expect(registros[0]).toMatchObject({ acao: "IGNORAR", existenteId: 4 });
    expect(registros[1]).toMatchObject({ acao: "NOVO" }); // cliente novo entra como incompleto
    // Linha sem CNPJ do mesmo nome encontra o cadastro antigo (também sem CNPJ)
    const l2 = await lerPlanilhaClientes(csv(['"Cliente";"CNPJ";"Tipo";"Data do evento"', '"Delta ME";"";"Aniversário de fundação da empresa";"03/02/2010"', '"Delta ME";"06.990.590/0001-23";"Aniversário do sócio ou responsável";"02/01/1970"']), "x.csv");
    const r2 = analisarImportacaoClientes(l2.clientes, existentes).registros;
    expect(r2.map((x) => [x.acao, x.existenteId])).toEqual([
      ["ATUALIZAR", 3], // mesma data: só completa o CNPJ que faltava
      ["IGNORAR", 4],
    ]);
    expect(r2[0].completar.map((c) => c.campo)).toEqual(["cnpj"]);
  });

  it.skipIf(!process.env.PLANILHA_GERAL)("arquivo real: planilha geral do GCF", async () => {
    const buf = readFileSync(process.env.PLANILHA_GERAL!);
    const leitura = await lerPlanilhaClientes(buf, "planilha_geral.csv");
    const { resumo } = analisarImportacaoClientes(leitura.clientes, []);
    expect(leitura.clientes.length).toBeGreaterThan(300);
    expect(resumo.novos + resumo.corrigir).toBe(leitura.clientes.length);
    const precisoes = leitura.clientes.flatMap((c) => c.eventos.map((e) => e.inicio_parceria_precisao));
    expect(precisoes.filter((p) => p === "MES").length).toBeGreaterThan(300);
  });
});

describe("Central de Felicitações", () => {
  const HOJE = "2026-11-16";
  const datas = [
    cliente({ id: 1, cliente_nome: "Um Ano Ltda", inicio_parceria: "2025-11-01", whatsapp: "+5598999990001" }),
    cliente({ id: 2, cliente_nome: "Sem Zap Ltda", inicio_parceria: "2019-11-01" }),
    cliente({ id: 3, cliente_nome: "Zap Inválido Ltda", inicio_parceria: "2018-11-01", whatsapp: "3232" }),
    cliente({ id: 4, cliente_nome: "Não Quer Ltda", inicio_parceria: "2017-11-01", whatsapp: "+5598999990004", nao_enviar: true }),
    cliente({ id: 5, cliente_nome: "Inativo Ltda", inicio_parceria: "2016-11-01", whatsapp: "+5598999990005", situacao_cliente: "INATIVO" }),
    cliente({ id: 6, cliente_nome: "Começou Agora Ltda", inicio_parceria: "2026-11-01", whatsapp: "+5598999990006" }),
    cliente({ id: 7, cliente_nome: "Já Enviado Ltda", inicio_parceria: "2015-11-20", inicio_parceria_precisao: "DIA", whatsapp: "+5598999990007" }),
    cliente({ id: 8, cliente_nome: "Dezembro Ltda", inicio_parceria: "2022-12-01", whatsapp: "+5598999990008" }),
  ];
  const registros = [registro({ data_cliente_id: 7, ano: 2026, status: "ENVIADO", enviado_por_nome: "Ana" })];
  const lista = aniversariosNoPeriodo(datas, registros, "2026-11-01", "2026-11-30", HOJE, 10);

  it("só entram clientes ativos com pelo menos 1 ano de parceria no mês", () => {
    // Mesmo dia (10/11, dia padrão): ordem alfabética
    expect(lista.map((a) => a.dataCliente.id)).toEqual([4, 2, 1, 3, 7]);
    expect(lista.find((a) => a.dataCliente.id === 1)).toMatchObject({ anos: 1, data: "2026-11-10", status: "PENDENTE", whatsapp: "+5598999990001", bloqueio: null });
    expect(lista.find((a) => a.dataCliente.id === 7)).toMatchObject({ anos: 11, data: "2026-11-20", status: "ENVIADO" });
  });

  it("respeita quem não quer mensagens e aponta número ausente ou inválido", () => {
    expect(lista.find((a) => a.dataCliente.id === 4)).toMatchObject({ status: "NAO_ENVIAR" });
    expect(lista.find((a) => a.dataCliente.id === 2)?.bloqueio).toBe("Sem WhatsApp cadastrado");
    expect(lista.find((a) => a.dataCliente.id === 3)).toMatchObject({ whatsapp: null, bloqueio: "WhatsApp inválido" });
  });

  it("etapas preparada e WhatsApp aberto continuam pendentes até a confirmação", () => {
    const regs = [
      registro({ data_cliente_id: 1, ano: 2026, status: "PREPARADO" }),
      registro({ data_cliente_id: 2, ano: 2026, status: "ABERTO" }),
      registro({ data_cliente_id: 7, ano: 2026, status: "ENVIADO" }),
    ];
    const l = aniversariosNoPeriodo(datas, regs, "2026-11-01", "2026-11-30", HOJE, 10);
    expect(l.find((a) => a.dataCliente.id === 1)?.status).toBe("PREPARADO");
    expect(l.find((a) => a.dataCliente.id === 2)?.status).toBe("ABERTO");
    expect(resumirFelicitacoes(l)).toMatchObject({ pendentes: 3, enviadas: 1 });
    expect(filtrarFelicitacoes(l, { status: "pendentes" }).map((a) => a.dataCliente.id)).toEqual([2, 1, 3]);
    expect(filtrarFelicitacoes(l, { status: "ABERTO" }).map((a) => a.dataCliente.id)).toEqual([2]);
    expect(STATUS_FELICITACAO.PREPARADO).toBe("Felicitação preparada");
    expect(STATUS_FELICITACAO.ABERTO).toBe("WhatsApp aberto");
  });

  it("indicadores e filtros por status", () => {
    expect(resumirFelicitacoes(lista)).toMatchObject({ aniversariantes: 5, pendentes: 3, enviadas: 1, naoEnviar: 1, semWhatsapp: 2 });
    expect(filtrarFelicitacoes(lista, { status: "ENVIADO" }).map((a) => a.dataCliente.id)).toEqual([7]);
    expect(filtrarFelicitacoes(lista, { status: "PENDENTE", busca: "zap" }).map((a) => a.dataCliente.id)).toEqual([2, 3]);
  });

  it("mensagem: preenche as variáveis e escreve “1 ano” no primeiro aniversário", () => {
    const um = lista.find((a) => a.dataCliente.id === 1)!;
    const m1 = montarMensagem(TEXTO_PADRAO, valoresMensagem({ ...um, empresa: um.dataCliente.cliente_nome }));
    expect(m1.faltando).toEqual([]);
    expect(m1.texto.split("\n")[0]).toBe("💙 Hoje celebramos 1 ano de parceria com a Um Ano Ltda!");
    const onze = lista.find((a) => a.dataCliente.id === 7)!;
    expect(montarMensagem(TEXTO_PADRAO, valoresMensagem({ ...onze, empresa: "X" })).texto).toMatch(/^💙 Hoje celebramos 11 anos de parceria com a X!/);
    expect(montarMensagem("Olá {nome}", valoresMensagem({ ...onze, empresa: "X" })).faltando).toEqual(["{nome}"]);
    expect(variaveisPendentes("Parabéns {empresa}")).toEqual(["{empresa}"]);
  });
});
