"use client";

import Link from "next/link";
import { clsx } from "clsx";
import { useEffect, useId, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { X, Loader2 } from "lucide-react";

export const cx = clsx;

// ---------------------------------------------------------------------
// Botões
// ---------------------------------------------------------------------
type Variante = "primario" | "secundario" | "fantasma" | "perigo";
const estilosBotao: Record<Variante, string> = {
  primario: "bg-azul-600 text-white hover:bg-azul-700 disabled:bg-azul-200",
  secundario: "bg-white text-texto border border-borda hover:bg-fundo disabled:text-texto-fraco",
  fantasma: "text-texto-suave hover:bg-fundo hover:text-texto",
  perigo: "bg-vermelho-600 text-white hover:bg-red-700 disabled:bg-vermelho-200",
};
const base = "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors whitespace-nowrap disabled:cursor-not-allowed";
const tamanhos = { md: "h-10 px-4 text-sm", sm: "h-8 px-3 text-[13px]" };

interface BotaoProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: Variante;
  tamanho?: "md" | "sm";
  carregando?: boolean;
  icone?: ReactNode;
}

export function Botao({ variante = "secundario", tamanho = "md", carregando, icone, className, children, disabled, ...rest }: BotaoProps) {
  return (
    <button {...rest} disabled={disabled || carregando} className={cx(base, tamanhos[tamanho], estilosBotao[variante], className)}>
      {carregando ? <Loader2 className="size-4 animate-spin" aria-hidden /> : icone}
      {children}
    </button>
  );
}

export function BotaoLink({ href, variante = "secundario", tamanho = "md", icone, className, children }: { href: string; variante?: Variante; tamanho?: "md" | "sm"; icone?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <Link href={href} className={cx(base, tamanhos[tamanho], estilosBotao[variante], className)}>
      {icone}
      {children}
    </Link>
  );
}

// ---------------------------------------------------------------------
// Etiquetas
// ---------------------------------------------------------------------
export type Tom = "neutro" | "azul" | "ambar" | "vermelho" | "verde";
const estilosTom: Record<Tom, string> = {
  neutro: "bg-fundo text-texto-suave border-borda",
  azul: "bg-azul-50 text-azul-700 border-azul-100",
  ambar: "bg-ambar-50 text-ambar-600 border-ambar-200",
  vermelho: "bg-vermelho-50 text-vermelho-600 border-vermelho-200",
  verde: "bg-verde-50 text-verde-600 border-verde-200",
};

