'use client';
import { useTranslations } from 'next-intl';
import LanguageToggle from './LanguageToggle';
import { Mascot } from './Mascot';
import { useAuth } from '@/context/AuthContext';
import { useRouter, Link } from '@/i18n/navigation';

export default function Header() {
  const t = useTranslations('admin');
  const { user, logout } = useAuth();
  const router = useRouter();

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  return (
    <header className="w-full flex items-center justify-between px-4 sm:px-8 py-3 sm:py-4 bg-surface border-b border-border">
      <div className="flex items-center gap-6">
        <Link href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
          <Mascot mood="skeptical" size={36} />
          {/* On a phone the mascot alone carries the brand — the wordmark would
              push the header past the viewport width. */}
          <div className="hidden sm:flex items-baseline gap-2">
            <span
              className="font-extrabold tracking-tight text-ink leading-none lowercase"
              style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem' }}
            >
              tannino
            </span>
            <span
              className="font-extrabold text-primary text-sm tracking-tight leading-none lowercase"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              incazzato
            </span>
          </div>
        </Link>
      </div>

      <div className="flex items-center gap-3 sm:gap-6">
        <LanguageToggle />
        {user && (
          <>
            {user.role === 'admin' && (
              <Link
                href="/admin"
                className="px-3 sm:px-4 py-2 rounded-full bg-accent text-white text-sm font-semibold hover:opacity-90 transition-opacity whitespace-nowrap"
                style={{ fontFamily: 'var(--font-sans)' }}
              >
                {t('brand')}
              </Link>
            )}
            <Link
              href="/profile"
              className="px-3 sm:px-4 py-2 rounded-full bg-surface-2 text-ink text-sm font-semibold hover:bg-border transition-colors whitespace-nowrap"
              style={{ fontFamily: 'var(--font-sans)' }}
            >
              Profilo
            </Link>
            <button
              onClick={handleLogout}
              className="text-muted hover:text-ink transition-colors"
              style={{ fontFamily: 'var(--font-sans)', fontSize: '0.9rem' }}
            >
              Esci
            </button>
          </>
        )}
      </div>
    </header>
  );
}
