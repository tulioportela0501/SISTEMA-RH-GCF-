/**
 * Leitura da planilha "RH GCF Datas comemorativas".
 *
 * - Lê as 34 colunas da aba Base (localizadas pelo cabeçalho, não pela posição).
 * - Verifica a COR DE PREENCHIMENTO de cada linha: vermelho = desligado.
 *   A cor da fonte e os destaques amarelos/azuis não indicam desligamento.
 * - Linhas com Modalidade "COMEMORAR" são datas comemorativas do escritório.
 * - As abas "aux" e "Calendário" são resultados de fórmulas: não são importadas,
 *   os eventos são recalculados pelo sistema.
 * - Outras abas com uma relação de clientes (cabeçalho Cliente/Razão social/Empresa + CNPJ ou datas)
 *   são lidas para a aba Datas do Cliente (ver ./clientes.ts).
 */
import ExcelJS from "exceljs";
import { CAMPOS_LISTA, type CampoChave } from "@/lib/domain/campos";
import { type DataISO } from "@/lib/domain/datas";
import type { LeituraClientes } from "@/lib/domain/clientes";
import type { ValoresCampos } from "@/lib/domain/tipos";
import { dataDeValor, letraColuna, textoDeValor, valorCru } from "./celulas";
import { lerCalendario } from "./calendario";
import { workbookDoCsv } from "./csv";
import { lerClientesDoWorkbook } from "./clientes";
import { classificarCor, corDoPreenchimento, lerCoresDoTema, type ClasseCor } from "./cores";
import { normalizarNome, normalizarTexto } from "./normalizar";

export { normalizarNome, normalizarTexto };

export interface CorLinha {
  hex: string | null;
  classe: ClasseCor;
  celulasVermelhas: number;
  celulasVermelhoClaro: number;
  celulasComCor: number;
}

export interface LinhaFuncionario {
  linha: number;
  valores: ValoresCampos;
  cor: CorLinha;
  /** Identificado em vermelho → status DESLIGADO */
  desligadoPelaCor: boolean;
  /** Tom de vermelho claro ou poucas células vermelhas: conferir manualmente */
  conferirCor: boolean;
  /** Coluna opcional "Status do vínculo" (planilhas exportadas pelo sistema) */
  statusPlanilha: "ATIVO" | "DESLIGADO" | null;
  avisos: string[];
}

export interface LinhaDataComemorativa {
  linha: number;
  titulo: string;
  data: DataISO;
  categoria: string;
  avisos: string[];
}

export interface AbaInfo {
  nome: string;
  oculta: boolean;
  uso: "importada" | "clientes" | "recalculada" | "instrucoes" | "ignorada";
  observacao: string;
}

export interface LeituraPlanilha {
  abas: AbaInfo[];
  abaBase: string;
  linhaCabecalho: number;
  colunasEncontradas: { chave: CampoChave; cabecalho: string; coluna: string }[];
  colunasAusentes: string[];
  colunasExtras: string[];
  funcionarios: LinhaFuncionario[];
  datasComemorativas: LinhaDataComemorativa[];
  /** Relação de clientes encontrada em outras abas (vazia na planilha RH GCF original) */
  clientes: LeituraClientes;
  linhasVazias: number;
  avisos: string[];
}

// Cabeçalhos aceitos para cada campo (original da planilha + rótulo do formulário + variações).
const CABECALHOS: Record<CampoChave, string[]> = Object.fromEntries(
  CAMPOS_LISTA.map((c) => [c.chave, [c.cabecalho, c.label]]),
) as Record<CampoChave, string[]>;
CABECALHOS.aniv_conjuge.push("Aniversário Cônjuge", "Aniv Conjuge");
CABECALHOS.admissao.push("Data de admissão", "Data admissão");
CABECALHOS.email.push("Email", "E-mail pessoal");
CABECALHOS.contato_emergencia.push("Contato emergência");
CABECALHOS.plano_saude.push("Plano saúde");
CABECALHOS.botom.push("Bottom", "Boton");
CABECALHOS.sittax.push("Sittax");

const MAPA_CABECALHO = new Map<string, CampoChave>();
for (const [chave, nomes] of Object.entries(CABECALHOS) as [CampoChave, string[]][]) {
  for (const n of nomes) MAPA_CABECALHO.set(normalizarTexto(n), chave);
}
const CABECALHO_STATUS = new Set(["statusdovinculo", "statusvinculo", "vinculo"]);

