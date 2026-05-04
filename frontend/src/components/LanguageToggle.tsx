'use client';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter, usePathname } from '@/i18n/navigation';

export default function LanguageToggle() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations('language');

  const toggle = () => {
    router.replace(pathname, { locale: locale === 'en' ? 'it' : 'en' });
  };

  return (
    <button
      onClick={toggle}
      className="px-3 py-1.5 text-xs font-semibold text-muted border border-border rounded hover:border-charcoal hover:text-charcoal transition-colors"
      style={{ fontFamily: 'var(--font-dm-sans)', letterSpacing: '0.06em' }}
    >
      {t('toggle')}
    </button>
  );
}
