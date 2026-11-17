"use client";

/**
 * Área de transferência no navegador (Clipboard API).
 * - Copiar imagem: só funciona em ambiente seguro (HTTPS ou http://localhost) e nos navegadores que aceitam
 *   imagens na área de transferência (Chrome e Edge aceitam PNG). Copia a IMAGEM em si, não o endereço.
 * - Nada é anexado automaticamente no WhatsApp: o funcionário cola (Ctrl+V) na conversa.
 */

export type MotivoFalhaCopia = "inseguro" | "sem-suporte" | "negado" | "erro";

export class FalhaCopia extends Error {
  constructor(
    public motivo: MotivoFalhaCopia,
    message: string,
  ) {
    super(message);
  }
}

/** Por que a cópia de imagem não está disponível aqui (null = disponível). */
export function copiaDeImagemIndisponivel(): MotivoFalhaCopia | null {
  if (typeof window === "undefined") return "sem-suporte";
  if (!window.isSecureContext) return "inseguro";
  if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") return "sem-suporte";
  if (typeof ClipboardItem.supports === "function" && !ClipboardItem.supports("image/png")) return "sem-suporte";
  return null;
}

export const MENSAGENS_FALHA: Record<MotivoFalhaCopia, string> = {
  inseguro: "Este endereço não é seguro (HTTPS ou localhost), então o navegador bloqueia a cópia de imagens.",
  "sem-suporte": "Este navegador não permite copiar imagens.",
  negado: "O navegador não deu permissão para copiar a imagem.",
  erro: "Não foi possível copiar a imagem.",
};

/** Converte para PNG (formato aceito pela área de transferência) e reduz imagens muito grandes. */
export async function paraPng(blob: Blob, maiorLado = 2048): Promise<Blob> {
  const bitmap = await createImageBitmap(blob);
  try {
    const escala = Math.min(1, maiorLado / Math.max(bitmap.width, bitmap.height));
    if (blob.type === "image/png" && escala === 1) return blob;
    const largura = Math.max(1, Math.round(bitmap.width * escala));
    const altura = Math.max(1, Math.round(bitmap.height * escala));
    const canvas = document.createElement("canvas");
    canvas.width = largura;
    canvas.height = altura;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas indisponível.");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, largura, altura);
    return await new Promise<Blob>((ok, erro) => canvas.toBlob((b) => (b ? ok(b) : erro(new Error("Falha ao gerar o PNG."))), "image/png"));
  } finally {
    bitmap.close();
  }
}

/**
 * Copia a imagem (PNG) para a área de transferência.
 * Recebe uma Promise para que a cópia comece ainda dentro do clique do usuário (exigência dos navegadores).
 */
export async function copiarImagem(png: Promise<Blob>): Promise<void> {
  const indisponivel = copiaDeImagemIndisponivel();
  if (indisponivel) throw new FalhaCopia(indisponivel, MENSAGENS_FALHA[indisponivel]);
  try {
    await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
  } catch (e) {
    const nome = e instanceof DOMException ? e.name : "";
    throw new FalhaCopia(nome === "NotAllowedError" || nome === "SecurityError" ? "negado" : "erro", MENSAGENS_FALHA[nome === "NotAllowedError" || nome === "SecurityError" ? "negado" : "erro"]);
  }
}

/** Copia texto. Usa a Clipboard API e, se não houver, a seleção do documento. */
export async function copiarTexto(texto: string): Promise<void> {
  if (window.isSecureContext && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(texto);
      return;
    } catch {
      // tenta o método antigo abaixo
    }
  }
  const area = document.createElement("textarea");
  area.value = texto;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.select();
  const ok = document.execCommand("copy");
  area.remove();
  if (!ok) throw new FalhaCopia("erro", "Não foi possível copiar a mensagem. Selecione o texto e use Ctrl+C.");
}
