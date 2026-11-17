"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { AlertTriangle, Save } from "lucide-react";
import { Aviso, Botao, Campo, Cartao, Entrada, Selecao, cx } from "@/components/ui";
import { useAvisos } from "@/components/avisos";
import { api, ErroApi } from "@/lib/cliente/api";
import { CAMPOS_LISTA, CAMPOS_OBRIGATORIOS, ESTADOS_CONTROLE, SECOES, type CampoChave, type CampoDef } from "@/lib/domain/campos";
import { formatarDiaMes, isDataISO, montar, partes } from "@/lib/domain/datas";
import { conferirObrigatorios } from "@/lib/domain/validacao";
import type { Funcionario, StatusVinculo, ValoresCampos } from "@/lib/domain/tipos";

type Estado = Record<CampoChave, string>;
const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Valor do banco → valor exibido no campo. */
function paraTela(def: CampoDef, v: string | null | undefined): string {
  if (v == null) return "";
  return def.tipo === "diames" ? formatarDiaMes(v) : v;
}

/** "DD/MM" → data ISO, mantendo o ano original (nos aniversários o ano é ignorado). */
function diaMesParaIso(texto: string, original: string | null | undefined): string | null | "invalido" {
  const t = texto.trim();
  if (!t) return null;
  const m = /^(\d{1,2})\/(\d{1,2})$/.exec(t);
  if (!m) return "invalido";
  const ano = original ? partes(original).ano : 2000;
  const iso = montar(ano, Number(m[2]), Number(m[1]));
  if (isDataISO(iso)) return iso;
  const bissexto = montar(2000, Number(m[2]), Number(m[1]));
  return isDataISO(bissexto) ? bissexto : "invalido";
}

function mascaraDiaMes(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 4);
  return d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
}

