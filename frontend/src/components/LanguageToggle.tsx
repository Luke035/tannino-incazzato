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
      className="flex gap-2 items-center transition-colors duration-150"
      style={{ fontFamily: 'var(--font-sans)' }}
    >
      <span className={`text-sm font-bold ${locale === 'en' ? 'text-ink' : 'text-muted'}`}>EN</span>
      <span className={`text-sm font-bold ${locale === 'it' ? 'text-ink' : 'text-muted'}`}>IT</span>
    </button>
  );
}
