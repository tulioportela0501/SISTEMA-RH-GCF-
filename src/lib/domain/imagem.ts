/**
 * Imagem padrão de felicitação: só PNG ou JPG, reconhecidos pelo conteúdo do arquivo (não pela extensão).
 */

export const LIMITE_IMAGEM = 5 * 1024 * 1024; // 5 MB

export type TipoImagem = "image/png" | "image/jpeg";

export interface InfoImagem {
  tipo: TipoImagem;
  extensao: "png" | "jpg";
  largura: number;
  altura: number;
}

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function u16(b: Uint8Array, i: number): number {
  return (b[i] << 8) | b[i + 1];
}

function u32(b: Uint8Array, i: number): number {
  return ((b[i] << 24) >>> 0) + ((b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]);
}

/** Tipo e dimensões de um PNG ou JPG; null para qualquer outro conteúdo ou arquivo corrompido. */
export function analisarImagem(b: Uint8Array): InfoImagem | null {
  if (b.length >= 24 && PNG.every((v, i) => b[i] === v)) {
    // Primeiro bloco obrigatório: IHDR (largura e altura)
    if (String.fromCharCode(b[12], b[13], b[14], b[15]) !== "IHDR") return null;
    const largura = u32(b, 16);
    const altura = u32(b, 20);
    return largura > 0 && altura > 0 ? { tipo: "image/png", extensao: "png", largura, altura } : null;
  }
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
    const d = dimensoesJpeg(b) ?? dimensoesJpegPorVarredura(b);
    return d ? { tipo: "image/jpeg", extensao: "jpg", ...d } : null;
  }
  return null;
}

/** Leitura normal dos blocos do JPG até o cabeçalho com as dimensões (SOF). */
function dimensoesJpeg(b: Uint8Array): { largura: number; altura: number } | null {
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) return null;
    const marcador = b[i + 1];
    if (marcador === 0xff) {
      i++; // preenchimento
      continue;
    }
    if (marcador === 0xd8 || marcador === 0x01 || (marcador >= 0xd0 && marcador <= 0xd7)) {
      i += 2;
      continue;
    }
    if (marcador === 0xd9 || marcador === 0xda) return null; // fim ou dados da imagem antes do cabeçalho de dimensões
    const tamanho = u16(b, i + 2);
    if (tamanho < 2) return null;
    // SOF0–SOF15 (exceto DHT, JPG e DAC) trazem altura e largura
    if (marcador >= 0xc0 && marcador <= 0xcf && marcador !== 0xc4 && marcador !== 0xc8 && marcador !== 0xcc) {
      const altura = u16(b, i + 5);
      const largura = u16(b, i + 7);
      return largura > 0 && altura > 0 ? { largura, altura } : null;
    }
    i += 2 + tamanho;
  }
  return null;
}

/** JPG gerado por alguns programas com bytes fora do padrão entre os blocos: procura o SOF pelo arquivo. */
function dimensoesJpegPorVarredura(b: Uint8Array): { largura: number; altura: number } | null {
  for (let i = 2; i + 9 < b.length; i++) {
    if (b[i] !== 0xff) continue;
    const m = b[i + 1];
    if (m < 0xc0 || m > 0xcf || m === 0xc4 || m === 0xc8 || m === 0xcc) continue;
    const tamanho = u16(b, i + 2);
    const precisao = b[i + 4];
    if (tamanho < 11 || (precisao !== 8 && precisao !== 12 && precisao !== 16)) continue;
    const altura = u16(b, i + 5);
    const largura = u16(b, i + 7);
    if (largura > 0 && altura > 0) return { largura, altura };
  }
  return null;
}

/** Formato real do arquivo pelo conteúdo (para explicar quando não é PNG nem JPG). */
export function identificarFormato(b: Uint8Array): string | null {
  const txt = (i: number, n: number) => String.fromCharCode(...b.subarray(i, i + n));
  if (b.length >= 8 && PNG.every((v, i) => b[i] === v)) return "PNG";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "JPG";
  if (b.length >= 12 && txt(0, 4) === "RIFF" && txt(8, 4) === "WEBP") return "WebP";
  if (b.length >= 6 && txt(0, 4) === "GIF8") return "GIF";
  if (b.length >= 2 && txt(0, 2) === "BM") return "BMP";
  if (b.length >= 12 && txt(4, 4) === "ftyp") {
    const marca = txt(8, 4);
    if (/^avi[fs]$/.test(marca)) return "AVIF";
    if (/^(hei[cmsx]|hev[cmsx]|mif1|msf1)$/.test(marca)) return "HEIC";
  }
  if (b.length >= 4 && ((b[0] === 0x49 && b[1] === 0x49 && b[2] === 0x2a) || (b[0] === 0x4d && b[1] === 0x4d && b[3] === 0x2a))) return "TIFF";
  const inicio = txt(0, Math.min(b.length, 200)).trimStart().toLowerCase();
  if (inicio.startsWith("<svg") || (inicio.startsWith("<?xml") && inicio.includes("<svg"))) return "SVG";
  if (b.length >= 4 && txt(0, 4) === "%PDF") return "PDF";
  return null;
}

export function formatarTamanho(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

/** Explica por que o arquivo não foi aceito, dizendo o formato real quando é outro. */
export function motivoImagemRecusada(b: Uint8Array, nomeArquivo = ""): string {
  const formato = identificarFormato(b);
  const ext = /\.([a-z0-9]+)$/i.exec(nomeArquivo)?.[1]?.toUpperCase() ?? "";
  if (!formato) return "Este arquivo não é uma imagem PNG ou JPG.";
  if (formato === "PNG" || formato === "JPG") return `O arquivo ${formato} está danificado ou incompleto. Abra a imagem e salve de novo como PNG ou JPG.`;
  const nome = ext && ext !== formato && !(ext === "JPEG" && formato === "JPG") ? ` (mesmo com o nome .${ext.toLowerCase()})` : "";
  return `Este arquivo é ${formato}${nome}, não PNG nem JPG.`;
}
