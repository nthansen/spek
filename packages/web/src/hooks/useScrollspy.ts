import { useEffect, useState } from "react";

// fixed header (h-14) + main padding 之和，heading 超過此線視為已捲過
const HEADER_THRESHOLD = 96;

export function useScrollspy(ids: string[]): string | null {
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    if (ids.length === 0) {
      setActiveId(null);
      return;
    }

    const computeActive = () => {
      let lastAbove: string | null = null;
      for (const id of ids) {
        const el = document.getElementById(id);
        if (!el) continue;
        const top = el.getBoundingClientRect().top;
        if (top - HEADER_THRESHOLD <= 0) {
          lastAbove = id;
        } else {
          break;
        }
      }
      setActiveId(lastAbove ?? ids[0] ?? null);
    };

    let rafId: number | null = null;
    const onScroll = () => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        computeActive();
      });
    };

    computeActive();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [ids.join("|")]);

  return activeId;
}
