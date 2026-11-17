/**
 * Leitura de relações de clientes em planilhas Excel.
 *
 * A aba é reconhecida pelo CABEÇALHO, nunca pela posição: precisa ter uma coluna que identifique o cliente
 * (Cliente, Razão social, Empresa… ou Nome + CNPJ) e pelo menos um dado de cliente (CNPJ ou uma data).
 * A aba Base de funcionários nunca é lida como clientes, e as linhas "COMEMORAR" (ex.: "CLIENTES DO MÊS")
 * continuam sendo datas comemorativas do escritório.
 *
 * Formatos conhecidos:
 * - Exportação do próprio sistema (Datas do Cliente → Exportar Excel).
 * - Lista de aniversários de clientes do GCF: Cód. | Empresa | Contato | Nascimento | … | Status | WhatsApp | Observação
 *   (o aniversário é do contato → "Aniversário do sócio ou responsável").
 * - Lista simples: Nome (contato) | Nascimento | Empresa ("30 - RAZÃO SOCIAL").
 */
import type ExcelJS from "exceljs";
import { CAMPOS_LISTA } from "@/lib/domain/campos";
import { cnpjValido, formatarCnpj, limparCnpj } from "@/lib/domain/cnpj";
import { lerData, montar, type DataISO } from "@/lib/domain/datas";
import { normalizarWhatsapp } from "@/lib/domain/whatsapp";
import {
  TIPO_FUNDACAO,
  TIPO_OUTRO,
  TIPO_PARCERIA,
  TIPO_SEGMENTO,
  TIPO_SOCIO,
  contatoDasObservacoes,
  type AbaClientes,
  type ClienteLido,
  type ColunaCliente,
  type EventoClienteLido,
  type LeituraClientes,
} from "@/lib/domain/clientes";
import { TIPOS_DATA_CLIENTE } from "@/lib/domain/tipos";
import { dataDeValor, letraColuna, textoDeValor, valorCru } from "./celulas";
import { normalizarTexto } from "./normalizar";

type Papel =
  | "cliente"
  | "fantasia"
  | "nome"
  | "contato"
  | "codigo"
  | "cnpj"
  | "situacao"
  | "status"
  | "ativoEvento"
  | "tipo"
  | "data"
  | "nascimento"
  | "fundacao"
  | "parceria"
  | "recorrente"
  | "observacoes"
  | "whatsapp"
  | "tributacao"
  | "respFiscal"
  | "respContabil"
  | "respDp"
  | "calculada";

const ROTULO_PAPEL: Record<Papel, string> = {
  cliente: "Nome ou razão social",
  fantasia: "Nome fantasia",
  nome: "Nome",
  contato: "Contato",
  codigo: "Código do cliente",
  cnpj: "CNPJ",
  situacao: "Situação do cliente",
  status: "Status",
  ativoEvento: "Situação do evento",
  tipo: "Tipo de data",
  data: "Data do evento",
  nascimento: "Aniversário do sócio/contato",
  fundacao: "Fundação da empresa",
  parceria: "Início da parceria",
  recorrente: "Repetir todo ano",
  observacoes: "Observações",
  whatsapp: "WhatsApp",
  tributacao: "Tributação",
  respFiscal: "Responsável Fiscal",
  respContabil: "Responsável Contábil",
  respDp: "Responsável DP",
  calculada: "Calculada",
};

