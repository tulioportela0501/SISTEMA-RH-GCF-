"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Search } from "lucide-react";
import { Botao, Entrada, Modal, Selecao, cx } from "@/components/ui";
import { CAMPOS_LISTA, CAMPO_POR_CHAVE, CAMPOS_OBRIGATORIOS, ESTADOS_CONTROLE, MODALIDADES, SECOES, SITUACOES, type CampoChave } from "@/lib/domain/campos";
import { MESES } from "@/lib/domain/datas";
import { CAMPOS_EDICAO_LOTE, textoCelula, tipoFiltro, valoresDaColuna, type FiltroColuna, type FiltroVazio } from "@/lib/domain/planilha";
import type { ValoresCampos } from "@/lib/domain/tipos";

// ---------------------------------------------------------------------
// Painel flutuante (fica por cima da tabela, mesmo com rolagem)
// ---------------------------------------------------------------------

export function Flutuante({ ancora, largura = 280, aoFechar, children, rotulo }: { ancora: DOMRect; largura?: number; aoFechar: () => void; children: ReactNode; rotulo: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: ancora.bottom + 4, left: ancora.left });
  useLayoutEffect(() => {
    const altura = ref.current?.offsetHeight ?? 300;
    const left = Math.max(8, Math.min(ancora.left, window.innerWidth - largura - 8));
    const top = ancora.bottom + 4 + altura > window.innerHeight - 8 ? Math.max(8, ancora.top - altura - 4) : ancora.bottom + 4;
    setPos({ top, left });
  }, [ancora, largura]);
  useEffect(() => {
    const fora = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) aoFechar();
    };
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && aoFechar();
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", tecla);
    window.addEventListener("resize", aoFechar);
    return () => {
      document.removeEventListener("mousedown", fora);
      document.removeEventListener("keydown", tecla);
      window.removeEventListener("resize", aoFechar);
    };
  }, [aoFechar]);
  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-label={rotulo}
      style={{ top: pos.top, left: pos.left, width: largura }}
      className="fixed z-50 max-h-[70vh] overflow-y-auto rounded-xl border border-borda bg-white p-3 text-[13px] shadow-xl"
    >
      {children}
    </div>,
    document.body,
  );
}

function OpcoesVazio({ valor, onChange }: { valor: FiltroVazio | undefined; onChange: (v: FiltroVazio) => void }) {
  return (
    <fieldset className="mt-3 flex flex-wrap gap-x-3 gap-y-1">
      <legend className="mb-1 text-xs text-texto-suave">Preenchimento</legend>
      {(
        [
          ["todos", "Todos"],
          ["vazios", "Somente vazios"],
          ["preenchidos", "Somente preenchidos"],
        ] as const
      ).map(([v, l]) => (
        <label key={v} className="flex items-center gap-1.5">
          <input type="radio" className="accent-azul-600" checked={(valor ?? "todos") === v} onChange={() => onChange(v)} />
          {l}
        </label>
      ))}
    </fieldset>
  );
}

// ---------------------------------------------------------------------
// Filtro de uma coluna
// ---------------------------------------------------------------------

