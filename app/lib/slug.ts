/**
 * Converts any string to a URL-friendly slug.
 * Example: "Pós-Graduação em Radiologia (2026)" → "pos-graduacao-em-radiologia-2026"
 */
export function slugify(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip diacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')    // non-alphanumeric → dash
    .replace(/^-+|-+$/g, '')        // trim edge dashes
    .replace(/-{2,}/g, '-');        // collapse consecutive dashes
}

/**
 * Given a slug and a list of course names, returns the matching original name.
 * Falls back to decoding as a legacy URL-encoded name if no match is found.
 */
export function resolveCourseName(slug: string, courseNames: string[]): string {
  // 1. Try exact match (legacy: name passed directly or decoded from %XX)
  const decoded = decodeURIComponent(slug).trim();
  if (courseNames.includes(decoded)) return decoded;

  // 2. Try slug match
  const match = courseNames.find(n => slugify(n) === slug.toLowerCase());
  if (match) return match;

  // 3. Return decoded as best guess (handles direct name in URL)
  return decoded;
}
