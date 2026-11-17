import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { analisarImagem, formatarTamanho, identificarFormato, motivoImagemRecusada } from "@/lib/domain/imagem";

function png(largura: number, altura: number): Uint8Array {
  const b = new Uint8Array(33);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(b.buffer).setUint32(16, largura);
  new DataView(b.buffer).setUint32(20, altura);
  return b;
}

function jpg(largura: number, altura: number): Uint8Array {
  // SOI, APP0 (16 bytes), SOF0 com altura e largura, EOI
  const app0 = [0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00];
  const sof = [0xff, 0xc0, 0x00, 0x11, 0x08, altura >> 8, altura & 255, largura >> 8, largura & 255, 0x03, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1];
  return new Uint8Array([0xff, 0xd8, ...app0, ...sof, 0xff, 0xd9]);
}

describe("Imagem de felicitação", () => {
  it("reconhece PNG e JPG pelo conteúdo e lê as dimensões", () => {
    expect(analisarImagem(png(1080, 1350))).toEqual({ tipo: "image/png", extensao: "png", largura: 1080, altura: 1350 });
    expect(analisarImagem(jpg(800, 600))).toEqual({ tipo: "image/jpeg", extensao: "jpg", largura: 800, altura: 600 });
  });

  it("recusa outros formatos e arquivos corrompidos", () => {
    expect(analisarImagem(new TextEncoder().encode("isto não é uma imagem"))).toBeNull();
    expect(analisarImagem(new TextEncoder().encode("GIF89a........................"))).toBeNull();
    expect(analisarImagem(png(0, 10))).toBeNull();
    expect(analisarImagem(png(10, 10).slice(0, 20))).toBeNull();
    expect(analisarImagem(new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0, 2, 0, 0, 0, 0, 0, 0]))).toBeNull();
  });

  it.skipIf(!existsSync("/home/claude/e2e/imagens/felicitacao_teste.jpg"))("arquivos reais gerados por editor de imagem", () => {
    expect(analisarImagem(readFileSync("/home/claude/e2e/imagens/felicitacao_teste.png"))).toMatchObject({ tipo: "image/png", largura: 1080, altura: 1080 });
    expect(analisarImagem(readFileSync("/home/claude/e2e/imagens/felicitacao_teste.jpg"))).toMatchObject({ tipo: "image/jpeg", largura: 1080, altura: 1080 });
    expect(analisarImagem(readFileSync("/home/claude/e2e/imagens/grande.jpg"))).toMatchObject({ tipo: "image/jpeg", largura: 3000, altura: 3000 });
  });

  it("JPG com bytes fora do padrão entre os blocos ainda é lido", () => {
    const j = jpg(640, 480);
    // lixo entre o APP0 e o SOF (alguns editores e câmeras gravam assim)
    const comLixo = new Uint8Array([...j.slice(0, 20), 0x00, 0x13, 0x37, ...j.slice(20)]);
    expect(analisarImagem(comLixo)).toEqual({ tipo: "image/jpeg", extensao: "jpg", largura: 640, altura: 480 });
  });

  it("diz o formato real quando o arquivo não é PNG nem JPG", () => {
    const webp = new Uint8Array([...new TextEncoder().encode("RIFF"), 0, 0, 0, 0, ...new TextEncoder().encode("WEBPVP8 ")]);
    expect(identificarFormato(webp)).toBe("WebP");
    expect(motivoImagemRecusada(webp, "fcb8c9a1-9b95.png")).toBe("Este arquivo é WebP (mesmo com o nome .png), não PNG nem JPG.");
    expect(identificarFormato(new TextEncoder().encode("GIF89a......"))).toBe("GIF");
    expect(identificarFormato(new Uint8Array([0, 0, 0, 0x18, ...new TextEncoder().encode("ftypheic")]))).toBe("HEIC");
    expect(identificarFormato(new TextEncoder().encode('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBe("SVG");
    expect(motivoImagemRecusada(new TextEncoder().encode("texto qualquer"), "a.png")).toBe("Este arquivo não é uma imagem PNG ou JPG.");
    expect(identificarFormato(png(10, 10))).toBe("PNG");
    expect(identificarFormato(jpg(10, 10))).toBe("JPG");
  });

  it.skipIf(!existsSync("/home/claude/e2e/imagens/webp_com_nome_png.png"))("WebP real salvo com nome .png", () => {
    const b = readFileSync("/home/claude/e2e/imagens/webp_com_nome_png.png");
    expect(analisarImagem(b)).toBeNull();
    expect(identificarFormato(b)).toBe("WebP");
  });

  it("tamanho legível", () => {
    expect(formatarTamanho(512)).toBe("512 bytes");
    expect(formatarTamanho(36970)).toBe("36 KB");
    expect(formatarTamanho(5 * 1024 * 1024)).toBe("5,0 MB");
  });
});
