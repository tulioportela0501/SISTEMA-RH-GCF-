"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Building2, Pencil, Plus, Search } from "lucide-react";
import { AreaTexto, Botao, CaixaMarcacao, Campo, Entrada, Etiqueta, Modal, Segmentos, Selecao, Vazio, cx } from "@/components/ui";
import { useAvisos } from "@/components/avisos";
import { textoDias } from "@/components/eventos";
import { MenuExportar } from "@/components/exportar";
import { ImportarClientes } from "./importar-clientes";
import { api } from "@/lib/cliente/api";
import { MESES, formatarData } from "@/lib/domain/datas";
import { ehAniversarioParceria, proximasOcorrencias } from "@/lib/domain/eventos";
import { TIPO_PARCERIA, anosDeParceria, clienteAtivo, filtrarDatasCliente, formatarInicioGcf, pendenciasDataCliente, proximoAniversarioParceria } from "@/lib/domain/clientes";
import { formatarWhatsapp, normalizarWhatsapp } from "@/lib/domain/whatsapp";
import { TIPOS_DATA_CLIENTE, type DataCliente, type Perfil } from "@/lib/domain/tipos";

type Form = {
  cliente_nome: string;
  cnpj: string;
  codigo: string;
  tipo_data: string;
  data_evento: string;
  /** "MM/AAAA" quando a precisão é mês e ano */
  inicio_mes: string;
  /** "AAAA-MM-DD" quando a precisão é a data exata */
  inicio_dia: string;
  precisao: "MES" | "DIA";
  recorrente: boolean;
  observacoes: string;
  situacao_cliente: "ATIVO" | "INATIVO";
  whatsapp: string;
  tributacao: string;
  responsavel_fiscal: string;
  responsavel_contabil: string;
  responsavel_dp: string;
  nao_enviar: boolean;
  nao_enviar_motivo: string;
  dados_extras: Record<string, string>;
};

const VAZIO: Form = {
  cliente_nome: "",
  cnpj: "",
  codigo: "",
  tipo_data: TIPO_PARCERIA,
  data_evento: "",
  inicio_mes: "",
  inicio_dia: "",
  precisao: "MES",
  recorrente: true,
  observacoes: "",
  situacao_cliente: "ATIVO",
  whatsapp: "",
  tributacao: "",
  responsavel_fiscal: "",
  responsavel_contabil: "",
  responsavel_dp: "",
  nao_enviar: false,
  nao_enviar_motivo: "",
  dados_extras: {},
};

const mesCapitalizado = (m: number) => MESES[m - 1].charAt(0).toUpperCase() + MESES[m - 1].slice(1);

/** "032025" → "03/2025" enquanto digita. */
function mascaraMesAno(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 6);
  return d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
}

/** "03/2025" → "2025-03-01" (o dia 01 não é exibido nem usado como dia real). */
function mesAnoParaIso(v: string): string | null | "invalido" {
  if (!v.trim()) return null;
  const m = /^(\d{1,2})\/(\d{4})$/.exec(v.trim());
  if (!m || Number(m[1]) < 1 || Number(m[1]) > 12) return "invalido";
  return `${m[2]}-${m[1].padStart(2, "0")}-01`;
}

