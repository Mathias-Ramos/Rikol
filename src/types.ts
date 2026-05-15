export type Grade = "again" | "hard" | "good" | "easy";

export type ReviewPhase = "new" | "learning" | "review" | "relearning";

export type AnswerMode = "reveal" | "type";

export interface Deck {
  id: string;
  name: string;
  description: string;
  color: string;
  tags: string[];
  dailyNewLimit: number;
  dailyReviewLimit: number;
  createdAt: string;
  updatedAt: string;
}

export interface CardSource {
  type: "anki" | "csv" | "demo" | "manual";
  externalId?: string;
  fileName?: string;
}

export interface Card {
  id: string;
  deckId: string;
  recto: string;
  verso: string;
  details: string;
  tags: string[];
  suspended: boolean;
  forceTypedAnswer: boolean;
  source?: CardSource;
  createdAt: string;
  updatedAt: string;
}

export interface ReviewState {
  cardId: string;
  due: string;
  stability: number;
  difficulty: number;
  elapsedDays: number;
  scheduledDays: number;
  reps: number;
  lapses: number;
  phase: ReviewPhase;
  answerMode: AnswerMode;
  lastReview?: string;
}

export interface ReviewLog {
  id: string;
  cardId: string;
  deckId: string;
  grade: Grade;
  reviewedAt: string;
  previousDue: string;
  nextDue: string;
  previousPhase: ReviewPhase;
  nextPhase: ReviewPhase;
  xp: number;
}

export interface MediaAsset {
  id: string;
  name: string;
  mime: string;
  dataUrl: string;
  createdAt: string;
}

export interface Badge {
  id: string;
  label: string;
  earnedAt: string;
}

export interface UserSettings {
  onboarded: boolean;
  seededDemo: boolean;
  userName?: string;
  theme: "light";
  xp: number;
  level: number;
  streak: {
    current: number;
    longest: number;
    lastStudyDate?: string;
  };
  badges: Badge[];
  lastBackupAt?: string;
}

export interface ImportWarning {
  level: "info" | "warning" | "error";
  message: string;
}

export interface ImportReport {
  id: string;
  source: "json" | "csv" | "apkg";
  fileName: string;
  createdAt: string;
  deckCount: number;
  cardCount: number;
  mediaCount: number;
  duplicateCount: number;
  skippedCount: number;
  warnings: ImportWarning[];
  sampleCards: Array<{ recto: string; verso: string }>;
}

export interface AppData {
  decks: Deck[];
  cards: Card[];
  reviewStates: ReviewState[];
  reviewLogs: ReviewLog[];
  media: MediaAsset[];
  settings: UserSettings;
  importReports: ImportReport[];
}

export interface ImportBundle {
  decks: Deck[];
  cards: Card[];
  media: MediaAsset[];
  report: ImportReport;
}
