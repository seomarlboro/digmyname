import { useMemo } from "react";

// Curated TLDs that drift in the hero background.
const TLDS = [
  ".com", ".ai", ".io", ".dev", ".app", ".co", ".xyz", ".so",
  ".net", ".org", ".tech", ".studio", ".cloud", ".me", ".gg", ".pro",
];

interface Pill {
  tld: string;
  left: number;   // %
  top: number;    // %
  delay: number;  // s
  duration: number; // s
  size: number;   // rem
  opacity: number;
}

/**
 * Animated hero background: morphing brand blobs + drifting TLD pills.
 * Pure CSS, no deps. respects prefers-reduced-motion.
 */
const HeroBackground = () => {
  const pills = useMemo<Pill[]>(() => {
    // Deterministic pseudo-random layout (stable between renders).
    let seed = 7;
    const rnd = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };
    return TLDS.map((tld) => ({
      tld,
      left: rnd() * 92 + 4,
      top: rnd() * 80 + 10,
      delay: -rnd() * 18,
      duration: 16 + rnd() * 14,
      size: 0.85 + rnd() * 0.9,
      opacity: 0.18 + rnd() * 0.22,
    }));
  }, []);

  return (
    <div className="hero-bg pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {/* Morphing brand blobs */}
      <div className="hero-blob hero-blob-1" />
      <div className="hero-blob hero-blob-2" />
      <div className="hero-blob hero-blob-3" />

      {/* Subtle dot grid */}
      <div className="hero-grid" />

      {/* Drifting TLD pills */}
      {pills.map((p, i) => (
        <span
          key={i}
          className="hero-pill"
          style={{
            left: `${p.left}%`,
            top: `${p.top}%`,
            fontSize: `${p.size}rem`,
            opacity: p.opacity,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
          }}
        >
          {p.tld}
        </span>
      ))}

      {/* Vignette to focus center */}
      <div className="hero-vignette" />
    </div>
  );
};

export default HeroBackground;
