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
messages, submit email addresses, authenticate to social services, or automatically perform social
actions. Server-enforced access requirements that the extension cannot resolve are a documented
product limitation, not evidence that it should attempt to acquire a user’s credentials.
