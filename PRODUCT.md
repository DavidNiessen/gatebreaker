# Gatebreaker

Gatebreaker is an open-source browser extension for Chrome and Firefox. The intended outcome is software that is ready for users and can be extended with additional download-gate providers.

The implementation uses TypeScript, Prettier, and separate provider adapters. Supported current
formats are Sub2Unlock embedded links, Boost.ink encoded links, Rekonise public link/uploaded-file
gates, and partial Hypeddit downloads. New-provider live checks recovered destinations from 38 URLs
(including two Boost locale variants): 10 Sub2Unlock, 8 Boost, and 20 Rekonise. This is sample evidence,
not a guarantee for every gate, future format, or destination's file availability. Hypeddit's prior
sample found usable downloads in 9 of 25 active gates. ToneDen remains unsupported after 14 sampled
gates required authentication.

Rekonise displays a cancellable countdown based on the native widget's timer bounds before requesting
its destination. It uses no account, social action, email submission, or saved pass. Snippet gates
are outside the URL-output interface. Sub2Unlock and Boost read publicly embedded destinations;
some destinations lead to another gate. Opening remains a separate user action.

The starting-page Gatebreaker panel controls supported Hypeddit native steps. After a requested anonymous
attempt fails, a required email step submits a generated placeholder. Spotify/SoundCloud buttons
launch Hypeddit's own sign-in windows while individual gate forms remain hidden. Progress and errors
stay in Gatebreaker; the website session is used for the validated final download request. Tokens
are not collected or stored by the extension, and cross-site login reuse is not guaranteed.

Native flows have Chrome/Firefox fixture coverage; real-account unlocks remain unverified. The
product does not claim to bypass private, payment, CAPTCHA, or authentication requirements.

The primary audience has not been specified beyond people using download gates. No user research, approval of a visual direction, or additional brand personality has been supplied. The compact operational interface is documented from the implementation in DESIGN.md.
