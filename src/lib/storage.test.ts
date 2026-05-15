import { describe, expect, it } from "vitest";
import { migrateAppData } from "./storage";

describe("storage migration", () => {
  it("migrates legacy template cards into simple cards", () => {
    const migrated = migrateAppData({
      cards: [
        {
          id: "card_1",
          deckId: "deck_1",
          templateId: "code",
          fields: {
            question: "What does this return?",
            language: "TypeScript",
            snippet: "const total = 1 + 2;",
            answer: "3"
          },
          tags: [],
          suspended: false,
          createdAt: "2026-05-13T00:00:00.000Z",
          updatedAt: "2026-05-13T00:00:00.000Z"
        }
      ]
    } as never);

    expect(migrated.cards[0]).toMatchObject({
      recto: "What does this return?\n\nconst total = 1 + 2;",
      verso: "3",
      details: "Language: TypeScript"
    });
  });

  it("uses custom template field order and labels for details", () => {
    const migrated = migrateAppData({
      templates: [
        {
          id: "custom",
          fields: [
            { key: "term", label: "Term" },
            { key: "answer", label: "Answer" },
            { key: "source", label: "Source" }
          ]
        }
      ],
      cards: [
        {
          id: "card_1",
          deckId: "deck_1",
          templateId: "custom",
          fields: {
            term: "Rikol",
            answer: "Local-first flashcards",
            source: "Project notes"
          },
          tags: [],
          suspended: false,
          createdAt: "2026-05-13T00:00:00.000Z",
          updatedAt: "2026-05-13T00:00:00.000Z"
        }
      ]
    } as never);

    expect(migrated.cards[0]).toMatchObject({
      recto: "Rikol",
      verso: "Local-first flashcards",
      details: "Source: Project notes"
    });
  });

  it("defaults old review states to reveal mode", () => {
    const migrated = migrateAppData({
      reviewStates: [
        {
          cardId: "card_1",
          due: "2026-05-13T00:00:00.000Z",
          stability: 0.5,
          difficulty: 5,
          elapsedDays: 0,
          scheduledDays: 0,
          reps: 0,
          lapses: 0,
          phase: "new"
        }
      ]
    } as never);

    expect(migrated.reviewStates[0].answerMode).toBe("reveal");
  });

  it("defaults old cards to automatic answer mode and keeps forced typed cards", () => {
    const migrated = migrateAppData({
      cards: [
        {
          id: "card_1",
          deckId: "deck_1",
          recto: "Short prompt",
          verso: "Short answer",
          details: ""
        },
        {
          id: "card_2",
          deckId: "deck_1",
          recto: "Long prompt",
          verso: "Long answer",
          details: "",
          forceTypedAnswer: true
        }
      ]
    } as never);

    expect(migrated.cards[0].forceTypedAnswer).toBe(false);
    expect(migrated.cards[1].forceTypedAnswer).toBe(true);
  });
});
