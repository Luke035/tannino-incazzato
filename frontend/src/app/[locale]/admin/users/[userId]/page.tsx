'use client';

import { use, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { useAuth } from '@/context/AuthContext';
import {
  AdminActionResult,
  AdminPlayer,
  AuditEntry,
  fetchAdminPlayer,
  fetchAudit,
  setAccountState,
  setPlan,
  setRole,
} from '@/lib/admin';
import { formatDate } from '@/lib/adminFormat';

/**
 * One player's own page (#41, #44): the same facts as the list row, now
 * carrying the four acts that change anything — suspend/reinstate, change role
 * and Plan — and the activity log that records every one of them with the value
 * that was there before. An admin cannot suspend or demote themselves, and the
 * screen says why rather than merely disabling the control silently.
 */
export default function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = use(params);
  const id = Number(userId);
  const t = useTranslations('admin.users.detail');
  const tu = useTranslations('admin.users');
  const locale = useLocale();
  const { user: me } = useAuth();

  const [player, setPlayer] = useState<AdminPlayer | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'notFound'>('loading');

  useEffect(() => {
    let active = true;
    fetchAdminPlayer(id).then((result) => {
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
  }, [id]);

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
        <>
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

          <Actions player={player} isSelf={me?.id === player.id} onChanged={setPlayer} />
          <AuditLog userId={id} version={player} />
        </>
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

// ── The four acts (#44) ───────────────────────────────────────────────────────

function Actions({
  player,
  isSelf,
  onChanged,
}: {
  player: AdminPlayer;
  isSelf: boolean;
  onChanged: (p: AdminPlayer) => void;
}) {
  const t = useTranslations('admin.users.detail.actions');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const run = async (action: () => Promise<AdminActionResult>) => {
    setBusy(true);
    setMessage(null);
    const result = await action();
    setBusy(false);
    if ('player' in result) {
      onChanged(result.player);
      return;
    }
    // A refusal the panel must explain: a self-guard, or a generic failure.
    if (result.refused === 'cannot_suspend_self') setMessage(t('cannotSuspendSelf'));
    else if (result.refused === 'cannot_demote_self') setMessage(t('cannotDemoteSelf'));
    else setMessage(t('error'));
  };

  const suspended = player.account_state === 'suspended';
  const isAdmin = player.role === 'admin';
  const isPremium = player.plan === 'premium';

  return (
    <div
      className="card-rounded soft-shadow bg-surface p-8 mt-4"
      style={{ fontFamily: 'var(--font-sans)' }}
      data-testid="player-actions"
    >
      <h2 className="font-bold text-ink" style={{ fontFamily: 'var(--font-display)' }}>
        {t('title')}
      </h2>

      <div className="mt-4 space-y-4">
        <ActionRow label={t('accountLabel')}>
          {suspended ? (
            <ActionButton disabled={busy} onClick={() => run(() => setAccountState(player.id, 'open'))}>
              {t('reinstate')}
            </ActionButton>
          ) : (
            <ActionButton
              disabled={busy || isSelf}
              destructive
              onClick={() => run(() => setAccountState(player.id, 'suspended'))}
            >
              {t('suspend')}
            </ActionButton>
          )}
        </ActionRow>

        <ActionRow label={t('roleLabel')}>
          {isAdmin ? (
            <ActionButton
              disabled={busy || isSelf}
              onClick={() => run(() => setRole(player.id, 'player'))}
            >
              {t('makePlayer')}
            </ActionButton>
          ) : (
            <ActionButton disabled={busy} onClick={() => run(() => setRole(player.id, 'admin'))}>
              {t('makeAdmin')}
            </ActionButton>
          )}
        </ActionRow>

        <ActionRow label={t('planLabel')}>
          {isPremium ? (
            <ActionButton disabled={busy} onClick={() => run(() => setPlan(player.id, 'free'))}>
              {t('setFree')}
            </ActionButton>
          ) : (
            <ActionButton disabled={busy} onClick={() => run(() => setPlan(player.id, 'premium'))}>
              {t('setPremium')}
            </ActionButton>
          )}
        </ActionRow>
      </div>

      {busy && <p className="text-muted text-sm mt-4">{t('working')}</p>}
      {message && (
        <p className="text-sm mt-4" style={{ color: 'var(--primary)' }} role="alert">
          {message}
        </p>
      )}
    </div>
  );
}

function ActionRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-xs uppercase tracking-wide text-faint">{label}</span>
      {children}
    </div>
  );
}

function ActionButton({
  children,
  onClick,
  disabled,
  destructive,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  destructive?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="px-4 py-2 rounded-full text-sm font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      style={{
        backgroundColor: destructive ? 'var(--primary)' : 'var(--accent)',
        color: 'white',
      }}
    >
      {children}
    </button>
  );
}

