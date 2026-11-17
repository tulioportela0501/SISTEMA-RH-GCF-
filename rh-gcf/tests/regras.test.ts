import { describe, expect, it } from "vitest";
import { CAMPOS_LISTA, CAMPOS_OBRIGATORIOS, SECOES } from "@/lib/domain/campos";
import { analisarCadastro } from "@/lib/domain/pendencias";
import { conferirObrigatorios } from "@/lib/domain/validacao";
import { hojeFortaleza, mesAtualEProximo, lerData } from "@/lib/domain/datas";
import { eventosNoPeriodo, proximasOcorrencias, type FuncionarioEventos } from "@/lib/domain/eventos";
import { classificarCor, aplicarTint, resolverCor, lerCoresDoTema } from "@/lib/excel/cores";
import { cnpjValido } from "@/lib/domain/cnpj";

const CABECALHOS_PLANILHA = [
  "Nome", "Situação", "Modalidade", "Admissão", "Nascimento", "E-mail", "Telefone", "Armário", "Contato de emergência",
  "Cônjuge", "Aniv. Cônjuge", "Filho 1", "Aniv. Filho 1", "Filho 2", "Aniv. Filho 2", "Filho 3", "Aniv. Filho 3",
  "Férias 1 Início", "Férias 1 Fim", "Férias 2 Início", "Férias 2 Fim", "Zap Contábil", "Cadastro porta", "Planilha interna",
  "iFood", "Lojinha", "Plano de saúde", "Farda", "Botom", "ASO", "Coalize", "SITTAX", "Salvar documentos", "Domínio",
];

describe("Formulário: 34 campos da aba Base", () => {
  it("tem exatamente as 34 colunas da planilha, na mesma ordem e com os mesmos nomes", () => {
    expect(CAMPOS_LISTA).toHaveLength(34);
    expect(CAMPOS_LISTA.map((c) => c.label)).toEqual(CABECALHOS_PLANILHA);
    expect(CAMPOS_LISTA.map((c) => c.cabecalho)).toEqual(CABECALHOS_PLANILHA);
  });
  it("todos os campos pertencem a uma das 4 seções", () => {
    for (const c of CAMPOS_LISTA) expect(SECOES[c.secao]).toBeDefined();
  });
  it("obrigatórios são Nome, Situação, Modalidade e Admissão", () => {
    expect(CAMPOS_OBRIGATORIOS).toEqual(["nome", "situacao", "modalidade", "admissao"]);
  });
});

describe("Campos obrigatórios", () => {
  const completo = { nome: "Fulano", situacao: "Efetivo", modalidade: "Presencial", admissao: "2026-01-10" };
  it("impede novo cadastro e informa exatamente o campo que falta", () => {
    expect(conferirObrigatorios({ ...completo, admissao: null }, "criacao")?.mensagem).toBe("Cadastro incompleto! É necessário preencher o campo Admissão.");
    expect(conferirObrigatorios({ ...completo, nome: " " }, "criacao")?.mensagem).toBe("Cadastro incompleto! É necessário preencher o campo Nome.");
    expect(conferirObrigatorios({ ...completo, situacao: null }, "criacao")?.campo).toBe("situacao");
    expect(conferirObrigatorios({ ...completo, modalidade: "" }, "criacao")?.campo).toBe("modalidade");
    expect(conferirObrigatorios(completo, "criacao")).toBeNull();
  });
  it("na edição não deixa apagar um obrigatório já preenchido", () => {
    expect(conferirObrigatorios({ ...completo, modalidade: null }, "edicao", completo)?.campo).toBe("modalidade");
  });
  it("registro importado sem admissão pode ser editado e continua incompleto", () => {
    const importado = { ...completo, admissao: null };
    expect(conferirObrigatorios({ ...importado, email: "a@b.com" }, "edicao", importado)).toBeNull();
    expect(analisarCadastro(importado).nivel).toBe("BASICO_INCOMPLETO");
  });
});

describe("Cadastro completo / incompleto", () => {
  const base = {
    nome: "Fulano", situacao: "Efetivo", modalidade: "Presencial", admissao: "2026-01-10", nascimento: "2000-05-24",
    email: "f@x.com", telefone: "(98) 99999-0000", contato_emergencia: "Mãe (98) 9999-0000",
  };
  it("sem cônjuge, filhos, 2º período de férias ou armário continua completo", () => {
    expect(analisarCadastro(base).nivel).toBe("COMPLETO");
  });
  it("falta de e-mail deixa incompleto e informa o campo", () => {
    const a = analisarCadastro({ ...base, email: null });
    expect(a.nivel).toBe("INCOMPLETO");
    expect(a.pendencias.map((p) => p.label)).toContain("E-mail");
  });
  it("filho informado sem aniversário é apontado", () => {
    expect(analisarCadastro({ ...base, filho1: "Ana" }).pendencias[0].label).toBe("Aniv. Filho 1");
  });
});

