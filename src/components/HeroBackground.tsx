/**
 * Full-viewport animated hero background.
 * Subtle gradient blobs + grid + vignette. No floating TLD pills.
 */
const HeroBackground = () => {
  return (
    <div className="hero-bg pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden="true">
      <div className="hero-blob hero-blob-1" />
      <div className="hero-blob hero-blob-2" />
      <div className="hero-blob hero-blob-3" />
      <div className="hero-grid" />
      <div className="hero-vignette" />
    </div>
  );
};

export default HeroBackground;
