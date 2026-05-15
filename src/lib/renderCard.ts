import type { Card, MediaAsset } from "../types";
import { replaceMediaSources } from "./media";
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
  const mediaById = new Map(media.map((asset) => [asset.id, asset]));
  const recto = replaceMediaSources(card.recto, mediaById);
  const verso = replaceMediaSources(card.verso, mediaById);
  const details = replaceMediaSources(card.details, mediaById);

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

function copyBlock(value: string, className = "card-copy") {
  return value ? `<div class="${className}">${value}</div>` : "";
}

function detailBlock(value: string) {
  return value ? `<div class="answer-detail card-details">${value}</div>` : "";
}
