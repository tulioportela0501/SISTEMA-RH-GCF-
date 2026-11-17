/**
 * Arquivos CSV (planilha geral de clientes exportada de outros sistemas).
 * - Separador detectado pela primeira linha: ponto e vírgula (padrão no Brasil), vírgula ou tabulação.
 * - Aspas, aspas duplicadas e quebras de linha dentro de aspas.
 * - Codificação UTF-8 (com ou sem BOM) ou Windows-1252 (CSV salvo pelo Excel em português).
 * O conteúdo vira uma planilha ExcelJS para usar a mesma leitura do .xlsx.
 */
import ExcelJS from "exceljs";

export function decodificarTexto(buf: Uint8Array): string {
  let texto: string;
  try {
    texto = new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    texto = new TextDecoder("windows-1252").decode(buf);
  }
  return texto.replace(/^﻿/, "");
}

function detectarSeparador(texto: string): string {
  const primeira = texto.slice(0, texto.search(/\r?\n/) === -1 ? texto.length : texto.search(/\r?\n/));
  const fora = primeira.replace(/"[^"]*"/g, "");
  const contagem = [";", ",", "\t"].map((s) => [s, fora.split(s).length - 1] as const).sort((a, b) => b[1] - a[1]);
  return contagem[0][1] > 0 ? contagem[0][0] : ";";
}

/** Lê o CSV em linhas e colunas (RFC 4180, com o separador detectado). */
export function lerCsvTexto(texto: string, separador = detectarSeparador(texto)): string[][] {
  const linhas: string[][] = [];
  let linha: string[] = [];
  let campo = "";
  let aspas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (aspas) {
      if (c === '"') {
        if (texto[i + 1] === '"') {
          campo += '"';
          i++;
        } else aspas = false;
      } else campo += c;
      continue;
    }
    if (c === '"' && campo === "") aspas = true;
    else if (c === separador) {
      linha.push(campo);
      campo = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && texto[i + 1] === "\n") i++;
      linha.push(campo);
      linhas.push(linha);
      linha = [];
      campo = "";
    } else campo += c;
  }
  if (campo !== "" || linha.length) {
    linha.push(campo);
    linhas.push(linha);
  }
  return linhas.filter((l) => l.some((v) => v.trim() !== ""));
}

/** CSV → planilha ExcelJS (uma aba). Os valores ficam como texto, exatamente como no arquivo. */
export function workbookDoCsv(buf: Uint8Array, nomeAba = "CSV"): ExcelJS.Workbook {
  const linhas = lerCsvTexto(decodificarTexto(buf));
  if (linhas.length === 0) throw new Error("O arquivo CSV está vazio.");
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(nomeAba.replace(/[\\/?*[\]:]/g, " ").slice(0, 31) || "CSV");
  for (const l of linhas) ws.addRow(l.map((v) => (v.trim() === "" ? null : v.trim())));
  return wb;
}
