"use client";

import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import {
  AgentGraphSection,
  ApiSection,
  ArchitectureSection,
  AuthorSection,
  BranchingSection,
  ClosingSection,
  CoverSection,
  DataModelSection,
  JourneySection,
  PitchSection,
  PrinciplesSection,
  PromptsSection,
  RepoSection,
  StateSection,
  TimeTravelSection,
  UnderTheHoodDivider,
} from "@/components/about/sections";

export interface AboutPageProps {
  open: boolean;
  onClose: () => void;
}

interface NavLink {
  href: string;
  label: string;
}

/** The exact 10-entry nav list design/v002/about.html's own <nav> exposes
 * (research R5, spec.md Assumptions) — the cover, author, time-travel,
 * "under the hood" divider, prompts, and closing sections are reached by
 * scrolling only. */
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

const FOCUSABLE_SELECTOR = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

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

/**
 * Full-page "About This App" reference page (spec 004) — a single scrolling
 * document replacing spec 002's slideshow (FR-001). The overlay shell
 * (dialog semantics, focus-restore, Tab trap) is carried over from
 * `AboutSlideshow.tsx` unchanged (research R7); slide pagination is dropped
 * entirely in favor of a sticky topic nav + continuous scroll.
 */
export function AboutPage({ open, onClose }: AboutPageProps) {
  const [announcement, setAnnouncement] = useState("");
  const overlayRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (open) {
      setAnnouncement("");
      previouslyFocused.current = document.activeElement as HTMLElement | null;
      mainRef.current?.focus();
      const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (mainRef.current) {
        mainRef.current.style.scrollBehavior = prefersReducedMotion ? "auto" : "smooth";
      }
    } else if (previouslyFocused.current) {
      previouslyFocused.current.focus();
      previouslyFocused.current = null;
    }
  }, [open]);

  if (!open) return null;

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Tab") {
      const focusables = overlayRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      if (!focusables || focusables.length === 0) return;
      const list = Array.from(focusables);
      const first = list[0]!;
      const last = list[list.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  }

  function handleNavClick(link: NavLink) {
    return () => {
      const target = document.getElementById(link.href);
      target?.focus();
      setAnnouncement(`Jumped to: ${link.label}`);
    };
  }

  return (
    <div
      ref={overlayRef}
      role="dialog"
      aria-modal="true"
      aria-label="About This App"
      onKeyDown={handleKeyDown}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: "var(--z-overlay)",
        background: "var(--color-bg)",
        color: "var(--color-text)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div aria-live="polite" style={visuallyHiddenStyle}>
        {announcement}
      </div>

      <header
        style={{
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
        }}
      >
        <strong style={{ fontSize: "var(--text-lg)" }}>Recipe Agent — how it works</strong>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: "var(--space-4)",
            rowGap: "var(--space-2)",
          }}
        >
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
          <button
            type="button"
            onClick={onClose}
            style={{
              font: "inherit",
              fontSize: "var(--text-sm)",
              color: "var(--color-accent-contrast)",
              background: "var(--color-accent)",
              border: "1px solid var(--color-accent)",
              borderRadius: "var(--radius-md)",
              padding: "var(--space-1) var(--space-3)",
              cursor: "pointer",
            }}
          >
            Return to App
          </button>
        </div>
      </header>

      <main
        ref={mainRef}
        tabIndex={-1}
        style={{
          flex: 1,
          overflowY: "auto",
          // Matches app/page.tsx's own content width, so the About page
          // reads as the same app rather than a wider, separately-designed
          // document.
          maxWidth: "720px",
          width: "100%",
          margin: "0 auto",
          padding: "var(--space-8) var(--space-4)",
          boxSizing: "border-box",
        }}
      >
        <CoverSection />
        <AuthorSection />
        <PitchSection />
        <TimeTravelSection />
        <JourneySection />
        <UnderTheHoodDivider />
        <ArchitectureSection />
        <AgentGraphSection />
        <PromptsSection />
        <StateSection />
        <BranchingSection />
        <DataModelSection />
        <RepoSection />
        <ApiSection />
        <PrinciplesSection />
        <ClosingSection />
      </main>
    </div>
  );
}
