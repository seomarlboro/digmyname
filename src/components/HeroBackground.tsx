import Spotlight from "@/components/Spotlight";
 * Full-viewport animated hero background.
 * Aurora mesh + rotating conic beam + drifting TLD constellation + dot grid + vignette.
 */
const TLDS = [
  { label: ".com", x: "8%",  y: "22%", size: 64, delay: "0s",   dur: "14s" },
  { label: ".ai",  x: "82%", y: "18%", size: 56, delay: "1.5s", dur: "16s" },
  { label: ".io",  x: "16%", y: "70%", size: 48, delay: "3s",   dur: "18s" },
  { label: ".dev", x: "74%", y: "62%", size: 52, delay: "0.8s", dur: "15s" },
  { label: ".app", x: "46%", y: "12%", size: 40, delay: "2.2s", dur: "17s" },
  { label: ".xyz", x: "60%", y: "82%", size: 36, delay: "4s",   dur: "19s" },
  { label: ".co",  x: "30%", y: "40%", size: 30, delay: "1s",   dur: "20s" },
  { label: ".so",  x: "88%", y: "44%", size: 28, delay: "2.8s", dur: "16s" },
];

const HeroBackground = () => {
  return (
    <div className="hero-bg pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden="true">
      {/* Rotating conic beam */}
      <div className="hero-beam" />

      {/* Spotlight cone falling onto the search bar */}
      <div className="hero-spotlight" />
      <div className="hero-spotlight-pool" />

      {/* Aurora blobs */}
      <div className="hero-blob hero-blob-1" />
      <div className="hero-blob hero-blob-2" />
      <div className="hero-blob hero-blob-3" />
      <div className="hero-blob hero-blob-4" />

      {/* Floating TLD constellation */}
      <div className="hero-constellation">
        {TLDS.map((t, i) => (
          <span
            key={i}
            className="hero-tld"
            style={{
              left: t.x,
              top: t.y,
              fontSize: `${t.size}px`,
              animationDelay: t.delay,
              animationDuration: t.dur,
            }}
          >
            {t.label}
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
