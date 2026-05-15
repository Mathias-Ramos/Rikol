import { expect, test, type Page } from "@playwright/test";
import { Buffer } from "node:buffer";

test("onboarding and mobile navigation", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Rikol")).toBeVisible();
  await page.getByRole("button", { name: /Load demo decks/i }).click();
  await expect(page.getByText(/\d+ left/)).toHaveCount(0);
  await openNavIfMobile(page);
  await page.getByRole("button", { name: /Decks/i }).click();
  await expect(page.getByRole("heading", { name: "Deck library" })).toBeVisible();
  await expect(page.getByText("What does this TypeScript utility do?")).toHaveCount(0);

  await page.getByRole("button", { name: "Code sparks 2 cards" }).click();
  await expect(page.getByRole("heading", { name: "Code sparks" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Back to decks" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add card" })).toBeVisible();
  await expect(page.getByRole("button", { name: /What does this TypeScript utility do?/ })).toBeVisible();
  await expect(page.getByText("It creates a new array containing each user's name.")).toHaveCount(0);

  await page.getByRole("button", { name: "Add card" }).click();
  await expect(page.getByRole("heading", { name: "New card" })).toBeVisible();
  await expect(page.locator(".custom-select-trigger").first()).toContainText("Code sparks");
  await expect(page.getByRole("button", { name: "Template" })).toHaveCount(0);
  await page.getByRole("button", { name: "Back to cards" }).click();
  await expect(page.getByRole("heading", { name: "Code sparks" })).toBeVisible();

  await page.getByRole("button", { name: /What does this TypeScript utility do?/ }).click();
  await expect(page.getByRole("heading", { name: "Edit card" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Delete card" })).toBeVisible();
  await page.getByRole("button", { name: "Back to cards" }).click();
  await expect(page.getByRole("heading", { name: "Code sparks" })).toBeVisible();
  await page.getByRole("button", { name: "Back to decks" }).click();
  await expect(page.getByRole("heading", { name: "Deck library" })).toBeVisible();

  await expect(page.locator("input[type='color']")).toHaveCount(0);
  await page.getByRole("button", { name: "New deck" }).click();
  await expect(page.getByPlaceholder("New deck name")).toBeVisible();
  await expect(page.getByPlaceholder("Description")).toBeVisible();
  await expect(page.getByRole("button", { name: "Import deck" })).toBeVisible();
  await page.getByLabel("Import deck file").setInputFiles({
    name: "deck-drawer.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("deck,recto,verso,details,tags\nImported drawer,Hello,Bonjour,,")
  });
  await expect(page.getByText("CSV ready to import.")).toBeVisible();
  await page.getByRole("button", { name: "Save import" }).click();
  await expect(page.getByRole("button", { name: "Imported drawer 1 cards" })).toBeVisible();

  await page.getByRole("button", { name: "New deck" }).click();
  await expect(page.getByPlaceholder("New deck name")).toBeVisible();
  await expect(page.locator(".color-picker")).toHaveCSS("width", "28px");
  await page.getByPlaceholder("New deck name").fill("Daily words");
  await page.getByPlaceholder("Description").fill("Quick vocabulary drills");
  await page.getByRole("button", { name: "Add deck" }).click();
  await expect(page.getByRole("button", { name: "Daily words 0 cards" })).toBeVisible();
});

test("deck deletion requires typed confirmation and removes deck cards", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Load demo decks/i }).click();
  await openNavIfMobile(page);
  await page.getByRole("button", { name: /Decks/i }).click();
  await page.getByRole("button", { name: "Code sparks 2 cards" }).click();

  await expect(page.getByRole("button", { name: "Delete deck" })).toBeVisible();
  await page.getByRole("button", { name: "Delete deck" }).click();
  const dialog = page.getByRole("dialog", { name: "Delete Code sparks?" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("2 cards");
  await expect(dialog.getByRole("button", { name: "Delete deck" })).toBeDisabled();
  await dialog.getByLabel("Type delete to confirm").fill("Delete");
  await expect(dialog.getByRole("button", { name: "Delete deck" })).toBeDisabled();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Code sparks" })).toBeVisible();

  await page.getByRole("button", { name: "Delete deck" }).click();
  const confirmDialog = page.getByRole("dialog", { name: "Delete Code sparks?" });
  await confirmDialog.getByLabel("Type delete to confirm").fill("delete");
  await expect(confirmDialog.getByRole("button", { name: "Delete deck" })).toBeEnabled();
  await confirmDialog.getByRole("button", { name: "Delete deck" }).click();

  await expect(page.getByRole("heading", { name: "Deck library" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Code sparks 2 cards" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "World capitals 2 cards" })).toBeVisible();

  await openNavIfMobile(page);
  await page.getByRole("button", { name: /Home/i }).click();
  await expect(page.locator(".review-face")).toContainText("Canada");
  await expect(page.getByText("What does this TypeScript utility do?")).toHaveCount(0);
});

test("profile name and badge tabs", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Load demo decks/i }).click();

  await openNavIfMobile(page);
  await page.getByRole("button", { name: /Profile/i }).click();
  await expect(page.getByRole("heading", { name: "Profile" })).toBeVisible();
  await page.getByLabel("Name").fill("Nico");

  await openNavIfMobile(page);
  await expect(page.locator(".brand-block strong")).toHaveText("Nico");
  await closeNavIfMobile(page);
  await page.getByRole("tab", { name: "Remaining" }).click();
  await expect(page.getByText("First spark", { exact: true })).toBeVisible();
  await expect(page.getByText("25 reviews", { exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "Completed" }).click();
  await expect(page.getByText("Demo loaded")).toBeVisible();
  await expect(page.getByText("Load demo decks.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Local data" })).toHaveCount(0);

  await openNavIfMobile(page);
  await page.getByRole("button", { name: /Settings/i }).click();
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Local data" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Import" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Export" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Import" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Export JSON backup" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Clear local data" })).toBeVisible();
  await page.getByRole("button", { name: "Clear local data" }).click();
  await expect(page.getByRole("dialog", { name: "Clear local data?" })).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("dialog", { name: "Clear local data?" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();

  await page.getByRole("button", { name: "Clear local data" }).click();
  await page.getByLabel("Type delete to confirm").fill("Delete");
  await expect(page.getByRole("button", { name: "Delete data" })).toBeDisabled();
  await page.getByLabel("Type delete to confirm").fill("delete");
  await page.getByRole("button", { name: "Delete data" }).click();
  await expect(page.getByRole("button", { name: /Load demo decks/i })).toBeVisible();
});

