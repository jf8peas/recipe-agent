"use client";

import { useCallback, useState } from "react";

const SESSIONS_KEY = "recipe-agent.sessions";

/** One entry in the on-device session list (data-model.md § 4). */
export interface LocalSessionEntry {
  sessionId: string;
  title: string | null;
  lastOpened: string;
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
  sessions: { sessionId: string; title: string | null; lastActivity: string; status: string }[];
}

/**
 * The on-device session list (spec FR-004): sessions this browser has
 * started or opened, newest-first. Rebuildable from `GET /mine` (spec
 * FR-032) when `localStorage` is empty or lost (private browsing, cleared
 * site data).
 */
export function useSessionList(clientId: string | null) {
  const [entries, setEntries] = useState<LocalSessionEntry[]>(() => readLocal());

  /** Records that a session was just created or opened, moving it to the front. */
  const touch = useCallback((sessionId: string, title: string | null) => {
    setEntries((prev) => {
      const next = [
        { sessionId, title, lastOpened: new Date().toISOString() },
        ...prev.filter((e) => e.sessionId !== sessionId),
      ];
      writeLocal(next);
      return next;
    });
  }, []);

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
      }));
      setEntries(next);
      writeLocal(next);
    } catch {
      // best-effort — the list just stays whatever it already was
    }
  }, [clientId]);

  return { entries, touch, remove, refreshFromServer };
}