function categoriaDaData(titulo: string): string {
  if (/clientes?/i.test(titulo)) return "Evento interno";
  if (/profissional|contador|designer|estagi|inform[aá]tica|\brh\b/i.test(titulo)) return "Data profissional";
  return "Data comemorativa";
}

/** minimo: quantas das 34 colunas precisam ser reconhecidas (na aba chamada "Base" bastam Nome + 1). */
function encontrarCabecalho(ws: ExcelJS.Worksheet, minimo = 5): { linha: number; mapa: Map<number, CampoChave>; status: number | null; extras: string[] } | null {
  const limite = Math.min(ws.rowCount, 15);
  for (let r = 1; r <= limite; r++) {
    const row = ws.getRow(r);
    const mapa = new Map<number, CampoChave>();
    const extras: string[] = [];
    let status: number | null = null;
    const usados = new Set<CampoChave>();
    row.eachCell({ includeEmpty: false }, (cell, col) => {
      const t = textoDeValor(valorCru(cell));
      if (!t) return;
      const n = normalizarTexto(t);
      const chave = MAPA_CABECALHO.get(n);
      if (chave && !usados.has(chave)) {
        mapa.set(col, chave);
        usados.add(chave);
      } else if (CABECALHO_STATUS.has(n)) status = col;
      else extras.push(`${t} (coluna ${letraColuna(col)})`);
    });
    if (mapa.size >= minimo && [...mapa.values()].includes("nome")) return { linha: r, mapa, status, extras };
  }
  return null;
}

type CabecalhoBase = NonNullable<ReturnType<typeof encontrarCabecalho>>;

/** Lê as linhas da aba Base: funcionários (com a cor da linha) e as datas "COMEMORAR". */
function lerLinhasBase(ws: ExcelJS.Worksheet, cab: CabecalhoBase, tema: string[]): { funcionarios: LinhaFuncionario[]; datasComemorativas: LinhaDataComemorativa[]; linhasVazias: number } {
  const funcionarios: LinhaFuncionario[] = [];
  const datasComemorativas: LinhaDataComemorativa[] = [];
  let linhasVazias = 0;

  const colunasDados = [...cab.mapa.keys()];
  const maxCol = Math.max(...colunasDados, cab.status ?? 0);
  const colNome = [...cab.mapa.entries()].find(([, k]) => k === "nome")![0];

  for (let r = cab.linha + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const valores = Object.fromEntries(CAMPOS_LISTA.map((c) => [c.chave, null])) as ValoresCampos;
    const avisosLinha: string[] = [];
    let algumValor = false;

    for (const [col, chave] of cab.mapa.entries()) {
      const def = CAMPOS_LISTA.find((c) => c.chave === chave)!;
      const bruto = valorCru(row.getCell(col));
      if (bruto != null && String(bruto).trim() !== "") algumValor = true;
      if (def.tipo === "data" || def.tipo === "diames") {
        const { data, erro } = dataDeValor(bruto, def.tipo === "diames");
        valores[chave] = data;
        if (erro) avisosLinha.push(`${def.label}: ${erro} — corrija após importar`);
      } else {
        valores[chave] = textoDeValor(bruto);
      }
    }
    if (!algumValor) {
      linhasVazias++;
      continue;
    }

    // Cores de preenchimento da linha
    let vermelhas = 0;
    let vermelhoClaro = 0;
    let comCor = 0;
    const contagemHex = new Map<string, number>();
    for (let col = 1; col <= maxCol; col++) {
      const hex = corDoPreenchimento(row.getCell(col).fill, tema);
      const classe = classificarCor(hex);
      if (classe === "NENHUMA") continue;
      comCor++;
      if (hex) contagemHex.set(hex, (contagemHex.get(hex) ?? 0) + 1);
      if (classe === "VERMELHO") vermelhas++;
      if (classe === "VERMELHO_CLARO") vermelhoClaro++;
    }
    const hexNome = corDoPreenchimento(row.getCell(colNome).fill, tema);
    const classeNome = classificarCor(hexNome);
    const predominante = [...contagemHex.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    const cor: CorLinha = {
      hex: hexNome ?? predominante,
      classe: classeNome !== "NENHUMA" ? classeNome : classificarCor(predominante),
      celulasVermelhas: vermelhas,
      celulasVermelhoClaro: vermelhoClaro,
      celulasComCor: comCor,
    };
    const metade = Math.ceil(colunasDados.length / 2);
    const desligadoPelaCor = classeNome === "VERMELHO" || vermelhas >= metade;
    const conferirCor = !desligadoPelaCor && (classeNome === "VERMELHO_CLARO" || vermelhas > 0 || vermelhoClaro >= metade);

    let statusPlanilha: "ATIVO" | "DESLIGADO" | null = null;
    if (cab.status) {
      const s = normalizarTexto(textoDeValor(valorCru(row.getCell(cab.status))) ?? "");
      if (s === "desligado") statusPlanilha = "DESLIGADO";
      else if (s === "ativo") statusPlanilha = "ATIVO";
    }

    // Linhas "COMEMORAR" = datas comemorativas do escritório
    const modalidadeNorm = normalizarTexto(valores.modalidade ?? "");
    if (modalidadeNorm === "comemorar" && !valores.situacao) {
      const titulo = valores.nome ?? "";
      const data = valores.nascimento ?? valores.admissao;
      if (titulo && data) {
        const outros = CAMPOS_LISTA.filter((c) => !["nome", "modalidade", "nascimento", "admissao"].includes(c.chave) && valores[c.chave]);
        const avisosData = outros.length ? [`Valores em outras colunas foram ignorados: ${outros.map((c) => c.cabecalho).join(", ")}`] : [];
        datasComemorativas.push({ linha: r, titulo, data, categoria: categoriaDaData(titulo), avisos: [...avisosLinha, ...avisosData] });
        continue;
      }
      avisosLinha.push("Marcada como COMEMORAR sem título ou data — importada como funcionário para conferência");
    }

    funcionarios.push({ linha: r, valores, cor, desligadoPelaCor, conferirCor, statusPlanilha, avisos: avisosLinha });
  }

  return { funcionarios, datasComemorativas, linhasVazias };
}

async function abrirWorkbook(arquivo: ArrayBuffer | Buffer): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(arquivo as ArrayBuffer);
  } catch {
    throw new Error("Não foi possível abrir o arquivo. Envie uma planilha Excel (.xlsx).");
  }
  return wb;
}

