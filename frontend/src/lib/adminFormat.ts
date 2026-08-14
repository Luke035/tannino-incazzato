// Shared date formatting for the admin panel (#41). Kept in `lib/` rather than
// on a route page so both the list and a player's own page can lean on one
// implementation, and the locale decides the display format.
export function formatDate(iso: string, locale: string): string {
  return new Date(iso).toLocaleDateString(locale === 'it' ? 'it-IT' : 'en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}
