'use client';

import { use, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { AdminPlayer, fetchAdminPlayer } from '@/lib/admin';
import { formatDate } from '@/lib/adminFormat';

/**
 * One player's own page (#41): the same facts as the list row, on a page of
 * their own, ready to carry actions in later slices — suspend, change role or
 * Plan, free a stuck Session, issue a reset link. Today it only reads.
 */
export default function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = use(params);
  const t = useTranslations('admin.users.detail');
  const tu = useTranslations('admin.users');
  const locale = useLocale();

  const [player, setPlayer] = useState<AdminPlayer | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'notFound'>('loading');

  useEffect(() => {
    let active = true;
    fetchAdminPlayer(Number(userId)).then((result) => {
      if (!active) return;
      if (result === null) {
        setStatus('notFound');
        return;
      }
      setPlayer(result);
      setStatus('ready');
    });
    return () => {
      active = false;
    };
  }, [userId]);

  return (
    <div className="max-w-2xl">
      <Link
        href="/admin/users"
        className="text-muted hover:text-ink transition-colors text-sm"
        style={{ fontFamily: 'var(--font-sans)' }}
      >
        {t('back')}
      </Link>

      {status === 'loading' && (
        <p className="text-muted mt-6" style={{ fontFamily: 'var(--font-sans)' }}>
          {t('loading')}
        </p>
      )}

      {status === 'notFound' && (
        <p className="text-muted mt-6" style={{ fontFamily: 'var(--font-sans)' }}>
          {t('notFound')}
        </p>
      )}

      {status === 'ready' && player && (
        <div
          className="card-rounded soft-shadow bg-surface p-8 mt-4"
          style={{ fontFamily: 'var(--font-sans)' }}
        >
          <h1
            className="font-extrabold text-ink"
            style={{ fontFamily: 'var(--font-display)', fontSize: '1.6rem' }}
          >
            {player.first_name} {player.last_name}
          </h1>
          <p className="text-muted mt-1">{player.email}</p>
          <p className="text-muted mt-1">
            {t('sessionsPlayed', { count: player.sessions_played })}
          </p>

          <dl className="grid grid-cols-2 gap-x-6 gap-y-4 mt-6">
            <Fact label={t('account')} value={tu(`accountState.${player.account_state}`)} />
            <Fact label={t('role')} value={tu(`role.${player.role}`)} />
            <Fact label={t('plan')} value={tu(`plan.${player.plan}`)} />
            <Fact label={t('registered')} value={formatDate(player.created_at, locale)} />
            <Fact
              label={t('lastActivity')}
              value={player.last_activity ? formatDate(player.last_activity, locale) : '—'}
            />
            <Fact
              label={t('lastLogin')}
              value={player.last_login ? formatDate(player.last_login, locale) : '—'}
            />
          </dl>
        </div>
      )}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-faint">{label}</dt>
      <dd className="text-ink mt-0.5">{value}</dd>
    </div>
  );
}
