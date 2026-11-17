import Link from "next/link";
import { AlertTriangle, CalendarClock, CalendarDays, CheckCircle2, Clock, GraduationCap, PartyPopper, UserX, Users } from "lucide-react";
import { CabecalhoPagina, Cartao } from "@/components/ui";
import { cx } from "@/lib/cx";
import { CartaoEvento, ListaCartoes, estiloPorDias } from "@/components/eventos";
import { exigirUsuarioPagina } from "@/lib/server/auth";
import { dadosDashboard } from "@/lib/server/consultas";

export const metadata = { title: "Dashboard" };

function Indicador({ href, rotulo, valor, legenda, icone, cor, borda }: { href: string; rotulo: string; valor: number; legenda: string; icone: React.ReactNode; cor: string; borda?: string }) {
  return (
    <Link href={href} className={cx("rounded-xl border bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-shadow hover:shadow-md", borda ?? "border-borda")}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-[13px] text-texto-suave">{rotulo}</p>
        <span className={cor}>{icone}</span>
      </div>
      <p className={cx("numeros mt-2 text-3xl font-bold", cor)}>{valor}</p>
      <p className="mt-1 text-xs text-texto-suave">{legenda}</p>
    </Link>
  );
}

export default async function Dashboard() {
  await exigirUsuarioPagina();
  const d = await dadosDashboard();
  const i = d.indicadores;
  const a = d.alertas;

  return (
    <>
      <CabecalhoPagina titulo="Dashboard" descricao="Visão geral dos funcionários e das datas importantes" />

      <section aria-label="Indicadores" className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
        <Indicador href="/funcionarios?filtro=ativos" rotulo="Funcionários ativos" valor={i.funcionariosAtivos} legenda={`${i.totalAtivos} ativos contando estagiários`} icone={<Users className="size-5" />} cor="text-azul-600" />
        <Indicador href="/funcionarios?filtro=ativos&situacao=Estagi%C3%A1rio" rotulo="Estagiários ativos" valor={i.estagiariosAtivos} legenda="Situação Estagiário" icone={<GraduationCap className="size-5" />} cor="text-azul-600" />
        <Indicador href="/funcionarios?filtro=desligados" rotulo="Desligados" valor={i.desligados} legenda="Fora dos indicadores e alertas" icone={<UserX className="size-5" />} cor="text-vermelho-600" borda="border-vermelho-200" />
        <Indicador href="/funcionarios?filtro=ativos&cadastro=completos" rotulo="Cadastros completos" valor={i.completos} legenda="Funcionários ativos" icone={<CheckCircle2 className="size-5" />} cor="text-verde-600" />
        <Indicador href="/funcionarios?filtro=ativos&cadastro=incompletos" rotulo="Cadastros incompletos" valor={i.incompletos} legenda="Com informações faltando" icone={<AlertTriangle className="size-5" />} cor="text-ambar-600" borda="border-ambar-200" />
      </section>

      {a.hoje.length > 0 && (
        <Cartao className="mt-6 border-verde-200" titulo="Hoje" icone={<PartyPopper className="size-5 text-verde-600" />}>
          <ul className="grid grid-cols-1 gap-2.5 md:grid-cols-2 xl:grid-cols-3">
            {a.hoje.map((e) => (
              <li key={e.chave}>
                <CartaoEvento evento={e} estilo="hoje" />
              </li>
            ))}
          </ul>
        </Cartao>
      )}

      <section aria-label="Alertas" className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Cartao titulo="Próximos 7 dias" icone={<Clock className="size-5 text-ambar-500" />}>
          <ListaCartoes eventos={a.ate7} estilo="ambar" vazio="Nenhuma data nos próximos 7 dias." />
        </Cartao>
        <Cartao titulo="De 8 a 15 dias" icone={<CalendarClock className="size-5 text-azul-500" />}>
          <ListaCartoes eventos={a.ate15} estilo="azul" vazio="Nenhuma data entre 8 e 15 dias." />
        </Cartao>
        <Cartao titulo="De 16 a 30 dias" icone={<CalendarDays className="size-5 text-texto-suave" />}>
          <ListaCartoes eventos={a.ate30} estilo="neutro" vazio="Nenhuma data entre 16 e 30 dias." />
        </Cartao>
      </section>

      <hr className="my-8 border-borda" />

      <div className="mb-4">
        <h2 className="text-lg font-bold text-texto">Aniversários e datas importantes</h2>
        <p className="text-sm text-texto-suave">Mês atual e próximo mês, atualizados automaticamente pelo calendário.</p>
      </div>
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Cartao titulo={<span className="first-letter:uppercase">{d.meses.atual.nome}</span>} descricao={`${d.mesAtual.length} datas no mês atual`}>
          <ListaCartoes eventos={d.mesAtual} estilo={estiloPorDias} vazio="Nenhuma data neste mês." />
        </Cartao>
        <Cartao titulo={<span className="first-letter:uppercase">{d.meses.proximo.nome}</span>} descricao={`${d.proximoMes.length} datas no próximo mês`}>
          <ListaCartoes eventos={d.proximoMes} estilo={estiloPorDias} vazio="Nenhuma data no próximo mês." />
        </Cartao>
      </section>
    </>
  );
}
