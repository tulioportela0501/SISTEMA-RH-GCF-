"use client";

import { LIMITE_IMAGEM, analisarImagem, formatarTamanho, identificarFormato } from "@/lib/domain/imagem";

export interface ImagemPreparada {
  arquivo: File;
  /** Formato original, quando foi preciso converter (ex.: "WebP") */
  convertidaDe: string | null;
  /** A imagem foi reduzida para caber no limite */
  reduzida: boolean;
}

function semExtensao(nome: string): string {
  return nome.replace(/\.[^.]*$/, "") || "felicitacao";
}

function gerar(canvas: HTMLCanvasElement, tipo: "image/png" | "image/jpeg", qualidade?: number): Promise<Blob> {
  return new Promise((ok, erro) => canvas.toBlob((b) => (b ? ok(b) : erro(new Error("Não foi possível converter a imagem."))), tipo, qualidade));
}

/**
 * Deixa a imagem pronta para o envio, no próprio navegador:
 * - PNG ou JPG dentro do limite: vai como está.
 * - Outros formatos que o navegador consegue abrir (WebP, GIF, BMP, AVIF…), inclusive com o nome errado
 *   (ex.: WebP salvo como .png): converte para PNG.
 * - Imagem acima de 5 MB: reduz e converte para JPG.
 */
export async function prepararImagemParaEnvio(arquivo: File): Promise<ImagemPreparada> {
  const bytes = new Uint8Array(await arquivo.arrayBuffer());
  const formato = identificarFormato(bytes);
  if (analisarImagem(bytes) && bytes.length <= LIMITE_IMAGEM) return { arquivo, convertidaDe: null, reduzida: false };

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(new Blob([bytes]));
  } catch {
    if (formato === "HEIC") throw new Error("Esta imagem é HEIC (foto de iPhone), que o navegador não abre. Salve como JPG ou PNG e envie de novo.");
    if (formato === "SVG" || formato === "PDF") throw new Error(`Este arquivo é ${formato}. Exporte como PNG ou JPG e envie de novo.`);
    throw new Error(formato ? `Não foi possível abrir esta imagem (${formato}). Salve como PNG ou JPG e envie de novo.` : "Este arquivo não é uma imagem. Envie um PNG ou JPG.");
  }
  try {
    const grande = bytes.length > LIMITE_IMAGEM;
    const nome = semExtensao(arquivo.name);
    for (const maiorLado of grande ? [2400, 1800, 1280] : [4096, 2400, 1800]) {
      const escala = Math.min(1, maiorLado / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * escala));
      canvas.height = Math.max(1, Math.round(bitmap.height * escala));
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Não foi possível converter a imagem neste navegador.");
      ctx.imageSmoothingQuality = "high";
      if (!grande) {
        ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        const png = await gerar(canvas, "image/png");
        if (png.size <= LIMITE_IMAGEM) return { arquivo: new File([png], `${nome}.png`, { type: "image/png" }), convertidaDe: formato ?? "imagem", reduzida: escala < 1 };
      }
      // JPG não tem transparência: fundo branco
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const jpg = await gerar(canvas, "image/jpeg", 0.9);
      if (jpg.size <= LIMITE_IMAGEM) return { arquivo: new File([jpg], `${nome}.jpg`, { type: "image/jpeg" }), convertidaDe: formato === "JPG" ? null : (formato ?? "imagem"), reduzida: true };
    }
    throw new Error(`Imagem muito grande. Reduza para menos de ${formatarTamanho(LIMITE_IMAGEM)} e envie de novo.`);
  } finally {
    bitmap.close();
  }
}
