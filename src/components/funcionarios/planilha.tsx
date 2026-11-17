"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as TecladoReact } from "react";
import { ArrowDown, ArrowUp, Columns3, Eye, Filter, Loader2, PencilLine, Plus, Search, Undo2, Upload, UsersRound, X } from "lucide-react";
import { Botao, BotaoLink, Entrada, Etiqueta, Segmentos, Selecao, cx } from "@/components/ui";
import { useAvisos } from "@/components/avisos";
import { MenuExportar, type OpcaoExportar } from "@/components/exportar";
import { ErroApi, api } from "@/lib/cliente/api";
import { CAMPO_POR_CHAVE, estadoControle, type CampoChave } from "@/lib/domain/campos";
import { analisarCadastro } from "@/lib/domain/pendencias";
import {
  CHAVE_PREFERENCIA_PLANILHA,
  COLUNAS_PLANILHA,
  aplicarPlanilha,
  filtroAtivo,
  larguraPadrao,
  textoCelula,
  type FiltroColuna,
  type FiltrosColunas,
  type Ordenacao,
  type PreferenciaPlanilha,
} from "@/lib/domain/planilha";
import type { FiltroCadastro, FiltroVinculo } from "@/lib/domain/filtros";
import type { FuncionarioResumo } from "@/lib/server/consultas";
import type { Perfil } from "@/lib/domain/tipos";
import { EdicaoEmLote, FiltroDaColuna, Flutuante, PainelColunas, opcoesDaColuna } from "./planilha-paineis";

type Linha = FuncionarioResumo;
type Painel = { tipo: "filtro"; campo: CampoChave; ancora: DOMRect } | { tipo: "colunas"; ancora: DOMRect } | null;
type Alteracao = { id: number; campo: CampoChave; anterior: string | null; novo: string | null; nome: string };

const LARGURA_SELECAO = 76;
const chaveCelula = (id: number, campo: CampoChave) => `${id}:${campo}`;

function CorControle({ valor }: { valor: string }) {
  const e = estadoControle(valor);
  const cor = e === "OK" ? "bg-verde-50 text-verde-600 border-verde-200" : e === "Pendente" ? "bg-ambar-50 text-ambar-600 border-ambar-200" : e === "Não se aplica" ? "bg-fundo text-texto-suave border-borda" : "bg-azul-50 text-azul-700 border-azul-100";
  return <span className={cx("inline-block max-w-full truncate rounded border px-1.5 text-xs font-medium leading-5", cor)}>{valor}</span>;
}