/** Localiza a aba Base de funcionários (pelo nome ou pelo cabeçalho). */
function localizarBase(wb: ExcelJS.Workbook): { ws: ExcelJS.Worksheet; cab: NonNullable<ReturnType<typeof encontrarCabecalho>> } | null {
  const porNome = wb.worksheets.find((w) => normalizarTexto(w.name) === "base");
  // Exportação só com as colunas visíveis: aba "Base" com menos colunas também é aceita
  const cabNome = porNome ? encontrarCabecalho(porNome, 2) : null;
  if (porNome && cabNome) return { ws: porNome, cab: cabNome };
  for (const w of wb.worksheets) {
    const c = encontrarCabecalho(w);
    if (c) return { ws: w, cab: c };
  }
  return null;
}

export const MENSAGEM_SEM_CLIENTES =
  "Não encontrei uma relação de clientes nesta planilha. A tabela precisa ter um cabeçalho com o nome do cliente (Cliente, Razão social ou Empresa) e o CNPJ ou uma data (início da parceria, fundação, aniversário do sócio ou data do evento).";

/**
 * Leitura para a aba Datas do Cliente. Analisa TODAS as abas do arquivo:
 * - abas com relação de clientes (cabeçalho Cliente/Razão social/Empresa + CNPJ ou datas) → clientes;
 * - aba Base → colaboradores (importados em Funcionários → Importar Excel; nunca viram clientes);
 * - aba Calendário → eventos classificados pela coluna Evento. "Aniversário de Empresa" é conferido
 *   com a aba Base (tempo de casa do colaborador) e mostrado na prévia.
 * O arquivo só é recusado quando não tem nenhuma dessas informações.
 */
