"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, ClipboardCopy, Download, ImageIcon, ImageOff, MessageCircle, MessageSquareText } from "lucide-react";
import { AreaTexto, Aviso, Botao, Campo, Entrada, Modal, cx } from "@/components/ui";
import { useAvisos } from "@/components/avisos";
import { api, baixar } from "@/lib/cliente/api";
import { FalhaCopia, MENSAGENS_FALHA, copiaDeImagemIndisponivel, copiarImagem, copiarTexto, paraPng, type MotivoFalhaCopia } from "@/lib/cliente/area-transferencia";
import { FUSO } from "@/lib/domain/datas";
import { montarMensagem, valoresMensagem, variaveisPendentes, type AniversarioParceria, type ModeloFelicitacao } from "@/lib/domain/felicitacoes";
import { formatarWhatsapp, linkWhatsapp, normalizarWhatsapp } from "@/lib/domain/whatsapp";
import type { ImagemFelicitacaoInfo } from "@/lib/server/imagem-felicitacao";

/** Botão verde do WhatsApp (o tema do sistema é azul; o verde identifica a ação de WhatsApp). */
export const VERDE =
  "inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-[#1f9d55] px-4 text-sm font-medium text-white transition-colors hover:bg-[#178246] disabled:cursor-not-allowed disabled:bg-[#9fd3b5]";
export const VERDE_SM = VERDE.replace("h-10 px-4 text-sm", "h-8 px-3 text-[13px]");

export const urlImagem = (img: Pick<ImagemFelicitacaoInfo, "sha256">) => `/api/felicitacoes/imagem?v=${img.sha256.slice(0, 16)}`;
const anosTexto = (n: number) => `${n} ${n === 1 ? "ano" : "anos"}`;

type Orientacao = { tom: "verde" | "ambar" | "vermelho" | "azul"; texto: string } | null;

export function mensagemDoModelo(a: AniversarioParceria, modelo: ModeloFelicitacao | undefined): string {
  if (!modelo) return "";
  return montarMensagem(modelo.texto, valoresMensagem({ ...a, empresa: a.dataCliente.cliente_nome })).texto;
}

/**
 * Preparar felicitação com imagem: prévia da imagem e da mensagem, copiar imagem (Ctrl+V no WhatsApp),
 * copiar mensagem, baixar imagem, abrir o WhatsApp (wa.me com o texto) e confirmar o envio.
 * O link wa.me não anexa arquivos: a imagem vai pela área de transferência ou pelo download.
 */
