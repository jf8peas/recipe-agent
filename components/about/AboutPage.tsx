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
}

const FOCUSABLE_SELECTOR = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Full-page "About This App" reference page (spec 004) — a single scrolling
 * document replacing spec 002's slideshow (FR-001). The overlay shell
 * (dialog semantics, focus-restore, Tab trap) is carried over from
 * `AboutSlideshow.tsx` unchanged (research R7); slide pagination is dropped
 * entirely in favor of a sticky topic nav + continuous scroll.
 */
export function AboutPage({ open, onClose }: AboutPageProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (open) {
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
      `}</style>
    </div>
  );
}
