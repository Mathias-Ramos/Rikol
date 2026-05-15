import JSZip from "jszip";
import initSqlJs, { type Database as SqlDatabase } from "sql.js";
import sqlWasmUrl from "sql.js/dist/sql-wasm.wasm?url";
import { ZSTDDecoder } from "zstddec";
import type { AppData, Card, Deck, ImportBundle, ImportReport, MediaAsset } from "../types";
import { createInitialReviewState } from "./scheduler";
import { getPlainCard } from "./renderCard";
import { sanitizeHtml } from "./sanitize";
import { migrateAppData } from "./storage";
import { bytesToBase64, dataUrlToBytes, nowIso, stripHtml, textChecksum, uid } from "./utils";

const BACKUP_VERSION = 1;
const SQLITE_HEADER = "SQLite format 3\0";
const REQUIRED_ANKI_COLUMNS = {
  cards: ["id", "did", "nid", "ord"],
  col: ["decks", "models"],
  notes: ["id", "guid", "mid", "tags", "flds"]
};
const IMAGE_RE = /\.(png|jpe?g|gif|webp|svg)$/i;
const AUDIO_VIDEO_RE = /\.(mp3|wav|ogg|m4a|mp4|webm|mov)$/i;
const DETAIL_FIELD_RE = /^(details?|extra|notes?)$/i;

interface AnkiField {
  name: string;
  ord: number;
}

interface AnkiTemplate {
  name?: string;
  ord: number;
  qfmt?: string;
  afmt?: string;
}

interface AnkiModel {
  name?: string;
  flds?: AnkiField[];
  tmpls?: AnkiTemplate[];
}

export function exportJsonBackup(data: AppData) {
  return new Blob(
    [
      JSON.stringify(
        {
          version: BACKUP_VERSION,
          exportedAt: nowIso(),
          data
        },
        null,
        2
      )
    ],
    { type: "application/json" }
  );
}

export async function importJsonBackup(file: File): Promise<AppData> {
  const text = await file.text();
  const parsed = JSON.parse(text);
  if (!parsed?.data) {
    throw new Error("Invalid Rikol backup.");
  }
  return migrateAppData(parsed.data as never);
}

export function exportDeckCsv(deck: Deck, cards: Card[], data: AppData) {
  const rows = [["deck", "recto", "verso", "details", "tags"]];
  for (const card of cards.filter((item) => item.deckId === deck.id)) {
    const plain = getPlainCard(card);
    rows.push([deck.name, plain.recto, plain.verso, plain.details, card.tags.join(" ")]);
  }

  return new Blob([rows.map((row) => row.map(escapeCsv).join(",")).join("\n")], {
    type: "text/csv;charset=utf-8"
  });
}

export async function importCsv(file: File, existingDecks: Deck[], existingCards: Card[]): Promise<ImportBundle> {
  const text = await file.text();
  const rows = parseCsv(text).filter((row) => row.some(Boolean));
  const header = rows[0]?.map((cell) => cell.toLowerCase().trim()) ?? [];
  const hasHeader = header.includes("recto") || header.includes("verso") || header.includes("front") || header.includes("back");
  const body = hasHeader ? rows.slice(1) : rows;
  const deckNameIndex = hasHeader ? header.indexOf("deck") : -1;
  const rectoIndex = hasHeader ? firstHeaderIndex(header, ["recto", "front"], 0) : 0;
  const versoIndex = hasHeader ? firstHeaderIndex(header, ["verso", "back"], 1) : 1;
  const detailsIndex = hasHeader ? header.indexOf("details") : -1;
  const tagsIndex = hasHeader ? header.indexOf("tags") : 3;
  const decksByName = new Map<string, Deck>();
  const cards: Card[] = [];
  const createdAt = nowIso();

  for (const row of body) {
    const deckName = deckNameIndex >= 0 ? row[deckNameIndex] || "Imported deck" : "Imported deck";
    let deck = decksByName.get(deckName);
    if (!deck) {
      deck = {
        id: uid("deck"),
        name: deckName,
        description: `Imported from ${file.name}`,
        color: "#69b7ff",
        tags: ["imported"],
        dailyNewLimit: 20,
        dailyReviewLimit: 100,
        createdAt,
        updatedAt: createdAt
      };
      decksByName.set(deckName, deck);
    }

    const recto = sanitizeHtml(row[rectoIndex] ?? "");
    const verso = sanitizeHtml(row[versoIndex] ?? "");
    const details = detailsIndex >= 0 ? sanitizeHtml(row[detailsIndex] ?? "") : "";
    if (!recto && !verso) {
      continue;
    }

    cards.push({
      id: uid("card"),
      deckId: deck.id,
      recto,
      verso,
      details,
      tags: tagsIndex >= 0 ? splitTags(row[tagsIndex] ?? "") : [],
      suspended: false,
      source: { type: "csv", externalId: `${recto}|${verso}`, fileName: file.name },
      createdAt,
      updatedAt: createdAt
    });
  }

  const report = createReport("csv", file.name, Array.from(decksByName.values()), cards, [], existingCards);
  report.duplicateCount = countDuplicates(cards, existingCards);
  report.warnings.push({
    level: "info",
    message: "CSV import maps rows to simple Recto, Verso, and Details cards."
  });

  return { decks: Array.from(decksByName.values()), cards, media: [], report };
}

