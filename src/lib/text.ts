const PHONE_LIKE = /(?:\+?\d[\s\-().]*){8,}/g;
const EMAIL_LIKE = /[^\s@]+@[^\s@]+\.[^\s@]{2,}/g;
const UPI_LIKE = /\b[\w.\-]{2,}@[a-z]{2,}\b/gi;

export const HIDDEN_CONTACT = "[contact hidden until booking is confirmed]";

/**
 * Before a booking is confirmed, phone numbers, emails and UPI ids in chat are hidden.
 * This keeps deals, and payments, inside the app where complaints and reviews can protect both people.
 */
export function maskContactDetails(text: string): { text: string; masked: boolean } {
  let masked = false;
  const swap = (re: RegExp) => {
    text = text.replace(re, () => {
      masked = true;
      return HIDDEN_CONTACT;
    });
  };
  swap(EMAIL_LIKE);
  swap(UPI_LIKE);
  swap(PHONE_LIKE);
  return { text, masked };
}

/** Collapse whitespace and trim, for free-text fields. */
export function clean(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/** Only allow same-site paths as post-login redirects. */
export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return "/";
  return next;
}
