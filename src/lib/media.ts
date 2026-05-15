import type { Card, MediaAsset } from "../types";
import { bytesToBase64, dataUrlToBytes, nowIso, stripHtml, uid } from "./utils";

export const MEDIA_SRC_PREFIX = "media://";
export const IMAGE_FILE_ACCEPT = "image/png,image/jpeg,image/gif,image/webp";

const IMAGE_EXTENSION_RE = /\.(png|jpe?g|gif|webp)$/i;
const MEDIA_TOKEN_RE = /media:\/\/([A-Za-z0-9_-]+)/g;
const SUPPORTED_IMAGE_MIMES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

export async function createImageMediaAsset(file: File): Promise<MediaAsset> {
  const mime = imageMimeFromFile(file);
  if (!mime) {
    throw new Error("Use PNG, JPG, GIF, or WebP images.");
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  return {
    id: uid("media"),
    name: safeMediaName(file.name),
    mime,
    dataUrl: `data:${mime};base64,${bytesToBase64(bytes)}`,
    createdAt: nowIso()
  };
}

export function imageMimeFromFile(file: Pick<File, "name" | "type">) {
  if (hasFileExtension(file.name) && !isSupportedImageName(file.name)) {
    return "";
  }
  if (SUPPORTED_IMAGE_MIMES.has(file.type)) {
    return file.type;
  }
  return imageMimeFromName(file.name);
}

export function imageMimeFromName(name: string) {
  if (/\.webp$/i.test(name)) return "image/webp";
  if (/\.gif$/i.test(name)) return "image/gif";
  if (/\.png$/i.test(name)) return "image/png";
  if (/\.jpe?g$/i.test(name)) return "image/jpeg";
  return "";
}

export function isSupportedImageName(name: string) {
  return IMAGE_EXTENSION_RE.test(name);
}

export function isSupportedImageAsset(asset: Pick<MediaAsset, "name" | "mime">) {
  if (hasFileExtension(asset.name) && !isSupportedImageName(asset.name)) {
    return false;
  }
  return SUPPORTED_IMAGE_MIMES.has(asset.mime) || isSupportedImageName(asset.name);
}

export function mediaSrc(id: string) {
  return `${MEDIA_SRC_PREFIX}${id}`;
}

export function hasCardHtmlContent(html: string) {
  if (stripHtml(html)) {
    return true;
  }

  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
  return Boolean(doc.body.firstElementChild?.querySelector("img[src]"));
}

export function cardMediaIds(card: Pick<Card, "recto" | "verso" | "details">) {
  return collectMediaIds(`${card.recto}${card.verso}${card.details}`);
}

export function collectMediaIds(html: string) {
  return Array.from(html.matchAll(MEDIA_TOKEN_RE), (match) => match[1]);
}

export function replaceMediaSources(html: string, mediaById: Map<string, MediaAsset>) {
  return html.replace(MEDIA_TOKEN_RE, (_match, id: string) => mediaById.get(id)?.dataUrl ?? "");
}

export function mediaHtmlForEditor(html: string, media: MediaAsset[]) {
  return replaceMediaSources(html, new Map(media.map((asset) => [asset.id, asset])));
}

export function restoreMediaSources(html: string, media: MediaAsset[]) {
  if (!html) {
    return "";
  }

  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
  const root = doc.body.firstElementChild!;
  for (const image of Array.from(root.querySelectorAll("img"))) {
    const src = image.getAttribute("src") ?? "";
    const asset = media.find((item) => item.dataUrl === src);
    if (asset) {
      image.setAttribute("src", mediaSrc(asset.id));
    }
  }
  return root.innerHTML;
}

export function dataUrlBytes(asset: MediaAsset) {
  return dataUrlToBytes(asset.dataUrl);
}

export function safeMediaName(name: string) {
  const cleaned = name
    .trim()
    .replace(/[\\/]/g, "_")
    .replace(/[^\w.\-() ]+/g, "_")
    .replace(/\s+/g, " ");
  return cleaned || "image.png";
}

export function uniqueAnkiMediaName(asset: MediaAsset, usedNames: Set<string>) {
  const baseName = safeMediaName(asset.name);
  const extensionMatch = baseName.match(/(\.[^.]+)$/);
  const originalExtension = extensionMatch?.[1] ?? "";
  const extension = originalExtension && isSupportedImageName(baseName) ? originalExtension : extensionFromMime(asset.mime);
  const stem = extensionMatch ? baseName.slice(0, -originalExtension.length) : baseName;
  let candidate = `${stem}${extension}`;
  let index = 2;

  while (usedNames.has(candidate)) {
    candidate = `${stem}-${index}${extension}`;
    index += 1;
  }

  usedNames.add(candidate);
  return candidate;
}

function extensionFromMime(mime: string) {
  if (mime === "image/webp") return ".webp";
  if (mime === "image/gif") return ".gif";
  if (mime === "image/png") return ".png";
  return ".jpg";
}

function hasFileExtension(name: string) {
  return /\.[A-Za-z0-9]+$/.test(name);
}
