"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Building2, CalendarHeart, ChevronUp, History, KeyRound, LayoutDashboard, LogOut, PanelLeft, Shield, UserRound, Users, X } from "lucide-react";
import { Botao, Campo, Entrada, Modal, cx } from "./ui";
import { ProvedorAvisos, useAvisos } from "./avisos";
import { api } from "@/lib/cliente/api";
import type { UsuarioSessao } from "@/lib/domain/tipos";

/** As abas do sistema. */
const MENU = [
  { href: "/", label: "Dashboard", icone: LayoutDashboard },
  { href: "/funcionarios", label: "Funcionários", icone: Users },
  { href: "/datas-comemorativas", label: "Datas Comemorativas", icone: CalendarHeart },
  { href: "/datas-cliente", label: "Datas do Cliente", icone: Building2 },
  { href: "/historico", label: "Histórico", icone: History },
];

function ativo(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

function AlterarSenha({ aberto, aoFechar }: { aberto: boolean; aoFechar: () => void }) {
  const avisar = useAvisos();
  const [atual, setAtual] = useState("");
  const [nova, setNova] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      await api("/api/perfil/senha", { corpo: { senhaAtual: atual, novaSenha: nova } });
      avisar("sucesso", "Senha alterada.");
      setAtual("");
      setNova("");
      aoFechar();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível alterar a senha.");
    } finally {
      setEnviando(false);
    }
  }
  return (
    <Modal aberto={aberto} aoFechar={aoFechar} titulo="Alterar senha" largura="sm">
      <form onSubmit={salvar} className="flex flex-col gap-4">
        {erro && <p className="rounded-lg bg-vermelho-50 px-3 py-2 text-[13px] text-vermelho-600">{erro}</p>}
        <Campo label="Senha atual" htmlFor="senha-atual">
          <Entrada id="senha-atual" type="password" autoComplete="current-password" value={atual} onChange={(e) => setAtual(e.target.value)} />
        </Campo>
        <Campo label="Nova senha" htmlFor="senha-nova" ajuda="Pelo menos 10 caracteres, com letras e números.">
          <Entrada id="senha-nova" type="password" autoComplete="new-password" value={nova} onChange={(e) => setNova(e.target.value)} />
        </Campo>
        <div className="flex justify-end gap-2">
          <Botao type="button" variante="fantasma" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao type="submit" variante="primario" carregando={enviando}>
            Salvar
          </Botao>
        </div>
      </form>
    </Modal>
  );
}

function MenuUsuario({ usuario }: { usuario: UsuarioSessao }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [senha, setSenha] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setAberto(false);
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, [aberto]);

  async function sair() {
    await api("/api/auth/sair", { metodo: "POST" }).catch(() => {});
    router.replace("/login");
    router.refresh();
  }

  return (
    <div ref={ref} className="relative border-t border-white/10 p-3">
      {aberto && (
        <div className="absolute inset-x-3 bottom-full mb-2 overflow-hidden rounded-lg border border-white/10 bg-marinho-800 py-1 shadow-xl">
          <button onClick={() => (setSenha(true), setAberto(false))} className="flex w-full items-center gap-3 px-3 py-2 text-left text-[13px] text-slate-200 hover:bg-white/5">
            <KeyRound className="size-4 text-marinho-300" /> Alterar senha
          </button>
          {usuario.perfil === "ADMIN" && (
            <Link href="/usuarios" onClick={() => setAberto(false)} className="flex items-center gap-3 px-3 py-2 text-[13px] text-slate-200 hover:bg-white/5">
              <Shield className="size-4 text-marinho-300" /> Usuários e acessos
            </Link>
          )}
          <button onClick={sair} className="flex w-full items-center gap-3 px-3 py-2 text-left text-[13px] text-slate-200 hover:bg-white/5">
            <LogOut className="size-4 text-marinho-300" /> Sair
          </button>
        </div>
      )}
      <button onClick={() => setAberto((v) => !v)} aria-expanded={aberto} className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-white/5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-azul-500 text-white">
          <UserRound className="size-4" />
        </span>
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block truncate text-[13px] font-semibold text-white">{usuario.nome}</span>
          <span className="block truncate text-xs text-marinho-300">
            {usuario.login}, {usuario.perfil === "ADMIN" ? "administrador" : "usuário"}
          </span>
        </span>
        <ChevronUp className={cx("size-4 text-marinho-300 transition-transform", !aberto && "rotate-180")} />
      </button>
      <AlterarSenha aberto={senha} aoFechar={() => setSenha(false)} />
    </div>
  );
}