export function FormularioFuncionario({ modo, funcionario, admin }: { modo: "criacao" | "edicao"; funcionario?: Funcionario; admin: boolean }) {
  const router = useRouter();
  const avisar = useAvisos();
  const inicial = useMemo(() => Object.fromEntries(CAMPOS_LISTA.map((c) => [c.chave, paraTela(c, funcionario?.[c.chave])])) as Estado, [funcionario]);
  const [valores, setValores] = useState<Estado>(inicial);
  const [status, setStatus] = useState<StatusVinculo>(funcionario?.status_vinculo ?? "ATIVO");
  const [erros, setErros] = useState<Partial<Record<CampoChave, string>>>({});
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const definir = (k: CampoChave, v: string) => {
    setValores((s) => ({ ...s, [k]: v }));
    if (erros[k]) setErros((e) => ({ ...e, [k]: undefined }));
  };

  function focar(campo: CampoChave) {
    const el = document.getElementById(`campo-${campo}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(() => el?.focus(), 250);
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErroGeral(null);
    const dados: Partial<ValoresCampos> = {};
    const errosCampos: Partial<Record<CampoChave, string>> = {};
    for (const c of CAMPOS_LISTA) {
      const v = valores[c.chave].trim();
      if (c.tipo === "diames") {
        const iso = diaMesParaIso(v, funcionario?.[c.chave]);
        if (iso === "invalido") errosCampos[c.chave] = "Use o formato DD/MM (ex.: 24/05).";
        else dados[c.chave] = iso;
      } else if (c.tipo === "data") {
        if (v && !isDataISO(v)) errosCampos[c.chave] = "Data inválida.";
        dados[c.chave] = v || null;
      } else {
        if (c.tipo === "email" && v && !RE_EMAIL.test(v)) errosCampos[c.chave] = "E-mail inválido.";
        dados[c.chave] = v || null;
      }
    }

    // Os quatro obrigatórios: Nome, Situação, Modalidade e Admissão
    const faltando = conferirObrigatorios(dados, modo, funcionario);
    if (faltando) {
      setErros({ ...errosCampos, [faltando.campo]: "Preenchimento obrigatório." });
      setErroGeral(faltando.mensagem);
      avisar("erro", faltando.mensagem);
      focar(faltando.campo);
      return;
    }
    const primeiroErro = Object.keys(errosCampos)[0] as CampoChave | undefined;
    if (primeiroErro) {
      setErros(errosCampos);
      setErroGeral("Corrija os campos destacados antes de salvar.");
      focar(primeiroErro);
      return;
    }

    setSalvando(true);
    try {
      if (modo === "criacao") {
        const r = await api<{ funcionario: Funcionario }>("/api/funcionarios", { corpo: { dados, status_vinculo: status } });
        avisar("sucesso", `${r.funcionario.nome} cadastrado.`);
        router.push(`/funcionarios/${r.funcionario.id}`);
      } else {
        const r = await api<{ alteracoes: number; aviso: string | null }>(`/api/funcionarios/${funcionario!.id}`, {
          metodo: "PUT",
          corpo: { dados, status_vinculo: admin ? status : undefined, versao: funcionario!.versao },
        });
        avisar(r.aviso ? "alerta" : "sucesso", r.aviso ?? (r.alteracoes ? `Salvo. ${r.alteracoes} ${r.alteracoes === 1 ? "alteração registrada" : "alterações registradas"} no histórico.` : "Nenhuma alteração para salvar."));
        router.push(`/funcionarios/${funcionario!.id}`);
      }
      router.refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Não foi possível salvar.";
      setErroGeral(msg);
      avisar("erro", msg);
      if (err instanceof ErroApi && typeof err.dados.campo === "string") {
        setErros((x) => ({ ...x, [err.dados.campo as CampoChave]: "Preenchimento obrigatório." }));
        focar(err.dados.campo as CampoChave);
      }
      setSalvando(false);
    }
  }

  function renderCampo(c: CampoDef) {
    const id = `campo-${c.chave}`;
    const erro = erros[c.chave];
    const comum = { id, "aria-invalid": erro ? true : undefined } as const;
    let controle: React.ReactNode;
    if (c.tipo === "lista") {
      const atual = valores[c.chave];
      const opcoes: string[] = [...(c.opcoes ?? [])];
      if (atual && !opcoes.includes(atual)) opcoes.push(atual);
      controle = (
        <Selecao {...comum} value={atual} onChange={(e) => definir(c.chave, e.target.value)}>
          <option value="">Selecione</option>
          {opcoes.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </Selecao>
      );
    } else if (c.tipo === "controle") {
      const atual = valores[c.chave];
      const conhecidos: string[] = ESTADOS_CONTROLE.map((o) => o.valor);
      const original = funcionario?.[c.chave] ?? "";
      const extras = [original, atual].filter((v, i, a) => v && !conhecidos.includes(v) && a.indexOf(v) === i);
      controle = (
        <Selecao
          {...comum}
          value={atual}
          onChange={(e) => definir(c.chave, e.target.value)}
          className={cx(atual === "OK" && "border-verde-200 bg-verde-50", atual === "Pendente" && "border-ambar-200 bg-ambar-50", !atual && "text-texto-fraco")}
        >
          <option value="">Em branco</option>
          {ESTADOS_CONTROLE.map((o) => (
            <option key={o.valor} value={o.valor}>
              {o.label}
            </option>
          ))}
          {extras.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </Selecao>
      );
    } else if (c.tipo === "diames") {
      controle = <Entrada {...comum} inputMode="numeric" placeholder="DD/MM" maxLength={5} value={valores[c.chave]} onChange={(e) => definir(c.chave, mascaraDiaMes(e.target.value))} />;
    } else if (c.tipo === "data") {
      controle = <Entrada {...comum} type="date" min="1900-01-01" max="2200-12-31" value={valores[c.chave]} onChange={(e) => definir(c.chave, e.target.value)} />;
    } else {
      controle = (
        <Entrada
          {...comum}
          type={c.tipo === "email" ? "email" : c.tipo === "telefone" ? "tel" : "text"}
          inputMode={c.tipo === "telefone" ? "tel" : c.tipo === "email" ? "email" : undefined}
          autoComplete="off"
          value={valores[c.chave]}
          onChange={(e) => definir(c.chave, e.target.value)}
        />
      );
    }
    return (
      <Campo key={c.chave} htmlFor={id} label={c.label} obrigatorio={CAMPOS_OBRIGATORIOS.includes(c.chave)} erro={erro} ajuda={c.tipo === "diames" ? "Dia e mês" : undefined} className={c.chave === "contato_emergencia" ? "sm:col-span-2" : undefined}>
        {controle}
      </Campo>
    );
  }

  return (
    <form onSubmit={salvar} noValidate className="pb-24">
      {erroGeral && (
        <div className="mb-5">
          <Aviso tom="vermelho" icone={<AlertTriangle className="size-4" />}>
            {erroGeral}
          </Aviso>
        </div>
      )}
      <div className="flex flex-col gap-5">
        {([1, 2, 3, 4] as const).map((s) => (
          <Cartao key={s} titulo={SECOES[s].titulo} descricao={SECOES[s].descricao}>
            <div className={s === 4 ? "grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5" : "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"}>
              {CAMPOS_LISTA.filter((c) => c.secao === s).map(renderCampo)}
              {s === 1 && (
                <Campo
                  htmlFor="campo-status"
                  label="Status do vínculo"
                  ajuda={admin ? "Desligados saem do dashboard e dos alertas." : "Somente o administrador altera."}
                >
                  <Selecao
                    id="campo-status"
                    value={status}
                    disabled={!admin}
                    onChange={(e) => setStatus(e.target.value as StatusVinculo)}
                    className={status === "DESLIGADO" ? "border-vermelho-200 bg-vermelho-50 text-vermelho-600" : undefined}
                  >
                    <option value="ATIVO">Ativo</option>
                    <option value="DESLIGADO">Desligado</option>
                  </Selecao>
                </Campo>
              )}
            </div>
          </Cartao>
        ))}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-borda bg-white/95 backdrop-blur lg:left-60">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <p className="hidden text-[13px] text-texto-suave sm:block">
            <span className="text-vermelho-600">*</span> Obrigatórios: Nome, Situação, Modalidade e Admissão.
          </p>
          <div className="ml-auto flex gap-2">
            <Botao type="button" variante="fantasma" onClick={() => router.back()}>
              Cancelar
            </Botao>
            <Botao type="submit" variante="primario" carregando={salvando} icone={<Save className="size-4" />}>
              Salvar
            </Botao>
          </div>
        </div>
      </div>
    </form>
  );
}