export function PrepararFelicitacao({
  a,
  modelos,
  padrao,
  imagem,
  perfil,
  usuarioNome,
  aoFechar,
}: {
  a: AniversarioParceria;
  modelos: ModeloFelicitacao[];
  padrao: ModeloFelicitacao | undefined;
  imagem: ImagemFelicitacaoInfo | null;
  perfil: "ADMIN" | "USUARIO";
  usuarioNome: string;
  aoFechar: () => void;
}) {
  const router = useRouter();
  const avisar = useAvisos();
  const [modeloId, setModeloId] = useState<number | null>(a.registro?.modelo_id ?? padrao?.id ?? null);
  const modelo = modelos.find((m) => m.id === modeloId) ?? padrao;
  const [mensagem, setMensagem] = useState(a.registro?.mensagem ?? mensagemDoModelo(a, modelo));
  const [numero, setNumero] = useState(a.whatsapp ? formatarWhatsapp(a.whatsapp) : (a.dataCliente.whatsapp ?? ""));
  const [orientacao, setOrientacao] = useState<Orientacao>(null);
  const [mostrarBaixar, setMostrarBaixar] = useState(false);
  const [abriu, setAbriu] = useState(a.status === "ABERTO");
  const [copiando, setCopiando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [falhaImagem, setFalhaImagem] = useState(false);
  const [copiaFalhou, setCopiaFalhou] = useState(false);
  // Calculado só no navegador (depende de HTTPS/localhost e do suporte do navegador)
  const [indisponivel, setIndisponivel] = useState<MotivoFalhaCopia | null>(null);
  const png = useRef<Promise<Blob> | null>(null);
  const preparo = useRef<{ registrado: boolean; comImagem: boolean }>({ registrado: false, comImagem: false });
  const usouImagem = useRef(false);

  const numeroValido = normalizarWhatsapp(numero);
  const pendentes = variaveisPendentes(mensagem);
  const link = numeroValido && mensagem.trim() && pendentes.length === 0 ? linkWhatsapp(numeroValido, mensagem) : null;
  const bloqueio = !numero.trim()
    ? "Informe o WhatsApp do cliente."
    : !numeroValido
      ? "WhatsApp inválido: informe DDD + celular, ex.: (98) 99999-0000."
      : pendentes.length
        ? `A mensagem ainda tem campos sem preencher: ${pendentes.join(", ")}.`
        : !mensagem.trim()
          ? "Escreva a mensagem."
          : null;
  const temImagem = !!imagem && !falhaImagem;
  const podeCopiarImagem = temImagem && !indisponivel;

  // Prepara o PNG assim que a janela abre: no clique, a cópia começa na hora (exigência do navegador)
  useEffect(() => {
    setIndisponivel(copiaDeImagemIndisponivel());
    if (!imagem) return;
    const p = fetch(urlImagem(imagem), { credentials: "same-origin" })
      .then((r) => {
        if (!r.ok) throw new Error("Imagem indisponível.");
        return r.blob();
      })
      .then((b) => paraPng(b));
    p.catch(() => setFalhaImagem(true));
    png.current = p;
  }, [imagem]);

  const corpo = (acao: "preparar" | "abrir") => ({
    acao,
    dataClienteId: a.dataCliente.id,
    ano: a.ano,
    mensagem,
    modeloId: modelo?.id ?? null,
    whatsapp: numeroValido && numeroValido !== a.whatsapp ? numero : null,
    comImagem: usouImagem.current,
  });

  /** Registra "Felicitação preparada" (uma vez por janela, ou de novo se a imagem passou a ser usada). */
  function registrarPreparo() {
    if (bloqueio) return;
    if (preparo.current.registrado && (preparo.current.comImagem || !usouImagem.current)) return;
    preparo.current = { registrado: true, comImagem: usouImagem.current };
    api("/api/felicitacoes", { corpo: corpo("preparar") })
      .then(() => router.refresh())
      .catch((e) => {
        preparo.current.registrado = false;
        avisar("erro", e instanceof Error ? e.message : "Não foi possível registrar a felicitação preparada.");
      });
  }

  function registrarAbertura() {
    setAbriu(true);
    preparo.current = { registrado: true, comImagem: usouImagem.current };
    api("/api/felicitacoes", { corpo: corpo("abrir") })
      .then(() => router.refresh())
      .catch((e) => avisar("erro", e instanceof Error ? e.message : "Não foi possível registrar a abertura do WhatsApp."));
  }

  function falhou(e: unknown) {
    const motivo = e instanceof FalhaCopia ? e.motivo : "erro";
    setMostrarBaixar(true);
    setCopiaFalhou(true);
    setOrientacao({ tom: "ambar", texto: `${e instanceof FalhaCopia ? e.message : MENSAGENS_FALHA[motivo]} Use “Baixar imagem” e anexe pelo clipe (📎) do WhatsApp.` });
  }

  async function aoCopiarImagem(): Promise<boolean> {
    if (!png.current) return false;
    setCopiando(true);
    try {
      await copiarImagem(png.current);
      usouImagem.current = true;
      setOrientacao({ tom: "verde", texto: "Imagem copiada! Abra o WhatsApp e pressione Ctrl+V para anexar." });
      registrarPreparo();
      return true;
    } catch (e) {
      falhou(e);
      return false;
    } finally {
      setCopiando(false);
    }
  }

  /** Um clique: copia a imagem e abre o WhatsApp com a mensagem. */
  async function aoCopiarEAbrir() {
    if (!link) return;
    const ok = await aoCopiarImagem();
    if (!ok) return;
    const janela = window.open(link, "_blank");
    if (!janela) {
      setOrientacao({ tom: "ambar", texto: "Imagem copiada, mas o navegador bloqueou a nova aba. Clique em “Abrir WhatsApp”." });
      return;
    }
    registrarAbertura();
    setOrientacao({ tom: "verde", texto: "Imagem copiada e WhatsApp aberto em outra aba. Na conversa, pressione Ctrl+V para anexar a imagem e envie. Depois volte aqui e confirme o envio." });
  }

  async function aoCopiarMensagem() {
    try {
      await copiarTexto(mensagem);
      setOrientacao({ tom: "verde", texto: "Mensagem copiada! Cole na conversa com Ctrl+V." });
      registrarPreparo();
    } catch (e) {
      setOrientacao({ tom: "ambar", texto: e instanceof Error ? e.message : "Não foi possível copiar a mensagem." });
    }
  }

  async function aoBaixar() {
    try {
      await baixar("/api/felicitacoes/imagem?download=1");
      usouImagem.current = true;
      setOrientacao({ tom: "azul", texto: "Imagem baixada. No WhatsApp, anexe pelo clipe (📎) → Fotos e vídeos, ou arraste o arquivo para a conversa." });
      registrarPreparo();
    } catch (e) {
      setOrientacao({ tom: "vermelho", texto: e instanceof Error ? e.message : "Não foi possível baixar a imagem." });
    }
  }

  async function aoConfirmar() {
    setConfirmando(true);
    try {
      await api("/api/felicitacoes", { corpo: { acao: "enviado", dataClienteId: a.dataCliente.id, ano: a.ano, mensagem, comImagem: usouImagem.current || undefined } });
      avisar("sucesso", `Envio confirmado: ${a.dataCliente.cliente_nome}.`);
      aoFechar();
      router.refresh();
    } catch (e) {
      setOrientacao({ tom: "vermelho", texto: e instanceof Error ? e.message : "Não foi possível registrar o envio." });
    } finally {
      setConfirmando(false);
    }
  }

  function trocarModelo(id: number) {
    setModeloId(id);
    const m = modelos.find((x) => x.id === id);
    if (m) setMensagem(mensagemDoModelo(a, m));
  }

  const agora = useMemo(() => new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, dateStyle: "short", timeStyle: "short" }).format(new Date()).replace(",", " às"), []);

  return (
    <Modal
      aberto
      largura="amplo"
      aoFechar={aoFechar}
      titulo="Preparar felicitação com imagem"
      descricao="O sistema não envia nem anexa nada sozinho: copie a imagem, abra o WhatsApp, cole (Ctrl+V) e envie. Depois confirme aqui."
      rodape={
        <>
          <span className="mr-auto hidden self-center text-xs text-texto-fraco lg:block">
            {usuarioNome} · {agora}
          </span>
          <Botao variante="fantasma" onClick={aoFechar}>
            Fechar
          </Botao>
          {podeCopiarImagem && !copiaFalhou && (
            <button type="button" className={VERDE} disabled={!link || copiando} onClick={aoCopiarEAbrir} title={bloqueio ?? undefined}>
              <ImageIcon className="size-4 shrink-0" aria-hidden />
              Copiar imagem e abrir WhatsApp
            </button>
          )}
          <Botao variante={abriu ? "primario" : "secundario"} carregando={confirmando} disabled={!mensagem.trim() || pendentes.length > 0} icone={<CheckCircle2 className="size-4" />} onClick={aoConfirmar}>
            Confirmar envio
          </Botao>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg bg-fundo px-4 py-3 text-[13px] sm:grid-cols-4">
          <div className="col-span-2">
            <dt className="text-texto-suave">Empresa</dt>
            <dd className="font-medium text-texto">{a.dataCliente.cliente_nome}</dd>
          </div>
          <div>
            <dt className="text-texto-suave">Parceria</dt>
            <dd className="font-medium text-azul-700">{anosTexto(a.anos)}</dd>
          </div>
          <div>
            <dt className="text-texto-suave">Início GCF</dt>
            <dd className="numeros text-texto">{a.inicioGcf}</dd>
          </div>
        </dl>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-[300px_1fr]">
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium text-texto">Imagem</p>
            {imagem && !falhaImagem ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={urlImagem(imagem)} alt="Imagem de felicitação" className="max-h-72 w-full rounded-lg border border-borda bg-fundo object-contain" />
            ) : (
              <div className="flex h-40 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-borda bg-fundo px-4 text-center text-[13px] text-texto-suave">
                <ImageOff className="size-6" aria-hidden />
                {falhaImagem ? "Não foi possível carregar a imagem." : perfil === "ADMIN" ? "Nenhuma imagem cadastrada. Cadastre em “Imagem de felicitação”, nesta página." : "Nenhuma imagem cadastrada. Peça a um administrador para cadastrar."}
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <Botao tamanho="sm" icone={<ClipboardCopy className="size-4 shrink-0" />} disabled={!podeCopiarImagem} carregando={copiando} onClick={aoCopiarImagem}>
                Copiar imagem
              </Botao>
              <Botao tamanho="sm" variante={mostrarBaixar ? "primario" : "secundario"} icone={<Download className="size-4 shrink-0" />} disabled={!temImagem} onClick={aoBaixar}>
                Baixar imagem
              </Botao>
            </div>
            {temImagem && indisponivel && <p className="text-xs text-ambar-600">{MENSAGENS_FALHA[indisponivel]} Use “Baixar imagem”.</p>}
          </div>

          <div className="flex min-w-0 flex-col gap-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Campo label="WhatsApp do cliente" htmlFor="fel-zap" erro={numero.trim() && !numeroValido ? "Número inválido." : null} ajuda={numeroValido && numeroValido !== a.whatsapp ? "O número novo será salvo no cadastro." : undefined}>
                <Entrada id="fel-zap" type="tel" inputMode="tel" placeholder="(98) 99999-0000" value={numero} onChange={(e) => setNumero(e.target.value)} aria-invalid={!!numero.trim() && !numeroValido} />
              </Campo>
              <Campo label="Modelo" htmlFor="fel-modelo">
                <select id="fel-modelo" className="h-10 w-full rounded-lg border border-borda bg-white px-3 text-sm" value={modelo?.id ?? ""} onChange={(e) => trocarModelo(Number(e.target.value))}>
                  {modelos.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nome}
                      {m.padrao ? " (padrão)" : ""}
                    </option>
                  ))}
                </select>
              </Campo>
            </div>
            <Campo label="Mensagem (pode editar)" htmlFor="fel-msg" erro={pendentes.length ? `Preencha: ${pendentes.join(", ")}` : null}>
              <AreaTexto id="fel-msg" rows={8} value={mensagem} onChange={(e) => setMensagem(e.target.value)} />
            </Campo>
            <div className="flex flex-wrap gap-2">
              <Botao tamanho="sm" icone={<MessageSquareText className="size-4 shrink-0" />} disabled={!mensagem.trim()} onClick={aoCopiarMensagem}>
                Copiar mensagem
              </Botao>
              {link ? (
                <a href={link} target="_blank" rel="noopener noreferrer" className={VERDE_SM} onClick={registrarAbertura}>
                  <MessageCircle className="size-4 shrink-0" aria-hidden />
                  Abrir WhatsApp
                </a>
              ) : (
                <button type="button" className={VERDE_SM} disabled title={bloqueio ?? undefined}>
                  <MessageCircle className="size-4" aria-hidden />
                  Abrir WhatsApp
                </button>
              )}
            </div>
          </div>
        </div>

        <div aria-live="polite" className="flex flex-col gap-2">
          {orientacao && <Aviso tom={orientacao.tom}>{orientacao.texto}</Aviso>}
          {bloqueio && <Aviso tom="ambar">{bloqueio}</Aviso>}
          {abriu && !orientacao && <Aviso tom="azul">O WhatsApp já foi aberto para esta felicitação. Depois de enviar, clique em Confirmar envio.</Aviso>}
        </div>

        <ol className={cx("grid grid-cols-1 gap-1 rounded-lg bg-fundo px-4 py-3 text-xs text-texto-suave sm:grid-cols-3")}>
          {podeCopiarImagem && !copiaFalhou ? (
            <>
              <li>
                <strong className="text-texto">1.</strong> Copiar imagem e abrir WhatsApp (a conversa abre com a mensagem).
              </li>
              <li>
                <strong className="text-texto">2.</strong> No WhatsApp, Ctrl+V para anexar a imagem e enviar.
              </li>
              <li>
                <strong className="text-texto">3.</strong> Volte aqui e clique em Confirmar envio.
              </li>
            </>
          ) : (
            <>
              <li>
                <strong className="text-texto">1.</strong> {temImagem ? "Baixar imagem." : "Abrir WhatsApp (a conversa abre com a mensagem)."}
              </li>
              <li>
                <strong className="text-texto">2.</strong> {temImagem ? "Abrir WhatsApp e anexar a imagem pelo clipe (📎)." : "Enviar a mensagem no WhatsApp."}
              </li>
              <li>
                <strong className="text-texto">3.</strong> Volte aqui e clique em Confirmar envio.
              </li>
            </>
          )}
        </ol>
      </div>
    </Modal>
  );
}
