'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { AdminPlayer, AdminPlayerPage, fetchAdminPlayers } from '@/lib/admin';

const PAGE_SIZE = 20;

/**
 * The player list (#41): the first real screen of the panel, read-only.
 *
 * Every registered player, searchable by name and email and paged because the
 * list only grows. Each row carries the two figures that make the screen worth
 * having — how much the player has actually played, and when they were last
 * active — so an Admin can tell a live account from an abandoned one. Every
 * action on a player arrives in a later slice; here the screen only reads.
 */
export default function AdminUsersPage() {
  const t = useTranslations('admin.users');
  const locale = useLocale();

  // The committed search — what the list is actually filtered by — is separate
  // from the input's text, so typing does not fire a request per keystroke.
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<AdminPlayerPage | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  // Bumped to re-run the load — a retry after a failure, without threading a
  // separate callback through the effect.
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    fetchAdminPlayers({ search, page, pageSize: PAGE_SIZE }).then((result) => {
      if (!active) return;
      if (result === null) {
        setStatus('error');
        return;
      }
      setData(result);
      setStatus('ready');
    });
    return () => {
      active = false;
    };
  }, [search, page, reloadKey]);

  const retry = useCallback(() => {
    setStatus('loading');
    setReloadKey((k) => k + 1);
  }, []);

  function submitSearch(event: React.FormEvent) {
    event.preventDefault();
    setStatus('loading');
    setPage(1);
    setSearch(searchInput.trim());
  }

  return (
    <div className="max-w-5xl">
      <header className="mb-6">
        <h1
          className="font-extrabold text-ink"
          style={{ fontFamily: 'var(--font-display)', fontSize: '1.6rem' }}
        >
          {t('title')}
        </h1>
        <p className="text-muted mt-1" style={{ fontFamily: 'var(--font-sans)' }}>
          {t('subtitle')}
        </p>
      </header>

      <form onSubmit={submitSearch} className="flex gap-2 mb-6">
        <input
          type="search"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder={t('searchPlaceholder')}
          aria-label={t('searchPlaceholder')}
          className="flex-1 max-w-md px-4 py-2 rounded-lg bg-surface border border-border text-ink"
          style={{ fontFamily: 'var(--font-sans)' }}
        />
        <button
          type="submit"
          className="pill px-5 py-2 bg-primary text-white text-sm font-semibold"
          style={{ fontFamily: 'var(--font-sans)' }}
        >
          {t('search')}
        </button>
      </form>

      {status === 'loading' && (
        <p className="text-muted" style={{ fontFamily: 'var(--font-sans)' }}>
          {t('loading')}
        </p>
      )}

      {status === 'error' && (
        <div className="text-muted" style={{ fontFamily: 'var(--font-sans)' }}>
          <p>{t('error')}</p>
          <button
            onClick={retry}
            className="pill mt-3 px-4 py-2 bg-surface-2 text-ink text-sm font-semibold"
          >
            {t('retry')}
          </button>
        </div>
      )}

      {status === 'ready' && data && (
        <PlayerTable
          data={data}
          search={search}
          page={page}
          onPage={(next) => {
            setStatus('loading');
            setPage(next);
          }}
          locale={locale}
        />
      )}
    </div>
  );
}

function PlayerTable({
  data,
  search,
  page,
  onPage,
  locale,
}: {
  data: AdminPlayerPage;
  search: string;
  page: number;
  onPage: (page: number) => void;
  locale: string;
}) {
  const t = useTranslations('admin.users');

  if (data.total === 0) {
    return (
      <p className="text-muted" style={{ fontFamily: 'var(--font-sans)' }}>
        {search ? t('noMatches', { search }) : t('empty')}
      </p>
    );
  }

  const from = (page - 1) * data.page_size + 1;
  const to = Math.min(page * data.page_size, data.total);
  const hasPrevious = page > 1;
  const hasNext = to < data.total;

  return (
    <div>
      <div
        className="overflow-x-auto card-rounded soft-shadow bg-surface"
        style={{ fontFamily: 'var(--font-sans)' }}
      >
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted border-b border-border">
              <th className="px-4 py-3 font-semibold">{t('columns.name')}</th>
              <th className="px-4 py-3 font-semibold">{t('columns.email')}</th>
              <th className="px-4 py-3 font-semibold">{t('columns.registered')}</th>
              <th className="px-4 py-3 font-semibold">{t('columns.lastActivity')}</th>
              <th className="px-4 py-3 font-semibold">{t('columns.account')}</th>
              <th className="px-4 py-3 font-semibold">{t('columns.role')}</th>
              <th className="px-4 py-3 font-semibold">{t('columns.plan')}</th>
              <th className="px-4 py-3 font-semibold text-right">{t('columns.sessions')}</th>
            </tr>
          </thead>
          <tbody>
            {data.players.map((player) => (
              <PlayerRow key={player.id} player={player} locale={locale} />
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between mt-4 text-sm text-muted" style={{ fontFamily: 'var(--font-sans)' }}>
        <span>{t('pagination.showing', { from, to, total: data.total })}</span>
        <div className="flex gap-2">
          <button
            onClick={() => onPage(page - 1)}
            disabled={!hasPrevious}
            className="pill px-4 py-2 bg-surface-2 text-ink font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {t('pagination.previous')}
          </button>
          <button
            onClick={() => onPage(page + 1)}
            disabled={!hasNext}
            className="pill px-4 py-2 bg-surface-2 text-ink font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {t('pagination.next')}
          </button>
        </div>
      </div>
    </div>
  );
}

function PlayerRow({ player, locale }: { player: AdminPlayer; locale: string }) {
  const t = useTranslations('admin.users');

  return (
    <tr className="border-b border-border last:border-0 hover:bg-surface-2 transition-colors">
      <td className="px-4 py-3">
        <Link
          href={`/admin/users/${player.id}`}
          className="font-semibold text-primary hover:underline"
        >
          {player.first_name} {player.last_name}
        </Link>
      </td>
      <td className="px-4 py-3 text-ink">{player.email}</td>
      <td className="px-4 py-3 text-muted">{formatDate(player.created_at, locale)}</td>
      <td className="px-4 py-3 text-muted">
        {player.last_activity ? formatDate(player.last_activity, locale) : t('never')}
      </td>
      <td className="px-4 py-3 text-ink">{t(`accountState.${player.account_state}`)}</td>
      <td className="px-4 py-3 text-ink">{t(`role.${player.role}`)}</td>
      <td className="px-4 py-3 text-ink">{t(`plan.${player.plan}`)}</td>
      <td className="px-4 py-3 text-right text-ink tabular-nums">{player.sessions_played}</td>
    </tr>
  );
}

export function formatDate(iso: string, locale: string): string {
  return new Date(iso).toLocaleDateString(locale === 'it' ? 'it-IT' : 'en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}