test("simple cards alternate reveal and typed answer modes", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Create first deck/i }).click();
  await page.getByPlaceholder("New deck name").fill("Interactive");
  await page.getByRole("button", { name: "Add deck" }).click();
  await expect(page.getByRole("heading", { name: "Deck setup" })).toHaveCount(0);
  await expect(page.getByText("Tags", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Template" })).toHaveCount(0);

  await page.getByLabel("Recto").fill("Capital of France?");
  await page.getByLabel("Verso").fill("Paris");
  await page.getByLabel("Details").fill("France uses Central European Time.");
  await page.getByRole("button", { name: "Save card" }).click();

  await openNavIfMobile(page);
  await page.getByRole("button", { name: /Home/i }).click();

  await expect(page.locator(".review-face")).toContainText("Capital of France?");
  await expect(page.getByLabel("Typed answer")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Reveal/i })).toBeEnabled();
  await page.getByRole("button", { name: /Reveal/i }).click();
  await expect(page.locator(".review-face")).toContainText("Paris");
  await expect(page.locator(".review-face")).toContainText("France uses Central European Time.");
  await expectGradeButtonsOnSingleRow(page);
  await expectGradeDueLabels(page, ["5 min", "10 min", "1 day", "4 days"]);
  await page.getByRole("button", { name: "good" }).click();
  await expect(page.getByRole("status")).toHaveText("+3 XP");

  await page.waitForTimeout(400);
  await makeReviewedCardDueNow(page, "Capital of France?");
  await page.reload();

  await expect(page.getByLabel("Typed answer")).toBeVisible();
  await expect(page.getByRole("button", { name: /Reveal/i })).toBeDisabled();
  await page.getByLabel("Typed answer").fill("Paris");
  await page.getByRole("button", { name: /Reveal/i }).click();
  await expect(page.locator(".review-face")).toContainText("Paris");
  await expect(page.locator(".review-face")).toContainText("Your answer");
  await expect(page.locator(".review-face")).toContainText("Paris");
  await expectGradeButtonsOnSingleRow(page);
});

