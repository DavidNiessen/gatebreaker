# Droploud required email step - 2026-10-29

The supplied STEIN gate declares an `email` step with the exact ID/type pair
`email` / `email`. Gatebreaker previously handled configured comments, native
SoundCloud authorization, Instagram and optional Droploud follows, but omitted
this email request. A final download could therefore fail with `Email step not
completed` even when other steps had finished.

The newly fetched gate hook calls its step helper with the email value and
`consent: true`; that helper posts `{session_id, step, value, ...extra}` to
`/api/gate/<track>/step`. The native email checkbox covers receiving the track and
occasional artist updates, with storage under Droploud's privacy policy. The
adapter now sends only the configured fixed address for that declared step,
including its required consent flag. It never copies a fan-prefill address or
applies consent to unrelated steps.

REA parsed the selected hook and API client as inert shipped JavaScript: two
files, zero parse failures, 21 other inventory files unselected. The static graph
is partial; this is not backend source or an observation of account execution.
Parent Evidence: `ev_252ddda9b182c7dc7435115cf5fb81590be710cbff73df6d63df790f7c5bc8a9`.
Summary Evidence: `ev_5f590ff1e65edecae132f2d969f98ca42f2018dc0f0ddf5bc382dbf3758b2e50`.
The UI checkbox copy was read separately from its shipped rendering chunk.
[The contract record](email-step-contract.json) retains exact source identities,
UTF-8 byte ranges and sanitized live evidence.

One source-confirmed live email POST on the supplied gate returned HTTP 200 with
`ok: true`, using a fresh anonymous native UUID and the configured address. It
used no real account, requested no final download and fetched no media. The UUID
and address are omitted from that evidence. This proves email acknowledgement,
not authenticated completion of the gate's remaining steps.

The accepted email acknowledgement is cached only in the active gate session,
invalidated when its native SID changes, and repaired after an explicit native
missing-email refusal. A successful saved download receipt still returns directly.
Refused or malformed acknowledgements stop before later steps. Read-only inspection
and non-automatic resolution do not submit email.

Unit cases cover payload, required-step matching, rejection, stale responses,
SID replacement, cached continuation after sign-in and native-refusal recovery.
Installed Chrome/Firefox fixtures cover standalone email unlock, refusal and an
email step combined with native SoundCloud authorization. All account callbacks
and file delivery in those browser fixtures are synthetic/intercepted.
