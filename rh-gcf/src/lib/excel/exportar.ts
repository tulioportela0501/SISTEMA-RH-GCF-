/**
 * Geração das planilhas exportadas (ExcelJS). Sem acesso ao banco: recebe os dados prontos.
 *
 * Padrão de todas as abas: título, subtítulo (data, usuário, filtros), cabeçalho azul com filtro automático,
 * painéis congelados, larguras ajustadas, datas como datas reais do Excel (DD/MM/AAAA) e impressão em paisagem.
 * Destaques: linha vermelha = funcionário desligado; célula amarela = cadastro incompleto.
 */
import ExcelJS from "exceljs";
import { CAMPOS_LISTA, CAMPO_POR_CHAVE, type CampoChave } from "@/lib/domain/campos";
import { anosDeParceria, clienteAtivo, formatarInicioGcf, pendenciasDataCliente, proximoAniversarioParceria } from "@/lib/domain/clientes";
import { formatarWhatsapp } from "@/lib/domain/whatsapp";
import { FUSO, descreverDiasRestantes, formatarDiaMes, partes, type DataISO } from "@/lib/domain/datas";
import { GRUPOS, ehAniversarioParceria, proximasOcorrencias, type Evento } from "@/lib/domain/eventos";
import type { AnaliseCadastro } from "@/lib/domain/pendencias";
import type { DataCliente, DataComemorativa, Funcionario } from "@/lib/domain/tipos";

export const MIME_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export const CORES = {
  azul: "FF1668B8",
  azulEscuro: "FF105388",
  azulClaro: "FFEEF6FD",
  borda: "FFD9DEE7",
  /** Mesmo vermelho de preenchimento usado na planilha do RH para desligados */
  vermelho: "FFFF0000",
  ambar: "FFFFEB9C",
  ambarTexto: "FF9C5700",
  cinza: "FF64748B",
  cinzaClaro: "FF94A3B8",
  branco: "FFFFFFFF",
} as const;

export type ValorCelula = string | number | boolean | Date | null | undefined;
export type TipoColuna = "texto" | "data" | "diames" | "datahora" | "inteiro";

export interface EstiloCelula {
  preenchimento?: string;
  fonte?: string;
  negrito?: boolean;
}

export interface Coluna<T> {
  cabecalho: string;
  tipo?: TipoColuna;
  /** Largura máxima (padrão 50) */
  max?: number;
  valor: (r: T) => ValorCelula;
  destaque?: (r: T) => EstiloCelula | null;
}

export interface ContextoExportacao {
  geradoEm: Date;
  usuario: string;
  hoje: DataISO;
}

export interface OpcoesAba<T> {
  nome: string;
  titulo?: string;
  subtitulo?: string[];
  colunas: Coluna<T>[];
  linhas: T[];
  estiloLinha?: (r: T) => EstiloCelula | null;
  /** Congela as primeiras colunas (ex.: nome) */
  congelarColunas?: number;
  /**
   * Faixa de título na linha 1 (mesclada, fundo azul), como na planilha original do RH:
   * cabeçalho na linha 2 e dados a partir da linha 3. Usada no lugar de titulo/subtitulo.
   */
  faixaTitulo?: string;
}

// Caracteres de controle não são aceitos no XML do Excel (causariam "reparo" ao abrir)
const CONTROLE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;

export function textoSeguro(v: string): string {
  const t = v.replace(CONTROLE, "");
  return t.length > 32_000 ? `${t.slice(0, 32_000)}…` : t;
}

/** Data civil → data do Excel (meia-noite UTC = dia exato, sem deslocamento de fuso). */
export function dataExcel(iso: DataISO | null | undefined): Date | null {
  if (!iso) return null;
  const { ano, mes, dia } = partes(iso);
  return new Date(Date.UTC(ano, mes - 1, dia));
}

/** Momento → data e hora de Fortaleza (o Excel não guarda fuso). */
export function dataHoraExcel(d: Date | string | null | undefined): Date | null {
  if (!d) return null;
  const data = typeof d === "string" ? new Date(d) : d;
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: FUSO, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" })
      .formatToParts(data)
      .map((x) => [x.type, x.value]),
  );
  return new Date(Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second)));
}

