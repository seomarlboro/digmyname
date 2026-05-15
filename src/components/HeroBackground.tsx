import { useMemo } from "react";

const TLDS = [
  ".com", ".ai", ".io", ".dev", ".app", ".co", ".xyz", ".so",
  ".net", ".org", ".tech", ".studio", ".cloud", ".me", ".gg", ".pro",
  ".fun", ".lol", ".sh", ".to", ".vc", ".biz", ".one", ".inc",
];

interface Pill {
  tld: string;
  left: number;
  top: number;
  delay: number;
  duration: number;
  size: number;
  opacity: number;
}

/**
 * Full-viewport animated hero background.
 * Pills avoid a central rectangle so they don't sit under the title.
 */
const HeroBackground = () => {
  const pills = useMemo<Pill[]>(() => {
    let seed = 11;
    const rnd = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };

    const out: Pill[] = [];
    for (const tld of TLDS) {
      // Reject samples that fall inside the central title exclusion zone
      // (28%–72% horizontally, 28%–68% vertically).
      let left = 0, top = 0;
      for (let i = 0; i < 20; i++) {
        left = rnd() * 96 + 2;
        top = rnd() * 88 + 6;
        const inXZone = left > 22 && left < 78;
        const inYZone = top > 26 && top < 70;
        if (!(inXZone && inYZone)) break;
      }
      out.push({
        tld,
        left,
        top,
        delay: -rnd() * 20,
        duration: 18 + rnd() * 16,
        size: 1.4 + rnd() * 2.0, // bigger: 1.4rem – 3.4rem
        opacity: 0.22 + rnd() * 0.28,
      });
    }
    return out;
  }, []);

  return (
    <div className="hero-bg pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden="true">
      <div className="hero-blob hero-blob-1" />
      <div className="hero-blob hero-blob-2" />
      <div className="hero-blob hero-blob-3" />

      <div className="hero-grid" />

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

      <div className="hero-vignette" />
    </div>
  );
};

export default HeroBackground;
