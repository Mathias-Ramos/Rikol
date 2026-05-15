import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import initSqlJs from "sql.js";
import { exportDeckApkg, importApkg, importCsv, parseCsv } from "./importExport";
import { createEmptyAppData } from "./storage";

const PNG_BYTES = new Uint8Array([
  137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0,
  0, 31, 21, 196, 137, 0, 0, 0, 12, 73, 68, 65, 84, 120, 156, 99, 248, 15, 4, 0, 9, 251, 3, 253, 167,
  110, 214, 34, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130
]);

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

  it("imports packaged Anki image refs as local media refs", async () => {
    const file = await apkgFile("image.apkg", {
      "collection.anki2": await ankiCollection({
        deckName: "Image deck",
        recto: '<img src="diagram.png" alt="Diagram">',
        verso: "Answer"
      }),
      media: JSON.stringify({ "0": "diagram.png" }),
      "0": PNG_BYTES
    });

    const bundle = await importApkg(file, []);

    expect(bundle.media).toHaveLength(1);
    expect(bundle.media[0]).toMatchObject({
      name: "diagram.png",
      mime: "image/png"
    });
    expect(bundle.media[0].dataUrl).toMatch(/^data:image\/png;base64,/);
    expect(bundle.cards[0].recto).toContain(`src="media://${bundle.media[0].id}"`);
    expect(bundle.cards[0].recto).toContain('alt="Diagram"');
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

describe("APKG exporter", () => {
  it("exports referenced local media as Anki package image files", async () => {
    const createdAt = "2026-05-13T00:00:00.000Z";
    const deck = {
      id: "deck_1",
      name: "Images",
      description: "",
      color: "#69b7ff",
      tags: [],
      dailyNewLimit: 20,
      dailyReviewLimit: 100,
      createdAt,
      updatedAt: createdAt
    };
    const card = {
      id: "card_1",
      deckId: deck.id,
      recto: '<img src="media://media_1" alt="Diagram">',
      verso: "Answer",
      details: "",
      tags: [],
      suspended: false,
      forceTypedAnswer: false,
      createdAt,
      updatedAt: createdAt
    };
    const data = {
      ...createEmptyAppData(),
      decks: [deck],
      cards: [card],
      media: [
        {
          id: "media_1",
          name: "diagram.png",
          mime: "image/png",
          dataUrl: `data:image/png;base64,${bytesToBase64ForTest(PNG_BYTES)}`,
          createdAt
        },
        {
          id: "media_unused",
          name: "unused.png",
          mime: "image/png",
          dataUrl: `data:image/png;base64,${bytesToBase64ForTest(PNG_BYTES)}`,
          createdAt
        }
      ]
    };

    const blob = await exportDeckApkg(deck, [card], data);
    const zip = await JSZip.loadAsync(blob);
    const mediaMap = JSON.parse(await zip.file("media")!.async("string")) as Record<string, string>;
    const collectionBytes = await zip.file("collection.anki2")!.async("uint8array");
    const SQL = await initSqlJs();
    const db = new SQL.Database(collectionBytes);
    const fields = String(db.exec("select flds from notes")[0].values[0][0]);
    db.close();

    expect(mediaMap).toEqual({ "0": "diagram.png" });
    expect(zip.file("0")).not.toBeNull();
    expect(fields).toContain('src="diagram.png"');
    expect(fields).not.toContain("media://");
  });
});

function textFile(name: string, contents: string) {
  return {
    name,
    text: async () => contents
  } as File;
}

function bytesToBase64ForTest(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

async function apkgFile(name: string, entries: Record<string, Uint8Array | string>) {
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
