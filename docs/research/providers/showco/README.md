# Show.co — bounded email-download investigation, 2026-10-27

Three genuine historical SoundCloud download links still serve active Show.co
campaign pages: `CfxIBNw` (Nic Fanciulli), `NALep0z` (Basenji), and `usbMlav`
(Jupiter Son). Each returned HTTP 200 and a real `email-for-download` campaign
model, rather than an unavailable-page placeholder.

Primary creator descriptions:

- [Whirlpool Productions / Nic Fanciulli edit](https://soundcloud.com/nicfanciulli/whirlpool-productions-from-disco-to-disco-nic-fanciulli-edit)
- [Hudson Mohawke / Basenji bootleg](https://soundcloud.com/officialbasenji/hudson-mohawke-chimes-basenji-bootleg)
- [Jupiter Son — Drop Down Dirty](https://m.soundcloud.com/we-are-jupiter-son/jupiter-son-drop-down-dirty)

The embedded `show-campaign-data` gives campaign identity, presentation, and
collection settings, with no original destination. The native `efd` client submits
`POST https://api.show.co/campaigns/email-for-download/<campaign id>/email` with
the entered data and analytics. Its confirmation screen says the link will arrive
by email; its Open button opens the user's email service. No public reward-URL
lookup was established in the selected source. The form's native flow also
requires legal/marketing acceptance and can collect name and birthdate.

No email, fabricated age/name, signup, consent, analytics, or file request was
submitted. A random address would not provide access to emailed verification or
download messages. No adapter or host permission is added. This is a static,
bounded finding for these three campaigns, not a proof of every Show.co campaign
type or backend route. The continued existence of a landing page does not verify
the original file's availability.

REA parent `ev_b10c48f130c08e01d505d79dc7513089accb21dccc3151f9b1c8588bb2fe3d1e`;
summary `ev_47d3d7f69f04434147a0175765eb7ce54754ce90a8833b9ac712ada43ed18883`.
Selected public source:
`https://dcxytnb1cgejb.cloudfront.net/js/efd.35f21d4a.js`, 31,648 bytes,
SHA-256 `f0b2ab83a37c62f8fc94c580afd03e90ef65d2d72e891a8665cb0308d25751f6`.
One script, zero parse failures, three HTML files outside analysis selection.
Dynamic/framework and server behavior remain partial/unknown. No raw HTML,
tracking configuration, campaign responses, or private destinations are published.
