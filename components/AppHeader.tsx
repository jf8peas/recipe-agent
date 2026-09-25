"use client";

import { useState, type CSSProperties } from "react";
import { usePauseBetweenStages } from "@/hooks/usePauseBetweenStages";
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
  /** When provided, the caller owns the About page (and renders it itself);
   * `sectionId` is the section to land on, or null for the top. */
  onOpenAbout?: (sectionId: string | null) => void;
  /** Makes the mark + "Recipe Agent" title in the top left act as a home
   * link, taking the user back to the session list from wherever they are
   * (a running session, mid-edit, the entry form). Omitted in "about" mode's
   * own instance, which already has its own "Return to App" button. */
  onLogoClick?: () => void;
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

/** Shared header-link look — muted, no underline — matching the "about"
 * mode's own topic-nav links; the app mode's Author/Feedback links now use
 * this too instead of the browser's default blue-underlined `<a>` style. */
const utilityLinkStyle: CSSProperties = {
  color: "var(--color-text-muted)",
  textDecoration: "none",
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
  onLogoClick,
  onReturn,
}: AppHeaderProps) {
  const [selfPause, setSelfPause] = usePauseBetweenStages();
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  // Which About-page section to land on when it opens — null defaults to
  // the top (the "About This App" button); "Author" jumps straight to
  // "Who built this" instead of linking out to LinkedIn directly.
  const [aboutInitialSection, setAboutInitialSection] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");

  const pauseBetweenStages = pauseProp ?? selfPause;
  const handleTogglePause = onTogglePause ?? setSelfPause;

  function openAboutAt(sectionId: string | null) {
    if (onOpenAbout) {
      onOpenAbout(sectionId);
      return;
    }
    setAboutInitialSection(sectionId);
    setIsAboutOpen(true);
  }

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
        <div style={titleGroupStyle}>
          <span aria-hidden="true" style={markStyle}>
            RA
          </span>
          <strong style={{ fontSize: "var(--text-lg)" }}>Recipe Agent — how it works</strong>
        </div>
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
                style={utilityLinkStyle}
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
        {onLogoClick ? (
          <button
            type="button"
            onClick={onLogoClick}
            aria-label="Recipe Agent home"
            style={{ ...titleGroupStyle, font: "inherit", background: "none", border: "none", padding: 0, cursor: "pointer" }}
          >
            <span aria-hidden="true" style={markStyle}>
              RA
            </span>
            <strong style={{ fontSize: "var(--text-lg)" }}>Recipe Agent</strong>
          </button>
        ) : (
          <div style={titleGroupStyle}>
            <span aria-hidden="true" style={markStyle}>
              RA
            </span>
            <strong style={{ fontSize: "var(--text-lg)" }}>Recipe Agent</strong>
          </div>
        )}

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

          <button
            type="button"
            onClick={() => openAboutAt("author")}
            style={{ ...utilityLinkStyle, font: "inherit", background: "none", border: "none", padding: 0, cursor: "pointer" }}
          >
            Author
          </button>
          <a href={FEEDBACK_URL} target="_blank" rel="noopener noreferrer" style={utilityLinkStyle}>
            Feedback
          </a>
          <Button variant="secondary" onClick={() => openAboutAt(null)}>
            About This App
          </Button>
        </div>
      </header>
      {!onOpenAbout && (
        <AboutPage open={isAboutOpen} onClose={() => setIsAboutOpen(false)} initialFocusId={aboutInitialSection} />
      )}
    </>
  );
}
