# Tag Inspector

A local Chrome Manifest V3 side-panel utility for inspecting analytics evidence, tracking requests, data-layer events, call tracking, and public lead-generation elements.

## Install and build

Requires Node 22.12+ and pnpm. Tested using Node 26 and pnpm 12.

```sh
pnpm install
pnpm build
```

Open `chrome://extensions`, enable **Developer mode**, select **Load unpacked**, and choose this project's `dist` directory. Pin Tag Inspector in Chrome's extension menu. Reload an existing website tab and click the toolbar icon to open its side panel. Chrome 120+ is required.

## Use

- Overview summarizes the current website, observed technologies and public contacts.
- Tags and Call Tracking expose evidence, available IDs, frames and related activity. Installed scripts do not establish correct operation.
- Events shows dataLayer, recognized network, form, DNI and optional incoming postMessage observations. Select a row for redacted JSON. Search includes payloads and event names; filter by source/platform and reverse time order.
- Network exposes recognized requests, method, available status, parameters and linked request IDs. Response bodies are unavailable.
- Page Elements lists public phones, emails and forms; copy or locate individual elements. No entered field values are collected.
- Pause discards new events and requests. Resume only observes new activity; missed network traffic cannot be reconstructed. The header **Clear events** action and Events **Clear timeline** action clear only the active session’s events, preserving capture state, detected elements and network evidence. Network **Clear streams** removes both streams. Settings controls themes, retention, auto capture, postMessage and custom array names.
- Export downloads the current session as JSON. Public page phone numbers/emails are included; payloads and URL query fields follow redaction rules.

Only inspected tabs are retained. Session storage survives service worker suspension but clears on browser close or extension reload. At most 12 sessions are retained; stream/count and byte caps apply. Settings persist locally. There is no backend, telemetry, external account, or remote executable code.

## Development and validation

```sh
pnpm dev       # initial UI build; watches browser scripts
pnpm build     # rebuild UI and all extension assets after edits
pnpm fixture   # local deterministic fixture; open URL printed by Vite
pnpm lint
pnpm check
pnpm typecheck
pnpm test
pnpm test:browser # after pnpm exec playwright install chromium
```

Reload the extension in `chrome://extensions` and reload the fixture after rebuilding. The fixture exercises dataLayer, nested ecommerce, privacy redaction, postMessage, forms, phone changes, SPA navigation and a child frame without contacting analytics vendors. Network parsers have deterministic automated tests.

## Troubleshooting

No observations: verify capture is active, rescan, reload the website, and check extension site access. Restricted Chrome pages and Web Store pages cannot be inspected. Consent tools and blockers can suppress traffic. Existing tabs need reload after installation/update. postMessage capture is opt-in under Settings. Requests sent before inspection are unavailable.

See [architecture and limitations](docs/architecture.md), [reference analysis](docs/reference-analysis.md), [design decisions](docs/design.md), and [validation checklist](docs/validation.md). This tool reports evidence, never successful conversion or successful form submission merely from a request.