export function PlanilhaFuncionarios({
  funcionarios,
  perfil,
  preferencia,
  inicial,
}: {
  funcionarios: Linha[];
  perfil: Perfil;
  preferencia: PreferenciaPlanilha;
  inicial: { vinculo: FiltroVinculo; cadastro: FiltroCadastro | null; colunas: FiltrosColunas };
}) {
  const router = useRouter();
  const avisar = useAvisos();
  const admin = perfil === "ADMIN";

  const [linhas, setLinhas] = useState<Linha[]>(funcionarios);
  useEffect(() => setLinhas(funcionarios), [funcionarios]);

  const [vinculo, setVinculo] = useState<FiltroVinculo>(inicial.vinculo);
  const [cadastro, setCadastro] = useState<FiltroCadastro | "">(inicial.cadastro ?? "");
  const [busca, setBusca] = useState("");
  const [filtros, setFiltros] = useState<FiltrosColunas>(inicial.colunas);
  const [ordem, setOrdem] = useState<Ordenacao | null>(null);
  const [ocultas, setOcultas] = useState<Set<CampoChave>>(new Set(preferencia.ocultas.filter((k) => k !== "nome")));
  const [larguras, setLarguras] = useState<Partial<Record<CampoChave, number>>>(preferencia.larguras);
  const [selecionados, setSelecionados] = useState<Set<number>>(new Set());
  const [editando, setEditando] = useState<{ id: number; campo: CampoChave } | null>(null);
  const [salvando, setSalvando] = useState<Set<string>>(new Set());
  const [painel, setPainel] = useState<Painel>(null);
  const [lote, setLote] = useState(false);
  const [ultima, setUltima] = useState<Alteracao | null>(null);

  // Preferências do usuário (colunas e larguras): salvas no banco, sem travar a tela
  const primeira = useRef(true);
  useEffect(() => {
    if (primeira.current) {
      primeira.current = false;
      return;
    }
    const t = setTimeout(() => {
      api(`/api/preferencias/${CHAVE_PREFERENCIA_PLANILHA}`, { metodo: "PUT", corpo: { valor: { ocultas: [...ocultas], larguras } } }).catch(() => {});
    }, 700);
    return () => clearTimeout(t);
  }, [ocultas, larguras]);

  useEffect(() => {
    if (!ultima) return;
    const t = setTimeout(() => setUltima(null), 10000);
    return () => clearTimeout(t);
  }, [ultima]);

  const visiveis = useMemo(() => COLUNAS_PLANILHA.filter((k) => !ocultas.has(k)), [ocultas]);
  const largura = useCallback((k: CampoChave) => larguras[k] ?? larguraPadrao(k), [larguras]);
  const filtrosAtivos = useMemo(() => Object.fromEntries(Object.entries(filtros).filter(([, f]) => filtroAtivo(f))) as FiltrosColunas, [filtros]);
  const qtdFiltros = Object.keys(filtrosAtivos).length + (cadastro ? 1 : 0) + (busca.trim() ? 1 : 0);

  const lista = useMemo(
    () => aplicarPlanilha(linhas, { vinculo, cadastro: cadastro || null, busca, colunas: filtrosAtivos, ordem }),
    [linhas, vinculo, cadastro, busca, filtrosAtivos, ordem],
  );
  const contagem = useMemo(
    () => ({ todos: linhas.length, ativos: linhas.filter((f) => f.status_vinculo === "ATIVO").length, desligados: linhas.filter((f) => f.status_vinculo === "DESLIGADO").length }),
    [linhas],
  );
  const larguraTotal = LARGURA_SELECAO + visiveis.reduce((s, k) => s + largura(k), 0);
  const selecionadosVisiveis = lista.filter((f) => selecionados.has(f.id));
  const todosMarcados = lista.length > 0 && selecionadosVisiveis.length === lista.length;

  // ------------------------------------------------------------------
  // Exportação
  // ------------------------------------------------------------------
  const opcoesExportar = useMemo(() => {
    const q = new URLSearchParams({ escopo: "filtrados", filtro: vinculo });
    if (busca.trim()) q.set("busca", busca.trim());
    if (cadastro) q.set("cadastro", cadastro);
    if (Object.keys(filtrosAtivos).length) q.set("colunas", JSON.stringify(filtrosAtivos));
    if (ordem) q.set("ordem", `${ordem.campo}:${ordem.direcao}`);
    const opcoes: OpcaoExportar[] = [
      { rotulo: `Somente os filtrados (${lista.length})`, descricao: "Exatamente as linhas da tela, com as 34 colunas.", url: `/api/exportar/funcionarios?${q.toString()}` },
      {
        rotulo: `Somente as colunas visíveis (${visiveis.length})`,
        descricao: `As linhas da tela só com as colunas que estão aparecendo.`,
        url: `/api/exportar/funcionarios?${q.toString()}&visiveis=${visiveis.join(",")}`,
      },
      { rotulo: `Todos os funcionários (${contagem.todos})`, descricao: "Planilha completa com as 34 colunas da aba Base.", url: "/api/exportar/funcionarios?escopo=todos" },
      { rotulo: `Somente ativos (${contagem.ativos})`, url: "/api/exportar/funcionarios?escopo=ativos" },
      { rotulo: `Somente desligados (${contagem.desligados})`, descricao: "Linhas em vermelho, como na planilha.", url: "/api/exportar/funcionarios?escopo=desligados" },
    ];
    if (admin)
      opcoes.push({
        rotulo: "Planilha completa para reimportar",
        descricao: "As 34 colunas da aba Base com todos os funcionários e as datas COMEMORAR do escritório.",
        url: "/api/exportar/funcionarios?formato=modelo",
      });
    return opcoes;
  }, [vinculo, busca, cadastro, filtrosAtivos, ordem, lista.length, visiveis, contagem, admin]);

  // ------------------------------------------------------------------
  // Edição na célula
  // ------------------------------------------------------------------
  function trocarLinha(f: Partial<Linha> & { id: number }) {
    setLinhas((ls) => ls.map((x) => (x.id === f.id ? ({ ...x, ...f, analise: analisarCadastro({ ...x, ...f }) } as Linha) : x)));
  }

  async function gravar(f: Linha, campo: CampoChave, bruto: string, desfazendo = false) {
    const anterior = f[campo] ?? null;
    const novo = bruto.trim() === "" ? null : bruto.trim();
    if ((anterior ?? "") === (novo ?? "")) return;
    const k = chaveCelula(f.id, campo);
    trocarLinha({ id: f.id, [campo]: novo });
    setSalvando((s) => new Set(s).add(k));
    try {
      const r = await api<{ funcionario: Linha }>(`/api/funcionarios/${f.id}/campo`, { metodo: "PATCH", corpo: { campo, valor: novo, anterior } });
      trocarLinha(r.funcionario);
      setUltima(desfazendo ? null : { id: f.id, campo, anterior, novo: r.funcionario[campo] ?? null, nome: f.nome ?? "Sem nome" });
      if (desfazendo) avisar("sucesso", "Alteração desfeita.");
    } catch (e) {
      const atual = e instanceof ErroApi ? (e.dados.funcionario as Linha | undefined) : undefined;
      trocarLinha(atual ?? { id: f.id, [campo]: anterior });
      avisar("erro", e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setSalvando((s) => {
        const n = new Set(s);
        n.delete(k);
        return n;
      });
    }
  }

  function proximaColuna(campo: CampoChave, passo: 1 | -1): CampoChave | null {
    const i = visiveis.indexOf(campo) + passo;
    return i >= 0 && i < visiveis.length ? visiveis[i] : null;
  }

  async function desfazer() {
    if (!ultima) return;
    const f = linhas.find((x) => x.id === ultima.id);
    setUltima(null);
    if (f) await gravar(f, ultima.campo, ultima.anterior ?? "", true);
  }

  // ------------------------------------------------------------------
  // Largura das colunas (arrastar a borda do cabeçalho)
  // ------------------------------------------------------------------
  function redimensionar(e: React.PointerEvent, k: CampoChave) {
    e.preventDefault();
    e.stopPropagation();
    const inicioX = e.clientX;
    const inicio = largura(k);
    const mover = (ev: PointerEvent) => setLarguras((l) => ({ ...l, [k]: Math.round(Math.min(800, Math.max(60, inicio + ev.clientX - inicioX))) }));
    const soltar = () => {
      window.removeEventListener("pointermove", mover);
      window.removeEventListener("pointerup", soltar);
      document.body.style.cursor = "";
    };
    document.body.style.cursor = "col-resize";
    window.addEventListener("pointermove", mover);
    window.addEventListener("pointerup", soltar);
  }

  function alternarOrdem(k: CampoChave) {
    setOrdem((o) => (!o || o.campo !== k ? { campo: k, direcao: "asc" } : o.direcao === "asc" ? { campo: k, direcao: "desc" } : null));
  }

  function definirFiltro(k: CampoChave, f: FiltroColuna | undefined) {
    setFiltros((atual) => {
      const n = { ...atual };
      if (f) n[k] = f;
      else delete n[k];
      return n;
    });
  }

  const fecharPainel = useCallback(() => setPainel(null), []);

  async function aplicarLote(campo: CampoChave, valor: string | null) {
    try {
      const r = await api<{ funcionarios: Linha[]; alterados: number }>("/api/funcionarios/lote", { corpo: { ids: selecionadosVisiveis.map((f) => f.id), campo, valor } });
      for (const f of r.funcionarios) trocarLinha(f);
      avisar("sucesso", r.alterados ? `${CAMPO_POR_CHAVE[campo].label} atualizado em ${r.alterados} ${r.alterados === 1 ? "funcionário" : "funcionários"}.` : "Nada mudou: os selecionados já tinham esse valor.");
      setLote(false);
      setSelecionados(new Set());
      router.refresh();
    } catch (e) {
      avisar("erro", e instanceof Error ? e.message : "Não foi possível editar em lote.");
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Barra superior */}
      <div className="flex flex-col gap-3 rounded-xl border border-borda bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <div className="flex flex-wrap items-center gap-2">
          <Botao tamanho="sm" icone={<Columns3 className="size-4" />} onClick={(e) => setPainel({ tipo: "colunas", ancora: e.currentTarget.getBoundingClientRect() })}>
            Colunas{ocultas.size ? ` (${34 - ocultas.size}/34)` : ""}
          </Botao>
          {admin && (
            <BotaoLink tamanho="sm" href="/funcionarios/importar" icone={<Upload className="size-4" />}>
              Importar Excel
            </BotaoLink>
          )}
          <MenuExportar tamanho="sm" opcoes={opcoesExportar} />
          <span title={!admin ? "Somente administradores editam em lote." : selecionadosVisiveis.length === 0 ? "Marque os funcionários na primeira coluna." : undefined}>
            <Botao tamanho="sm" icone={<PencilLine className="size-4" />} disabled={!admin || selecionadosVisiveis.length === 0} onClick={() => setLote(true)}>
              Editar em lote{selecionadosVisiveis.length ? ` (${selecionadosVisiveis.length})` : ""}
            </Botao>
          </span>
          <BotaoLink tamanho="sm" variante="primario" href="/funcionarios/novo" icone={<Plus className="size-4" />} className="ml-auto">
            Novo Funcionário
          </BotaoLink>
        </div>
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
          <div className="relative lg:w-80">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-texto-fraco" aria-hidden />
            <Entrada aria-label="Pesquisar por nome, e-mail ou telefone" placeholder="Pesquisar nome, e-mail ou telefone" type="search" value={busca} onChange={(e) => setBusca(e.target.value)} className="h-9 pl-9" />
          </div>
          <Segmentos
            rotulo="Filtrar funcionários"
            valor={vinculo}
            onChange={setVinculo}
            opcoes={[
              { valor: "ativos", label: "Ativos", contagem: contagem.ativos },
              { valor: "desligados", label: "Desligados", contagem: contagem.desligados },
              { valor: "todos", label: "Todos", contagem: contagem.todos },
            ]}
          />
          <Selecao aria-label="Filtrar por cadastro" className="h-9 lg:w-52" value={cadastro} onChange={(e) => setCadastro(e.target.value as FiltroCadastro | "")}>
            <option value="">Todos os cadastros</option>
            <option value="completos">Cadastros completos</option>
            <option value="incompletos">Cadastros incompletos</option>
          </Selecao>
          {qtdFiltros > 0 && (
            <button
              type="button"
              onClick={() => {
                setFiltros({});
                setCadastro("");
                setBusca("");
                router.replace(`/funcionarios?filtro=${vinculo}`);
              }}
              className="inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 text-[13px] text-azul-700 hover:bg-azul-50"
            >
              <X className="size-3.5" aria-hidden /> Limpar filtros ({qtdFiltros})
            </button>
          )}
          <p className="numeros whitespace-nowrap text-[13px] text-texto-suave lg:ml-auto" aria-live="polite">
            <strong className="text-texto">{lista.length}</strong> de {linhas.length} registros
            {selecionadosVisiveis.length > 0 && ` · ${selecionadosVisiveis.length} selecionados`}
          </p>
        </div>
      </div>

      {/* Planilha */}
      <div className="relative overflow-auto rounded-xl border border-borda bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]" style={{ maxHeight: "calc(100dvh - 330px)", minHeight: 360 }} onScroll={() => painel && setPainel(null)}>
        <table className="border-separate border-spacing-0 text-[13px]" style={{ tableLayout: "fixed", width: larguraTotal }}>
          <colgroup>
            <col style={{ width: LARGURA_SELECAO }} />
            {visiveis.map((k) => (
              <col key={k} style={{ width: largura(k) }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th className="sticky left-0 top-0 z-30 border-b border-r border-borda bg-[#EDF3FA] px-2 text-left">
                <label className="flex h-10 items-center gap-2">
                  <input
                    type="checkbox"
                    className="size-4 accent-azul-600"
                    aria-label="Selecionar todos os funcionários da lista"
                    checked={todosMarcados}
                    onChange={() => setSelecionados(todosMarcados ? new Set() : new Set(lista.map((f) => f.id)))}
                  />
                  <span className="sr-only">Selecionar</span>
                </label>
              </th>
              {visiveis.map((k) => {
                const def = CAMPO_POR_CHAVE[k];
                const ativo = filtroAtivo(filtros[k]);
                const fixa = k === "nome";
                return (
                  <th
                    key={k}
                    scope="col"
                    aria-sort={ordem?.campo === k ? (ordem.direcao === "asc" ? "ascending" : "descending") : undefined}
                    className={cx("relative top-0 border-b border-r border-borda bg-[#EDF3FA] p-0 text-left font-semibold text-texto", fixa ? "sticky z-30" : "sticky z-20")}
                    style={fixa ? { left: LARGURA_SELECAO } : undefined}
                  >
                    <div className="flex h-10 items-center gap-0.5 pl-2 pr-2.5">
                      <button type="button" onClick={() => alternarOrdem(k)} className="flex min-w-0 flex-1 items-center gap-1 text-left text-[12.5px] hover:text-azul-700" title={`Ordenar por ${def.label}`}>
                        <span className="truncate">{def.label}</span>
                        {ordem?.campo === k && (ordem.direcao === "asc" ? <ArrowUp className="size-3.5 shrink-0 text-azul-600" /> : <ArrowDown className="size-3.5 shrink-0 text-azul-600" />)}
                      </button>
                      <button
                        type="button"
                        aria-label={`Filtrar ${def.label}`}
                        onClick={(e) => setPainel({ tipo: "filtro", campo: k, ancora: e.currentTarget.getBoundingClientRect() })}
                        className={cx("shrink-0 rounded p-1", ativo ? "bg-azul-600 text-white" : "text-texto-fraco hover:bg-white hover:text-azul-700")}
                      >
                        <Filter className="size-3.5" />
                      </button>
                    </div>
                    <span
                      role="separator"
                      aria-orientation="vertical"
                      aria-label={`Ajustar largura de ${def.label}`}
                      onPointerDown={(e) => redimensionar(e, k)}
                      onDoubleClick={() => setLarguras((l) => {
                        const n = { ...l };
                        delete n[k];
                        return n;
                      })}
                      className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-azul-300"
                    />
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {lista.map((f) => {
              const desligado = f.status_vinculo === "DESLIGADO";
              const marcado = selecionados.has(f.id);
              const fundo = marcado ? "bg-azul-50" : desligado ? "bg-vermelho-50" : "bg-white";
              return (
                <tr key={f.id} className="group">
                  <td className={cx("sticky left-0 z-10 border-b border-r border-borda px-2", fundo, desligado && "shadow-[inset_4px_0_0_var(--color-vermelho-500)]")}>
                    <div className="flex h-9 items-center gap-1.5">
                      <input
                        type="checkbox"
                        className="size-4 accent-azul-600"
                        aria-label={`Selecionar ${f.nome ?? ""}`}
                        checked={marcado}
                        onChange={() =>
                          setSelecionados((s) => {
                            const n = new Set(s);
                            if (n.has(f.id)) n.delete(f.id);
                            else n.add(f.id);
                            return n;
                          })
                        }
                      />
                      <Link href={`/funcionarios/${f.id}`} className="rounded p-1 text-texto-suave hover:bg-azul-50 hover:text-azul-600" title="Abrir cadastro completo" aria-label={`Abrir cadastro de ${f.nome ?? ""}`}>
                        <Eye className="size-4" />
                      </Link>
                    </div>
                  </td>
                  {visiveis.map((k) => {
                    const fixa = k === "nome";
                    const emEdicao = editando?.id === f.id && editando.campo === k;
                    const gravando = salvando.has(chaveCelula(f.id, k));
                    const valor = f[k] ?? null;
                    return (
                      <td
                        key={k}
                        className={cx("border-b border-r border-borda p-0 align-middle", fundo, fixa && "sticky z-10", !emEdicao && "cursor-cell hover:outline hover:outline-1 hover:-outline-offset-1 hover:outline-azul-300")}
                        style={fixa ? { left: LARGURA_SELECAO } : undefined}
                        tabIndex={emEdicao ? -1 : 0}
                        onClick={() => !emEdicao && setEditando({ id: f.id, campo: k })}
                        onKeyDown={(e) => {
                          if (!emEdicao && (e.key === "Enter" || e.key === "F2")) {
                            e.preventDefault();
                            setEditando({ id: f.id, campo: k });
                          }
                        }}
                        aria-label={`${CAMPO_POR_CHAVE[k].label} de ${f.nome ?? "sem nome"}`}
                      >
                        {emEdicao ? (
                          <EditorCelula
                            chave={k}
                            valor={valor}
                            opcoes={CAMPO_POR_CHAVE[k].tipo === "lista" || CAMPO_POR_CHAVE[k].tipo === "controle" ? opcoesDaColuna(k, linhas) : []}
                            aoSalvar={(v, mover) => {
                              setEditando(mover ? (proximaColuna(k, mover) ? { id: f.id, campo: proximaColuna(k, mover)! } : null) : null);
                              void gravar(f, k, v);
                            }}
                            aoCancelar={() => setEditando(null)}
                          />
                        ) : (
                          <div className={cx("flex h-9 items-center gap-1.5 overflow-hidden px-2", fixa && "font-medium text-texto")} title={textoCelula(k, valor) || undefined}>
                            {gravando && <Loader2 className="size-3.5 shrink-0 animate-spin text-azul-600" aria-label="Salvando" />}
                            {valor != null && CAMPO_POR_CHAVE[k].tipo === "controle" ? <CorControle valor={valor} /> : <span className="truncate">{textoCelula(k, valor)}</span>}
                            {fixa && !valor && <span className="italic text-texto-fraco">Sem nome</span>}
                            {fixa && desligado && (
                              <Etiqueta tom="vermelho" className="ml-auto shrink-0 px-1.5 py-0 text-[11px]">
                                Desligado
                              </Etiqueta>
                            )}
                            {fixa && f.analise.nivel !== "COMPLETO" && (
                              <span
                                className={cx("shrink-0 rounded px-1 text-[11px] font-semibold", !desligado && "ml-auto", f.analise.nivel === "BASICO_INCOMPLETO" ? "bg-vermelho-50 text-vermelho-600" : "bg-ambar-50 text-ambar-600")}
                                title={`Cadastro incompleto. Falta: ${f.analise.pendencias.map((p) => p.label).join(", ")}`}
                              >
                                Incompleto
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
        {lista.length === 0 && (
          <div className="sticky left-0 flex w-full max-w-[calc(100vw-4rem)] flex-col items-center gap-2 px-4 py-12 text-center text-texto-suave">
            <UsersRound className="size-8 text-texto-fraco" />
            <p className="text-sm font-medium">Nenhum funcionário encontrado.</p>
            <p className="text-[13px] text-texto-fraco">Ajuste a pesquisa ou os filtros das colunas.</p>
          </div>
        )}
      </div>
      <p className="text-xs text-texto-fraco">
        Clique em uma célula para editar: Enter ou Tab salva, Esc cancela. Arraste a borda do cabeçalho para ajustar a largura (duplo clique volta ao padrão). O olho abre o cadastro completo.
      </p>

      {ultima && (
        <div role="status" className="fixed bottom-4 left-1/2 z-40 flex max-w-[92vw] -translate-x-1/2 items-center gap-3 rounded-xl border border-borda bg-white px-4 py-2.5 text-[13px] shadow-xl">
          <span className="min-w-0 truncate">
            {CAMPO_POR_CHAVE[ultima.campo].label} de <strong>{ultima.nome}</strong> salvo: {textoCelula(ultima.campo, ultima.novo) || "(vazio)"}
          </span>
          <Botao tamanho="sm" icone={<Undo2 className="size-4" />} onClick={desfazer}>
            Desfazer
          </Botao>
          <button type="button" className="rounded p-1 text-texto-fraco hover:bg-fundo" aria-label="Fechar" onClick={() => setUltima(null)}>
            <X className="size-4" />
          </button>
        </div>
      )}

      {painel?.tipo === "filtro" && (
        <Flutuante ancora={painel.ancora} aoFechar={fecharPainel} rotulo={`Filtro de ${CAMPO_POR_CHAVE[painel.campo].label}`} largura={290}>
          <FiltroDaColuna
            chave={painel.campo}
            filtro={filtros[painel.campo]}
            linhas={linhas}
            onChange={(f) => definirFiltro(painel.campo, f)}
            onOrdenar={(d) => setOrdem({ campo: painel.campo, direcao: d })}
          />
        </Flutuante>
      )}
      {painel?.tipo === "colunas" && (
        <Flutuante ancora={painel.ancora} aoFechar={fecharPainel} rotulo="Colunas visíveis" largura={420}>
          <PainelColunas
            ocultas={ocultas}
            onChange={(o) => {
              setOcultas(o);
              setFiltros((atual) => Object.fromEntries(Object.entries(atual).filter(([k]) => !o.has(k as CampoChave))) as FiltrosColunas);
            }}
            onRestaurar={() => {
              setOcultas(new Set());
              setLarguras({});
            }}
          />
        </Flutuante>
      )}
      <EdicaoEmLote aberto={lote} aoFechar={() => setLote(false)} selecionados={selecionadosVisiveis.map((f) => ({ id: f.id, nome: f.nome }))} linhas={linhas} aoAplicar={aplicarLote} />
    </div>
  );
}

// ---------------------------------------------------------------------
// Editor dentro da célula
// ---------------------------------------------------------------------

function EditorCelula({
  chave,
  valor,
  opcoes,
  aoSalvar,
  aoCancelar,
}: {
  chave: CampoChave;
  valor: string | null;
  opcoes: { valor: string; label: string }[];
  aoSalvar: (v: string, mover?: 1 | -1) => void;
  aoCancelar: () => void;
}) {
  const tipo = CAMPO_POR_CHAVE[chave].tipo;
  const feito = useRef(false);
  const salvar = (v: string, mover?: 1 | -1) => {
    if (feito.current) return;
    feito.current = true;
    aoSalvar(v, mover);
  };
  const cancelar = () => {
    if (feito.current) return;
    feito.current = true;
    aoCancelar();
  };
  const teclas = (e: TecladoReact<HTMLInputElement | HTMLSelectElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      cancelar();
    } else if (e.key === "Enter") {
      e.preventDefault();
      salvar(e.currentTarget.value);
    } else if (e.key === "Tab") {
      e.preventDefault();
      salvar(e.currentTarget.value, e.shiftKey ? -1 : 1);
    }
  };
  const classe = "h-9 w-full border-0 bg-white px-2 text-[13px] text-texto outline outline-2 -outline-offset-2 outline-azul-500 focus:outline-azul-600";

  if (tipo === "lista" || tipo === "controle") {
    const temAtual = !valor || opcoes.some((o) => o.valor === valor);
    return (
      <select autoFocus aria-label={CAMPO_POR_CHAVE[chave].label} className={classe} defaultValue={valor ?? ""} onChange={(e) => salvar(e.target.value)} onKeyDown={teclas} onBlur={cancelar}>
        <option value="">(vazio)</option>
        {!temAtual && valor && <option value={valor}>{valor}</option>}
        {opcoes.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.label}
          </option>
        ))}
      </select>
    );
  }
  if (tipo === "data" || tipo === "diames") {
    return <input autoFocus type="date" aria-label={CAMPO_POR_CHAVE[chave].label} className={classe} defaultValue={valor?.slice(0, 10) ?? ""} onKeyDown={teclas} onBlur={(e) => salvar(e.target.value)} />;
  }
  return (
    <input
      autoFocus
      type={tipo === "email" ? "email" : tipo === "telefone" ? "tel" : "text"}
      aria-label={CAMPO_POR_CHAVE[chave].label}
      className={classe}
      defaultValue={valor ?? ""}
      onFocus={(e) => e.currentTarget.select()}
      onKeyDown={teclas}
      onBlur={(e) => salvar(e.target.value)}
    />
  );
}
