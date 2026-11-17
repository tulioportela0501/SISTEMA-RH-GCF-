/**
 * Validação de CNPJ numérico e alfanumérico (IN RFB nº 2.229/2024, vigente a partir de jul/2026).
 * Cada caractere vale (código ASCII − 48); os dígitos verificadores continuam numéricos.
 */

export function limparCnpj(v: string): string {
  return v.toUpperCase().replace(/[^0-9A-Z]/g, "");
}

function valor(c: string): number {
  return c.charCodeAt(0) - 48;
}

function dv(base: string): number {
  let peso = 2;
  let soma = 0;
  for (let i = base.length - 1; i >= 0; i--) {
    soma += valor(base[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

export function cnpjValido(v: string): boolean {
  const c = limparCnpj(v);
  if (!/^[0-9A-Z]{12}[0-9]{2}$/.test(c)) return false;
  if (/^(\d)\1{13}$/.test(c)) return false;
  const d1 = dv(c.slice(0, 12));
  const d2 = dv(c.slice(0, 12) + d1);
  return c.endsWith(`${d1}${d2}`);
}

export function formatarCnpj(v: string): string {
  const c = limparCnpj(v);
  if (c.length !== 14) return v;
  return `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}`;
}
