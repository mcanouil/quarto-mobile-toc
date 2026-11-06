/**
 * Mobile TOC - Structure check
 * Check when the pill and the sheet are built, skipped and removed.
 *
 * @license MIT
 * @copyright 2026 Mickaël Canouil
 * @author Mickaël Canouil
 */

import { openPage, tap, finish } from "./lib.mjs";

const [, , htmlPath, fixture] = process.argv;
if (!htmlPath || !fixture) {
  console.error("Usage: node structure-check.mjs <html-file> <fixture-name>");
  process.exit(2);
}

const ROOT_PROPERTIES = [
  "--mobile-toc-offset-x",
  "--mobile-toc-offset-y",
  "--mobile-toc-offset-left",
  "--mobile-toc-pill-height",
];

const pillCount = (page) => page.locator(".mobile-toc-pill").count();

const assertions = {
  async page(page) {
    tap("one pill at 375px", (await pillCount(page)) === 1);
    tap("one sheet at 375px", (await page.locator("#mobile-toc-sheet").count()) === 1);

    const adjacent = await page.evaluate(
      () =>
        document.querySelector(".mobile-toc-pill")?.nextElementSibling ===
        document.querySelector("#mobile-toc-sheet"),
    );
    tap("sheet follows the pill", adjacent);

    const clean = await page.evaluate(() => {
      const list = document.querySelector("#mobile-toc-sheet > ul");
      return (
        !!list &&
        !list.matches("[id], [inert]") &&
        list.querySelectorAll("[id], [inert]").length === 0
      );
    });
    tap("sheet list has no id or inert", clean);

    const counts = await page.evaluate(() => ({
      sheet: document.querySelectorAll("#mobile-toc-sheet > ul a").length,
      toc: document.querySelectorAll("nav#TOC > ul a").length,
    }));
    tap("sheet has the same links as the side list", counts.sheet === counts.toc && counts.toc > 0, JSON.stringify(counts));

    const labels = await page.evaluate(() => ({
      pill: document.querySelector(".mobile-toc-pill-label")?.textContent.trim(),
      title: document.querySelector("#toc-title")?.textContent.trim(),
      close: document.querySelector(".mobile-toc-close")?.getAttribute("aria-label"),
    }));
    tap("pill label equals the TOC title", !!labels.pill && labels.pill === labels.title, JSON.stringify(labels));
    tap("close button label is Close", labels.close === "Close", JSON.stringify(labels));
  },

  async "page-wide"(page) {
    await page.setViewportSize({ width: 800, height: 667 });
    tap("no pill at 800px", (await pillCount(page)) === 0);
  },

  async teardown(page) {
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.locator(".mobile-toc-pill").click();
    const open = await page.evaluate(() => document.querySelector("#mobile-toc-sheet")?.matches(":popover-open"));
    tap("sheet is open before the resize", open === true);
    await page.setViewportSize({ width: 800, height: 667 });
    await page.waitForTimeout(200);
    const state = await page.evaluate((properties) => ({
      pill: document.querySelectorAll(".mobile-toc-pill").length,
      sheet: document.querySelectorAll("#mobile-toc-sheet").length,
      left: properties.filter((name) => document.documentElement.style.getPropertyValue(name) !== ""),
    }), ROOT_PROPERTIES);
    tap("no pill after the resize", state.pill === 0);
    tap("no sheet after the resize", state.sheet === 0);
    tap("no root property after the resize", state.left.length === 0, state.left.join(", "));
    tap("no page error", errors.length === 0, errors.join("; "));
  },

  async "no-popover"(page) {
    tap("no pill without the Popover API", (await pillCount(page)) === 0);
  },

  async "left-toc"(page) {
    tap("pill with a left TOC", (await pillCount(page)) === 1);
  },

  async "body-toc"(page) {
    tap("no pill with a body TOC", (await pillCount(page)) === 0);
  },

  async "right-body"(page) {
    tap("no pill with a right-body TOC", (await pillCount(page)) === 0);
  },

  async "one-heading"(page) {
    tap("no pill with one heading", (await pillCount(page)) === 0);
  },

  async numbered(page) {
    const result = await page.evaluate(() => {
      const links = [...document.querySelectorAll("#mobile-toc-sheet a")];
      return { total: links.length, numbered: links.filter((a) => a.querySelector(".header-section-number")).length };
    });
    tap("every sheet link keeps its section number", result.total > 0 && result.total === result.numbered, JSON.stringify(result));
  },

  async "toc-title"(page) {
    const label = await page.locator(".mobile-toc-pill-label").textContent();
    tap("pill label is the custom TOC title", label?.trim() === "Sur cette page", label);
  },
};

const run = assertions[fixture];
if (!run) {
  console.error(`Unknown fixture "${fixture}".`);
  process.exit(2);
}

const sessions = {
  page: ["page", "page-wide", "teardown", "no-popover"],
};

for (const name of sessions[fixture] ?? [fixture]) {
  const { page, close } = await openPage(htmlPath, { width: name === "page-wide" ? 800 : 375 });
  try {
    if (name === "no-popover") {
      await page.addInitScript(() => {
        delete HTMLElement.prototype.popover;
      });
      await page.reload({ waitUntil: "load" });
    }
    await assertions[name](page);
  } finally {
    await close();
  }
}
finish();
