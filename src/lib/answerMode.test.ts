import { describe, expect, it } from "vitest";
import type { Card } from "../types";
import { getEffectiveAnswerMode } from "./answerMode";

describe("effective answer mode", () => {
  it("uses stored mode for short answers", () => {
    expect(getEffectiveAnswerMode(card({ verso: "Paris" }), "type")).toBe("type");
    expect(getEffectiveAnswerMode(card({ verso: "Paris" }), "reveal")).toBe("reveal");
  });

  it("uses reveal mode when visible verso is longer than fifty characters", () => {
    const longVerso = "<strong>This answer has more than fifty visible characters to avoid typing fatigue.</strong>";

    expect(getEffectiveAnswerMode(card({ verso: longVerso }), "type")).toBe("reveal");
  });

  it("lets forced cards require typing even with long answers", () => {
    const longVerso = "This answer has more than fifty visible characters to avoid typing fatigue.";

    expect(getEffectiveAnswerMode(card({ verso: longVerso, forceTypedAnswer: true }), "reveal")).toBe("type");
  });
});

function card(overrides: { verso: string; forceTypedAnswer?: boolean }): Card {
  return {
    id: "card_1",
    deckId: "deck_1",
    recto: "Question",
    verso: overrides.verso,
    details: "",
    tags: [],
    suspended: false,
    forceTypedAnswer: overrides.forceTypedAnswer ?? false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z"
  };
}
