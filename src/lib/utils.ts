export const nowIso = () => new Date().toISOString();

export function uid(prefix = "id") {
  const random = crypto.getRandomValues(new Uint32Array(2));
  return `${prefix}_${Date.now().toString(36)}_${Array.from(random)
    .map((part) => part.toString(36))
    .join("")}`;
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function addMinutes(date: Date, minutes: number) {
  const next = new Date(date);
  next.setMinutes(next.getMinutes() + minutes);
  return next;
}

export function startOfLocalDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

export function sameLocalDay(a: Date, b: Date) {
  return startOfLocalDay(a).getTime() === startOfLocalDay(b).getTime();
}

export function yesterdayOf(date: Date) {
  const next = startOfLocalDay(date);
  next.setDate(next.getDate() - 1);
  return next;
}

export function stripHtml(value: string) {
  const doc = new DOMParser().parseFromString(`<div>${value}</div>`, "text/html");
  return (doc.body.textContent ?? "").replace(/\s+/g, " ").trim();
}

export function dataUrlToBytes(dataUrl: string) {
  const [, meta = "", encoded = ""] = dataUrl.match(/^data:([^;]+);base64,(.*)$/) ?? [];
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return { mime: meta, bytes };
}

export function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

export function textChecksum(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
