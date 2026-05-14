import type { AnswerMode, AppData, Card, ReviewState } from "../types";
import { nowIso, uid } from "./utils";

const DB_NAME = "rikol-db";
const DB_VERSION = 1;
const STORE_NAME = "app";
const APP_KEY = "state";

export const emptySettings = {
  onboarded: false,
  seededDemo: false,
  userName: "",
  theme: "light" as const,
  xp: 0,
  level: 1,
  streak: {
    current: 0,
    longest: 0
  },
  badges: []
};

export function createEmptyAppData(): AppData {
  return {
    decks: [],
    cards: [],
    reviewStates: [],
    reviewLogs: [],
    media: [],
    settings: emptySettings,
    importReports: []
  };
}

function openDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function loadAppData() {
  const db = await openDb();
  return new Promise<AppData>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(APP_KEY);

    request.onsuccess = () => {
      resolve(request.result ? migrateAppData(request.result as StoredAppData) : createEmptyAppData());
    };
    request.onerror = () => reject(request.error);
  });
}

export async function saveAppData(data: AppData) {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(data, APP_KEY);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function clearAppData() {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(APP_KEY);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export function migrateAppData(data: StoredAppData): AppData {
  const templates = new Map((data.templates ?? []).map((template) => [template.id, template]));

  return {
    decks: data.decks ?? [],
    cards: migrateCards(data.cards ?? [], templates),
    reviewStates: migrateReviewStates(data.reviewStates ?? []),
    reviewLogs: data.reviewLogs ?? [],
    media: data.media ?? [],
    settings: {
      ...emptySettings,
      ...(data.settings ?? {}),
      streak: {
        ...emptySettings.streak,
        ...(data.settings?.streak ?? {})
      },
      badges: data.settings?.badges ?? []
    },
    importReports: data.importReports ?? []
  };
}

type StoredAppData = Partial<Omit<AppData, "cards" | "reviewStates">> & {
  cards?: StoredCard[];
  reviewStates?: StoredReviewState[];
  templates?: StoredTemplate[];
};

type StoredCard = Partial<Card> & {
  id?: string;
  deckId?: string;
  templateId?: string;
  fields?: Record<string, string>;
};

type StoredReviewState = Partial<ReviewState> & {
  cardId: string;
};

interface StoredTemplate {
  id: string;
  name?: string;
  fields?: Array<{ key: string; label?: string }>;
}

function migrateCards(cards: StoredCard[], templates: Map<string, StoredTemplate>) {
  return cards.map((card) => migrateCard(card, templates.get(card.templateId ?? "")));
}

function migrateReviewStates(states: StoredReviewState[]): ReviewState[] {
  return states.map((state) => ({
    ...(state as ReviewState),
    answerMode: normalizeAnswerMode(state.answerMode)
  }));
}

function normalizeAnswerMode(mode: unknown): AnswerMode {
  return mode === "type" ? "type" : "reveal";
}

function migrateCard(card: StoredCard, template?: StoredTemplate): Card {
  if (!card.fields && (card.recto || card.verso || card.details)) {
    return simpleCard(card, card.recto ?? "", card.verso ?? "", card.details ?? "");
  }

  const fields = card.fields ?? {};

  switch (card.templateId) {
    case "classic":
    case "basic":
      return simpleCard(card, fields.front ?? "", fields.back ?? "", fields.details ?? "");
    case "concept":
      return simpleCard(card, fields.concept ?? "", fields.definition ?? "", remainingDetails(fields, ["concept", "definition"]));
    case "multipleChoice":
      return simpleCard(card, fields.question ?? "", fields.answer ?? "", labeledDetails([["Options", fields.choices]]));
    case "typeAnswer":
      return simpleCard(card, joinInline([fields.prefix, "____", fields.suffix]), fields.answer ?? "", "");
    case "code":
      return simpleCard(card, joinFields([fields.question, fields.snippet]), fields.answer ?? "", labeledDetails([["Language", fields.language]]));
    case "capital":
    case "flagCapital":
      return simpleCard(card, fields.country ?? "", fields.capital ?? "", remainingDetails(fields, ["country", "capital"]));
    case "flag":
      return simpleCard(card, imageBlock(fields.flagImage, `${fields.country ?? ""} flag`), fields.country ?? "", "");
    case "translation":
      return simpleCard(card, fields.local ?? "", fields.translation ?? "", labeledDetails([["Pronunciation", fields.pronunciation]]));
    case "definition":
      return simpleCard(card, fields.word ?? "", fields.definition ?? "", remainingDetails(fields, ["word", "definition"]));
    case "reverse":
      return simpleCard(card, fields.term ?? "", fields.definition ?? "", remainingDetails(fields, ["term", "definition"]));
    case "cloze":
      return simpleCard(card, fields.text ?? "", joinFields([fields.text, fields.extra]), "");
    case "vocabulary":
      return simpleCard(card, fields.word ?? "", fields.meaning ?? fields.definition ?? "", labeledDetails([["Example", fields.example], ["Notes", fields.notes]]));
    case "sentenceTranslation":
      return simpleCard(card, fields.source ?? "", fields.target ?? "", labeledDetails([["Note", fields.note]]));
    case "imageLabel":
      return simpleCard(card, joinFields([fields.prompt, imageBlock(fields.image, "Card image")]), fields.answer ?? "", labeledDetails([["Note", fields.note]]));
    case "diagramPart":
      return simpleCard(card, joinFields([fields.prompt, imageBlock(fields.image, "Diagram")]), fields.part ?? "", labeledDetails([["Function", fields.function], ["Context", fields.context]]));
    case "formula":
      return simpleCard(card, joinFields([fields.name, fields.useCase]), fields.formula ?? "", labeledDetails([["Variables", fields.variables], ["Example", fields.example]]));
    case "timelineEvent":
      return simpleCard(card, fields.event ?? "", fields.date ?? "", labeledDetails([["Context", fields.context], ["Consequence", fields.consequence]]));
    case "qaSource":
      return simpleCard(card, fields.question ?? "", fields.answer ?? "", labeledDetails([["Source", fields.source], ["Note", fields.note]]));
    case "sqlConcept":
      return simpleCard(card, fields.concept ?? "", fields.explanation ?? "", labeledDetails([["Example", fields.example], ["Note", fields.note]]));
    case "sqlQueryResult":
      return simpleCard(card, fields.question ?? "", fields.result ?? "", labeledDetails([["Schema", fields.schema], ["Query", fields.query], ["Explanation", fields.explanation]]));
    case "sqlFunction":
      return simpleCard(card, fields.name ?? "", fields.behavior ?? fields.output ?? "", labeledDetails([["Example", fields.example], ["Note", fields.note]]));
    case "sqlDebug":
      return simpleCard(card, fields.question ?? "", fields.issue ?? "", labeledDetails([["Broken query", fields.brokenQuery], ["Fixed query", fields.fixedQuery], ["Explanation", fields.explanation]]));
    case "pythonConcept":
      return simpleCard(card, fields.concept ?? "", fields.explanation ?? "", labeledDetails([["Example", fields.example], ["Note", fields.note]]));
    case "pythonOutput":
      return simpleCard(card, fields.question ?? "", fields.output ?? "", labeledDetails([["Snippet", fields.snippet], ["Explanation", fields.explanation]]));
    case "pythonFunctionBehavior":
      return simpleCard(card, fields.name ?? "", fields.behavior ?? "", labeledDetails([["Code", fields.code], ["Example call", fields.exampleCall], ["Result", fields.result]]));
    case "pythonDebug":
      return simpleCard(card, fields.question ?? "", fields.issue ?? "", labeledDetails([["Buggy code", fields.buggyCode], ["Fixed code", fields.fixedCode], ["Explanation", fields.explanation]]));
    default:
      return customTemplateCard(card, template);
  }
}

function customTemplateCard(card: StoredCard, template?: StoredTemplate) {
  const fields = card.fields ?? {};
  const orderedFields = template?.fields?.length
    ? template.fields
    : Object.keys(fields).map((key) => ({ key, label: titleFromKey(key) }));
  const rectoKey = findFirstKey(fields, ["recto", "front"]) ?? orderedFields[0]?.key ?? "";
  const versoKey = findFirstKey(fields, ["verso", "back"]) ?? orderedFields.find((field) => field.key !== rectoKey)?.key ?? "";
  const detailKeys = new Set([rectoKey, versoKey]);
  const details = labeledDetails(
    orderedFields
      .filter((field) => !detailKeys.has(field.key))
      .map((field) => [field.label ?? titleFromKey(field.key), fields[field.key]] as [string, string | undefined])
  );

  return simpleCard(card, fields[rectoKey] ?? "", fields[versoKey] ?? "", details);
}

function simpleCard(card: StoredCard, recto: string, verso: string, details: string): Card {
  const timestamp = nowIso();

  return {
    id: card.id ?? uid("card"),
    deckId: card.deckId ?? "",
    recto,
    verso,
    details,
    tags: card.tags ?? [],
    suspended: card.suspended ?? false,
    source: card.source,
    createdAt: card.createdAt ?? timestamp,
    updatedAt: card.updatedAt ?? timestamp
  };
}

function remainingDetails(fields: Record<string, string>, usedKeys: string[]) {
  const used = new Set(usedKeys);
  return labeledDetails(
    Object.entries(fields)
      .filter(([key]) => !used.has(key))
      .map(([key, value]) => [titleFromKey(key), value])
  );
}

function findFirstKey(fields: Record<string, string>, keys: string[]) {
  return keys.find((key) => fields[key] !== undefined);
}

function labeledDetails(values: Array<[string, string | undefined]>) {
  return values
    .filter(([, value]) => Boolean(value))
    .map(([label, value]) => `${label}: ${value}`)
    .join("\n\n");
}

function joinFields(values: Array<string | undefined>) {
  return values.filter(Boolean).join("\n\n");
}

function joinInline(values: Array<string | undefined>) {
  return values.filter(Boolean).join(" ").trim();
}

function imageBlock(src = "", alt = "") {
  return src ? `<img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" />` : "";
}

function titleFromKey(key: string) {
  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/^./, (letter) => letter.toLocaleUpperCase());
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
