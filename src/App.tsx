import {
  ArrowLeft,
  BadgeCheck,
  Bold,
  Boxes,
  Check,
  ChevronDown,
  ChevronRight,
  Code2,
  Download,
  FileUp,
  FlipHorizontal2,
  Flame,
  Home,
  Italic,
  Library,
  Menu,
  Plus,
  Search,
  Settings as SettingsIcon,
  Sparkles,
  Trash2,
  Undo2,
  Upload,
  UserRound,
  X
} from "lucide-react";
import { ClipboardEvent, ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { createDemoData } from "./data/demo";
import type { AppData, Badge, Card, Deck, Grade, ImportBundle } from "./types";
import { getEffectiveAnswerMode } from "./lib/answerMode";
import {
  exportDeckApkg,
  exportDeckCsv,
  exportJsonBackup,
  importApkg,
  importCsv,
  importJsonBackup,
  mergeImport
} from "./lib/importExport";
import { BADGE_TARGETS, applyReviewReward, getLevelProgress, manualBadge } from "./lib/rewards";
import { renderCard } from "./lib/renderCard";
import { normalizeRichTextHtml } from "./lib/richText";
import {
  createInitialReviewState,
  createReviewLog,
  countReviewsToday,
  getDueCards,
  scheduleReview
} from "./lib/scheduler";
import { clearAppData, createEmptyAppData, loadAppData, saveAppData } from "./lib/storage";
import { nowIso, stripHtml, uid } from "./lib/utils";

type View = "review" | "decks" | "create" | "profile" | "settings";
type NavItem = { view: View; label: string; icon: typeof Home };

interface LastReviewAction {
  cardId: string;
  previousStateId: string;
  previousState: ReturnType<typeof createInitialReviewState>;
  logId: string;
  previousSettings: AppData["settings"];
}

interface XpBurstState {
  id: string;
  amount: number;
}

const navItems: NavItem[] = [
  { view: "review", label: "Home", icon: Home },
  { view: "decks", label: "Decks", icon: Library },
  { view: "profile", label: "Profile", icon: UserRound },
  { view: "settings", label: "Settings", icon: SettingsIcon }
];

const createNavItem: NavItem = { view: "create", label: "Create", icon: Plus };

const REVIEW_GRADES: Grade[] = ["again", "hard", "good", "easy"];

type RichTextFormat = "strong" | "em" | "code";

const RICH_TEXT_TOOLS: Array<{ format: RichTextFormat; label: string; icon: typeof Bold }> = [
  { format: "strong", label: "Bold", icon: Bold },
  { format: "em", label: "Italic", icon: Italic },
  { format: "code", label: "Code", icon: Code2 }
];

function getBadgeDescription(badge: Badge) {
  return (
    BADGE_TARGETS.find((target) => target.id === badge.id || target.label === badge.label)?.description ??
    "Completed."
  );
}

export default function App() {
  const [data, setData] = useState<AppData>(createEmptyAppData());
  const [ready, setReady] = useState(false);
  const [view, setView] = useState<View>("review");
  const [navOpen, setNavOpen] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [lastAction, setLastAction] = useState<LastReviewAction | null>(null);
  const [xpBurst, setXpBurst] = useState<XpBurstState | null>(null);

  useEffect(() => {
    loadAppData()
      .then((loaded) => setData(loaded))
      .finally(() => setReady(true));
  }, []);

  useEffect(() => {
    if (!ready) {
      return;
    }

    const handle = window.setTimeout(() => {
      saveAppData(data).catch(() => undefined);
    }, 250);

    return () => window.clearTimeout(handle);
  }, [data, ready]);

  useEffect(() => {
    if (!xpBurst) {
      return;
    }

    const handle = window.setTimeout(() => setXpBurst(null), 900);

    return () => window.clearTimeout(handle);
  }, [xpBurst?.id]);

  const dueCards = useMemo(
    () => getDueCards(data.cards, data.reviewStates, data.decks),
    [data.cards, data.reviewStates, data.decks]
  );
  const currentCard = dueCards[0];
  const reviewsToday = countReviewsToday(data.reviewLogs);
  const totalCards = data.cards.length;
  const answeringCard = view === "review" && Boolean(currentCard);

  function updateData(mutator: (draft: AppData) => AppData) {
    setData((current) => mutator(current));
  }

  function completeOnboarding(nextView: View) {
    updateData((current) => ({
      ...current,
      settings: { ...current.settings, onboarded: true }
    }));
    setView(nextView);
  }

  function loadDemoDecks() {
    const demo = createDemoData();
    updateData((current) => ({
      ...current,
      decks: [...current.decks, ...demo.decks],
      cards: [...current.cards, ...demo.cards],
      reviewStates: [
        ...current.reviewStates,
        ...demo.cards.map((card) => createInitialReviewState(card.id, card.createdAt))
      ],
      settings: {
        ...current.settings,
        onboarded: true,
        seededDemo: true,
        badges: current.settings.badges.some((badge) => badge.label === "Demo loaded")
          ? current.settings.badges
          : [...current.settings.badges, manualBadge("Demo loaded")]
      }
    }));
    setView("review");
  }

  function gradeCard(card: Card, grade: Grade) {
    const previous =
      data.reviewStates.find((state) => state.cardId === card.id) ??
      createInitialReviewState(card.id, card.createdAt);
    const next = scheduleReview(previous, grade);
    const log = createReviewLog(card, previous, next, grade);

    updateData((current) => {
      const nextLogs = [log, ...current.reviewLogs];
      return {
        ...current,
        reviewStates: upsertByCardId(current.reviewStates, next),
        reviewLogs: nextLogs,
        settings: applyReviewReward(current.settings, nextLogs, grade)
      };
    });

    setLastAction({
      cardId: card.id,
      previousStateId: previous.cardId,
      previousState: previous,
      logId: log.id,
      previousSettings: data.settings
    });
    setXpBurst({ id: log.id, amount: log.xp });
    setRevealed(false);
  }

  function undoLastGrade() {
    if (!lastAction) {
      return;
    }

    updateData((current) => ({
      ...current,
      reviewStates: upsertByCardId(current.reviewStates, lastAction.previousState),
      reviewLogs: current.reviewLogs.filter((log) => log.id !== lastAction.logId),
      settings: lastAction.previousSettings
    }));
    setLastAction(null);
    setXpBurst(null);
  }

  function addDeck(deck: Omit<Deck, "id" | "createdAt" | "updatedAt">) {
    const createdAt = nowIso();
    updateData((current) => ({
      ...current,
      decks: [
        ...current.decks,
        {
          ...deck,
          id: uid("deck"),
          createdAt,
          updatedAt: createdAt
        }
      ],
      settings: {
        ...current.settings,
        badges: current.settings.badges.some((badge) => badge.label === "Deck maker")
          ? current.settings.badges
          : [...current.settings.badges, manualBadge("Deck maker")]
      }
    }));
  }

  function saveCard(cardInput: Omit<Card, "id" | "createdAt" | "updatedAt">, existingId?: string) {
    const timestamp = nowIso();
    updateData((current) => {
      if (existingId) {
        return {
          ...current,
          cards: current.cards.map((card) =>
            card.id === existingId ? { ...card, ...cardInput, updatedAt: timestamp } : card
          )
        };
      }

      const card: Card = {
        ...cardInput,
        id: uid("card"),
        createdAt: timestamp,
        updatedAt: timestamp
      };
      return {
        ...current,
        cards: [...current.cards, card],
        reviewStates: [...current.reviewStates, createInitialReviewState(card.id, card.createdAt)],
        settings: {
          ...current.settings,
          badges: current.settings.badges.some((badge) => badge.label === "Card creator")
            ? current.settings.badges
            : [...current.settings.badges, manualBadge("Card creator")]
        }
      };
    });
  }

  function deleteCard(cardId: string) {
    updateData((current) => ({
      ...current,
      cards: current.cards.filter((card) => card.id !== cardId),
      reviewStates: current.reviewStates.filter((state) => state.cardId !== cardId),
      reviewLogs: current.reviewLogs.filter((log) => log.cardId !== cardId)
    }));
  }

  function deleteDeck(deckId: string) {
    const deletedCardIds = new Set(data.cards.filter((card) => card.deckId === deckId).map((card) => card.id));

    updateData((current) => {
      const cardIds = new Set(current.cards.filter((card) => card.deckId === deckId).map((card) => card.id));

      // Deck deletion removes cards and their review history together.
      return {
        ...current,
        decks: current.decks.filter((deck) => deck.id !== deckId),
        cards: current.cards.filter((card) => card.deckId !== deckId),
        reviewStates: current.reviewStates.filter((state) => !cardIds.has(state.cardId)),
        reviewLogs: current.reviewLogs.filter((log) => log.deckId !== deckId && !cardIds.has(log.cardId))
      };
    });

    if (lastAction && deletedCardIds.has(lastAction.cardId)) {
      setLastAction(null);
      setXpBurst(null);
    }
  }

  function mergeBundle(bundle: ImportBundle) {
    updateData((current) => {
      const merged = mergeImport(current, bundle);
      return {
        ...merged,
        settings: {
          ...merged.settings,
          badges: merged.settings.badges.some((badge) => badge.label === "Importer")
            ? merged.settings.badges
            : [...merged.settings.badges, manualBadge("Importer")]
        }
      };
    });
  }

  async function resetLocalData() {
    await clearAppData();
    setData(createEmptyAppData());
    setView("review");
  }

  function updateProfileName(userName: string) {
    updateData((current) => ({
      ...current,
      settings: {
        ...current.settings,
        userName
      }
    }));
  }

  if (!ready) {
    return (
      <main className="loading-screen">
        <Companion />
        <p>Loading Rikol...</p>
      </main>
    );
  }

  if (!data.settings.onboarded) {
    return (
      <Onboarding
        onDemo={loadDemoDecks}
        onCreate={() => completeOnboarding("create")}
        onImport={() => completeOnboarding("settings")}
      />
    );
  }

  return (
    <div className="app-shell">
      {navOpen && <button className="nav-scrim" aria-label="Close menu" onClick={() => setNavOpen(false)} />}

      <aside className={`side-nav ${navOpen ? "open" : ""}`} aria-label="Main menu">
        <div className="side-nav-head">
          <BrandBlock
            name={data.settings.userName}
            level={data.settings.level}
            streak={data.settings.streak.current}
          />
          <button className="icon-button nav-close" aria-label="Close menu" onClick={() => setNavOpen(false)}>
            <X size={18} />
          </button>
        </div>
        <NavList
          view={view}
          setView={(nextView) => {
            setView(nextView);
            setNavOpen(false);
          }}
        />
      </aside>

      <main className="main-panel">
        <header className="top-bar">
          <button
            className="icon-button menu-button"
            aria-label="Open menu"
            aria-expanded={navOpen}
            onClick={() => setNavOpen(true)}
          >
            <Menu size={20} />
          </button>
          <div className="top-title" aria-hidden="true" />
          <div className="quick-stats">
            {!answeringCard && (
              <>
                <StatPill icon={Flame} label={`${data.settings.streak.current} day`} />
                <StatPill icon={Sparkles} label={`Lv ${data.settings.level}`} />
              </>
            )}
          </div>
        </header>

        {view === "review" && (
          <>
            <ReviewView
              card={currentCard}
              data={data}
              revealed={revealed}
              setRevealed={setRevealed}
              gradeCard={gradeCard}
              undoLastGrade={undoLastGrade}
              canUndo={Boolean(lastAction)}
            />
            <XpBurst burst={xpBurst} />
          </>
        )}
        {view === "decks" && (
          <DecksView
            data={data}
            addDeck={addDeck}
            deleteCard={deleteCard}
            deleteDeck={deleteDeck}
            saveCard={saveCard}
          />
        )}
        {view === "create" && (
          <CreateView
            data={data}
            addDeck={addDeck}
            saveCard={saveCard}
          />
        )}
        {view === "profile" && (
          <ProfileView
            data={data}
            totalCards={totalCards}
            reviewsToday={reviewsToday}
            updateProfileName={updateProfileName}
          />
        )}
        {view === "settings" && (
          <SettingsView
            data={data}
            setData={setData}
            mergeBundle={mergeBundle}
            resetLocalData={resetLocalData}
          />
        )}
      </main>

    </div>
  );
}

function Onboarding({
  onDemo,
  onCreate,
  onImport
}: {
  onDemo: () => void;
  onCreate: () => void;
  onImport: () => void;
}) {
  return (
    <main className="onboarding">
      <section className="onboarding-card">
        <Companion />
        <p className="eyebrow">Rikol</p>
        <h1>Build memory loops that feel light.</h1>
        <p className="muted">
          Create cards, import decks, review with spaced repetition, and keep progress on device.
        </p>
        <div className="onboarding-actions">
          <button className="primary-action" onClick={onDemo}>
            <Sparkles size={18} />
            Load demo decks
          </button>
          <button className="secondary-action" onClick={onCreate}>
            <Plus size={18} />
            Create first deck
          </button>
          <button className="secondary-action" onClick={onImport}>
            <FileUp size={18} />
            Import deck
          </button>
        </div>
      </section>
    </main>
  );
}

function ReviewView({
  card,
  data,
  revealed,
  setRevealed,
  gradeCard,
  undoLastGrade,
  canUndo
}: {
  card?: Card;
  data: AppData;
  revealed: boolean;
  setRevealed: (value: boolean) => void;
  gradeCard: (card: Card, grade: Grade) => void;
  undoLastGrade: () => void;
  canUndo: boolean;
}) {
  const [showingQuestion, setShowingQuestion] = useState(false);
  const [typedAnswer, setTypedAnswer] = useState("");

  useEffect(() => {
    setShowingQuestion(false);
  }, [card?.id, revealed]);

  useEffect(() => {
    setTypedAnswer("");
  }, [card?.id]);

  if (!card) {
    return (
      <section className="empty-state">
        <Companion />
        <h2>Queue clear.</h2>
        <p className="muted">Create cards or import deck. Next due cards appear here.</p>
      </section>
    );
  }

  const reviewState = data.reviewStates.find((state) => state.cardId === card.id);
  const currentReviewState = reviewState ?? createInitialReviewState(card.id, card.createdAt);
  const gradePreviewTime = new Date();
  const gradeDueLabels = REVIEW_GRADES.reduce(
    (labels, grade) => ({
      ...labels,
      [grade]: formatReviewDueLabel(scheduleReview(currentReviewState, grade, gradePreviewTime).due, gradePreviewTime)
    }),
    {} as Record<Grade, string>
  );
  const answerMode = getEffectiveAnswerMode(card, reviewState?.answerMode ?? "reveal");
  const rendered = renderCard(card, data.media);
  const deck = data.decks.find((item) => item.id === card.deckId);
  const mustTypeAnswer = answerMode === "type" && !typedAnswer.trim();

  function revealAnswer() {
    if (mustTypeAnswer) {
      return;
    }
    setRevealed(true);
  }

  function renderQuestionFace() {
    return (
      <div className="review-face-content">
        <div dangerouslySetInnerHTML={{ __html: rendered.recto }} />
        {answerMode === "type" && (
          <TypeAnswerFace value={typedAnswer} disabled={revealed} onChange={setTypedAnswer} onSubmit={revealAnswer} />
        )}
      </div>
    );
  }

  function renderAnswerFace() {
    return (
      <div className="review-face-content">
        <div dangerouslySetInnerHTML={{ __html: rendered.answer }} />
        {typedAnswer && (
          <p className="typed-answer-summary">
            <span>Your answer</span>
            <strong>{typedAnswer}</strong>
          </p>
        )}
      </div>
    );
  }

  return (
    <section className="review-grid">
      <div className="review-card" style={{ borderColor: rendered.accent }}>
        <div className="card-meta">
          <span>{deck?.name ?? "Deck"}</span>
        </div>
        <div className={`review-face ${revealed && !showingQuestion ? "is-flipped" : ""}`} key={card.id}>
          {/* Keep both sides mounted so CSS can animate between Recto and Verso. */}
          <div className="review-face-inner">
            <div className="review-face-side review-face-front" aria-hidden={revealed && !showingQuestion}>
              {renderQuestionFace()}
            </div>
            <div className="review-face-side review-face-back" aria-hidden={!revealed || showingQuestion}>
              {renderAnswerFace()}
            </div>
          </div>
        </div>
      </div>

      <div className="review-actions">
        {!revealed ? (
          <div className="answer-row">
            <button className="primary-action wide" onClick={revealAnswer} disabled={mustTypeAnswer}>
              Reveal
              <ChevronRight size={18} />
            </button>
            <button
              className="icon-button undo-button"
              aria-label="Undo last grade"
              title="Undo last grade"
              onClick={undoLastGrade}
              disabled={!canUndo}
            >
              <Undo2 size={18} />
            </button>
          </div>
        ) : (
          <>
            <div className="answer-row">
              <button className="secondary-action wide" onClick={() => setShowingQuestion((current) => !current)}>
                <FlipHorizontal2 size={18} />
                {showingQuestion ? "Verso" : "Recto"}
              </button>
              <button
                className="icon-button undo-button"
                aria-label="Undo last grade"
                title="Undo last grade"
                onClick={undoLastGrade}
                disabled={!canUndo}
              >
                <Undo2 size={18} />
              </button>
            </div>
            <div className="grade-grid">
              {REVIEW_GRADES.map((grade) => (
                <button
                  key={grade}
                  className={`grade-button ${grade}`}
                  aria-label={grade}
                  aria-describedby={`grade-due-${grade}`}
                  onClick={() => gradeCard(card, grade)}
                >
                  <span>{grade}</span>
                  <small id={`grade-due-${grade}`}>{gradeDueLabels[grade]}</small>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function XpBurst({ burst }: { burst: XpBurstState | null }) {
  if (!burst) {
    return null;
  }

  return (
    <div key={burst.id} className="xp-burst" role="status" aria-live="polite">
      +{burst.amount} XP
    </div>
  );
}

function formatReviewDueLabel(dueIso: string, now: Date) {
  const due = new Date(dueIso);
  const minutes = Math.max(1, Math.round((due.getTime() - now.getTime()) / 60000));

  if (minutes < 60) {
    return `${minutes} min`;
  }

  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return `${hours} hr`;
  }

  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"}`;
}

function TypeAnswerFace({
  value,
  disabled,
  onChange,
  onSubmit
}: {
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
}) {
  return (
    <div className="type-answer-line">
      <input
        aria-label="Typed answer"
        className="type-answer-input"
        placeholder="Type answer"
        value={value}
        disabled={disabled}
        autoCapitalize="off"
        autoComplete="off"
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            onSubmit();
          }
        }}
      />
    </div>
  );
}

function DecksView({
  data,
  addDeck,
  deleteCard,
  deleteDeck,
  saveCard
}: {
  data: AppData;
  addDeck: (deck: Omit<Deck, "id" | "createdAt" | "updatedAt">) => void;
  deleteCard: (id: string) => void;
  deleteDeck: (id: string) => void;
  saveCard: (card: Omit<Card, "id" | "createdAt" | "updatedAt">, existingId?: string) => void;
}) {
  const [deckMode, setDeckMode] = useState<"library" | "deckCards" | "cardEditor" | "newCard">("library");
  const [query, setQuery] = useState("");
  const [selectedDeckId, setSelectedDeckId] = useState("");
  const [editingCard, setEditingCard] = useState<Card | null>(null);
  const [creatingDeck, setCreatingDeck] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const deleteConfirmInputRef = useRef<HTMLInputElement>(null);
  const selectedDeck = data.decks.find((deck) => deck.id === selectedDeckId);
  const activeEditingCard = data.cards.find((card) => card.id === editingCard?.id) ?? editingCard;
  const normalized = query.trim().toLowerCase();
  const decks = data.decks.filter((deck) => `${deck.name} ${deck.tags.join(" ")}`.toLowerCase().includes(normalized));
  const cards = data.cards.filter((card) => card.deckId === selectedDeck?.id);
  const canDeleteDeck = deleteConfirmText.trim() === "delete";

  useEffect(() => {
    if (deckMode === "library") {
      return;
    }
    if (!selectedDeck) {
      setDeckMode("library");
      setSelectedDeckId("");
      setEditingCard(null);
    }
  }, [deckMode, selectedDeck]);

  useEffect(() => {
    if (deckMode !== "cardEditor" || !editingCard) {
      return;
    }
    if (!data.cards.some((card) => card.id === editingCard.id)) {
      setDeckMode("deckCards");
      setEditingCard(null);
    }
  }, [data.cards, deckMode, editingCard]);

  useEffect(() => {
    if (deleteConfirmOpen) {
      deleteConfirmInputRef.current?.focus();
    }
  }, [deleteConfirmOpen]);

  function closeDeleteConfirm() {
    setDeleteConfirmOpen(false);
    setDeleteConfirmText("");
  }

  function confirmDeleteDeck() {
    if (!selectedDeck || !canDeleteDeck) {
      return;
    }

    deleteDeck(selectedDeck.id);
    closeDeleteConfirm();
    setSelectedDeckId("");
    setEditingCard(null);
    setDeckMode("library");
  }

  if (deckMode === "deckCards" && selectedDeck) {
    return (
      <section className="deck-screen">
        <div className="panel">
          <div className="screen-heading">
            <button
              className="icon-button"
              onClick={() => {
                setDeckMode("library");
                setSelectedDeckId("");
              }}
              aria-label="Back to decks"
            >
              <ArrowLeft size={18} />
            </button>
            <div>
              <h2>{selectedDeck.name}</h2>
              <p className="muted">{cards.length} cards</p>
            </div>
            <div className="screen-actions">
              <button
                className="icon-button danger"
                onClick={() => setDeleteConfirmOpen(true)}
                aria-label="Delete deck"
                title="Delete deck"
              >
                <Trash2 size={18} />
              </button>
              <button
                className="icon-button"
                onClick={() => {
                  setEditingCard(null);
                  setDeckMode("newCard");
                }}
                aria-label="Add card"
                title="Add card"
              >
                <Plus size={18} />
              </button>
            </div>
          </div>
          {selectedDeck.description && <p className="muted deck-description">{selectedDeck.description}</p>}
          <div className="deck-card-list">
            {cards.length ? (
              cards.map((card) => {
                const question = getCardQuestionPreview(card);
                return (
                  <button
                    key={card.id}
                    type="button"
                    className={`deck-card-row ${card.suspended ? "suspended" : ""}`}
                    onClick={() => {
                      setEditingCard(card);
                      setDeckMode("cardEditor");
                    }}
                  >
                    <span className="deck-card-question">{question}</span>
                    <ChevronRight size={18} aria-hidden="true" />
                  </button>
                );
              })
            ) : (
              <div className="empty-state compact">
                <Boxes />
                <p>No cards yet.</p>
              </div>
            )}
          </div>
        </div>
        {deleteConfirmOpen && (
          <div className="modal-scrim" role="presentation" onMouseDown={closeDeleteConfirm}>
            <section
              className="confirm-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="delete-deck-title"
              onMouseDown={(event) => event.stopPropagation()}
            >
              <div className="panel-heading">
                <h2 id="delete-deck-title">Delete {selectedDeck.name}?</h2>
                <Trash2 size={18} />
              </div>
              <p className="muted">
                This removes {cards.length} {cards.length === 1 ? "card" : "cards"} and their review history.
              </p>
              <label className="field-label">
                Type delete to confirm
                <input
                  ref={deleteConfirmInputRef}
                  value={deleteConfirmText}
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  onChange={(event) => setDeleteConfirmText(event.target.value)}
                />
              </label>
              <div className="confirm-actions">
                <button type="button" className="secondary-action" onClick={closeDeleteConfirm}>
                  Cancel
                </button>
                <button type="button" className="danger-action" disabled={!canDeleteDeck} onClick={confirmDeleteDeck}>
                  Delete deck
                </button>
              </div>
            </section>
          </div>
        )}
      </section>
    );
  }

  if (deckMode === "newCard" && selectedDeck) {
    return (
      <section className="deck-screen">
        <div className="panel">
          <div className="screen-heading">
            <button
              className="icon-button"
              onClick={() => {
                setDeckMode("deckCards");
                setEditingCard(null);
              }}
              aria-label="Back to cards"
            >
              <ArrowLeft size={18} />
            </button>
            <div>
              <h2>New card</h2>
              <p className="muted">{selectedDeck.name}</p>
            </div>
          </div>
          <CardForm
            data={data}
            initialDeckId={selectedDeck.id}
            onSave={(cardInput) => {
              saveCard(cardInput);
              setSelectedDeckId(cardInput.deckId);
              setEditingCard(null);
              setDeckMode("deckCards");
            }}
          />
        </div>
      </section>
    );
  }

  if (deckMode === "cardEditor" && selectedDeck && activeEditingCard) {
    return (
      <section className="deck-screen">
        <div className="panel">
          <div className="screen-heading">
            <button
              className="icon-button"
              onClick={() => {
                setDeckMode("deckCards");
                setEditingCard(null);
              }}
              aria-label="Back to cards"
            >
              <ArrowLeft size={18} />
            </button>
            <div>
              <h2>Edit card</h2>
              <p className="muted">{selectedDeck.name}</p>
            </div>
            <button
              className="icon-button danger"
              onClick={() => {
                deleteCard(activeEditingCard.id);
                setEditingCard(null);
                setDeckMode("deckCards");
              }}
              aria-label="Delete card"
              title="Delete card"
            >
              <Trash2 size={18} />
            </button>
          </div>
          <CardForm
            data={data}
            existingCard={activeEditingCard}
            onSave={(cardInput) => {
              saveCard(cardInput, activeEditingCard.id);
              setSelectedDeckId(cardInput.deckId);
              setEditingCard(null);
              setDeckMode("deckCards");
            }}
          />
        </div>
      </section>
    );
  }

  return (
    <section className="deck-screen">
      <div className="panel">
        <div className="panel-heading">
          <div>
            <h2>Deck library</h2>
            <span className="muted">{data.decks.length} decks</span>
          </div>
          <button type="button" className="secondary-action compact-action" onClick={() => setCreatingDeck((open) => !open)}>
            <Plus size={16} />
            New deck
          </button>
        </div>
        <label className="search-field">
          <Search size={18} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search decks or tags" />
        </label>
        {creatingDeck && (
          <div className="editor-drawer">
            <div className="panel-heading">
              <h3>New deck</h3>
              <button className="icon-button" onClick={() => setCreatingDeck(false)} aria-label="Close deck form">
                <X size={18} />
              </button>
            </div>
            <DeckForm
              onAdd={(deck) => {
                addDeck(deck);
                setCreatingDeck(false);
              }}
            />
          </div>
        )}
        <div className="deck-list">
          {decks.map((deck) => (
            <button
              key={deck.id}
              className="deck-row"
              onClick={() => {
                setSelectedDeckId(deck.id);
                setDeckMode("deckCards");
                setEditingCard(null);
              }}
            >
              <span className="deck-dot" style={{ background: deck.color }} />
              <span>
                <strong>{deck.name}</strong>
                <small>{data.cards.filter((card) => card.deckId === deck.id).length} cards</small>
              </span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

function CreateView({
  data,
  addDeck,
  saveCard
}: {
  data: AppData;
  addDeck: (deck: Omit<Deck, "id" | "createdAt" | "updatedAt">) => void;
  saveCard: (card: Omit<Card, "id" | "createdAt" | "updatedAt">, existingId?: string) => void;
}) {
  const [saved, setSaved] = useState(false);

  return (
    <section className="content-grid">
      <div className="panel">
        <div className="panel-heading">
          <h2>Create card</h2>
          {saved && <span className="success-chip">Saved</span>}
        </div>
        {data.decks.length ? (
          <CardForm
            data={data}
            onSave={(cardInput) => {
              saveCard(cardInput);
              setSaved(true);
              window.setTimeout(() => setSaved(false), 1600);
            }}
          />
        ) : (
          <p className="muted">Create deck first.</p>
        )}
      </div>

      {!data.decks.length && (
        <div className="panel">
          <div className="panel-heading">
            <h2>Create deck</h2>
          </div>
          <DeckForm onAdd={addDeck} />
        </div>
      )}
    </section>
  );
}

function SettingsView({
  data,
  setData,
  mergeBundle,
  resetLocalData
}: {
  data: AppData;
  setData: (data: AppData) => void;
  mergeBundle: (bundle: ImportBundle) => void;
  resetLocalData: () => Promise<void>;
}) {
  const [pending, setPending] = useState<ImportBundle | null>(null);
  const [status, setStatus] = useState("");
  const [exportDeckId, setExportDeckId] = useState(data.decks[0]?.id ?? "");
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const [clearConfirmText, setClearConfirmText] = useState("");
  const [clearingLocalData, setClearingLocalData] = useState(false);
  const clearConfirmInputRef = useRef<HTMLInputElement>(null);
  const exportDeck = data.decks.find((deck) => deck.id === exportDeckId) ?? data.decks[0];
  const canClearLocalData = clearConfirmText.trim() === "delete";

  useEffect(() => {
    if (clearConfirmOpen) {
      clearConfirmInputRef.current?.focus();
    }
  }, [clearConfirmOpen]);

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setStatus("Reading file...");
    try {
      if (/\.json$/i.test(file.name)) {
        const backup = await importJsonBackup(file);
        setData(backup);
        setStatus("Backup restored.");
        setPending(null);
      } else if (/\.csv$/i.test(file.name)) {
        setPending(await importCsv(file, data.decks, data.cards));
        setStatus("CSV ready to import.");
      } else if (/\.apkg$/i.test(file.name)) {
        setPending(await importApkg(file, data.cards));
        setStatus("Anki package ready to import.");
      } else {
        setStatus("Unsupported file type.");
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Import failed.");
    } finally {
      event.target.value = "";
    }
  }

  async function exportSelectedApkg() {
    if (!exportDeck) return;
    setStatus("Building .apkg...");
    const blob = await exportDeckApkg(exportDeck, data.cards, data);
    downloadBlob(blob, `${slug(exportDeck.name)}.apkg`);
    setStatus("APKG exported.");
  }

  function closeClearConfirm() {
    if (clearingLocalData) {
      return;
    }
    setClearConfirmOpen(false);
    setClearConfirmText("");
  }

  async function confirmClearLocalData() {
    if (!canClearLocalData || clearingLocalData) {
      return;
    }

    // Typed confirmation prevents accidental browser data loss.
    setClearingLocalData(true);
    try {
      await resetLocalData();
      setClearConfirmOpen(false);
      setClearConfirmText("");
    } catch {
      setStatus("Clear failed.");
    } finally {
      setClearingLocalData(false);
    }
  }

  return (
    <section className="content-grid">
      <div className="panel">
        <div className="panel-heading">
          <h2>Settings</h2>
          <SettingsIcon size={18} />
        </div>
        <div className="settings-box">
          <h3>Local data</h3>
          <p className="muted">Data lives in this browser. Import, export, or clear it here.</p>
          <button className="danger-action" onClick={() => setClearConfirmOpen(true)}>
            Clear local data
          </button>
        </div>
      </div>

      <div className="panel">
        <div className="panel-heading">
          <h2>Import</h2>
          <Upload size={18} />
        </div>
        <label className="file-drop">
          <FileUp size={28} />
          <span>Choose JSON, CSV, or APKG</span>
          <input type="file" accept=".json,.csv,.apkg" onChange={handleFile} />
        </label>
        {status && <p className="status-line">{status}</p>}

        {pending && (
          <div className="import-preview">
            <h3>Preview</h3>
            <div className="preview-grid">
              <StatBox label="Decks" value={pending.report.deckCount} />
              <StatBox label="Cards" value={pending.report.cardCount} />
              <StatBox label="Media" value={pending.report.mediaCount} />
              <StatBox label="Duplicates" value={pending.report.duplicateCount} />
            </div>
            <ul className="warning-list">
              {pending.report.warnings.map((warning, index) => (
                <li key={`${warning.message}_${index}`} className={warning.level}>
                  {warning.message}
                </li>
              ))}
            </ul>
            <div className="sample-list">
              {pending.report.sampleCards.map((sample, index) => (
                <article key={index}>
                  <strong>{sample.recto}</strong>
                  <p>{sample.verso}</p>
                </article>
              ))}
            </div>
            <button
              className="primary-action wide"
              onClick={() => {
                mergeBundle(pending);
                setPending(null);
                setStatus("Import saved.");
              }}
            >
              Save import
              <Check size={18} />
            </button>
          </div>
        )}
      </div>

      <div className="panel">
        <div className="panel-heading">
          <h2>Export</h2>
          <Download size={18} />
        </div>
        <button
          className="secondary-action wide"
          onClick={() => {
            downloadBlob(exportJsonBackup(data), "rikol-backup-v1.json");
            setData({ ...data, settings: { ...data.settings, lastBackupAt: nowIso() } });
          }}
        >
          Export JSON backup
        </button>
        {exportDeck && (
          <>
            <label className="field-label">
              Deck
              <DropdownSelect
                ariaLabel="Export deck"
                value={exportDeck.id}
                options={data.decks.map((deck) => ({ value: deck.id, label: deck.name }))}
                onChange={setExportDeckId}
              />
            </label>
            <button
              className="secondary-action wide"
              onClick={() => downloadBlob(exportDeckCsv(exportDeck, data.cards, data), `${slug(exportDeck.name)}.csv`)}
            >
              Export CSV
            </button>
            <button className="secondary-action wide" onClick={exportSelectedApkg}>
              Export clean APKG
            </button>
          </>
        )}
      </div>

      {clearConfirmOpen && (
        <div className="modal-scrim" role="presentation" onMouseDown={closeClearConfirm}>
          <section
            className="confirm-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="clear-local-data-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="panel-heading">
              <h2 id="clear-local-data-title">Clear local data?</h2>
              <Trash2 size={18} />
            </div>
            <p className="muted">
              This removes decks, cards, reviews, profile, badges, and import history from this browser.
            </p>
            <label className="field-label">
              Type delete to confirm
              <input
                ref={clearConfirmInputRef}
                value={clearConfirmText}
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                onChange={(event) => setClearConfirmText(event.target.value)}
              />
            </label>
            <div className="confirm-actions">
              <button type="button" className="secondary-action" onClick={closeClearConfirm}>
                Cancel
              </button>
              <button
                type="button"
                className="danger-action"
                disabled={!canClearLocalData || clearingLocalData}
                onClick={confirmClearLocalData}
              >
                {clearingLocalData ? "Deleting..." : "Delete data"}
              </button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}

function ProfileView({
  data,
  totalCards,
  reviewsToday,
  updateProfileName
}: {
  data: AppData;
  totalCards: number;
  reviewsToday: number;
  updateProfileName: (userName: string) => void;
}) {
  const [badgeTab, setBadgeTab] = useState<"won" | "locked">("won");
  const due = getDueCards(data.cards, data.reviewStates, data.decks).length;
  const retention =
    data.reviewLogs.length === 0
      ? 0
      : Math.round(
          (data.reviewLogs.filter((log) => log.grade === "good" || log.grade === "easy").length /
            data.reviewLogs.length) *
            100
        );
  const levelProgress = getLevelProgress(data.settings.xp);
  const wonBadgeLabels = new Set(data.settings.badges.map((badge) => badge.label));
  const lockedBadges = BADGE_TARGETS.filter((badge) => !wonBadgeLabels.has(badge.label));

  return (
    <section className="content-grid profile-grid">
      <div className="panel profile-panel">
        <div className="panel-heading">
          <h2>Profile</h2>
          <UserRound size={18} />
        </div>
        <label className="field-label profile-name-field">
          Name
          <input
            value={data.settings.userName ?? ""}
            maxLength={40}
            onChange={(event) => updateProfileName(event.target.value)}
            placeholder="Your name"
          />
        </label>
        <div className="level-card">
          <div className="level-summary">
            <span>Total XP</span>
            <strong>{data.settings.xp}</strong>
          </div>
          <div className="level-meter">
            <span>Lv {levelProgress.level}</span>
            <div
              className="reward-track"
              role="meter"
              aria-label="XP to next level"
              aria-valuemin={0}
              aria-valuemax={levelProgress.xpForNextLevel}
              aria-valuenow={levelProgress.xpIntoLevel}
            >
              <div style={{ width: `${levelProgress.progressPercent}%` }} />
            </div>
            <span>Lv {levelProgress.nextLevel}</span>
          </div>
          <p className="muted">{levelProgress.xpToNextLevel} XP to next level</p>
        </div>
        <div className="stats-grid">
          <StatBox label="Due" value={due} />
          <StatBox label="Cards" value={totalCards} />
          <StatBox label="Today" value={reviewsToday} />
          <StatBox label="Retention" value={`${retention}%`} />
          <StatBox label="Streak" value={`${data.settings.streak.current}d`} />
          <StatBox label="Best" value={`${data.settings.streak.longest}d`} />
        </div>
      </div>

      <div className="panel">
        <div className="panel-heading">
          <h2>Badges</h2>
          <BadgeCheck size={18} />
        </div>
        <div className="badge-tabs" role="tablist" aria-label="Badges">
          <button
            type="button"
            role="tab"
            aria-selected={badgeTab === "won"}
            className={badgeTab === "won" ? "active" : ""}
            onClick={() => setBadgeTab("won")}
          >
            Completed
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={badgeTab === "locked"}
            className={badgeTab === "locked" ? "active" : ""}
            onClick={() => setBadgeTab("locked")}
          >
            Remaining
          </button>
        </div>
        <div className="badge-grid profile-badge-grid">
          {badgeTab === "won" &&
            (data.settings.badges.length ? (
              data.settings.badges.map((badge) => (
                <article key={badge.id} className="badge-card earned">
                  <BadgeCheck size={18} />
                  <div>
                    <strong>{badge.label}</strong>
                    <span>{getBadgeDescription(badge)}</span>
                  </div>
                </article>
              ))
            ) : (
              <p className="muted">Review cards to unlock badges.</p>
            ))}
          {badgeTab === "locked" &&
            (lockedBadges.length ? (
              lockedBadges.map((badge) => (
                <article key={badge.id} className="badge-card locked">
                  <Sparkles size={18} />
                  <div>
                    <strong>{badge.label}</strong>
                    <span>{badge.description}</span>
                  </div>
                </article>
              ))
            ) : (
              <p className="muted">All badges won.</p>
            ))}
        </div>
      </div>
    </section>
  );
}

function DeckForm({ onAdd }: { onAdd: (deck: Omit<Deck, "id" | "createdAt" | "updatedAt">) => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState("#69b7ff");

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) {
      return;
    }
    onAdd({
      name: name.trim(),
      description: description.trim(),
      color,
      tags: [],
      dailyNewLimit: 20,
      dailyReviewLimit: 100
    });
    setName("");
    setDescription("");
  }

  return (
    <form className="mini-form" onSubmit={submit}>
      <input value={name} onChange={(event) => setName(event.target.value)} placeholder="New deck name" />
      <input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Description" />
      <div className="form-row">
        <label className="color-picker" style={{ background: color }}>
          <input type="color" value={color} onChange={(event) => setColor(event.target.value)} aria-label="Deck color" />
        </label>
        <button type="submit" className="secondary-action">
          Add deck
        </button>
      </div>
    </form>
  );
}

function CardForm({
  data,
  onSave,
  existingCard,
  initialDeckId
}: {
  data: AppData;
  onSave: (card: Omit<Card, "id" | "createdAt" | "updatedAt">) => void;
  existingCard?: Card;
  initialDeckId?: string;
}) {
  // Deck detail uses initialDeckId so plus-created cards start in the active deck.
  const [deckId, setDeckId] = useState(existingCard?.deckId ?? initialDeckId ?? data.decks[0]?.id ?? "");
  const [recto, setRecto] = useState(existingCard?.recto ?? "");
  const [verso, setVerso] = useState(existingCard?.verso ?? "");
  const [details, setDetails] = useState(existingCard?.details ?? "");
  const [forceTypedAnswer, setForceTypedAnswer] = useState(existingCard?.forceTypedAnswer ?? false);

  useEffect(() => {
    setDeckId(existingCard?.deckId ?? initialDeckId ?? data.decks[0]?.id ?? "");
    setRecto(existingCard?.recto ?? "");
    setVerso(existingCard?.verso ?? "");
    setDetails(existingCard?.details ?? "");
    setForceTypedAnswer(existingCard?.forceTypedAnswer ?? false);
  }, [data.decks, existingCard, initialDeckId]);

  function submit(event: FormEvent) {
    event.preventDefault();
    const cleanRecto = normalizeRichTextHtml(recto);
    const cleanVerso = normalizeRichTextHtml(verso);
    const cleanDetails = normalizeRichTextHtml(details);
    if (!deckId || !stripHtml(cleanRecto) || !stripHtml(cleanVerso)) return;
    onSave({
      deckId,
      recto: cleanRecto,
      verso: cleanVerso,
      details: cleanDetails,
      tags: existingCard?.tags ?? [],
      suspended: existingCard?.suspended ?? false,
      forceTypedAnswer,
      source: existingCard?.source ?? { type: "manual" }
    });

    if (!existingCard) {
      setRecto("");
      setVerso("");
      setDetails("");
      setForceTypedAnswer(false);
    }
  }

  function flipRectoVerso() {
    // Keep rich text fragments intact while switching card sides.
    setRecto(verso);
    setVerso(recto);
  }

  return (
    <form className="card-form" onSubmit={submit}>
      <label className="field-label">
        Deck
        <DropdownSelect
          ariaLabel="Deck"
          value={deckId}
          options={data.decks.map((deck) => ({ value: deck.id, label: deck.name }))}
          onChange={setDeckId}
        />
      </label>
      <RichTextField label="Recto" value={recto} required placeholder="Question or prompt" onChange={setRecto} />
      <RichTextField label="Verso" value={verso} required placeholder="Answer" onChange={setVerso} />
      {existingCard && (
        <button className="secondary-action wide" type="button" onClick={flipRectoVerso}>
          <FlipHorizontal2 size={18} aria-hidden="true" />
          Flip Recto and Verso
        </button>
      )}
      <RichTextField label="Details" value={details} placeholder="Optional context" onChange={setDetails} />
      <label className="checkbox-field">
        <input
          type="checkbox"
          checked={forceTypedAnswer}
          onChange={(event) => setForceTypedAnswer(event.target.checked)}
        />
        <span>Require typed answer</span>
      </label>
      <button className="primary-action wide" type="submit">
        Save card
      </button>
    </form>
  );
}

function RichTextField({
  label,
  value,
  onChange,
  placeholder,
  required = false
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  required?: boolean;
}) {
  const editorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const editor = editorRef.current;
    if (editor && editor.innerHTML !== value) {
      editor.innerHTML = value;
    }
  }, [value]);

  function syncFromEditor() {
    const editor = editorRef.current;
    if (!editor) return;
    const nextValue = normalizeRichTextHtml(editor.innerHTML);
    if (editor.innerHTML !== nextValue) {
      editor.innerHTML = nextValue;
      placeCursorAtEnd(editor);
    }
    onChange(nextValue);
  }

  function applyFormat(format: RichTextFormat) {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    wrapSelection(editor, format);
    syncFromEditor();
  }

  function pastePlainText(event: ClipboardEvent<HTMLDivElement>) {
    event.preventDefault();
    insertPlainText(editorRef.current, event.clipboardData.getData("text/plain"));
    syncFromEditor();
  }

  return (
    <div className="field-label rich-text-label">
      <span>{label}</span>
      <div className="rich-text-field">
        <div className="rich-text-toolbar" aria-label="Text formatting">
          {RICH_TEXT_TOOLS.map((tool) => {
            const Icon = tool.icon;
            return (
              <button
                key={tool.format}
                type="button"
                className="rich-text-button"
                aria-label={tool.label}
                title={tool.label}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => applyFormat(tool.format)}
              >
                <Icon size={16} aria-hidden="true" />
              </button>
            );
          })}
        </div>
        <div
          ref={editorRef}
          className="rich-text-editor"
          role="textbox"
          aria-label={label}
          aria-multiline="true"
          aria-required={required}
          contentEditable
          data-placeholder={placeholder}
          onInput={syncFromEditor}
          onPaste={pastePlainText}
        />
      </div>
    </div>
  );
}

function wrapSelection(editor: HTMLDivElement, format: RichTextFormat) {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || !selectionInsideEditor(editor, selection)) {
    return;
  }

  const range = selection.getRangeAt(0);
  if (range.collapsed) {
    return;
  }

  const activeFormat = getSharedFormatElement(editor, selection, format);
  if (activeFormat) {
    unwrapFormatElement(activeFormat);
    return;
  }

  // Wrapping extracted contents keeps browser output semantic instead of b/i tags.
  const wrapper = document.createElement(format);
  wrapper.append(range.extractContents());
  range.insertNode(wrapper);
  selectNodeContents(wrapper);
}

function selectionInsideEditor(editor: HTMLDivElement, selection: Selection) {
  return Boolean(
    selection.anchorNode &&
      selection.focusNode &&
      editor.contains(selection.anchorNode) &&
      editor.contains(selection.focusNode)
  );
}

function getSharedFormatElement(editor: HTMLDivElement, selection: Selection, format: RichTextFormat) {
  const anchorFormat = closestFormatElement(editor, selection.anchorNode, format);
  const focusFormat = closestFormatElement(editor, selection.focusNode, format);
  return anchorFormat && anchorFormat === focusFormat ? anchorFormat : null;
}

function closestFormatElement(editor: HTMLDivElement, node: Node | null, format: RichTextFormat) {
  let current = node instanceof Element ? node : node?.parentElement;
  while (current && current !== editor) {
    if (current.tagName.toLowerCase() === format) {
      return current;
    }
    current = current.parentElement;
  }
  return null;
}

function unwrapFormatElement(element: Element) {
  const parent = element.parentNode;
  if (!parent) return;

  const movedNodes = Array.from(element.childNodes);
  for (const node of movedNodes) {
    parent.insertBefore(node, element);
  }
  parent.removeChild(element);
  selectNodes(movedNodes);
}

function insertPlainText(editor: HTMLDivElement | null, text: string) {
  if (!editor || !text) return;
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || !selectionInsideEditor(editor, selection)) {
    editor.append(document.createTextNode(text));
    placeCursorAtEnd(editor);
    return;
  }

  const range = selection.getRangeAt(0);
  range.deleteContents();
  const textNode = document.createTextNode(text);
  range.insertNode(textNode);
  range.setStartAfter(textNode);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

function placeCursorAtEnd(editor: HTMLDivElement) {
  editor.focus();
  const range = document.createRange();
  range.selectNodeContents(editor);
  range.collapse(false);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function selectNodes(nodes: Node[]) {
  if (nodes.length === 0) return;
  const range = document.createRange();
  range.setStartBefore(nodes[0]);
  range.setEndAfter(nodes[nodes.length - 1]);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function selectNodeContents(node: Node) {
  const range = document.createRange();
  range.selectNodeContents(node);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

interface SelectOption {
  value: string;
  label: string;
}

function DropdownSelect({
  ariaLabel,
  value,
  options,
  onChange
}: {
  ariaLabel: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selectRef = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.value === value) ?? options[0];

  useEffect(() => {
    if (!open) {
      return;
    }

    function closeOnOutsideClick(event: PointerEvent) {
      if (!selectRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div className="custom-select" ref={selectRef}>
      <button
        type="button"
        className="custom-select-trigger"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={!options.length}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="select-option-copy">
          <span>{selected?.label ?? "Choose"}</span>
        </span>
        <ChevronDown size={18} aria-hidden="true" />
      </button>
      {open && (
        <div className="custom-select-menu" role="listbox" aria-label={ariaLabel}>
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              className={option.value === selected?.value ? "selected" : ""}
              role="option"
              aria-selected={option.value === selected?.value}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
            >
              <span className="select-option-copy">
                <span>{option.label}</span>
              </span>
              {option.value === selected?.value && <Check size={16} aria-hidden="true" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function BrandBlock({ name, level, streak }: { name?: string; level: number; streak: number }) {
  const displayName = name?.trim() || "Rikol";

  return (
    <div className="brand-block">
      <div className="brand-mark">
        <Companion small />
      </div>
      <div>
        <strong>{displayName}</strong>
        <span>
          Level {level} | {streak} streak
        </span>
      </div>
    </div>
  );
}

function NavList({
  view,
  setView
}: {
  view: View;
  setView: (view: View) => void;
}) {
  function renderNavButton(item: NavItem) {
    const Icon = item.icon;

    return (
      <button key={item.view} className={view === item.view ? "active" : ""} onClick={() => setView(item.view)}>
        <Icon size={19} />
        <span>{item.label}</span>
      </button>
    );
  }

  return (
    <div className="nav-list">
      <div className="nav-list-main">{navItems.map(renderNavButton)}</div>
      <div className="nav-list-bottom">{renderNavButton(createNavItem)}</div>
    </div>
  );
}

function Companion({ small = false }: { small?: boolean }) {
  return (
    <svg className={small ? "companion small" : "companion"} viewBox="0 0 220 220" role="img" aria-label="Rikol companion">
      <path className="blob" d="M39 113c-22-46 13-88 55-91 52-4 93 24 96 75 4 60-49 98-101 84-25-7-38-24-50-68Z" />
      <path className="leaf" d="M143 37c27-25 54-15 57-12-1 36-30 47-58 36 0 0-5-14 1-24Z" />
      <circle className="face" cx="108" cy="105" r="54" />
      <circle className="eye" cx="88" cy="99" r="7" />
      <circle className="eye" cx="128" cy="99" r="7" />
      <path className="smile" d="M91 123c11 12 28 12 39 0" />
      <path className="body" d="M61 157c18 30 79 40 112 5-5 31-31 49-65 49-32 0-54-18-47-54Z" />
    </svg>
  );
}

function StatPill({ icon: Icon, label }: { icon: typeof Flame; label: string }) {
  return (
    <span className="stat-pill">
      <Icon size={16} />
      {label}
    </span>
  );
}

function StatBox({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="stat-box">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function upsertByCardId<T extends { cardId: string }>(items: T[], item: T) {
  const exists = items.some((existing) => existing.cardId === item.cardId);
  return exists ? items.map((existing) => (existing.cardId === item.cardId ? item : existing)) : [...items, item];
}

function getCardQuestionPreview(card: Card) {
  // Deck lists stay compact: show prompt text only, never answer-side content.
  return stripHtml(card.recto) || "Untitled card";
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "deck";
}
