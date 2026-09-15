import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full font-display font-bold tracking-tight ring-offset-background transition-[color,background-color,box-shadow,transform] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
        gradient: "btn-gradient mint-glow-sm hover:opacity-90 hover:-translate-y-0.5",
        /** Gradient without the glow: result rows and cards (no glow on search/results surfaces). */
        cta: "btn-gradient border-0",
        /** Same geometry as `cta`, neutral fill: secondary outbound links (Whois). */
        "cta-secondary": "border-0 bg-secondary text-secondary-foreground hover:bg-secondary/80 dark:bg-white/10 dark:hover:bg-white/[0.14]",
        mint: "bg-mint text-[hsl(232_28%_8%)] mint-glow-sm hover:bg-mint/90 hover:-translate-y-0.5",
        "ghost-mint": "border border-mint/30 bg-transparent text-mint hover:bg-mint/10",
      },
      // Height, horizontal padding (32 px) and type size per size — call sites don't restate them.
      size: {
        default: "h-10 px-8 text-sm",
        sm: "h-9 px-8 text-sm",
        /** The outbound call-to-action (CtaLink): 24 px from the content on both sides. */
        cta: "h-10 px-6 text-sm",
        lg: "h-12 px-8 text-base",
        icon: "h-10 w-10 text-sm",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
