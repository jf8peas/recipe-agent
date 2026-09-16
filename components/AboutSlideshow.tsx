"use client";

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import {
  AUTHOR_BIO,
  AUTHOR_LINKEDIN_URL,
  DIRECTORY_TREE,
  EXECUTION_DEEP_DIVE,
  EXECUTION_STAGES,
  PERSISTENCE_EXPLANATION,
  TECH_STACK_ITEMS,
} from "@/lib/about-content";

export interface AboutSlideshowProps {
  open: boolean;
  onClose: () => void;
}

interface Slide {
  title: string;
  render: () => ReactNode;
}

const SLIDES: Slide[] = [
  { title: "Author Profile", render: () => <AuthorSlide /> },
  { title: "High-Level Architecture & Tech Stack", render: () => <TechStackSlide /> },
  { title: "Database & State Persistence", render: () => <PersistenceSlide /> },
  { title: "Repository Structure", render: () => <DirectoryTreeSlide /> },
  { title: "End-to-End Execution Flow", render: () => <ExecutionFlowSlide /> },
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
 * Full-page "About This App" overlay (spec 002). No slide position or open
 * state is remembered across visits (FR-005) — `AppHeader` owns `open`, this
 * component owns only which slide is showing while it's open.
 */
export function AboutSlideshow({ open, onClose }: AboutSlideshowProps) {
  const [slideIndex, setSlideIndex] = useState(0);
  const overlayRef = useRef<HTMLDivElement>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (open) {
      setSlideIndex(0);
      previouslyFocused.current = document.activeElement as HTMLElement | null;
    } else if (previouslyFocused.current) {
      previouslyFocused.current.focus();
      previouslyFocused.current = null;
    }
  }, [open]);

  // Re-focus the slide content region itself (not a link/button inside it)
  // on open and on every slide change — a slide's own focusable content
  // (e.g. Slide 1's LinkedIn link) unmounts when the slide changes, and if
  // that element had focus, focus would otherwise fall out of the overlay
  // entirely (typically to <body>), silently breaking further keyboard
  // navigation and the Tab trap below. Matches the WAI-ARIA APG tabpanel
  // pattern: the panel itself is the stable, always-present focus target.
  useEffect(() => {
    if (open) {
      sectionRef.current?.focus();
    }
  }, [open, slideIndex]);

  if (!open) return null;

  const isFirst = slideIndex === 0;
  const isLast = slideIndex === SLIDES.length - 1;
  const currentSlide = SLIDES[slideIndex]!;
  const slidePosition = `Slide ${slideIndex + 1} of ${SLIDES.length}: ${currentSlide.title}`;

  function goNext() {
    setSlideIndex((i) => Math.min(i + 1, SLIDES.length - 1));
  }

  function goPrev() {
    setSlideIndex((i) => Math.max(i - 1, 0));
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      goNext();
      return;
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      goPrev();
      return;
    }
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
      <div aria-live="polite" style={visuallyHiddenStyle}>
        {slidePosition}
      </div>

      <section
        ref={sectionRef}
        tabIndex={-1}
        aria-roledescription="slide"
        aria-label={slidePosition}
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "var(--space-6)",
          maxWidth: "720px",
          width: "100%",
          margin: "0 auto",
          boxSizing: "border-box",
        }}
      >
        <h2 style={{ fontSize: "var(--text-xl)", marginTop: 0 }}>{currentSlide.title}</h2>
        {currentSlide.render()}
      </section>

      <nav
        aria-label="Slideshow controls"
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "space-between",
          gap: "var(--space-3)",
          rowGap: "var(--space-2)",
          padding: "var(--space-4)",
          borderTop: "1px solid var(--color-border)",
          background: "var(--color-surface)",
        }}
      >
        <button
          type="button"
          onClick={goPrev}
          disabled={isFirst}
          style={controlButtonStyle(isFirst)}
        >
          Previous
        </button>
        <button type="button" onClick={goNext} disabled={isLast} style={controlButtonStyle(isLast)}>
          Next
        </button>
        <button
          type="button"
          onClick={onClose}
          style={{
            ...controlButtonStyle(false),
            background: "var(--color-accent)",
            color: "var(--color-accent-contrast)",
            borderColor: "var(--color-accent)",
          }}
        >
          Return to App
        </button>
      </nav>
    </div>
  );
}