export function textoGeradoEm(ctx: ContextoExportacao, total: number, rotulo: string): string {
  const f = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, dateStyle: "short", timeStyle: "short" }).format(ctx.geradoEm);
  return `Exportado em ${f.replace(",", " às")} por ${ctx.usuario} · ${total} ${rotulo}`;
}

const FORMATOS: Record<TipoColuna, string | undefined> = {
  texto: "@",
  data: "dd/mm/yyyy",
  diames: "dd/mm",
  datahora: "dd/mm/yyyy hh:mm",
  inteiro: "0",
};

function larguraTexto(v: ValorCelula, tipo: TipoColuna): number {
  if (v == null || v === "") return 0;
  if (tipo === "data") return 10;
  if (tipo === "diames") return 6;
  if (tipo === "datahora") return 16;
  return Math.max(...String(v).split("\n").map((l) => l.length));
}

function preencher(cell: ExcelJS.Cell, argb: string) {
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb }, bgColor: { argb } };
}

/** Adiciona uma aba formatada com título, cabeçalho com filtro automático e as linhas. */
export function adicionarAba<T>(wb: ExcelJS.Workbook, o: OpcoesAba<T>): ExcelJS.Worksheet {
  const n = o.colunas.length;
  const subtitulos = o.subtitulo ?? [];
  const linhaCab = o.titulo ? 2 + subtitulos.length + 1 : o.faixaTitulo ? 2 : 1;
  const ws = wb.addWorksheet(o.nome.slice(0, 31), {
    views: [{ state: "frozen", ySplit: linhaCab, xSplit: o.congelarColunas ?? 0, showGridLines: true }],
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9, printTitlesRow: `${linhaCab}:${linhaCab}` },
  });

  if (o.titulo) {
    ws.mergeCells(1, 1, 1, Math.max(n, 1));
    const t = ws.getCell(1, 1);
    t.value = textoSeguro(o.titulo);
    t.font = { bold: true, size: 14, color: { argb: CORES.azulEscuro } };
    t.alignment = { vertical: "middle" };
    ws.getRow(1).height = 24;
    subtitulos.forEach((s, i) => {
      ws.mergeCells(2 + i, 1, 2 + i, Math.max(n, 1));
      const c = ws.getCell(2 + i, 1);
      c.value = textoSeguro(s);
      c.font = { size: 10, color: { argb: CORES.cinza } };
    });
  }

  if (!o.titulo && o.faixaTitulo) {
    ws.mergeCells(1, 1, 1, Math.max(n, 1));
    const t = ws.getCell(1, 1);
    t.value = textoSeguro(o.faixaTitulo);
    t.font = { bold: true, size: 12, color: { argb: CORES.branco } };
    t.alignment = { vertical: "middle" };
    preencher(t, CORES.azulEscuro);
    ws.getRow(1).height = 22;
  }
  // Cabeçalho
  const cab = ws.getRow(linhaCab);
  o.colunas.forEach((col, i) => {
    const c = cab.getCell(i + 1);
    c.value = col.cabecalho;
    c.font = { bold: true, color: { argb: CORES.branco } };
    preencher(c, CORES.azul);
    c.alignment = { vertical: "middle", wrapText: true };
    c.border = { bottom: { style: "thin", color: { argb: CORES.azulEscuro } } };
  });
  cab.height = 30;

  // Linhas
  const larguras = o.colunas.map((c) => Math.min(c.cabecalho.length, 24));
  o.linhas.forEach((item, idx) => {
    const row = ws.getRow(linhaCab + 1 + idx);
    const estilo = o.estiloLinha?.(item) ?? null;
    o.colunas.forEach((col, i) => {
      const tipo = col.tipo ?? "texto";
      const bruto = col.valor(item);
      const c = row.getCell(i + 1);
      let v: ValorCelula = bruto;
      if (typeof v === "string") v = textoSeguro(v);
      if (v === "" || v === undefined) v = null;
      c.value = v as ExcelJS.CellValue;
      if (v != null && tipo !== "texto") c.numFmt = FORMATOS[tipo]!;
      c.border = { bottom: { style: "hair", color: { argb: CORES.borda } } };
      c.alignment = { vertical: "top", wrapText: tipo === "texto" && larguraTexto(v, tipo) > (col.max ?? 50) };
      const destaque = col.destaque?.(item) ?? null;
      const e = { ...estilo, ...destaque };
      if (e.preenchimento) preencher(c, e.preenchimento);
      if (e.fonte || e.negrito) c.font = { color: e.fonte ? { argb: e.fonte } : undefined, bold: e.negrito || undefined };
      larguras[i] = Math.max(larguras[i], larguraTexto(v, tipo));
    });
  });

  o.colunas.forEach((col, i) => {
    ws.getColumn(i + 1).width = Math.min(Math.max(larguras[i] + 2, 8), (col.max ?? 50) + 2);
  });
  if (n > 0) ws.autoFilter = { from: { row: linhaCab, column: 1 }, to: { row: linhaCab + Math.max(o.linhas.length, 1), column: n } };
  return ws;
}