export function FiltroDaColuna({
  chave,
  filtro,
  linhas,
  onChange,
  onOrdenar,
}: {
  chave: CampoChave;
  filtro: FiltroColuna | undefined;
  linhas: Partial<ValoresCampos>[];
  onChange: (f: FiltroColuna | undefined) => void;
  onOrdenar: (d: "asc" | "desc") => void;
}) {
  const tipo = tipoFiltro(chave);
  const [procura, setProcura] = useState("");
  const valores = useMemo(() => (tipo === "valores" || tipo === "texto" ? valoresDaColuna(linhas, chave) : []), [linhas, chave, tipo]);
  const def = CAMPO_POR_CHAVE[chave];
  const crescente = def.tipo === "data" || def.tipo === "diames" ? "Mais antigo primeiro" : "A → Z";
  const decrescente = def.tipo === "data" || def.tipo === "diames" ? "Mais recente primeiro" : "Z → A";

  return (
    <div className="flex flex-col gap-2">
      <p className="font-semibold text-texto">{def.label}</p>
      <div className="grid grid-cols-2 gap-1.5">
        <Botao tamanho="sm" onClick={() => onOrdenar("asc")}>
          {crescente}
        </Botao>
        <Botao tamanho="sm" onClick={() => onOrdenar("desc")}>
          {decrescente}
        </Botao>
      </div>
      <hr className="my-1 border-borda" />

      {tipo === "valores" && filtro?.tipo !== "texto" && (
        <ListaValores
          valores={valores}
          marcados={filtro?.tipo === "valores" ? filtro.valores : []}
          procura={procura}
          setProcura={setProcura}
          onChange={(v) => onChange(v.length ? { tipo: "valores", valores: v } : undefined)}
        />
      )}

      {tipo === "texto" && (
        <>
          <label className="text-xs text-texto-suave" htmlFor={`f-${chave}`}>
            Contém
          </label>
          <Entrada
            id={`f-${chave}`}
            autoFocus
            className="h-9"
            placeholder={def.tipo === "telefone" ? "Número ou parte dele" : "Digite para filtrar"}
            value={filtro?.tipo === "texto" ? (filtro.termo ?? "") : ""}
            onChange={(e) => onChange({ tipo: "texto", termo: e.target.value, vazio: filtro?.tipo === "texto" ? filtro.vazio : undefined })}
          />
          <OpcoesVazio valor={filtro?.tipo === "texto" ? filtro.vazio : undefined} onChange={(v) => onChange({ tipo: "texto", termo: filtro?.tipo === "texto" ? filtro.termo : "", vazio: v })} />
        </>
      )}

      {tipo === "periodo" && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 text-xs text-texto-suave">
              De
              <Entrada type="date" className="h-9" value={filtro?.tipo === "periodo" ? (filtro.de ?? "") : ""} onChange={(e) => onChange({ ...(filtro?.tipo === "periodo" ? filtro : { tipo: "periodo" }), de: e.target.value || null })} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-texto-suave">
              Até
              <Entrada type="date" className="h-9" value={filtro?.tipo === "periodo" ? (filtro.ate ?? "") : ""} onChange={(e) => onChange({ ...(filtro?.tipo === "periodo" ? filtro : { tipo: "periodo" }), ate: e.target.value || null })} />
            </label>
          </div>
          <OpcoesVazio valor={filtro?.tipo === "periodo" ? filtro.vazio : undefined} onChange={(v) => onChange({ ...(filtro?.tipo === "periodo" ? filtro : { tipo: "periodo" }), vazio: v })} />
        </>
      )}

      {tipo === "diames" && (
        <>
          <div className="grid grid-cols-[1fr_80px] gap-2">
            <label className="flex flex-col gap-1 text-xs text-texto-suave">
              Mês
              <Selecao
                className="h-9"
                value={filtro?.tipo === "diames" ? (filtro.mes ?? "") : ""}
                onChange={(e) => onChange({ ...(filtro?.tipo === "diames" ? filtro : { tipo: "diames" }), mes: e.target.value ? Number(e.target.value) : null })}
              >
                <option value="">Todos</option>
                {MESES.map((m, i) => (
                  <option key={m} value={i + 1}>
                    {m.charAt(0).toUpperCase() + m.slice(1)}
                  </option>
                ))}
              </Selecao>
            </label>
            <label className="flex flex-col gap-1 text-xs text-texto-suave">
              Dia
              <Entrada
                type="number"
                min={1}
                max={31}
                className="h-9"
                value={filtro?.tipo === "diames" ? (filtro.dia ?? "") : ""}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  onChange({ ...(filtro?.tipo === "diames" ? filtro : { tipo: "diames" }), dia: n >= 1 && n <= 31 ? n : null });
                }}
              />
            </label>
          </div>
          <OpcoesVazio valor={filtro?.tipo === "diames" ? filtro.vazio : undefined} onChange={(v) => onChange({ ...(filtro?.tipo === "diames" ? filtro : { tipo: "diames" }), vazio: v })} />
        </>
      )}

      <div className="mt-2 flex justify-end">
        <Botao tamanho="sm" variante="fantasma" onClick={() => onChange(undefined)} disabled={!filtro}>
          Limpar filtro
        </Botao>
      </div>
    </div>
  );
}