export function DatasCliente({ datas, hoje, perfil, diaFelicitacao }: { datas: DataCliente[]; hoje: string; perfil: Perfil; diaFelicitacao: number }) {
  const router = useRouter();
  const avisar = useAvisos();
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<"ativos" | "inativos" | "todos">("ativos");
  const [mes, setMes] = useState<number | null>(null);
  const [editando, setEditando] = useState<DataCliente | "nova" | null>(null);
  const [form, setForm] = useState<Form>(VAZIO);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [confirmarExclusao, setConfirmarExclusao] = useState(false);
  const [excluindo, setExcluindo] = useState(false);

  // Mesma função usada na exportação: "Resultados da pesquisa" traz exatamente o que aparece aqui.
  const linhas = useMemo(
    () =>
      filtrarDatasCliente(datas, { filtro, busca, mes })
        .map((d) => ({
          d,
          prox: ehAniversarioParceria(d)
            ? proximoAniversarioParceria(d, hoje, diaFelicitacao)
            : (proximasOcorrencias({ funcionarios: [], datasComemorativas: [], datasCliente: [d], diaFelicitacao }, hoje)[0] ?? null),
          faltando: pendenciasDataCliente(d),
          anos: anosDeParceria(d.inicio_parceria, hoje, d.inicio_parceria_precisao),
        }))
        .sort((a, b) => (a.prox?.dias ?? 9999) - (b.prox?.dias ?? 9999) || a.d.cliente_nome.localeCompare(b.d.cliente_nome, "pt-BR")),
    [datas, busca, filtro, mes, hoje, diaFelicitacao],
  );

  const opcoesExportar = useMemo(() => {
    const ativos = datas.filter(clienteAtivo).length;
    const q = new URLSearchParams({ escopo: "pesquisa", filtro });
    if (busca.trim()) q.set("busca", busca.trim());
    if (mes) q.set("mes", String(mes));
    return [
      { rotulo: `Resultados da pesquisa (${linhas.length})`, descricao: "Respeita a situação, o mês e a pesquisa atuais.", url: `/api/exportar/datas-cliente?${q.toString()}` },
      { rotulo: `Todos os clientes (${datas.length})`, url: "/api/exportar/datas-cliente?escopo=todos" },
      { rotulo: `Somente ativos (${ativos})`, url: "/api/exportar/datas-cliente?escopo=ativos" },
      { rotulo: `Somente inativos (${datas.length - ativos})`, descricao: "Clientes inativos e eventos desativados.", url: "/api/exportar/datas-cliente?escopo=inativos" },
    ];
  }, [datas, filtro, busca, mes, linhas.length]);

  function abrir(d: DataCliente | "nova") {
    setErro(null);
    setConfirmarExclusao(false);
    setEditando(d);
    if (d === "nova") {
      setForm(VAZIO);
      return;
    }
    setForm({
      cliente_nome: d.cliente_nome,
      cnpj: d.cnpj ?? "",
      codigo: d.codigo ?? "",
      tipo_data: d.tipo_data,
      data_evento: d.data_evento ?? "",
      inicio_mes: d.inicio_parceria_precisao === "MES" ? formatarInicioGcf(d.inicio_parceria, "MES") : "",
      inicio_dia: d.inicio_parceria_precisao === "DIA" ? (d.inicio_parceria ?? "") : "",
      precisao: d.inicio_parceria && d.inicio_parceria_precisao === "DIA" ? "DIA" : "MES",
      recorrente: d.recorrente,
      observacoes: d.observacoes ?? "",
      situacao_cliente: d.situacao_cliente,
      whatsapp: d.whatsapp ? formatarWhatsapp(d.whatsapp) : "",
      tributacao: d.tributacao ?? "",
      responsavel_fiscal: d.responsavel_fiscal ?? "",
      responsavel_contabil: d.responsavel_contabil ?? "",
      responsavel_dp: d.responsavel_dp ?? "",
      nao_enviar: d.nao_enviar,
      nao_enviar_motivo: d.nao_enviar_motivo ?? "",
      dados_extras: d.dados_extras ?? {},
    });
  }

  async function salvar() {
    setErro(null);
    let inicio: string | null;
    if (form.precisao === "MES") {
      const v = mesAnoParaIso(form.inicio_mes);
      if (v === "invalido") return setErro("Início GCF inválido. Use mês e ano, ex.: 03/2025.");
      inicio = v;
    } else inicio = form.inicio_dia || null;
    if (form.whatsapp.trim() && !normalizarWhatsapp(form.whatsapp)) return setErro("WhatsApp inválido. Informe DDD + celular, ex.: (98) 99999-0000.");
    setSalvando(true);
    try {
      const vazioNull = (v: string) => (v.trim() ? v.trim() : null);
      const dados = {
        cliente_nome: form.cliente_nome,
        cnpj: vazioNull(form.cnpj),
        codigo: vazioNull(form.codigo),
        tipo_data: form.tipo_data,
        data_evento: form.tipo_data === TIPO_PARCERIA ? null : vazioNull(form.data_evento),
        inicio_parceria: inicio,
        inicio_parceria_precisao: form.precisao,
        recorrente: form.recorrente,
        observacoes: vazioNull(form.observacoes),
        situacao_cliente: form.situacao_cliente,
        whatsapp: vazioNull(form.whatsapp),
        tributacao: vazioNull(form.tributacao),
        responsavel_fiscal: vazioNull(form.responsavel_fiscal),
        responsavel_contabil: vazioNull(form.responsavel_contabil),
        responsavel_dp: vazioNull(form.responsavel_dp),
        nao_enviar: form.nao_enviar,
        nao_enviar_motivo: form.nao_enviar ? vazioNull(form.nao_enviar_motivo) : null,
        dados_extras: form.dados_extras,
      };
      if (editando === "nova") await api("/api/datas-cliente", { corpo: { dados } });
      else if (editando) await api(`/api/datas-cliente/${editando.id}`, { metodo: "PUT", corpo: { dados, versao: editando.versao } });
      avisar("sucesso", "Cliente salvo.");
      setEditando(null);
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  }

  async function alternarAtivo(d: DataCliente) {
    try {
      await api(`/api/datas-cliente/${d.id}/ativo`, { corpo: { ativo: !d.ativo } });
      avisar("sucesso", d.ativo ? "Evento desativado." : "Evento reativado.");
      setEditando(null);
      router.refresh();
    } catch (e) {
      avisar("erro", e instanceof Error ? e.message : "Não foi possível alterar.");
    }
  }

  async function excluir(d: DataCliente) {
    setExcluindo(true);
    try {
      await api(`/api/datas-cliente/${d.id}`, { metodo: "DELETE", corpo: { versao: d.versao } });
      avisar("sucesso", `Data "${d.tipo_data}" de ${d.cliente_nome} excluída.`);
      setEditando(null);
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível excluir.");
    } finally {
      setExcluindo(false);
      setConfirmarExclusao(false);
    }
  }

  const parceria = form.tipo_data === TIPO_PARCERIA;
  const extras = Object.entries(form.dados_extras);

  return (
    <div className="rounded-xl border border-borda bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex flex-col gap-3 border-b border-borda p-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Segmentos
            rotulo="Situação"
            valor={filtro}
            onChange={setFiltro}
            opcoes={[
              { valor: "ativos", label: "Ativos" },
              { valor: "inativos", label: "Inativos" },
              { valor: "todos", label: "Todos" },
            ]}
          />
          <Selecao aria-label="Mês de aniversário" value={mes ?? ""} onChange={(e) => setMes(e.target.value ? Number(e.target.value) : null)} className="w-auto min-w-44">
            <option value="">Todos os meses</option>
            {MESES.map((_, i) => (
              <option key={i} value={i + 1}>
                {mesCapitalizado(i + 1)}
              </option>
            ))}
          </Selecao>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center xl:flex-nowrap">
          <div className="relative sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-texto-fraco" aria-hidden />
            <Entrada aria-label="Pesquisar cliente" placeholder="Pesquisar por nome, CNPJ ou ID" type="search" value={busca} onChange={(e) => setBusca(e.target.value)} className="pl-9" />
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex">
            {perfil === "ADMIN" && <ImportarClientes />}
            <MenuExportar opcoes={opcoesExportar} className={perfil === "ADMIN" ? undefined : "col-span-2"} />
          </div>
          <Botao variante="primario" icone={<Plus className="size-4" />} onClick={() => abrir("nova")}>
            Novo cliente
          </Botao>
        </div>
      </div>

      {linhas.length === 0 ? (
        <Vazio
          icone={<Building2 className="size-8" />}
          titulo={datas.length ? "Nenhum cliente encontrado." : "Nenhum cliente cadastrado."}
          descricao={datas.length ? undefined : perfil === "ADMIN" ? "Clique em Novo cliente ou importe a planilha geral de clientes em Importar Excel." : "Clique em Novo cliente para cadastrar."}
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1080px] text-sm">
            <thead>
              <tr className="border-b border-borda bg-fundo/60 text-left text-xs font-semibold text-texto-suave">
                <th className="px-4 py-3">Empresa</th>
                <th className="px-3 py-3">CNPJ</th>
                <th className="whitespace-nowrap px-3 py-3">Início GCF</th>
                <th className="px-3 py-3">Anos de parceria</th>
                <th className="px-3 py-3">Próximo aniversário</th>
                <th className="px-3 py-3">WhatsApp</th>
                <th className="px-3 py-3">Situação</th>
                <th className="px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borda">
              {linhas.map(({ d, prox, faltando, anos }) => {
                const ativo = clienteAtivo(d);
                const zap = normalizarWhatsapp(d.whatsapp);
                return (
                  <tr key={d.id} className={cx(!ativo && "text-texto-fraco", "align-top hover:bg-fundo/70")}>
                    <td className="max-w-[320px] px-4 py-3">
                      <p className="font-medium text-texto">{d.cliente_nome}</p>
                      <p className="text-xs text-texto-suave">{[d.tipo_data, d.codigo && `ID ${d.codigo}`, d.tributacao].filter(Boolean).join(" · ")}</p>
                    </td>
                    <td className="numeros whitespace-nowrap px-3 py-3 text-texto-suave">{d.cnpj ?? "—"}</td>
                    <td className="numeros whitespace-nowrap px-3 py-3">{formatarInicioGcf(d.inicio_parceria, d.inicio_parceria_precisao) || "—"}</td>
                    <td className="numeros px-3 py-3">{anos == null ? "—" : anos < 1 ? <span className="text-texto-suave">Menos de 1 ano</span> : `${anos} ${anos === 1 ? "ano" : "anos"}`}</td>
                    <td className="numeros whitespace-nowrap px-3 py-3">
                      {prox ? (
                        <>
                          {formatarData(prox.data)}
                          <span className={cx("block text-xs font-semibold", prox.dias <= 7 ? "text-ambar-600" : "text-azul-600")}>
                            {textoDias(prox.dias)}
                            {"anos" in prox && <span className="font-normal text-texto-suave"> · {prox.anos} {prox.anos === 1 ? "ano" : "anos"}</span>}
                          </span>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="numeros whitespace-nowrap px-3 py-3">
                      {zap ? formatarWhatsapp(zap) : d.whatsapp ? <span className="text-vermelho-600">Inválido</span> : <span className="text-texto-fraco">—</span>}
                    </td>
                    <td className="px-3 py-3">
                      <span className="flex flex-wrap gap-1">
                        {!d.ativo ? <Etiqueta>Evento desativado</Etiqueta> : d.situacao_cliente === "ATIVO" ? <Etiqueta tom="azul">Ativo</Etiqueta> : <Etiqueta>Inativo</Etiqueta>}
                        {faltando.length > 0 && (
                          <Etiqueta tom="ambar" titulo={`Falta: ${faltando.join(", ")}`}>
                            Incompleto
                          </Etiqueta>
                        )}
                        {d.nao_enviar && (
                          <Etiqueta tom="vermelho" titulo={d.nao_enviar_motivo ?? undefined}>
                            Não enviar mensagens
                          </Etiqueta>
                        )}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => abrir(d)} className="rounded-md p-1.5 text-texto-suave hover:bg-azul-50 hover:text-azul-600" aria-label={`Editar ${d.cliente_nome}`}>
                        <Pencil className="size-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="border-t border-borda px-4 py-3 text-xs text-texto-fraco">
        {linhas.length} de {datas.length} registros
      </p>

      <Modal
        aberto={editando !== null}
        aoFechar={() => setEditando(null)}
        largura="lg"
        titulo={editando === "nova" ? "Novo cliente" : "Editar cliente"}
        rodape={
          <>
            {editando && editando !== "nova" && (
              <span className="mr-auto flex flex-wrap gap-2">
                <Botao variante="fantasma" onClick={() => alternarAtivo(editando)}>
                  {editando.ativo ? "Desativar evento" : "Reativar evento"}
                </Botao>
                {perfil === "ADMIN" &&
                  (confirmarExclusao ? (
                    <Botao variante="perigo" carregando={excluindo} onClick={() => excluir(editando)}>
                      Confirmar exclusão
                    </Botao>
                  ) : (
                    <Botao variante="fantasma" className="text-vermelho-600 hover:text-vermelho-600" onClick={() => setConfirmarExclusao(true)}>
                      Excluir
                    </Botao>
                  ))}
              </span>
            )}
            <Botao variante="fantasma" onClick={() => setEditando(null)}>
              Cancelar
            </Botao>
            <Botao variante="primario" carregando={salvando} onClick={salvar}>
              Salvar
            </Botao>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {erro && <p className="rounded-lg bg-vermelho-50 px-3 py-2 text-[13px] text-vermelho-600">{erro}</p>}
          <Campo label="Empresa (nome ou razão social)" htmlFor="cl-nome" obrigatorio>
            <Entrada id="cl-nome" value={form.cliente_nome} onChange={(e) => setForm({ ...form, cliente_nome: e.target.value })} />
          </Campo>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Campo label="CNPJ" htmlFor="cl-cnpj">
              <Entrada id="cl-cnpj" value={form.cnpj} placeholder="00.000.000/0000-00" onChange={(e) => setForm({ ...form, cnpj: e.target.value })} />
            </Campo>
            <Campo label="ID (planilha geral)" htmlFor="cl-codigo">
              <Entrada id="cl-codigo" value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} />
            </Campo>
            <Campo label="Situação do cliente" htmlFor="cl-sit">
              <Selecao id="cl-sit" value={form.situacao_cliente} onChange={(e) => setForm({ ...form, situacao_cliente: e.target.value as "ATIVO" | "INATIVO" })}>
                <option value="ATIVO">Ativo</option>
                <option value="INATIVO">Inativo</option>
              </Selecao>
            </Campo>
          </div>
          <Campo label="Tipo de data ou comemoração" htmlFor="cl-tipo" obrigatorio>
            <Entrada id="cl-tipo" list="tipos-data-cliente" value={form.tipo_data} onChange={(e) => setForm({ ...form, tipo_data: e.target.value })} />
            <datalist id="tipos-data-cliente">
              {TIPOS_DATA_CLIENTE.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </Campo>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Campo
              label="Início GCF"
              htmlFor="cl-inicio"
              ajuda={
                parceria
                  ? form.precisao === "MES"
                    ? `Mês e ano do início da parceria. A felicitação usa o dia ${diaFelicitacao} do mês (configurável na Central de Felicitações).`
                    : "Data exata do início da parceria."
                  : "Opcional: desde quando é cliente."
              }
            >
              <div className="flex gap-2">
                {form.precisao === "MES" ? (
                  <Entrada id="cl-inicio" inputMode="numeric" placeholder="MM/AAAA" maxLength={7} value={form.inicio_mes} onChange={(e) => setForm({ ...form, inicio_mes: mascaraMesAno(e.target.value) })} />
                ) : (
                  <Entrada id="cl-inicio" type="date" value={form.inicio_dia} onChange={(e) => setForm({ ...form, inicio_dia: e.target.value })} />
                )}
                <Selecao aria-label="Precisão do Início GCF" className="w-36 shrink-0" value={form.precisao} onChange={(e) => setForm({ ...form, precisao: e.target.value as "MES" | "DIA" })}>
                  <option value="MES">Mês e ano</option>
                  <option value="DIA">Data exata</option>
                </Selecao>
              </div>
            </Campo>
            {parceria ? (
              <Campo label="WhatsApp" htmlFor="cl-zap" ajuda="Celular com DDD. Usado no botão Preparar WhatsApp da Central de Felicitações.">
                <Entrada id="cl-zap" type="tel" inputMode="tel" placeholder="(98) 99999-0000" value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} />
              </Campo>
            ) : (
              <Campo label="Data do evento" htmlFor="cl-data" obrigatorio>
                <Entrada id="cl-data" type="date" value={form.data_evento} onChange={(e) => setForm({ ...form, data_evento: e.target.value })} />
              </Campo>
            )}
          </div>
          {!parceria && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Campo label="WhatsApp" htmlFor="cl-zap2" ajuda="Celular com DDD.">
                <Entrada id="cl-zap2" type="tel" inputMode="tel" placeholder="(98) 99999-0000" value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} />
              </Campo>
              <div className="flex items-end pb-2">
                <CaixaMarcacao label="Repetir todo ano" checked={form.recorrente} onChange={(v) => setForm({ ...form, recorrente: v })} />
              </div>
            </div>
          )}
          <div className="rounded-lg border border-borda p-3">
            <CaixaMarcacao label="O cliente não deseja receber mensagens" checked={form.nao_enviar} onChange={(v) => setForm({ ...form, nao_enviar: v })} />
            {form.nao_enviar && (
              <Entrada className="mt-2" aria-label="Motivo" placeholder="Motivo (opcional), ex.: pediu para não receber" value={form.nao_enviar_motivo} onChange={(e) => setForm({ ...form, nao_enviar_motivo: e.target.value })} />
            )}
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Campo label="Tributação" htmlFor="cl-trib">
              <Entrada id="cl-trib" list="tributacoes" value={form.tributacao} onChange={(e) => setForm({ ...form, tributacao: e.target.value })} />
              <datalist id="tributacoes">
                {["Simples Nacional", "Lucro Presumido", "Lucro Real", "Imune", "MEI"].map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </Campo>
            <Campo label="Responsável Fiscal" htmlFor="cl-rf">
              <Entrada id="cl-rf" value={form.responsavel_fiscal} onChange={(e) => setForm({ ...form, responsavel_fiscal: e.target.value })} />
            </Campo>
            <Campo label="Responsável Contábil" htmlFor="cl-rc">
              <Entrada id="cl-rc" value={form.responsavel_contabil} onChange={(e) => setForm({ ...form, responsavel_contabil: e.target.value })} />
            </Campo>
            <Campo label="Responsável DP" htmlFor="cl-rd">
              <Entrada id="cl-rd" value={form.responsavel_dp} onChange={(e) => setForm({ ...form, responsavel_dp: e.target.value })} />
            </Campo>
          </div>
          <Campo label="Observações" htmlFor="cl-obs">
            <AreaTexto id="cl-obs" value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} />
          </Campo>
          {extras.length > 0 && (
            <details className="rounded-lg border border-borda px-3 py-2 text-[13px]">
              <summary className="cursor-pointer font-medium text-texto">Outras informações da planilha geral ({extras.length})</summary>
              <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
                {extras.map(([k, v]) => (
                  <div key={k} className="flex gap-2">
                    <dt className="shrink-0 text-texto-suave">{k}:</dt>
                    <dd className="min-w-0 break-words text-texto">{v}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-2 text-xs text-texto-fraco">Atualizadas a cada importação da planilha geral.</p>
            </details>
          )}
        </div>
      </Modal>
    </div>
  );
}
