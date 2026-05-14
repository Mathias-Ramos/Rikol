import { describe, expect, it } from "vitest";
import { importCsv, parseCsv } from "./importExport";

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

function textFile(name: string, contents: string) {
  return {
    name,
    text: async () => contents
  } as File;
}
