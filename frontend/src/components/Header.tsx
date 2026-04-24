import LanguageToggle from './LanguageToggle';

export default function Header() {
  return (
    <header className="w-full flex items-center justify-between px-6 py-3 border-b border-amber-200 bg-white shadow-sm">
      <span className="font-bold text-lg tracking-wide text-red-900">Sommelier Game</span>
      <LanguageToggle />
    </header>
  );
}