function BarraLateral({ usuario, aoNavegar }: { usuario: UsuarioSessao; aoNavegar?: () => void }) {
  const pathname = usePathname();
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 px-5 py-5">
        <Image src="/brand/logo-marca.png" alt="Grupo Conceito Fiscal" width={36} height={36} className="size-9" priority />
        <div className="leading-tight">
          <p className="text-sm font-bold text-white">GCF RH</p>
          <p className="text-xs text-marinho-300">Controle de funcionários</p>
        </div>
      </div>
      <nav aria-label="Menu principal" className="flex-1 overflow-y-auto px-3">
        <ul className="flex flex-col gap-0.5">
          {MENU.map((m) => {
            const sel = ativo(pathname, m.href);
            const Icone = m.icone;
            return (
              <li key={m.href}>
                <Link
                  href={m.href}
                  onClick={aoNavegar}
                  aria-current={sel ? "page" : undefined}
                  className={cx("flex h-9 items-center gap-3 rounded-lg px-3 text-[13px] font-semibold transition-colors", sel ? "bg-marinho-800 text-white" : "text-slate-300 hover:bg-white/5 hover:text-white")}
                >
                  <Icone className={cx("size-4", sel ? "text-azul-400" : "text-slate-400")} aria-hidden />
                  {m.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <MenuUsuario usuario={usuario} />
    </div>
  );
}

export function Shell({ usuario, children }: { usuario: UsuarioSessao; children: React.ReactNode }) {
  const pathname = usePathname();
  const [gaveta, setGaveta] = useState(false);
  const [recolhida, setRecolhida] = useState(false);

  return (
    <ProvedorAvisos>
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[70] focus:rounded-md focus:bg-white focus:px-3 focus:py-2">
        Ir para o conteúdo
      </a>
      <div className="flex min-h-dvh">
        <aside className={cx("fixed inset-y-0 left-0 z-30 hidden w-60 bg-marinho-900", !recolhida && "lg:block")}>
          <BarraLateral usuario={usuario} />
        </aside>
        {gaveta && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <div className="absolute inset-0 bg-marinho-950/60" onClick={() => setGaveta(false)} />
            <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-marinho-900 shadow-2xl">
              <button onClick={() => setGaveta(false)} className="absolute right-3 top-5 rounded-md p-1 text-marinho-300 hover:text-white" aria-label="Fechar menu">
                <X className="size-5" />
              </button>
              <BarraLateral usuario={usuario} aoNavegar={() => setGaveta(false)} />
            </aside>
          </div>
        )}
        <div className={cx("flex min-w-0 flex-1 flex-col", !recolhida && "lg:pl-60")}>
          <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-borda bg-white px-4 sm:px-6">
            <button onClick={() => setGaveta(true)} className="rounded-md p-1.5 text-texto-suave hover:bg-fundo lg:hidden" aria-label="Abrir menu">
              <PanelLeft className="size-5" />
            </button>
            <button onClick={() => setRecolhida((v) => !v)} className="hidden rounded-md p-1.5 text-texto-suave hover:bg-fundo lg:block" aria-label={recolhida ? "Mostrar menu" : "Recolher menu"}>
              <PanelLeft className="size-5" />
            </button>
          </header>
          <main id="conteudo" className={cx("mx-auto w-full flex-1 px-4 py-6 sm:px-6 lg:px-8", pathname === "/funcionarios" ? "max-w-none" : "max-w-[1400px]")}>
            {children}
          </main>
        </div>
      </div>
    </ProvedorAvisos>
  );
}
