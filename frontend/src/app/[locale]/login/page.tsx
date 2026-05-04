'use client';
import { useState } from 'react';
import { Link } from '@/i18n/navigation';

const FLOATING = [
  'Barolo', 'Brunello', 'Amarone', 'Franciacorta', 'Chianti',
  'Soave', 'Prosecco', 'Primitivo', 'Montepulciano', 'Nebbiolo',
  'Vermentino', 'Vernaccia',
];

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  return (
    <div className="min-h-screen grid md:grid-cols-[3fr_2fr]">

      {/* ── Left: dark atmospheric panel ─────────────── */}
      <div className="auth-panel relative overflow-hidden hidden md:flex flex-col justify-between p-14">

        {/* Floating denomination watermarks */}
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

        {/* Thin rule top */}
        <div>
          <div className="flex items-baseline gap-3">
            <span
              className="font-extrabold"
              style={{ fontFamily: 'var(--font-bricolage)', fontSize: '1.1rem', color: 'rgba(255,255,255,0.88)' }}
            >
              Sommelier
            </span>
            <span
              className="font-medium uppercase"
              style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', letterSpacing: '0.16em', color: 'rgba(193,0,31,0.75)' }}
            >
              Italia
            </span>
          </div>
          <div className="mt-4 h-px w-10" style={{ background: 'rgba(255,255,255,0.12)' }} />
        </div>

        {/* Bottom quote */}
        <div className="z-10 relative">
          <p
            className="uppercase mb-6"
            style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.58rem', letterSpacing: '0.24em', color: 'rgba(255,255,255,0.28)' }}
          >
            L'arte della denominazione
          </p>
          <h2
            className="font-extrabold leading-none"
            style={{
              fontFamily: 'var(--font-bricolage)',
              fontSize: 'clamp(2.8rem, 4.5vw, 4.8rem)',
              lineHeight: 0.94,
              color: 'rgba(255,255,255,0.9)',
            }}
          >
            Ogni vino<br />ha la sua<br />
            <span style={{ color: 'rgba(193,0,31,0.72)' }}>terra.</span>
          </h2>
          <p
            className="mt-5 leading-relaxed max-w-sm"
            style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.85rem', color: 'rgba(255,255,255,0.32)' }}
          >
            410 denominazioni DOC e DOCG delle 20 regioni italiane.
            Allenati. Impara. Diventa esperto.
          </p>
        </div>
      </div>

      {/* ── Right: form panel ────────────────────────── */}
      <div className="flex flex-col min-h-screen md:min-h-0 bg-white">

        {/* Mobile-only logo bar */}
        <div className="flex items-baseline gap-2.5 px-8 py-5 md:hidden border-b border-border">
          <span className="font-extrabold text-charcoal" style={{ fontFamily: 'var(--font-bricolage)', fontSize: '1.1rem' }}>
            Sommelier
          </span>
          <span
            className="text-crimson font-medium uppercase"
            style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', letterSpacing: '0.14em' }}
          >
            Italia
          </span>
        </div>

        <div className="flex-1 flex items-center justify-center px-10 py-16">
          <div className="w-full max-w-[340px]">

            <div className="mb-10">
              <p
                className="text-crimson font-semibold uppercase mb-3"
                style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.6rem', letterSpacing: '0.22em' }}
              >
                Bentornato
              </p>
              <h1
                className="font-extrabold text-charcoal leading-none"
                style={{ fontFamily: 'var(--font-bricolage)', fontSize: 'clamp(2.8rem, 5vw, 3.8rem)', lineHeight: 0.93 }}
              >
                Accedi
              </h1>
            </div>

            <form className="flex flex-col gap-5" onSubmit={(e) => e.preventDefault()}>

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
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <label htmlFor="login-password" className="auth-label">Password</label>
                  <button
                    type="button"
                    className="hover:text-crimson transition-colors"
                    style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: 'var(--muted)' }}
                  >
                    Dimenticata?
                  </button>
                </div>
                <input
                  id="login-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="auth-input"
                  placeholder="••••••••"
                  autoComplete="current-password"
                />
              </div>

              <button
                type="submit"
                className="mt-1 w-full py-3.5 bg-charcoal text-white font-bold rounded-md transition-all hover:bg-navy"
                style={{ fontFamily: 'var(--font-bricolage)', fontSize: '0.95rem', letterSpacing: '0.02em' }}
              >
                Accedi →
              </button>

            </form>

            <div className="mt-4 h-px bg-border" />

            <p
              className="text-center mt-5"
              style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.85rem', color: 'var(--muted)' }}
            >
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
