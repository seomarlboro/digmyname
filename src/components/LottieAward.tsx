import { useEffect, useState } from "react";
import Lottie, { type LottieComponentProps } from "lottie-react";
import awardAsset from "@/assets/award.json.asset.json";

interface LottieAwardProps extends Omit<LottieComponentProps, "animationData"> {
  className?: string;
}

const AURORA_VIOLET_RGB: [number, number, number] = [0.644, 0.501, 0.979]; // aurora violet hsl(258 92% 74%)
const AURORA_MINT_RGB: [number, number, number] = [0.244, 0.916, 0.748]; // aurora mint hsl(165 80% 58%)

function isStarOrHighlightLayer(name: string | undefined): boolean {
  if (!name) return false;
  const lower = name.toLowerCase();
  return lower.includes("star") || lower.includes("highlight");
}

function recolorAnimationData(
  data: unknown,
  layerName?: string
): unknown {
  if (data === null || typeof data !== "object") return data;

  if (Array.isArray(data)) {
    // Detect normalized RGBA color arrays: 4 numeric items in [0,1]
    if (
      data.length === 4 &&
      data.every((v) => typeof v === "number" && v >= 0 && v <= 1)
    ) {
      const [r, g, b, a] = data as number[];
      // Skip white/light/transparent colors to preserve backgrounds
      if (a <= 0.01 || (r > 0.95 && g > 0.95 && b > 0.95)) {
        return data;
      }
      const target = isStarOrHighlightLayer(layerName) ? AURORA_MINT_RGB : AURORA_VIOLET_RGB;
      return [...target, a];
    }
    return data.map((item) => recolorAnimationData(item, layerName));
  }

  const entries = Object.entries(data).map(([key, value]) => {
    // Propagate layer names down through layers array
    if (key === "layers" && Array.isArray(value)) {
      return [
        key,
        value.map((layer) => {
          if (layer && typeof layer === "object" && "nm" in layer) {
            const childLayerName = String((layer as Record<string, unknown>).nm);
            return recolorAnimationData(layer, childLayerName);
          }
          return recolorAnimationData(layer, layerName);
        }),
      ];
    }

    if (key === "c" && typeof value === "object" && value !== null) {
      const colorObj = value as Record<string, unknown>;
      if (Array.isArray(colorObj.k) && colorObj.k.length === 4) {
        const [r, g, b, a] = colorObj.k as number[];
        if (a > 0.01 && !(r > 0.95 && g > 0.95 && b > 0.95)) {
          const target = isStarOrHighlightLayer(layerName) ? AURORA_MINT_RGB : AURORA_VIOLET_RGB;
          return [key, { ...colorObj, k: [...target, a] }];
        }
      }
    }
    return [key, recolorAnimationData(value, layerName)];
  });

  return Object.fromEntries(entries);
}

export function LottieAward({ className, ...props }: LottieAwardProps) {
  const [animationData, setAnimationData] = useState<unknown | null>(null);

  useEffect(() => {
    fetch(awardAsset.url)
      .then((res) => res.json())
      .then((raw) => {
        const recolored = recolorAnimationData(raw);
        setAnimationData(recolored);
      })
      .catch((err) => {
        // Suppress in production per project security rule
        if (import.meta.env.DEV) console.error("Failed to load award Lottie:", err);
      });
  }, []);

  if (!animationData) return null;

  return (
    <Lottie
      animationData={animationData}
      loop
      autoplay
      className={className}
      {...props}
    />
  );
}
