"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, FileDown, FileSpreadsheet } from "lucide-react";
import { Botao, cx } from "@/components/ui";
import { useAvisos } from "@/components/avisos";
import { ErroApi, baixar } from "@/lib/cliente/api";

export interface OpcaoExportar {
  rotulo: string;
  descricao?: string;
  url: string;
  /** Mostra a opção desabilitada (ex.: nenhum registro) */
  desabilitada?: boolean;
}

/** Baixa a planilha e mostra as mensagens de sucesso ou de erro. */
export function useExportar() {
  const avisar = useAvisos();
  const [baixando, setBaixando] = useState<string | null>(null);
  async function exportar(url: string) {
    if (baixando) return;
    setBaixando(url);
    try {
      await baixar(url);
      avisar("sucesso", "Planilha exportada com sucesso!");
    } catch (e) {
      if (e instanceof ErroApi && e.status === 404) avisar("alerta", e.message || "Nenhum registro encontrado para exportação.");
      else if (!(e instanceof ErroApi && e.status === 401)) avisar("erro", e instanceof Error ? e.message : "Não foi possível exportar a planilha.");
    } finally {
      setBaixando(null);
    }
  }
  return { exportar, baixando };
}

/**
 * Botão "Exportar Excel". Com uma opção, baixa direto; com várias, abre um menu.
 * Funciona com mouse, toque e teclado (Esc fecha o menu).
 */
export function MenuExportar({ opcoes, rotulo = "Exportar Excel", tamanho = "md", className }: { opcoes: OpcaoExportar[]; rotulo?: string; tamanho?: "md" | "sm"; className?: string }) {
  const { exportar, baixando } = useExportar();
  const [aberto, setAberto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const idMenu = useId();

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent | TouchEvent) => ref.current && !ref.current.contains(e.target as Node) && setAberto(false);
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && setAberto(false);
    document.addEventListener("mousedown", fora);
    document.addEventListener("touchstart", fora);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("mousedown", fora);
      document.removeEventListener("touchstart", fora);
      document.removeEventListener("keydown", tecla);
    };
  }, [aberto]);

  if (opcoes.length === 1) {
    return (
      <Botao tamanho={tamanho} className={className} carregando={!!baixando} icone={<FileDown className="size-4 shrink-0" />} onClick={() => exportar(opcoes[0].url)} title={opcoes[0].descricao}>
        {rotulo}
      </Botao>
    );
  }

  return (
    <div ref={ref} className={cx("relative", className)}>
      <Botao
        tamanho={tamanho}
        className="w-full"
        carregando={!!baixando}
        icone={<FileDown className="size-4 shrink-0" />}
        aria-haspopup="menu"
        aria-expanded={aberto}
        aria-controls={idMenu}
        onClick={() => setAberto((a) => !a)}
      >
        {rotulo}
        <ChevronDown className={cx("size-4 shrink-0 transition-transform", aberto && "rotate-180")} aria-hidden />
      </Botao>
      {aberto && (
        // No celular o menu abre como um painel na parte de baixo da tela; no computador, logo abaixo do botão.
        <div
          id={idMenu}
          role="menu"
          className="fixed inset-x-3 bottom-3 z-50 overflow-hidden rounded-2xl border border-borda bg-white py-1.5 shadow-2xl sm:absolute sm:inset-x-auto sm:bottom-auto sm:right-0 sm:top-full sm:z-40 sm:mt-1.5 sm:w-80 sm:rounded-xl sm:py-1 sm:shadow-lg"
        >
          <p className="px-4 pb-1 pt-2 text-xs font-semibold text-texto-suave sm:hidden">{rotulo}</p>
          {opcoes.map((o) => (
            <button
              key={o.url}
              type="button"
              role="menuitem"
              disabled={o.desabilitada}
              onClick={() => {
                setAberto(false);
                exportar(o.url);
              }}
              className="flex w-full items-start gap-3 px-4 py-3 text-left sm:py-2.5 hover:bg-azul-50 focus-visible:bg-azul-50 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
            >
              <FileSpreadsheet className="mt-0.5 size-4 shrink-0 text-azul-600" aria-hidden />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-texto">{o.rotulo}</span>
                {o.descricao && <span className="block text-xs text-texto-suave">{o.descricao}</span>}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
