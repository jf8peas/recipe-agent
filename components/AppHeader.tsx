"use client";

import { useState, type CSSProperties } from "react";
import { usePauseBetweenStages } from "@/hooks/usePauseBetweenStages";
import { AUTHOR_LINKEDIN_URL } from "@/lib/about-content";
import { AboutPage } from "@/components/about/AboutPage";
import { Toggle } from "@/components/ui/Toggle";
import { Button } from "@/components/ui/Button";

const FEEDBACK_URL = "https://github.com/jf8peas/recipe-agent/issues";

export type HeaderMode = "app" | "about";

export interface AppHeaderProps {
  mode?: HeaderMode;
  // "app" mode — all optional; when omitted, this instance self-manages
  // pause-between-stages and its own About page, exactly as before this
  // feature (the standard `app/layout.tsx` call site keeps using this).
  pauseBetweenStages?: boolean;
  onTogglePause?: (next: boolean) => void;
  onOpenAbout?: () => void;
  // "about" mode:
  onReturn?: () => void;
}

interface NavLink {
  href: string;
  label: string;
}

/** The exact 10-entry nav list design/v002/about.html's own <nav> exposes
 * (feature 004, unchanged) — now owned here since this component renders
 * the "about" mode's header in place of AboutPage's own former inline one. */
const NAV_LINKS: NavLink[] = [
  { href: "pitch", label: "Overview" },
  { href: "journey", label: "Using it" },
  { href: "architecture", label: "Architecture" },
  { href: "agent-graph", label: "Agent graph" },
  { href: "state", label: "State & persistence" },
  { href: "branching", label: "Branching" },
  { href: "data-model", label: "Data model" },
  { href: "repo", label: "Repo" },
  { href: "api", label: "API" },
  { href: "principles", label: "Principles" },
];

const visuallyHiddenStyle: CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0,0,0,0)",
  whiteSpace: "nowrap",
  border: 0,
};

const headerStyle: CSSProperties = {
  position: "sticky",
  top: 0,
  zIndex: 1,
  minHeight: "var(--header-height)",
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "var(--space-2)",
  padding: "var(--space-2) var(--space-4)",
  borderBottom: "1px solid var(--color-border)",
  background: "var(--color-surface)",
};

const rightGroupStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: "var(--space-4)",
  rowGap: "var(--space-2)",
};

const markStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 28,
  height: 28,
  borderRadius: "var(--radius-sm)",
  background: "var(--color-accent)",
  color: "var(--color-accent-contrast)",
  fontFamily: "ui-monospace, 'Cascadia Code', monospace",
  fontSize: "var(--text-xs)",
  fontWeight: 700,
};

const titleGroupStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--space-2)",
};

/**
 * Persistent header, shared shell for both the app's own screens and the
 * About page (spec 006 US1, FR-002–FR-004) — one component, two `mode`s,
 * same height/background/border/padding throughout so switching between
 * them is never jarring.
 *
 * `mode="app"` (the default, used by `app/layout.tsx`'s unchanged call
 * site) self-manages `pauseBetweenStages` and its own `isAboutOpen` state,
 * rendering `AboutPage` as its own sibling — exactly as before this
 * feature. The optional props exist only for the second, separate
 * `mode="about"` instance (rendered from inside `AboutPage.tsx` itself),
 * which is fully props-controlled and owns no state of its own.
 */
export function AppHeader({
  mode = "app",
  pauseBetweenStages: pauseProp,
  onTogglePause,
  onOpenAbout,
  onReturn,
}: AppHeaderProps) {
  const [selfPause, setSelfPause] = usePauseBetweenStages();
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [announcement, setAnnouncement] = useState("");

  const pauseBetweenStages = pauseProp ?? selfPause;
  const handleTogglePause = onTogglePause ?? setSelfPause;
  const handleOpenAbout = onOpenAbout ?? (() => setIsAboutOpen(true));

  function handleNavClick(link: NavLink) {
    return () => {
      const target = document.getElementById(link.href);
      target?.focus();
      setAnnouncement(`Jumped to: ${link.label}`);
    };
  }

  if (mode === "about") {
    return (
      <header style={headerStyle}>
        <div aria-live="polite" style={visuallyHiddenStyle}>
          {announcement}
        </div>
        <strong style={{ fontSize: "var(--text-lg)" }}>Recipe Agent — how it works</strong>
        <div style={rightGroupStyle}>
          <nav
            aria-label="Page sections"
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "var(--space-3)",
              fontSize: "var(--text-sm)",
            }}
          >
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={`#${link.href}`}
                onClick={handleNavClick(link)}
                style={{ color: "var(--color-text-muted)", textDecoration: "none" }}
              >
                {link.label}
              </a>
            ))}
          </nav>
          <Button variant="primary" onClick={onReturn}>
            Return to App
          </Button>
        </div>
      </header>
    );
  }

  return (
    <>
      <header style={headerStyle}>
        <div style={titleGroupStyle}>
          <span aria-hidden="true" style={markStyle}>
            RA
          </span>
          <strong style={{ fontSize: "var(--text-lg)" }}>Recipe Agent</strong>
        </div>

        <div style={rightGroupStyle}>
          <Toggle
            checked={pauseBetweenStages}
            onChange={handleTogglePause}
            label="Pause between stages"
            describedById="pause-between-stages-hint"
          />
          <span id="pause-between-stages-hint" style={visuallyHiddenStyle}>
            When off, the assistant advances through stages automatically (Auto-run).
          </span>

          <a href={AUTHOR_LINKEDIN_URL} target="_blank" rel="noopener noreferrer">
            Author
          </a>
          <a href={FEEDBACK_URL} target="_blank" rel="noopener noreferrer">
            Feedback
          </a>
          <Button variant="secondary" onClick={handleOpenAbout}>
            About This App
          </Button>
        </div>
      </header>
      {!onOpenAbout && <AboutPage open={isAboutOpen} onClose={() => setIsAboutOpen(false)} />}
    </>
  );
}