export function novoWorkbook(titulo: string): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = "RH GCF — Grupo Conceito Fiscal";
  wb.lastModifiedBy = "RH GCF";
  wb.title = titulo;
  wb.created = new Date();
  wb.modified = new Date();
  return wb;
}

export async function gerarArquivo(wb: ExcelJS.Workbook): Promise<Uint8Array> {
  const buf = await wb.xlsx.writeBuffer();
  return new Uint8Array(buf as ArrayBuffer);
}

// ---------------------------------------------------------------------
// Funcionários
// ---------------------------------------------------------------------

export type FuncionarioExportacao = Funcionario & { analise: AnaliseCadastro };

const NIVEL_CADASTRO: Record<AnaliseCadastro["nivel"], string> = {
  COMPLETO: "Completo",
  INCOMPLETO: "Incompleto",
  BASICO_INCOMPLETO: "Cadastro básico incompleto",
};

function colunaCampo(chave: (typeof CAMPOS_LISTA)[number]["chave"], cabecalho: "label" | "cabecalho"): Coluna<Pick<Funcionario, typeof chave>> {
  const def = CAMPO_POR_CHAVE[chave];
  const tipo: TipoColuna = def.tipo === "data" ? "data" : def.tipo === "diames" ? "diames" : "texto";
  return {
    cabecalho: def[cabecalho],
    tipo,
    max: chave === "contato_emergencia" ? 40 : 34,
    valor: (f) => (tipo === "texto" ? f[chave] : dataExcel(f[chave])),
  };
}

/** Título da linha 1 da aba Base, como na planilha original do RH. */
export const TITULO_BASE = "GRUPO CONCEITO FISCAL · Cadastro de Funcionários";

/**
 * Exportação de funcionários no formato da aba Base da planilha original:
 * - aba "Base": título na linha 1, os 34 cabeçalhos originais na linha 2 e os funcionários a partir da linha 3
 *   (desligados com preenchimento vermelho, como na planilha). Serve para reimportar.
 * - aba "Controle": dados da exportação (quem, quando, filtros), status do vínculo e o que falta em cada cadastro.
 */
