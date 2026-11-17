import { CabecalhoPagina } from "@/components/ui";
import { DatasDoMes } from "@/components/datas/datas-do-mes";
import { GestaoDatasComemorativas } from "@/components/datas/gestao-comemorativas";
import { exigirUsuarioPagina } from "@/lib/server/auth";
import { eventosDoPeriodo } from "@/lib/server/consultas";
import { listarDatasComemorativas } from "@/lib/server/datas";
import { fimDoMes, hojeFortaleza, inicioDoMes, partes } from "@/lib/domain/datas";

export const metadata = { title: "Datas Comemorativas" };

export default async function PaginaDatasComemorativas() {
  await exigirUsuarioPagina();
  const hoje = hojeFortaleza();
  const { ano, mes } = partes(hoje);
  const [eventos, datas] = await Promise.all([eventosDoPeriodo(inicioDoMes(ano, mes), fimDoMes(ano, mes), hoje), listarDatasComemorativas()]);
  return (
    <>
      <CabecalhoPagina
        titulo="Datas Comemorativas"
        descricao="Aniversários dos funcionários e familiares, tempo de empresa, férias e outras datas importantes. Funcionários desligados não aparecem."
      />
      <DatasDoMes hoje={hoje} eventosIniciais={eventos} />
      <div className="mt-6">
        <GestaoDatasComemorativas datas={datas} />
      </div>
    </>
  );
}