function ListaValores({
  valores,
  marcados,
  procura,
  setProcura,
  onChange,
}: {
  valores: { valor: string; quantidade: number }[];
  marcados: string[];
  procura: string;
  setProcura: (v: string) => void;
  onChange: (v: string[]) => void;
}) {
  const visiveis = valores.filter((v) => !procura.trim() || (v.valor || "(vazio)").toLowerCase().includes(procura.trim().toLowerCase()));
  const marcado = (v: string) => marcados.some((m) => m.toLowerCase() === v.toLowerCase());
  return (
    <>
      {valores.length > 8 && (
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-texto-fraco" aria-hidden />
          <Entrada className="h-8 pl-8 text-[13px]" placeholder="Procurar valor" value={procura} onChange={(e) => setProcura(e.target.value)} />
        </div>
      )}
      <ul className="flex max-h-60 flex-col gap-0.5 overflow-y-auto">
        {visiveis.map((v) => (
          <li key={v.valor || "(vazio)"}>
            <label className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 hover:bg-fundo">
              <input
                type="checkbox"
                className="size-4 accent-azul-600"
                checked={marcado(v.valor)}
                onChange={() => onChange(marcado(v.valor) ? marcados.filter((m) => m.toLowerCase() !== v.valor.toLowerCase()) : [...marcados, v.valor])}
              />
              <span className={cx("flex-1 truncate", !v.valor && "italic text-texto-suave")}>{v.valor || "(vazio)"}</span>
              <span className="numeros text-xs text-texto-fraco">{v.quantidade}</span>
            </label>
          </li>
        ))}
      </ul>
    </>
  );
}

// ---------------------------------------------------------------------
// Colunas visíveis
// ---------------------------------------------------------------------

