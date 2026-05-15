import { describe, expect, it } from "vitest";
import type { Card } from "../types";
import { getPlainCard, renderCard } from "./renderCard";

describe("simple card rendering", () => {
  it("renders recto, verso, and smaller answer details", () => {
    const card = createCard({
      recto: "What is active recall?",
      verso: "Retrieving before seeing answer.",
      details: "Useful for memory consolidation."
    });
    const rendered = renderCard(card, []);

    expect(rendered.recto).toContain("What is active recall?");
    expect(rendered.answer).toContain("Retrieving before seeing answer.");
    expect(rendered.answer).toContain("answer-detail card-details");
    expect(rendered.answer).toContain("Useful for memory consolidation.");
    expect(getPlainCard(card)).toEqual({
      recto: "What is active recall?",
      verso: "Retrieving before seeing answer.",
      details: "Useful for memory consolidation."
    });
  });

  it("sanitizes unsafe imported html", () => {
    const rendered = renderCard(
      createCard({
        recto: '<img src="javascript:alert(1)" onerror="alert(1)" />Prompt',
        verso: '<script>alert(1)</script><strong>Safe</strong>',
        details: '<span onclick="alert(1)">Detail</span>'
      }),
      []
    );

    expect(rendered.recto).not.toContain("javascript:");
    expect(rendered.answer).not.toContain("<script>");
    expect(rendered.answer).not.toContain("onclick");
    expect(rendered.answer).toContain("<strong>Safe</strong>");
  });

  it("renders rich text in recto, verso, and details", () => {
    const rendered = renderCard(
      createCard({
        recto: "<strong>Prompt</strong>",
        verso: "<em>Answer</em>",
        details: "<code>const value = 1;</code>"
      }),
      []
    );

    expect(rendered.recto).toContain("<strong>Prompt</strong>");
    expect(rendered.answer).toContain("<em>Answer</em>");
    expect(rendered.answer).toContain("<code>const value = 1;</code>");
  });
});

function createCard(overrides: Pick<Card, "recto" | "verso" | "details">): Card {
  return {
    id: "card-test",
    deckId: "deck-test",
    ...overrides,
    tags: [],
    suspended: false,
    forceTypedAnswer: false,
    createdAt: "2026-05-13T00:00:00.000Z",
    updatedAt: "2026-05-13T00:00:00.000Z"
  };
}
