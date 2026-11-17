import { CabecalhoPagina } from "@/components/ui";
import { GestaoUsuarios } from "@/components/usuarios";
import { exigirUsuarioPagina } from "@/lib/server/auth";
import { listarUsuarios } from "@/lib/server/usuarios";

export const metadata = { title: "Usuários" };

export default async function PaginaUsuarios() {
  const u = await exigirUsuarioPagina("ADMIN");
  const usuarios = await listarUsuarios();
  return (
    <>
      <CabecalhoPagina titulo="Usuários e acessos" descricao="Administradores também importam a planilha e alteram o Status do vínculo. Usuários comuns cadastram e editam." />
      <GestaoUsuarios
        usuarios={usuarios.map((x) => ({ ...x, ultimo_login_em: x.ultimo_login_em ? new Date(x.ultimo_login_em).toISOString() : null, bloqueado_ate: null }))}
        euId={u.id}
      />
    </>
  );
}