test("long answers skip typed mode unless card requires it", async ({ page }) => {
  const longAnswer = "This answer is intentionally longer than fifty visible characters for review.";

  await page.goto("/");
  await page.getByRole("button", { name: /Create first deck/i }).click();
  await page.getByPlaceholder("New deck name").fill("Length gate");
  await page.getByRole("button", { name: "Add deck" }).click();

  await page.getByLabel("Recto").fill("Long answer prompt");
  await page.getByLabel("Verso").fill(longAnswer);
  await page.getByRole("button", { name: "Save card" }).click();

  await openNavIfMobile(page);
  await page.getByRole("button", { name: /Home/i }).click();
  await page.getByRole("button", { name: /Reveal/i }).click();
  await page.getByRole("button", { name: "good" }).click();

  await page.waitForTimeout(400);
  await makeReviewedCardDueNow(page, "Long answer prompt");
  await page.reload();
  await expect(page.locator(".review-face")).toContainText("Long answer prompt");
  await expect(page.getByLabel("Typed answer")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Reveal/i })).toBeEnabled();
});

test("forced typed answer requires input even for long answers", async ({ page }) => {
  const longAnswer = "This answer is intentionally longer than fifty visible characters for review.";

  await page.goto("/");
  await page.getByRole("button", { name: /Create first deck/i }).click();
  await page.getByPlaceholder("New deck name").fill("Forced type");
  await page.getByRole("button", { name: "Add deck" }).click();

  await page.getByLabel("Recto").fill("Forced long prompt");
  await page.getByLabel("Verso").fill(longAnswer);
  await page.getByLabel("Require typed answer").check();
  await page.getByRole("button", { name: "Save card" }).click();

  await openNavIfMobile(page);
  await page.getByRole("button", { name: /Home/i }).click();
  await expect(page.locator(".review-face")).toContainText("Forced long prompt");
  await expect(page.getByLabel("Typed answer")).toBeVisible();
  await expect(page.getByRole("button", { name: /Reveal/i })).toBeDisabled();
  await page.getByLabel("Typed answer").fill("Long answer");
  await page.getByRole("button", { name: /Reveal/i }).click();
  await expect(page.locator(".review-face")).toContainText(longAnswer);
  await expect(page.locator(".review-face")).toContainText("Your answer");
});

