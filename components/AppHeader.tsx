"use client";

import { useState } from "react";
import { usePauseBetweenStages } from "@/hooks/usePauseBetweenStages";
import { AUTHOR_LINKEDIN_URL } from "@/lib/about-content";
import { AboutSlideshow } from "@/components/AboutSlideshow";

const FEEDBACK_URL = "https://github.com/jf8peas/recipe-agent/issues";

/**
 * Persistent header on every screen (spec FR-046–FR-049): title, author +
 * feedback links (new tab, never disturb the current session), the
 * Step vs Auto-run toggle (FR-034/FR-036), and the "About This App"
 * slideshow trigger (spec 002, FR-001). `AboutSlideshow` is a sibling of
 * `{children}` in the root layout, so opening it never unmounts or
 * otherwise touches whatever session view is currently showing (FR-002/FR-004).
 */
export function AppHeader() {
  const [pauseBetweenStages, setPauseBetweenStages] = usePauseBetweenStages();
  const [isAboutOpen, setIsAboutOpen] = useState(false);

  return (
    <>
      <header
        style={{
          minHeight: "var(--header-height)",
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "var(--space-2)",
          padding: "var(--space-2) var(--space-4)",
          borderBottom: "1px solid var(--color-border)",
          background: "var(--color-surface)",
        }}
      >
        <strong style={{ fontSize: "var(--text-lg)" }}>Recipe Agent</strong>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: "var(--space-4)",
            rowGap: "var(--space-2)",
          }}
        >
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--space-2)",
              fontSize: "var(--text-sm)",
            }}
          >
            <input
              type="checkbox"
              checked={pauseBetweenStages}
              onChange={(e) => setPauseBetweenStages(e.target.checked)}
              aria-describedby="pause-between-stages-hint"
            />
            Pause between stages
          </label>
          <span id="pause-between-stages-hint" hidden>
            When off, the assistant advances through stages automatically (Auto-run).
          </span>

          <a href={AUTHOR_LINKEDIN_URL} target="_blank" rel="noopener noreferrer">
            Author
          </a>
          <a href={FEEDBACK_URL} target="_blank" rel="noopener noreferrer">
            Feedback
          </a>
          <button
            type="button"
            onClick={() => setIsAboutOpen(true)}
            style={{
              font: "inherit",
              fontSize: "var(--text-sm)",
              color: "var(--color-text)",
              background: "none",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-md)",
              padding: "var(--space-1) var(--space-3)",
              cursor: "pointer",
            }}
          >
            About This App
          </button>
        </div>
      </header>
      <AboutSlideshow open={isAboutOpen} onClose={() => setIsAboutOpen(false)} />
    </>
  );
}
