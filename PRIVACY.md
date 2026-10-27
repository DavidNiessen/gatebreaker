# Privacy

Gatebreaker has no telemetry, analytics, Gatebreaker accounts, or external resolver service.
It does not acquire passwords or OAuth tokens, call social APIs itself, generate comments, or accept
lifetime-library marketing opt-ins.

Inspection makes no email or sign-in request. On Hypeddit, when you choose Try skipping gates,
Gatebreaker first tries the anonymous download path. If it fails and the gate requires email, it generates and submits
a Gmail-format placeholder through Hypeddit's own handler once. Optional email submits only after
you click its button. A missing first name is filled with `Listener`; an existing name is preserved.
The placeholder does not create an inbox or provide access to verification messages. Thirty random
hexadecimal characters before `@gmail.com` fit Google's published username limit and carry 120 bits
of randomness. No personal data is used to generate it. A site may still reject this placeholder;
email acceptance is not guaranteed and it must not be presented as a verified address.

Sign in with Spotify/SoundCloud invokes Hypeddit's own control. The provider's login and consent
window appears while the original gate forms remain hidden. Review the permissions, follows, and
saves Hypeddit requests: its authorization may perform those account actions. Gatebreaker never
copies provider credentials, website callback values, or tokens into extension storage. Hypeddit,
the provider, and the browser manage sessions and expiration; cross-site login reuse is not guaranteed.

The extension inspects metadata on supported gate pages. Resolution starts when the user requests
it. Sub2Unlock reads its embedded destination without a network request. Boost.ink may refetch only
the current gate HTML without credentials. Rekonise uses the public metadata and unlock GETs on
`api.rekonise.com`, without credentials, after a cancellable wait. These adapters do not submit
email, social actions, or provider analytics. Hypeddit can make same-origin requests and public-file
checks against the narrowly configured S3 host. These requests disclose the browser’s IP address and requested
resource to the destination server. Provider requests may use the browser’s existing site session
under normal browser cookie rules. After a native action, requests include known ordinary form fields
such as the email placeholder and artist/profile IDs. Gatebreaker does not send page data to a
separate bypass proxy. The extension does not request recovered destinations during resolution.

Rekonise's public gate token stays in the active request's memory; it is not an account token.
Gatebreaker does not save native unlock passes or copy creator contact objects. Recovered URLs,
signed file parameters, and MEGA keys are kept only in the active page/popup state needed to present
the result. They are not written to extension storage or telemetry.

The enable preference is the only value persisted in the browser’s local extension storage. Native
progress and the generated email remain in the current content script's memory and website form.
The preference is not synchronized
through a Gatebreaker service. Removing the extension removes its extension-local settings according
to the browser’s normal behavior. This does not clear provider cookies or revoke authorizations.
Cancel check, navigation, and disabling abort active resolution where possible and discard stale
results. Disabling also prevents new native actions, but cannot
recall an email or authorization already handed to Hypeddit.

Gatebreaker presents an available download link for the user to open. It does not automatically start
downloads. Opening a link or visiting a provider can invoke that destination’s own privacy practices;
the extension does not control the website’s cookies, analytics, links opened by its native handlers,
or account features.

Browser host permissions are limited to supported provider origins and the fixed public-file probe
host. `activeTab` supports the current-tab interaction, and `storage` stores the local enable
preference. Consult the generated manifest for the exact permissions in a particular release.

Issue reports are optional and public unless submitted through a private security-reporting channel.
Remove email addresses, cookies, authorization headers, signed private URLs, and other personal
information before sharing a report or fixture.

Google documents Gmail username limits in [Create a username](https://support.google.com/mail/answer/9211434?hl=en).
