"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Aviso, Botao, Etiqueta, Segmentos, cx, type Tom } from "@/components/ui";
import { FUSO, formatarData } from "@/lib/domain/datas";
import {
  ROTULOS_EVENTO_CALENDARIO,
  TIPO_PARCERIA,
  formatarInicioGcf,
  textoCampoCliente,
  type AcaoImportacao,
  type CampoAlterado,
  type PreviaCalendario,
  type PreviaClientes,
  type TipoEventoCalendario,
} from "@/lib/domain/clientes";
import { normalizarTexto } from "@/lib/excel/normalizar";
import type { ImportacaoAnterior } from "@/lib/server/lotes";

const ACOES: Record<AcaoImportacao, { label: string; tom: Tom }> = {
  NOVO: { label: "Cadastrar", tom: "verde" },
  ATUALIZAR: { label: "Atualizar", tom: "azul" },
  IGNORAR: { label: "Ignorar", tom: "neutro" },
  CORRIGIR: { label: "Corrigir", tom: "vermelho" },
};

type Filtro = "todos" | AcaoImportacao;

function valor(c: CampoAlterado, v: string | null, lado: "atual" | "planilha"): string {
  const texto = lado === "atual" ? c.textoAtual : c.textoPlanilha;
  if (texto) return texto;
  if (c.campo === "recorrente") return textoCampoCliente(c.campo, v === "true");
  return textoCampoCliente(c.campo, v);
}

export function quandoImportado(a: ImportacaoAnterior): string {
  const f = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, dateStyle: "short", timeStyle: "short" }).format(new Date(a.em));
  return `${f.replace(",", " às")}${a.por ? ` por ${a.por}` : ""}`;
}

/** O que foi encontrado em cada aba do arquivo (planilha RH GCF com Base e Calendário). */
function ResumoDoArquivo({ previa }: { previa: PreviaClientes }) {
  const { base, calendario } = previa;
  if (!base && !calendario) return null;
  const tipos = calendario ? (Object.entries(calendario.porTipo) as [TipoEventoCalendario, number][]) : [];
  return (
    <section aria-label="Abas do arquivo" className="rounded-xl border border-borda bg-fundo/50 p-4 text-[13px]">
      <h3 className="mb-2 text-sm font-semibold text-texto">O que foi encontrado no arquivo</h3>
      <ul className="flex flex-col gap-1.5 text-texto-suave">
        {base && (
          <li>
            <span className="font-medium text-texto">Aba {base.aba}:</span> {base.colaboradores} colaboradores e {base.comemorar} datas COMEMORAR. São funcionários: entram por{" "}
            <span className="font-medium text-texto">Funcionários → Importar Excel</span>
            {base.faltamNoSistema > 0 ? (
              <>
                {" "}
                ({base.faltamNoSistema} ainda não {base.faltamNoSistema === 1 ? "está cadastrado" : "estão cadastrados"} —{" "}
                <Link href="/funcionarios/importar" className="font-medium text-azul-600 hover:underline">
                  importar funcionários
                </Link>
                ).
              </>
            ) : (
              " (todos já estão cadastrados)."
            )}
          </li>
        )}
        {calendario && (
          <li>
            <span className="font-medium text-texto">Aba {calendario.aba}:</span> {calendario.totalEventos} eventos —{" "}
            {tipos.map(([t, n]) => `${n} ${ROTULOS_EVENTO_CALENDARIO[t]}`).join(", ")}. Classificados pela coluna Evento; os eventos dos funcionários continuam em Datas Comemorativas.
          </li>
        )}
        <li>
          <span className="font-medium text-texto">Clientes:</span>{" "}
          {previa.abas.length
            ? `${previa.lidos.length} ${previa.lidos.length === 1 ? "linha" : "linhas"} na aba ${previa.abas.map((a) => a.nome).join(", ")}.`
            : "nenhuma aba com relação de clientes (Cliente/Razão social/Empresa com CNPJ ou datas)."}
        </li>
      </ul>
    </section>
  );
}

