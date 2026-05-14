import { describe, expect, it } from "vitest";
import type { UserSettings } from "../types";
import { applyReviewReward, getLevelProgress, manualBadge } from "./rewards";

const settings: UserSettings = {
  onboarded: true,
  seededDemo: false,
  theme: "light",
  xp: 0,
  level: 1,
  streak: { current: 0, longest: 0 },
  badges: []
};

describe("rewards", () => {
  it("adds xp and starts streak", () => {
    const updated = applyReviewReward(settings, [], "easy", new Date("2026-01-01T10:00:00.000Z"));

    expect(updated.xp).toBe(4);
    expect(updated.streak.current).toBe(1);
    expect(updated.badges.some((badge) => badge.id === "first_review")).toBe(false);
  });

  it("calculates progress inside current level", () => {
    expect(getLevelProgress(200)).toMatchObject({
      level: 2,
      nextLevel: 3,
      currentLevelXp: 80,
      nextLevelXp: 320,
      xpIntoLevel: 120,
      xpForNextLevel: 240,
      xpToNextLevel: 120,
      progressPercent: 50
    });
  });

  it("uses stable ids for known manual badges", () => {
    expect(manualBadge("Deck maker")).toMatchObject({
      id: "deck_maker",
      label: "Deck maker"
    });
  });
});
