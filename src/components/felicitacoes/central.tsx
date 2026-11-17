"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { CalendarClock, CheckCircle2, ChevronLeft, ChevronRight, Clock, ImageIcon, MessageCircle, PhoneOff, Search, Send, Undo2 } from "lucide-react";
import { Aviso, Botao, Campo, Entrada, Etiqueta, Modal, AreaTexto, Segmentos, Vazio, cx, type Tom } from "@/components/ui";
import { useAvisos } from "@/components/avisos";
import { MenuExportar } from "@/components/exportar";
import { textoDias } from "@/components/eventos";
import { api } from "@/lib/cliente/api";
import { FUSO, formatarData } from "@/lib/domain/datas";
import {
  STATUS_FELICITACAO,
  filtrarFelicitacoes,
  montarMensagem,
  nomeDoMes,
  resumirFelicitacoes,
  valoresMensagem,
  variaveisPendentes,
  type AniversarioParceria,
  type ModeloFelicitacao,
  type FiltroStatusFelicitacao,
  type StatusFelicitacao,
} from "@/lib/domain/felicitacoes";
import { formatarWhatsapp } from "@/lib/domain/whatsapp";
import type { DadosCentral } from "@/lib/server/felicitacoes";
import { ImagemFelicitacao } from "./imagem";
import { PrepararFelicitacao, VERDE_SM, mensagemDoModelo } from "./preparar-felicitacao";

const TOM_STATUS: Record<StatusFelicitacao, Tom> = { PENDENTE: "ambar", PREPARADO: "azul", ABERTO: "azul", ENVIADO: "verde", NAO_ENVIAR: "neutro" };
const quando = (d: string | null) =>
  d ? new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, dateStyle: "short", timeStyle: "short" }).format(new Date(d)).replace(",", " às") : "";
const anosTexto = (n: number) => `${n} ${n === 1 ? "ano" : "anos"}`;


function Indicador({ rotulo, valor, legenda, icone, cor, onClick, ativo }: { rotulo: string; valor: number; legenda: string; icone: React.ReactNode; cor: string; onClick?: () => void; ativo?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        "rounded-xl border bg-white p-4 text-left shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-shadow hover:shadow-md",
        ativo ? "border-azul-400 ring-2 ring-azul-100" : "border-borda",
      )}
    >
      <span className="flex items-start justify-between gap-2">
        <span className="text-[13px] text-texto-suave">{rotulo}</span>
        <span className={cor}>{icone}</span>
      </span>
      <span className={cx("numeros mt-1 block text-2xl font-bold", cor)}>{valor}</span>
      <span className="mt-0.5 block text-xs text-texto-suave">{legenda}</span>
    </button>
  );
}

