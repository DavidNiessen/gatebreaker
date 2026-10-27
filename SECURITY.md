# Security

Gatebreaker reads untrusted website metadata and exposes limited extension capabilities. Security
reports are welcome for unsafe URL handling, privileged message validation, credential exposure,
arbitrary code execution, or behavior that performs social or account actions without the user’s
intent.

Use the repository’s private security-reporting option in the **Security** tab when it is available.
If no private channel is available, open a minimal issue asking the maintainer for one. Do not include
exploit details, personal information, credentials, or a working private download URL in a public
issue.

Include the affected version, browser version, reproduction steps, expected behavior, actual
behavior, and a minimal sanitized fixture where possible. Do not provide another person’s account
or private content to demonstrate a problem.

Security fixes target the latest release and the default branch. There is no guaranteed response or
remediation deadline. Update to the latest version before reporting an issue.

The extension must not evaluate downloaded code, accept arbitrary fetch targets through background
messages, acquire passwords, extract/store OAuth tokens, or call social APIs itself. Native actions
are limited to recognized controls on validated provider origins and initiated through Gatebreaker.
The authorized email flow submits a generated placeholder after a requested anonymous attempt fails,
or after its button is clicked. Social sign-in uses Hypeddit's own login and consent window.

Website progress and markup are untrusted; they never prove a download was released. Popup messages
and status ports must validate the extension ID and exact popup URL. New native actions/providers
require documented behavior and boundary tests. Unexpected submissions or account actions without
user intent are reportable security issues. Server-enforced access remains a product limitation.

Sub2Unlock and Boost parse only the documented embedded destination formats. Rekonise uses a fresh
public gate capability with its ordinary metadata/unlock GETs after a cancellable wait; no account,
social action, email submission, or saved pass is used. Public gate tokens and signed destinations
may exist in active memory to complete that requested operation. They must not be logged, published,
or persisted. This does not authorize reading account tokens or creator contact objects.

Injected controls require trusted user clicks. Every provider request must have bounded responses,
exact origin/route validation, cancellation, and redirect controls. Recovered destinations are
validated and offered separately, never fetched automatically. Preserve legitimate fragment keys
without disclosing them in fixtures or diagnostics. Uploaded Rekonise files require its exact signed
storage route; no general API-host navigation or fetch exception is permitted.
