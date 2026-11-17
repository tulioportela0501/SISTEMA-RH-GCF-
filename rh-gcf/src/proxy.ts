import { NextResponse, type NextRequest } from "next/server";

// Verificação otimista: sem cookie de sessão, vai para o login.
// A validação real da sessão e das permissões acontece no servidor (páginas e rotas da API).
export function proxy(request: NextRequest) {
  const temSessao = request.cookies.has("rhgcf_sessao");
  if (!temSessao) {
    const url = new URL("/login", request.url);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!login|api|_next/static|_next/image|brand|favicon.ico|icon.svg|robots.txt).*)"],
};
