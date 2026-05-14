import { describe, expect, it } from "vitest";
import { normalizeRichTextHtml } from "./richText";

describe("rich text normalization", () => {
  it("uses semantic tags for browser bold and italic output", () => {
    const result = normalizeRichTextHtml("<b>Bold</b><i>Italic</i><code>code</code>");

    expect(result).toBe("<strong>Bold</strong><em>Italic</em><code>code</code>");
  });

  it("treats empty rich markup as blank", () => {
    expect(normalizeRichTextHtml("<strong><br></strong>")).toBe("");
  });
});
