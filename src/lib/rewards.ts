import type { Badge, Grade, ReviewLog, UserSettings } from "../types";
import { sameLocalDay, startOfLocalDay, uid, yesterdayOf } from "./utils";
import { GRADE_XP } from "./scheduler";

export interface BadgeTarget {
  id: string;
  label: string;
  description: string;
}

export interface BadgeDefinition extends BadgeTarget {
  test: (logs: ReviewLog[], settings: UserSettings) => boolean;
}

export const BADGE_DEFINITIONS: BadgeDefinition[] = [
  {
    id: "first_review",
    label: "First spark",
    description: "Review first card.",
    test: (logs: ReviewLog[]) => logs.length >= 1
  },
  {
    id: "review_25",
    label: "25 reviews",
    description: "Complete 25 reviews.",
    test: (logs: ReviewLog[]) => logs.length >= 25
  },
  {
    id: "review_100",
    label: "100 reviews",
    description: "Complete 100 reviews.",
    test: (logs: ReviewLog[]) => logs.length >= 100
  },
  {
    id: "streak_3",
    label: "3-day streak",
    description: "Study 3 days in row.",
    test: (_: ReviewLog[], settings: UserSettings) => settings.streak.current >= 3
  },
  {
    id: "streak_7",
    label: "7-day streak",
    description: "Study 7 days in row.",
    test: (_: ReviewLog[], settings: UserSettings) => settings.streak.current >= 7
  }
];

export const MANUAL_BADGE_DEFINITIONS: BadgeTarget[] = [
  { id: "demo_loaded", label: "Demo loaded", description: "Load demo decks." },
  { id: "deck_maker", label: "Deck maker", description: "Create first deck." },
  { id: "card_creator", label: "Card creator", description: "Create first card." },
  { id: "importer", label: "Importer", description: "Import deck or backup." }
];

export const BADGE_TARGETS: BadgeTarget[] = [...MANUAL_BADGE_DEFINITIONS, ...BADGE_DEFINITIONS];

export function levelFromXp(xp: number) {
  return Math.floor(Math.sqrt(xp / 80)) + 1;
}

export function xpForLevel(level: number) {
  const normalizedLevel = Math.max(1, Math.floor(level));
  return (normalizedLevel - 1) ** 2 * 80;
}

export function getLevelProgress(xp: number) {
  const safeXp = Math.max(0, xp);
  const level = levelFromXp(safeXp);
  const nextLevel = level + 1;
  const currentLevelXp = xpForLevel(level);
  const nextLevelXp = xpForLevel(nextLevel);
  const xpIntoLevel = safeXp - currentLevelXp;
  const xpForNextLevel = nextLevelXp - currentLevelXp;
  const progressPercent = Math.min(100, Math.max(0, (xpIntoLevel / xpForNextLevel) * 100));

  return {
    level,
    nextLevel,
    currentLevelXp,
    nextLevelXp,
    xpIntoLevel,
    xpForNextLevel,
    xpToNextLevel: nextLevelXp - safeXp,
    progressPercent
  };
}

export function applyReviewReward(
  settings: UserSettings,
  logs: ReviewLog[],
  grade: Grade,
  reviewedAt = new Date()
) {
  const xp = settings.xp + GRADE_XP[grade];
  const lastStudyDate = settings.streak.lastStudyDate
    ? startOfLocalDay(new Date(settings.streak.lastStudyDate))
    : undefined;
  const today = startOfLocalDay(reviewedAt);
  const yesterday = yesterdayOf(reviewedAt);

  let current = settings.streak.current;
  if (!lastStudyDate) {
    current = 1;
  } else if (sameLocalDay(lastStudyDate, today)) {
    current = settings.streak.current;
  } else if (sameLocalDay(lastStudyDate, yesterday)) {
    current = settings.streak.current + 1;
  } else {
    current = 1;
  }

  const updated: UserSettings = {
    ...settings,
    xp,
    level: levelFromXp(xp),
    streak: {
      current,
      longest: Math.max(settings.streak.longest, current),
      lastStudyDate: today.toISOString()
    }
  };

  updated.badges = unlockBadges(updated, logs);
  return updated;
}

export function unlockBadges(settings: UserSettings, logs: ReviewLog[]) {
  const owned = new Set(settings.badges.map((badge) => badge.id));
  const earned: Badge[] = [...settings.badges];

  for (const badge of BADGE_DEFINITIONS) {
    if (!owned.has(badge.id) && badge.test(logs, settings)) {
      earned.push({ id: badge.id, label: badge.label, earnedAt: new Date().toISOString() });
    }
  }

  return earned;
}

export function manualBadge(label: string): Badge {
  const target = MANUAL_BADGE_DEFINITIONS.find((badge) => badge.label === label);

  return {
    id: target?.id ?? uid("badge"),
    label,
    earnedAt: new Date().toISOString()
  };
}