export function planilhaFuncionarios(lista: FuncionarioExportacao[], ctx: ContextoExportacao, filtros: string, somente?: CampoChave[]): ExcelJS.Workbook {
  const wb = novoWorkbook("Funcionários — RH GCF");
  const desligado = (f: FuncionarioExportacao) => f.status_vinculo === "DESLIGADO";
  // As 34 colunas da aba Base ou só as visíveis na tela (sempre com os cabeçalhos originais)
  const chaves = somente?.length ? somente : CAMPOS_LISTA.map((c) => c.chave);
  adicionarAba(wb, {
    nome: "Base",
    faixaTitulo: TITULO_BASE,
    colunas: chaves.map((k) => colunaCampo(k, "cabecalho") as Coluna<FuncionarioExportacao>),
    linhas: lista,
    estiloLinha: (f) => (desligado(f) ? { preenchimento: CORES.vermelho } : null),
    congelarColunas: 1,
  });
  adicionarAba(wb, {
    nome: "Controle",
    titulo: "RH GCF — Controle da exportação de funcionários",
    subtitulo: [
      textoGeradoEm(ctx, lista.length, lista.length === 1 ? "funcionário" : "funcionários"),
      filtros,
      `A aba Base segue a planilha original: ${somente?.length ? `${chaves.length} das 34 colunas` : "34 colunas"}, título na linha 1, cabeçalho na linha 2 e funcionários a partir da linha 3. Linhas em vermelho: desligados.`,
    ],
    colunas: [
      { cabecalho: "Nome", max: 45, valor: (f) => f.nome },
      { cabecalho: "Situação", valor: (f) => f.situacao },
      { cabecalho: "Modalidade", valor: (f) => f.modalidade },
      { cabecalho: "Status do vínculo", valor: (f) => (desligado(f) ? "Desligado" : "Ativo"), destaque: (f) => (desligado(f) ? { negrito: true } : null) },
      { cabecalho: "Desligado em", tipo: "data", valor: (f) => dataExcel(f.desligado_em) },
      {
        cabecalho: "Status do cadastro",
        valor: (f) => NIVEL_CADASTRO[f.analise.nivel],
        destaque: (f) => (f.analise.nivel === "COMPLETO" ? null : { preenchimento: CORES.ambar, fonte: CORES.ambarTexto, negrito: true }),
      },
      { cabecalho: "Informações faltando", max: 60, valor: (f) => f.analise.pendencias.map((p) => (p.motivo === "Não preenchido" ? p.label : `${p.label} (${p.motivo.toLowerCase()})`)).join("; ") },
      { cabecalho: "Origem do cadastro", valor: (f) => (f.origem === "IMPORTACAO" ? "Importação da planilha" : "Cadastro no sistema") },
      { cabecalho: "Linha na planilha original", tipo: "inteiro", valor: (f) => f.linha_planilha },
      { cabecalho: "Cadastrado em", tipo: "datahora", valor: (f) => dataHoraExcel(f.criado_em) },
      { cabecalho: "Atualizado em", tipo: "datahora", valor: (f) => dataHoraExcel(f.atualizado_em) },
    ],
    linhas: lista,
    estiloLinha: (f) => (desligado(f) ? { preenchimento: CORES.vermelho } : null),
    congelarColunas: 1,
  });
  return wb;
}

/**
 * Modelo para importação: aba Base com as 34 colunas da planilha original, na mesma ordem e com os mesmos nomes.
 * Desligados em vermelho (como na planilha do RH) e datas do escritório como linhas "COMEMORAR".
 */
export function planilhaModeloBase(funcionarios: Funcionario[], datas: DataComemorativa[], ctx: ContextoExportacao): ExcelJS.Workbook {
  const wb = novoWorkbook("RH GCF Datas comemorativas — modelo para importação");
  type Linha = { f: Funcionario | null; d: DataComemorativa | null };
  const comemorar = datas.filter((d) => d.ativo && d.recorrente);
  const linhas: Linha[] = [...funcionarios.map((f) => ({ f, d: null })), ...comemorar.map((d) => ({ f: null, d }))];
  const colunas: Coluna<Linha>[] = CAMPOS_LISTA.map((c) => {
    const base = colunaCampo(c.chave, "cabecalho");
    return {
      cabecalho: base.cabecalho,
      tipo: base.tipo,
      max: base.max,
      valor: (l: Linha) => {
        if (l.f) return base.valor(l.f);
        // Linha COMEMORAR: título em Nome, "COMEMORAR" em Modalidade e a data em Nascimento
        if (c.chave === "nome") return l.d!.titulo;
        if (c.chave === "modalidade") return "COMEMORAR";
        if (c.chave === "nascimento") return dataExcel(l.d!.data);
        return null;
      },
    };
  });
  adicionarAba(wb, {
    nome: "Base",
    faixaTitulo: TITULO_BASE,
    colunas,
    linhas,
    estiloLinha: (l) => (l.f?.status_vinculo === "DESLIGADO" ? { preenchimento: CORES.vermelho } : null),
    congelarColunas: 1,
  });

  const inst = wb.addWorksheet("Instruções");
  inst.getColumn(1).width = 110;
  const textos = [
    "RH GCF — modelo para importação (34 colunas da aba Base)",
    textoGeradoEm(ctx, funcionarios.length, "funcionários") + ` e ${comemorar.length} datas COMEMORAR`,
    "",
    "• A aba Base tem as 34 colunas da planilha original, na mesma ordem (A a AH) e com os mesmos nomes: título na linha 1, cabeçalho na linha 2 e funcionários a partir da linha 3.",
    "• Linhas com preenchimento VERMELHO são funcionários desligados. Amarelo e azul não contam como desligamento.",
    "• Obrigatórios: Nome, Situação, Modalidade e Admissão. Datas no formato DD/MM/AAAA.",
    "• Nascimento e aniversários de cônjuge e filhos: só o dia e o mês são usados.",
    "• Linhas com Modalidade COMEMORAR (sem Situação) são datas comemorativas do escritório: nome na coluna Nome e data na coluna Nascimento.",
    "• Para importar: Funcionários → Importar Excel. Funcionários já cadastrados têm os campos vazios completados; valores diferentes aparecem na prévia e só são atualizados se você marcar. Célula vazia na planilha nunca apaga um dado do sistema.",
  ];
  textos.forEach((t, i) => {
    const c = inst.getCell(i + 1, 1);
    c.value = t;
    c.font = i === 0 ? { bold: true, size: 14, color: { argb: CORES.azulEscuro } } : { size: 11 };
  });
  return wb;
}

