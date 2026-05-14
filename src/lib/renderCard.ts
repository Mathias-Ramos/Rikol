import type { Card, MediaAsset } from "../types";
import { sanitizeHtml } from "./sanitize";

const CARD_ACCENT = "#69b7ff";

export interface RenderedCard {
  recto: string;
  verso: string;
  details: string;
  answer: string;
  accent: string;
}

export function renderCard(card: Card, media: MediaAsset[]): RenderedCard {
  const recto = replaceMediaTokens(card.recto, media);
  const verso = replaceMediaTokens(card.verso, media);
  const details = replaceMediaTokens(card.details, media);

  return {
    recto: sanitizeHtml(copyBlock(recto)),
    verso: sanitizeHtml(copyBlock(verso, "card-copy card-term")),
    details: sanitizeHtml(detailBlock(details)),
    answer: sanitizeHtml(`${copyBlock(verso, "card-copy card-term")}${detailBlock(details)}`),
    accent: CARD_ACCENT
  };
}

export function getPlainCard(card: Card) {
  return {
    recto: card.recto,
    verso: card.verso,
    details: card.details
  };
}

function replaceMediaTokens(value: string, media: MediaAsset[]) {
  return value.replace(/media:\/\/([A-Za-z0-9_-]+)/g, (_, id) => {
    return media.find((asset) => asset.id === id)?.dataUrl ?? "";
  });
}

function copyBlock(value: string, className = "card-copy") {
  return value ? `<div class="${className}">${value}</div>` : "";
}

function detailBlock(value: string) {
  return value ? `<div class="answer-detail card-details">${value}</div>` : "";
}
