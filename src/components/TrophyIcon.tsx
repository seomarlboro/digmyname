/**
 * The "take the crown" trophy on /speed. Hand-drawn SVG in the aurora palette
 * with a one-line CSS shimmer — replaces a Lottie player (365 KB chunk, `eval`)
 * that existed for this single 96 px icon.
 */
export function TrophyIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 96 96"
      className={className}
      role="img"
      aria-label="Trophy"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="trophy-cup" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="hsl(var(--aurora-violet))" />
          <stop offset="100%" stopColor="hsl(var(--aurora-mint))" />
        </linearGradient>
        <linearGradient id="trophy-shine" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="white" stopOpacity="0" />
          <stop offset="50%" stopColor="white" stopOpacity="0.55" />
          <stop offset="100%" stopColor="white" stopOpacity="0" />
        </linearGradient>
        <clipPath id="trophy-clip">
          <path d="M24 14h48v22c0 14-10.7 25-24 25S24 50 24 36V14z" />
        </clipPath>
      </defs>
      {/* handles */}
      <path
        d="M24 22H14c-1.1 0-2 .9-2 2v6c0 8.8 7.2 16 16 16h1M72 22h10c1.1 0 2 .9 2 2v6c0 8.8-7.2 16-16 16h-1"
        fill="none"
        stroke="url(#trophy-cup)"
        strokeWidth="4"
        strokeLinecap="round"
      />
      {/* cup */}
      <path d="M24 14h48v22c0 14-10.7 25-24 25S24 50 24 36V14z" fill="url(#trophy-cup)" />
      <rect className="trophy-shine" x="-40" y="10" width="28" height="56" fill="url(#trophy-shine)" clipPath="url(#trophy-clip)" transform="skewX(-18)" />
      {/* star */}
      <path
        d="M48 24l3.1 6.5 7.1.9-5.2 4.9 1.4 7L48 39.9l-6.4 3.4 1.4-7-5.2-4.9 7.1-.9L48 24z"
        fill="hsl(var(--aurora-mint))"
        opacity="0.95"
      />
      {/* stem + base */}
      <path d="M44 61h8v9h-8z" fill="url(#trophy-cup)" />
      <path d="M34 70h28a4 4 0 0 1 4 4v6H30v-6a4 4 0 0 1 4-4z" fill="url(#trophy-cup)" />
      <rect x="36" y="74" width="24" height="3" rx="1.5" fill="hsl(var(--background))" opacity="0.35" />
    </svg>
  );
}

export default TrophyIcon;
