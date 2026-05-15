import { sanitizeHtml } from "./sanitize";
import { hasCardHtmlContent } from "./media";

export function normalizeRichTextHtml(html: string) {
  const sanitized = sanitizeHtml(html);
  if (!hasCardHtmlContent(sanitized)) {
    return "";
  }

  const doc = new DOMParser().parseFromString(`<div>${sanitized}</div>`, "text/html");
  const root = doc.body.firstElementChild!;
  replaceTag(root, "b", "strong");
  replaceTag(root, "i", "em");
  return root.innerHTML;
}

function replaceTag(root: Element, from: string, to: string) {
  for (const node of Array.from(root.querySelectorAll(from))) {
    const replacement = document.createElement(to);
    replacement.replaceChildren(...Array.from(node.childNodes));
    for (const attr of Array.from(node.attributes)) {
      replacement.setAttribute(attr.name, attr.value);
    }
    node.replaceWith(replacement);
  }
}