export async function importApkg(file: File, existingCards: Card[]): Promise<ImportBundle> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const warnings: ImportReport["warnings"] = [];
  const media = await readAnkiMedia(zip, warnings);
  const SQL = await initSqlJs({ locateFile: () => sqlWasmUrl });
  const collectionBytes = await readCollectionBytes(zip, warnings, SQL);

  if (!collectionBytes) {
    throw new Error("No readable Anki collection found.");
  }

  const db = new SQL.Database(collectionBytes);
  const createdAt = nowIso();
  const ankiDecks = readDeckMap(db, warnings);
  const ankiModels = readModelMap(db, warnings);
  const deckByAnkiId = new Map<number, Deck>();
  const cards: Card[] = [];

  const rows = db.exec(
    "select c.id as cid, c.did as did, c.ord as ord, n.id as nid, n.guid as guid, n.mid as mid, n.tags as tags, n.flds as flds from cards c join notes n on c.nid = n.id order by c.id"
  );

  const values = rows[0]?.values ?? [];
  for (const row of values) {
    const cardId = String(row[0]);
    const deckId = Number(row[1]);
    const cardOrd = Number(row[2]);
    const noteId = String(row[3]);
    const guid = String(row[4] ?? noteId);
    const modelId = Number(row[5]);
    const tags = splitTags(String(row[6] ?? ""));
    const fields = String(row[7] ?? "")
      .split("\x1f")
      .map((value) => replaceMediaRefs(sanitizeHtml(value), media));

    if (!deckByAnkiId.has(deckId)) {
      const name = ankiDecks.get(deckId) ?? "Imported Anki deck";
      deckByAnkiId.set(deckId, {
        id: uid("deck"),
        name,
        description: `Imported from ${file.name}`,
        color: "#8f65ff",
        tags: ["anki", "imported"],
        dailyNewLimit: 20,
        dailyReviewLimit: 100,
        createdAt,
        updatedAt: createdAt
      });
    }

    const deck = deckByAnkiId.get(deckId)!;
    const rendered = renderAnkiCard(ankiModels.get(modelId), cardOrd, fields, warnings);
    const recto = rendered.recto;
    const verso = rendered.verso;
    const details = rendered.details;
    if (!recto && !verso) {
      warnings.push({ level: "warning", message: `Skipped blank Anki card ${cardId}.` });
      continue;
    }

    cards.push({
      id: uid("card"),
      deckId: deck.id,
      recto,
      verso: verso || recto,
      details,
      tags,
      suspended: false,
      source: { type: "anki", externalId: `${guid}:${cardOrd}`, fileName: file.name },
      createdAt,
      updatedAt: createdAt
    });
  }

  db.close();

  const decks = Array.from(deckByAnkiId.values());
  const report = createReport("apkg", file.name, decks, cards, media, existingCards);
  report.warnings.push(...warnings);
  report.warnings.push({
    level: "info",
    message: "Anki card templates are mapped to safe simple cards."
  });

  return { decks, cards, media, report };
}

