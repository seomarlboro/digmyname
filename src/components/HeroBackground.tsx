import { useEffect, useRef } from "react";
import Spotlight from "@/components/Spotlight";
import Meteors from "@/components/Meteors";

/**
 * Full-viewport animated hero background.
 * Spotlights + aurora mesh + drifting TLD constellation (mouse parallax) + dot grid + vignette.
 */
const TLDS = [
  { label: ".com", x: "8%",  y: "8%", size: 64, depth: 40, delay: "0s",   dur: "14s" },
  { label: ".ai",  x: "82%", y: "18%", size: 56, depth: 32, delay: "1.5s", dur: "16s" },
  { label: ".io",  x: "16%", y: "70%", size: 48, depth: 24, delay: "3s",   dur: "18s" },
  { label: ".dev", x: "74%", y: "62%", size: 52, depth: 28, delay: "0.8s", dur: "15s" },
  { label: ".app", x: "46%", y: "12%", size: 40, depth: 18, delay: "2.2s", dur: "17s" },
  { label: ".xyz", x: "60%", y: "82%", size: 36, depth: 14, delay: "4s",   dur: "19s" },
  { label: ".co",  x: "30%", y: "40%", size: 30, depth: 12, delay: "1s",   dur: "20s" },
  { label: ".so",  x: "88%", y: "44%", size: 28, depth: 10, delay: "2.8s", dur: "16s" },
];

const HeroBackground = () => {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    // Respect reduced motion
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let targetX = 0;
    let targetY = 0;
    let currentX = 0;
    let currentY = 0;
    let raf = 0;

    const onMove = (e: PointerEvent) => {
      // Normalize cursor to [-1, 1] from viewport center
      targetX = (e.clientX / window.innerWidth) * 2 - 1;
      targetY = (e.clientY / window.innerHeight) * 2 - 1;
    };

    const tick = () => {
      // Smooth interpolation
      currentX += (targetX - currentX) * 0.06;
      currentY += (targetY - currentY) * 0.06;
      el.style.setProperty("--mx", currentX.toFixed(3));
      el.style.setProperty("--my", currentY.toFixed(3));
      raf = requestAnimationFrame(tick);
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    raf = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div
      ref={rootRef}
      className="hero-bg pointer-events-none fixed inset-0 z-0 overflow-hidden"
      style={{ "--mx": "0", "--my": "0" } as React.CSSProperties}
      aria-hidden="true"
    >
      {/* SVG spotlights — Aceternity-style soft beams */}
      <Spotlight className="-top-40 left-0 md:-top-20 md:left-60" fill="hsl(218 96% 65%)" />
      <Spotlight className="top-10 right-0 md:top-32 md:right-40 [transform:scaleX(-1)]" fill="hsl(262 83% 65%)" />

      {/* Meteors — lightweight diagonal streaks */}
      <div className="absolute inset-0 overflow-hidden opacity-60">
        <Meteors number={7} />
      </div>

      {/* Aurora blobs */}
      <div className="hero-blob hero-blob-1" />
      <div className="hero-blob hero-blob-2" />
      <div className="hero-blob hero-blob-3" />
      <div className="hero-blob hero-blob-4" />

      {/* Floating TLD constellation — parallax wrapper + float inner */}
      <div className="hero-constellation">
        {TLDS.map((t, i) => (
          <span
            key={i}
            className="hero-tld-wrap"
            style={{
              left: t.x,
              top: t.y,
              ["--depth" as string]: t.depth,
            } as React.CSSProperties}
          >
            <span
              className="hero-tld"
              style={{
                fontSize: `${t.size}px`,
                animationDelay: t.delay,
                animationDuration: t.dur,
              }}
            >
              {t.label}
            </span>
          </span>
        ))}
      </div>

      {/* Dot grid */}
      <div className="hero-grid" />

      {/* Vignette */}
      <div className="hero-vignette" />

      {/* Noise overlay */}
      <div className="hero-noise" />
    </div>
  );
};

export default HeroBackground;
