import { Suspense, lazy, useEffect, useState } from "react";

const AuthDialog = lazy(() => import("@/components/AuthDialog"));

interface LazyAuthDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Defers loading the auth dialog chunk until the dialog is first opened,
 * keeping it out of the initial home bundle. Once mounted it stays mounted,
 * so open/close animations behave exactly as before.
 */
const LazyAuthDialog = ({ open, onOpenChange }: LazyAuthDialogProps) => {
  const [mounted, setMounted] = useState(open);

  useEffect(() => {
    if (open) setMounted(true);
  }, [open]);

  if (!mounted) return null;

  return (
    <Suspense fallback={null}>
      <AuthDialog open={open} onOpenChange={onOpenChange} />
    </Suspense>
  );
};

export default LazyAuthDialog;