/** Classifica um cabeçalho (já normalizado: sem acentos, minúsculo, só letras e números). */
export function papelDoCabecalho(n: string): Papel | null {
  if (!n) return null;
  // Colunas calculadas: o sistema recalcula (não são importadas)
  if (n.includes("anosdeparceria") || n.includes("proximadata") || n.includes("diasrestantes") || n.includes("idade") || n.includes("oquefalta")) return "calculada";
  if (["dia", "mes", "mesnome", "nomedomes", "cadastro", "pendencias", "informacoesfaltando", "quando", "diadasemana", "proximoaniversario", "outrasinformacoes", "mesdeaniversario"].includes(n)) return "calculada";
  // Preferência de não receber mensagens: só é alterada no sistema
  if (n.startsWith("naodeseja") || n === "naoenviar" || n.startsWith("motivodenaoreceber")) return "calculada";
  if (n.includes("cnpj")) return "cnpj";
  if (
    n.includes("parceria") ||
    n.includes("iniciogcf") ||
    n === "inicio" ||
    n === "datadeinicio" ||
    n.includes("clientedesde") ||
    (n.includes("inicio") && (n.includes("contrato") || n.includes("prestacao")))
  )
    return "parceria";
  if (n.includes("fundacao") || n.includes("abertura") || n.includes("constituicao") || n === "aniversariodaempresa") return "fundacao";
  if (n.startsWith("situacaodoevento") || n === "eventoativo") return "ativoEvento";
  if (n.startsWith("tipo") || n === "comemoracao" || n === "evento") return "tipo";
  if (n.includes("nascimento") || n.startsWith("datanasc") || n.startsWith("dtnasc") || n === "nasc" || n.startsWith("aniversario")) return "nascimento";
  if (n === "data" || n.startsWith("datado") || n.startsWith("datada") || n.startsWith("datadeevento") || n === "dataevento" || n.startsWith("datacomemorativa")) return "data";
  if (n.startsWith("situacao") || n === "statusdocliente" || n === "situacaocliente") return "situacao";
  if (n === "status") return "status";
  if (n.includes("repet") || n === "recorrente" || n === "anual") return "recorrente";
  if (n.startsWith("obs") || n.startsWith("anotac")) return "observacoes";
  if (n === "tributacao" || n.startsWith("regimetribut") || n === "regime" || n === "regimedetributacao") return "tributacao";
  // Responsáveis do GCF pelo cliente (planilha geral: "Res. Fiscal", "Res. Contábil", "Res. DP")
  if (/^(res|resp|responsavel)(fiscal)$/.test(n)) return "respFiscal";
  if (/^(res|resp|responsavel)(contabil|contabilidade)$/.test(n)) return "respContabil";
  if (/^(res|resp|responsavel)(dp|departamentopessoal|pessoal)$/.test(n)) return "respDp";
  if (n.includes("fantasia")) return "fantasia";
  if (
    n === "cliente" ||
    n === "clientes" ||
    n.includes("razaosocial") ||
    n.startsWith("nomedocliente") ||
    n.startsWith("nomecliente") ||
    n === "empresa" ||
    n.startsWith("nomedaempresa") ||
    n === "clienteempresa" ||
    n === "codempresa" ||
    n === "codigoempresa"
  )
    return "cliente";
  if (["contato", "nomedocontato", "responsavel", "nomedoresponsavel", "socio", "nomedosocio", "socioresponsavel", "contatoresponsavel"].includes(n)) return "contato";
  if (["id", "cod", "codigo", "codcliente", "codigodocliente", "codigocliente", "coddocliente", "iddocliente", "idcliente"].includes(n)) return "codigo";
  if (n === "nome") return "nome";
  if (n.includes("whatsapp")) return "whatsapp";
  return null;
}

const CABECALHOS_FUNCIONARIO = new Set(CAMPOS_LISTA.flatMap((c) => [normalizarTexto(c.cabecalho), normalizarTexto(c.label)]));
const ABAS_IGNORADAS = ["aux", "calendario", "instruc", "resumo", "pendencia", "dashboard", "graficos", "grafico"];

interface Cabecalho {
  linha: number;
  papeis: Map<Papel, number>;
  colunas: ColunaCliente[];
  ignoradas: string[];
  /** Colunas sem campo próprio: guardadas em "Outras informações" */
  outras: { col: number; cabecalho: string }[];
}