export function PainelColunas({ ocultas, onChange, onRestaurar }: { ocultas: Set<CampoChave>; onChange: (o: Set<CampoChave>) => void; onRestaurar: () => void }) {
  const total = CAMPOS_LISTA.length - ocultas.size;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <p className="font-semibold text-texto">Colunas ({total} de 34)</p>
        <div className="flex gap-1">
          <Botao tamanho="sm" variante="fantasma" onClick={() => onChange(new Set())}>
            Mostrar todas
          </Botao>
          <Botao tamanho="sm" variante="fantasma" onClick={onRestaurar}>
            Restaurar padrão
          </Botao>
        </div>
      </div>
      <p className="text-xs text-texto-suave">Ocultar só muda a tela: os dados continuam salvos e entram na exportação completa. Fica salvo para o seu usuário.</p>
      {([1, 2, 3, 4] as const).map((s) => (
        <fieldset key={s}>
          <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-texto-suave">{SECOES[s].titulo}</legend>
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
            {CAMPOS_LISTA.filter((c) => c.secao === s).map((c) => (
              <label key={c.chave} className={cx("flex items-center gap-2 rounded px-1 py-0.5", c.chave === "nome" ? "text-texto-fraco" : "cursor-pointer hover:bg-fundo")}>
                <input
                  type="checkbox"
                  className="size-4 accent-azul-600"
                  checked={!ocultas.has(c.chave)}
                  disabled={c.chave === "nome"}
                  onChange={() => {
                    const n = new Set(ocultas);
                    if (n.has(c.chave)) n.delete(c.chave);
                    else n.add(c.chave);
                    onChange(n);
                  }}
                />
                <span className="truncate">{c.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------
// Editor de valor (célula e edição em lote)
// ---------------------------------------------------------------------

/** Opções da lista suspensa: valores padrão + valores já cadastrados (preserva os originais). */
export function opcoesDaColuna(chave: CampoChave, linhas: Partial<ValoresCampos>[]): { valor: string; label: string }[] {
  const def = CAMPO_POR_CHAVE[chave];
  const padrao: { valor: string; label: string }[] =
    chave === "situacao"
      ? SITUACOES.map((v) => ({ valor: v, label: v }))
      : chave === "modalidade"
        ? MODALIDADES.map((v) => ({ valor: v, label: v }))
        : ESTADOS_CONTROLE.map((e) => ({ valor: e.valor, label: e.label }));
  const vistos = new Set(padrao.map((p) => p.valor.toLowerCase()));
  if (def.tipo === "controle") ["não se aplica", "nao se aplica"].forEach((v) => vistos.add(v));
  for (const l of linhas) {
    const v = l[chave]?.trim();
    if (v && !vistos.has(v.toLowerCase())) {
      vistos.add(v.toLowerCase());
      padrao.push({ valor: v, label: v });
    }
  }
  return padrao;
}

// ---------------------------------------------------------------------
// Edição em lote
// ---------------------------------------------------------------------

export function EdicaoEmLote({
  aberto,
  aoFechar,
  selecionados,
  linhas,
  aoAplicar,
}: {
  aberto: boolean;
  aoFechar: () => void;
  selecionados: { id: number; nome: string | null }[];
  linhas: Partial<ValoresCampos>[];
  aoAplicar: (campo: CampoChave, valor: string | null) => Promise<void>;
}) {
  const [campo, setCampo] = useState<CampoChave>("situacao");
  const [valor, setValor] = useState("");
  const [confirmar, setConfirmar] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const def = CAMPO_POR_CHAVE[campo];
  const obrigatorio = CAMPOS_OBRIGATORIOS.includes(campo);
  useEffect(() => {
    setValor("");
    setConfirmar(false);
  }, [campo, aberto]);

  const textoValor = valor.trim() ? textoCelula(campo, valor) : "(vazio)";
  return (
    <Modal
      aberto={aberto}
      aoFechar={aoFechar}
      largura="md"
      titulo="Editar em lote"
      descricao={`Aplica o mesmo valor em ${selecionados.length} ${selecionados.length === 1 ? "funcionário selecionado" : "funcionários selecionados"}. Cada alteração fica no Histórico.`}
      rodape={
        <>
          <Botao variante="fantasma" onClick={aoFechar}>
            Cancelar
          </Botao>
          {confirmar ? (
            <Botao
              variante="primario"
              carregando={salvando}
              onClick={async () => {
                setSalvando(true);
                try {
                  await aoAplicar(campo, valor.trim() || null);
                } finally {
                  setSalvando(false);
                }
              }}
            >
              Confirmar e aplicar
            </Botao>
          ) : (
            <Botao variante="primario" disabled={obrigatorio && !valor.trim()} onClick={() => setConfirmar(true)}>
              Continuar
            </Botao>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-4 text-sm">
        <label className="flex flex-col gap-1.5">
          <span className="font-medium text-texto">Campo</span>
          <Selecao value={campo} onChange={(e) => setCampo(e.target.value as CampoChave)} disabled={confirmar}>
            {CAMPOS_EDICAO_LOTE.map((k) => (
              <option key={k} value={k}>
                {CAMPO_POR_CHAVE[k].label}
              </option>
            ))}
          </Selecao>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="font-medium text-texto">Novo valor</span>
          {def.tipo === "lista" || def.tipo === "controle" ? (
            <Selecao value={valor} onChange={(e) => setValor(e.target.value)} disabled={confirmar}>
              <option value="">{obrigatorio ? "Escolha…" : "(deixar vazio)"}</option>
              {opcoesDaColuna(campo, linhas).map((o) => (
                <option key={o.valor} value={o.valor}>
                  {o.label}
                </option>
              ))}
            </Selecao>
          ) : def.tipo === "data" ? (
            <Entrada type="date" value={valor} onChange={(e) => setValor(e.target.value)} disabled={confirmar} />
          ) : (
            <Entrada value={valor} onChange={(e) => setValor(e.target.value)} disabled={confirmar} placeholder="Deixe vazio para apagar" />
          )}
        </label>
        {confirmar && (
          <div className="rounded-lg border border-ambar-200 bg-ambar-50 px-4 py-3">
            <p className="font-medium text-texto">
              {def.label} = {textoValor} em {selecionados.length} {selecionados.length === 1 ? "funcionário" : "funcionários"}:
            </p>
            <p className="mt-1 text-[13px] text-texto-suave">
              {selecionados
                .slice(0, 12)
                .map((s) => s.nome ?? "Sem nome")
                .join(", ")}
              {selecionados.length > 12 ? ` e mais ${selecionados.length - 12}` : ""}.
            </p>
          </div>
        )}
      </div>
    </Modal>
  );
}
