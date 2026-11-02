# Validation

## Executed

- Dependency install with pnpm and an explicit esbuild build-script allowlist.
- Biome lint/check, strict TypeScript, 43 passing Vitest unit/DOM/UI tests, Vite/esbuild production build.
- Isolated Chrome for Testing 156 (Playwright Chromium): unpacked extension loads, service worker starts, configured toolbar behavior enables Side Panel opening, DOM forms/contacts arrive, existing/future dataLayer entries arrive, pause discards events, resume captures new events, postMessage secrets are redacted, child frame events retain frame identity, intercepted deterministic GA4 requests reach webRequest with HTTP 204, SPA navigation changes navigation ID, reload clears prior events, clear empties streams, clearing all data leaves sessions paused and able to resume, tab sessions remain isolated, stopping/restarting the service worker preserves retained sessions, and light/dark extension UI renders without runtime errors.
- Browser network fixture is fulfilled locally through Playwright interception. No analytics vendor receives test traffic.
- Screenshots in `docs/screenshots` were visually reviewed at 390 px width.

Run the browser integration again with:

```sh
pnpm exec playwright install chromium
pnpm build
node scripts/browser-test.mjs
```

The test launches an isolated browser profile and a localhost fixture server. It does not touch your everyday Chrome profile.

## Remaining manual checks

The native Chrome toolbar click and docked Side Panel shell require an interactive Chrome session; automated checks exercise its configuration and the same extension page in a browser tab. They do not constitute a native-shell interaction test.

1. Load `dist`, pin the extension, reload a website, click the actual toolbar icon. Confirm the native side panel opens.
2. Resize the native panel to 320 px and 600 px. Navigate every section with keyboard only; verify visible focus, no horizontal overflow, and readable detail payloads.
3. Switch active tabs in two Chrome windows. Verify each panel follows its own window and no cross-site events appear.
4. Grant/revoke site access and use restricted Chrome/Web Store pages. Check actionable errors and reload behavior.
5. Run fixture controls: dataLayer, ecommerce, postMessage (opt-in), number replacement, validation failure, valid local form submit, frame events and SPA route.
6. Inspect a consent-gated real analytics implementation and distinguish installed scripts, observed requests and unsuccessful/blocked requests.
7. Test Back/Forward Cache, cross-origin inaccessible/sandboxed frames, and an ad blocker. Unsupported visibility must not appear as proof of absence.
8. Export/copy JSON and public contacts, clear data, close/reopen Chrome. Confirm settings persist and sessions do not.

## Explicit coverage limits

Generic DOM success/error states and provider-specific form success callbacks are not implemented. Provider-specific DNI attribution is not implemented. Cookies are not read. Configuration extraction beyond Google, Meta, and UET is limited to recognizable script IDs and safe request fields. Host signatures may require updates as providers change endpoints. A full commercial cross-site compatibility audit has not been performed.

## UI refinements and event reset regression

Validated the loaded extension in isolated Chromium after the refinements:

- Header **Clear events** empties authoritative session events and UI/Overview/footer counts while retaining frame inventory, network evidence and capture state.
- Old-generation batches sent from the actual extension isolated world after a reset are rejected.
- New interactions continue to produce events; paused resets remain paused.
- Section navigation and closing/reopening the extension UI preserve cleared state.
- Clearing the inspected tab leaves another tab's captured events intact; worker restart retains session state.
- Both themes checked at 320×560, 390×850 and 600×1200. Root/shell/footer fill the viewport on short content, no horizontal overflow, and overflowing Overview uses document scrolling with main overflow visible.
- Light/dark screenshots visually reviewed in `docs/screenshots/refined-*`. These exercise the real extension UI in Chrome for Testing; native docked side-panel shell interaction remains on the manual checklist above.
- Unit/UI regressions cover reset boundaries, persistence, paused state, retained requests/evidence, counters, and stale polling responses arriving after reset.
