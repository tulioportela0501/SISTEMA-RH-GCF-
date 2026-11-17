import { CabecalhoPagina } from "@/components/ui";
import { Importador } from "@/components/funcionarios/importador";
import { exigirUsuarioPagina } from "@/lib/server/auth";

export const metadata = { title: "Importar Excel" };

export default async function PaginaImportar() {
  await exigirUsuarioPagina("ADMIN");
  return (
    <>
      <CabecalhoPagina titulo="Importar Excel" descricao="Importa a planilha RH GCF Datas comemorativas preservando os valores originais." />
      <Importador />
    </>
  );
}
