"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Download, ExternalLink, ImageIcon, ImageOff, Trash2, Upload } from "lucide-react";
import { Botao, cx } from "@/components/ui";
import { useAvisos } from "@/components/avisos";
import { api, baixar } from "@/lib/cliente/api";
import { prepararImagemParaEnvio } from "@/lib/cliente/imagem";
import { FUSO } from "@/lib/domain/datas";
import { LIMITE_IMAGEM, formatarTamanho } from "@/lib/domain/imagem";
import type { ImagemFelicitacaoInfo } from "@/lib/server/imagem-felicitacao";
import { urlImagem } from "./preparar-felicitacao";

const quando = (d: string) => new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, dateStyle: "short", timeStyle: "short" }).format(new Date(d)).replace(",", " às");

const temArquivo = (e: React.DragEvent | DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");

/**
 * Imagem padrão de felicitação: ver (todos); cadastrar, substituir e remover (administrador).
 * O administrador pode clicar, arrastar o arquivo para o cartão ou colar (Ctrl+V) uma imagem copiada.
 */
export function ImagemFelicitacao({ imagem, perfil }: { imagem: ImagemFelicitacaoInfo | null; perfil: "ADMIN" | "USUARIO" }) {
  const router = useRouter();
  const avisar = useAvisos();
  const entrada = useRef<HTMLInputElement>(null);
  const contador = useRef(0);
  const [arrastando, setArrastando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [confirmarRemocao, setConfirmarRemocao] = useState(false);
  const [removendo, setRemovendo] = useState(false);
  const admin = perfil === "ADMIN";

  // Arquivo solto fora do cartão: o navegador não abre a imagem nem sai da página
  useEffect(() => {
    if (!admin) return;
    const bloquear = (e: DragEvent) => {
      if (temArquivo(e)) e.preventDefault();
    };
    window.addEventListener("dragover", bloquear);
    window.addEventListener("drop", bloquear);
    return () => {
      window.removeEventListener("dragover", bloquear);
      window.removeEventListener("drop", bloquear);
    };
  }, [admin]);

  async function enviar(arquivo: File) {
    setEnviando(true);
    try {
      const pronta = await prepararImagemParaEnvio(arquivo);
      const fd = new FormData();
      fd.append("arquivo", pronta.arquivo);
      await api("/api/felicitacoes/imagem", { formData: fd });
      const detalhe = pronta.convertidaDe ? ` A imagem era ${pronta.convertidaDe} e foi convertida para ${pronta.arquivo.type === "image/png" ? "PNG" : "JPG"}.` : pronta.reduzida ? " A imagem foi reduzida para caber no limite." : "";
      avisar("sucesso", `${imagem ? "Imagem de felicitação substituída." : "Imagem de felicitação cadastrada."}${detalhe}`);
      router.refresh();
    } catch (e) {
      avisar("erro", e instanceof Error ? e.message : "Não foi possível enviar a imagem.");
    } finally {
      setEnviando(false);
      if (entrada.current) entrada.current.value = "";
    }
  }

  async function remover() {
    if (!imagem) return;
    setRemovendo(true);
    try {
      await api("/api/felicitacoes/imagem", { metodo: "DELETE", corpo: { versao: imagem.versao } });
      avisar("sucesso", "Imagem de felicitação removida.");
      setConfirmarRemocao(false);
      router.refresh();
    } catch (e) {
      avisar("erro", e instanceof Error ? e.message : "Não foi possível remover a imagem.");
    } finally {
      setRemovendo(false);
    }
  }

  const eventosArrastar = admin
    ? {
        onDragEnter: (e: React.DragEvent) => {
          if (!temArquivo(e)) return;
          e.preventDefault();
          contador.current++;
          setArrastando(true);
        },
        onDragOver: (e: React.DragEvent) => {
          if (!temArquivo(e)) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
        },
        onDragLeave: () => {
          contador.current = Math.max(0, contador.current - 1);
          if (contador.current === 0) setArrastando(false);
        },
        onDrop: (e: React.DragEvent) => {
          e.preventDefault();
          contador.current = 0;
          setArrastando(false);
          const arquivo = e.dataTransfer.files?.[0];
          if (arquivo) void enviar(arquivo);
          else avisar("erro", "Arraste o arquivo da imagem a partir de uma pasta do computador (Explorador de Arquivos).");
        },
        onPaste: (e: React.ClipboardEvent) => {
          const arquivo = Array.from(e.clipboardData.files).find((f) => f.type.startsWith("image/"));
          if (!arquivo) return;
          e.preventDefault();
          void enviar(arquivo);
        },
      }
    : {};

  return (
    <section
      aria-label="Imagem de felicitação"
      tabIndex={admin ? -1 : undefined}
      className={cx(
        "relative rounded-xl border bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] outline-none transition-colors",
        arrastando ? "border-azul-500 ring-4 ring-azul-100" : "border-borda",
      )}
      {...eventosArrastar}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-texto">
            <ImageIcon className="size-5 text-azul-600" /> Imagem de felicitação
          </h2>
          <p className="mt-0.5 text-[13px] text-texto-suave">
            Usada em “Preparar felicitação com imagem”. PNG ou JPG até {formatarTamanho(LIMITE_IMAGEM)} (WebP, GIF e outras são convertidas).
          </p>
        </div>
        {admin && (
          <>
            <input
              ref={entrada}
              type="file"
              accept="image/*"
              className="hidden"
              aria-label="Selecionar imagem de felicitação"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void enviar(f);
              }}
            />
            {imagem && (
              <Botao tamanho="sm" icone={<Upload className="size-4 shrink-0" />} carregando={enviando} onClick={() => entrada.current?.click()}>
                Substituir imagem
              </Botao>
            )}
          </>
        )}
      </div>

      {imagem ? (
        <div className="mt-3 flex flex-col gap-3 sm:flex-row">
          <a href={urlImagem(imagem)} target="_blank" rel="noopener noreferrer" className="shrink-0" title="Ver em tamanho real">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={urlImagem(imagem)} alt="Imagem de felicitação cadastrada" className="h-40 w-full rounded-lg border border-borda bg-fundo object-contain sm:w-56" />
          </a>
          <div className="flex min-w-0 flex-col gap-1 text-[13px]">
            <p className="truncate font-medium text-texto" title={imagem.nome}>
              {imagem.nome}
            </p>
            <p className="numeros text-texto-suave">
              {imagem.largura} × {imagem.altura} px · {formatarTamanho(imagem.tamanho)} · {imagem.tipo === "image/png" ? "PNG" : "JPG"}
            </p>
            <p className="text-texto-suave">
              Atualizada em {quando(imagem.atualizado_em)}
              {imagem.atualizado_por_nome ? ` por ${imagem.atualizado_por_nome}` : ""}
            </p>
            {admin && <p className="text-xs text-texto-fraco">Para trocar, arraste outra imagem para este cartão.</p>}
            <div className="mt-auto flex flex-wrap gap-2 pt-2">
              <a href={urlImagem(imagem)} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-[13px] text-azul-700 hover:bg-azul-50">
                <ExternalLink className="size-4" aria-hidden /> Ver
              </a>
              <Botao tamanho="sm" variante="fantasma" icone={<Download className="size-4 shrink-0" />} onClick={() => baixar("/api/felicitacoes/imagem?download=1").catch((e) => avisar("erro", e instanceof Error ? e.message : "Não foi possível baixar."))}>
                Baixar
              </Botao>
              {admin &&
                (confirmarRemocao ? (
                  <span className="flex items-center gap-2">
                    <Botao tamanho="sm" variante="perigo" carregando={removendo} onClick={remover}>
                      Confirmar remoção
                    </Botao>
                    <Botao tamanho="sm" variante="fantasma" onClick={() => setConfirmarRemocao(false)}>
                      Cancelar
                    </Botao>
                  </span>
                ) : (
                  <Botao tamanho="sm" variante="fantasma" className="text-vermelho-600 hover:text-vermelho-600" icone={<Trash2 className="size-4 shrink-0" />} onClick={() => setConfirmarRemocao(true)}>
                    Remover
                  </Botao>
                ))}
            </div>
          </div>
        </div>
      ) : admin ? (
        <button
          type="button"
          onClick={() => entrada.current?.click()}
          disabled={enviando}
          className={cx(
            "mt-3 flex w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-8 text-center text-[13px] transition-colors",
            arrastando ? "border-azul-500 bg-azul-50 text-azul-700" : "border-borda bg-fundo text-texto-suave hover:border-azul-300 hover:bg-azul-50/50",
          )}
        >
          <Upload className="size-6" aria-hidden />
          <span className="font-medium text-texto">{enviando ? "Enviando imagem…" : "Arraste a imagem para cá ou clique para escolher"}</span>
          <span>PNG ou JPG · WebP e outros formatos são convertidos automaticamente</span>
        </button>
      ) : (
        <div className="mt-3 flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-borda bg-fundo px-4 py-8 text-center text-[13px] text-texto-suave">
          <ImageOff className="size-6" aria-hidden />
          Nenhuma imagem cadastrada. Peça a um administrador para cadastrar.
        </div>
      )}

      {arrastando && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-xl bg-azul-50/90 text-sm font-semibold text-azul-700">
          {imagem ? "Solte para substituir a imagem" : "Solte a imagem aqui"}
        </div>
      )}
      {enviando && imagem && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-xl bg-white/80 text-sm font-medium text-texto">Enviando imagem…</div>
      )}
    </section>
  );
}
