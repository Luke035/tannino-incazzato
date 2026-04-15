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
      className="px-3 py-1 rounded border border-red-800 text-red-800 text-sm font-medium hover:bg-red-50 transition-colors"
    >
      {t('toggle')}
    </button>
  );
}