export async function exportDeckApkg(deck: Deck, cards: Card[], data: AppData) {
  const SQL = await initSqlJs({ locateFile: () => sqlWasmUrl });
  const db = new SQL.Database();
  const zip = new JSZip();
  const now = Math.floor(Date.now() / 1000);
  const modelId = Date.now();
  const deckId = Date.now() + 10;

  db.run("create table col (id integer primary key, crt integer not null, mod integer not null, scm integer not null, ver integer not null, dty integer not null, usn integer not null, ls integer not null, conf text not null, models text not null, decks text not null, dconf text not null, tags text not null)");
  db.run("create table notes (id integer primary key, guid text not null, mid integer not null, mod integer not null, usn integer not null, tags text not null, flds text not null, sfld text not null, csum integer not null, flags integer not null, data text not null)");
  db.run("create table cards (id integer primary key, nid integer not null, did integer not null, ord integer not null, mod integer not null, usn integer not null, type integer not null, queue integer not null, due integer not null, ivl integer not null, factor integer not null, reps integer not null, lapses integer not null, left integer not null, odue integer not null, odid integer not null, flags integer not null, data text not null)");
  db.run("create index ix_notes_csum on notes (csum)");
  db.run("create index ix_cards_nid on cards (nid)");
  db.run("create index ix_cards_sched on cards (did, queue, due)");

  const model = {
    [modelId]: {
      id: modelId,
      name: "Rikol Classic",
      type: 0,
      mod: now,
      usn: -1,
      sortf: 0,
      did: deckId,
      tmpls: [
        {
          name: "Card 1",
          ord: 0,
          qfmt: "{{Front}}",
          afmt: "{{FrontSide}}<hr id=answer>{{Back}}<br><small>{{Details}}</small>",
          did: null,
          bqfmt: "",
          bafmt: ""
        }
      ],
      flds: [
        { name: "Front", ord: 0, sticky: false, rtl: false, font: "Arial", size: 20 },
        { name: "Back", ord: 1, sticky: false, rtl: false, font: "Arial", size: 20 },
        { name: "Details", ord: 2, sticky: false, rtl: false, font: "Arial", size: 16 }
      ],
      css: ".card { font-family: Arial; font-size: 20px; text-align: center; color: #1f2933; background: #fff8eb; }",
      latexPre: "",
      latexPost: "",
      req: [[0, "any", [0]]]
    }
  };
  const decks = {
    [deckId]: {
      id: deckId,
      name: deck.name,
      desc: deck.description,
      mod: now,
      usn: -1,
      collapsed: false,
      browserCollapsed: false,
      conf: 1,
      dyn: 0,
      extendNew: 0,
      extendRev: 0,
      reviewLimit: deck.dailyReviewLimit,
      newLimit: deck.dailyNewLimit
    }
  };
  const dconf = {
    1: {
      id: 1,
      name: "Default",
      mod: now,
      usn: -1,
      maxTaken: 60,
      autoplay: true,
      timer: 0,
      replayq: true,
      new: { perDay: deck.dailyNewLimit },
      rev: { perDay: deck.dailyReviewLimit },
      lapse: {},
      dyn: false
    }
  };

  db.run(
    "insert into col values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [1, now, now, now, 11, 0, -1, 0, "{}", JSON.stringify(model), JSON.stringify(decks), JSON.stringify(dconf), "{}"]
  );

  const mediaMap: Record<string, string> = {};
  let mediaIndex = 0;
  for (const asset of data.media) {
    if (!IMAGE_RE.test(asset.name)) {
      continue;
    }
    const parsed = dataUrlToBytes(asset.dataUrl);
    const fileName = String(mediaIndex);
    mediaMap[fileName] = asset.name;
    zip.file(fileName, parsed.bytes);
    mediaIndex += 1;
  }

  const deckCards = cards.filter((card) => card.deckId === deck.id);
  deckCards.forEach((card, index) => {
    const plain = getPlainCard(card);
    const noteId = Date.now() * 1000 + index;
    const cardAnkiId = noteId + 500;
    const fields = `${plain.recto}\x1f${plain.verso}\x1f${plain.details}`;
    db.run("insert into notes values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [
      noteId,
      card.source?.externalId ?? uid("guid"),
      modelId,
      now,
      -1,
      ` ${card.tags.join(" ")} `,
      fields,
      plain.recto,
      textChecksum(plain.recto),
      0,
      ""
    ]);
    db.run("insert into cards values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [
      cardAnkiId,
      noteId,
      deckId,
      0,
      now,
      -1,
      0,
      0,
      index + 1,
      0,
      2500,
      0,
      0,
      0,
      0,
      0,
      0,
      ""
    ]);
  });

  zip.file("collection.anki2", db.export());
  zip.file("media", JSON.stringify(mediaMap));
  db.close();
  return zip.generateAsync({ type: "blob", mimeType: "application/apkg" });
}

