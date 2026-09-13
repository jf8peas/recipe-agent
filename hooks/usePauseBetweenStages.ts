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
  const [value, setValue] = useState<boolean>(readStored);

  useEffect(() => {
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
