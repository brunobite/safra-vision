import * as React from "react";

const MOBILE_BREAKPOINT = 768;

export function useIsMobile() {
  const getIsMobile = React.useCallback(() => {
    if (typeof window === "undefined") {
      return false;
    }

    const viewportWidth = window.visualViewport?.width ?? window.innerWidth;
    return viewportWidth < MOBILE_BREAKPOINT;
  }, []);

  const [isMobile, setIsMobile] = React.useState(getIsMobile);

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const onChange = () => {
      setIsMobile(getIsMobile());
    };

    mql.addEventListener("change", onChange);
    window.visualViewport?.addEventListener("resize", onChange);
    window.addEventListener("resize", onChange);
    onChange();

    return () => {
      mql.removeEventListener("change", onChange);
      window.visualViewport?.removeEventListener("resize", onChange);
      window.removeEventListener("resize", onChange);
    };
  }, [getIsMobile]);

  return isMobile;
}
