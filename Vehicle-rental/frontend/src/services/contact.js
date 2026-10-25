/** Links for contacting a car's owner. Phone numbers are free text, so keep only digits and a leading +. */
export const telHref = phone => `tel:${String(phone || "").replace(/[^\d+]/g, "")}`;

/** wa.me needs the number in international form without "+". South African numbers start with 0 locally. */
export function whatsappHref(phone) {
  const text = String(phone || "").trim();
  let digits = text.replace(/\D/g, "");
  if (!digits) return null;
  if (!text.startsWith("+")) {
    if (digits.startsWith("00")) digits = digits.slice(2);
    else if (digits.startsWith("0")) digits = `27${digits.slice(1)}`;
  }
  return `https://wa.me/${digits}`;
}