// ---------------------------------------------------------------------
// Datas do cliente
// ---------------------------------------------------------------------

export function planilhaClientes(lista: DataCliente[], ctx: ContextoExportacao, filtros: string, diaFelicitacao = 1): ExcelJS.Workbook {
  const wb = novoWorkbook("Datas do Cliente — RH GCF");
  const proxima = new Map(
    lista.map((d) => [
      d.id,
      ehAniversarioParceria(d)
        ? proximoAniversarioParceria(d, ctx.hoje, diaFelicitacao)
        : (proximasOcorrencias({ funcionarios: [], datasComemorativas: [], datasCliente: [d], diaFelicitacao }, ctx.hoje)[0] ?? null),
    ]),
  );
  const pend = new Map(lista.map((d) => [d.id, pendenciasDataCliente(d)]));
  // Demais colunas da planilha geral (Grupo, Inscrição Estadual…), na ordem em que aparecem
  const extras = [...new Set(lista.flatMap((d) => Object.keys(d.dados_extras ?? {})))];
  const colunas: Coluna<DataCliente>[] = [
    { cabecalho: "Nome ou razão social", max: 45, valor: (d) => d.cliente_nome },
    { cabecalho: "CNPJ", valor: (d) => d.cnpj },
    { cabecalho: "ID", valor: (d) => d.codigo },
    { cabecalho: "Situação do cliente", valor: (d) => (d.situacao_cliente === "ATIVO" ? "Ativo" : "Inativo") },
    { cabecalho: "Tipo de data comemorativa", max: 38, valor: (d) => d.tipo_data },
    { cabecalho: "Data do evento", tipo: "data", valor: (d) => dataExcel(d.data_evento) },
    // Só mês e ano: exportado como texto "03/2025" (o dia não é inventado)
    { cabecalho: "Início GCF", valor: (d) => (d.inicio_parceria_precisao === "MES" ? formatarInicioGcf(d.inicio_parceria, "MES") || null : dataExcel(d.inicio_parceria)) },
    { cabecalho: "Anos de parceria", tipo: "inteiro", valor: (d) => anosDeParceria(d.inicio_parceria, ctx.hoje, d.inicio_parceria_precisao) },
    { cabecalho: "Próximo aniversário", tipo: "data", valor: (d) => dataExcel(proxima.get(d.id)?.data) },
    { cabecalho: "Dias restantes", tipo: "inteiro", valor: (d) => proxima.get(d.id)?.dias ?? null },
    { cabecalho: "WhatsApp", valor: (d) => (d.whatsapp ? formatarWhatsapp(d.whatsapp) : null) },
    { cabecalho: "Tributação", valor: (d) => d.tributacao },
    { cabecalho: "Responsável Fiscal", valor: (d) => d.responsavel_fiscal },
    { cabecalho: "Responsável Contábil", valor: (d) => d.responsavel_contabil },
    { cabecalho: "Responsável DP", valor: (d) => d.responsavel_dp },
    { cabecalho: "Não deseja receber mensagens", valor: (d) => (d.nao_enviar ? `Sim${d.nao_enviar_motivo ? ` — ${d.nao_enviar_motivo}` : ""}` : "Não") },
    { cabecalho: "Observações", max: 60, valor: (d) => d.observacoes },
    { cabecalho: "Repete todo ano", valor: (d) => (d.recorrente ? "Sim" : "Não") },
    { cabecalho: "Situação do evento", valor: (d) => (d.ativo ? "Ativo" : "Desativado") },
    {
      cabecalho: "Cadastro",
      valor: (d) => (pend.get(d.id)!.length ? "Incompleto" : "Completo"),
      destaque: (d) => (pend.get(d.id)!.length ? { preenchimento: CORES.ambar, fonte: CORES.ambarTexto, negrito: true } : null),
    },
    { cabecalho: "Informações faltando", valor: (d) => pend.get(d.id)!.join(", ") },
    ...extras.map((k): Coluna<DataCliente> => ({ cabecalho: k, max: 30, valor: (d) => d.dados_extras?.[k] ?? null })),
  ];
  adicionarAba(wb, {
    nome: "Datas do Cliente",
    titulo: "RH GCF — Datas do Cliente",
    subtitulo: [
      textoGeradoEm(ctx, lista.length, lista.length === 1 ? "registro" : "registros"),
      filtros,
      "Clientes inativos e eventos desativados em cinza. Coluna Cadastro em amarelo: falta CNPJ ou Início GCF. Início GCF só com mês e ano aparece como MM/AAAA. Anos de parceria, próximo aniversário e dias restantes calculados na data da exportação.",
    ],
    colunas,
    linhas: lista,
    estiloLinha: (d) => (clienteAtivo(d) ? null : { fonte: CORES.cinza }),
    congelarColunas: 1,
  });
  return wb;
}