/** "Aniversário de Empresa" da aba Calendário: tempo de casa dos colaboradores (não vira cliente). */
function EventosEmpresa({ cal }: { cal: PreviaCalendario }) {
  const eventos = cal.eventosEmpresa;
  const duplicados = eventos.filter((e) => e.duplicadoDe != null).length;
  const naoEncontrados = eventos.filter((e) => e.situacao === "NAO_ENCONTRADO").length;
  const foraDoSistema = eventos.filter((e) => e.situacao === "TEMPO_DE_CASA" && !e.noSistema).length;
  if (eventos.length === 0) return null;
  return (
    <section aria-label="Aniversário de Empresa" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-texto">
          Aniversário de Empresa <span className="numeros font-normal text-texto-suave">({eventos.length} na aba {cal.aba})</span>
        </h3>
      </div>
      <Aviso tom="azul" titulo="Tempo de casa dos colaboradores — não são cadastrados como clientes.">
        A planilha calcula o “Aniversário de Empresa” a partir da Admissão de cada colaborador da aba Base (coluna Detalhe = anos de empresa). Por isso eles aparecem em{" "}
        <span className="font-medium">Datas Comemorativas → Tempo de casa</span> e nos alertas do dashboard, e não em Datas do Cliente.
        {foraDoSistema > 0 && ` ${foraDoSistema} ${foraDoSistema === 1 ? "colaborador ainda não está cadastrado" : "colaboradores ainda não estão cadastrados"}: importe a planilha em Funcionários → Importar Excel.`}
      </Aviso>
      {duplicados > 0 && (
        <Aviso tom="ambar" titulo="Foram encontrados registros duplicados.">
          {duplicados} {duplicados === 1 ? "evento aparece" : "eventos aparecem"} mais de uma vez na aba {cal.aba} (mesmo nome e mesma data).
        </Aviso>
      )}
      {naoEncontrados > 0 && (
        <Aviso tom="ambar" titulo="Algumas informações não puderam ser importadas. Confira a prévia.">
          {naoEncontrados} {naoEncontrados === 1 ? "nome não foi encontrado" : "nomes não foram encontrados"} na aba Base nem em Funcionários. Confira a grafia na planilha.
        </Aviso>
      )}
      <div className="overflow-x-auto rounded-xl border border-borda">
        <table className="w-full min-w-[760px] text-[13px]">
          <thead>
            <tr className="border-b border-borda bg-fundo/60 text-left text-xs font-semibold text-texto-suave">
              <th className="px-3 py-2.5">Linha</th>
              <th className="px-3 py-2.5">Nome</th>
              <th className="px-3 py-2.5">Data</th>
              <th className="px-3 py-2.5">Anos</th>
              <th className="px-3 py-2.5">Na aba Base</th>
              <th className="px-3 py-2.5">Situação</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borda">
            {eventos.map((e) => (
              <tr key={`${e.aba}-${e.linha}`} className={cx("align-top", e.duplicadoDe != null && "text-texto-suave")}>
                <td className="numeros whitespace-nowrap px-3 py-2">
                  <span className="block text-xs text-texto-suave">{e.aba}</span>
                  {e.linha}
                </td>
                <td className="px-3 py-2 font-medium text-texto">{e.nome}</td>
                <td className="numeros whitespace-nowrap px-3 py-2">{formatarData(e.data) || "—"}</td>
                <td className="px-3 py-2">{e.detalhe ?? (e.anos != null ? `${e.anos} anos` : "—")}</td>
                <td className="px-3 py-2 text-texto-suave">
                  {e.colaborador ? (
                    <>
                      {e.colaborador.situacao ?? "—"}
                      {e.colaborador.admissao && <span className="numeros block text-xs">admissão {formatarData(e.colaborador.admissao)}</span>}
                    </>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-3 py-2">
                  <span className="flex flex-wrap gap-1">
                    {e.situacao === "NAO_ENCONTRADO" ? (
                      <Etiqueta tom="ambar">Não encontrado na Base</Etiqueta>
                    ) : e.noSistema ? (
                      <Etiqueta tom="azul">Tempo de casa — já no sistema</Etiqueta>
                    ) : (
                      <Etiqueta tom="ambar">Funcionário a importar</Etiqueta>
                    )}
                    {e.duplicadoDe != null && <Etiqueta>Duplicado (linha {e.duplicadoDe})</Etiqueta>}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** Conferência da importação de clientes: resumo, avisos e a lista do que será feito com cada linha. */
export function PreviaClientesTabela({
  previa,
  substituir,
  setSubstituir,
  arquivoJaImportado,
}: {
  previa: PreviaClientes;
  substituir: Set<string>;
  setSubstituir: (s: Set<string>) => void;
  arquivoJaImportado?: ImportacaoAnterior | null;
}) {
  const r = previa.resumo;
  const [filtro, setFiltro] = useState<Filtro>(r.corrigir > 0 ? "CORRIGIR" : "todos");
  const comConflito = useMemo(() => previa.registros.filter((x) => x.acao === "ATUALIZAR" && x.conflitos.length > 0), [previa]);
  const lista = filtro === "todos" ? previa.registros : previa.registros.filter((x) => x.acao === filtro);
  const variasAbas = previa.abas.length > 1;
  const comAvisos = previa.registros.some((x) => x.avisos.length > 0);

  function alternar(id: string) {
    const s = new Set(substituir);
    if (s.has(id)) s.delete(id);
    else s.add(id);
    setSubstituir(s);
  }

  const semClientes = previa.registros.length === 0;

  return (
    <div className="flex flex-col gap-4">
      <ResumoDoArquivo previa={previa} />
      {semClientes && (previa.base || previa.calendario) && (
        <Aviso tom="ambar" titulo="Nenhum cliente para importar neste arquivo.">
          O arquivo foi lido por inteiro, mas não tem uma relação de clientes. Para cadastrar clientes, use uma aba com o nome ou a razão social e o CNPJ ou as datas (início da parceria, fundação, aniversário do sócio).
        </Aviso>
      )}
      {!semClientes && (
        <>
          <section className="grid grid-cols-2 gap-3 md:grid-cols-4" aria-label="Resumo da importação de clientes">
            {[
              { r: "Serão cadastrados", v: r.novos, cor: "text-verde-600" },
              { r: "Serão atualizados", v: r.atualizar, cor: "text-azul-600" },
              { r: "Ignorados", v: r.ignorados, cor: "text-texto" },
              { r: "Precisam de correção", v: r.corrigir, cor: r.corrigir ? "text-vermelho-600" : "text-texto" },
            ].map((x) => (
              <div key={x.r} className="rounded-xl border border-borda bg-white p-3.5">
                <p className="text-[13px] text-texto-suave">{x.r}</p>
                <p className={cx("numeros mt-0.5 text-2xl font-bold", x.cor)}>{x.v}</p>
              </div>
            ))}
          </section>

          {arquivoJaImportado && (
            <Aviso tom="azul" titulo="Este arquivo já foi importado.">
              Mesmo conteúdo importado em {quandoImportado(arquivoJaImportado)}. Os registros já cadastrados serão ignorados: nada será duplicado.
            </Aviso>
          )}
          {r.duplicados > 0 && (
            <Aviso tom="ambar" titulo="Foram encontrados registros duplicados.">
              {r.duplicados} {r.duplicados === 1 ? "registro já está cadastrado ou se repete" : "registros já estão cadastrados ou se repetem"} na planilha e{" "}
              {r.duplicados === 1 ? "será ignorado" : "serão ignorados"}. A duplicidade é verificada pelo CNPJ e, sem CNPJ, pelo nome do cliente.
            </Aviso>
          )}
          {(r.corrigir > 0 || comAvisos) && (
            <Aviso tom="ambar" titulo="Algumas informações não puderam ser importadas. Confira a prévia.">
              {r.corrigir > 0 && `${r.corrigir} ${r.corrigir === 1 ? "linha precisa" : "linhas precisam"} de correção na planilha e não ${r.corrigir === 1 ? "será importada" : "serão importadas"}. `}
              {r.incompletos > 0 && `${r.incompletos} ${r.incompletos === 1 ? "registro ficará" : "registros ficarão"} com cadastro incompleto (sem CNPJ ou sem início da parceria): complete depois, editando o cliente.`}
            </Aviso>
          )}
          {comConflito.length > 0 && (
            <Aviso tom="azul" titulo={`${comConflito.length} ${comConflito.length === 1 ? "cliente tem" : "clientes têm"} valores diferentes dos já cadastrados.`}>
              <span className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <span>A planilha atualiza o cadastro. Desmarque “Atualizar” onde o valor do sistema estiver certo.</span>
                <Botao
                  tamanho="sm"
                  type="button"
                  onClick={() => setSubstituir(substituir.size === comConflito.length ? new Set() : new Set(comConflito.map((x) => x.id)))}
                >
                  {substituir.size === comConflito.length ? "Desmarcar todos" : "Marcar todos"}
                </Botao>
              </span>
            </Aviso>
          )}

          <div className="text-xs text-texto-suave">
            {previa.abas.map((a) => (
              <p key={a.nome}>
                <span className="font-medium text-texto">Aba {a.nome}</span> (cabeçalho na linha {a.linhaCabecalho}, {a.linhas} {a.linhas === 1 ? "linha" : "linhas"}):{" "}
                {a.colunas.map((c) => (normalizarTexto(c.cabecalho) === normalizarTexto(c.papel) ? c.cabecalho : `${c.cabecalho} → ${c.papel}`)).join(" · ")}
                {a.ignoradas.length > 0 && <span className="text-texto-fraco"> · Não importadas: {a.ignoradas.join(", ")}</span>}
              </p>
            ))}
          </div>

          <Segmentos
            rotulo="Filtrar prévia"
            valor={filtro}
            onChange={setFiltro}
            opcoes={[
              { valor: "todos" as Filtro, label: "Todos", contagem: r.registros },
              { valor: "NOVO" as Filtro, label: "Cadastrar", contagem: r.novos },
              { valor: "ATUALIZAR" as Filtro, label: "Atualizar", contagem: r.atualizar },
              { valor: "IGNORAR" as Filtro, label: "Ignorados", contagem: r.ignorados },
              { valor: "CORRIGIR" as Filtro, label: "Corrigir", contagem: r.corrigir },
            ]}
          />

          <div className="overflow-x-auto rounded-xl border border-borda">
            <table className="w-full min-w-[820px] text-[13px]">
              <thead>
                <tr className="border-b border-borda bg-fundo/60 text-left text-xs font-semibold text-texto-suave">
                  <th className="px-3 py-2.5">Linha</th>
                  <th className="px-3 py-2.5">Cliente</th>
                  <th className="px-3 py-2.5">Data</th>
                  <th className="px-3 py-2.5">Ação</th>
                  <th className="px-3 py-2.5">Detalhes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borda">
                {lista.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-texto-fraco">
                      Nenhum registro neste filtro.
                    </td>
                  </tr>
                )}
                {lista.map((x) => (
                  <tr key={x.id} className={cx("align-top", x.acao === "CORRIGIR" && "bg-vermelho-50/60", x.acao === "IGNORAR" && "text-texto-suave")}>
                    <td className="numeros whitespace-nowrap px-3 py-2.5">
                      {variasAbas && <span className="block text-xs text-texto-suave">{x.aba}</span>}
                      {x.linha}
                    </td>
                    <td className="max-w-[240px] px-3 py-2.5">
                      <span className="block font-medium text-texto">{x.dados.cliente_nome || <span className="italic text-vermelho-600">sem nome</span>}</span>
                      {x.dados.cnpj && <span className="numeros block text-xs text-texto-suave">CNPJ: {x.dados.cnpj}</span>}
                      {x.dados.situacao_cliente === "INATIVO" && <Etiqueta className="mt-1">Cliente inativo</Etiqueta>}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="block">{x.dados.tipo_data || "—"}</span>
                      <span className="numeros block text-xs text-texto-suave">
                        {x.dados.tipo_data === TIPO_PARCERIA
                          ? x.dados.inicio_parceria
                            ? `Início GCF: ${formatarInicioGcf(x.dados.inicio_parceria, x.dados.inicio_parceria_precisao)}`
                            : "Início GCF não informado"
                          : [x.dados.data_evento && formatarData(x.dados.data_evento), x.dados.inicio_parceria && `parceria desde ${formatarData(x.dados.inicio_parceria)}`].filter(Boolean).join(" · ") || "—"}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <Etiqueta tom={ACOES[x.acao].tom}>{ACOES[x.acao].label}</Etiqueta>
                    </td>
                    <td className="max-w-[420px] px-3 py-2.5">
                      {x.motivo && <p className={x.acao === "CORRIGIR" ? "font-medium text-vermelho-600" : "text-texto-suave"}>{x.motivo}</p>}
                      {x.completar.length > 0 && (
                        <p className="mt-1 text-texto-suave">
                          Completa:{" "}
                          {x.completar.map((c) => (
                            <span key={c.campo} className="mr-2 inline-block">
                              {c.label} = <span className="text-texto">{valor(c, c.planilha, "planilha")}</span>
                            </span>
                          ))}
                        </p>
                      )}
                      {x.acao === "ATUALIZAR" && x.conflitos.length > 0 && (
                        <div className="mt-1.5 rounded-lg border border-azul-100 bg-azul-50/60 px-2.5 py-2">
                          {x.conflitos.map((c) => (
                            <p key={c.campo}>
                              <span className="font-medium">{c.label}:</span> no sistema <span className="text-texto">{valor(c, c.atual, "atual")}</span> · na planilha{" "}
                              <span className="text-texto">{valor(c, c.planilha, "planilha")}</span>
                            </p>
                          ))}
                          <label className="mt-1.5 flex items-center gap-2 font-medium text-azul-700">
                            <input type="checkbox" className="size-4 accent-azul-600" checked={substituir.has(x.id)} onChange={() => alternar(x.id)} />
                            Atualizar com os valores da planilha
                          </label>
                        </div>
                      )}
                      {(x.acao === "NOVO" || x.acao === "ATUALIZAR") && x.pendencias.length > 0 && (
                        <p className="mt-1 text-ambar-600">Cadastro incompleto: falta {x.pendencias.join(", ")}</p>
                      )}
                      {x.avisos.map((a) => (
                        <p key={a} className="mt-1 text-xs text-ambar-600">
                          {a}
                        </p>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {previa.calendario && <EventosEmpresa cal={previa.calendario} />}
    </div>
  );
}
