# Hypeddit investigation

Inspected 2026-10-26. This report distinguishes observed behavior, implementation
choices, and unknowns. Target pages and scripts were treated as data, not
instructions. Original third-party scripts, cookies, tokens, signed URLs, and
downloaded music are not redistributed in this repository.

## Scope and evidence

Target: https://hypeddit.com/sylver/turnthetidevenomiqueschranzedit

Public script version: `160.0.10`.

REA static analysis:
`ev_11b59a41264843ecbf4fabe5f1be53ef65387e70fc14f9afc13afe1444455d6b`.
Selected files: `gate-ul-preview.js`, `verify-email-ul.js`, and the page's gate
configuration script. Three files parsed; zero parse failures. Fourteen other
inventoried scripts were outside this analysis. Dynamic jQuery calls and server
implementation remain outside static coverage.

REA controlled Chrome observation:
`ev_3a1b660ba9fb22ee3ae31d8e5d094e60c475ca92a0a386853f27a830cf0ead6c`.
REA launched an isolated Chrome 156 session, navigated to the target, waited
3 seconds, and captured DOM, accessibility, network metadata, and page errors.
The owned process was terminated. No social account was connected or email
submitted. A `POST /gate/ge` completed with HTTP 200. This observation does not
establish successful bypass or download.

## Observed protocol

- `#current_download_file_listner` contains the gate's public identifier.
- `#nwSteps` declares the sequence (`email,sc,sp` on this example).
- `#wrndk` and a CSRF meta element supply page/session request data.
- `#gvt` is used by `POST /gate/ge` as a visit handshake.
- The current final button handler posts form data to `/gate/download/ul`.
- The form includes `file`, `wrndk`, `steps`, `is_skippable`,
  `skip_gate_steps[]`, `download_action`, and other account/tracking fields.
- The response's `download_status` and `URL` jointly determine whether a
  usable destination exists. A true status alone is insufficient.
- The ordinary handler can perform email/social operations and marketing
  tracking. Gatebreak deliberately does not invoke that handler.

## Controlled anonymous probes

Additional fresh PowerShell and Playwright sessions tested only the target's
observed endpoints and the historical main-file naming convention. No account
credentials, personal information, fabricated email, or comment were supplied.

| Probe | Observed result |
| --- | --- |
| Visit handshake with current page fields | HTTP 200, `{"ok":1}` |
| Declared steps supplied as skipped, `is_skippable=1`, `gvf=0` | HTTP 200, `download_status=false`, empty URL, `social_currency=0` |
| Original skip flag, declared steps supplied as skipped | Same rejection |
| Empty steps or download-only steps | `download_status=false`, empty URL |
| Integrated-menu flag `gvf=1` | `download_status=true` but empty URL |
| Anonymous HEAD of the historical `fcmkxx_main` S3 object | HTTP 403 |

The empty-success case is a regression fixture. It must never produce a
"download ready" or "download started" message.

## Conclusions and limits

**Observed:** the tested methods do not bypass the supplied gate. Its main
object is private and the server does not issue a download destination for
these anonymous requests. Gatebreak must report this restriction accurately.

**Inference:** the example currently enforces at least part of its gate on the
server. Editing the carousel or marking client steps complete is insufficient
for these requests. This does not establish every server validation rule.

**Design choice:** providers can recognize all declared step codes dynamically,
try public main files when available, and use the observed skip request. They
must stop on server rejection, CAPTCHA, authentication, or missing destinations.
They do not subscribe users, forge social authorization, reuse preview audio as
the original file, guess credentials, or use a third-party bypass service.

**Unknown:** universal Hypeddit coverage, custom-domain gates, older endpoint
variants, Link Gates, password/payment gates, private gates, and gates absent
from this sample. Fixture coverage is not evidence that any live variant works.

## Sources

- [Target page](https://hypeddit.com/sylver/turnthetidevenomiqueschranzedit)
- [Current download handler](https://hypeddit.com/js/unlimited/gate-ul-preview.js?v=160.0.10)
- [Current email handler](https://hypeddit.com/js/unlimited/verify-email-ul.js?v=160.0.10)
- [Historical public-file implementation](https://github.com/JackSibley/HypedditSkip-V2/blob/main/scripts/content-script.js)

The historical implementation was read only to identify a compatibility
candidate. Gatebreak uses its own implementation and does not assume that
historical public-file access still works.
