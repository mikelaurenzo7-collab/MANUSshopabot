import * as React from "react";

const MOBILE_BREAKPOINT = 768;
/** Below this we collapse the sidebar to an icon-rail to reclaim canvas. */
const NARROW_BREAKPOINT = 1280;

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(
    undefined
  );

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    };
    mql.addEventListener("change", onChange);
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return !!isMobile;
}

/**
 * `true` when the viewport is between mobile and a comfortable laptop width.
 * Used by the dashboard chrome to collapse the sidebar into icon-rail mode
 * (saves ~160px of horizontal space without removing nav).
 */
export function useIsNarrow() {
  const [narrow, setNarrow] = React.useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.innerWidth >= MOBILE_BREAKPOINT && window.innerWidth < NARROW_BREAKPOINT;
  });

  React.useEffect(() => {
    const mql = window.matchMedia(
      `(min-width: ${MOBILE_BREAKPOINT}px) and (max-width: ${NARROW_BREAKPOINT - 1}px)`
    );
    const onChange = () => setNarrow(mql.matches);
    mql.addEventListener("change", onChange);
    setNarrow(mql.matches);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return narrow;
}