// ---------------------------------------------------------------------
// Felicitações (aniversários de parceria)
// ---------------------------------------------------------------------

export interface LinhaFelicitacaoExportacao {
  empresa: string;
  cnpj: string | null;
  inicioGcf: string;
  anos: number;
  mes: string;
  dataFelicitacao: DataISO;
  whatsapp: string | null;
  status: string;
  enviadoEm: Date | string | null;
  enviadoPor: string | null;
  preparadoEm: Date | string | null;
  preparadoPor: string | null;
  abertoEm: Date | string | null;
  abertoPor: string | null;
  comImagem: boolean | null;
  mensagem: string | null;
  motivo: string | null;
}

export function planilhaFelicitacoes(linhas: LinhaFelicitacaoExportacao[], ctx: ContextoExportacao, titulo: string, filtros: string): ExcelJS.Workbook {
  const wb = novoWorkbook("Felicitações — RH GCF");
  adicionarAba(wb, {
    nome: "Felicitações",
    titulo: `RH GCF — ${titulo}`,
    subtitulo: [
      textoGeradoEm(ctx, linhas.length, linhas.length === 1 ? "felicitação" : "felicitações"),
      filtros,
      "Envio manual pelo WhatsApp: “Felicitação preparada” e “WhatsApp aberto” não significam envio; “Enviado” foi confirmado pelo funcionário.",
    ],
    colunas: [
      { cabecalho: "Empresa", max: 45, valor: (l) => l.empresa },
      { cabecalho: "CNPJ", valor: (l) => l.cnpj },
      { cabecalho: "Início GCF", valor: (l) => l.inicioGcf },
      { cabecalho: "Anos de parceria", tipo: "inteiro", valor: (l) => l.anos },
      { cabecalho: "Mês de aniversário", valor: (l) => l.mes },
      { cabecalho: "WhatsApp", valor: (l) => (l.whatsapp ? formatarWhatsapp(l.whatsapp) : null) },
      {
        cabecalho: "Status",
        valor: (l) => l.status,
        destaque: (l) => (l.status === "Enviado" ? { fonte: "FF16A34A", negrito: true } : l.status === "Pendente" ? { fonte: CORES.ambarTexto, negrito: true } : null),
      },
      { cabecalho: "Data do envio", tipo: "datahora", valor: (l) => dataHoraExcel(l.enviadoEm) },
      { cabecalho: "Responsável pelo envio", valor: (l) => l.enviadoPor },
      { cabecalho: "Data da felicitação", tipo: "data", valor: (l) => dataExcel(l.dataFelicitacao) },
      { cabecalho: "Felicitação preparada em", tipo: "datahora", valor: (l) => dataHoraExcel(l.preparadoEm) },
      { cabecalho: "Preparada por", valor: (l) => l.preparadoPor },
      { cabecalho: "WhatsApp aberto em", tipo: "datahora", valor: (l) => dataHoraExcel(l.abertoEm) },
      { cabecalho: "WhatsApp aberto por", valor: (l) => l.abertoPor },
      { cabecalho: "Imagem utilizada", valor: (l) => (l.comImagem == null ? null : l.comImagem ? "Sim" : "Não") },
      { cabecalho: "Mensagem utilizada", max: 70, valor: (l) => l.mensagem },
      { cabecalho: "Motivo (não enviar)", max: 40, valor: (l) => l.motivo },
    ],
    linhas,
    congelarColunas: 1,
  });
  return wb;
}