export function Etiqueta({ tom = "neutro", children, className, titulo }: { tom?: Tom; children: ReactNode; className?: string; titulo?: string }) {
  return (
    <span title={titulo} className={cx("inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap", estilosTom[tom], className)}>
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------
// Cartões
// ---------------------------------------------------------------------
export function Cartao({ titulo, icone, acoes, children, className, corpoClassName, id, descricao }: { titulo?: ReactNode; icone?: ReactNode; acoes?: ReactNode; children: ReactNode; className?: string; corpoClassName?: string; id?: string; descricao?: ReactNode }) {
  return (
    <section id={id} className={cx("rounded-xl border border-borda bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]", className)}>
      {(titulo || acoes) && (
        <header className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5">
          <div className="min-w-0">
            {titulo && (
              <h2 className="flex items-center gap-2 text-base font-semibold text-texto">
                {icone}
                {titulo}
              </h2>
            )}
            {descricao && <p className="mt-0.5 text-[13px] text-texto-suave">{descricao}</p>}
          </div>
          {acoes && <div className="flex flex-wrap items-center gap-2">{acoes}</div>}
        </header>
      )}
      <div className={cx("p-5", corpoClassName)}>{children}</div>
    </section>
  );
}

// ---------------------------------------------------------------------
// Campos de formulário
// ---------------------------------------------------------------------
export function Campo({ label, ajuda, erro, obrigatorio, children, className, htmlFor }: { label: ReactNode; ajuda?: ReactNode; erro?: string | null; obrigatorio?: boolean; children: ReactNode; className?: string; htmlFor?: string }) {
  return (
    <div className={cx("flex flex-col gap-1.5", className)}>
      <label htmlFor={htmlFor} className="text-[13px] font-medium text-texto">
        {label}
        {obrigatorio && (
          <span className="ml-0.5 text-vermelho-600" aria-label="obrigatório">
            *
          </span>
        )}
      </label>
      {children}
      {erro ? <p className="text-xs font-medium text-vermelho-600">{erro}</p> : ajuda ? <p className="text-xs text-texto-fraco">{ajuda}</p> : null}
    </div>
  );
}

const estiloControle =
  "h-10 w-full rounded-lg border border-borda bg-white px-3 text-sm text-texto placeholder:text-texto-fraco transition-colors focus:border-azul-500 focus:outline-none focus:ring-2 focus:ring-azul-100 disabled:bg-fundo disabled:text-texto-suave aria-[invalid=true]:border-vermelho-500 aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-vermelho-50";

export function Entrada({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...rest} className={cx(estiloControle, className)} />;
}

export function Selecao({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...rest} className={cx(estiloControle, "pr-8", className)}>
      {children}
    </select>
  );
}

export function AreaTexto({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...rest} className={cx(estiloControle, "h-auto min-h-20 py-2", className)} />;
}

export function CaixaMarcacao({ label, checked, onChange }: { label: ReactNode; checked: boolean; onChange: (v: boolean) => void }) {
  const id = useId();
  return (
    <div className="flex items-center gap-2">
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="size-4 rounded border-borda accent-azul-600" />
      <label htmlFor={id} className="text-sm text-texto">
        {label}
      </label>
    </div>
  );
}

// ---------------------------------------------------------------------
// Filtro em abas (Todos | Ativos | Desligados)
// ---------------------------------------------------------------------
export function Segmentos<T extends string>({ opcoes, valor, onChange, rotulo }: { opcoes: { valor: T; label: ReactNode; contagem?: number }[]; valor: T; onChange: (v: T) => void; rotulo: string }) {
  return (
    <div role="tablist" aria-label={rotulo} className="inline-flex max-w-full overflow-x-auto rounded-lg border border-borda bg-fundo p-1">
      {opcoes.map((o) => (
        <button
          key={o.valor}
          role="tab"
          type="button"
          aria-selected={valor === o.valor}
          onClick={() => onChange(o.valor)}
          className={cx(
            "flex h-8 items-center gap-1.5 rounded-md px-3 text-[13px] font-medium whitespace-nowrap transition-colors",
            valor === o.valor ? "bg-white text-azul-700 shadow-sm" : "text-texto-suave hover:text-texto",
          )}
        >
          {o.label}
          {o.contagem !== undefined && <span className={cx("numeros rounded-full px-1.5 text-xs", valor === o.valor ? "bg-azul-50 text-azul-700" : "text-texto-fraco")}>{o.contagem}</span>}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------
// Janela (modal)
// ---------------------------------------------------------------------
export function Modal({ aberto, aoFechar, titulo, descricao, children, rodape, largura = "md" }: { aberto: boolean; aoFechar: () => void; titulo: ReactNode; descricao?: ReactNode; children: ReactNode; rodape?: ReactNode; largura?: "sm" | "md" | "lg" | "amplo" | "xl" }) {
  const ref = useRef<HTMLDivElement>(null);
  const tituloId = useId();
  // Guarda a função de fechar em uma ref: o foco inicial só deve acontecer quando a janela abre,
  // e não a cada nova renderização (senão o cursor volta para o primeiro campo enquanto se digita).
  const fecharRef = useRef(aoFechar);
  useEffect(() => {
    fecharRef.current = aoFechar;
  });
  useEffect(() => {
    if (!aberto) return;
    const anterior = document.activeElement as HTMLElement | null;
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && fecharRef.current();
    document.addEventListener("keydown", tecla);
    document.body.style.overflow = "hidden";
    const foco = ref.current?.querySelector<HTMLElement>("input, select, textarea");
    (foco ?? ref.current)?.focus();
    return () => {
      document.removeEventListener("keydown", tecla);
      document.body.style.overflow = "";
      anterior?.focus?.();
    };
  }, [aberto]);
  if (!aberto) return null;
  const larguras = { sm: "max-w-md", md: "max-w-xl", lg: "max-w-3xl", amplo: "max-w-4xl", xl: "max-w-6xl" };
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-marinho-950/50 sm:items-center sm:p-6" onMouseDown={(e) => e.target === e.currentTarget && fecharRef.current()}>
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={tituloId} tabIndex={-1} className={cx("flex max-h-[92dvh] w-full flex-col rounded-t-2xl bg-white shadow-xl sm:rounded-2xl", larguras[largura])}>
        <header className="flex items-start justify-between gap-4 border-b border-borda px-5 py-4">
          <div>
            <h2 id={tituloId} className="text-base font-semibold text-texto">
              {titulo}
            </h2>
            {descricao && <p className="mt-0.5 text-[13px] text-texto-suave">{descricao}</p>}
          </div>
          <button type="button" onClick={aoFechar} className="rounded-md p-1 text-texto-fraco hover:bg-fundo hover:text-texto" aria-label="Fechar">
            <X className="size-5" />
          </button>
        </header>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {rodape && <footer className="flex flex-wrap justify-end gap-2 border-t border-borda px-5 py-3">{rodape}</footer>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// Estado vazio e avisos
// ---------------------------------------------------------------------
export function Vazio({ titulo, descricao, acao, icone }: { titulo: string; descricao?: ReactNode; acao?: ReactNode; icone?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
      {icone && <div className="text-texto-fraco">{icone}</div>}
      <p className="text-sm font-medium text-texto-suave">{titulo}</p>
      {descricao && <p className="max-w-sm text-[13px] text-texto-fraco">{descricao}</p>}
      {acao && <div className="mt-2">{acao}</div>}
    </div>
  );
}

export function Aviso({ tom = "ambar", titulo, children, icone }: { tom?: "ambar" | "vermelho" | "azul" | "verde"; titulo?: ReactNode; children?: ReactNode; icone?: ReactNode }) {
  const estilos = {
    ambar: "border-ambar-200 bg-ambar-50 text-ambar-600",
    vermelho: "border-vermelho-200 bg-vermelho-50 text-vermelho-600",
    azul: "border-azul-100 bg-azul-50 text-azul-700",
    verde: "border-verde-200 bg-verde-50 text-verde-600",
  };
  return (
    <div role={tom === "vermelho" ? "alert" : "status"} className={cx("flex gap-3 rounded-lg border px-4 py-3 text-sm", estilos[tom])}>
      {icone && <div className="mt-0.5 shrink-0">{icone}</div>}
      <div className="min-w-0">
        {titulo && <p className="font-semibold">{titulo}</p>}
        {children && <div className={cx(titulo && "mt-0.5", "text-[13px] leading-relaxed text-texto")}>{children}</div>}
      </div>
    </div>
  );
}

export function CabecalhoPagina({ titulo, descricao, acoes }: { titulo: string; descricao?: ReactNode; acoes?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight text-texto">{titulo}</h1>
        {descricao && <div className="mt-1 text-sm text-texto-suave">{descricao}</div>}
      </div>
      {acoes && <div className="flex flex-wrap items-center gap-2">{acoes}</div>}
    </div>
  );
}
