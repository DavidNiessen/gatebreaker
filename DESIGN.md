---
name: Gatebreaker
description: Compact download-gate controls for a browser extension.
colors:
  paper: '#f4f6fb'
  ink: '#202b3d'
  muted: '#526178'
  line: '#cbd3df'
  accent: '#2555a6'
  accent-hover: '#1a428b'
  focus: '#a65313'
  action-text: '#fff'
  disabled-text: '#5e6d83'
  disabled-bg: '#e0e6f0'
  panel-secondary-hover: '#e1e9f7'
  panel-secondary-line: '#a4b3cc'
  link-hover: '#153d7d'
  selection-bg: '#d8e6ff'
  selection-text: '#132f58'
  panel-muted: '#526178'
  error-line: '#c5a892'
  error-bg: '#fff5ed'
  error-ink: '#713d1d'
  dark-paper: '#172131'
  dark-ink: '#edf2fa'
  dark-muted: '#b3c2d8'
  dark-line: '#45546c'
  dark-accent: '#bad1fb'
  dark-accent-hover: '#d0e0ff'
  dark-focus: '#ebaa6c'
  dark-action-text: '#142d56'
  dark-disabled-text: '#b1bfd3'
  dark-disabled-bg: '#2d3d55'
  dark-link-hover: '#e2ecff'
  dark-error-line: '#a47b58'
  dark-error-bg: '#36281e'
  dark-error-ink: '#f3cda9'
  dark-control-line: '#8495b0'
  dark-selection-bg: '#2555a6'
  dark-selection-text: '#edf2fa'
typography:
  body:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: '14px'
    lineHeight: 1.55
  title:
    fontSize: '23px'
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: '-0.025em'
  brand:
    fontSize: '19px'
    fontWeight: 750
    letterSpacing: '-0.02em'
  state:
    fontSize: '12px'
    fontWeight: 650
  label:
    fontFamily: 'system-ui, sans-serif'
    fontSize: '14px'
    fontWeight: 600
    lineHeight: 1.4
  panel-title:
    fontSize: '16px'
    fontWeight: 700
    lineHeight: 1.3
  panel-body:
    fontSize: '13px'
    lineHeight: 1.5
  panel-label:
    fontFamily: 'system-ui, sans-serif'
    fontSize: '14px'
    fontWeight: 600
    lineHeight: 1.3
  small:
    fontSize: '12px'
  footer:
    fontSize: '11px'
rounded:
  control: '7px'
  panel: '12px'
spacing:
  focus-offset: '3px'
  panel-title-gap: '6px'
  toggle-gap: '7px'
  brand-gap: '9px'
  download-gap: '10px'
  small: '12px'
  paragraph: '14px'
  medium: '16px'
  panel-inset: '18px'
  header-block: '20px'
  popup-inset: '22px'
  main-start: '24px'
  main-end: '26px'
components:
  button-primary:
    backgroundColor: '{colors.accent}'
    textColor: '{colors.action-text}'
    typography: '{typography.label}'
    rounded: '{rounded.control}'
    padding: '12px 16px'
    width: '100%'
  button-primary-hover:
    backgroundColor: '{colors.accent-hover}'
  button-disabled:
    backgroundColor: '{colors.disabled-bg}'
    textColor: '{colors.disabled-text}'
  download:
    backgroundColor: '{colors.accent}'
    textColor: '{colors.action-text}'
    typography: '{typography.label}'
    rounded: '{rounded.control}'
    padding: '12px 16px'
    width: '100%'
  download-hover:
    backgroundColor: '{colors.accent-hover}'
  button-secondary:
    backgroundColor: 'transparent'
    textColor: '{colors.accent}'
    rounded: '{rounded.control}'
    padding: '12px 16px'
    width: '100%'
  button-secondary-hover:
    backgroundColor: '{colors.line}'
  action-error:
    backgroundColor: '{colors.error-bg}'
    textColor: '{colors.error-ink}'
    rounded: '{rounded.control}'
    padding: '12px'
  action-error-dark:
    backgroundColor: '{colors.dark-error-bg}'
    textColor: '{colors.dark-error-ink}'
    rounded: '{rounded.control}'
    padding: '12px'
  panel:
    backgroundColor: '{colors.paper}'
    textColor: '{colors.ink}'
    rounded: '{rounded.panel}'
    padding: '18px'
---

# Design System: Gatebreaker

## Overview

This records the current implementation in `static/styles.css`, `static/popup.html`, `src/ui/panel.ts`, and `src/ui/action-error.ts`. The interface puts a page title, current status, explanation, and Download in a compact vertical flow. After a successful check, the browser starts file downloads or opens a URL reward in a new tab automatically. A filled fallback link remains above a transparent Try again button. The cool paper surfaces, blue actions, and system typography remain the incumbent visual world.

**Key Characteristics:**

- Cool paper surfaces, blue actions, and visible amber keyboard focus.
- System typography and native checkbox behavior.
- Text-led progress, error-only notices, and limited motion.

The descriptive language here is extracted from code. No creative metaphor, audience research, visual approval, or additional brand commitments are assumed.

## Colors

The frontmatter preserves exact source colors. The popup's light palette uses paper, ink, muted text, rules, and accent actions; amber marks keyboard focus. The download link shares the filled primary-action palette. The panel retry button uses its own pale hover fill and outline. Disabled controls use muted neutral colors. The intentional error palette adds a warm tinted surface, brown border, and brown text for actionable failures; it does not change the primary action palette.

The sidecar's tonal ramps are synthesized preview aids; they are not additional implemented palette tokens.