export async function lerPlanilhaClientes(arquivo: ArrayBuffer | Buffer, nomeArquivo = ""): Promise<LeituraClientes> {
  const csv = /\.csv$/i.test(nomeArquivo);
  const wb = csv ? workbookDoCsv(new Uint8Array(arquivo as ArrayBuffer), nomeArquivo.replace(/\.csv$/i, "")) : await abrirWorkbook(arquivo);
  const base = localizarBase(wb);
  const leitura = lerClientesDoWorkbook(wb, base ? [base.ws] : []);
  const calendario = lerCalendario(wb);
  let infoBase: LeituraClientes["base"] = null;
  if (base) {
    const temas = (wb as unknown as { _themes?: Record<string, string> })._themes ?? {};
    const linhas = lerLinhasBase(base.ws, base.cab, lerCoresDoTema(temas.theme1 ?? Object.values(temas)[0]));
    infoBase = {
      aba: base.ws.name,
      colaboradores: linhas.funcionarios.filter((f) => f.valores.nome).map((f) => ({ nome: f.valores.nome!, situacao: f.valores.situacao, admissao: f.valores.admissao })),
      comemorar: linhas.datasComemorativas.length,
    };
  }
  if (leitura.abas.length === 0 && !calendario && !infoBase) throw new Error(MENSAGEM_SEM_CLIENTES);
  return { ...leitura, calendario, base: infoBase };
}

export async function lerPlanilha(arquivo: ArrayBuffer | Buffer): Promise<LeituraPlanilha> {
  const wb = await abrirWorkbook(arquivo);
  const temas = (wb as unknown as { _themes?: Record<string, string> })._themes ?? {};
  const tema = lerCoresDoTema(temas.theme1 ?? Object.values(temas)[0]);

  // Localiza a aba Base (pelo nome ou pelo cabeçalho)
  const base = localizarBase(wb);
  if (!base) {
    const soClientes = lerClientesDoWorkbook(wb);
    if (soClientes.abas.length)
      throw new Error(
        `Esta planilha não tem a aba Base de funcionários, mas tem uma relação de clientes (aba ${soClientes.abas[0].nome}). Para importá-la, use Datas do Cliente → Importar Excel.`,
      );
    throw new Error('Aba "Base" não encontrada: nenhuma aba tem o cabeçalho com Nome, Situação, Modalidade, Admissão…');
  }
  const { ws, cab } = base;

  // Relação de clientes em outras abas do mesmo arquivo (a aba Base nunca é lida como clientes)
  const clientes = lerClientesDoWorkbook(wb, [ws]);
  const abasClientes = new Set(clientes.abas.map((a) => a.nome));

  const abas: AbaInfo[] = wb.worksheets.map((w) => {
    const n = normalizarTexto(w.name);
    const oculta = w.state !== "visible";
    if (w === ws) return { nome: w.name, oculta, uso: "importada", observacao: "Cadastro dos funcionários e datas comemorativas" };
    if (abasClientes.has(w.name)) return { nome: w.name, oculta, uso: "clientes", observacao: "Relação de clientes → Datas do Cliente" };
    if (n === "aux") return { nome: w.name, oculta, uso: "recalculada", observacao: "Motor de cálculo — não importado; o sistema recalcula" };
    if (n === "calendario") return { nome: w.name, oculta, uso: "recalculada", observacao: "Eventos recalculados automaticamente pelo sistema" };
    if (n.startsWith("instruc")) return { nome: w.name, oculta, uso: "instrucoes", observacao: "Texto de orientação — sem dados" };
    return { nome: w.name, oculta, uso: "ignorada", observacao: "Aba sem o cabeçalho da Base nem relação de clientes" };
  });

  const encontradas = [...cab.mapa.entries()].map(([col, chave]) => ({
    chave,
    cabecalho: CAMPOS_LISTA.find((c) => c.chave === chave)!.cabecalho,
    coluna: letraColuna(col),
  }));
  const chavesEncontradas = new Set(encontradas.map((e) => e.chave));
  const ausentes = CAMPOS_LISTA.filter((c) => !chavesEncontradas.has(c.chave)).map((c) => c.cabecalho);

  const avisos: string[] = [];
  if (ausentes.length) avisos.push(`Colunas não encontradas: ${ausentes.join(", ")}. Esses campos ficarão vazios.`);

  const { funcionarios, datasComemorativas, linhasVazias } = lerLinhasBase(ws, cab, tema);

  return {
    abas,
    abaBase: ws.name,
    linhaCabecalho: cab.linha,
    colunasEncontradas: encontradas,
    colunasAusentes: ausentes,
    colunasExtras: cab.extras,
    funcionarios,
    datasComemorativas,
    clientes,
    linhasVazias,
    avisos,
  };
}
