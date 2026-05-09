'use client';
import LanguageToggle from './LanguageToggle';
import { useAuth } from '@/context/AuthContext';
import { useRouter, Link } from '@/i18n/navigation';

export default function Header() {
  const { user, logout } = useAuth();
  const router = useRouter();

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  return (
    <header className="w-full flex items-center justify-between px-8 py-4 bg-white border-b border-border">
      <div className="flex items-baseline gap-3">
        <span
          className="font-extrabold tracking-tight text-charcoal leading-none"
          style={{ fontFamily: 'var(--font-bricolage)', fontSize: '1.25rem' }}
        >
          Sommelier
        </span>
        <span
          className="font-medium text-crimson text-xs tracking-widest uppercase"
          style={{ fontFamily: 'var(--font-dm-sans)', letterSpacing: '0.14em' }}
        >
          Italia
        </span>
        {user && (
          <Link
            href="/profile"
            className="flex items-center gap-1.5 text-muted hover:text-charcoal transition-colors"
            style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="8" r="4" />
              <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
            </svg>
            — Ciao, <span className="font-semibold text-charcoal">{user.first_name}</span>
          </Link>
        )}
      </div>
      <div className="flex items-center gap-4">
        <LanguageToggle />
        {user && (
          <button
            onClick={handleLogout}
            className="text-muted hover:text-charcoal transition-colors"
            style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem' }}
          >
            Esci
          </button>
        )}
      </div>
    </header>
  );
}