// ---------------------------------------------------------------------
// Datas comemorativas
// ---------------------------------------------------------------------

/** Nome do evento como na aba Calendário da planilha original. */
function eventoDaPlanilha(e: Evento): string {
  const periodo = /^(\d)º período/.exec(e.detalhe ?? "")?.[1];
  switch (e.tipo) {
    case "ANIV_FUNCIONARIO":
      return "Aniversário do Funcionário";
    case "ANIV_EMPRESA":
      return "Aniversário de Empresa";
    case "ADMISSAO":
      return "Admissão";
    case "ANIV_CONJUGE":
      return "Aniversário do Cônjuge";
    case "ANIV_FILHO":
      return "Aniversário de Filho(a)";
    case "FERIAS_INICIO":
      return periodo ? `Início de Férias (${periodo})` : "Início de Férias";
    case "FERIAS_FIM":
      return periodo ? `Fim de Férias (${periodo})` : "Fim de Férias";
    default:
      return e.tipoLabel;
  }
}

/** Detalhe como na planilha original (ex.: "10 anos de empresa", nome do filho ou do cônjuge). */
function detalheDaPlanilha(e: Evento): string | null {
  if (e.tipo === "ANIV_EMPRESA" && e.detalhe) return `${e.detalhe} de empresa`;
  return e.detalhe;
}

/**
 * Datas comemorativas no formato da aba Calendário da planilha original:
 * Próxima Data, Dias Restantes, Colaborador, Modalidade, Evento e Detalhe (mais dia da semana, categoria e situação).
 * As datas são calculadas pelo sistema a partir dos cadastros (não vêm das fórmulas da planilha).
 */
export function planilhaCalendario(eventos: Evento[], ctx: ContextoExportacao, periodo: string, filtros: string): ExcelJS.Workbook {
  const wb = novoWorkbook("Datas Comemorativas — RH GCF");
  const semana = new Intl.DateTimeFormat("pt-BR", { weekday: "long", timeZone: "UTC" });
  adicionarAba(wb, {
    nome: "Calendário",
    titulo: `RH GCF — Datas Comemorativas (${periodo})`,
    subtitulo: [
      textoGeradoEm(ctx, eventos.length, eventos.length === 1 ? "data" : "datas"),
      filtros,
      "Calculado pelo sistema a partir dos cadastros (aniversários, tempo de empresa, cônjuge, filhos e férias). Funcionários desligados não aparecem. Aniversários se repetem todo ano; férias usam a data real.",
    ],
    colunas: [
      { cabecalho: "Próxima Data", tipo: "data", valor: (e) => dataExcel(e.data) },
      { cabecalho: "Dias Restantes", tipo: "inteiro", valor: (e) => e.dias },
      { cabecalho: "Colaborador", max: 40, valor: (e) => e.titulo },
      { cabecalho: "Modalidade", valor: (e) => e.modalidade ?? (e.origem.tipo === "data_comemorativa" ? "COMEMORAR" : null) },
      { cabecalho: "Evento", max: 34, valor: (e) => eventoDaPlanilha(e) },
      { cabecalho: "Detalhe", max: 60, valor: (e) => detalheDaPlanilha(e) },
      { cabecalho: "Dia da semana", valor: (e) => semana.format(dataExcel(e.data)!) },
      { cabecalho: "Categoria", valor: (e) => GRUPOS[e.grupo] },
      { cabecalho: "Situação", valor: (e) => e.situacao ?? null },
    ],
    linhas: eventos,
    estiloLinha: (e) => (e.dias === 0 ? { negrito: true, preenchimento: CORES.azulClaro } : null),
  });
  return wb;
}

