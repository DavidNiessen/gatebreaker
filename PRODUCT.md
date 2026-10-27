# Gatebreaker

Gatebreaker is an open-source browser extension for Chrome and Firefox. The intended outcome is software that is ready for users and can be extended with additional download-gate providers.

The requested implementation uses TypeScript, Prettier, and a clean architecture with extensible gate providers. The current provider is Hypeddit. Live validation found usable links in 9 of 25 sampled gates; that sample is evidence of partial support, not a general success-rate promise.

The starting-page Gatebreaker panel controls supported native steps. After a requested anonymous
attempt fails, a required email step submits a generated placeholder. Spotify/SoundCloud buttons
launch Hypeddit's own sign-in windows while individual gate forms remain hidden. Progress and errors
stay in Gatebreaker; the website session is used for the validated final download request. Tokens
are not collected or stored by the extension, and cross-site login reuse is not guaranteed.

Native flows have Chrome/Firefox fixture coverage; real-account unlocks remain unverified. The
product does not claim to bypass private, payment, CAPTCHA, or authentication requirements.

The primary audience has not been specified beyond people using download gates. No user research, approval of a visual direction, or additional brand personality has been supplied. The compact operational interface is documented from the implementation in DESIGN.md.
