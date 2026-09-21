"use client";

import { useState, type FormEvent } from "react";
import { TextArea } from "@/components/ui/TextArea";
import { Button } from "@/components/ui/Button";

// Mirrors the server's MAX_INGREDIENTS/MAX_INGREDIENT_LENGTH defaults
// (.env.example) for instant client-side feedback; the server is still the
// source of truth (FR-040).
const MAX_INGREDIENTS = 50;
const MAX_INGREDIENT_LENGTH = 80;

interface EntryFormProps {
  onSubmit: (ingredients: string[]) => void;
  disabled: boolean;
}

/** Ingredient entry (spec FR-039/FR-040): one ingredient per line, client-side
 * pre-flight mirroring the server's validation so the message shows instantly. */
export function EntryForm({ onSubmit, disabled }: EntryFormProps) {
  const [raw, setRaw] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const ingredients = raw
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    if (ingredients.length === 0) {
      setValidationError("Enter at least one ingredient.");
      return;
    }
    if (ingredients.length > MAX_INGREDIENTS) {
      setValidationError(`Enter at most ${MAX_INGREDIENTS} ingredients.`);
      return;
    }
    const tooLong = ingredients.find((line) => line.length > MAX_INGREDIENT_LENGTH);
    if (tooLong) {
      setValidationError(
        `Each ingredient must be at most ${MAX_INGREDIENT_LENGTH} characters — "${tooLong.slice(0, 30)}…" is too long.`,
      );
      return;
    }
    setValidationError(null);
    onSubmit(ingredients);
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
      <TextArea
        label="Ingredients (one per line)"
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        disabled={disabled}
        rows={8}
        placeholder={"2 eggs\nspinach\nfeta cheese"}
      />
      {validationError && (
        <p role="alert" style={{ color: "var(--color-danger)", fontSize: "var(--text-sm)", margin: 0 }}>
          {validationError}
        </p>
      )}
      <Button type="submit" variant="primary" disabled={disabled} style={{ alignSelf: "flex-start" }}>
        Start
      </Button>
    </form>
  );
}
