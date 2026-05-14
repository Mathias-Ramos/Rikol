const ALLOWED_TAGS = new Set([
  "B",
  "I",
  "EM",
  "STRONG",
  "U",
  "BR",
  "P",
  "DIV",
  "SPAN",
  "UL",
  "OL",
  "LI",
  "CODE",
  "PRE",
  "KBD",
  "IMG",
  "SMALL",
  "SUB",
  "SUP"
]);

const ALLOWED_ATTRS = new Set(["src", "alt", "title", "class"]);

export function sanitizeHtml(html: string) {
  if (!html) {
    return "";
  }

  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
  const root = doc.body.firstElementChild!;

  function clean(node: Element) {
    for (const child of Array.from(node.children)) {
      if (!ALLOWED_TAGS.has(child.tagName)) {
        child.replaceWith(...Array.from(child.childNodes));
        continue;
      }

      for (const attr of Array.from(child.attributes)) {
        const name = attr.name.toLowerCase();
        const value = attr.value.trim();
        const unsafeUrl = /^(javascript|data:text\/html)/i.test(value);
        const unsafeStyle = name === "style";

        if (!ALLOWED_ATTRS.has(name) || unsafeUrl || unsafeStyle || name.startsWith("on")) {
          child.removeAttribute(attr.name);
        }
      }

      if (child.tagName === "IMG") {
        const src = child.getAttribute("src") ?? "";
        if (!src || /^(javascript|data:text\/html)/i.test(src)) {
          child.remove();
          continue;
        }
      }

      clean(child);
    }
  }

  clean(root);
  return root.innerHTML;
}
