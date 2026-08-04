import { useEffect, useState } from "react";
import Lottie, { type LottieComponentProps } from "lottie-react";
import awardAsset from "@/assets/award.json.asset.json";

interface LottieAwardProps extends Omit<LottieComponentProps, "animationData"> {
  className?: string;
}

const PRIMARY_RGB: [number, number, number] = [0.08, 0.365, 0.984]; // #145DFB

function recolorAnimationData(data: unknown): unknown {
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
      return [...PRIMARY_RGB, a];
    }
    return data.map(recolorAnimationData);
  }

  const entries = Object.entries(data).map(([key, value]) => {
    if (key === "c" && typeof value === "object" && value !== null) {
      const colorObj = value as Record<string, unknown>;
      if (Array.isArray(colorObj.k) && colorObj.k.length === 4) {
        const [r, g, b, a] = colorObj.k as number[];
        if (a > 0.01 && !(r > 0.95 && g > 0.95 && b > 0.95)) {
          return [key, { ...colorObj, k: [...PRIMARY_RGB, a] }];
        }
      }
    }
    return [key, recolorAnimationData(value)];
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
