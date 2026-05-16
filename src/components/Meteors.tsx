import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Magic UI Meteors — lightweight CSS-only diagonal streaks.
 * Uses --angle CSS var so each meteor can have a unique slant.
 */
interface MeteorsProps {
  number?: number;
  className?: string;
  /** Angle in degrees for the streak direction. Default 215. */
  angle?: number;
}

const Meteors = ({ number = 20, className, angle = 215 }: MeteorsProps) => {
  const [styles, setStyles] = useState<React.CSSProperties[]>([]);

  useEffect(() => {
    const next = Array.from({ length: number }, () => ({
      "--angle": `${angle}deg`,
      top: `${Math.floor(Math.random() * 100)}%`,
      left: `${Math.floor(Math.random() * 100)}%`,
      animationDelay: `${Math.random() * 12}s`,
      animationDuration: `${Math.random() * 4 + 8}s`,
    })) as React.CSSProperties[];
    setStyles(next);
  }, [number, angle]);

  return (
    <>
      {styles.map((style, i) => (
        <span
          key={i}
          style={style}
          className={cn(
            "pointer-events-none absolute size-0.5 rotate-[215deg] animate-meteor rounded-full bg-white shadow-[0_0_0_1px_#ffffff10]",
            "before:absolute before:top-1/2 before:h-px before:w-[60px] before:-translate-y-1/2 before:transform before:bg-gradient-to-r before:from-white before:to-transparent before:content-['']",
            className,
          )}
        />
      ))}
    </>
  );
};

export default Meteors;
