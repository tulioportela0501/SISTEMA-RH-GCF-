/**
 * Números de WhatsApp e links oficiais (https://wa.me/NUMERO?text=MENSAGEM).
 * Nenhuma mensagem é enviada pelo sistema: o link abre o WhatsApp e o funcionário envia.
 */

/**
 * Celular brasileiro no formato internacional (+55 DDD 9XXXX-XXXX). Aceita com ou sem +55, espaços, parênteses e traços.
 * Retorna null se não for um celular válido (DDD inexistente, fixo ou número incompleto).
 */
export function normalizarWhatsapp(v: string | null | undefined): string | null {
  if (!v) return null;
  let d = v.replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("0") && (d.length === 11 || d.length === 12)) d = d.slice(1); // 0 + DDD (discagem nacional)
  if (d.length === 10 || d.length === 11) d = `55${d}`;
  // DDDs brasileiros válidos: 11–99 sem 0 no segundo dígito, celular começando por 9 e com 9 dígitos
  if (!/^55[1-9][1-9]9\d{8}$/.test(d)) return null;
  if (!DDDS.has(Number(d.slice(2, 4)))) return null;
  return `+${d}`;
}

const DDDS = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 24, 27, 28, 31, 32, 33, 34, 35, 37, 38, 41, 42, 43, 44, 45, 46, 47, 48, 49, 51, 53, 54, 55, 61, 62, 63,
  64, 65, 66, 67, 68, 69, 71, 73, 74, 75, 77, 79, 81, 82, 83, 84, 85, 86, 87, 88, 89, 91, 92, 93, 94, 95, 96, 97, 98, 99,
]);

/** "(98) 99999-0000" a partir do número guardado. */
export function formatarWhatsapp(v: string | null | undefined): string {
  const n = normalizarWhatsapp(v);
  if (!n) return v ?? "";
  return `(${n.slice(3, 5)}) ${n.slice(5, 10)}-${n.slice(10)}`;
}

/** Link oficial do WhatsApp com a mensagem já preenchida (codificada em UTF-8 para URL). */
export function linkWhatsapp(numero: string, mensagem: string): string | null {
  const n = normalizarWhatsapp(numero);
  if (!n) return null;
  return `https://wa.me/${n.slice(1)}?text=${encodeURIComponent(mensagem)}`;
}