export function mergeImport(data: AppData, bundle: ImportBundle): AppData {
  const existingSourceIds = new Set(
    data.cards
      .map((card) => card.source?.externalId)
      .filter((value): value is string => Boolean(value))
  );
  const newCards = bundle.cards.filter((card) => !card.source?.externalId || !existingSourceIds.has(card.source.externalId));
  const reviewStates = newCards.map((card) => createInitialReviewState(card.id, card.createdAt));

  return {
    ...data,
    decks: [...data.decks, ...bundle.decks],
    cards: [...data.cards, ...newCards],
    media: [...data.media, ...bundle.media],
    reviewStates: [...data.reviewStates, ...reviewStates],
    importReports: [bundle.report, ...data.importReports].slice(0, 20)
  };
}

function createReport(
  source: ImportReport["source"],
  fileName: string,
  decks: Deck[],
  cards: Card[],
  media: MediaAsset[],
  existingCards: Card[]
): ImportReport {
  return {
    id: uid("import"),
    source,
    fileName,
    createdAt: nowIso(),
    deckCount: decks.length,
    cardCount: cards.length,
    mediaCount: media.length,
    duplicateCount: countDuplicates(cards, existingCards),
    skippedCount: 0,
    warnings: [],
    sampleCards: cards.slice(0, 3).map((card) => ({
      recto: stripHtml(card.recto),
      verso: stripHtml(card.verso)
    }))
  };
}

function countDuplicates(cards: Card[], existingCards: Card[]) {
  const existing = new Set(
    existingCards
      .map((card) => card.source?.externalId)
      .filter((value): value is string => Boolean(value))
  );
  return cards.filter((card) => card.source?.externalId && existing.has(card.source.externalId)).length;
}

function escapeCsv(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

function firstHeaderIndex(header: string[], names: string[], fallback: number) {
  const found = names.map((name) => header.indexOf(name)).find((index) => index >= 0);
  return found ?? fallback;
}

export function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"' && inQuotes && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  row.push(cell);
  rows.push(row);
  return rows;
}

async function readAnkiMedia(zip: JSZip, warnings: ImportReport["warnings"]) {
  const mediaFile = zip.file("media");
  if (!mediaFile) {
    return [];
  }

  const mediaMap = JSON.parse(await mediaFile.async("string")) as Record<string, string>;
  const assets: MediaAsset[] = [];
  for (const [zipName, originalName] of Object.entries(mediaMap)) {
    const entry = zip.file(zipName);
    if (!entry) {
      continue;
    }

    if (AUDIO_VIDEO_RE.test(originalName)) {
      warnings.push({ level: "warning", message: `Skipped audio/video media: ${originalName}.` });
      continue;
    }

    if (!IMAGE_RE.test(originalName)) {
      warnings.push({ level: "warning", message: `Skipped unsupported media: ${originalName}.` });
      continue;
    }

    const bytes = await entry.async("uint8array");
    const mime = mimeFromName(originalName);
    assets.push({
      id: uid("media"),
      name: originalName,
      mime,
      dataUrl: `data:${mime};base64,${bytesToBase64(bytes)}`,
      createdAt: nowIso()
    });
  }
  return assets;
}

async function readCollectionBytes(zip: JSZip, warnings: ImportReport["warnings"], SQL: Awaited<ReturnType<typeof initSqlJs>>) {
  const legacy = zip.file("collection.anki2");
  const modern = zip.file("collection.anki21");

  if (modern) {
    const collection = await readModernCollectionBytes(modern, warnings);
    if (collection && hasRequiredAnkiSchema(collection, SQL)) {
      return collection;
    }
    warnings.push({
      level: "warning",
      message: "Modern collection is not a compatible Anki database. Trying legacy collection."
    });
  }

  if (legacy) {
    const collection = await legacy.async("uint8array");
    if (hasRequiredAnkiSchema(collection, SQL)) {
      return collection;
    }
    warnings.push({ level: "warning", message: "Legacy collection is not a compatible Anki database." });
  }

  return undefined;
}

async function readModernCollectionBytes(modern: JSZip.JSZipObject, warnings: ImportReport["warnings"]) {
  const bytes = await modern.async("uint8array");
  if (isSQLiteDatabase(bytes)) {
    return bytes;
  }

  // Modern .anki21 files may be raw SQLite or zstd-compressed SQLite.
  try {
    const decoder = new ZSTDDecoder();
    await decoder.init();
    const decoded = decoder.decode(bytes);
    return decoded.length ? decoded : undefined;
  } catch {
    if (!warnings.some((warning) => warning.message === "Modern compressed collection could not be decoded. Trying legacy collection.")) {
      warnings.push({
        level: "warning",
        message: "Modern compressed collection could not be decoded. Trying legacy collection."
      });
    }
  }
  return undefined;
}

