import { notFound } from "next/navigation";
import { CabecalhoPagina } from "@/components/ui";
import { FormularioFuncionario } from "@/components/funcionarios/formulario";
import { exigirUsuarioPagina } from "@/lib/server/auth";
import { obterFuncionario } from "@/lib/server/funcionarios";

export const metadata = { title: "Editar funcionário" };

export default async function EditarFuncionario({ params }: { params: Promise<{ id: string }> }) {
  const u = await exigirUsuarioPagina();
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const f = await obterFuncionario(id);
  if (!f) notFound();
  return (
    <>
      <CabecalhoPagina titulo={`Editar: ${f.nome ?? "funcionário"}`} descricao="As alterações ficam registradas no Histórico com o valor anterior e o novo." />
      <FormularioFuncionario modo="edicao" funcionario={f} admin={u.perfil === "ADMIN"} />
    </>
  );
}
