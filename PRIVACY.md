# Privacy

Gatebreaker has no telemetry, analytics, user accounts, or external resolver service. It does not ask
for an email address, social login, or OAuth authorization, and it does not perform follows, saves,
comments, or marketing opt-ins.

The extension inspects metadata on supported gate pages. Resolution starts when the user requests
it. It can make same-origin requests to the gate provider and public-file checks against the narrowly
configured S3 host. These requests necessarily disclose the browser’s IP address and requested
resource to the destination server. Provider requests may use the browser’s existing site session
under normal browser cookie rules. Gatebreaker does not send page data to a separate bypass proxy.

The enable preference is stored in the browser’s local extension storage. It is not synchronized
through a Gatebreaker service. Removing the extension removes its extension-local settings according
to the browser’s normal behavior.

Gatebreaker presents an available download link for the user to open. It does not automatically start
downloads. Opening a link or visiting a provider can invoke that destination’s own privacy practices;
the extension does not control the website’s cookies, analytics, or account features.

Browser host permissions are limited to supported provider origins and the fixed public-file probe
host. `activeTab` supports the current-tab interaction, and `storage` stores the local enable
preference. Consult the generated manifest for the exact permissions in a particular release.

Issue reports are optional and public unless submitted through a private security-reporting channel.
Remove email addresses, cookies, authorization headers, signed private URLs, and other personal
information before sharing a report or fixture.
