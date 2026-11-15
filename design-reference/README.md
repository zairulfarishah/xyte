# Xyte design reference — "Board" style

Current style, approved 15 Nov 2026. Inspiration: a personal-finance dashboard concept (navy frame,
white bento cards, teal accents). Live example: `src/pages/DashboardBoard.jsx` + `DashboardBoard.css`.
Preview it was built from: `preview-dashboard-finance-style.html`.

(The earlier "Skyline" blue-glass style was replaced; the Add Site form in `src/components/siteForm/`
still uses Skyline-era tokens and can be moved over when it is next touched.)

## Feel
A dark navy frame holding a light grey-blue board; on it, white rounded cards in a bento grid.
One or two navy "hero" cards with teal accents. Dense but calm: thin chart marks, hairline grids,
lots of numbers with clear labels. No emoji, no rainbow.

## Colours
| Token | Value | Use |
|---|---|---|
| `--frame` | `#121c33` | page background around the board |
| `--board` | `#dfe6f0` | the board (rounded 28px) |
| `--card` | `#ffffff` | cards (rounded 20px) |
| `--ink` | `#13213d` | headings, numbers |
| `--ink-2` | `#3c4a66` | body text |
| `--ink-3` | `#5d6b85` | labels, axis text (lightest text allowed on white) |
| `--grid` | `#e7ecf3` | hairline grid and table rules |
| `--navy` | `#1b2f57` | hero cards, selected pill, avatars |
| `--teal` | `#22b5c6` | accent on navy only (rings, current-year bar, selected outline) |
| `--alert` | `#c4261e` | "No crew", urgent counts — sparingly |

Navy hero gradient: `linear-gradient(150deg, #1b2f57, #2a4a80 70%, #2e6aa8)`.

## Chart colours (validated with the dataviz palette checker)
- **One series → one colour**: `--s1` `#2a78d6` (blue). Emphasise "now" (today / this week /
  this month) in blue and grey the rest with `--rest` `#c3cfdf`.
- **Categories (max 3)**: blue `#2a78d6`, orange `#eb6834`, aqua `#1baf7a` — in that order. Passes
  colour-blind checks all-pairs. Aqua is below 3:1 on white, so always show a legend table with numbers.
- **Comparison series** (e.g. last year): grey `#9aa7ba`, same axis.
- Navy cards: bars in `rgba(255,255,255,.35)`, current one teal.
- Never two y-axes. Every chart gets a hover tooltip. Bars have 4px rounded tops, square bottoms.

## Type
Poppins 400/500/600. Card titles 14px/600 with an 11px grey qualifier on the right
("16 Nov – 21 Nov", "per day"). Big numbers 30–44px/600.

## Shapes & parts
- Pills: fully rounded. Selected = navy with a 1.5px teal inner outline (period switch) or plain navy.
- Tables: hairline rows, small grey header, today's rows tinted `#eef5ff` with a 3px blue left bar.
- Avatars: 28–30px navy circles with initials (photo if available).
- Rings: 6px stroke, teal on navy.

## Layout
Desktop (≥1200px): 4-column bento —
`today week week where` / `today sched sched type` / `trend trend year type`.
Tablet: 2 columns. Phone: one column, ordered by importance (today → this week's sites → charts).
Charts draw at the real card width (ResizeObserver) so text never shrinks.

## Readability rules (hard)
- White text only on navy. Dark text only on white / the board.
- Text never wears a series colour; colour sits on the mark beside it.
- Popups/modals use z-index ≥ 3200 (the app sidebar is 3001, top bar 3000).

## Content priority
People open Xyte to see **which sites are on, where, and who is going**. The today card and the
week table come first; stats after.
