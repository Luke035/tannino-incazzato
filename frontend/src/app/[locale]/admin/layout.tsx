'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Mascot } from '@/components/Mascot';
import LanguageToggle from '@/components/LanguageToggle';
import { Link, useRouter } from '@/i18n/navigation';
import { useAuth } from '@/context/AuthContext';

/**
 * The panel's shell — navigation and layout, no features.
 *
 * Two guards, matching the two answers ADR 0014 asks for. The API refuses a
 * non-admin with 403; the browser redirects one away. Here is the browser
 * half: once identity has loaded, anyone who is not an admin is sent home. The
 * proxy has already turned away the unauthenticated at the edge, so the only
 * caller who reaches this is a signed-in player, and a player does not belong
 * here.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const t = useTranslations('admin');
  const { user, loading } = useAuth();
  const router = useRouter();

  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    if (loading) return;
    if (!isAdmin) router.replace('/');
  }, [loading, isAdmin, router]);

  // Until identity resolves — or while redirecting a non-admin away — the panel
  // shows nothing but a holding state, never a flash of admin chrome.
  if (loading || !isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg">
        <div className="flex items-center gap-3 text-muted" style={{ fontFamily: 'var(--font-sans)' }}>
          <Mascot mood="skeptical" size={40} />
          <span>{t('loading')}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-bg text-ink">
      <header className="w-full flex items-center justify-between px-4 sm:px-8 py-3 sm:py-4 bg-surface border-b border-border">
        <div className="flex items-center gap-3">
          <Mascot mood="skeptical" size={36} />
          <span
            className="font-extrabold tracking-tight text-primary leading-none lowercase"
            style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem' }}
          >
            {t('brand')}
          </span>
        </div>
        <div className="flex items-center gap-3 sm:gap-6">
          <LanguageToggle />
          <Link
            href="/"
            className="text-muted hover:text-ink transition-colors"
            style={{ fontFamily: 'var(--font-sans)', fontSize: '0.9rem' }}
          >
            {t('backToApp')}
          </Link>
        </div>
      </header>

      <div className="flex flex-1 flex-col md:flex-row">
        <AdminNav />
        <main className="flex-1 px-4 sm:px-8 py-6 sm:py-10">{children}</main>
      </div>
    </div>
  );
}

/**
 * The left pill-nav. It lists the sections every later slice will fill —
 * Overview is live, the rest are placeholders carrying a "Soon" chip — so the
 * shape the panel grows into is decided here, in this slice, as the spec asks.
 */
function AdminNav() {
  const t = useTranslations('admin');

  const items: { key: string; href: string | null }[] = [
    { key: 'overview', href: '/admin' },
    { key: 'users', href: null },
    { key: 'questionBank', href: null },
    { key: 'corrections', href: null },
  ];

  return (
    <nav className="md:w-56 shrink-0 px-4 sm:px-6 py-6 md:border-r border-border">
      <ul className="flex md:flex-col gap-2">
        {items.map((item) => (
          <li key={item.key}>
            {item.href ? (
              <Link
                href={item.href}
                className="pill block px-4 py-2 bg-surface-2 text-ink text-sm font-semibold hover:bg-border transition-colors whitespace-nowrap"
                style={{ fontFamily: 'var(--font-sans)' }}
              >
                {t(`nav.${item.key}`)}
              </Link>
            ) : (
              <span
                className="pill flex items-center gap-2 px-4 py-2 text-sm font-semibold text-faint cursor-default whitespace-nowrap"
                style={{ fontFamily: 'var(--font-sans)' }}
                aria-disabled="true"
              >
                {t(`nav.${item.key}`)}
                <span
                  className="pill bg-soon text-muted px-2 py-0.5 uppercase"
                  style={{ fontSize: '0.55rem', letterSpacing: '0.08em' }}
                >
                  {t('soon')}
                </span>
              </span>
            )}
          </li>
        ))}
      </ul>
    </nav>
  );
}