function controlButtonStyle(disabled: boolean): CSSProperties {
  return {
    minHeight: 44,
    minWidth: 44,
    padding: "var(--space-2) var(--space-4)",
    font: "inherit",
    fontSize: "var(--text-base)",
    borderRadius: "var(--radius-md)",
    border: "1px solid var(--color-border)",
    background: "var(--color-surface)",
    color: "var(--color-text)",
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.5 : 1,
  };
}

function AuthorSlide() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
      <p>{AUTHOR_BIO}</p>
      <a href={AUTHOR_LINKEDIN_URL} target="_blank" rel="noopener noreferrer">
        View LinkedIn profile
      </a>
    </div>
  );
}

function TechStackSlide() {
  return (
    <ul
      style={{
        paddingLeft: "var(--space-5)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-3)",
        margin: 0,
      }}
    >
      {TECH_STACK_ITEMS.map((item) => (
        <li key={item.name}>
          <strong>{item.name}</strong> — {item.blurb}
        </li>
      ))}
    </ul>
  );
}

function PersistenceSlide() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
      <p style={{ marginTop: 0 }}>{PERSISTENCE_EXPLANATION.summary}</p>
      {PERSISTENCE_EXPLANATION.deepDive.map((paragraph) => (
        <p key={paragraph.slice(0, 24)} style={{ color: "var(--color-text-muted)", margin: 0 }}>
          {paragraph}
        </p>
      ))}
    </div>
  );
}

function DirectoryTreeSlide() {
  return (
    <div
      data-testid="directory-tree-scroll"
      role="group"
      aria-label="Repository directory tree (scrollable)"
      tabIndex={0}
      style={{ overflowX: "auto" }}
    >
      <div
        style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-sm)", whiteSpace: "nowrap" }}
      >
        {DIRECTORY_TREE.map((entry) => (
          <div key={entry.path} style={{ padding: "var(--space-2) 0" }}>
            <span style={{ color: "var(--color-accent)" }}>{entry.path}</span>
            {"  —  "}
            <span style={{ color: "var(--color-text-muted)" }}>{entry.note}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ExecutionFlowSlide() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
      <div
        data-testid="execution-flow-scroll"
        role="group"
        aria-label="Execution flow diagram (scrollable)"
        tabIndex={0}
        style={{ overflowX: "auto" }}
      >
        <div
          style={{
            display: "flex",
            gap: "var(--space-3)",
            whiteSpace: "nowrap",
            paddingBottom: "var(--space-2)",
          }}
        >
          {EXECUTION_STAGES.map((stage, i) => (
            <div
              key={stage.name}
              style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}
            >
              <div
                style={{
                  border: "1px solid var(--color-border)",
                  borderRadius: "var(--radius-md)",
                  padding: "var(--space-3)",
                  minWidth: "160px",
                  whiteSpace: "normal",
                }}
              >
                <strong>{stage.name}</strong>
                <p
                  style={{
                    margin: "var(--space-2) 0 0",
                    fontSize: "var(--text-sm)",
                    color: "var(--color-text-muted)",
                  }}
                >
                  {stage.description}
                </p>
              </div>
              {i < EXECUTION_STAGES.length - 1 && <span aria-hidden="true">→</span>}
            </div>
          ))}
        </div>
      </div>
      {EXECUTION_DEEP_DIVE.map((paragraph) => (
        <p key={paragraph.slice(0, 24)} style={{ color: "var(--color-text-muted)", margin: 0 }}>
          {paragraph}
        </p>
      ))}
    </div>
  );
}
