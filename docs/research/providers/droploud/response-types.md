# Droploud final response types — 2026-10-29

A user-reported successful response identified the hosted file type as `r2`.
The previous validator allowed only omitted, `native` or `external` values and
rejected the otherwise valid response before URL validation and delivery.

The sanitized shape is:

```json
{
  "download_url": "<server-issued signed HTTPS file URL>",
  "type": "r2",
  "points_earned": 0,
  "daily_cap_reached": false
}
```

Omitted, `native` and `r2` types produce a file; `external` produces a page.
Other types still fail. Existing HTTPS, credentials, private-address and
recursive/control-route checks apply to every accepted type. Auxiliary points/cap
fields do not affect approval. The signed URL passes unchanged to automatic file
delivery, preserving query encoding and content-disposition parameters.

Regression checks use authored URLs and dummy signatures only. They verify the
complete response shape, exact URL preservation, the file download API path and
unsafe R2 destinations. Installed Chrome/Firefox fixtures intercept delivery and
never fetch media. The user's signed URL and storage account identifiers were
not saved as fixtures, published or requested by this investigation.
