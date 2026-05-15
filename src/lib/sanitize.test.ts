import { describe, expect, it } from "vitest";
import { sanitizeHtml } from "./sanitize";

describe("sanitizeHtml", () => {
  it("removes scripts and unsafe attributes", () => {
    const result = sanitizeHtml('<img src="javascript:bad()"><script>alert(1)</script><b onclick="bad()">ok</b>');

    expect(result).not.toContain("script");
    expect(result).not.toContain("onclick");
    expect(result).not.toContain("javascript");
    expect(result).toContain("<b>ok</b>");
  });

  it("preserves safe rich text tags", () => {
    const result = sanitizeHtml("<strong>Bold</strong><em>Italic</em><code>const value = 1;</code>");

    expect(result).toContain("<strong>Bold</strong>");
    expect(result).toContain("<em>Italic</em>");
    expect(result).toContain("<code>const value = 1;</code>");
  });

  it("keeps safe image sources and strips unsafe image attributes", () => {
    const result = sanitizeHtml(
      '<img src="media://media_1" alt="Diagram" onerror="bad()"><img src="data:text/html;base64,PGgxPmJhZDwvaDE+">'
    );

    expect(result).toContain('<img src="media://media_1" alt="Diagram">');
    expect(result).not.toContain("onerror");
    expect(result).not.toContain("data:text/html");
  });
});
