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
Multiple released files use a native file chooser
above one explicit Open selected file action in the panel and popup.

Rekonise displays a cancellable countdown based on the native widget's timer bounds before requesting
its destination. It uses no account, social action, email submission, or saved pass. Snippet gates
are outside the URL-output interface. Sub2Unlock and Boost read publicly embedded destinations;
some destinations lead to another gate. Opening remains a separate user action.

The starting-page panel and extension popup expose Download as the start of
automatic email and supported gate-step handling. Hypeddit submits a random
dictionary word at `icloud.com` through its native email handler after Download;
there is no separate email button. Only required native sign-ins are shown. Every
pending required sign-in locks Download and hides ready destinations until native
completion. Sign-in controls identify the provider and ask users to review requested
actions and permissions. A newly discovered required sign-in pauses that attempt
and resumes automatically after confirmation. Cancel check stops the active attempt
or pending continuation. Progress and errors remain in Gatebreaker. OAuth credentials
are not collected or stored; cross-site login reuse is not guaranteed. PUSH.fm's
opaque gate receipts are held only in the current page's memory for its final lookup.

Native flows have installed Chrome/Firefox fixture coverage, including multiple
native callback windows. Real Chrome checks recovered three newly supported PUSH.fm
rewards and detected two required Spotify logins on a fourth gate. No real account
authorization was performed; real-account unlocks remain unverified. Only supported
steps are automated. The product does not claim to bypass private, payment, CAPTCHA,
or authentication requirements.

The primary audience has not been specified beyond people using download gates. No user research, approval of a visual direction, or additional brand personality has been supplied. The compact operational interface is documented from the implementation in DESIGN.md.
