# Gatebreaker icon

The mark is an open gate with a downward download arrow. The user selected this
direction while retaining the established blue palette. This is an asset-specific
extension of the incumbent [design system](../DESIGN.md), whose UI colors,
typography, controls, themes and behavior remain unchanged.

## Source and geometry

`scripts/icons.mjs` is the authoritative geometry and generator. It writes
`static/icons/gatebreaker.svg` and square PNGs at 16, 32, 48, 64, 128, 256 and 512px.
The PNG renderer evaluates the same authored geometry directly; it does not invoke
an SVG rasterizer or use generated imagery.

The master uses a 128-unit square canvas. Its blue rounded square begins at (4, 4),
measures 120 units on each side and has a 28-unit corner radius. Outer corners are
transparent. The gate rises from (30, 86) to (30, 40), rounds through a 10-unit arc
to (40, 30), crosses to (88, 30), and rounds down to (98, 40) before ending at
(98, 86). The arrow runs from (64, 48) to (64, 95); its head connects (48, 80),
(64, 96) and (80, 80). Gate and arrow use 10-unit strokes with round caps and joins.
The opening, visible blue gap and downward point carry the meaning without letters.

| Asset color             | Value     | Use                                   |
| ----------------------- | --------- | ------------------------------------- |
| Established action blue | `#2555a6` | Rounded square                        |
| Established cool paper  | `#f4f6fb` | Open gate                             |
| Ice blue                | `#bcd9ff` | Download arrow; asset-specific accent |

These values describe the icon only. Ice blue does not introduce a new UI token.
Keep the mark flat, with transparent outer corners, and preserve its geometry and
color relationships when changing its display size.

## Regeneration

From the project root, with project dependencies installed:

```sh
node scripts/icons.mjs
```

Commit the generator and generated SVG/PNGs together when changing the mark. Do not
hand-edit a PNG. The generator uses deterministic PNG encoding and supersampling:
8 samples per axis through 48px, 4 through 256px, and 2 at 512px.

## Verification and finish verdict

The fresh finish reviewer returned **ship, no material fixes**. Review covered
small-size clarity, alignment, transparent corners and agreement between vector
and raster geometry. The mechanical detector returned an empty finding list
(`[]`). This is a narrow icon verdict, not approval of unrelated UI surfaces.

`work/icon-review/sizes-and-themes.png` records the review sheet: 16, 32 and 48px
icons at actual display size on light and dark toolbar backgrounds, plus 128px
and larger raster/SVG comparisons. The arrow and gate remain distinguishable at
toolbar sizes, and the rounded silhouette remains aligned across both themes.
When revising the mark, repeat the actual-size comparison before judging enlarged
masters; verify corners on both backgrounds and compare the SVG with the PNGs.

The documentation pass inspected the source, generated SVG and review sheet, and
parsed all seven shipping PNGs. Each has its expected square dimensions, 8-bit
RGBA encoding and both provenance fields below (7/7 present).

## Provenance

The mark is original authored vector geometry under the project's MIT license.
There is no external image dependency. Every PNG embeds these `tEXt` entries:

- `Source`: `Original Gatebreaker vector geometry, scripts/icons.mjs; MIT licensed.`
- `impeccable:prompt`: `Original Gatebreaker vector mark, rasterized from scripts/icons.mjs and static/icons/gatebreaker.svg; MIT licensed, no generated imagery.`

Preserve those fields when regenerating or packaging the rasters. The second field
is provenance for an authored asset; it does not claim an image-generation prompt.

The incumbent root `DESIGN.md` remains the UI authority. It and
`.impeccable/design.json` were preserved; reported pre-existing sidecar staleness
is outside this icon task and has not been repaired or adopted as a new rule.
