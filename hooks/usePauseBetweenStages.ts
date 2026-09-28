"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "recipe-agent.pauseBetweenStages";

function readStored(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw === null ? true : raw === "true";
  } catch {
    return true;
  }
}

/**
 * Step (default) vs Auto-run, persisted per browser (spec FR-034, FR-036).
 * Broadcasts changes across mounted components in the same tab via a custom
 * event, since `storage` only fires in *other* tabs.
 */
export function usePauseBetweenStages(): [boolean, (next: boolean) => void] {
  // Initialized to the SSR-safe default (`readStored()` can't see
  // `localStorage` on the server, so it always returns `true` there) rather
  // than calling `readStored` as the lazy initializer directly — that
  // seemed harmless since this is a `"use client"` component, but Next.js
  // still server-renders it for the initial HTML, and nothing was ever
  // correcting this value once real, client-side `localStorage` became
  // available. A saved "off" (Auto-run) preference was silently discarded
  // on every full page load/reload, always reverting to "on" — confirmed
  // with a minimal repro (toggle off, reload, still shows checked) with no
  // session or Auto-run involved at all. The mount effect below now
  // explicitly re-reads and corrects it — a one-frame flash of the default
  // is an acceptable, standard trade-off for a value that can only be known
  // once actually running in the browser.
  const [value, setValue] = useState<boolean>(true);

  useEffect(() => {
    setValue(readStored());
    const onChange = () => setValue(readStored());
    window.addEventListener("recipe-agent:pause-changed", onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener("recipe-agent:pause-changed", onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);

  const set = useCallback((next: boolean) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, String(next));
    } catch {
      // best-effort; state below still updates this tab
    }
    setValue(next);
    window.dispatchEvent(new Event("recipe-agent:pause-changed"));
  }, []);

  return [value, set];
}