function isSQLiteDatabase(bytes: Uint8Array) {
  if (bytes.length < SQLITE_HEADER.length) {
    return false;
  }

  return Array.from(SQLITE_HEADER).every((char, index) => bytes[index] === char.charCodeAt(0));
}

function hasRequiredAnkiSchema(bytes: Uint8Array, SQL: Awaited<ReturnType<typeof initSqlJs>>) {
  let db: SqlDatabase | undefined;
  try {
    db = new SQL.Database(bytes);
    return Object.entries(REQUIRED_ANKI_COLUMNS).every(([table, columns]) => {
      const result = db?.exec(`pragma table_info(${table})`);
      const tableColumns = new Set((result?.[0]?.values ?? []).map((row) => String(row[1])));
      return columns.every((column) => tableColumns.has(column));
    });
  } catch {
    return false;
  } finally {
    db?.close();
  }
}

function readDeckMap(db: SqlDatabase, warnings: ImportReport["warnings"]) {
  const deckMap = new Map<number, string>();
  try {
    const result = db.exec("select decks from col limit 1");
    const decksJson = String(result[0]?.values[0]?.[0] ?? "{}");
    const decks = JSON.parse(decksJson) as Record<string, { name?: string }>;
    for (const [id, deck] of Object.entries(decks)) {
      deckMap.set(Number(id), deck.name ?? "Imported Anki deck");
    }
  } catch {
    warnings.push({ level: "warning", message: "Could not read Anki deck names." });
  }
  return deckMap;
}

function readModelMap(db: SqlDatabase, warnings: ImportReport["warnings"]) {
  const modelMap = new Map<number, AnkiModel>();
  try {
    const result = db.exec("select models from col limit 1");
    const modelsJson = String(result[0]?.values[0]?.[0] ?? "{}");
    const models = JSON.parse(modelsJson) as Record<string, AnkiModel>;
    for (const [id, model] of Object.entries(models)) {
      modelMap.set(Number(id), model);
    }
  } catch {
    pushWarningOnce(warnings, "Could not read Anki card templates. Using note field order.");
  }
  return modelMap;
}

function renderAnkiCard(
  model: AnkiModel | undefined,
  cardOrd: number,
  fields: string[],
  warnings: ImportReport["warnings"]
) {
  const template = model?.tmpls?.find((item) => Number(item.ord) === cardOrd) ?? model?.tmpls?.[cardOrd];
  if (!model || !template) {
    pushWarningOnce(warnings, "Could not read Anki card templates. Using note field order.");
    return simpleAnkiCard(fields);
  }

  const fieldEntries = fields.map((value, index) => ({
    index,
    name: ankiFieldName(model, index),
    value
  }));
  const fieldValues = new Map(fieldEntries.map((entry) => [entry.name, entry.value]));
  const qfmt = template.qfmt ?? `{{${fieldEntries[0]?.name ?? "Front"}}}`;
  const afmt = template.afmt ?? `{{${fieldEntries[1]?.name ?? fieldEntries[0]?.name ?? "Back"}}}`;
  const promptFields = new Set(collectTemplateFields(qfmt, fieldValues));
  const answerFields = new Set(
    collectTemplateFields(afmt, fieldValues).filter((name) => !promptFields.has(name) && !DETAIL_FIELD_RE.test(name))
  );
  const detailFields = new Set(
    fieldEntries
      .filter((entry) => {
        if (!entry.value) return false;
        if (DETAIL_FIELD_RE.test(entry.name)) return true;
        return !promptFields.has(entry.name) && !answerFields.has(entry.name);
      })
      .map((entry) => entry.name)
  );

  // Hide prompt and detail fields while rendering answer side so reverse cards stay distinct.
  const hiddenAnswerFields = new Set([...promptFields, ...detailFields]);
  const recto = cleanRenderedHtml(renderAnkiTemplate(qfmt, fieldValues));
  const verso = cleanRenderedHtml(renderAnkiTemplate(afmt, fieldValues, hiddenAnswerFields));
  const details = joinFieldValues(
    fieldEntries.filter((entry) => detailFields.has(entry.name)).map((entry) => entry.value)
  );
  const fallback = simpleAnkiCard(fields);

  return {
    recto: recto || fallback.recto,
    verso: verso || joinFieldValues(fieldEntries.filter((entry) => answerFields.has(entry.name)).map((entry) => entry.value)) || fallback.verso,
    details
  };
}

