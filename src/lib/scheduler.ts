import type { Card, Deck, Grade, ReviewLog, ReviewPhase, ReviewState } from "../types";
import { addDays, addMinutes, clamp, nowIso, sameLocalDay, startOfLocalDay, uid } from "./utils";

const GRADE_WEIGHT: Record<Grade, number> = {
  again: 1,
  hard: 2,
  good: 3,
  easy: 4
};

export const GRADE_XP: Record<Grade, number> = {
  again: 1,
  hard: 2,
  good: 3,
  easy: 4
};

export function createInitialReviewState(cardId: string, createdAt = nowIso()): ReviewState {
  return {
    cardId,
    due: createdAt,
    stability: 0.5,
    difficulty: 5,
    elapsedDays: 0,
    scheduledDays: 0,
    reps: 0,
    lapses: 0,
    phase: "new",
    answerMode: "reveal"
  };
}

export function scheduleReview(
  state: ReviewState,
  grade: Grade,
  reviewedAt = new Date()
): ReviewState {
  const previousReview = state.lastReview ? new Date(state.lastReview) : new Date(state.due);
  const elapsedDays = Math.max(
    0,
    Math.floor((startOfLocalDay(reviewedAt).getTime() - startOfLocalDay(previousReview).getTime()) / 86400000)
  );
  const rating = GRADE_WEIGHT[grade];
  const wasNew = state.phase === "new" || state.reps === 0;
  let nextPhase: ReviewPhase = "review";
  let nextDue = reviewedAt;
  let stability = state.stability;
  let difficulty = state.difficulty;
  let scheduledDays = 0;
  let lapses = state.lapses;

  if (wasNew) {
    if (grade === "again") {
      nextPhase = "learning";
      nextDue = addMinutes(reviewedAt, 5);
      scheduledDays = 0;
      difficulty = clamp(difficulty + 0.6, 1, 10);
    } else if (grade === "hard") {
      nextPhase = "learning";
      nextDue = addMinutes(reviewedAt, 10);
      scheduledDays = 0;
      stability = 0.8;
      difficulty = clamp(difficulty + 0.3, 1, 10);
    } else if (grade === "good") {
      scheduledDays = 1;
      nextDue = addDays(reviewedAt, scheduledDays);
      stability = 1.2;
      difficulty = clamp(difficulty - 0.1, 1, 10);
    } else {
      scheduledDays = 4;
      nextDue = addDays(reviewedAt, scheduledDays);
      stability = 3.2;
      difficulty = clamp(difficulty - 0.4, 1, 10);
    }
  } else if (grade === "again") {
    nextPhase = "relearning";
    nextDue = addMinutes(reviewedAt, 10);
    scheduledDays = 0;
    stability = Math.max(0.4, stability * 0.45);
    difficulty = clamp(difficulty + 0.8, 1, 10);
    lapses += 1;
  } else {
    const recallBonus = 0.7 + rating * 0.42;
    const difficultyDrag = 1 + (5 - difficulty) * 0.05;
    stability = clamp(stability * recallBonus * difficultyDrag + elapsedDays * 0.08, 0.6, 36500);
    difficulty = clamp(difficulty + (grade === "hard" ? 0.25 : grade === "easy" ? -0.35 : -0.08), 1, 10);
    scheduledDays =
      grade === "hard"
        ? Math.max(1, Math.round(stability * 0.85))
        : grade === "good"
          ? Math.max(1, Math.round(stability * 1.6))
          : Math.max(2, Math.round(stability * 2.5));
    nextDue = addDays(reviewedAt, scheduledDays);
  }

  return {
    ...state,
    due: nextDue.toISOString(),
    stability,
    difficulty,
    elapsedDays,
    scheduledDays,
    reps: state.reps + 1,
    lapses,
    phase: nextPhase,
    answerMode: state.answerMode === "type" ? "reveal" : "type",
    lastReview: reviewedAt.toISOString()
  };
}

export function createReviewLog(
  card: Card,
  previous: ReviewState,
  next: ReviewState,
  grade: Grade,
  reviewedAt = new Date()
): ReviewLog {
  return {
    id: uid("log"),
    cardId: card.id,
    deckId: card.deckId,
    grade,
    reviewedAt: reviewedAt.toISOString(),
    previousDue: previous.due,
    nextDue: next.due,
    previousPhase: previous.phase,
    nextPhase: next.phase,
    xp: GRADE_XP[grade]
  };
}

export function getDueCards(
  cards: Card[],
  reviewStates: ReviewState[],
  decks: Deck[],
  date = new Date()
) {
  const stateMap = new Map(reviewStates.map((state) => [state.cardId, state]));
  const deckMap = new Map(decks.map((deck) => [deck.id, deck]));
  const dueByDeck = new Map<string, { newCount: number; reviewCount: number }>();

  return cards
    .filter((card) => !card.suspended)
    .filter((card) => {
      const deck = deckMap.get(card.deckId);
      if (!deck) {
        return false;
      }

      const state = stateMap.get(card.id) ?? createInitialReviewState(card.id, card.createdAt);
      if (new Date(state.due).getTime() > date.getTime()) {
        return false;
      }

      const counts = dueByDeck.get(card.deckId) ?? { newCount: 0, reviewCount: 0 };
      const isNew = state.phase === "new" || state.reps === 0;
      if (isNew && counts.newCount >= deck.dailyNewLimit) {
        return false;
      }
      if (!isNew && counts.reviewCount >= deck.dailyReviewLimit) {
        return false;
      }

      if (isNew) {
        counts.newCount += 1;
      } else {
        counts.reviewCount += 1;
      }
      dueByDeck.set(card.deckId, counts);
      return true;
    })
    .sort((a, b) => {
      const aState = stateMap.get(a.id) ?? createInitialReviewState(a.id, a.createdAt);
      const bState = stateMap.get(b.id) ?? createInitialReviewState(b.id, b.createdAt);
      return new Date(aState.due).getTime() - new Date(bState.due).getTime();
    });
}

export function countReviewsToday(logs: ReviewLog[], date = new Date()) {
  return logs.filter((log) => sameLocalDay(new Date(log.reviewedAt), date)).length;
}
