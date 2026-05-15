import type { AnswerMode, Card } from "../types";
import { stripHtml } from "./utils";

export const MAX_TYPED_ANSWER_VERSO_CHARS = 50;

export function getEffectiveAnswerMode(card: Card, storedAnswerMode: AnswerMode): AnswerMode {
  if (card.forceTypedAnswer) {
    return "type";
  }

  // Count visible answer characters so rich-text tags do not make short answers look long.
  if (stripHtml(card.verso).length > MAX_TYPED_ANSWER_VERSO_CHARS) {
    return "reveal";
  }

  return storedAnswerMode;
}