function simpleAnkiCard(fields: string[]) {
  const recto = fields[0] ?? "";
  const verso = fields[1] ?? "";
  return {
    recto,
    verso: verso || recto,
    details: joinFieldValues(fields.slice(2))
  };
}

function ankiFieldName(model: AnkiModel, index: number) {
  return model.flds?.find((field) => Number(field.ord) === index)?.name ?? `Field ${index + 1}`;
}

function collectTemplateFields(template: string, fieldValues: Map<string, string>) {
  const fields: string[] = [];
  for (const match of template.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)) {
    const fieldName = ankiTokenFieldName(match[1]);
    if (fieldName && fieldValues.has(fieldName) && !fields.includes(fieldName)) {
      fields.push(fieldName);
    }
  }
  return fields;
}

function renderAnkiTemplate(template: string, fieldValues: Map<string, string>, hiddenFields = new Set<string>()) {
  let output = renderConditionalBlocks(template, fieldValues, hiddenFields);
  output = output.replace(/\{\{\s*FrontSide\s*\}\}/g, "");
  output = output.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (_match, token: string) => {
    const fieldName = ankiTokenFieldName(token);
    if (!fieldName || hiddenFields.has(fieldName)) {
      return "";
    }
    const value = fieldValues.get(fieldName) ?? "";
    return token.trim().startsWith("text:") ? stripHtml(value) : value;
  });
  return output;
}

function renderConditionalBlocks(template: string, fieldValues: Map<string, string>, hiddenFields: Set<string>) {
  let output = template;
  output = output.replace(/\{\{\s*#([^{}]+?)\s*\}\}([\s\S]*?)\{\{\s*\/\1\s*\}\}/g, (_match, token: string, body: string) => {
    const fieldName = ankiTokenFieldName(token);
    const value = fieldName && !hiddenFields.has(fieldName) ? fieldValues.get(fieldName) : "";
    return stripHtml(value ?? "") ? body : "";
  });
  output = output.replace(/\{\{\s*\^([^{}]+?)\s*\}\}([\s\S]*?)\{\{\s*\/\1\s*\}\}/g, (_match, token: string, body: string) => {
    const fieldName = ankiTokenFieldName(token);
    const value = fieldName && !hiddenFields.has(fieldName) ? fieldValues.get(fieldName) : "";
    return stripHtml(value ?? "") ? "" : body;
  });
  return output;
}

function ankiTokenFieldName(token: string) {
  let value = token.trim();
  if (!value || value === "FrontSide") {
    return "";
  }
  if (value.startsWith("/") || value.startsWith("#") || value.startsWith("^")) {
    value = value.slice(1).trim();
  }
  if (value.includes(":")) {
    value = value.slice(value.lastIndexOf(":") + 1).trim();
  }
  return value;
}

function cleanRenderedHtml(html: string) {
  return removeEmptyHtml(sanitizeHtml(html)).trim();
}

function removeEmptyHtml(html: string) {
  if (!html) {
    return "";
  }

  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
  const root = doc.body.firstElementChild!;
  let removed = true;
  while (removed) {
    removed = false;
    for (const child of Array.from(root.querySelectorAll("*")).reverse()) {
      if (child.tagName === "IMG") {
        continue;
      }
      if (!stripHtml(child.innerHTML) && !child.querySelector("img")) {
        child.remove();
        removed = true;
      }
    }
  }
  return root.innerHTML.replace(/^(<br\s*\/?>\s*)+|(\s*<br\s*\/?>)+$/gi, "");
}

function joinFieldValues(values: string[]) {
  return values.filter(Boolean).join("<br/>");
}

function pushWarningOnce(warnings: ImportReport["warnings"], message: string) {
  if (!warnings.some((warning) => warning.message === message)) {
    warnings.push({ level: "warning", message });
  }
}

function replaceMediaRefs(html: string, media: MediaAsset[]) {
  return html.replace(/src=["']([^"']+)["']/g, (_match, src) => {
    const asset = media.find((item) => item.name === src);
    return `src="${asset?.dataUrl ?? src}"`;
  });
}

function splitTags(value: string) {
  return value
    .split(/\s+/)
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function mimeFromName(name: string) {
  if (/\.svg$/i.test(name)) return "image/svg+xml";
  if (/\.webp$/i.test(name)) return "image/webp";
  if (/\.gif$/i.test(name)) return "image/gif";
  if (/\.png$/i.test(name)) return "image/png";
  return "image/jpeg";
}