describe("Datas e fuso America/Fortaleza", () => {
  it("usa o dia de Fortaleza (UTC−3)", () => {
    expect(hojeFortaleza(new Date("2026-11-14T02:30:00Z"))).toBe("2026-11-13");
    expect(hojeFortaleza(new Date("2026-11-14T03:00:00Z"))).toBe("2026-11-14");
  });
  it("mês atual e próximo viram o ano automaticamente", () => {
    const m = mesAtualEProximo("2026-12-20");
    expect(m.atual.nome).toBe("dezembro de 2026");
    expect(m.proximo.nome).toBe("janeiro de 2027");
    expect(m.proximo.inicio).toBe("2027-01-01");
  });
  it("lê datas brasileiras", () => {
    expect(lerData("24/05/2026")).toBe("2026-05-24");
    expect(lerData("24/05", 2000)).toBe("2000-05-24");
  });
});

describe("Eventos", () => {
  const f = (p: Partial<FuncionarioEventos>): FuncionarioEventos => ({
    id: 1, nome: "Fulano", situacao: "Efetivo", modalidade: "Presencial", status_vinculo: "ATIVO",
    admissao: null, nascimento: null, ferias1_inicio: null, ferias1_fim: null, ferias2_inicio: null, ferias2_fim: null, ...p,
  });
  const fontes = (fs: FuncionarioEventos[]) => ({ funcionarios: fs, datasComemorativas: [], datasCliente: [] });

  it("aniversários repetem todo ano pelo dia/mês (ano da planilha ignorado)", () => {
    const e = proximasOcorrencias(fontes([f({ nascimento: "2000-01-05" })]), "2026-11-13");
    expect(e[0].data).toBe("2027-01-05");
    expect(e[0].dias).toBe(53);
  });
  it("tempo de empresa é calculado", () => {
    const e = proximasOcorrencias(fontes([f({ admissao: "2016-11-25" })]), "2026-11-13");
    expect(e[0].tipo).toBe("ANIV_EMPRESA");
    expect(e[0].detalhe).toBe("10 anos");
  });
  it("férias usam a data real e não se repetem", () => {
    const fx = f({ ferias1_inicio: "2026-10-08", ferias1_fim: "2026-10-22" });
    expect(proximasOcorrencias(fontes([fx]), "2026-11-13")).toHaveLength(0);
    expect(eventosNoPeriodo(fontes([fx]), "2027-10-01", "2027-10-31", "2026-11-13")).toHaveLength(0);
  });
  it("desligados não geram datas nem alertas", () => {
    expect(proximasOcorrencias(fontes([f({ nascimento: "2000-11-20", status_vinculo: "DESLIGADO" })]), "2026-11-13")).toHaveLength(0);
  });
  it("29/02 em ano não bissexto vai para 01/03 (como o DATE do Excel)", () => {
    expect(proximasOcorrencias(fontes([f({ nascimento: "2000-02-29" })]), "2026-11-13")[0].data).toBe("2027-03-01");
  });
});

describe("Cores da planilha", () => {
  it("vermelho = desligado; amarelo e azul claro não", () => {
    expect(classificarCor("FF0000")).toBe("VERMELHO");
    expect(classificarCor("C00000")).toBe("VERMELHO");
    expect(classificarCor("FFFF00")).toBe("AMARELO");
    expect(classificarCor("FFC7CE")).toBe("VERMELHO_CLARO");
    expect(classificarCor(null)).toBe("NENHUMA");
  });
  it("resolve cor do tema com tonalidade (linhas azul-claro da planilha)", () => {
    const tema = lerCoresDoTema(null);
    const hex = resolverCor({ theme: 3, tint: 0.3999755851924192 }, tema)!;
    expect(hex).toBe(aplicarTint("1F497D", 0.3999755851924192));
    expect(classificarCor(hex)).toBe("OUTRA");
  });
});

describe("CNPJ", () => {
  it("valida dígitos verificadores (numérico e alfanumérico)", () => {
    expect(cnpjValido("34.332.613/0001-48")).toBe(true);
    expect(cnpjValido("34.332.613/0001-49")).toBe(false);
    expect(cnpjValido("12.ABC.345/01DE-35")).toBe(true);
  });
});
