'use client';
import { Mascot } from '@/components/Mascot';

/** The one thing standing between a thumb and a decision it cannot undo:
 *  handing a paper in with blanks, or binning one altogether.
 *
 *  It rises from the bottom of the screen on a phone and sits in the middle on
 *  anything bigger — a phone's confirm belongs where the thumb already is. The
 *  confirming action carries `--primary`: it is the paper's own fate rather
 *  than navigation, and both callers are consistent about it. */
export function ConfirmSheet({
  testId,
  title,
  body,
  confirmLabel,
  cancelLabel,
  confirmTestId,
  cancelTestId,
  busy = false,
  onConfirm,
  onCancel,
}: {
  testId: string;
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  confirmTestId: string;
  cancelTestId: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-dark/60 backdrop-blur-sm">
      <div
        data-testid={testId}
        role="alertdialog"
        aria-modal="true"
        className="w-full max-w-md flex flex-col gap-4 card-rounded p-6 card-shadow"
        style={{ backgroundColor: 'var(--surface)' }}
      >
        <div className="flex items-center gap-3">
          <Mascot mood="angry" size={52} />
          <h2
            style={{ fontFamily: 'var(--font-display)', fontSize: '1.3rem', color: 'var(--ink)' }}
          >
            {title}
          </h2>
        </div>
        <p style={{ fontFamily: 'var(--font-sans)', fontSize: '0.95rem', color: 'var(--muted)' }}>
          {body}
        </p>
        <div className="flex flex-col gap-3">
          <button
            data-testid={confirmTestId}
            onClick={onConfirm}
            disabled={busy}
            className="w-full px-6 py-4 pill font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: '0.95rem',
              minHeight: '3.5rem',
              backgroundColor: 'var(--primary)',
            }}
          >
            {confirmLabel}
          </button>
          <button
            data-testid={cancelTestId}
            onClick={onCancel}
            className="w-full px-6 py-4 pill font-bold"
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: '0.95rem',
              minHeight: '3.5rem',
              backgroundColor: 'var(--surface-2)',
              color: 'var(--ink)',
              border: '2px solid var(--border)',
            }}
          >
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
