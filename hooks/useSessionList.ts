"use client";

import { useCallback, useState } from "react";

const SESSIONS_KEY = "recipe-agent.sessions";

/** A session-list thumbnail (feature 007, data-model.md §6) — identically
 * shaped whether it came from the on-device path (a live `dishImage` plus a
 * freshly-signed URL) or `/mine`'s own response, so `SessionList`/`ListRow`
 * render both through one code path. */
export interface SessionThumbnail {
  imageId: string;
  url: string;
  focalX: number;
  focalY: number;
  zoom: number | null;
  alt: string;
}

/** One entry in the on-device session list (data-model.md § 4). */
export interface LocalSessionEntry {
  sessionId: string;
  title: string | null;
  lastOpened: string;
  /** `undefined` only ever appears transiently before this feature's first
   * `touch()`/refresh writes a real value; every persisted entry has either
   * a thumbnail object or an explicit `null` (no finalized branch yet, or
   * its image failed). */
  thumbnail?: SessionThumbnail | null;
}

function readLocal(): LocalSessionEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(SESSIONS_KEY);
    return raw ? (JSON.parse(raw) as LocalSessionEntry[]) : [];
  } catch {
    return [];
  }
}

function writeLocal(entries: LocalSessionEntry[]): void {
  try {
    window.localStorage.setItem(SESSIONS_KEY, JSON.stringify(entries));
  } catch {
    // best-effort — list still updates in this tab's state
  }
}

interface MineResponse {
  sessions: {
    sessionId: string;
    title: string | null;
    lastActivity: string;
    status: string;
    thumbnail: SessionThumbnail | null;
  }[];
}

/**
 * The on-device session list (spec FR-004): sessions this browser has
 * started or opened, newest-first. Rebuildable from `GET /mine` (spec
 * FR-032) when `localStorage` is empty or lost (private browsing, cleared
 * site data).
 */
export function useSessionList(clientId: string | null) {
  const [entries, setEntries] = useState<LocalSessionEntry[]>(() => readLocal());

  /** Records that a session was just created or opened, moving it to the
   * front. `thumbnail` is optional and tri-state: omitted (`undefined`)
   * leaves whatever thumbnail this entry already had untouched (most
   * `touch()` calls fire on every title change, long before a `dishImage`
   * exists yet); passed explicitly (including `null`) replaces it — the
   * on-device path in `app/page.tsx` passes the live, freshly-signed
   * thumbnail once `finalize` completes (feature 007, data-model.md §6). */
  const touch = useCallback(
    (sessionId: string, title: string | null, thumbnail?: SessionThumbnail | null) => {
      setEntries((prev) => {
        const existing = prev.find((e) => e.sessionId === sessionId);
        const next = [
          {
            sessionId,
            title,
            lastOpened: new Date().toISOString(),
            thumbnail: thumbnail !== undefined ? thumbnail : existing?.thumbnail,
          },
          ...prev.filter((e) => e.sessionId !== sessionId),
        ];
        writeLocal(next);
        return next;
      });
    },
    [],
  );

  const remove = useCallback((sessionId: string) => {
    setEntries((prev) => {
      const next = prev.filter((e) => e.sessionId !== sessionId);
      writeLocal(next);
      return next;
    });
  }, []);

  const refreshFromServer = useCallback(async () => {
    if (!clientId) return;
    try {
      const res = await fetch("/api/recipe/mine", { headers: { "X-Client-Id": clientId } });
      if (!res.ok) return;
      const json = (await res.json()) as MineResponse;
      const next: LocalSessionEntry[] = json.sessions.map((s) => ({
        sessionId: s.sessionId,
        title: s.title,
        lastOpened: s.lastActivity,
        thumbnail: s.thumbnail,
      }));
      setEntries(next);
      writeLocal(next);
    } catch {
      // best-effort — the list just stays whatever it already was
    }
  }, [clientId]);

  return { entries, touch, remove, refreshFromServer };
}
