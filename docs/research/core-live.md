# Core-only live smoke check — 2026-10-28

The compiled ESM core was imported directly in plain Node with an injected inert
JSDOM parser and a restricted HTTP transport. No browser or extension was running
for this check. Twelve public pages were read: six Droploud tracks, including the
reported Hecki link, and six GateRush gates from the retained corpus.

All twelve were recognized. The six Droploud checks sent only the native status
POST, each returning HTTP 200 and a server-required result for the fresh anonymous
session. Five GateRush checks made only a HEAD request, each returning HTTP 403 and
an input-required result for the missing configured comment. The remaining
recognized GateRush Link Gate returned not-supported without a provider request.

The transport refused every comment/step/email write, authorization request,
download request with a body, and reward transfer. These outcomes validate the
reusable core's parsing, request boundaries and refusal handling; they do not
establish real authenticated comment/repost completion or file delivery.

The sanitized [results](core-live-results.json) retain page digests and method/path/
HTTP-status records. They contain no native session identifiers, credentials,
public comment text or signed reward URLs.
