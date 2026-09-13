"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "recipe-agent.clientId";

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** 32 random bytes (256 bits) — well over the ~128-bit minimum (spec FR-003). */
function mintClientId(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return toBase64Url(bytes);
}

/**
 * The anonymous owner credential for this browser (constitution v2.0.1/v3.0.0
 * device-private model). Mint-on-first-use, SSR-safe (returns null until the
 * component has mounted, since `localStorage` doesn't exist on the server).
 */
export function useClientId(): string | null {
  const [clientId, setClientId] = useState<string | null>(null);

  useEffect(() => {
    try {
      let id = window.localStorage.getItem(STORAGE_KEY);
      if (!id) {
        id = mintClientId();
        window.localStorage.setItem(STORAGE_KEY, id);
      }
      setClientId(id);
    } catch {
      // localStorage unavailable (private mode, etc.) — fall back to an
      // in-memory id for this page load only.
      setClientId(mintClientId());
    }
  }, []);

  return clientId;
}
