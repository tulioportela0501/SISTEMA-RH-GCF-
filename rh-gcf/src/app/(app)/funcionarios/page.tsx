import { CabecalhoPagina } from "@/components/ui";
import { PlanilhaFuncionarios } from "@/components/funcionarios/planilha";
import { exigirUsuarioPagina } from "@/lib/server/auth";
import { funcionariosComAnalise } from "@/lib/server/consultas";
import { obterPreferenciaPlanilha } from "@/lib/server/preferencias";
import type { FiltrosColunas } from "@/lib/domain/planilha";

export const metadata = { title: "Funcionários" };

export default async function PaginaFuncionarios({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const u = await exigirUsuarioPagina();
  const sp = await searchParams;
  const [funcionarios, preferencia] = await Promise.all([funcionariosComAnalise(), obterPreferenciaPlanilha(u.id)]);
  const vinculo = sp.filtro === "todos" || sp.filtro === "desligados" ? sp.filtro : "ativos";
  // Links do dashboard (?situacao=…, ?modalidade=…, ?cadastro=…) viram filtros das colunas
  const colunas: FiltrosColunas = {};
  if (sp.situacao) colunas.situacao = { tipo: "valores", valores: [sp.situacao.slice(0, 60)] };
  if (sp.modalidade) colunas.modalidade = { tipo: "valores", valores: [sp.modalidade.slice(0, 60)] };
  const cadastro = sp.cadastro === "completos" || sp.cadastro === "incompletos" ? sp.cadastro : null;
  return (
    <>
      <CabecalhoPagina titulo="Funcionários" descricao="Planilha Geral com as 34 colunas da aba Base. Clique em uma célula para editar." />
      <PlanilhaFuncionarios
        key={`${vinculo}|${sp.situacao ?? ""}|${sp.modalidade ?? ""}|${cadastro ?? ""}`}
        funcionarios={funcionarios}
        perfil={u.perfil}
        preferencia={preferencia}
        inicial={{ vinculo, cadastro, colunas }}
      />
    </>
  );
}
