import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import initSqlJs from "sql.js";
import { importApkg, importCsv, parseCsv } from "./importExport";

describe("CSV parser", () => {
  it("handles quoted commas", () => {
    const rows = parseCsv('front,back\n"hello, world","answer"');

    expect(rows[1]).toEqual(["hello, world", "answer"]);
  });

  it("imports simple cards with details", async () => {
    const file = textFile("cards.csv", "deck,recto,verso,details,tags\nDaily,Question,Answer,Context,tag");
    const bundle = await importCsv(file, [], []);

    expect(bundle.cards[0]).toMatchObject({
      recto: "Question",
      verso: "Answer",
      details: "Context",
      tags: ["tag"]
    });
  });

  it("accepts legacy front and back columns", async () => {
    const file = textFile("legacy.csv", "front,back\nPrompt,Response");
    const bundle = await importCsv(file, [], []);

    expect(bundle.cards[0]).toMatchObject({
      recto: "Prompt",
      verso: "Response",
      details: ""
    });
  });
});

describe("APKG importer", () => {
  it("imports raw SQLite collection.anki21 packages", async () => {
    const file = await apkgFile("modern.apkg", {
      "collection.anki21": await ankiCollection({
        deckName: "Python fundamentals",
        recto: "<b>Question</b>",
        verso: "Answer",
        details: "Extra detail",
        tags: "python imported"
      })
    });

    const bundle = await importApkg(file, []);

    expect(bundle.decks).toHaveLength(1);
    expect(bundle.decks[0].name).toBe("Python fundamentals");
    expect(bundle.cards).toHaveLength(1);
    expect(bundle.cards[0]).toMatchObject({
      recto: "<b>Question</b>",
      verso: "Answer",
      details: "Extra detail",
      tags: ["python", "imported"]
    });
    expect(bundle.report.cardCount).toBe(1);
  });

  it("falls back to collection.anki2 when modern collection is invalid", async () => {
    const file = await apkgFile("fallback.apkg", {
      "collection.anki21": new Uint8Array([1, 2, 3]),
      "collection.anki2": await ankiCollection({
        deckName: "Legacy fallback",
        recto: "Legacy prompt",
        verso: "Legacy answer"
      })
    });

    const bundle = await importApkg(file, []);

    expect(bundle.decks[0].name).toBe("Legacy fallback");
    expect(bundle.cards[0]).toMatchObject({
      recto: "Legacy prompt",
      verso: "Legacy answer"
    });
    expect(bundle.report.warnings.some((warning) => warning.message.includes("Trying legacy collection"))).toBe(true);
  });

  it("imports reverse templates as distinct study directions", async () => {
    const file = await apkgFile("git.apkg", {
      "collection.anki2": await ankiCollection({
        deckName: "Git Cheat Sheet",
        recto: "",
        verso: "",
        fields: [
          { name: "Explanation", value: "Show changed files in working directory" },
          { name: "Code", value: "git status" }
        ],
        templates: [
          {
            name: "Card 1",
            ord: 0,
            qfmt: "<div>{{Explanation}}</div>",
            afmt: '<div>{{Explanation}}</div><div class="code">{{Code}}</div>'
          },
          {
            name: "Card 2",
            ord: 1,
            qfmt: '<div class="code">{{Code}}</div>',
            afmt: '<div class="code">{{Code}}</div><div>{{Explanation}}</div>'
          }
        ]
      })
    });

    const bundle = await importApkg(file, []);

    expect(bundle.cards).toHaveLength(2);
    expect(bundle.cards[0]).toMatchObject({
      recto: "<div>Show changed files in working directory</div>",
      verso: '<div class="code">git status</div>',
      source: { externalId: "test-guid:0" }
    });
    expect(bundle.cards[1]).toMatchObject({
      recto: '<div class="code">git status</div>',
      verso: "<div>Show changed files in working directory</div>",
      source: { externalId: "test-guid:1" }
    });
    expect(bundle.cards[0].recto).not.toBe(bundle.cards[1].recto);
    expect(bundle.report.cardCount).toBe(2);
  });

  it("renders cloze ords from one generated Anki template", async () => {
    const file = await apkgFile("cloze.apkg", {
      "collection.anki2": await ankiCollection({
        deckName: "Python Cloze",
        recto: "",
        verso: "",
        modelName: "Cloze",
        modelType: 1,
        fields: [
          {
            name: "Text",
            value: "A {{c1::docstring}} is {{c2::first string::definition}} in a module."
          },
          { name: "Back Extra", value: "Python stores it on __doc__." }
        ],
        templates: [
          {
            name: "Cloze",
            ord: 0,
            qfmt: "{{cloze:Text}}",
            afmt: "{{cloze:Text}}<br>{{Back Extra}}"
          }
        ],
        cardOrds: [0, 1]
      })
    });

    const bundle = await importApkg(file, []);

    expect(bundle.cards).toHaveLength(2);
    expect(bundle.cards[0]).toMatchObject({
      recto: 'A <span class="cloze">[...]</span> is first string in a module.',
      verso: "docstring",
      details: "A docstring is first string in a module.<br>Python stores it on __doc__.",
      source: { externalId: "test-guid:0" }
    });
    expect(bundle.cards[1]).toMatchObject({
      recto: 'A docstring is <span class="cloze">[definition]</span> in a module.',
      verso: "first string",
      details: "A docstring is first string in a module.<br>Python stores it on __doc__.",
      source: { externalId: "test-guid:1" }
    });
    expect(bundle.report.warnings.some((warning) => warning.message.includes("Could not read Anki card templates"))).toBe(false);
  });
});

