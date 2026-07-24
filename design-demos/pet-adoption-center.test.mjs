import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, extname, relative, resolve } from 'node:path';
import { after, before, test } from 'node:test';
import { chromium } from 'playwright';

const demoDirectory = dirname(fileURLToPath(import.meta.url));
const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
};

let browser;
let baseUrl;
let server;

function createDemoServer() {
  return createServer(async (request, response) => {
    const requestUrl = new URL(request.url ?? '/', 'http://127.0.0.1');
    const requestedPath = decodeURIComponent(requestUrl.pathname);
    const candidate = resolve(demoDirectory, `.${requestedPath}`);
    const candidateRelativePath = relative(demoDirectory, candidate);

    if (
      candidateRelativePath.startsWith('..') ||
      candidateRelativePath === '' ||
      !existsSync(candidate)
    ) {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('Not found');
      return;
    }

    try {
      const content = await readFile(candidate);
      response.writeHead(200, {
        'content-type': contentTypes[extname(candidate)] ?? 'application/octet-stream',
      });
      response.end(content);
    } catch {
      response.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('Unable to read demo asset');
    }
  });
}

before(async () => {
  server = createDemoServer();
  await new Promise((resolveServer) => server.listen(0, '127.0.0.1', resolveServer));
  const address = server.address();

  if (address === null || typeof address === 'string') {
    throw new Error('The local demo server did not expose a TCP address.');
  }

  baseUrl = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({ headless: true });
});

after(async () => {
  await browser?.close();
  await new Promise((resolveServer) => server?.close(resolveServer));
});

test('renders sample pets, composes filters, and recovers from an empty result', async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const externalRequests = [];
  page.on('request', (request) => {
    if (!request.url().startsWith(baseUrl)) {
      externalRequests.push(request.url());
    }
  });
  const response = await page.goto(`${baseUrl}/pet-adoption-center.html`, {
    waitUntil: 'domcontentloaded',
  });

  assert.equal(response?.status(), 200, 'the adoption-center entry point should be served');
  await assert.doesNotReject(
    page.getByRole('heading', { name: /find your companion/i }).waitFor(),
  );
  assert.equal(
    await page.locator('#empty-state').isHidden(),
    true,
    'the empty state should stay hidden while sample pets are available',
  );

  const initialCards = page.locator('[data-pet-card]');
  assert.ok((await initialCards.count()) >= 4, 'the initial result set should show sample pets');

  await page.selectOption('#species-filter', 'dog');
  assert.equal(await initialCards.count(), 2, 'the species filter should narrow the visible cards');
  await assert.doesNotReject(
    page.getByRole('status').filter({ hasText: /2 companions/i }).waitFor(),
  );

  await page.selectOption('#age-filter', 'kitten');
  assert.equal(await initialCards.count(), 0, 'combined filters should be able to expose an empty state');
  assert.equal(await page.locator('#empty-state').isVisible(), true);
  assert.equal(await page.locator('#pet-grid').isHidden(), true);

  await page.locator('#empty-reset').focus();
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('#species-filter').inputValue(), 'all');
  assert.equal(await page.locator('#age-filter').inputValue(), 'all');
  assert.equal(await page.locator('#empty-state').isHidden(), true);
  assert.equal(
    await page.evaluate(() => document.activeElement?.id),
    'species-filter',
    'reset should restore focus to the filtering context',
  );

  await page.selectOption('#species-filter', 'cat');
  await page.selectOption('#age-filter', 'adult');
  await page.selectOption('#energy-filter', 'gentle');
  assert.equal(await initialCards.count(), 1, 'all three filter criteria should compose');
  await assert.doesNotReject(page.getByRole('heading', { name: 'Luna' }).waitFor());
  assert.deepEqual(externalRequests, [], 'the local demo should not request remote resources');

  await page.close();
});

