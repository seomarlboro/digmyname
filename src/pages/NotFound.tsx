import { Link, useLocation } from "react-router-dom";
import { useEffect, useMemo } from "react";
import { ArrowLeft, Home, Search } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * 404 — cosmic, 2026-canon.
 * Pure CSS/SVG: warping starfield, drifting nebula, orbiting lost planet, shooting stars.
 * No external assets, respects prefers-reduced-motion.
 */
const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    if (import.meta.env.DEV) {
      console.error("404: route not found:", location.pathname);
    }
    document.title = "404 — Lost in space | DigMyName";
  }, [location.pathname]);

  // Deterministic star field so it doesn't re-shuffle on every render
  const stars = useMemo(
    () =>
      Array.from({ length: 90 }, (_, i) => {
        const seed = (i * 9301 + 49297) % 233280;
        const rnd = seed / 233280;
        const rnd2 = ((i * 4817 + 12345) % 100) / 100;
        const rnd3 = ((i * 733 + 17) % 100) / 100;
        return {
          top: `${rnd * 100}%`,
          left: `${rnd2 * 100}%`,
          size: 1 + rnd3 * 2.2,
          delay: `${rnd * 6}s`,
          dur: `${2 + rnd2 * 4}s`,
          op: 0.35 + rnd3 * 0.6,
        };
      }),
    []
  );

  return (
    <main className="relative min-h-screen overflow-hidden bg-background text-foreground">
      {/* ------- Cosmic backdrop ------- */}
      <div aria-hidden className="absolute inset-0 nf-bg" />
      <div aria-hidden className="absolute inset-0 nf-nebula-a" />
      <div aria-hidden className="absolute inset-0 nf-nebula-b" />
      <div aria-hidden className="absolute inset-0 nf-nebula-c" />
      <div aria-hidden className="absolute inset-0 nf-grid" />

      {/* Starfield */}
      <div aria-hidden className="absolute inset-0">
        {stars.map((s, i) => (
          <span
            key={i}
            className="nf-star"
            style={{
              top: s.top,
              left: s.left,
              width: `${s.size}px`,
              height: `${s.size}px`,
              animationDelay: s.delay,
              animationDuration: s.dur,
              opacity: s.op,
            }}
          />
        ))}
      </div>

      {/* Shooting stars */}
      <div aria-hidden className="absolute inset-0 overflow-hidden">
        <span className="nf-shoot" style={{ top: "12%", left: "80%", animationDelay: "0s" }} />
        <span className="nf-shoot" style={{ top: "38%", left: "90%", animationDelay: "3.4s" }} />
        <span className="nf-shoot" style={{ top: "68%", left: "70%", animationDelay: "6.1s" }} />
      </div>

      {/* Orbit + lost planet */}
      <div aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="nf-orbit">
          <div className="nf-orbit-ring" />
          <div className="nf-orbit-ring nf-orbit-ring--2" />
          <div className="nf-planet">
            <div className="nf-planet-inner" />
            <div className="nf-planet-glow" />
          </div>
        </div>
      </div>

      {/* Vignette */}
      <div aria-hidden className="absolute inset-0 nf-vignette" />

      {/* ------- Content ------- */}
      <section className="relative z-10 mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center px-6 py-24 text-center">
        <span className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium tracking-wide text-foreground/80 backdrop-blur-md">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
          </span>
          Signal lost · sector 404
        </span>

        <h1 className="text-gradient text-[clamp(6rem,22vw,14rem)] font-black leading-none tracking-tighter">
          404
        </h1>

        <p className="mt-4 text-xl font-semibold sm:text-2xl">
          This page drifted out of orbit.
        </p>
        <p className="mt-3 max-w-md text-sm text-muted-foreground sm:text-base">
          The domain you're chasing isn't in our star chart. Let's get you back
          to somewhere charted.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Button asChild size="lg" className="btn-gradient rounded-2xl">
            <Link to="/">
              <Home className="mr-2 h-4 w-4" />
              Back to Earth
            </Link>
          </Button>
          <Button
            asChild
            variant="outline"
            size="lg"
            className="rounded-2xl border-white/15 bg-white/5 backdrop-blur-md hover:bg-white/10"
          >
            <Link to="/">
              <Search className="mr-2 h-4 w-4" />
              Search a domain
            </Link>
          </Button>
          <button
            onClick={() => window.history.back()}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Go back
          </button>
        </div>

        <p className="mt-10 font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground/60">
          error_code: NX_404 · path: {location.pathname}
        </p>
      </section>

      {/* Scoped styles */}
      <style>{`
        .nf-bg {
          background:
            radial-gradient(ellipse 60% 50% at 50% 10%, hsl(218 96% 53% / 0.18), transparent 60%),
            radial-gradient(ellipse 70% 55% at 50% 100%, hsl(262 83% 60% / 0.22), transparent 60%),
            linear-gradient(180deg, hsl(230 40% 4%), hsl(240 45% 6%) 60%, hsl(260 50% 5%));
        }
        .nf-nebula-a, .nf-nebula-b, .nf-nebula-c {
          filter: blur(90px);
          border-radius: 50%;
          opacity: 0.55;
          will-change: transform;
        }
        .nf-nebula-a {
          position: absolute;
          width: 55vw; height: 55vw;
          left: -12vw; top: -10vw;
          background: radial-gradient(circle, hsl(218 96% 55% / 0.55), transparent 70%);
          animation: nf-drift-a 30s ease-in-out infinite;
        }
        .nf-nebula-b {
          position: absolute;
          width: 50vw; height: 50vw;
          right: -10vw; top: 20%;
          background: radial-gradient(circle, hsl(280 85% 60% / 0.55), transparent 70%);
          animation: nf-drift-b 36s ease-in-out infinite;
        }
        .nf-nebula-c {
          position: absolute;
          width: 45vw; height: 45vw;
          left: 25%; bottom: -20vw;
          background: radial-gradient(circle, hsl(190 95% 55% / 0.35), transparent 70%);
          animation: nf-drift-c 34s ease-in-out infinite;
        }
        .nf-grid {
          background-image:
            linear-gradient(hsl(218 96% 80% / 0.06) 1px, transparent 1px),
            linear-gradient(90deg, hsl(218 96% 80% / 0.06) 1px, transparent 1px);
          background-size: 48px 48px;
          mask-image: radial-gradient(ellipse at center, black 10%, transparent 70%);
          -webkit-mask-image: radial-gradient(ellipse at center, black 10%, transparent 70%);
          opacity: 0.5;
        }
        .nf-vignette {
          background: radial-gradient(ellipse at center, transparent 40%, hsl(230 40% 3% / 0.9) 100%);
          pointer-events: none;
        }
        .nf-star {
          position: absolute;
          border-radius: 999px;
          background: white;
          box-shadow: 0 0 6px hsl(218 96% 75% / 0.6);
          animation: nf-twinkle ease-in-out infinite;
        }
        @keyframes nf-twinkle {
          0%, 100% { opacity: var(--o, 0.5); transform: scale(1); }
          50% { opacity: 1; transform: scale(1.4); }
        }
        .nf-shoot {
          position: absolute;
          width: 2px; height: 2px;
          background: white;
          border-radius: 999px;
          box-shadow: 0 0 8px white;
          animation: nf-shoot 8s linear infinite;
          opacity: 0;
        }
        .nf-shoot::before {
          content: "";
          position: absolute;
          top: 50%;
          right: 0;
          width: 140px;
          height: 1px;
          background: linear-gradient(90deg, transparent, white);
          transform: translateY(-50%);
        }
        @keyframes nf-shoot {
          0%   { transform: translate(0, 0) rotate(215deg); opacity: 0; }
          5%   { opacity: 1; }
          40%  { opacity: 1; }
          60%  { transform: translate(-600px, 420px) rotate(215deg); opacity: 0; }
          100% { transform: translate(-600px, 420px) rotate(215deg); opacity: 0; }
        }

        /* Orbit */
        .nf-orbit {
          position: relative;
          width: min(80vw, 620px);
          height: min(80vw, 620px);
          animation: nf-spin 40s linear infinite;
        }
        .nf-orbit-ring {
          position: absolute; inset: 0;
          border-radius: 50%;
          border: 1px dashed hsl(218 96% 75% / 0.18);
        }
        .nf-orbit-ring--2 {
          inset: 12%;
          border-color: hsl(280 85% 75% / 0.14);
          border-style: solid;
          border-width: 1px;
        }
        .nf-planet {
          position: absolute;
          top: -14px; left: 50%;
          width: 28px; height: 28px;
          transform: translateX(-50%);
        }
        .nf-planet-inner {
          width: 100%; height: 100%;
          border-radius: 50%;
          background:
            radial-gradient(circle at 30% 30%, hsl(218 96% 75%), hsl(262 83% 45%) 60%, hsl(260 60% 20%));
          box-shadow:
            inset -6px -6px 12px hsl(260 60% 10% / 0.8),
            0 0 24px hsl(218 96% 60% / 0.7);
          animation: nf-spin-rev 40s linear infinite;
        }
        .nf-planet-glow {
          position: absolute; inset: -14px;
          border-radius: 50%;
          background: radial-gradient(circle, hsl(218 96% 60% / 0.5), transparent 70%);
          filter: blur(8px);
        }

        @keyframes nf-spin { to { transform: rotate(360deg); } }
        @keyframes nf-spin-rev { to { transform: rotate(-360deg); } }

        @keyframes nf-drift-a {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50%      { transform: translate(8vw, 6vw) scale(1.1); }
        }
        @keyframes nf-drift-b {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50%      { transform: translate(-6vw, 4vw) scale(0.95); }
        }
        @keyframes nf-drift-c {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50%      { transform: translate(4vw, -6vw) scale(1.08); }
        }

        @media (prefers-reduced-motion: reduce) {
          .nf-star, .nf-shoot, .nf-nebula-a, .nf-nebula-b, .nf-nebula-c,
          .nf-orbit, .nf-planet-inner {
            animation: none !important;
          }
        }
      `}</style>
    </main>
  );
};

export default NotFound;
