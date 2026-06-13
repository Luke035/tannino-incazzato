'use client';
import { useState } from 'react';
import { Link, useRouter } from '@/i18n/navigation';
import { useSearchParams } from 'next/navigation';
import { apiRegister } from '@/lib/auth';
import { useAuth } from '@/context/AuthContext';
import { Mascot } from '@/components/Mascot';

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
    <div className="min-h-screen grid md:grid-cols-[3fr_2fr]">

      {/* ── Left: form panel ─────────────────────────── */}
      <div className="flex flex-col min-h-screen md:min-h-0 bg-surface order-2 md:order-1">

        <div className="flex items-center justify-center px-8 py-5 md:hidden border-b border-border">
          <div className="flex items-baseline gap-2">
            <span className="font-extrabold text-ink lowercase" style={{ fontFamily: 'var(--font-display)', fontSize: '1rem' }}>tannino</span>
            <span className="font-extrabold text-primary lowercase" style={{ fontFamily: 'var(--font-display)', fontSize: '1rem' }}>incazzato</span>
          </div>
        </div>

        <div className="flex-1 flex items-center justify-center px-6 py-14">
          <div className="w-full max-w-[340px]">

            <div className="mb-8">
              <p className="text-accent font-bold uppercase mb-3" style={{ fontFamily: 'var(--font-sans)', fontSize: '0.6rem', letterSpacing: '0.22em' }}>
                Inizia il tuo percorso
              </p>
              <h1 className="font-extrabold text-ink leading-none lowercase" style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(2rem, 5vw, 3rem)', lineHeight: 0.93 }}>
                crea<br />account
              </h1>
            </div>

            {/* Google */}
            <a
              href={`${apiUrl}/auth/google`}
              className="w-full flex items-center justify-center gap-3 py-3 rounded-full border-2 border-ink bg-card hover:bg-surface-2 transition-colors mb-6"
              style={{ fontFamily: 'var(--font-sans)', fontSize: '0.9rem', color: 'var(--ink)', fontWeight: 600 }}
            >
              <svg viewBox="0 0 48 48" width="20" height="20" aria-hidden="true">
                <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"/>
                <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"/>
                <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"/>
                <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571l6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"/>
              </svg>
              Continua con Google
            </a>

            <div className="relative flex items-center gap-4 mb-6">
              <div className="flex-1 h-px bg-border" />
              <span className="uppercase text-faint" style={{ fontFamily: 'var(--font-sans)', fontSize: '0.58rem', letterSpacing: '0.16em', fontWeight: 600 }}>oppure</span>
              <div className="flex-1 h-px bg-border" />
            </div>

            <form className="flex flex-col gap-4" onSubmit={handleSubmit}>

              {error && (
                <p className="text-rust text-sm rounded-lg bg-rust/5 border border-rust/20 px-4 py-3" style={{ fontFamily: 'var(--font-sans)' }}>
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
                className="mt-1 w-full py-3.5 bg-accent text-white font-bold rounded-full transition-all hover:opacity-90 disabled:opacity-60"
                style={{ fontFamily: 'var(--font-display)', fontSize: '0.95rem', letterSpacing: '0.02em' }}
              >
                {loading ? 'Registrazione...' : 'Crea account →'}
              </button>

            </form>

            <p className="text-center mt-6" style={{ fontFamily: 'var(--font-sans)', fontSize: '0.85rem', color: 'var(--muted)' }}>
              Hai già un account?{' '}
              <Link href="/login" className="text-primary font-bold hover:underline">
                Accedi
              </Link>
            </p>

          </div>
        </div>
      </div>

      {/* ── Right: dark atmospheric panel ────────────── */}
      <div className="auth-panel relative overflow-hidden hidden md:flex flex-col items-center justify-center p-14 order-1 md:order-2">
        <div className="relative z-10 flex flex-col items-center text-center">
          <Mascot mood="skeptical" size={160} />
          <h2 className="font-extrabold leading-tight mt-8 lowercase" style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(2rem, 4vw, 3.2rem)', color: 'rgba(255,255,255,0.95)' }}>
            Diventa<br />esperto<br />
            <span style={{ color: '#7FA0FF' }}>adesso.</span>
          </h2>
        </div>
      </div>

    </div>
  );
}
