import Link from "next/link";
import { CabecalhoPagina, Etiqueta, type Tom } from "@/components/ui";
import { FiltrosHistorico } from "@/components/historico/filtros";
import { MenuExportar } from "@/components/exportar";
import { exigirUsuarioPagina } from "@/lib/server/auth";
import { consultarHistorico, filtrosDaUrl } from "@/lib/server/historico-consulta";
import { OPERACOES, valorLegivel, type Operacao } from "@/lib/server/historico";
import { FUSO } from "@/lib/domain/datas";

export const metadata = { title: "Histórico" };

const TOM_OPERACAO: Partial<Record<Operacao, Tom>> = {
  CRIACAO: "verde",
  ALTERACAO: "azul",
  IMPORTACAO: "azul",
  EXPORTACAO: "neutro",
  EXCLUSAO: "vermelho",
  DESLIGAMENTO: "vermelho",
  REATIVACAO: "verde",
  DESATIVACAO: "neutro",
  ATIVACAO: "verde",
};

export default async function PaginaHistorico({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await exigirUsuarioPagina();
  const sp = new URLSearchParams(Object.entries(await searchParams).filter(([, v]) => v != null) as [string, string][]);
  const filtros = filtrosDaUrl(sp);
  const { itens, total, pagina, porPagina } = await consultarHistorico(filtros);
  const paginas = Math.max(1, Math.ceil(total / porPagina));
  const fmt = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, dateStyle: "short", timeStyle: "short" });
  const linkExportar = (escopo: string) => {
    const q = new URLSearchParams(sp);
    q.delete("pagina");
    q.set("escopo", escopo);
    return q.toString();
  };
  const linkPagina = (p: number) => {
    const q = new URLSearchParams(sp);
    q.set("pagina", String(p));
    return `/historico?${q.toString()}`;
  };

  return (
    <>
      <CabecalhoPagina
        titulo="Histórico"
        descricao="Registro de todas as alterações. Somente consulta: os registros não podem ser editados nem excluídos."
        acoes={
          <MenuExportar
            opcoes={[
              { rotulo: `Resultados da consulta (${total})`, descricao: "Respeita a pesquisa, a operação e o período.", url: `/api/exportar/historico?${linkExportar("filtrados")}` },
              { rotulo: "Todo o histórico", descricao: "Todos os registros, sem filtros.", url: "/api/exportar/historico?escopo=todos" },
            ]}
          />
        }
      />
      <div className="rounded-xl border border-borda bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <FiltrosHistorico busca={filtros.busca ?? ""} operacao={filtros.operacao ?? ""} de={filtros.de ?? ""} ate={filtros.ate ?? ""} operacoes={OPERACOES} />
        {itens.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-texto-suave">Nenhum registro encontrado.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-[13px]">
              <thead>
                <tr className="border-b border-borda bg-fundo/60 text-left text-xs font-semibold text-texto-suave">
                  <th className="px-4 py-3">Data e horário</th>
                  <th className="px-3 py-3">Usuário</th>
                  <th className="px-3 py-3">Operação</th>
                  <th className="px-3 py-3">Registro</th>
                  <th className="px-3 py-3">Informação alterada</th>
                  <th className="px-3 py-3">Valor anterior</th>
                  <th className="px-4 py-3">Novo valor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borda">
                {itens.map((h) => (
                  <tr key={h.id} className="align-top hover:bg-fundo/70">
                    <td className="numeros whitespace-nowrap px-4 py-3 text-texto-suave">{fmt.format(new Date(h.ocorrido_em))}</td>
                    <td className="whitespace-nowrap px-3 py-3 font-medium">{h.usuario_nome}</td>
                    <td className="px-3 py-3">
                      <Etiqueta tom={TOM_OPERACAO[h.operacao] ?? "neutro"}>{OPERACOES[h.operacao] ?? h.operacao}</Etiqueta>
                    </td>
                    <td className="max-w-[220px] px-3 py-3">
                      {h.entidade === "FUNCIONARIO" && h.entidade_id ? (
                        <Link href={`/funcionarios/${h.entidade_id}`} className="font-medium text-azul-600 hover:underline">
                          {h.registro_nome}
                        </Link>
                      ) : (
                        <span className="font-medium">{h.registro_nome ?? "—"}</span>
                      )}
                    </td>
                    {h.campo ? (
                      <>
                        <td className="px-3 py-3">{h.campo_label}</td>
                        <td className="max-w-[200px] break-words px-3 py-3 text-texto-suave">{valorLegivel(h.campo, h.valor_anterior)}</td>
                        <td className="max-w-[200px] break-words px-4 py-3 font-medium">{valorLegivel(h.campo, h.valor_novo)}</td>
                      </>
                    ) : (
                      <td colSpan={3} className="px-3 py-3 text-texto-suave">
                        {h.descricao}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-borda px-4 py-3 text-xs text-texto-suave">
          <span>
            {total} {total === 1 ? "registro" : "registros"}
          </span>
          {paginas > 1 && (
            <span className="flex items-center gap-3">
              {pagina > 1 && (
                <Link href={linkPagina(pagina - 1)} className="font-medium text-azul-600 hover:underline">
                  Anterior
                </Link>
              )}
              <span>
                Página {pagina} de {paginas}
              </span>
              {pagina < paginas && (
                <Link href={linkPagina(pagina + 1)} className="font-medium text-azul-600 hover:underline">
                  Próxima
                </Link>
              )}
            </span>
          )}
        </div>
      </div>
    </>
  );
}
