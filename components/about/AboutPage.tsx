"use client";

import { useEffect, useRef, type KeyboardEvent } from "react";
import { AppHeader } from "@/components/AppHeader";
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
  /** Section id to focus/scroll to on open instead of the top of the page
   * (e.g. the header's "Author" link opening straight to "Who built this")
   * — same mechanism as the in-page topic nav's own jump-to-section. */
  initialFocusId?: string | null;
}

const FOCUSABLE_SELECTOR = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Full-page "About This App" reference page (spec 004) — a single scrolling
 * document replacing spec 002's slideshow (FR-001). The overlay shell
 * (dialog semantics, focus-restore, Tab trap) is carried over from
 * `AboutSlideshow.tsx` unchanged (research R7); slide pagination is dropped
 * entirely in favor of a sticky topic nav + continuous scroll.
 */
export function AboutPage({ open, onClose, initialFocusId }: AboutPageProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (open) {
      previouslyFocused.current = document.activeElement as HTMLElement | null;
      const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (mainRef.current) {
        mainRef.current.style.scrollBehavior = prefersReducedMotion ? "auto" : "smooth";
      }
      const target = initialFocusId ? document.getElementById(initialFocusId) : null;
      (target ?? mainRef.current)?.focus();
    } else if (previouslyFocused.current) {
      previouslyFocused.current.focus();
      previouslyFocused.current = null;
    }
  }, [open, initialFocusId]);

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
      <AppHeader mode="about" onReturn={onClose} />

      <main
        ref={mainRef}
        tabIndex={-1}
        data-testid="about-page-scroll"
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
          // Thin, unobtrusive scrollbar (Firefox) and no focus ring from a
          // mouse/touch scroll (research R9) — belt-and-braces alongside
          // the global `:focus-visible` rule, since that rule's own
          // keyboard-vs-pointer heuristic isn't guaranteed identical across
          // every browser engine for this specific interaction.
          scrollbarWidth: "thin",
          scrollbarColor: "var(--color-border) transparent",
          outline: "none",
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
      <style>{`
        [data-testid="about-page-scroll"]::-webkit-scrollbar { width: var(--space-2); }
        [data-testid="about-page-scroll"]::-webkit-scrollbar-track { background: transparent; }
        [data-testid="about-page-scroll"]::-webkit-scrollbar-thumb { background: var(--color-border); border-radius: var(--radius-sm); }

        /* Below this width, a fixed-column table's own percentage widths
           leave too little room per column to hold real content (e.g. a
           17-character stage identifier) without breaking words mid-way —
           so each row becomes its own labeled block instead. */
        @media (max-width: 600px) {
          .about-responsive-table thead { display: none; }
          .about-responsive-table, .about-responsive-table tbody, .about-responsive-table tr, .about-responsive-table td {
            display: block;
            width: 100% !important;
          }
          .about-responsive-table {
            border: none;
            border-radius: 0;
          }
          .about-responsive-table tr {
            margin-bottom: var(--space-3);
            border: 1px solid var(--color-border);
            border-radius: var(--radius-md);
            overflow: hidden;
          }
          .about-responsive-table tr:last-child { margin-bottom: 0; }
          .about-responsive-table td {
            border-bottom: 1px solid var(--color-border);
            border-left: 3px solid var(--color-border);
          }
          .about-responsive-table td:last-child { border-bottom: none; }
          .about-responsive-table td::before {
            content: attr(data-label);
            display: block;
            font-size: var(--text-xs);
            font-weight: 600;
            color: var(--color-text-muted);
            text-transform: uppercase;
            letter-spacing: 0.04em;
            margin-bottom: var(--space-1);
          }
        }
      `}</style>
    </div>
  );
}
