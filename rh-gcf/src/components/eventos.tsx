import Link from "next/link";
import { cx } from "@/lib/cx";
import { formatarData } from "@/lib/domain/datas";
import type { Evento } from "@/lib/domain/eventos";

export type EstiloCartao = "hoje" | "ambar" | "azul" | "neutro";

const ESTILOS: Record<EstiloCartao, { caixa: string; dias: string }> = {
  hoje: { caixa: "border-verde-200 bg-verde-50 hover:border-verde-600/40", dias: "text-verde-600" },
  ambar: { caixa: "border-ambar-200 bg-ambar-50 hover:border-ambar-500/60", dias: "text-ambar-600" },
  azul: { caixa: "border-azul-100 bg-azul-50 hover:border-azul-200", dias: "text-azul-600" },
  neutro: { caixa: "border-borda bg-white hover:border-azul-200", dias: "text-azul-600" },
};

export function textoDias(dias: number): string {
  if (dias === 0) return "Hoje";
  if (dias === 1) return "Amanhã";
  if (dias > 0) return `${dias} dias`;
  return dias === -1 ? "Ontem" : `Há ${Math.abs(dias)} dias`;
}

/** Cartão de data no padrão do CertControl: nome e tipo à esquerda, dias restantes e data à direita. */
export function CartaoEvento({ evento: e, estilo }: { evento: Evento; estilo: EstiloCartao }) {
  const s = ESTILOS[estilo];
  const passou = e.dias < 0;
  const href = e.origem.tipo === "funcionario" ? `/funcionarios/${e.origem.id}` : e.origem.tipo === "data_cliente" ? "/datas-cliente" : "/datas-comemorativas";
  return (
    <Link href={href} className={cx("flex items-center justify-between gap-4 rounded-lg border px-4 py-3 transition-colors", s.caixa, passou && "opacity-60")}>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-texto">{e.titulo}</p>
        <p className="mt-0.5 truncate text-xs text-texto-suave">
          {e.tipoLabel}
          {e.detalhe ? `: ${e.detalhe}` : ""}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className={cx("numeros text-sm font-bold", passou ? "text-texto-fraco" : s.dias)}>{textoDias(e.dias)}</p>
        <p className="numeros text-[11px] text-texto-suave">{formatarData(e.data)}</p>
      </div>
    </Link>
  );
}

export function ListaCartoes({ eventos, estilo, vazio, duasColunas }: { eventos: Evento[]; estilo: EstiloCartao | ((e: Evento) => EstiloCartao); vazio: string; duasColunas?: boolean }) {
  if (eventos.length === 0) return <p className="rounded-lg border border-dashed border-borda px-4 py-6 text-center text-[13px] text-texto-fraco">{vazio}</p>;
  return (
    <ul className={duasColunas ? "gap-2.5 md:columns-2" : "flex flex-col gap-2.5"}>
      {eventos.map((e) => (
        <li key={e.chave} className={duasColunas ? "mb-2.5 break-inside-avoid" : undefined}>
          <CartaoEvento evento={e} estilo={typeof estilo === "function" ? estilo(e) : estilo} />
        </li>
      ))}
    </ul>
  );
}

/** Cor do cartão conforme a proximidade da data. */
export function estiloPorDias(e: Evento): EstiloCartao {
  if (e.dias === 0) return "hoje";
  if (e.dias > 0 && e.dias <= 7) return "ambar";
  if (e.dias > 7 && e.dias <= 15) return "azul";
  return "neutro";
}
