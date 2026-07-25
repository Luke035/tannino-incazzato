'use client';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { useAuth } from '@/context/AuthContext';
import Header from '@/components/Header';
import { Mascot } from '@/components/Mascot';

export default function HomePage() {
  const t = useTranslations();
  const router = useRouter();
  const { user } = useAuth();

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: 'var(--bg)' }}>
      <Header />
      <main className="flex-1 flex flex-col px-8 py-12">
        {/* Top utility bar: profile chip + CTA */}
        <div className="flex items-center justify-end mb-8 gap-3">
          <button
            onClick={() => router.push('/profile')}
            className="flex items-center gap-3 px-6 py-3 rounded-full transition-transform hover:scale-105"
            style={{
              backgroundColor: 'var(--surface)',
              color: 'var(--ink)',
              fontSize: '0.92rem',
              fontFamily: 'var(--font-nunito)',
              fontWeight: '600',
              border: `1px solid var(--border)`,
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="8" r="4" />
              <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
            </svg>
            {t('home.profileChip')}
          </button>
          <button
            onClick={() => router.push('/profile')}
            className="px-5 py-2 rounded-full font-bold transition-opacity hover:opacity-80"
            style={{
              backgroundColor: 'var(--accent)',
              color: 'white',
              fontSize: '0.92rem',
              fontFamily: 'var(--font-nunito)',
            }}
          >
            {t('home.profileCta')}
          </button>
        </div>

        {/* Eyebrow + name */}
        <div className="mb-8">
          <p
            className="font-bold tracking-widest uppercase mb-4"
            style={{
              fontFamily: 'var(--font-nunito)',
              fontSize: '0.66rem',
              letterSpacing: '0.18em',
              color: 'var(--accent)',
            }}
          >
            {t('home.welcome', { name: user?.first_name ?? 'Guest' })}
          </p>
          <h1
            className="leading-tight tracking-tight mb-2"
            style={{
              fontFamily: 'var(--font-baloo)',
              fontSize: 'clamp(2.4rem, 6vw, 4rem)',
              lineHeight: '0.95',
              color: 'var(--ink)',
            }}
          >
            {t('home.title')}
          </h1>
          <p
            style={{
              fontFamily: 'var(--font-nunito)',
              fontSize: '0.92rem',
              color: 'var(--muted)',
            }}
          >
            {t('home.subtitle')}
          </p>
        </div>

        {/* Games Grid */}
        <div
          className="grid gap-6 mb-12"
          style={{
            gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
          }}
        >
          {/* Wine Map - Live Game */}
          <button
            onClick={() => router.push('/wine-map')}
            className="flex flex-col p-6 rounded-3xl transition-all hover:shadow-lg hover:-translate-y-0.5 cursor-pointer group"
            style={{
              backgroundColor: 'var(--surface)',
              border: '2px solid var(--primary)',
            }}
          >
            <div className="flex-1 flex items-center justify-center mb-4 h-24">
              <Mascot mood="skeptical" size={48} />
            </div>
            <div className="flex justify-between items-start mb-4 w-full">
              <h2
                style={{
                  fontFamily: 'var(--font-baloo)',
                  fontSize: '1.5rem',
                  fontWeight: '700',
                  color: 'var(--ink)',
                }}
              >
                {t('home.games.wineMap.title')}
              </h2>
              <span
                className="px-3 py-1 rounded-full text-white font-bold text-sm"
                style={{
                  backgroundColor: 'var(--correct)',
                  fontFamily: 'var(--font-nunito)',
                  fontSize: '0.66rem',
                  letterSpacing: '0.08em',
                }}
              >
                {t('home.games.wineMap.badge')}
              </span>
            </div>
            <div
              className="w-full px-4 py-2.5 rounded-full text-center font-bold transition-opacity group-hover:opacity-80"
              style={{
                backgroundColor: 'var(--accent)',
                color: 'white',
                fontFamily: 'var(--font-nunito)',
                fontSize: '0.92rem',
              }}
            >
              {t('home.games.wineMap.cta')}
            </div>
          </button>

          {/* Coming Soon Cards */}
          {[
            { title: 'home.games.pairing.title', icon: '🍷' },
            { title: 'home.games.vitigni.title', icon: '🍇' },
            { title: 'home.games.annate.title', icon: '📅' },
          ].map((game, idx) => (
            <div
              key={idx}
              className="flex flex-col p-6 rounded-3xl cursor-not-allowed"
              style={{
                backgroundColor: 'var(--soon)',
                opacity: 0.78,
              }}
            >
              <div className="flex-1 flex items-center justify-center mb-4 h-24 text-3xl">
                {game.icon}
              </div>
              <div className="flex justify-between items-start mb-4 w-full">
                <h2
                  style={{
                    fontFamily: 'var(--font-baloo)',
                    fontSize: '1.5rem',
                    fontWeight: '700',
                    color: 'var(--ink)',
                  }}
                >
                  {t(game.title)}
                </h2>
                <span
                  className="px-3 py-1 rounded-full text-xs font-bold"
                  style={{
                    backgroundColor: '#B8ADA0',
                    color: 'white',
                    fontFamily: 'var(--font-nunito)',
                    fontSize: '0.66rem',
                    letterSpacing: '0.08em',
                  }}
                >
                  {t('home.games.comingSoon.badge')}
                </span>
              </div>
              <div
                className="w-full px-4 py-2.5 rounded-full text-center font-bold opacity-60"
                style={{
                  backgroundColor: '#B8ADA0',
                  color: 'white',
                  fontFamily: 'var(--font-nunito)',
                  fontSize: '0.92rem',
                }}
              >
                {t('home.games.comingSoon.badge')}
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