function textFile(name: string, contents: string) {
  return {
    name,
    text: async () => contents
  } as File;
}

async function apkgFile(name: string, entries: Record<string, Uint8Array>) {
  const zip = new JSZip();
  for (const [entryName, bytes] of Object.entries(entries)) {
    zip.file(entryName, bytes);
  }
  const bytes = await zip.generateAsync({ type: "uint8array" });
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return {
    name,
    arrayBuffer: async () => buffer
  } as File;
}

async function ankiCollection({
  deckName,
  recto,
  verso,
  details = "",
  tags = "",
  fields,
  templates = [{ name: "Card 1", ord: 0, qfmt: "{{Front}}", afmt: "{{Back}}" }],
  modelName = "Test model",
  modelType = 0,
  cardOrds
}: {
  deckName: string;
  recto: string;
  verso: string;
  details?: string;
  tags?: string;
  fields?: Array<{ name: string; value: string }>;
  templates?: Array<{ name: string; ord: number; qfmt: string; afmt: string }>;
  modelName?: string;
  modelType?: number;
  cardOrds?: number[];
}) {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  const deckId = 100;
  const modelId = 150;
  const noteId = 200;
  const cardId = 300;
  const noteFields = fields ?? [
    { name: "Front", value: recto },
    { name: "Back", value: verso },
    { name: "Details", value: details }
  ];
  const fieldValues = noteFields.map((field) => field.value).join("\x1f");
  const models = {
    [modelId]: {
      id: modelId,
      name: modelName,
      type: modelType,
      flds: noteFields.map((field, ord) => ({ name: field.name, ord })),
      tmpls: templates
    }
  };

  db.run("create table col (decks text not null, models text not null)");
  db.run("create table notes (id integer primary key, guid text not null, mid integer not null, tags text not null, flds text not null)");
  db.run("create table cards (id integer primary key, nid integer not null, did integer not null, ord integer not null)");
  db.run("insert into col values (?, ?)", [JSON.stringify({ [deckId]: { id: deckId, name: deckName } }), JSON.stringify(models)]);
  db.run("insert into notes values (?, ?, ?, ?, ?)", [noteId, "test-guid", modelId, tags, fieldValues]);
  (cardOrds ?? templates.map((template) => template.ord)).forEach((ord) => {
    db.run("insert into cards values (?, ?, ?, ?)", [cardId + ord, noteId, deckId, ord]);
  });

  const bytes = db.export();
  db.close();
  return bytes;
}
