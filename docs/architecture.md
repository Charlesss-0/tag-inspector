# Architecture

## Build and layers

Vite builds the React side panel with Tailwind CSS. esbuild emits independent classic IIFE content scripts and the worker; no content script depends on imports unsupported by Chrome's static content-script loader. All code is bundled locally. Manifest V3 uses the Side Panel API with toolbar-click behavior.

`core/` contains raw models, detector registration, event parsers, public DOM inventory, privacy transforms, and session retention. `extension/main.ts` observes arrays and known globals in MAIN. `extension/content.ts` scans in ISOLATED, batches events, monitors DOM changes, and performs reversible highlights. `extension/background.ts` serializes storage mutations and observes requests. `app/` renders real session data.

## Lifecycle

Only tabs opened in the inspector have sessions. Automatic capture controls initial session state. Static content scripts are installed at document_start in HTTP(S) frames; existing tabs need reloading after extension installation. The panel follows its window's active tab. Full top-level navigation creates a fresh session. SPA history updates retain observations with a new navigation ID. Frame messages are checked against browser-provided document IDs. Closing a tab removes its session.

`chrome.storage.session` holds data across worker suspension, with a serialized mutation queue to avoid lost updates. Settings alone use persistent local storage. Stream limits are 100/300/600 each, with a byte budget and a maximum of 12 sessions. Old sessions and observations are trimmed. Browser close/extension reload clears session storage. Event resets persist a session-specific capture generation before notifying all frames. Content batches include the session ID and generation; stale batches are rejected, and local pending batches are discarded without reinstalling MAIN instrumentation or replaying dataLayer history. Network observations older than the reset timestamp do not reenter the event timeline. The event-only action preserves request evidence and inventory. Panel action responses invalidate older polling responses.

Paused sessions discard incoming observations and network completions; inventory can still be rescanned. No background data is transmitted.

## Observation strategy

Network uses non-blocking webRequest, including beacon/image requests, body data where exposed, and completion status. It never reads headers, cookies, response bodies, or sends/replays requests. Fetch/XHR wrapping was considered and rejected: webRequest covers these transports without patching their behavior or double-counting requests. Google batched bodies produce distinct event observations linked by request ID.

MAIN wrappers call the original push with its receiver and arguments and return the original result. A slow discovery timer supports late arrays and reassignment without installing global property setters. Existing entries are bounded; array replacement and cached original function references may cause gaps. Instrumentation errors cannot block push. A JSON CustomEvent bridge avoids postMessage feedback loops. The bridge is not authenticated against page scripts: payloads are untrusted, size bounded, redacted, and cannot invoke privileged actions. Optional postMessage capture records incoming listener observations only.

DOM mutation scans are debounced, bounded, and limited to supported metadata. No field values are read. Submit clicks, native submit and validation events are observations, never success claims. Provider-specific success callbacks are not implemented; custom form success UIs cannot be reliably inferred. Phone changes are unconfirmed DNI evidence, never attributed solely from provider coexistence. Public contacts have explicit copy/export behavior.

## Permissions and sources

- `sidePanel`: primary UI and action behavior.
- `storage`: settings and suspended-worker-safe session state.
- `webRequest`: observe supported tracking endpoints without blocking.
- `webNavigation`: document/frame identity and route transitions.
- HTTP(S) host access: inspect arbitrary user-selected websites and their third-party tracking destinations; webRequest requires access to both initiator and target. No cookies, debugger, history, clipboard, downloads, or remote-code permissions.

API decisions checked against primary Chrome documentation:
- [Side Panel](https://developer.chrome.com/docs/extensions/reference/api/sidePanel)
- [webRequest](https://developer.chrome.com/docs/extensions/reference/api/webRequest)
- [Content scripts and execution worlds](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts)
- [Storage](https://developer.chrome.com/docs/extensions/reference/api/storage)

## Coverage limits

Signatures are heuristic evidence. Google, Meta, and UET have request decoders; other registry entries expose recognized endpoint traffic and available safe parameters. The registry includes all requested tag/call providers, but first-party proxies, new endpoints, renamed globals, minified custom initialization, server-side tracking, and blocked traffic may not be detected. Provider-specific DNI attribution and universal form completion detection are not claimed.

No cookie values are inspected. No shadow DOM traversal, restricted/browser pages, file URLs, or guaranteed inaccessible-frame observation. No pre-inspection network history, response bodies, request headers, outbound postMessage interception, or correctness verdicts. JSON data is bounded and redacted; unknown string fields are deliberately omitted, reducing arbitrary custom event detail. Public phone/email metadata is intentionally retained. Page URLs can contain personal data in paths; avoid inspecting sensitive pages and clear/export deliberately.
