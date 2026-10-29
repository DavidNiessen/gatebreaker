---
version: 1
slug: 'scripts-icons-mjs'
primary_target: 'scripts/icons.mjs'
related_targets: ['static/icons/gatebreaker.svg']
---

# Gatebreaker icon

A local replacement of the toolbar mark within Gatebreaker's established blue system.
Mode: Operate. Used in Chrome/Firefox toolbars at 16–32px, extension management at
48–128px and repository/CLI documentation at larger sizes. Preserve existing UI
colors and behavior. The user selected a gate opening into a download arrow through the structured
preference question.

## Direction contract

THESIS: A visible opening and downward arrow communicate a download escaping a gate;
replace the cramped angular G with an immediately readable silhouette.
OWN-WORLD: Retain blue #2555a6, white portal strokes and an icy blue download arrow.
Use a rounded square silhouette, transparent outer corners, rounded stroke ends,
and no letters, gradients or shadows.
STORY: Recognize Gatebreaker in a crowded browser toolbar, then open its controls.
FIRST VIEWPORT: A 128-unit master, inset blue square, open portal centered above a
downward arrow. Generate 16, 32, 48, 64, 128, 256 and 512px PNGs from matching geometry.
FORM: Authored vector geometry; local brand asset, no whole-surface concept roll.
SEED REFERENCE: none, narrow asset scope.
FINISH: reviewed and documented. The fresh finish reviewer returned ship, no material
fixes after checking small-size clarity, alignment, transparent corners and matching
SVG/raster geometry. The mechanical detector returned []. All seven shipping PNGs
carry Source and impeccable:prompt provenance fields; the documentation pass parsed
their expected dimensions and 8-bit RGBA encoding. The actual-size 16/32/48px light
and dark comparison and larger SVG/raster comparison are recorded in
work/icon-review/sizes-and-themes.png.

## Shipped asset record

[Icon documentation](../../docs/branding.md) records the implemented 128-unit
geometry, exact asset colors, deterministic regeneration, actual-size verification,
provenance and ship verdict. Regenerate the SVG and all seven PNGs together with
`node scripts/icons.mjs`; do not hand-edit individual rasters.

The incumbent [DESIGN.md](../../DESIGN.md) remains the UI authority. This local
brand-asset replacement introduces no new UI world or UI tokens. Root DESIGN.md,
PRODUCT.md and .impeccable/design.json are preserved. Reported pre-existing sidecar
staleness is outside the requested scope and was not repaired or canonized.
