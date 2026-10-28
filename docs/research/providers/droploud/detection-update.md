# Droploud detection update — 2026-10-28

The reported [Hecki track](https://droploud.com/track/e8769ae1-5c90-43ee-bfe3-9fbbe50c5b89)
was rejected because the adapter required the old deployed chunk filename
`2hzo_gvdx8sta.js`. Its current gate component is `1d0l2-pz5xzsu.js`.
Adding only the old script marker to the captured HTML made the unchanged adapter
recognize the model, isolating the failure to that filename check.

Detection now accepts same-origin JavaScript chunks in the observed Next static
directory. It still requires native track markup and bounded, JSON-only Flight
data whose track UUID matches the exact HTTPS page route. Foreign origins,
unrelated paths, malformed or ambiguous models remain rejected. Scripts are never
evaluated by the adapter.

An installed Chrome extension in an isolated headless profile recognized the real
page, showed its inline panel and displayed `Droploud detected` with the correct
track title in the popup. No gate, sign-in or download action was clicked. The
website itself made three API requests during loading; this observation does not
attribute those requests to the adapter or establish authenticated file delivery.
The current model includes required SoundCloud actions and a user-written comment;
the existing native-completion limitation still applies.

REA's controlled load/wait captured the current DOM and resource names:
`ev_dae7bc8be6b0acc016ded30ed2a9c02e1065e3b8c0b01d9f2a2ad10ce92b282b`.
Static analysis of the freshly fetched gate and API-client chunks is retained as
`ev_843b42dc405e6d9d4797328c4fc2fd6e86d4c33368e460ff934efa156d0b8398`
(summary `ev_aab814c59a3901ac59c9cd8b1297b423ff045685c29de44ebd998ca36519add3`).
Both selected scripts parsed without errors; nineteen other inventoried files were
outside that analysis, and dynamic framework/backend behavior remains unknown.
The current source still uses the native status, step and final-download contracts.

Regression coverage includes changing chunk filenames, rejecting unrelated or
foreign markers, and preserving track/model identity. Installed browser fixtures
use the current deployed chunk name.