test('moves a selected pet into a recoverable local application flow', async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const initialUrl = `${baseUrl}/pet-adoption-center.html`;
  await page.goto(initialUrl, { waitUntil: 'domcontentloaded' });

  await page.getByRole('button', { name: /start an introduction for luna/i }).click();
  await page.waitForFunction(
    () => document.activeElement?.id === 'applicant-name',
    undefined,
    { timeout: 1000 },
  );
  await assert.doesNotReject(
    page.getByText(/a gentle introduction for luna starts here/i).waitFor(),
  );

  await page.getByRole('button', { name: /finish local introduction/i }).click();
  assert.equal(await page.locator('#application-errors').isVisible(), true);
  assert.equal(await page.locator('#applicant-name').getAttribute('aria-invalid'), 'true');
  assert.equal(await page.locator('#applicant-email').getAttribute('aria-invalid'), 'true');
  assert.equal(await page.locator('#home-rhythm').getAttribute('aria-invalid'), 'true');
  assert.equal(
    await page.evaluate(() => document.activeElement?.id),
    'application-errors',
    'the error summary should receive focus after an invalid submit',
  );

  await page.locator('#applicant-name').fill('Avery Green');
  const remainingErrorText = await page.locator('#application-errors').innerText();
  assert.doesNotMatch(
    remainingErrorText,
    /Enter your name\./,
    'the live error summary should drop a resolved field',
  );
  assert.match(remainingErrorText, /Enter a valid email address\./);
  assert.match(remainingErrorText, /Choose what home feels like\./);
  await page.locator('#applicant-email').fill('avery@example.test');
  await page.selectOption('#home-rhythm', 'quiet');
  await page.getByRole('button', { name: /finish local introduction/i }).click();

  assert.equal(page.url(), initialUrl, 'local submission should not navigate away from the demo');
  assert.equal(await page.locator('#application-success').isVisible(), true);
  await assert.doesNotReject(
    page.getByText(/nothing was sent to a shelter or stored/i).waitFor(),
  );
  assert.equal(
    await page.evaluate(() => document.activeElement?.id),
    'application-success',
    'the local acknowledgement should receive focus after a valid submit',
  );

  await page.close();
});

test('respects reduced motion when moving from a pet card to the application', async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    window.__petAdoptionScrollOptions = [];
    Element.prototype.scrollIntoView = function scrollIntoView(options) {
      window.__petAdoptionScrollOptions.push(options ?? null);
    };
  });
  await page.goto(`${baseUrl}/pet-adoption-center.html`, { waitUntil: 'domcontentloaded' });

  await page.getByRole('button', { name: /start an introduction for luna/i }).click();
  const scrollOptions = await page.evaluate(() => window.__petAdoptionScrollOptions);
  assert.deepEqual(
    scrollOptions.at(-1),
    { behavior: 'auto', block: 'start' },
    'reduced-motion visitors should not receive a smooth programmatic scroll',
  );

  await page.close();
});

test('keeps the adoption center discoverable from the design-demo index', async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(`${baseUrl}/index.html`, { waitUntil: 'domcontentloaded' });

  const demoLink = page.locator('a[href="pet-adoption-center.html"]');
  assert.equal(await demoLink.count(), 1, 'the design-demo index should expose one adoption-center link');
  await demoLink.click();
  await page.waitForURL(/pet-adoption-center\.html$/);
  await assert.doesNotReject(
    page.getByRole('heading', { name: /find your companion/i }).waitFor(),
  );

  await page.close();
});

test('keeps essential controls keyboard-visible and reflowed at 320 CSS pixels', { timeout: 5000 }, async () => {
  const page = await browser.newPage({ viewport: { width: 320, height: 760 } });
  page.setDefaultTimeout(1000);
  page.setDefaultNavigationTimeout(1000);
  await page.goto(`${baseUrl}/pet-adoption-center.html`, { waitUntil: 'domcontentloaded' });

  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement?.className), 'skip-link');
  const skipLinkTop = await page.locator('.skip-link').evaluate((element) => element.getBoundingClientRect().top);
  assert.ok(skipLinkTop >= 0, 'the skip link should become visible when reached by keyboard');

  await page.locator('#species-filter').focus();
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'age-filter');
  const focusStyle = await page.locator('#age-filter').evaluate((element) => {
    const styles = getComputedStyle(element);
    return { outlineStyle: styles.outlineStyle, outlineWidth: styles.outlineWidth };
  });
  assert.equal(focusStyle.outlineStyle, 'solid');
  assert.notEqual(focusStyle.outlineWidth, '0px');

  const dimensions = await page.evaluate(() => ({
    bodyWidth: document.body.scrollWidth,
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
  }));
  assert.ok(dimensions.bodyWidth <= dimensions.viewportWidth, 'body should not need horizontal scrolling');
  assert.ok(dimensions.documentWidth <= dimensions.viewportWidth, 'document should reflow within 320 CSS pixels');
  await assert.doesNotReject(
    page.getByRole('heading', { name: /a considered path to a shared home/i }).scrollIntoViewIfNeeded(),
  );
  await assert.doesNotReject(
    page.getByRole('heading', { name: /start with a small, honest introduction/i }).scrollIntoViewIfNeeded(),
  );

  await page.close();
});
