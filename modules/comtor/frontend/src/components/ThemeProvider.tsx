import type { ReactNode } from 'react';

interface ThemeProviderProps {
  children: ReactNode;
}

/**
 * Passthrough wrapper. Theming (dark/light/system, accent, font, radius,
 * motion) is owned by the shared `@desk-launcher/theme` engine, wired at the
 * window entry (modules-pages/comtor/main.tsx). Kept as a named component so
 * App.tsx's import is unchanged and a future extraction has an obvious seam.
 */
export function ThemeProvider({ children }: ThemeProviderProps) {
  return <>{children}</>;
}

export default ThemeProvider;
