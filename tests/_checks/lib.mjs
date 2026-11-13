/**
 * Mobile TOC - Browser check helpers
 * Serve a rendered page over HTTP and open it in Chromium or Firefox.
 *
 * @license MIT
 * @copyright 2026 Mickaël Canouil
 * @author Mickaël Canouil
 */

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, basename, extname, join, resolve, sep } from "node:path";
import { chromium, firefox } from "playwright";

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".map": "application/json; charset=utf-8",
};

let failed = 0;

/**
 * Serve the directory of a rendered file over HTTP.
 * @param {string} htmlPath Path to the rendered HTML file.
 * @returns {Promise<{url: string, close: () => void}>}
 */
async function serve(htmlPath) {
  const filePath = resolve(htmlPath);
  const root = dirname(filePath);

  const server = createServer(async (req, res) => {
    try {
      const path = decodeURIComponent(
        new URL(req.url, "http://localhost").pathname,
      );
      const resolved = resolve(join(root, path));
      if (resolved !== root && !resolved.startsWith(root + sep)) {
        res.statusCode = 403;
        res.end("Forbidden");
        return;
      }
      const body = await readFile(resolved);
      res.setHeader(
        "Content-Type",
        CONTENT_TYPES[extname(resolved).toLowerCase()] ||
          "application/octet-stream",
      );
      res.end(body);
    } catch {
      res.statusCode = 404;
      res.end("Not found");
    }
  });

  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  const { port } = server.address();
  return {
    url: `http://127.0.0.1:${port}/${basename(filePath)}`,
    close: () => server.close(),
  };
}

/**
 * Connect to the Firefox of a Playwright server, such as the Docker image.
 * The server reaches the local page server through the client, so it can stay on the loopback address.
 * @returns {Promise<import("playwright").Browser>}
 */
async function connectFirefox() {
  const endpoint = process.env.PW_WS_ENDPOINT;
  if (!endpoint) {
    throw new Error("Firefox checks need PW_WS_ENDPOINT, for example ws://127.0.0.1:3000/ from a Playwright server.");
  }
  return firefox.connect(endpoint, { exposeNetwork: "<loopback>" });
}

/**
 * Open a rendered page in Chromium or Firefox at a given viewport.
 * Chromium comes from CHROME_PATH when set, otherwise from the Playwright cache.
 * @param {string} htmlPath Path to the rendered HTML file.
 * @param {object} [options]
 * @param {number} [options.width=375]
 * @param {number} [options.height=667]
 * @param {boolean} [options.isMobile=true]
 * @param {boolean} [options.rtl=false] Set the document direction to right to left.
 * @param {number} [options.deviceScaleFactor=1] Pixel ratio of the context.
 * @param {"reduce"|"no-preference"} [options.reducedMotion] Motion preference of the context.
 * @param {boolean} [options.hideNativePill=false] Hide the native contents pill of a dev Quarto build.
 * @param {(page: import("playwright").Page) => void} [options.beforeLoad] Called with the page before it loads.
 * @param {"chromium"|"firefox"} [options.browser="chromium"] Engine; Firefox runs on the server at PW_WS_ENDPOINT.
 * @returns {Promise<{page: import("playwright").Page, close: () => Promise<void>}>}
 */
export async function openPage(
  htmlPath,
  {
    width = 375,
    height = 667,
    isMobile = true,
    rtl = false,
    reducedMotion,
    deviceScaleFactor = 1,
    hideNativePill = false,
    beforeLoad,
    browser: engine = "chromium",
  } = {},
) {
  const { url, close: closeServer } = await serve(htmlPath);
  const browser = engine === "firefox" ? await connectFirefox() : await chromium.launch({
    executablePath: process.env.CHROME_PATH || undefined,
  });
  // Firefox has no mobile emulation, so it gets the viewport and touch only.
  const context = await browser.newContext({
    viewport: { width, height },
    ...(engine === "firefox" ? {} : { isMobile }),
    hasTouch: isMobile,
    reducedMotion,
    deviceScaleFactor,
  });
  const page = await context.newPage();
  if (hideNativePill) {
    // The local dev Quarto renders its own native contents pill at the same spot; a release Quarto does not.
    await page.addInitScript(() => {
      const style = document.createElement("style");
      style.textContent = ".quarto-toc-pill, .quarto-toc-sheet { display: none !important; }";
      const attach = () => {
        if (!document.documentElement) return false;
        document.documentElement.append(style);
        return true;
      };
      if (!attach()) {
        const observer = new MutationObserver(() => {
          if (attach()) observer.disconnect();
        });
        observer.observe(document, { childList: true });
      }
    });
  }
  await beforeLoad?.(page);
  await page.goto(url, { waitUntil: "load" });
  if (rtl) {
    await page.evaluate(() => {
      document.documentElement.dir = "rtl";
    });
  }
  return {
    page,
    close: async () => {
      await browser.close();
      closeServer();
    },
  };
}

/**
 * Print one TAP line and record a failure.
 * @param {string} name Assertion name.
 * @param {boolean} ok Whether the assertion passed.
 * @param {string} [detail] Extra context printed as a TAP comment on failure.
 */
export function tap(name, ok, detail) {
  console.log(`${ok ? "ok" : "not ok"} - ${name}`);
  if (!ok) {
    failed += 1;
    if (detail) {
      console.log(`# ${detail}`);
    }
  }
}

/**
 * Exit with status 1 when any assertion failed, otherwise 0.
 */
export function finish() {
  process.exit(failed > 0 ? 1 : 0);
}
