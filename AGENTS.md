# Project overview

Project description in 1-2 paragraphs:

Rikol is a mobile-first, local-first spaced repetition web app. It helps users create decks, review simple recto/verso flashcards with an Anki-like flow, import/export decks, personalize profile name, and track progress through XP, levels, badges, and streaks.

Data stays in browser IndexedDB. App works as PWA shell and supports manual JSON backup, CSV exchange, and best-effort Anki `.apkg` import/export. Cards store Recto, Verso, and optional Details with bold, italic, and inline code rich text; review mode alternates between reveal and typed answer after each completed review, with long Verso answers defaulting to reveal-only unless card forces typed answers.

# Tech Stack

- React 18
- Vite 5
- TypeScript
- Tailwind CSS
- IndexedDB
- Lucide React icons
- JSZip for package import/export
- sql.js for Anki SQLite package parsing/building
- zstddec for modern Anki compressed collections
- Vitest and Testing Library
- Playwright

# File structure

Current "Directory Tree" with short description of each folder and files (5-30 words):

```
.
├── AGENTS.md - Project memory, coding rules, communication preferences, and current app overview.
├── README.md - Short project summary.
├── index.html - Vite HTML entrypoint with manifest and icon links.
├── package.json - Scripts and dependencies for app, tests, build, and e2e.
├── playwright.config.ts - Desktop and mobile Chromium e2e test setup.
├── public/ - PWA manifest, service worker, and app icon assets.
├── src/App.tsx - Main Rikol shell, profile/settings screens, deck browser/deletion, rich text forms, review flow, XP feedback, and actions.
├── src/index.css - Tailwind entry plus responsive app, profile, rich text editor, deck browsing, XP animation, and character CSS.
├── src/main.tsx - React root and production service worker registration.
├── src/types.ts - Core Deck, Card, Media, Review, Import, answer mode, and settings types.
├── src/data/ - Demo deck and simple recto/verso/detail card seed data.
├── src/lib/ - Storage migration, scheduler, answer-mode gating, rewards, rich text, sanitizing, rendering, and import/export logic.
├── src/test/ - Vitest setup.
└── tests/e2e/ - Playwright onboarding, profile, navigation, deck deletion, rich text card form, flip, and review tests.
```

# Rules

- Keep Rikol local-first. Do not add backend, accounts, sync, notifications, audio/video, or AI without explicit request.
- Keep UI mobile-first. Check 390px mobile and desktop before finishing visual changes.
- Sanitize imported HTML. Never render imported scripts or unsafe attributes.
- Keep Anki `.apkg` compatibility best effort. Warn clearly when features are skipped or mapped.
- Keep generated build/test artifacts out of git.

# Coding Conventions

- Add regular comments in the code for easier understanding
- Prefer small, focused TypeScript modules under `src/lib`.
- Keep user-facing copy short and direct.
- Use existing Tailwind/CSS patterns before adding new visual systems.

# Communication style

- Speak english by default.
- When talking, drop: articles (a/an/the), filler (just/really/basically/actually/simply), pleasantries (sure/certainly/of course/happy to), hedging. Fragments OK. Short synonyms (big not extensive, fix not "implement a solution for"). Technical terms exact. Code blocks unchanged. Errors quoted exact. Skip unecessary words, keep responses consise: I do not need lengthy explanations unless I ask.
- General pattern: [thing] [action] [reason]. [next step]

# Memory

After finishing a task, keep this file updated based on modifications applied or new information collected. 

- **Project overview**: description of the project, summarized in 1-2 paragraphs. No fluff.
- **Tech Stack**: complete tech stack used
- **Rules**: rules you should never break
- **Coding conventions**
- **File structure**: current "Directory Tree" with short description of each folder and files (5-30 words)

# Context and Background

Here is information about project history, decisions already made, or constraints.

- Mobile navigation uses a hideable left side menu, not a bottom nav.
- Profile menu item replaces old Stats menu item.
- Profile name is stored in settings and displays at top of side menu; fallback remains Rikol.
- Profile level bar uses reward level thresholds, with current level left and next level right.
- Profile badges use two tabs: Completed and Remaining.
- Completed badges display original badge target description, not generic won text.
- Settings menu item contains Local data, import/export, and clear local data actions.
- Import/export live in Settings; there is no separate Import menu item.
- Clear local data opens confirmation dialog and requires typing `delete` before deletion.
- Create card menu item stays at bottom of side menu, separated from other sections by divider.
- Mobile review actions stay fixed near bottom for easier thumb access.
- Review card deck name stays top-center. Due count is hidden from global header.
- Answer reveal shows answer only. Review card uses CSS 3D flip between Recto and Verso during reveal and grading toggle.
- Decks menu creates decks from top-right New deck button. Color picker is compact round control shown only in deck creation form.
- Create card view labels first-deck helper as Create deck, not Deck setup.
- Decks menu uses focused screens: deck library, deck card list, then card editor. Back arrows return one level.
- Deck detail header includes small plus icon that opens new-card form with current deck preselected.
- Deck detail header includes small trash icon. Deleting deck requires typing `delete` and removes deck cards plus review history.
- Card create/edit form does not show card tags. Existing/imported tags remain stored for import/export compatibility.
- Card edit form includes button to flip Recto and Verso while preserving rich text.
- Form dropdowns use custom in-app menu controls so options match current UI and open below fields.
- Cards use simple Recto, Verso, and optional Details fields. Details render smaller below Verso during review.
- Card create/edit fields support toggleable inline Bold, Italic, and Code formatting. Rich text stores sanitized HTML fragments in existing card strings.
- Rich text editor and review card base text use lighter weight so Bold has visible contrast.
- Templates were removed from app state and UI. Storage migrates legacy template cards into simple cards.
- Review mode is stored per review state as `answerMode: "reveal" | "type"` and toggles after every grade, regardless grade value.
- Type-mode review requires typed input before Reveal. Text is not auto-graded; user still chooses Again, Hard, Good, or Easy.
- Cards with plain-text Verso longer than 50 characters use reveal-only review unless `forceTypedAnswer` is true.
- Card create/edit form includes Require typed answer checkbox; forced cards always show typed input, including long answers and first review.
- Review grading awards XP as `again +1`, `hard +2`, `good +3`, and `easy +4`; each grade shows quick `+N XP` animation above mobile review actions.
- Review grading buttons (Again, Hard, Good, Easy) stay on one row.
- Review grading buttons show compact next-due timing below each option.
- CSV export uses `deck,recto,verso,details,tags`; CSV import still accepts legacy `front/back` columns.
- APKG import accepts raw SQLite or zstd-compressed `collection.anki21`, validates Anki tables, then falls back to `collection.anki2`.
- APKG import preserves multiple Anki card templates per note as distinct study directions and maps rendered template prompts/answers into simple cards.
- APKG import handles Anki Cloze generated card ords from one template, hiding active deletions on Recto and using revealed deletions as Verso.
