import { CabecalhoPagina } from "@/components/ui";
import { FormularioFuncionario } from "@/components/funcionarios/formulario";
import { exigirUsuarioPagina } from "@/lib/server/auth";

export const metadata = { title: "Novo Cadastro" };

export default async function NovoFuncionario() {
  const u = await exigirUsuarioPagina();
  return (
    <>
      <CabecalhoPagina titulo="Novo Cadastro" descricao="Nome, Situação, Modalidade e Admissão são obrigatórios. Os demais campos podem ser preenchidos depois." />
      <FormularioFuncionario modo="criacao" admin={u.perfil === "ADMIN"} />
    </>
  );
}
