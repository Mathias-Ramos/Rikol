import type { Card, Deck } from "../types";
import { nowIso, uid } from "../lib/utils";

export function createDemoData() {
  const createdAt = nowIso();
  const decks: Deck[] = [
    {
      id: uid("deck"),
      name: "Code sparks",
      description: "Small programming recall cards.",
      color: "#1f2933",
      tags: ["code", "demo"],
      dailyNewLimit: 8,
      dailyReviewLimit: 40,
      createdAt,
      updatedAt: createdAt
    },
    {
      id: uid("deck"),
      name: "World capitals",
      description: "Flags, countries, and capitals.",
      color: "#59d8a1",
      tags: ["geography", "demo"],
      dailyNewLimit: 8,
      dailyReviewLimit: 40,
      createdAt,
      updatedAt: createdAt
    },
    {
      id: uid("deck"),
      name: "Memory basics",
      description: "Active recall and spaced repetition.",
      color: "#ffc857",
      tags: ["learning", "demo"],
      dailyNewLimit: 6,
      dailyReviewLimit: 30,
      createdAt,
      updatedAt: createdAt
    },
    {
      id: uid("deck"),
      name: "SQL essentials",
      description: "Core query clauses, joins, and constraints.",
      color: "#2f80ed",
      tags: ["sql", "demo"],
      dailyNewLimit: 10,
      dailyReviewLimit: 50,
      createdAt,
      updatedAt: createdAt
    }
  ];

  const [codeDeck, geoDeck, memoryDeck, sqlDeck] = decks;
  const cards: Card[] = [
    {
      id: uid("card"),
      deckId: codeDeck.id,
      recto: "What does this TypeScript utility do?\n\nconst names = users.map((user) => user.name);",
      verso: "It creates a new array containing each user's name.",
      details: "Language: TypeScript",
      tags: ["arrays"],
      suspended: false,
      forceTypedAnswer: false,
      source: { type: "demo" },
      createdAt,
      updatedAt: createdAt
    },
    {
      id: uid("card"),
      deckId: codeDeck.id,
      recto: "Why use `const` here?\n\nconst total = prices.reduce((sum, price) => sum + price, 0);",
      verso: "`total` is not reassigned. `const` protects that binding.",
      details: "Language: JavaScript",
      tags: ["javascript"],
      suspended: false,
      forceTypedAnswer: false,
      source: { type: "demo" },
      createdAt,
      updatedAt: createdAt
    },
    {
      id: uid("card"),
      deckId: geoDeck.id,
      recto: "Canada",
      verso: "Ottawa",
      details: "",
      tags: ["capital"],
      suspended: false,
      forceTypedAnswer: false,
      source: { type: "demo" },
      createdAt,
      updatedAt: createdAt
    },
    {
      id: uid("card"),
      deckId: geoDeck.id,
      recto: "Kenya",
      verso: "Nairobi",
      details: "",
      tags: ["capital"],
      suspended: false,
      forceTypedAnswer: false,
      source: { type: "demo" },
      createdAt,
      updatedAt: createdAt
    },
    {
      id: uid("card"),
      deckId: memoryDeck.id,
      recto: "Spaced repetition schedules review near the moment you are likely to ____.",
      verso: "forget",
      details: "",
      tags: ["method"],
      suspended: false,
      forceTypedAnswer: false,
      source: { type: "demo" },
      createdAt,
      updatedAt: createdAt
    },
    {
      id: uid("card"),
      deckId: memoryDeck.id,
      recto: "What is active recall?",
      verso: "Trying to retrieve information from memory before seeing the answer.",
      details: "",
      tags: ["method"],
      suspended: false,
      forceTypedAnswer: false,
      source: { type: "demo" },
      createdAt,
      updatedAt: createdAt
    },
    {
      id: uid("card"),
      deckId: sqlDeck.id,
      recto: "Which SQL clause chooses columns to return?",
      verso: "SELECT",
      details: "Example: SELECT name, email FROM users;",
      tags: ["sql", "query"],
      suspended: false,
      forceTypedAnswer: false,
      source: { type: "demo" },
      createdAt,
      updatedAt: createdAt
    },
    {
      id: uid("card"),
      deckId: sqlDeck.id,
      recto: "Which SQL clause names the table to read from?",
      verso: "FROM",
      details: "Example: SELECT name FROM users;",
      tags: ["sql", "query"],
      suspended: false,
      forceTypedAnswer: false,
      source: { type: "demo" },
      createdAt,
      updatedAt: createdAt
    },
    {
      id: uid("card"),
      deckId: sqlDeck.id,
      recto: "Which SQL clause filters rows before grouping?",
      verso: "WHERE",
      details: "Example: SELECT * FROM orders WHERE status = 'paid';",
      tags: ["sql", "filtering"],
      suspended: false,
      forceTypedAnswer: false,
      source: { type: "demo" },
      createdAt,
      updatedAt: createdAt
    },
    {
      id: uid("card"),
      deckId: sqlDeck.id,
      recto: "Which SQL clause sorts result rows?",
      verso: "ORDER BY",
      details: "Example: SELECT name FROM users ORDER BY created_at DESC;",
      tags: ["sql", "sorting"],
      suspended: false,
      forceTypedAnswer: false,
      source: { type: "demo" },
      createdAt,
      updatedAt: createdAt
    },
    {
      id: uid("card"),
      deckId: sqlDeck.id,
      recto: "Which aggregate counts rows?",
      verso: "COUNT(*)",
      details: "Example: SELECT COUNT(*) FROM users;",
      tags: ["sql", "aggregate"],
      suspended: false,
      forceTypedAnswer: false,
      source: { type: "demo" },
      createdAt,
      updatedAt: createdAt
    },
    {
      id: uid("card"),
      deckId: sqlDeck.id,
      recto: "Which clause filters grouped rows?",
      verso: "HAVING",
      details: "WHERE filters before grouping. HAVING filters after GROUP BY.",
      tags: ["sql", "grouping"],
      suspended: false,
      forceTypedAnswer: false,
      source: { type: "demo" },
      createdAt,
      updatedAt: createdAt
    },
    {
      id: uid("card"),
      deckId: sqlDeck.id,
      recto: "What does INNER JOIN return?",
      verso: "matching rows",
      details: "It keeps rows with matches in both joined tables.",
      tags: ["sql", "joins"],
      suspended: false,
      forceTypedAnswer: false,
      source: { type: "demo" },
      createdAt,
      updatedAt: createdAt
    },
    {
      id: uid("card"),
      deckId: sqlDeck.id,
      recto: "Which constraint uniquely identifies each row?",
      verso: "PRIMARY KEY",
      details: "A primary key value should be unique and not null.",
      tags: ["sql", "constraints"],
      suspended: false,
      forceTypedAnswer: false,
      source: { type: "demo" },
      createdAt,
      updatedAt: createdAt
    }
  ];

  return { decks, cards };
}
