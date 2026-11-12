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

    const roles = await page.evaluate(() => {
      const sheet = document.querySelector("#mobile-toc-sheet");
      const pill = document.querySelector(".mobile-toc-pill");
      return {
        tag: sheet?.tagName,
        className: sheet?.className,
        labelledby: sheet?.getAttribute("aria-labelledby"),
        role: sheet?.getAttribute("role"),
        popover: !!document.querySelector("[popover], [popovertarget]"),
        haspopup: pill?.getAttribute("aria-haspopup"),
        controls: pill?.getAttribute("aria-controls"),
        expanded: pill?.getAttribute("aria-expanded"),
      };
    });
    tap(
      "sheet is a dialog labelled by the sheet label",
      roles.tag === "DIALOG" &&
        roles.className === "mobile-toc-sheet" &&
        roles.labelledby === "mobile-toc-sheet-label" &&
        roles.role === null,
      JSON.stringify(roles),
    );
    tap("no popover attribute on the pill or the sheet", !roles.popover);
    tap(
      "pill declares the dialog it opens and starts collapsed",
      roles.haspopup === "dialog" && roles.controls === "mobile-toc-sheet" && roles.expanded === "false",
      JSON.stringify(roles),
    );

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
    const open = await page.evaluate(() => document.querySelector("#mobile-toc-sheet")?.matches("[open]"));
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
    const live = await page.evaluate(() => {
      const link = document.querySelector("nav#TOC a");
      link?.focus();
      return { focused: !!link && document.activeElement === link, inert: !!link?.closest("[inert]") };
    });
    tap("page content takes focus after the resize", live.focused && !live.inert, JSON.stringify(live));
    tap("no page error", errors.length === 0, errors.join("; "));
  },

  async "no-dialog"(page) {
    tap("no pill without HTMLDialogElement.showModal", (await pillCount(page)) === 0);
  },

  async "no-main"(page) {
    tap("pill without a main element", (await pillCount(page)) === 1);
    const placement = await page.evaluate(() => ({
      main: !!document.querySelector("main"),
      parent: document.querySelector(".mobile-toc-pill")?.parentElement?.tagName,
    }));
    tap("pill mounts in body when there is no main", !placement.main && placement.parent === "BODY", JSON.stringify(placement));
    await page.locator(".mobile-toc-pill").focus();
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => document.getElementById("mobile-toc-sheet").matches("[open]"), null, { timeout: 3000 }).catch(() => {});
    tap("sheet opens without a main element", await page.evaluate(() => document.getElementById("mobile-toc-sheet").matches("[open]")));
  },

  async "nested-main"(page) {
    const placement = await page.evaluate(() => {
      const pill = document.querySelector(".mobile-toc-pill");
      const main = document.querySelector("main");
      return {
        direct: !!document.querySelector("#quarto-content > main"),
        before:
          !!pill &&
          pill.parentElement === main.parentElement &&
          pill.parentElement.id !== "quarto-content" &&
          pill.nextElementSibling?.id === "mobile-toc-sheet" &&
          !!(pill.compareDocumentPosition(main) & Node.DOCUMENT_POSITION_FOLLOWING),
      };
    });
    tap("pill and sheet sit before a main that is not a child of #quarto-content", !placement.direct && placement.before, JSON.stringify(placement));
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
  page: ["page", "page-wide", "teardown", "no-dialog", "no-main", "nested-main"],
};

for (const name of sessions[fixture] ?? [fixture]) {
  const { page, close } = await openPage(htmlPath, { width: name === "page-wide" ? 800 : 375, hideNativePill: true });
  try {
    if (name === "no-main") {
      await page.addInitScript(() => {
        document.addEventListener("DOMContentLoaded", () => {
          for (const main of document.querySelectorAll("main")) {
            const replacement = document.createElement("div");
            replacement.append(...main.childNodes);
            main.replaceWith(replacement);
          }
        });
      });
      await page.reload({ waitUntil: "load" });
    }
    if (name === "nested-main") {
      await page.addInitScript(() => {
        document.addEventListener("DOMContentLoaded", () => {
          const main = document.querySelector("#quarto-content > main");
          const wrapper = document.createElement("div");
          main.before(wrapper);
          wrapper.append(main);
        });
      });
      await page.reload({ waitUntil: "load" });
    }
    if (name === "no-dialog") {
      await page.addInitScript(() => {
        delete HTMLDialogElement.prototype.showModal;
      });
      await page.reload({ waitUntil: "load" });
    }
    await assertions[name](page);
  } finally {
    await close();
  }
}
finish();
