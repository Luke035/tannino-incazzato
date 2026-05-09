'use client';
import { useState } from 'react';
import { Link, useRouter } from '@/i18n/navigation';
import { useSearchParams } from 'next/navigation';
import { apiLogin } from '@/lib/auth';
import { useAuth } from '@/context/AuthContext';

const FLOATING = [
  'Barolo', 'Brunello', 'Amarone', 'Franciacorta', 'Chianti',
  'Soave', 'Prosecco', 'Primitivo', 'Montepulciano', 'Nebbiolo',
  'Vermentino', 'Vernaccia',
];

export default function LoginPage() {
  const { setUser } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const result = await apiLogin({ email, password });
    setLoading(false);
    if ('error' in result) {
      setError('Email o password non corretti.');
      return;
    }
    setUser(result.user);
    const next = searchParams.get('next');
    router.push(next ?? '/');
  };

  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? '';

  return (
    <div className="min-h-screen grid md:grid-cols-[3fr_2fr]">

      {/* ── Left: dark atmospheric panel ─────────────── */}
      <div className="auth-panel relative overflow-hidden hidden md:flex flex-col justify-between p-14">

        {FLOATING.map((name, i) => (
          <span
            key={i}
            className="absolute font-extrabold select-none pointer-events-none whitespace-nowrap"
            style={{
              fontFamily: 'var(--font-bricolage)',
              fontSize: `${2.6 + (i % 4) * 1.5}rem`,
              color: 'rgba(255,255,255,0.08)',
              top: `${(i * 9.1) % 88}%`,
              left: `${(i * 13.7 + 4) % 80}%`,
              rotate: `${-18 + (i % 6) * 7}deg`,
              animation: `auth-float ${7 + i * 0.7}s ease-in-out infinite alternate`,
              animationDelay: `${i * 0.5}s`,
            }}
          >
            {name}
          </span>
        ))}

        <div>
          <div className="flex items-baseline gap-3">
            <span className="font-extrabold" style={{ fontFamily: 'var(--font-bricolage)', fontSize: '1.1rem', color: 'rgba(255,255,255,0.88)' }}>
              Sommelier
            </span>
            <span className="font-medium uppercase" style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', letterSpacing: '0.16em', color: 'rgba(193,0,31,0.75)' }}>
              Italia
            </span>
          </div>
          <div className="mt-4 h-px w-10" style={{ background: 'rgba(255,255,255,0.12)' }} />
        </div>

        <div className="z-10 relative">
          <p className="uppercase mb-6" style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.58rem', letterSpacing: '0.24em', color: 'rgba(255,255,255,0.28)' }}>
            L'arte della denominazione
          </p>
          <h2 className="font-extrabold leading-none" style={{ fontFamily: 'var(--font-bricolage)', fontSize: 'clamp(2.8rem, 4.5vw, 4.8rem)', lineHeight: 0.94, color: 'rgba(255,255,255,0.9)' }}>
            Ogni vino<br />ha la sua<br />
            <span style={{ color: 'rgba(193,0,31,0.72)' }}>terra.</span>
          </h2>
          <p className="mt-5 leading-relaxed max-w-sm" style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.85rem', color: 'rgba(255,255,255,0.32)' }}>
            410 denominazioni DOC e DOCG delle 20 regioni italiane. Allenati. Impara. Diventa esperto.
          </p>
        </div>
      </div>

      {/* ── Right: form panel ────────────────────────── */}
      <div className="flex flex-col min-h-screen md:min-h-0 bg-white">

        <div className="flex items-baseline gap-2.5 px-8 py-5 md:hidden border-b border-border">
          <span className="font-extrabold text-charcoal" style={{ fontFamily: 'var(--font-bricolage)', fontSize: '1.1rem' }}>Sommelier</span>
          <span className="text-crimson font-medium uppercase" style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', letterSpacing: '0.14em' }}>Italia</span>
        </div>

        <div className="flex-1 flex items-center justify-center px-10 py-16">
          <div className="w-full max-w-[340px]">

            <div className="mb-10">
              <p className="text-crimson font-semibold uppercase mb-3" style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.6rem', letterSpacing: '0.22em' }}>
                Bentornato
              </p>
              <h1 className="font-extrabold text-charcoal leading-none" style={{ fontFamily: 'var(--font-bricolage)', fontSize: 'clamp(2.8rem, 5vw, 3.8rem)', lineHeight: 0.93 }}>
                Accedi
              </h1>
            </div>

            {/* Google */}
            <a
              href={`${apiUrl}/auth/google`}
              className="w-full flex items-center justify-center gap-3 py-3 rounded-md border border-border hover:bg-surface transition-colors mb-6"
              style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.88rem', color: 'var(--charcoal)' }}
            >
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Continua con Google
            </a>

            <div className="relative flex items-center gap-4 mb-6">
              <div className="flex-1 h-px bg-border" />
              <span className="uppercase text-subtle" style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.58rem', letterSpacing: '0.16em' }}>oppure</span>
              <div className="flex-1 h-px bg-border" />
            </div>

            <form className="flex flex-col gap-5" onSubmit={handleSubmit}>

              {error && (
                <p className="text-crimson text-sm rounded-md bg-crimson/5 border border-crimson/20 px-3 py-2" style={{ fontFamily: 'var(--font-dm-sans)' }}>
                  {error}
                </p>
              )}

              <div className="flex flex-col gap-1.5">
                <label htmlFor="login-email" className="auth-label">Email</label>
                <input
                  id="login-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="auth-input"
                  placeholder="nome@esempio.it"
                  autoComplete="email"
                  required
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <label htmlFor="login-password" className="auth-label">Password</label>
                </div>
                <input
                  id="login-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="auth-input"
                  placeholder="••••••••"
                  autoComplete="current-password"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                data-testid="login-submit"
                className="mt-1 w-full py-3.5 bg-charcoal text-white font-bold rounded-md transition-all hover:bg-navy disabled:opacity-60"
                style={{ fontFamily: 'var(--font-bricolage)', fontSize: '0.95rem', letterSpacing: '0.02em' }}
              >
                {loading ? 'Accesso...' : 'Accedi →'}
              </button>

            </form>

            <p className="text-center mt-5" style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.85rem', color: 'var(--muted)' }}>
              Non hai un account?{' '}
              <Link href="/register" className="text-crimson font-semibold hover:underline">
                Registrati
              </Link>
            </p>

          </div>
        </div>
      </div>

    </div>
  );
}
