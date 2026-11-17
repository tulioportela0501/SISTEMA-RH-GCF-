/** Remove acentos, caixa e pontuação (comparação de cabeçalhos). */
export function normalizarTexto(v: string): string {
  return v
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

/** Nome normalizado para pesquisa e detecção de duplicidades. */
export function normalizarNome(v: string | null | undefined): string {
  return (v ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}