export function CentralFelicitacoes({ dados, usuarioNome, perfil, statusInicial }: { dados: DadosCentral; usuarioNome: string; perfil: "ADMIN" | "USUARIO"; statusInicial: FiltroStatusFelicitacao }) {
  const router = useRouter();
  const avisar = useAvisos();
  const [status, setStatus] = useState<FiltroStatusFelicitacao>(statusInicial);
  const [busca, setBusca] = useState("");
  const [preparando, setPreparando] = useState<AniversarioParceria | null>(null);
  const [confirmando, setConfirmando] = useState<AniversarioParceria | null>(null);
  const [naoEnviar, setNaoEnviar] = useState<AniversarioParceria | null>(null);
  const [reabrindo, setReabrindo] = useState<AniversarioParceria | null>(null);

  const resumo = useMemo(() => resumirFelicitacoes(dados.doMes), [dados.doMes]);
  const lista = useMemo(() => filtrarFelicitacoes(dados.doMes, { status, busca }), [dados.doMes, status, busca]);
  const modelos = dados.modelos.filter((m) => m.ativo);
  const padrao = modelos.find((m) => m.padrao) ?? modelos[0];
  const nomeMes = `${nomeDoMes(dados.mes)} de ${dados.ano}`;
  const contagem = (s: StatusFelicitacao) => dados.doMes.filter((a) => a.status === s).length;

  const opcoesExportar = useMemo(() => {
    const q = `ano=${dados.ano}&mes=${dados.mes}`;
    const filtro = new URLSearchParams({ escopo: "lista", ano: String(dados.ano), mes: String(dados.mes), status });
    if (busca.trim()) filtro.set("busca", busca.trim());
    return [
      { rotulo: `Esta lista (${lista.length})`, descricao: "Exatamente o que aparece na tabela: mês, status e pesquisa.", url: `/api/exportar/felicitacoes?${filtro.toString()}` },
      { rotulo: `Aniversariantes de ${nomeDoMes(dados.mes).toLowerCase()} (${dados.doMes.length})`, descricao: "Todos os aniversariantes do mês exibido, com o status.", url: `/api/exportar/felicitacoes?escopo=mes&${q}` },
      { rotulo: "Felicitações pendentes", descricao: "Pendentes, preparadas e com WhatsApp aberto do mês exibido.", url: `/api/exportar/felicitacoes?escopo=pendentes&${q}` },
      { rotulo: "Felicitações enviadas", descricao: "Todas as confirmadas como enviadas.", url: "/api/exportar/felicitacoes?escopo=enviadas" },
      { rotulo: "Histórico completo", descricao: "Preparadas, com WhatsApp aberto, enviadas e marcadas como Não enviar.", url: "/api/exportar/felicitacoes?escopo=historico" },
    ];
  }, [dados.ano, dados.mes, dados.doMes.length, status, busca, lista.length]);

  function irParaMes(delta: number) {
    const total = dados.ano * 12 + (dados.mes - 1) + delta;
    router.push(`/felicitacoes?ano=${Math.floor(total / 12)}&mes=${(total % 12) + 1}`);
  }

  async function acao(corpo: Record<string, unknown>, sucesso: string) {
    await api("/api/felicitacoes", { corpo });
    avisar("sucesso", sucesso);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      <section aria-label="Indicadores" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Indicador rotulo="Aniversariantes do mês" valor={resumo.aniversariantes} legenda={nomeMes} icone={<CalendarClock className="size-5" />} cor="text-azul-600" onClick={() => setStatus("todos")} ativo={status === "todos"} />
        <Indicador rotulo="Felicitações pendentes" valor={resumo.pendentes} legenda="Pendente, preparada ou WhatsApp aberto" icone={<Clock className="size-5" />} cor="text-ambar-600" onClick={() => setStatus("pendentes")} ativo={status === "pendentes"} />
        <Indicador rotulo="Felicitações enviadas" valor={resumo.enviadas} legenda="Confirmadas pelo funcionário" icone={<CheckCircle2 className="size-5" />} cor="text-verde-600" onClick={() => setStatus("ENVIADO")} ativo={status === "ENVIADO"} />
        <Indicador rotulo="Próximos aniversários" valor={dados.proximos.length} legenda="Nos próximos 30 dias" icone={<CalendarClock className="size-5" />} cor="text-texto" />
        <Indicador
          rotulo="Sem WhatsApp cadastrado"
          valor={resumo.semWhatsapp}
          legenda={`Aniversariantes pendentes · ${dados.semWhatsappTotal} clientes ativos no total`}
          icone={<PhoneOff className="size-5" />}
          cor={resumo.semWhatsapp ? "text-vermelho-600" : "text-texto"}
        />
      </section>

      {dados.semInicio > 0 && (
        <Aviso tom="ambar">
          {dados.semInicio} {dados.semInicio === 1 ? "cliente ativo está" : "clientes ativos estão"} sem Início GCF e não {dados.semInicio === 1 ? "aparece" : "aparecem"} aqui. Complete na aba Datas do Cliente.
        </Aviso>
      )}

      <section aria-label="Imagem e mensagem" className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
        <ImagemFelicitacao imagem={dados.imagem} perfil={perfil} />
        <Modelos modelos={dados.modelos} exemplo={dados.doMes[0] ?? dados.proximos[0] ?? null} />
      </section>

      <div className="rounded-xl border border-borda bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <div className="flex flex-col gap-3 border-b border-borda p-4">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-1">
              <Botao tamanho="sm" variante="fantasma" onClick={() => irParaMes(-1)} aria-label="Mês anterior">
                <ChevronLeft className="size-4" />
              </Botao>
              <h2 className="min-w-44 text-center text-base font-semibold text-texto">{nomeMes}</h2>
              <Botao tamanho="sm" variante="fantasma" onClick={() => irParaMes(1)} aria-label="Próximo mês">
                <ChevronRight className="size-4" />
              </Botao>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative sm:w-64">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-texto-fraco" aria-hidden />
                <Entrada aria-label="Pesquisar cliente" placeholder="Cliente ou CNPJ" type="search" value={busca} onChange={(e) => setBusca(e.target.value)} className="pl-9" />
              </div>
              <MenuExportar opcoes={opcoesExportar} />
            </div>
          </div>
          <Segmentos
            rotulo="Situação do envio"
            valor={status}
            onChange={setStatus}
            opcoes={[
              { valor: "todos" as const, label: "Todos", contagem: dados.doMes.length },
              { valor: "pendentes" as const, label: "Pendentes", contagem: resumo.pendentes },
              { valor: "PREPARADO" as const, label: "Preparada", contagem: contagem("PREPARADO") },
              { valor: "ABERTO" as const, label: "WhatsApp aberto", contagem: contagem("ABERTO") },
              { valor: "ENVIADO" as const, label: "Enviado", contagem: contagem("ENVIADO") },
              { valor: "NAO_ENVIAR" as const, label: "Não enviar", contagem: contagem("NAO_ENVIAR") },
            ]}
          />
        </div>

        {lista.length === 0 ? (
          <Vazio icone={<MessageCircle className="size-8" />} titulo={dados.doMes.length ? "Nenhuma felicitação neste filtro." : `Nenhum aniversário de parceria em ${nomeMes}.`} descricao="Só entram clientes ativos que completam pelo menos 1 ano de parceria no mês." />
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[980px] text-sm">
                <thead>
                  <tr className="border-b border-borda bg-fundo/60 text-left text-xs font-semibold text-texto-suave">
                    <th className="px-4 py-3">Empresa</th>
                    <th className="px-3 py-3">Início GCF</th>
                    <th className="px-3 py-3">Parceria</th>
                    <th className="px-3 py-3">Data</th>
                    <th className="px-3 py-3">WhatsApp</th>
                    <th className="px-3 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-borda">
                  {lista.map((a) => (
                    <tr key={a.chave} className="align-top hover:bg-fundo/70">
                      <td className="max-w-[300px] px-4 py-3">
                        <p className="font-medium text-texto">{a.dataCliente.cliente_nome}</p>
                        {a.dataCliente.cnpj && <p className="numeros text-xs text-texto-suave">CNPJ {a.dataCliente.cnpj}</p>}
                      </td>
                      <td className="numeros px-3 py-3">{a.inicioGcf}</td>
                      <td className="numeros whitespace-nowrap px-3 py-3 font-semibold text-azul-700">{anosTexto(a.anos)}</td>
                      <td className="numeros whitespace-nowrap px-3 py-3">
                        {formatarData(a.data)}
                        <span className="block text-xs text-texto-suave">{textoDias(a.dias)}</span>
                      </td>
                      <td className="numeros whitespace-nowrap px-3 py-3">{a.whatsapp ? formatarWhatsapp(a.whatsapp) : <span className="text-vermelho-600">{a.dataCliente.whatsapp ? "Inválido" : "Sem WhatsApp"}</span>}</td>
                      <td className="px-3 py-3">
                        <StatusCelula a={a} />
                      </td>
                      <td className="px-4 py-3">
                        <Acoes a={a} aoPreparar={setPreparando} aoConfirmar={setConfirmando} aoNaoEnviar={setNaoEnviar} aoReabrir={setReabrindo} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="divide-y divide-borda md:hidden">
              {lista.map((a) => (
                <li key={a.chave} className="flex flex-col gap-2 px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium text-texto">{a.dataCliente.cliente_nome}</p>
                      <p className="numeros text-[13px] text-texto-suave">
                        {anosTexto(a.anos)} · {formatarData(a.data)} · {a.whatsapp ? formatarWhatsapp(a.whatsapp) : "sem WhatsApp"}
                      </p>
                    </div>
                    <StatusCelula a={a} />
                  </div>
                  <Acoes a={a} aoPreparar={setPreparando} aoConfirmar={setConfirmando} aoNaoEnviar={setNaoEnviar} aoReabrir={setReabrindo} />
                </li>
              ))}
            </ul>
          </>
        )}
        <p className="border-t border-borda px-4 py-3 text-xs text-texto-fraco">
          {lista.length} de {dados.doMes.length} aniversários de parceria em {nomeMes}. O envio é manual: o sistema prepara a imagem e a mensagem, abre o WhatsApp e você confirma depois.
        </p>
      </div>

      <ProximosAniversarios lista={dados.proximos} />

      {preparando && <PrepararFelicitacao a={preparando} modelos={modelos} padrao={padrao} imagem={dados.imagem} perfil={perfil} usuarioNome={usuarioNome} aoFechar={() => setPreparando(null)} />}
      {confirmando && (
        <ConfirmarEnvio
          a={confirmando}
          padrao={padrao}
          usuarioNome={usuarioNome}
          aoFechar={() => setConfirmando(null)}
          aoConfirmar={async (mensagem) => {
            await acao({ acao: "enviado", dataClienteId: confirmando.dataCliente.id, ano: confirmando.ano, mensagem }, `Envio registrado: ${confirmando.dataCliente.cliente_nome}.`);
            setConfirmando(null);
          }}
        />
      )}
      {naoEnviar && (
        <NaoEnviar
          a={naoEnviar}
          aoFechar={() => setNaoEnviar(null)}
          aoConfirmar={async (motivo) => {
            await acao({ acao: "nao_enviar", dataClienteId: naoEnviar.dataCliente.id, ano: naoEnviar.ano, motivo: motivo || null }, `Marcado como "Não enviar": ${naoEnviar.dataCliente.cliente_nome}.`);
            setNaoEnviar(null);
          }}
        />
      )}
      {reabrindo && (
        <Modal
          aberto
          largura="sm"
          aoFechar={() => setReabrindo(null)}
          titulo="Voltar para pendente?"
          rodape={
            <>
              <Botao variante="fantasma" onClick={() => setReabrindo(null)}>
                Cancelar
              </Botao>
              <Botao
                variante="primario"
                onClick={async () => {
                  try {
                    await acao({ acao: "reabrir", dataClienteId: reabrindo.dataCliente.id, ano: reabrindo.ano }, "Felicitação voltou para Pendente.");
                  } catch (e) {
                    avisar("erro", e instanceof Error ? e.message : "Não foi possível alterar.");
                  }
                  setReabrindo(null);
                }}
              >
                Voltar para pendente
              </Botao>
            </>
          }
        >
          <p className="text-sm text-texto">
            A felicitação de <strong>{reabrindo.dataCliente.cliente_nome}</strong> ({anosTexto(reabrindo.anos)} de parceria) volta para Pendente. A alteração fica registrada no Histórico.
          </p>
        </Modal>
      )}
    </div>
  );
}

function StatusCelula({ a }: { a: AniversarioParceria }) {
  const r = a.registro;
  return (
    <span className="flex flex-col items-start gap-1">
      <Etiqueta tom={TOM_STATUS[a.status]}>{STATUS_FELICITACAO[a.status]}</Etiqueta>
      {a.status === "ENVIADO" && r && <span className="text-xs text-texto-suave">{quando(r.enviado_em)} · {r.enviado_por_nome}</span>}
      {a.status === "PREPARADO" && r && (
        <span className="text-xs text-texto-suave">
          {quando(r.preparado_em)} · {r.preparado_por_nome}
          {r.com_imagem ? " · com imagem" : ""}
        </span>
      )}
      {a.status === "ABERTO" && r && (
        <span className="text-xs text-texto-suave">
          {quando(r.whatsapp_aberto_em)} · {r.whatsapp_aberto_por_nome}
          {r.com_imagem ? " · com imagem" : ""}
        </span>
      )}
      {a.status === "NAO_ENVIAR" && <span className="text-xs text-texto-suave">{r?.motivo ?? (a.dataCliente.nao_enviar ? "Cliente não deseja receber mensagens" : "")}</span>}
    </span>
  );
}

function Acoes({
  a,
  aoPreparar,
  aoConfirmar,
  aoNaoEnviar,
  aoReabrir,
}: {
  a: AniversarioParceria;
  aoPreparar: (a: AniversarioParceria) => void;
  aoConfirmar: (a: AniversarioParceria) => void;
  aoNaoEnviar: (a: AniversarioParceria) => void;
  aoReabrir: (a: AniversarioParceria) => void;
}) {
  if (a.status === "ENVIADO") return <span className="block text-right text-xs text-verde-600">Registrado no histórico</span>;
  if (a.status === "NAO_ENVIAR")
    return a.registro ? (
      <div className="flex justify-end">
        <Botao tamanho="sm" variante="fantasma" icone={<Undo2 className="size-4" />} onClick={() => aoReabrir(a)}>
          Voltar para pendente
        </Botao>
      </div>
    ) : (
      <span className="block text-right text-xs text-texto-suave">Preferência do cliente (altere em Datas do Cliente)</span>
    );
  const semNumero = a.bloqueio === "Sem WhatsApp cadastrado" || a.bloqueio === "WhatsApp inválido";
  return (
    <div className="flex flex-wrap justify-end gap-1.5">
      <button type="button" className={VERDE_SM} onClick={() => aoPreparar(a)} title={semNumero ? `${a.bloqueio}: informe o número ao preparar` : undefined}>
        <ImageIcon className="size-4" aria-hidden />
        Preparar felicitação com imagem
      </button>
      <Botao tamanho="sm" icone={<Send className="size-4" />} onClick={() => aoConfirmar(a)}>
        Marcar como enviado
      </Botao>
      <Botao tamanho="sm" variante="fantasma" onClick={() => aoNaoEnviar(a)}>
        Não enviar
      </Botao>
      {(a.status === "PREPARADO" || a.status === "ABERTO") && (
        <Botao tamanho="sm" variante="fantasma" icone={<Undo2 className="size-4" />} onClick={() => aoReabrir(a)} aria-label="Voltar para pendente" />
      )}
    </div>
  );
}

function ConfirmarEnvio({
  a,
  padrao,
  usuarioNome,
  aoFechar,
  aoConfirmar,
}: {
  a: AniversarioParceria;
  padrao: ModeloFelicitacao | undefined;
  usuarioNome: string;
  aoFechar: () => void;
  aoConfirmar: (mensagem: string) => Promise<void>;
}) {
  const avisar = useAvisos();
  const [mensagem, setMensagem] = useState(a.registro?.mensagem ?? mensagemDoModelo(a, padrao));
  const [salvando, setSalvando] = useState(false);
  const agora = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, dateStyle: "short", timeStyle: "short" }).format(new Date()).replace(",", " às");
  const pendentes = variaveisPendentes(mensagem);
  return (
    <Modal
      aberto
      largura="md"
      aoFechar={aoFechar}
      titulo="Marcar como enviado"
      descricao="Confirme somente depois de enviar a mensagem no WhatsApp."
      rodape={
        <>
          <Botao variante="fantasma" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao
            variante="primario"
            carregando={salvando}
            disabled={!mensagem.trim() || pendentes.length > 0}
            icone={<CheckCircle2 className="size-4" />}
            onClick={async () => {
              setSalvando(true);
              try {
                await aoConfirmar(mensagem);
              } catch (e) {
                avisar("erro", e instanceof Error ? e.message : "Não foi possível registrar o envio.");
              } finally {
                setSalvando(false);
              }
            }}
          >
            Confirmar envio
          </Botao>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg bg-fundo px-4 py-3 text-[13px]">
          <div className="col-span-2">
            <dt className="text-texto-suave">Cliente</dt>
            <dd className="font-medium text-texto">{a.dataCliente.cliente_nome}</dd>
          </div>
          <div>
            <dt className="text-texto-suave">Anos de parceria</dt>
            <dd className="font-medium text-azul-700">{anosTexto(a.anos)}</dd>
          </div>
          <div>
            <dt className="text-texto-suave">Data e horário</dt>
            <dd className="numeros text-texto">{agora}</dd>
          </div>
          <div className="col-span-2">
            <dt className="text-texto-suave">Usuário responsável</dt>
            <dd className="text-texto">{usuarioNome}</dd>
          </div>
        </dl>
        <Campo label="Mensagem utilizada" htmlFor="fel-enviada" erro={pendentes.length ? `Preencha: ${pendentes.join(", ")}` : null}>
          <AreaTexto id="fel-enviada" rows={8} value={mensagem} onChange={(e) => setMensagem(e.target.value)} />
        </Campo>
      </div>
    </Modal>
  );
}

function NaoEnviar({ a, aoFechar, aoConfirmar }: { a: AniversarioParceria; aoFechar: () => void; aoConfirmar: (motivo: string) => Promise<void> }) {
  const avisar = useAvisos();
  const [motivo, setMotivo] = useState("");
  const [salvando, setSalvando] = useState(false);
  return (
    <Modal
      aberto
      largura="sm"
      aoFechar={aoFechar}
      titulo="Não enviar esta felicitação"
      rodape={
        <>
          <Botao variante="fantasma" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao
            variante="primario"
            carregando={salvando}
            onClick={async () => {
              setSalvando(true);
              try {
                await aoConfirmar(motivo.trim());
              } catch (e) {
                avisar("erro", e instanceof Error ? e.message : "Não foi possível alterar.");
              } finally {
                setSalvando(false);
              }
            }}
          >
            Confirmar
          </Botao>
        </>
      }
    >
      <div className="flex flex-col gap-3 text-sm">
        <p>
          <strong>{a.dataCliente.cliente_nome}</strong> — {anosTexto(a.anos)} de parceria em {formatarData(a.data)}.
        </p>
        <Campo label="Motivo (opcional)" htmlFor="fel-motivo">
          <Entrada id="fel-motivo" value={motivo} maxLength={300} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: cliente em negociação de saída" />
        </Campo>
        <p className="text-xs text-texto-suave">Vale só para este aniversário. Para o cliente nunca receber mensagens, marque a opção no cadastro dele (Datas do Cliente).</p>
      </div>
    </Modal>
  );
}

function ProximosAniversarios({ lista }: { lista: AniversarioParceria[] }) {
  return (
    <section className="rounded-xl border border-borda bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <h2 className="flex items-center gap-2 text-base font-semibold text-texto">
        <CalendarClock className="size-5 text-azul-600" /> Próximos aniversários
      </h2>
      <p className="mt-0.5 text-[13px] text-texto-suave">Próximos 30 dias</p>
      {lista.length === 0 ? (
        <p className="mt-4 text-[13px] text-texto-fraco">Nenhum aniversário de parceria nos próximos 30 dias.</p>
      ) : (
        <ul className="mt-3 flex flex-col divide-y divide-borda">
          {lista.slice(0, 12).map((a) => (
            <li key={a.chave} className="flex items-center justify-between gap-3 py-2 text-[13px]">
              <span className="min-w-0">
                <span className="block truncate font-medium text-texto">{a.dataCliente.cliente_nome}</span>
                <span className="text-texto-suave">
                  {anosTexto(a.anos)} · {a.whatsapp ? "com WhatsApp" : "sem WhatsApp"}
                </span>
              </span>
              <span className="numeros shrink-0 text-right">
                {formatarData(a.data)}
                <span className="block text-xs font-semibold text-azul-600">{textoDias(a.dias)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
      {lista.length > 12 && <p className="mt-2 text-xs text-texto-fraco">E mais {lista.length - 12}.</p>}
    </section>
  );
}

function Modelos({ modelos, exemplo }: { modelos: ModeloFelicitacao[]; exemplo: AniversarioParceria | null }) {
  const router = useRouter();
  const avisar = useAvisos();
  const [editando, setEditando] = useState<ModeloFelicitacao | "novo" | null>(null);
  const [form, setForm] = useState({ nome: "", texto: "", padrao: false, ativo: true });
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  function abrir(m: ModeloFelicitacao | "novo") {
    setErro(null);
    setEditando(m);
    setForm(m === "novo" ? { nome: "", texto: modelos.find((x) => x.padrao)?.texto ?? "", padrao: false, ativo: true } : { nome: m.nome, texto: m.texto, padrao: m.padrao, ativo: m.ativo });
  }

  async function salvar() {
    setSalvando(true);
    setErro(null);
    try {
      if (editando === "novo") await api("/api/felicitacoes/modelos", { corpo: { dados: form } });
      else if (editando) await api(`/api/felicitacoes/modelos/${editando.id}`, { metodo: "PUT", corpo: { dados: form, versao: editando.versao } });
      avisar("sucesso", "Modelo salvo.");
      setEditando(null);
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  }

  const exemploValores = exemplo
    ? valoresMensagem({ ...exemplo, empresa: exemplo.dataCliente.cliente_nome })
    : { empresa: "Empresa Exemplo Ltda", anos: "3", data: "01/03/2027", inicio: "03/2024" };
  const previa = montarMensagem(form.texto, exemploValores);

  return (
    <section className="rounded-xl border border-borda bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-texto">
            <MessageCircle className="size-5 text-azul-600" /> Modelos de mensagem
          </h2>
          <p className="mt-0.5 text-[13px] text-texto-suave">Variáveis: {"{empresa}"}, {"{anos}"}, {"{data}"} e {"{inicio}"}.</p>
        </div>
        <Botao tamanho="sm" onClick={() => abrir("novo")}>
          Novo modelo
        </Botao>
      </div>
      <ul className="mt-3 flex flex-col gap-2">
        {modelos.map((m) => (
          <li key={m.id} className={cx("rounded-lg border border-borda p-3", !m.ativo && "opacity-60")}>
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-texto">
                {m.nome} {m.padrao && <Etiqueta tom="azul">Padrão</Etiqueta>} {!m.ativo && <Etiqueta>Desativado</Etiqueta>}
              </span>
              <Botao tamanho="sm" variante="fantasma" onClick={() => abrir(m)}>
                Editar
              </Botao>
            </div>
            <p className="mt-1 line-clamp-2 whitespace-pre-line text-[13px] text-texto-suave">{m.texto}</p>
          </li>
        ))}
      </ul>

      <Modal
        aberto={editando !== null}
        aoFechar={() => setEditando(null)}
        largura="lg"
        titulo={editando === "novo" ? "Novo modelo" : "Editar modelo"}
        rodape={
          <>
            <Botao variante="fantasma" onClick={() => setEditando(null)}>
              Cancelar
            </Botao>
            <Botao variante="primario" carregando={salvando} onClick={salvar}>
              Salvar modelo
            </Botao>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {erro && <p className="rounded-lg bg-vermelho-50 px-3 py-2 text-[13px] text-vermelho-600">{erro}</p>}
          <Campo label="Nome do modelo" htmlFor="mod-nome" obrigatorio>
            <Entrada id="mod-nome" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
          </Campo>
          <Campo label="Texto" htmlFor="mod-texto" obrigatorio ajuda="Use {empresa}, {anos}, {data} e {inicio}. “{anos} anos” vira “1 ano” no primeiro aniversário.">
            <AreaTexto id="mod-texto" rows={9} value={form.texto} onChange={(e) => setForm({ ...form, texto: e.target.value })} />
          </Campo>
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" className="size-4 accent-azul-600" checked={form.padrao} onChange={(e) => setForm({ ...form, padrao: e.target.checked, ativo: e.target.checked ? true : form.ativo })} />
              Modelo padrão
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" className="size-4 accent-azul-600" checked={form.ativo} disabled={form.padrao} onChange={(e) => setForm({ ...form, ativo: e.target.checked })} />
              Ativo
            </label>
          </div>
          <div className="rounded-lg border border-borda bg-fundo px-4 py-3">
            <p className="text-xs font-semibold text-texto-suave">Prévia {exemplo ? `com ${exemplo.dataCliente.cliente_nome}` : "com dados de exemplo"}</p>
            <p className="mt-1 whitespace-pre-line text-[13px] text-texto">{previa.texto || "—"}</p>
            {previa.faltando.length > 0 && <p className="mt-2 text-xs font-medium text-vermelho-600">Variáveis desconhecidas: {previa.faltando.join(", ")}</p>}
          </div>
        </div>
      </Modal>
    </section>
  );
}
