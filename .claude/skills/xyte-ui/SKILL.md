---
name: xyte-ui
description: Xyte's "Board" UI style and workflow. Use whenever designing, redesigning or styling any Xyte screen, page, form, modal, card, chart or HTML preview (dashboard, Add Site, Sites, Calendar, etc.), so new UI matches the approved navy-frame / white-card / teal-accent look and avoids generic AI-looking design.
---

# Xyte UI — Board style

Full reference (colours, chart colours, type, layout, readability rules): `design-reference/README.md`.
Read it before designing. The live example to copy from is the dashboard:
`src/pages/DashboardBoard.jsx` + `src/pages/DashboardBoard.css`.

## Workflow (the user expects this)
1. **Preview first.** For any new design or redesign, build a standalone HTML preview at the repo
   root (`preview-<thing>.html`, served at `http://localhost:5173/preview-<thing>.html`).
   When asked for ideas, give 3–5 clearly different options on one page with a tab switcher.
   If the user sends an inspiration image, follow its look closely but keep Xyte's content priority.
   Use made-up names/places in previews and say so.
2. **Wait for the user's choice.** Do not change the real app until they say go.
3. **Then build it** in React: one component + one CSS file per page, classes prefixed per page
   (`bd-` for the dashboard, `sf-` for the site form; pick a short new prefix for other pages).
   Reuse existing logic and utils (`utils/siteDays`, `utils/memberDay`, `utils/teamLeaves`,
   `components/siteForm/siteFormModel.js`) instead of rewriting it.
4. **Check it.** Lint the changed files (`npx eslint <files>`) and check `.vite-dev.err` for new errors.
   The app needs a login, so to see a component render it on a temporary `zz-*.html` page at the repo
   root (import it from `/src/...`, wrap in `MemoryRouter`, give it mock props) and screenshot it with
   headless Edge (`msedge --headless=new --screenshot=… --window-size=…`; for phone width, load it inside a
   390px iframe because Edge won't size a window that narrow). Look at the screenshot, fix, delete the
   `zz-*` files. Say plainly what was and wasn't verified.

## Look (summary — details in the README)
- Page: navy frame `#121c33`; board `#dfe6f0` rounded 28px; white cards rounded 20px, soft shadow.
- Navy hero cards (`#1b2f57 → #2a4a80`) with teal `#22b5c6` accents (rings, current bar, selected outline).
- Text: ink `#13213d`, ink-2 `#3c4a66`, ink-3 `#5d6b85` (lightest allowed). Alert red `#c4261e` sparingly.
- Font: Poppins 400–600. Card title 14px/600 + small grey qualifier on the right.
- Pills fully rounded; selected = navy (period switch adds a teal inner outline).
- Icons: `lucide-react`. No emoji in the UI.

## Charts
- Load the `dataviz` skill before writing chart code; run its palette validator for any new colour set.
- One series = blue `#2a78d6`, emphasise "now" and grey the rest (`#c3cfdf`).
- Up to 3 categories: blue `#2a78d6`, orange `#eb6834`, aqua `#1baf7a`, with a legend table of numbers.
- Comparison series grey `#9aa7ba` on the same axis. Never two y-axes. Every chart has hover tooltips.
- Draw charts at the measured card width so labels stay readable on phones.

## Readability rules (hard)
- White text only on navy. Dark text only on white / the board. Text never in a series colour.
- Modals/popups: z-index ≥ 3200 (sidebar is 3001, top bar 3000) or they get hidden.

## Avoid (looks generic / "AI-made" to this user)
- Multi-colour KPI cards with coloured top borders, glow blobs, rainbow gradient text, emoji icons.
- Text on light/see-through backgrounds that hurt contrast; tall decorative panels that waste space.

## Content priority
People open Xyte to see **which sites are on, where, and who is going**. Lead with that;
stats and admin counts come after. Must work at phone width (stack to one column).
