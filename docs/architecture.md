# Architecture

Gatebreaker separates provider rules, orchestration, browser capabilities, and UI. Browser-specific
background configuration is generated at build time; provider behavior is shared by Chrome and
Firefox.

| Location                          | Responsibility                                                                                 |
| --------------------------------- | ---------------------------------------------------------------------------------------------- |
| `src/domain/provider.ts`          | Provider contracts, gate metadata, and resolution results. No browser APIs.                    |
| `src/application/resolve-gate.ts` | Select a matching provider and coordinate resolution through injected dependencies.            |
| `src/providers/hypeddit.ts`       | Recognize Hypeddit pages, inspect their gate metadata, and resolve supported public downloads. |
| `src/platform/browser.ts`         | Adapt extension APIs and messages to the application’s dependencies.                           |
| `src/entrypoints/content.ts`      | Inspect the current page and provide a user-initiated action.                                  |
| `src/entrypoints/background.ts`   | Handle narrowly scoped privileged operations and public-file checks.                           |
| `src/entrypoints/popup.ts`        | Show extension state and store the local enable preference.                                    |

The provider contract is:

```ts
interface GateProvider {
  id: string;
  name: string;
  matches(url: URL): boolean;
  inspect(document: Document, url: URL): Gate | null;
  resolve(gate: Gate, context: ProviderContext): Promise<Resolution>;
}
```

Use the exported types in `src/domain/provider.ts` as the authoritative API. Providers receive their
dependencies through the resolution context rather than importing extension APIs. Same-origin
requests use the context’s fetch capability. Public-file checks use the background adapter, which
restricts requests to the configured S3 host.

## Resolution flow

1. Inspect a supported page and identify a gate. Inspection does not perform social actions.
2. Wait for the user to request resolution.
3. Resolve using page metadata and permitted network capabilities.
4. If anonymous resolution is rejected, submit required email once through the native handler and
   expose supported Spotify/SoundCloud sign-in actions inside Gatebreaker. Individual gate forms stay
   hidden; provider login/consent windows remain native. Track website completion/errors and timeouts.
5. After native actions, use a separate website-session request containing only known form fields.
   Required steps are not blanket-skipped in this path. Never read or persist social tokens.
6. Offer a validated download link when one is available, or explain why resolution is unavailable.
7. Let the user open the link. Gatebreaker does not automatically start a download.

The enable preference is local browser storage. It is not an account setting and is not sent to a
service. Keep status messages useful: distinguish an unsupported gate, a missing public file, and a
network failure instead of treating every unsuccessful attempt as a successful bypass.

## Trust boundaries

- Treat page text, embedded scripts, gate identifiers, filenames, and network responses as untrusted
  input. Parse known data shapes; do not evaluate page-supplied code.
- Validate origins and URL schemes before requests or link navigation. A matching pathname on an
  unrelated host is not a supported gate.
- Background messages must not turn the extension into an arbitrary URL fetcher. Validate the sender
  and operation, and restrict public-file probes to the fixed host and expected path shape.
- Keep credentials and direct social APIs outside the provider interface. Optional `actions`,
  `performAction`, and `actionProgress` methods describe narrowly scoped native website actions through
  `application/gate-actions.ts`. New native submission behavior must be documented and tested.
- `providers/hypeddit/actions.ts` handles native controls/progress; `request.ts` captures and whitelists
  ordinary website request data. The anonymous path excludes email and profile targets. Developer
  live diagnostics explicitly request anonymous-only resolution, with no automatic email fallback.
- The optional provider `presentation` hook owns the insertion anchor, native form selectors, and
  initial Download selector. `hypeddit/presentation.ts` contains those Hypeddit rules; the content
  entrypoint applies them generically and restores the original UI when disabled.
- Native progress is page-memory state, not authorization proof. Content generation/abort tracking
  discards stale download results. Popup status ports validate the exact extension identity and URL.
- Add host permissions only when a provider needs them, and document the reason. Avoid broad host
  access and external resolver proxies.

## Current boundary

Hypeddit can enforce requirements on its server. Finding a gate’s client-side step metadata does not
prove that a downloadable file is public, and clearing a visual step does not create access to a
server-protected file. The supplied example currently has server-enforced steps that Gatebreaker
cannot bypass. Neither the provider contract nor the UI promises support for every Hypeddit gate.
