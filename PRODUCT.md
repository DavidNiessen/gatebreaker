# Gatebreaker

Gatebreaker is an open-source browser extension for Chrome and Firefox. The intended outcome is software that is ready for users and can be extended with additional download-gate providers.

The implementation uses TypeScript, Prettier, and separate provider adapters. Supported current
formats are Sub2Unlock embedded links, Boost.ink encoded links, Rekonise public link/uploaded-file
gates, and partial Hypeddit downloads. New-provider live checks recovered destinations from 38 URLs
(including two Boost locale variants): 10 Sub2Unlock, 8 Boost, and 20 Rekonise. This is sample evidence,
not a guarantee for every gate, future format, or destination's file availability. Hypeddit's prior
sample found usable downloads in 9 of 25 active gates. ToneDen remains unsupported after 14 sampled
gates required authentication.

SoundCloud-oriented additions are Valorizd public link/file rewards (10/10 current
music gates, including two with email capture enabled) and partial PUSH.fm Reward
Links (5/10 final responses in a varied corpus, including a public example and an
already ungated two-file reward). Valorizd reads only the current slug's public
projected fields; the anonymous PUSH.fm attempt supplies the native empty action
state. These public attempts use no accounts, email addresses, social actions,
analytics writes, or file requests. After Download, PUSH.fm also handles supported
native click acknowledgements: three previously refused live examples now resolve.
Required Spotify authorization remains user initiated. Server refusals remain failures.
After Download succeeds, released files are handed automatically to the browser
download API, including each validated file in a multiple-file reward. URL rewards
open automatically in a new tab. The panel and popup retain a fallback link;
multiple released files also retain a native file chooser above Open selected file.
A browser handoff is reported as started, not as a completed transfer.

Rekonise displays a cancellable countdown based on the native widget's timer bounds before requesting
its destination. It uses no account, social action, email submission, or saved pass. Snippet gates
are outside the URL-output interface. Sub2Unlock and Boost read publicly embedded destinations;
some destinations lead to another gate. After Download, a recovered URL reward opens
automatically in a new tab; the retained Open destination link permits another attempt.

The starting-page panel and extension popup expose Download as the start of
automatic email and supported gate-step handling. Hypeddit submits a random
dictionary word at `icloud.com` through its native HTTP verification endpoint after Download;
there is no separate email button. Only required native sign-ins are shown. Every
pending required sign-in locks Download and hides ready destinations until native
completion. Sign-in controls identify the provider and ask users to review requested
actions and permissions. A newly discovered required sign-in pauses that attempt
and resumes automatically after confirmation. Cancel check stops the active attempt
or pending continuation. Current progress stays in the main status. The native-step
notice shows actionable errors only, without a routine completion or prepared-address
log. Completed native controls remain visible and disabled as Connected to the service.
Disabled controls use muted gray-green text and fill with the normal cursor.
OAuth credentials are not collected or stored; cross-site login reuse is not guaranteed.
PUSH.fm reuses only its own receipt for the exact same gate and native driver, and only
when that native control is disabled. Existing native-cookie restoration requires a disabled control; new receipts
require the exact owned consent window and matching callback. It is not a global Spotify login flag
and does not involve extracting OAuth credentials.

Native flows have installed Chrome/Firefox fixture coverage, including multiple
native callback windows. Real Chrome checks recovered three newly supported PUSH.fm
rewards and detected two required Spotify logins on a fourth gate.
Authored Chrome and Firefox browser checks cover native action, delivery, fallback,
cancellation, and error states using intercepted browser APIs and synthetic provider
results. A real Chrome download check saved one authored data-text file in an isolated
temporary directory. No real account authorization was performed; real-account
unlocks remain unverified. Only supported steps are automated. The product does not claim to bypass private, payment, CAPTCHA,
or authentication requirements.

The primary audience has not been specified beyond people using download gates. No user research, approval of a visual direction, or additional brand personality has been supplied. The compact operational interface is documented from the implementation in DESIGN.md.

GateRush and Droploud are partial HTTP adapters. Gate processing calls known provider
endpoints directly rather than clicking their controls or updating forms. Page load
remains inert. An existing server-authorized session is tried before introducing a
new account requirement. Required consent windows remain explicit. Twenty-four
GateRush pages and seventeen Droploud pages were investigated; fresh comment gates
remain blocked, GateRush link rewards remain unsupported, and real authenticated
file delivery is unverified. No new visual styles accompany these adapters.
