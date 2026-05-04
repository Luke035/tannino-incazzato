'use client';
import { useState } from 'react';
import { Link } from '@/i18n/navigation';

const FLOATING = [
  'Gavi', 'Soave', 'Orvieto', 'Verdicchio', 'Greco',
  'Falanghina', 'Fiano', 'Trebbiano', 'Malvasia', 'Garganega',
  'Vermentino', 'Carricante',
];

type FormState = { nome: string; cognome: string; email: string; password: string; confirm: string };

export default function RegisterPage() {
  const [form, setForm] = useState<FormState>({
    nome: '', cognome: '', email: '', password: '', confirm: '',
  });

  const set = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [k]: e.target.value }));

  return (
    <div className="min-h-screen grid md:grid-cols-[2fr_3fr]">

      {/* ── Left: form panel ─────────────────────────── */}
      <div className="flex flex-col min-h-screen md:min-h-0 bg-white order-2 md:order-1">

        {/* Mobile-only logo */}
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

        <div className="flex-1 flex items-center justify-center px-10 py-14">
          <div className="w-full max-w-[360px]">

            <div className="mb-8">
              <p
                className="text-crimson font-semibold uppercase mb-3"
                style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.6rem', letterSpacing: '0.22em' }}
              >
                Inizia il tuo percorso
              </p>
              <h1
                className="font-extrabold text-charcoal leading-none"
                style={{ fontFamily: 'var(--font-bricolage)', fontSize: 'clamp(2.4rem, 5vw, 3.4rem)', lineHeight: 0.93 }}
              >
                Crea<br />account
              </h1>
            </div>

            <form className="flex flex-col gap-4" onSubmit={(e) => e.preventDefault()}>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="reg-nome" className="auth-label">Nome</label>
                  <input
                    id="reg-nome"
                    type="text"
                    value={form.nome}
                    onChange={set('nome')}
                    className="auth-input"
                    placeholder="Luca"
                    autoComplete="given-name"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="reg-cognome" className="auth-label">Cognome</label>
                  <input
                    id="reg-cognome"
                    type="text"
                    value={form.cognome}
                    onChange={set('cognome')}
                    className="auth-input"
                    placeholder="Rossi"
                    autoComplete="family-name"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="reg-email" className="auth-label">Email</label>
                <input
                  id="reg-email"
                  type="email"
                  value={form.email}
                  onChange={set('email')}
                  className="auth-input"
                  placeholder="nome@esempio.it"
                  autoComplete="email"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="reg-password" className="auth-label">Password</label>
                <input
                  id="reg-password"
                  type="password"
                  value={form.password}
                  onChange={set('password')}
                  className="auth-input"
                  placeholder="Min. 8 caratteri"
                  autoComplete="new-password"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="reg-confirm" className="auth-label">Conferma password</label>
                <input
                  id="reg-confirm"
                  type="password"
                  value={form.confirm}
                  onChange={set('confirm')}
                  className="auth-input"
                  placeholder="••••••••"
                  autoComplete="new-password"
                />
              </div>

              <button
                type="submit"
                className="mt-1 w-full py-3.5 bg-crimson text-white font-bold rounded-md transition-all hover:bg-crimson-dark shadow-lg shadow-crimson/20"
                style={{ fontFamily: 'var(--font-bricolage)', fontSize: '0.95rem', letterSpacing: '0.02em' }}
              >
                Crea account →
              </button>

            </form>

            <div className="mt-4 h-px bg-border" />

            <p
              className="text-center mt-5"
              style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.85rem', color: 'var(--muted)' }}
            >
              Hai già un account?{' '}
              <Link href="/login" className="text-crimson font-semibold hover:underline">
                Accedi
              </Link>
            </p>

          </div>
        </div>
      </div>

      {/* ── Right: dark atmospheric panel ────────────── */}
      <div className="auth-panel relative overflow-hidden hidden md:flex flex-col justify-between p-14 order-1 md:order-2">

        {/* Floating denomination watermarks */}
        {FLOATING.map((name, i) => (
          <span
            key={i}
            className="absolute font-extrabold select-none pointer-events-none whitespace-nowrap"
            style={{
              fontFamily: 'var(--font-bricolage)',
              fontSize: `${2.6 + (i % 4) * 1.5}rem`,
              color: 'rgba(255,255,255,0.08)',
              top: `${(i * 8.5) % 88}%`,
              left: `${(i * 12.3 + 3) % 78}%`,
              rotate: `${-15 + (i % 7) * 5}deg`,
              animation: `auth-float ${6 + i * 0.9}s ease-in-out infinite alternate`,
              animationDelay: `${i * 0.6}s`,
            }}
          >
            {name}
          </span>
        ))}

        {/* Top logo */}
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

        {/* Bottom content */}
        <div className="z-10 relative">
          <p
            className="uppercase mb-6"
            style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.58rem', letterSpacing: '0.24em', color: 'rgba(255,255,255,0.28)' }}
          >
            410 denominazioni · 20 regioni
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
            Diventa<br />esperto<br />
            <span style={{ color: 'rgba(193,0,31,0.72)' }}>adesso.</span>
          </h2>
          <p
            className="mt-5 leading-relaxed max-w-sm"
            style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.85rem', color: 'rgba(255,255,255,0.32)' }}
          >
            Traccia i tuoi progressi, ricevi feedback AI e padroneggia
            ogni denominazione italiana.
          </p>

          {/* Feature pills */}
          <div className="flex flex-wrap gap-2 mt-8">
            {['410 DOC/DOCG', '20 Regioni', 'AI Review', 'Statistiche'].map((s) => (
              <span
                key={s}
                className="px-3 py-1.5 rounded-full"
                style={{
                  fontFamily: 'var(--font-dm-sans)',
                  fontSize: '0.68rem',
                  color: 'rgba(255,255,255,0.5)',
                  border: '1px solid rgba(255,255,255,0.1)',
                }}
              >
                {s}
              </span>
            ))}
          </div>
        </div>

      </div>

    </div>
  );
}
