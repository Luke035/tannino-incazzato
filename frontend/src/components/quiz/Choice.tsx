'use client';

/** A segmented control sized for a thumb: the pill track of DESIGN.md in
 *  `--soon` with the active segment filled `--primary`, exactly as Mappa dei
 *  Vini's filter chooser does it.
 *
 *  A grid rather than a row because three labels have to fit a 393px phone
 *  without the track ever scrolling sideways — which is also the widest this
 *  pattern goes, and exactly what every setup screen in the quiz needs. */
export function Choice<T extends number>({
  testId,
  label,
  options,
  selected,
  onSelect,
  note,
}: {
  testId: string;
  label: string;
  options: { value: T; label: string }[];
  selected: T;
  onSelect: (value: T) => void;
  note?: string;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend
        className="font-bold mb-2"
        style={{ fontFamily: 'var(--font-sans)', fontSize: '0.9rem', color: 'var(--ink)' }}
      >
        {label}
      </legend>
      <div className="grid grid-cols-3 gap-2 p-2 pill" style={{ backgroundColor: 'var(--soon)' }}>
        {options.map((option) => {
          const active = option.value === selected;
          return (
            <button
              key={option.value}
              type="button"
              data-testid={testId}
              data-value={option.value}
              aria-pressed={active}
              onClick={() => onSelect(option.value)}
              className="pill font-bold transition-colors px-2 py-3"
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: '0.85rem',
                minHeight: '3rem',
                backgroundColor: active ? 'var(--primary)' : 'transparent',
                color: active ? 'white' : 'var(--ink)',
              }}
            >
              {option.label}
            </button>
          );
        })}
      </div>
      {note && (
        <p
          data-testid={`${testId}-note`}
          style={{ fontFamily: 'var(--font-sans)', fontSize: '0.82rem', color: 'var(--faint)' }}
        >
          {note}
        </p>
      )}
    </fieldset>
  );
}