function encontrarCabecalhoClientes(ws: ExcelJS.Worksheet): Cabecalho | null {
  const nomeAba = normalizarTexto(ws.name);
  const abaDeClientes = nomeAba.includes("cliente");
  const limite = Math.min(ws.rowCount, 20);
  for (let r = 1; r <= limite; r++) {
    const row = ws.getRow(r);
    const papeis = new Map<Papel, number>();
    const colunas: ColunaCliente[] = [];
    const ignoradas: string[] = [];
    const outras: { col: number; cabecalho: string }[] = [];
    let funcionario = 0;
    row.eachCell({ includeEmpty: false }, (cell, col) => {
      const t = textoDeValor(valorCru(cell));
      if (!t || t.length > 80) return;
      const n = normalizarTexto(t);
      if (CABECALHOS_FUNCIONARIO.has(n)) funcionario++;
      const papel = papelDoCabecalho(n);
      if (!papel) {
        outras.push({ col, cabecalho: t.replace(/\s+/g, " ").trim().slice(0, 80) });
        return;
      }
      if (papel === "calculada") {
        ignoradas.push(`${t} (calculada pelo sistema)`);
        return;
      }
      if (papeis.has(papel)) {
        ignoradas.push(`${t} (coluna ${letraColuna(col)}, repetida)`);
        return;
      }
      papeis.set(papel, col);
      colunas.push({ papel: ROTULO_PAPEL[papel], cabecalho: t, coluna: letraColuna(col) });
    });
    // Cabeçalho da aba Base (funcionários): nunca é relação de clientes
    if (funcionario >= 5) continue;
    const temData = ["data", "nascimento", "fundacao", "parceria"].some((p) => papeis.has(p as Papel));
    const identifica = papeis.has("cliente") || (papeis.has("nome") && (papeis.has("cnpj") || (abaDeClientes && temData)));
    if (identifica && (papeis.has("cnpj") || temData)) return { linha: r, papeis, colunas, ignoradas, outras };
  }
  return null;
}

const VAZIOS = new Set(["", "naotem", "naoinformado", "naoha", "semcontato", "semdata", "semdados", "sem", "na", "nd", "semregistro", "nenhum", "nenhuma", "inexistente"]);

function texto(row: ExcelJS.Row, col: number | undefined): string | null {
  if (!col) return null;
  const t = textoDeValor(valorCru(row.getCell(col)));
  if (t == null) return null;
  const limpo = t.replace(/\s+/g, " ").trim();
  return VAZIOS.has(normalizarTexto(limpo)) ? null : limpo;
}

function data(row: ExcelJS.Row, col: number | undefined, rotulo: string): { data: DataISO | null; erro: string | null } {
  if (!col) return { data: null, erro: null };
  const bruto = valorCru(row.getCell(col));
  if (bruto == null) return { data: null, erro: null };
  if (typeof bruto === "string") {
    const t = bruto.trim();
    if (VAZIOS.has(normalizarTexto(t))) return { data: null, erro: null };
    try {
      return { data: lerData(t), erro: null };
    } catch (e) {
      const motivo = e instanceof Error && /completa/.test(e.message) ? "informe a data completa (DD/MM/AAAA)" : "data inválida";
      return { data: null, erro: `${rotulo}: "${t}" — ${motivo}.` };
    }
  }
  const r = dataDeValor(bruto, false);
  return { data: r.data, erro: r.erro ? `${rotulo}: ${r.erro}.` : null };
}

const MESES_TEXTO: Record<string, number> = {
  jan: 1, janeiro: 1, fev: 2, fevereiro: 2, mar: 3, marco: 3, abr: 4, abril: 4, mai: 5, maio: 5, jun: 6, junho: 6,
  jul: 7, julho: 7, ago: 8, agosto: 8, set: 9, setembro: 9, out: 10, outubro: 10, nov: 11, novembro: 11, dez: 12, dezembro: 12,
};

/**
 * Início GCF: "03/2025", "3/2025", "2025-03", "mar/25", "março de 2025" → só mês e ano (o dia não é inventado);
 * "15/03/2025" ou célula de data com dia → data completa.
 */
