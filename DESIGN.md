---
name: Gatebreaker
description: Compact download-gate controls for a browser extension.
colors:
  paper: '#f5f4ed'
  ink: '#242820'
  muted: '#565d4e'
  line: '#d2d5c8'
  green: '#365339'
  green-hover: '#29412c'
  focus: '#a65313'
  action-text: '#fff'
  disabled-text: '#666e5f'
  disabled-bg: '#e2e5d9'
  panel-secondary-hover: '#e3ebdc'
  panel-secondary-line: '#a6b79e'
  link-hover: '#1f3825'
  selection-bg: '#dbe6c8'
  selection-text: '#1d2819'
  panel-muted: '#50564a'
  error-line: '#c5a892'
  error-bg: '#fff5ed'
  error-ink: '#713d1d'
  dark-paper: '#1d251e'
  dark-ink: '#eef1e6'
  dark-muted: '#b8c3ac'
  dark-line: '#485440'
  dark-green: '#c2dab1'
  dark-green-hover: '#d0e9bf'
  dark-focus: '#ebaa6c'
  dark-action-text: '#1e321e'
  dark-disabled-text: '#b2bba7'
  dark-disabled-bg: '#35422f'
  dark-link-hover: '#e3f3d7'
  dark-error-line: '#a47b58'
  dark-error-bg: '#36281e'
  dark-error-ink: '#f3cda9'
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
    backgroundColor: '{colors.green}'
    textColor: '{colors.action-text}'
    typography: '{typography.label}'
    rounded: '{rounded.control}'
    padding: '12px 16px'
    width: '100%'
  button-primary-hover:
    backgroundColor: '{colors.green-hover}'
  button-disabled:
    backgroundColor: '{colors.disabled-bg}'
    textColor: '{colors.disabled-text}'
  download:
    backgroundColor: '{colors.green}'
    textColor: '{colors.action-text}'
    typography: '{typography.label}'
    rounded: '{rounded.control}'
    padding: '12px 16px'
    width: '100%'
  download-hover:
    backgroundColor: '{colors.green-hover}'
  button-secondary:
    backgroundColor: 'transparent'
    textColor: '{colors.green}'
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

This records the current implementation in `static/styles.css`, `static/popup.html`, `src/ui/panel.ts`, and `src/ui/action-error.ts`. The interface puts a page title, current status, explanation, and Download in a compact vertical flow. After a successful check, the browser starts file downloads or opens a URL reward in a new tab automatically. A filled fallback link remains above a transparent Try again button. The paper surfaces, forest-green actions, and system typography remain the incumbent visual world.

**Key Characteristics:**

- Warm paper surfaces, green actions, and visible amber keyboard focus.
- System typography and native checkbox behavior.
- Text-led progress, error-only notices, and limited motion.

The descriptive language here is extracted from code. No creative metaphor, audience research, visual approval, or additional brand commitments are assumed.

## Colors

The frontmatter preserves exact source colors. The popup's light palette uses paper, ink, muted text, rules, and green actions; amber marks keyboard focus. The download link shares the filled primary-action palette. The panel retry button uses its own pale hover fill and outline. Disabled controls use muted neutral colors. The intentional error palette adds a warm tinted surface, brown border, and brown text for actionable failures; it does not change the primary action palette.

The sidecar's tonal ramps are synthesized preview aids; they are not additional implemented palette tokens.

The popup follows `prefers-color-scheme: dark`: the corresponding dark tokens replace its surface, text, rule, action, disabled, and download colors. The injected page panel explicitly uses the light palette, including its separate paragraph color. Selection colors remain the light selection pair in both popup themes. Error notices use the light error-line, error-bg, and error-ink tokens in the panel and light popup; the dark popup uses the corresponding dark-error tokens. These semantic additions implement the requested error treatment.

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

Controls use the control radius; the page panel uses the larger panel radius. Borders are (1px) solid. The checkbox keeps the browser's native shape and checked, unchecked, and disabled rendering, with the green accent color.

The geometric extension icon comes from `scripts/icons.mjs`; it is an image in the popup brand, with empty alternative text beside the product name.

## Components

### Primary action

The popup button fills the available width. Enabled hover changes its background. Busy and unavailable controls use native `disabled`, muted gray-green text and fill, a neutral border, and the normal cursor. Disabled hover does not apply. No opacity treatment is used. There is no custom active treatment.

The panel action uses smaller vertical padding (10px), its panel label line height, and full width. Its disabled primary and secondary controls use the same light disabled colors and normal cursor; enabled-only hover preserves that treatment.

### Download link

The retained fallback link is a full-width filled primary control without an underline. It precedes Try again with a bottom margin (10px), and shares primary hover colors. It appears only when a usable result URL is available. It opens in a new tab with `noopener noreferrer`. Download already initiates automatic file delivery or a new-tab URL handoff after success. The status distinguishes Download started, Destination opened, and Link ready; none claims a completed transfer.

For multiple released files, a labeled native Choose a file select remains above Open selected file. Its width follows the container and its colors, border, radius, and keyboard focus follow the local theme. This chooser is a retained fallback after the automatic delivery attempt.

### Secondary retry

After a successful result, Try again becomes transparent with green text and an outlined border. The popup uses its rule color for the border and hover fill; the panel uses the panel-secondary-line and panel-secondary-hover colors. Retry stays below the retained Open download, Open destination, or Open selected file link.

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
- **Do** preserve the popup's automatic dark theme and the panel's explicit light theme when extending these surfaces.
- **Don't** describe a ready link or a started browser handoff as a completed download.
- **Don't** use color alone to communicate checking, errors, or success.
- **Don't** add motion outside the existing reduced-motion preference gate.

### Required CAPTCHA

A required Hypeddit CAPTCHA appears inline inside the existing page box, not in a
separate modal. The toolbar popup offers the same provider-origin frame and hides
the ordinary gate controls during the challenge. The checkbox uses a compact frame
that expands for the image challenge. A polite instruction, Cancel CAPTCHA, retry
and gate-page fallback cover manual completion, expiry and loading failures. The
existing warm-paper surface, control typography, borders and focus treatment remain
in use; Google owns the challenge UI inside the frame.

After bounded Spotify checks still receive refusal, Check download again replaces
the waiting label and the normal error notice explains the refusal. It rechecks
the current session rather than opening another consent window.
