'use client';
import { useState } from 'react';
import { Link, useRouter } from '@/i18n/navigation';
import { useSearchParams } from 'next/navigation';
import { apiRegister } from '@/lib/auth';
import { useAuth } from '@/context/AuthContext';

const FLOATING = [
  'Gavi', 'Soave', 'Orvieto', 'Verdicchio', 'Greco',
  'Falanghina', 'Fiano', 'Trebbiano', 'Malvasia', 'Garganega',
  'Vermentino', 'Carricante',
];

type FormState = { nome: string; cognome: string; email: string; password: string; confirm: string };

export default function RegisterPage() {
  const { setUser } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [form, setForm] = useState<FormState>({ nome: '', cognome: '', email: '', password: '', confirm: '' });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const set = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [k]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (form.password !== form.confirm) {
      setError('Le password non coincidono.');
      return;
    }
    if (form.password.length < 8) {
      setError('La password deve essere di almeno 8 caratteri.');
      return;
    }
    setLoading(true);
    const result = await apiRegister({
      email: form.email,
      password: form.password,
      first_name: form.nome,
      last_name: form.cognome,
    });
    setLoading(false);
    if ('error' in result) {
      if (result.error === 'email_exists') {
        setError(
          <span>
            Email già registrata.{' '}
            <Link href="/login" className="underline font-semibold">Accedi qui.</Link>
          </span> as unknown as string
        );
      } else {
        setError('Registrazione non riuscita. Riprova.');
      }
      return;
    }
    setUser(result.user);
    const next = searchParams.get('next');
    router.push(next ?? '/');
  };

  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? '';

  return (
    <div className="min-h-screen grid md:grid-cols-[2fr_3fr]">

      {/* ── Left: form panel ─────────────────────────── */}
      <div className="flex flex-col min-h-screen md:min-h-0 bg-white order-2 md:order-1">

        <div className="flex items-baseline gap-2.5 px-8 py-5 md:hidden border-b border-border">
          <span className="font-extrabold text-charcoal" style={{ fontFamily: 'var(--font-bricolage)', fontSize: '1.1rem' }}>Sommelier</span>
          <span className="text-crimson font-medium uppercase" style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', letterSpacing: '0.14em' }}>Italia</span>
        </div>

        <div className="flex-1 flex items-center justify-center px-10 py-14">
          <div className="w-full max-w-[360px]">

            <div className="mb-8">
              <p className="text-crimson font-semibold uppercase mb-3" style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.6rem', letterSpacing: '0.22em' }}>
                Inizia il tuo percorso
              </p>
              <h1 className="font-extrabold text-charcoal leading-none" style={{ fontFamily: 'var(--font-bricolage)', fontSize: 'clamp(2.4rem, 5vw, 3.4rem)', lineHeight: 0.93 }}>
                Crea<br />account
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

            <form className="flex flex-col gap-4" onSubmit={handleSubmit}>

              {error && (
                <p className="text-crimson text-sm rounded-md bg-crimson/5 border border-crimson/20 px-3 py-2" style={{ fontFamily: 'var(--font-dm-sans)' }}>
                  {error}
                </p>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="reg-nome" className="auth-label">Nome</label>
                  <input id="reg-nome" type="text" value={form.nome} onChange={set('nome')} className="auth-input" placeholder="Luca" autoComplete="given-name" required />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="reg-cognome" className="auth-label">Cognome</label>
                  <input id="reg-cognome" type="text" value={form.cognome} onChange={set('cognome')} className="auth-input" placeholder="Rossi" autoComplete="family-name" required />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="reg-email" className="auth-label">Email</label>
                <input id="reg-email" type="email" value={form.email} onChange={set('email')} className="auth-input" placeholder="nome@esempio.it" autoComplete="email" required />
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="reg-password" className="auth-label">Password</label>
                <input id="reg-password" type="password" value={form.password} onChange={set('password')} className="auth-input" placeholder="Min. 8 caratteri" autoComplete="new-password" required />
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="reg-confirm" className="auth-label">Conferma password</label>
                <input id="reg-confirm" type="password" value={form.confirm} onChange={set('confirm')} className="auth-input" placeholder="••••••••" autoComplete="new-password" required />
              </div>

              <button
                type="submit"
                disabled={loading}
                data-testid="register-submit"
                className="mt-1 w-full py-3.5 bg-crimson text-white font-bold rounded-md transition-all hover:bg-crimson-dark shadow-lg shadow-crimson/20 disabled:opacity-60"
                style={{ fontFamily: 'var(--font-bricolage)', fontSize: '0.95rem', letterSpacing: '0.02em' }}
              >
                {loading ? 'Registrazione...' : 'Crea account →'}
              </button>

            </form>

            <p className="text-center mt-5" style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.85rem', color: 'var(--muted)' }}>
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

        <div>
          <div className="flex items-baseline gap-3">
            <span className="font-extrabold" style={{ fontFamily: 'var(--font-bricolage)', fontSize: '1.1rem', color: 'rgba(255,255,255,0.88)' }}>Sommelier</span>
            <span className="font-medium uppercase" style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', letterSpacing: '0.16em', color: 'rgba(193,0,31,0.75)' }}>Italia</span>
          </div>
          <div className="mt-4 h-px w-10" style={{ background: 'rgba(255,255,255,0.12)' }} />
        </div>

        <div className="z-10 relative">
          <p className="uppercase mb-6" style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.58rem', letterSpacing: '0.24em', color: 'rgba(255,255,255,0.28)' }}>
            410 denominazioni · 20 regioni
          </p>
          <h2 className="font-extrabold leading-none" style={{ fontFamily: 'var(--font-bricolage)', fontSize: 'clamp(2.8rem, 4.5vw, 4.8rem)', lineHeight: 0.94, color: 'rgba(255,255,255,0.9)' }}>
            Diventa<br />esperto<br />
            <span style={{ color: 'rgba(193,0,31,0.72)' }}>adesso.</span>
          </h2>
          <p className="mt-5 leading-relaxed max-w-sm" style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.85rem', color: 'rgba(255,255,255,0.32)' }}>
            Traccia i tuoi progressi, ricevi feedback AI e padroneggia ogni denominazione italiana.
          </p>
          <div className="flex flex-wrap gap-2 mt-8">
            {['410 DOC/DOCG', '20 Regioni', 'AI Review', 'Statistiche'].map((s) => (
              <span key={s} className="px-3 py-1.5 rounded-full" style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.1)' }}>
                {s}
              </span>
            ))}
          </div>
        </div>

      </div>

    </div>
  );
}
