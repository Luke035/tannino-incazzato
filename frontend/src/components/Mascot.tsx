'use client';

export type MascotMood = 'angry' | 'skeptical' | 'happy' | 'lost';

interface MascotProps {
  mood: MascotMood;
  size?: number;
  className?: string;
}

export function Mascot({ mood, size = 120, className = '' }: MascotProps) {
  const getEyebrows = () => {
    switch (mood) {
      case 'angry':
        return (
          <>
            <path d="M39 60 L56 66" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
            <path d="M81 60 L64 66" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
          </>
        );
      case 'skeptical':
        return (
          <>
            <path d="M40 62 L56 62" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
            <path d="M82 58 L65 64" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
          </>
        );
      case 'happy':
        return (
          <>
            <path d="M41 58 L55 55" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
            <path d="M79 58 L65 55" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
          </>
        );
      case 'lost':
        return (
          <>
            <path d="M44 60 a4 4 0 0 1 8 0" stroke="currentColor" strokeWidth="5" strokeLinecap="round" fill="none" />
            <path d="M68 60 a4 4 0 0 1 8 0" stroke="currentColor" strokeWidth="5" strokeLinecap="round" fill="none" />
          </>
        );
    }
  };

  const getMouth = () => {
    switch (mood) {
      case 'angry':
        return (
          <path d="M50 92 Q60 86 70 92" stroke="currentColor" strokeWidth="4" strokeLinecap="round" fill="none" />
        );
      case 'skeptical':
        return (
          <path d="M50 90 L70 90" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
        );
      case 'happy':
        return (
          <path d="M50 88 Q60 96 70 88" stroke="currentColor" strokeWidth="4" strokeLinecap="round" fill="none" />
        );
      case 'lost':
        return (
          <ellipse cx="60" cy="90" rx="5" ry="6.5" fill="currentColor" />
        );
    }
  };

  const getEyesY = () => {
    if (mood === 'happy') return 72;
    if (mood === 'skeptical') return 73;
    return 73;
  };

  const eyesY = getEyesY();

  return (
    <svg
      viewBox="0 0 120 120"
      width={size}
      height={size}
      className={`fill-primary text-bg ${className}`}
      aria-hidden="true"
    >
      {/* Body */}
      <path d="M60 14 C45 34 30 52 30 74 a30 30 0 0 0 60 0 C90 52 75 34 60 14 Z" />

      {/* Eyes whites */}
      <circle cx="50" cy={eyesY} r="9" fill="currentColor" opacity="0.2" />
      <circle cx="70" cy={eyesY} r="9" fill="currentColor" opacity="0.2" />

      {/* Eye pupils */}
      <circle cx="51" cy={eyesY + 2} r="4.2" fill="currentColor" opacity="0.7" />
      <circle cx="69" cy={eyesY + 2} r="4.2" fill="currentColor" opacity="0.7" />

      {/* Eyebrows and mouth - using currentColor (bg color) for "cut out" effect */}
      <g className="text-bg">
        {getEyebrows()}
        {getMouth()}
      </g>
    </svg>
  );
}

export default Mascot;
