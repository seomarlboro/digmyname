#!/usr/bin/env node
/**
 * Regenerate public/og-image.jpg — the card every social platform shows.
 *
 * Why this exists as a script rather than a one-off export: the old card was
 * 1536×1024 while the page declared og:image:width 1200 / height 630, so every
 * platform that trusts the declared size cropped it. It also advertised
 * "AI-powered ideas", a claim removed from the rest of the site in e0e8062 —
 * the one surface nobody re-reads is the one that kept saying it.
 *
 * Everything on the card has to be a claim that is live on the site. The sizes
 * and the copy are asserted by src/test/og-image.test.ts.
 *
 * Run:  node scripts/og-image.mjs
 * Needs a python3 carrying Pillow, fontTools and brotli (brotli is what decodes
 * the woff2). The first interpreter on PATH is often not that one, so this
 * probes the usual macOS locations and reports what is missing instead of
 * failing with a bare ImportError. It reads the brand woff2 straight out of
 * src/assets/fonts — the card is set in the site's own type.
 */
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");

const PY = String.raw`
import io, os, sys, math
from PIL import Image, ImageDraw, ImageFont, ImageFilter
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

ROOT = sys.argv[1]
W, H = 1200, 630                      # exactly what index.html declares

def static(woff2, weight):
    """A single-weight TTF out of the repo's variable brand font."""
    f = TTFont(os.path.join(ROOT, "src/assets/fonts", woff2))
    f.flavor = None
    f = instancer.instantiateVariableFont(f, {"wght": weight})
    buf = io.BytesIO(); f.save(buf); buf.seek(0)
    return buf.read()

def load(data, size):
    return ImageFont.truetype(io.BytesIO(data), size)

sora_x  = static("sora-latin.woff2", 800)
sora_b  = static("sora-latin.woff2", 700)
manrope = static("manrope-latin.woff2", 500)
mono    = static("geist-mono-latin.woff2", 500)

# --- palette: the dark theme's own tokens (src/index.css) ---
BG        = (9, 10, 16)
FG        = (233, 236, 242)
MUTED     = (135, 141, 163)
MINT      = (46, 235, 186)      # --aurora-mint  165 80% 58%
VIOLET    = (166, 124, 250)     # --aurora-violet 258 92% 74%

img = Image.new("RGB", (W, H), BG)

# Aurora wash, same two hues as .text-gradient, kept subtle behind the type.
glow = Image.new("RGB", (W, H), BG)
gd = ImageDraw.Draw(glow)
for cx, cy, r, col, strength in [(150, 90, 620, MINT, 0.30), (1080, 560, 660, VIOLET, 0.34)]:
    for i in range(r, 0, -8):
        t = (1 - i / r) ** 2 * strength
        gd.ellipse([cx - i, cy - i, cx + i, cy + i],
                   fill=tuple(int(BG[c] + (col[c] - BG[c]) * t) for c in range(3)))
img = Image.blend(img, glow.filter(ImageFilter.GaussianBlur(60)), 1.0)
d = ImageDraw.Draw(img)

# Hairline grid, as on the hero, barely there.
for x in range(0, W, 60):
    d.line([(x, 0), (x, H)], fill=(16, 18, 28), width=1)
for y in range(0, H, 60):
    d.line([(0, y), (W, y)], fill=(16, 18, 28), width=1)

M = 72                                    # margin; nothing important outside it

def gradient_text(xy, text, font, c1, c2):
    """Mint→violet across the string, the way .text-gradient renders it."""
    mask = Image.new("L", (W, H), 0)
    ImageDraw.Draw(mask).text(xy, text, font=font, fill=255)
    box = mask.getbbox()
    ramp = Image.new("RGB", (W, H), c1)
    rd = ImageDraw.Draw(ramp)
    x0, x1 = box[0], box[2]
    for x in range(x0, x1 + 1):
        t = (x - x0) / max(1, x1 - x0)
        rd.line([(x, 0), (x, H)], fill=tuple(int(c1[c] + (c2[c] - c1[c]) * t) for c in range(3)))
    img.paste(ramp, (0, 0), mask)

# --- wordmark ---
d.text((M, 62), "DigMyName", font=load(sora_b, 40), fill=FG)

# --- headline: the site's own h1, split the way the page splits it ---
head = load(sora_x, 82)
gradient_text((M, 170), "World's fastest", head, MINT, VIOLET)
gradient_text((M, 268), "domain search.", head, MINT, VIOLET)

# --- the hedge that makes the claim honest, verbatim from the page ---
d.text((M, 392), "Or the second — the timer on screen tells you which.",
       font=load(manrope, 30), fill=MUTED)

# --- facts, each one live on the site ---
chips = ["First answer under 0.5 s · p95", "54 extensions · 6 registrars", "Free API, no key"]
cf = load(manrope, 24)
x = M
for text in chips:
    w = d.textlength(text, font=cf)
    d.rounded_rectangle([x, 470, x + w + 44, 470 + 52], radius=26, outline=(48, 54, 74), width=1)
    d.text((x + 22, 470 + 14), text, font=cf, fill=(198, 204, 219))
    x += w + 44 + 16

d.text((M, 556), "digmyname.com", font=load(mono, 26), fill=MINT)

out = os.path.join(ROOT, "public/og-image.jpg")
img.save(out, "JPEG", quality=92, optimize=True, progressive=True)
print(f"{out} {img.size[0]}x{img.size[1]} {os.path.getsize(out)}b")
`;

/** The first interpreter that has Pillow, fontTools and brotli. */
function findPython() {
  const probe = "import PIL, fontTools, brotli";
  const tried = [];
  for (const bin of ["python3", "/usr/bin/python3", "/opt/homebrew/bin/python3", "/usr/local/bin/python3"]) {
    try {
      execFileSync(bin, ["-c", probe], { stdio: "ignore" });
      return bin;
    } catch {
      tried.push(bin);
    }
  }
  throw new Error(
    `no python3 with Pillow + fontTools + brotli (tried ${tried.join(", ")}).\n` +
      `Install with:  python3 -m pip install pillow fonttools brotli`,
  );
}

console.log(execFileSync(findPython(), ["-c", PY, ROOT], { encoding: "utf8" }).trim());