Both the popup and injected page panel follow `prefers-color-scheme: dark`, including live system changes without rebuilding controls or clearing entered comments. The dark palette uses navy surfaces and pale blue actions; the light palette uses cool paper and blue actions. Text, fields, focus, disabled controls, selections and error notices use the corresponding theme tokens. Shadow-root tokens keep the panel independent of the host website's colors. The toolbar and popup mark uses the blue action color.

## Typography

The system font stack is the only font source; there are no external fonts. The popup title leads the hierarchy, followed by the brand, body explanation, status text, and footer. Status has increased weight. The panel uses a smaller heading and paragraph, with its own control line height.

Long titles and explanatory text wrap anywhere. Popup headings use balanced wrapping. There is no display-face or editorial type system to extend.

## Layout

The popup is (360px) wide and capped at the viewport width. Header and footer have a horizontal inset of (22px); the main area uses the same inset. Header padding is (20px 22px), main padding is (24px 22px 26px), and footer padding is (16px 22px). Header and footer use flex layouts with space between their contents.

The injected panel is inserted immediately after the original control and follows its containing width. It has vertical margins of (16px), an inset of (18px), and full-width actions. Popup controls have a minimum height of (46px); panel controls use (44px). The checkbox is (17px) square inside a label with a minimum height of (32px).

There is no viewport breakpoint or grid system. Content and hidden-state changes determine height.

## Elevation & Depth

The implementation has no shadows. Thin borders separate popup regions and outline the panel and controls; background colors communicate action and availability.

## Shapes

Controls use the control radius; the page panel uses the larger panel radius. Borders are (1px) solid. The checkbox keeps the browser's native shape and checked, unchecked, and disabled rendering, with the blue accent color.

The geometric extension icon comes from `scripts/icons.mjs`; it is an image in the popup brand, with empty alternative text beside the product name.

## Components

### Primary action

The popup button fills the available width. Enabled hover changes its background. Busy and unavailable controls use native `disabled`, muted blue-gray text and fill, a neutral border, and the normal cursor. Disabled hover does not apply. No opacity treatment is used. There is no custom active treatment.

The panel action uses smaller vertical padding (10px), its panel label line height, and full width. Its disabled primary and secondary controls use the same light disabled colors and normal cursor; enabled-only hover preserves that treatment.

### Download link

The retained fallback link is a full-width filled primary control without an underline. It precedes Try again with a bottom margin (10px), and shares primary hover colors. It appears only when a usable result URL is available. It opens in a new tab with `noopener noreferrer`. Download already initiates automatic file delivery or a new-tab URL handoff after success. The status distinguishes Download started, Destination opened, and Link ready; none claims a completed transfer.

For multiple released files, a labeled native Choose a file select remains above Open selected file. Its width follows the container and its colors, border, radius, and keyboard focus follow the local theme. This chooser is a retained fallback after the automatic delivery attempt.

### Secondary retry

After a successful result, Try again becomes transparent with accent text and an outlined border. The popup uses its rule color for the border and hover fill; the panel uses the panel-secondary-line and panel-secondary-hover colors. Retry stays below the retained Open download, Open destination, or Open selected file link.

### Enabled checkbox and footer link

The popup preference uses a labeled native checkbox. It becomes disabled while a preference save is pending. The footer source/help link is underlined and has a text-color hover state.

### Status and page panel

Status and explanation text use polite live announcements; busy state is exposed with `aria-busy`. The popup covers waiting, detected, checking, download-started, destination-opened, link-ready, unable-to-skip, and page-unavailable states. Error detail comes from the result message. User-supplied titles are inserted as text.

Download starts automatic email and supported gate steps. Required native
sign-ins appear below a thin divider as full-width outlined secondary controls,
with a provider heading, consent explanation, and required-step text.
Pending required sign-ins disable Download and hide result controls. A newly
discovered required sign-in explains automatic continuation after completion;
Cancel check remains available while paused. Completed sign-in controls stay visible
and disabled, labeled Connected to the service; their required-step detail is hidden.
These controls communicate native connection state. Routine email completion,
prepared addresses, and native progress messages do not form a notice log.

The bordered error notice appears only for an actionable native-step or browser-delivery
failure. It has an assertive alert role, (12px) padding, a (1px) border, and the control
radius. When no required sign-ins exist, the notice appears without a redundant
provider heading, hint, or divider. A successful result clears stale native-step
errors. Current work remains in the main polite status. There is no separate email
action or optional sign-in control.

All keyboard focus uses an outline (3px) with an offset (3px). Hidden elements are removed from layout. Popup buttons and download links transition background over (0.15s ease-out) only when reduced motion is not requested; the panel applies that transition only to its button.

## Do's and Don'ts

- **Do** keep primary actions full width and status text readable before the action.
- **Do** retain native checkbox, disabled, keyboard-focus, and live-status behavior.
- **Do** preserve automatic system light/dark themes in both the popup and page panel when extending these surfaces.
- **Don't** describe a ready link or a started browser handoff as a completed download.
- **Don't** use color alone to communicate checking, errors, or success.
- **Don't** add motion outside the existing reduced-motion preference gate.

### Required CAPTCHA

A required Hypeddit CAPTCHA appears inline inside the existing page box, not in a
separate modal. The toolbar popup offers the same provider-origin frame and hides
the ordinary gate controls during the challenge. The checkbox uses a compact frame
that expands for the image challenge. A polite instruction, Cancel CAPTCHA, retry
and gate-page fallback cover manual completion, expiry and loading failures. The
current theme's surface, control typography, borders and focus treatment remain
in use. The CAPTCHA wrapper follows system changes; Google's widget receives the
current light/dark theme when created and remains intact while it is being solved.

After bounded Spotify checks still receive refusal, Check download again replaces
the waiting label and the normal error notice explains the refusal. It rechecks
the current session rather than opening another consent window.