// ── The activity log (#44) ────────────────────────────────────────────────────

function AuditLog({ userId, version }: { userId: number; version: AdminPlayer }) {
  const t = useTranslations('admin.users.detail.audit');
  const tu = useTranslations('admin.users');
  const locale = useLocale();
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  // Reload whenever the player row changes: a fresh act should show at once.
  useEffect(() => {
    let active = true;
    fetchAudit({ entityType: 'user', entityId: userId, pageSize: 50 }).then((page) => {
      if (!active) return;
      if (page === null) {
        setStatus('error');
        return;
      }
      setEntries(page.entries);
      setStatus('ready');
    });
    return () => {
      active = false;
    };
  }, [userId, version]);

  // A value read through the same vocabulary the rest of the panel uses, so the
  // log says "Suspended", not "suspended".
  const readValue = (field: string, value: string | null): string => {
    if (value === null) return t('empty_value');
    if (field === 'account_state') return tu(`accountState.${value}`);
    if (field === 'role') return tu(`role.${value}`);
    if (field === 'plan') return tu(`plan.${value}`);
    return value;
  };

  const readField = (field: string): string => {
    if (field === 'account_state' || field === 'role' || field === 'plan') {
      return t(`field.${field}`);
    }
    return field;
  };

  return (
    <div
      className="card-rounded soft-shadow bg-surface p-8 mt-4"
      style={{ fontFamily: 'var(--font-sans)' }}
      data-testid="audit-log"
    >
      <h2 className="font-bold text-ink" style={{ fontFamily: 'var(--font-display)' }}>
        {t('title')}
      </h2>
      <p className="text-muted text-sm mt-1">{t('subtitle')}</p>

      {status === 'loading' && <p className="text-muted text-sm mt-4">{t('loading')}</p>}
      {status === 'error' && <p className="text-muted text-sm mt-4">{t('error')}</p>}
      {status === 'ready' && entries && entries.length === 0 && (
        <p className="text-muted text-sm mt-4">{t('empty')}</p>
      )}

      {status === 'ready' && entries && entries.length > 0 && (
        <table className="w-full mt-4 text-sm">
          <thead>
            <tr className="text-left text-faint text-xs uppercase tracking-wide">
              <th className="pb-2 font-medium">{t('colWhen')}</th>
              <th className="pb-2 font-medium">{t('colActor')}</th>
              <th className="pb-2 font-medium">{t('colField')}</th>
              <th className="pb-2 font-medium">{t('colFrom')}</th>
              <th className="pb-2 font-medium">{t('colTo')}</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id} className="border-t border-faint/20">
                <td className="py-2 text-ink">{formatDate(e.created_at, locale)}</td>
                <td className="py-2 text-muted">{e.actor_name ?? e.actor_email ?? '—'}</td>
                <td className="py-2 text-ink">{readField(e.field)}</td>
                <td className="py-2 text-muted">{readValue(e.field, e.previous_value)}</td>
                <td className="py-2 text-ink">{readValue(e.field, e.new_value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