test("rich text card formatting persists through create and edit", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Create first deck/i }).click();
  await page.getByPlaceholder("New deck name").fill("Rich deck");
  await page.getByRole("button", { name: "Add deck" }).click();

  await page.getByLabel("Recto").fill("Rich prompt");
  await formatEditorText(page, "Recto", "Rich", "Bold");
  await expect(page.locator(".rich-text-editor[aria-label='Recto'] strong")).toHaveText("Rich");
  await formatEditorText(page, "Recto", "Rich", "Bold");
  await expect(page.locator(".rich-text-editor[aria-label='Recto'] strong")).toHaveCount(0);
  await formatEditorText(page, "Recto", "Rich", "Bold");
  await page.getByLabel("Verso").fill("Styled answer");
  await formatEditorText(page, "Verso", "answer", "Italic");
  await page.getByLabel("Details").fill("const value = 1;");
  await formatEditorText(page, "Details", "const value = 1;", "Code");
  await page.getByRole("button", { name: "Save card" }).click();

  await openNavIfMobile(page);
  await page.getByRole("button", { name: /Decks/i }).click();
  await page.getByRole("button", { name: "Rich deck 1 cards" }).click();
  await page.getByRole("button", { name: /Rich prompt/ }).click();
  await expect(page.getByRole("heading", { name: "Edit card" })).toBeVisible();
  await expect(page.locator(".rich-text-editor[aria-label='Recto'] strong")).toHaveText("Rich");
  await expect(page.locator(".rich-text-editor[aria-label='Verso'] em")).toHaveText("answer");
  await expect(page.locator(".rich-text-editor[aria-label='Details'] code")).toHaveText("const value = 1;");
  await page.getByRole("button", { name: "Flip Recto and Verso" }).click();
  await expect(page.locator(".rich-text-editor[aria-label='Recto'] em")).toHaveText("answer");
  await expect(page.locator(".rich-text-editor[aria-label='Verso'] strong")).toHaveText("Rich");
  await page.getByRole("button", { name: "Save card" }).click();

  await openNavIfMobile(page);
  await page.getByRole("button", { name: /Home/i }).click();
  await expect(page.locator(".review-face em")).toHaveText("answer");
  await page.getByRole("button", { name: /Reveal/i }).click();
  await expect(page.locator(".review-face strong")).toHaveText("Rich");
  await expect(page.locator(".review-face code")).toHaveText("const value = 1;");
});

async function openNavIfMobile(page: Page) {
  if ((page.viewportSize()?.width ?? 0) < 760) {
    await page.getByRole("button", { name: /Open menu/i }).click();
  }
}

async function closeNavIfMobile(page: Page) {
  if ((page.viewportSize()?.width ?? 0) < 760) {
    await page.getByRole("complementary", { name: "Main menu" }).getByLabel("Close menu").click();
  }
}

async function makeReviewedCardDueNow(page: Page, recto: string) {
  await page.evaluate(async (cardRecto) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("rikol-db", 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    const transaction = db.transaction("app", "readwrite");
    const store = transaction.objectStore("app");
    const data = await new Promise<any>((resolve, reject) => {
      const request = store.get("state");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const card = data.cards.find((item: any) => item.recto === cardRecto);
    const state = data.reviewStates.find((item: any) => item.cardId === card.id);
    if (state.answerMode !== "type") {
      throw new Error(`Expected type answer mode, got ${state.answerMode}`);
    }
    state.due = new Date(Date.now() - 1000).toISOString();
    store.put(data, "state");

    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }, recto);
}

async function formatEditorText(page: Page, label: string, text: string, buttonName: string) {
  const selected = await page.evaluate(
    ({ label, text }) => {
      const editor = document.querySelector(`[contenteditable="true"][aria-label="${label}"]`);
      if (!editor) return false;

      const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const node = walker.currentNode;
        const start = node.textContent?.indexOf(text) ?? -1;
        if (start >= 0) {
          const range = document.createRange();
          range.setStart(node, start);
          range.setEnd(node, start + text.length);
          const selection = window.getSelection();
          selection?.removeAllRanges();
          selection?.addRange(range);
          return true;
        }
      }

      return false;
    },
    { label, text }
  );

  expect(selected).toBe(true);
  await page.locator(".rich-text-label").filter({ has: page.getByRole("textbox", { name: label }) }).getByRole("button", { name: buttonName }).click();
}

async function expectGradeButtonsOnSingleRow(page: Page) {
  const boxes = await Promise.all(
    ["again", "hard", "good", "easy"].map(async (label) => page.getByRole("button", { name: label }).boundingBox())
  );
  expect(boxes.every(Boolean)).toBe(true);

  const tops = boxes.map((box) => Math.round(box?.y ?? 0));
  expect(Math.max(...tops) - Math.min(...tops)).toBeLessThanOrEqual(1);
}

async function expectGradeDueLabels(page: Page, labels: string[]) {
  await expect(page.locator(".grade-button small")).toHaveText(labels);
}