export function planilhaDatasEscritorio(datas: DataComemorativa[], ctx: ContextoExportacao): ExcelJS.Workbook {
  const wb = novoWorkbook("Datas do escritório — RH GCF");
  adicionarAba(wb, {
    nome: "Datas do escritório",
    titulo: "RH GCF — Datas comemorativas do escritório",
    subtitulo: [textoGeradoEm(ctx, datas.length, datas.length === 1 ? "data cadastrada" : "datas cadastradas"), "Inclui as linhas COMEMORAR da planilha e as datas cadastradas no sistema. Datas desativadas em cinza."],
    colunas: [
      { cabecalho: "Nome", max: 45, valor: (d) => d.titulo },
      { cabecalho: "Data", tipo: "data", valor: (d) => dataExcel(d.data) },
      { cabecalho: "Dia e mês", valor: (d) => formatarDiaMes(d.data) },
      { cabecalho: "Repete todo ano", valor: (d) => (d.recorrente ? "Sim" : "Não") },
      { cabecalho: "Categoria", valor: (d) => d.categoria },
      { cabecalho: "Descrição", max: 60, valor: (d) => d.descricao },
      { cabecalho: "Situação", valor: (d) => (d.ativo ? "Ativa" : "Desativada") },
      { cabecalho: "Origem", valor: (d) => (d.origem === "IMPORTACAO" ? "Importação da planilha" : "Cadastro no sistema") },
      { cabecalho: "Linha na planilha original", tipo: "inteiro", valor: (d) => d.linha_planilha },
    ],
    linhas: datas,
    estiloLinha: (d) => (d.ativo ? null : { fonte: CORES.cinza }),
  });
  return wb;
}

// ---------------------------------------------------------------------
// Histórico
// ---------------------------------------------------------------------

export interface LinhaHistoricoExportacao {
  ocorridoEm: Date | string;
  usuario: string;
  operacao: string;
  entidade: string;
  registro: string | null;
  campo: string | null;
  anterior: string | null;
  novo: string | null;
  descricao: string;
  lote: number | null;
}

export function planilhaHistorico(itens: LinhaHistoricoExportacao[], ctx: ContextoExportacao, filtros: string, limitado: boolean): ExcelJS.Workbook {
  const wb = novoWorkbook("Histórico — RH GCF");
  adicionarAba(wb, {
    nome: "Histórico",
    titulo: "RH GCF — Histórico de alterações",
    subtitulo: [
      textoGeradoEm(ctx, itens.length, itens.length === 1 ? "registro" : "registros"),
      filtros,
      limitado ? "Atenção: a exportação traz só os registros mais recentes. Use o filtro de período para exportar o restante." : "Registros do mais recente para o mais antigo. Somente consulta: o histórico não é alterado pela exportação.",
    ],
    colunas: [
      { cabecalho: "Data e horário", tipo: "datahora", valor: (h) => dataHoraExcel(h.ocorridoEm) },
      { cabecalho: "Usuário", valor: (h) => h.usuario },
      { cabecalho: "Operação", valor: (h) => h.operacao },
      { cabecalho: "Tipo de registro", valor: (h) => h.entidade },
      { cabecalho: "Registro", max: 40, valor: (h) => h.registro },
      { cabecalho: "Informação alterada", valor: (h) => h.campo },
      { cabecalho: "Valor anterior", max: 40, valor: (h) => h.anterior },
      { cabecalho: "Novo valor", max: 40, valor: (h) => h.novo },
      { cabecalho: "Descrição", max: 70, valor: (h) => h.descricao },
      { cabecalho: "Lote de importação", tipo: "inteiro", valor: (h) => h.lote },
    ],
    linhas: itens,
  });
  return wb;
}

