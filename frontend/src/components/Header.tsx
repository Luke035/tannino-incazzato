import LanguageToggle from './LanguageToggle';

export default function Header() {
  return (
    <header className="w-full flex items-center justify-between px-8 py-4 bg-white border-b border-border">
      <div className="flex items-baseline gap-3">
        <span
          className="font-extrabold tracking-tight text-charcoal leading-none"
          style={{ fontFamily: 'var(--font-bricolage)', fontSize: '1.25rem' }}
        >
          Sommelier
        </span>
        <span
          className="font-medium text-crimson text-xs tracking-widest uppercase"
          style={{ fontFamily: 'var(--font-dm-sans)', letterSpacing: '0.14em' }}
        >
          Italia
        </span>
      </div>
      <LanguageToggle />
    </header>
  );
}
