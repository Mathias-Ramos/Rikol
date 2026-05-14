import { describe, expect, it } from "vitest";
import type { Card, Deck, Grade } from "../types";
import { createInitialReviewState, createReviewLog, getDueCards, scheduleReview } from "./scheduler";

describe("scheduler", () => {
  it("moves new card to review after good grade", () => {
    const state = createInitialReviewState("card_1", "2026-01-01T00:00:00.000Z");
    const next = scheduleReview(state, "good", new Date("2026-01-01T10:00:00.000Z"));

    expect(next.phase).toBe("review");
    expect(next.reps).toBe(1);
    expect(next.scheduledDays).toBe(1);
    expect(next.answerMode).toBe("type");
  });

  it("toggles answer mode after every review", () => {
    const state = { ...createInitialReviewState("card_1"), answerMode: "type" as const };
    const next = scheduleReview(state, "again", new Date("2026-01-01T10:00:00.000Z"));

    expect(next.answerMode).toBe("reveal");
  });

  it("logs xp values for each grade", () => {
    const card: Card = {
      id: "card_1",
      deckId: "deck_1",
      recto: "Q",
      verso: "A",
      details: "",
      tags: [],
      suspended: false,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z"
    };
    const state = createInitialReviewState(card.id, card.createdAt);
    const reviewedAt = new Date("2026-01-01T10:00:00.000Z");
    const expectedXp: Record<Grade, number> = {
      again: 1,
      hard: 2,
      good: 3,
      easy: 4
    };

    for (const grade of Object.keys(expectedXp) as Grade[]) {
      const next = scheduleReview(state, grade, reviewedAt);
      const log = createReviewLog(card, state, next, grade, reviewedAt);

      expect(log.xp).toBe(expectedXp[grade]);
    }
  });

  it("applies deck new limits", () => {
    const deck: Deck = {
      id: "deck_1",
      name: "Deck",
      description: "",
      color: "#fff",
      tags: [],
      dailyNewLimit: 1,
      dailyReviewLimit: 100,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z"
    };
    const cards: Card[] = [0, 1].map((index) => ({
      id: `card_${index}`,
      deckId: deck.id,
      recto: "Q",
      verso: "A",
      details: "",
      tags: [],
      suspended: false,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z"
    }));

    expect(getDueCards(cards, [], [deck], new Date("2026-01-01T01:00:00.000Z"))).toHaveLength(1);
  });
});
