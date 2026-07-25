# Game-chooser Home at the locale root, with English game slugs and localized titles

The Tannino Incazzato rebrand turns the platform into a multi-game shell. The locale root `/[locale]` becomes a **game-chooser Home** ("Scegli il gioco" / "Choose a game") that lists the games — currently one live game plus non-clickable "coming soon" cards. The existing setup screen (filter selection + start) moves off the root to its own game route. Post-login and the Google OAuth callback land on this Home.

Game routes use **English URL slugs on every locale** while the **displayed title is localized**. The only live game is reached at `/[locale]/wine-map` and shows "Wine Map" on `/en` and "Mappa dei Vini" on `/it`. The URL segment is always `wine-map`, never `mappa-dei-vini`.

## Considered Options

**Keeping the setup screen at the locale root (reskin only)** was rejected because the brand direction is explicitly a multi-game platform; without a Home the "coming soon" games and the `← Giochi` navigation have nowhere to live, and a later move would be the same breaking change deferred.

**Localized pathnames via next-intl** (`/en/wine-map` ↔ `/it/mappa-dei-vini`) were rejected: they add a pathname-mapping config and widen the surface that `proxy.ts` and the E2E suite must account for, for a cosmetic gain on the Italian URL. We chose stable English slugs so the URL space is locale-invariant while the visible name still translates like any other UI string.

**Italian brand slug on both locales** (`/[locale]/mappa-dei-vini`) was rejected because, unlike denomination names (which are intentionally always Italian), the game *title* is a translatable UI label; pinning the slug to one language's brand spelling would be inconsistent with translating the title.

## Consequences

- The Google OAuth callback's hardcoded `{FRONTEND_URL}/en` redirect (`backend/app/auth/router.py`) now lands on the new Home chooser rather than the setup screen. This remains a valid destination; the pre-existing locale-insensitivity (always `/en`) is unchanged and out of scope here.
- `proxy.ts` needs no new public-path entry: the new routes sit behind the default auth guard (only `/login` and `/register` are public).
- E2E specs that navigate to setup at the locale root, and any assertions on the moved copy, must be updated to `/[locale]/wine-map`.
- Adding a future game means a new card on the Home and a new `/[locale]/<english-slug>` route; the title for it is added to the i18n message catalogs.