export function lerInicio(bruto: unknown, numFmt?: string): { data: DataISO | null; precisao: "DIA" | "MES"; erro: string | null } {
  const vazio = { data: null, precisao: "DIA" as const, erro: null };
  if (bruto == null || bruto === "") return vazio;
  if (bruto instanceof Date || typeof bruto === "number") {
    const r = dataDeValor(bruto, false);
    if (!r.data) return { ...vazio, erro: r.erro ? `Início GCF: ${r.erro}.` : null };
    // Célula formatada sem o dia (ex.: "mmm/aa") → só mês e ano
    const semDia = !!numFmt && !/d/i.test(numFmt.replace(/"[^"]*"/g, "")) && /m/i.test(numFmt);
    return semDia ? { data: `${r.data.slice(0, 7)}-01`, precisao: "MES", erro: null } : { data: r.data, precisao: "DIA", erro: null };
  }
  const t = String(bruto).trim();
  if (VAZIOS.has(normalizarTexto(t))) return vazio;
  const mesAno = (mes: number, ano: number) =>
    mes >= 1 && mes <= 12 && ano >= 1900 && ano <= 2200 ? { data: montar(ano, mes, 1), precisao: "MES" as const, erro: null } : null;
  let m = /^(\d{1,2})\s*[/.-]\s*(\d{4})$/.exec(t);
  if (m) return mesAno(Number(m[1]), Number(m[2])) ?? { ...vazio, erro: `Início GCF: "${t}" não é um mês válido.` };
  m = /^(\d{4})\s*[/.-]\s*(\d{1,2})$/.exec(t);
  if (m) return mesAno(Number(m[2]), Number(m[1])) ?? { ...vazio, erro: `Início GCF: "${t}" não é um mês válido.` };
  m = /^(\d{1,2})\s*[/.-]\s*(\d{2})$/.exec(t);
  if (m && Number(m[2]) > 12) return mesAno(Number(m[1]), 2000 + Number(m[2])) ?? { ...vazio, erro: `Início GCF: "${t}" não é um mês válido.` };
  m = /^([a-zà-ú]+)\.?\s*(?:de\s+|[/.-]\s*)?(\d{2}|\d{4})$/i.exec(t);
  if (m) {
    const mes = MESES_TEXTO[normalizarTexto(m[1])];
    const ano = m[2].length === 2 ? 2000 + Number(m[2]) : Number(m[2]);
    if (mes) return mesAno(mes, ano)!;
  }
  try {
    return { data: lerData(t), precisao: "DIA", erro: null };
  } catch {
    return { ...vazio, erro: `Início GCF: "${t}" — use mês/ano (MM/AAAA) ou a data completa.` };
  }
}

function situacaoDe(v: string | null): "ATIVO" | "INATIVO" | null {
  const n = normalizarTexto(v ?? "");
  if (["ativo", "ativa", "sim", "s", "clienteativo", "emdia"].includes(n)) return "ATIVO";
  if (/^(inativ|encerrad|cancelad|baixad|desativad|suspens|rescindid|nao$|n$|exclient|excliente)/.test(n)) return "INATIVO";
  return null;
}

function simNao(v: string | null): boolean | null {
  const n = normalizarTexto(v ?? "");
  if (["sim", "s", "x", "true", "1", "verdadeiro"].includes(n)) return true;
  if (["nao", "n", "false", "0", "falso"].includes(n)) return false;
  return null;
}

function ativoEventoDe(v: string | null): boolean | null {
  const n = normalizarTexto(v ?? "");
  if (["ativo", "ativa"].includes(n)) return true;
  if (/^(desativad|inativ)/.test(n)) return false;
  return null;
}

/** Tipo de data informado na planilha → um dos tipos do sistema (ou o texto original, se for outro). */
export function tipoDeTexto(v: string): string {
  const n = normalizarTexto(v);
  const exato = TIPOS_DATA_CLIENTE.find((t) => normalizarTexto(t) === n);
  if (exato) return exato;
  if (n.includes("parceria") || n.includes("iniciodocontrato")) return TIPO_PARCERIA;
  if (n.includes("fundacao") || n.includes("abertura") || n === "aniversariodaempresa") return TIPO_FUNDACAO;
  if (n.includes("socio") || n.includes("responsavel") || n.includes("contato") || n.includes("nascimento")) return TIPO_SOCIO;
  if (n.includes("segmento")) return TIPO_SEGMENTO;
  if (n === "outro" || n === "outros") return TIPO_OUTRO;
  return v.slice(0, 120);
}

/** CNPJ da célula. Números perdem os zeros à esquerda no Excel: são completados para 14 dígitos. */
function cnpjDe(row: ExcelJS.Row, col: number | undefined): { cnpj: string | null; erro: string | null; aviso: string | null } {
  if (!col) return { cnpj: null, erro: null, aviso: null };
  const bruto = valorCru(row.getCell(col));
  let t: string | null;
  if (typeof bruto === "number") t = Number.isInteger(bruto) ? String(bruto).padStart(14, "0") : String(bruto);
  else t = texto(row, col);
  if (!t) return { cnpj: null, erro: null, aviso: null };
  const c = limparCnpj(t);
  if (/^\d{11}$/.test(c)) return { cnpj: null, erro: null, aviso: "CPF informado na coluna de CNPJ: não foi importado (o campo aceita apenas CNPJ)." };
  if (/^\d{12,13}$/.test(c) && cnpjValido(c.padStart(14, "0"))) return { cnpj: formatarCnpj(c.padStart(14, "0")), erro: null, aviso: null };
  if (!cnpjValido(c)) return { cnpj: null, erro: `CNPJ "${t}" inválido. Confira os dígitos.`, aviso: null };
  return { cnpj: formatarCnpj(c), erro: null, aviso: null };
}

function lerAba(ws: ExcelJS.Worksheet, cab: Cabecalho): ClienteLido[] {
  const p = cab.papeis;
  const colIdent = p.get("cliente") ?? p.get("nome");
  // Com coluna de empresa/cliente, a coluna "Nome" é o nome do contato
  const colContato = p.get("contato") ?? (p.has("cliente") ? p.get("nome") : undefined);
  const lidos: ClienteLido[] = [];

  for (let r = cab.linha + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const algum = [...p.values()].some((c) => {
      const v = valorCru(row.getCell(c));
      return v != null && String(v).trim() !== "";
    });
    if (!algum) continue;

    const erros: string[] = [];
    const avisos: string[] = [];
    const obs: string[] = [];

    // Nome do cliente; "30 - EMPRESA X" separa o código
    let nome = texto(row, colIdent);
    let codigo = texto(row, p.get("codigo"));
    const m = nome ? /^\s*(\d{1,8})\s*[-–—]\s*(.+)$/.exec(nome) : null;
    if (m) {
      codigo = codigo ?? m[1];
      nome = m[2].trim();
    }
    const fantasia = texto(row, p.get("fantasia"));
    if (!nome && fantasia) nome = fantasia;
    if (nome && nome.length > 250) {
      erros.push("Nome do cliente com mais de 250 caracteres.");
    }

    const contato = texto(row, colContato);
    const doc = cnpjDe(row, p.get("cnpj"));
    if (doc.erro) erros.push(doc.erro);
    if (doc.aviso) avisos.push(doc.aviso);

    // Situação do cliente (a coluna "Status" só conta quando traz Ativo/Inativo)
    const sitTexto = texto(row, p.get("situacao"));
    let situacao = situacaoDe(sitTexto);
    if (sitTexto && !situacao) avisos.push(`Situação "${sitTexto}" não reconhecida: use Ativo ou Inativo.`);
    if (!situacao && p.has("status")) situacao = situacaoDe(texto(row, p.get("status")));

    // Observações: texto original + contato e nome fantasia (o código e o WhatsApp têm campo próprio)
    const obsOriginal = texto(row, p.get("observacoes"));
    if (contato && !(obsOriginal && contatoDasObservacoes(obsOriginal))) obs.push(`Contato: ${contato}`);
    if (fantasia && fantasia !== nome) obs.push(`Nome fantasia: ${fantasia}`);
    if (obsOriginal) obs.push(obsOriginal);

    // Demais colunas da planilha (Grupo, Inscrição Estadual, Prefeitura…): guardadas como estão
    const extras: Record<string, string> = {};
    for (const o of cab.outras) {
      const v = textoDeValor(valorCru(row.getCell(o.col)));
      if (v) extras[o.cabecalho] = v.replace(/\s+/g, " ").trim().slice(0, 500);
    }

    const zapTexto = texto(row, p.get("whatsapp"));
    const whatsapp = normalizarWhatsapp(zapTexto);
    if (zapTexto && !whatsapp) {
      avisos.push(`WhatsApp "${zapTexto}" inválido (use DDD + celular): não importado no campo WhatsApp.`);
      extras["WhatsApp informado"] = zapTexto;
    }
    let observacoes = obs.join(" · ") || null;
    if (observacoes && observacoes.length > 2000) {
      observacoes = observacoes.slice(0, 2000);
      avisos.push("Observações cortadas em 2.000 caracteres.");
    }

    // Datas
    const colInicio = p.get("parceria");
    const parceria = colInicio ? lerInicio(valorCru(row.getCell(colInicio)), row.getCell(colInicio).numFmt) : { data: null, precisao: "DIA" as const, erro: null };
    const fundacao = data(row, p.get("fundacao"), "Fundação");
    const nascimento = data(row, p.get("nascimento"), "Aniversário");
    const generica = data(row, p.get("data"), "Data do evento");
    const tipoTexto = texto(row, p.get("tipo"));
    const inicio = parceria.data;
    const eventos: EventoClienteLido[] = [];
    const ev = (tipo: string, informado: boolean, dataEvento: DataISO | null, erro: string | null): EventoClienteLido => ({
      tipo_data: tipo,
      tipoInformado: informado,
      data_evento: tipo === TIPO_PARCERIA ? null : dataEvento,
      inicio_parceria: inicio,
      inicio_parceria_precisao: parceria.precisao,
      erro,
    });

    if (tipoTexto) {
      // Uma linha = uma data, com o tipo informado (formato da exportação do sistema)
      const tipo = tipoDeTexto(tipoTexto);
      if (tipo === TIPO_PARCERIA) {
        eventos.push(ev(tipo, true, null, parceria.erro));
        if (!inicio && generica.data) eventos[0] = { ...eventos[0], inicio_parceria: generica.data, erro: null };
      } else {
        const especifica = tipo === TIPO_FUNDACAO ? fundacao : tipo === TIPO_SOCIO ? nascimento : { data: null, erro: null };
        const d = generica.data ?? especifica.data;
        const erro = generica.erro ?? especifica.erro ?? (d || inicio ? null : `${tipo}: data não informada.`);
        eventos.push(ev(tipo, true, d, erro ?? parceria.erro));
      }
    } else {
      // Sem coluna de tipo: cada coluna de data vira uma data do cliente
      const outraData = fundacao.data || fundacao.erro || nascimento.data || nascimento.erro || generica.data || generica.erro;
      if (inicio || parceria.erro || (colInicio && !outraData)) eventos.push(ev(TIPO_PARCERIA, true, null, parceria.erro));
      if (fundacao.data || fundacao.erro) eventos.push(ev(TIPO_FUNDACAO, true, fundacao.data, fundacao.erro));
      if (nascimento.data || nascimento.erro) eventos.push(ev(TIPO_SOCIO, true, nascimento.data, nascimento.erro));
      if (generica.data || generica.erro) eventos.push(ev(TIPO_OUTRO, false, generica.data, generica.erro));
    }

    lidos.push({
      aba: ws.name,
      linha: r,
      cliente_nome: nome,
      cnpj: doc.cnpj,
      contato,
      codigo,
      whatsapp,
      tributacao: texto(row, p.get("tributacao")),
      responsavel_fiscal: texto(row, p.get("respFiscal")),
      responsavel_contabil: texto(row, p.get("respContabil")),
      responsavel_dp: texto(row, p.get("respDp")),
      dados_extras: extras,
      situacao_cliente: situacao,
      recorrente: simNao(texto(row, p.get("recorrente"))),
      ativo: ativoEventoDe(texto(row, p.get("ativoEvento"))),
      observacoes,
      eventos,
      erros: nome ? erros : ["Nome ou razão social não informado.", ...erros],
      avisos,
    });
  }
  return lidos;
}

/**
 * Procura relações de clientes em todas as abas do arquivo (menos as indicadas em `ignorar`,
 * a aba Base de funcionários e as abas de cálculo/instruções).
 */
export function lerClientesDoWorkbook(wb: ExcelJS.Workbook, ignorar: ExcelJS.Worksheet[] = []): LeituraClientes {
  const abas: AbaClientes[] = [];
  const clientes: ClienteLido[] = [];
  for (const ws of wb.worksheets) {
    if (ignorar.includes(ws)) continue;
    const n = normalizarTexto(ws.name);
    if (ABAS_IGNORADAS.some((x) => n.startsWith(x))) continue;
    const cab = encontrarCabecalhoClientes(ws);
    if (!cab) continue;
    const lidos = lerAba(ws, cab);
    abas.push({
      nome: ws.name,
      linhaCabecalho: cab.linha,
      colunas: [...cab.colunas, ...cab.outras.map((o) => ({ papel: "Outras informações", cabecalho: o.cabecalho, coluna: letraColuna(o.col) }))],
      ignoradas: cab.ignoradas,
      linhas: lidos.length,
    });
    clientes.push(...lidos);
  }
  const avisos: string[] = [];
  if (abas.length > 1) avisos.push(`Clientes lidos de ${abas.length} abas: ${abas.map((a) => a.nome).join(", ")}.`);
  return { abas, clientes, avisos };
}
