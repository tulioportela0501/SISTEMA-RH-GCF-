import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowLeft, Pencil } from "lucide-react";
import { Aviso, BotaoLink, CabecalhoPagina, Cartao, Etiqueta } from "@/components/ui";
import { SeloCadastro, SeloVinculo } from "@/components/funcionarios/selos";
import { BotaoReativar } from "@/components/funcionarios/botao-reativar";
import { exigirUsuarioPagina } from "@/lib/server/auth";
import { obterFuncionario } from "@/lib/server/funcionarios";
import { CAMPOS_LISTA, SECOES, type CampoDef } from "@/lib/domain/campos";
import { formatarData, formatarDiaMes } from "@/lib/domain/datas";
import { analisarCadastro } from "@/lib/domain/pendencias";
import type { Funcionario } from "@/lib/domain/tipos";

export const metadata = { title: "Funcionário" };

function Valor({ def, f }: { def: CampoDef; f: Funcionario }) {
  const v = f[def.chave];
  if (!v) return <span className="text-texto-fraco">—</span>;
  if (def.tipo === "controle") {
    if (v === "OK") return <Etiqueta tom="verde">OK</Etiqueta>;
    if (v === "Pendente") return <Etiqueta tom="ambar">Pendente</Etiqueta>;
    return <Etiqueta>{v}</Etiqueta>;
  }
  if (def.tipo === "data") return <span className="numeros">{formatarData(v)}</span>;
  if (def.tipo === "diames") return <span className="numeros">{formatarDiaMes(v)}</span>;
  if (def.tipo === "email")
    return (
      <a href={`mailto:${v}`} className="break-all text-azul-600 hover:underline">
        {v}
      </a>
    );
  return <span className="break-words">{v}</span>;
}

export default async function FichaFuncionario({ params }: { params: Promise<{ id: string }> }) {
  const u = await exigirUsuarioPagina();
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const f = await obterFuncionario(id);
  if (!f) notFound();
  const analise = analisarCadastro(f);
  const desligado = f.status_vinculo === "DESLIGADO";

  return (
    <>
      <Link href="/funcionarios" className="mb-3 inline-flex items-center gap-1 text-[13px] text-texto-suave hover:text-azul-600">
        <ArrowLeft className="size-3.5" /> Funcionários
      </Link>
      <CabecalhoPagina
        titulo={f.nome || "Sem nome"}
        descricao={
          <span className="mt-1 flex flex-wrap items-center gap-1.5">
            <SeloVinculo status={f.status_vinculo} />
            <SeloCadastro analise={analise} />
            {f.origem === "IMPORTACAO" && f.linha_planilha && <span className="text-xs text-texto-fraco">Importado da linha {f.linha_planilha} da planilha</span>}
          </span>
        }
        acoes={
          <>
            {desligado && u.perfil === "ADMIN" && <BotaoReativar id={f.id} nome={f.nome ?? "funcionário"} versao={f.versao} />}
            <BotaoLink href={`/funcionarios/${f.id}/editar`} variante="primario" icone={<Pencil className="size-4" />}>
              Editar
            </BotaoLink>
          </>
        }
      />

      {desligado && (
        <div className="mb-5">
          <Aviso tom="vermelho" titulo={`Desligado${f.desligado_em ? ` em ${formatarData(f.desligado_em)}` : ""}`}>
            Não aparece nos indicadores de funcionários ativos nem gera alertas de aniversário. Os dados continuam salvos para consulta e edição.
          </Aviso>
        </div>
      )}
      {analise.pendencias.length > 0 && (
        <div className="mb-5">
          <Aviso tom={analise.basicoCompleto ? "ambar" : "vermelho"} titulo="Cadastro incompleto" icone={<AlertTriangle className="size-4" />}>
            Falta: {analise.pendencias.map((p) => (p.motivo === "Não preenchido" || p.motivo === "Campo obrigatório" ? p.label : `${p.label} (${p.motivo.toLowerCase()})`)).join(", ")}.{" "}
            <Link href={`/funcionarios/${f.id}/editar`} className="font-semibold text-azul-600 hover:underline">
              Completar cadastro
            </Link>
          </Aviso>
        </div>
      )}

      <div className="flex flex-col gap-5">
        {([1, 2, 3, 4] as const).map((s) => (
          <Cartao key={s} titulo={SECOES[s].titulo}>
            <dl className={s === 4 ? "grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 lg:grid-cols-5" : "grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-4"}>
              {CAMPOS_LISTA.filter((c) => c.secao === s).map((c) => (
                <div key={c.chave} className={c.chave === "contato_emergencia" ? "sm:col-span-2" : undefined}>
                  <dt className="text-xs text-texto-suave">{c.label}</dt>
                  <dd className="mt-0.5 text-sm text-texto">
                    <Valor def={c} f={f} />
                  </dd>
                </div>
              ))}
              {s === 1 && (
                <div>
                  <dt className="text-xs text-texto-suave">Status do vínculo</dt>
                  <dd className="mt-0.5">
                    <SeloVinculo status={f.status_vinculo} />
                  </dd>
                </div>
              )}
            </dl>
          </Cartao>
        ))}
      </div>
    </>
  );
}
