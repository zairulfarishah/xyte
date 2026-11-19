// Game illustrations for the arcade cards — one consistent style:
// 48×48, white 2.4px rounded strokes, soft white fills (.f) and solid accents (.s).
// Plain SVG strings (static, trusted) so the preview page and the app share them.

const svg = body => `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`

export const GAME_ART = {
  flappy: svg(`
    <path class="f" d="M7 30c0-9 7-16 16-16 8 0 13 5 13 12 0 7-6 12-15 12-8 0-14-3-14-8Z"/>
    <path class="f" d="M12 28c3-4 9-4 11 0-3 3-8 3-11 0Z"/>
    <circle class="s" cx="28" cy="22" r="2.2"/>
    <path class="s" d="M35 25l7 1.5-7 3.5"/>
    <path d="M18 11c1-3 4-5 7-4"/>`),
  '2048': svg(`
    <rect class="f" x="6" y="6" width="16" height="16" rx="4"/>
    <rect x="26" y="6" width="16" height="16" rx="4"/>
    <rect x="6" y="26" width="16" height="16" rx="4"/>
    <rect class="s" x="26" y="26" width="16" height="16" rx="4"/>
    <path d="M11.5 12.5a2.5 2.5 0 1 1 4.5 1.5l-4.5 4h5" />
    <path class="k" d="M31 31.5a2.5 2.5 0 1 1 4.5 1.5l-4.5 4h5"/>`),
  snake: svg(`
    <path class="f" d="M8 36c0-5 4-8 9-8h12c3 0 5-2 5-5s-2-5-5-5H21" stroke-width="7" stroke-opacity=".35"/>
    <path d="M8 36c0-5 4-8 9-8h12c3 0 5-2 5-5s-2-5-5-5H21"/>
    <circle class="s" cx="17" cy="18" r="4.5"/>
    <circle class="k" cx="16" cy="17" r="1" stroke-width="1.6"/>
    <circle class="f" cx="38" cy="9" r="4"/><path d="M38 5c0-1.5 1-2.5 2.5-3"/>`),
  reaction: svg(`
    <circle class="f" cx="24" cy="27" r="16"/>
    <path d="M20 5h8M24 5v6M37 13l3-3"/>
    <path class="s" d="M26 17l-7 11h6l-2 9 8-12h-6l2-8Z" stroke-width="1.6"/>`),
  word: svg(`
    <rect class="s" x="4" y="14" width="12" height="20" rx="3"/>
    <rect class="f" x="18" y="14" width="12" height="20" rx="3"/>
    <rect x="32" y="14" width="12" height="20" rx="3"/>
    <path class="k" d="M7 20l2 9 1-5 1 5 2-9" stroke-width="1.8"/>
    <path d="M24 20v9M21 20h6" stroke-width="2"/>
    <path d="M36 29l2-9 2 9M36.6 26h2.8" stroke-width="1.8"/>`),
  memory: svg(`
    <rect class="f" x="6" y="10" width="20" height="28" rx="4" transform="rotate(-10 16 24)"/>
    <rect class="s" x="22" y="10" width="20" height="28" rx="4" transform="rotate(8 32 24)"/>
    <path class="k" d="M32 18l2 4.2 4.6.6-3.3 3.2.8 4.6-4.1-2.2-4.1 2.2.8-4.6-3.3-3.2 4.6-.6Z" stroke-width="1.5"/>`),
  math: svg(`
    <rect class="f" x="5" y="5" width="17" height="17" rx="4"/><rect x="26" y="5" width="17" height="17" rx="4"/>
    <rect x="5" y="26" width="17" height="17" rx="4"/><rect class="s" x="26" y="26" width="17" height="17" rx="4"/>
    <path d="M13.5 9.5v8M9.5 13.5h8M30.5 13.5h8M10.5 31l6 6M16.5 31l-6 6"/>
    <path class="k" d="M30.5 32.5h8M30.5 36.5h8"/>`),
  stack: svg(`
    <rect x="12" y="34" width="26" height="8" rx="2.5"/>
    <rect class="f" x="9" y="24" width="26" height="8" rx="2.5"/>
    <rect class="s" x="15" y="14" width="22" height="8" rx="2.5"/>
    <path d="M22 4v5M19 7l3 3 3-3"/>`),
  whack: svg(`
    <ellipse class="f" cx="20" cy="38" rx="15" ry="5"/>
    <path class="s" d="M10 37c0-9 4-15 10-15s10 6 10 15"/>
    <circle class="k" cx="17" cy="29" r="1" stroke-width="1.8"/><circle class="k" cx="23" cy="29" r="1" stroke-width="1.8"/>
    <path class="k" d="M18.5 33h3" stroke-width="1.8"/>
    <rect class="f" x="30" y="5" width="14" height="9" rx="3" transform="rotate(30 37 9.5)"/>
    <path d="M33 14l-5 9"/>`),
  trivia: svg(`
    <path class="f" d="M8 10a4 4 0 0 1 4-4h24a4 4 0 0 1 4 4v18a4 4 0 0 1-4 4H22l-8 7v-7h-2a4 4 0 0 1-4-4Z"/>
    <path class="s" d="M19.5 15a4.5 4.5 0 1 1 6.5 4c-1.4.7-2 1.6-2 3" stroke-width="2.6"/>
    <circle class="s" cx="24" cy="26.5" r=".6" stroke-width="2.6"/>`),
  blocks: svg(`
    <path class="f" d="M6 30h12v-8h12v8h0v12H6Z"/>
    <path d="M6 30h12v-8h12v20H6Z"/>
    <path d="M18 30v12"/>
    <path class="s" d="M28 6h14v10h-7v10h-7Z"/>`),
  simon: svg(`
    <path class="s" d="M22 6A18 18 0 0 0 6 22h16Z"/>
    <path class="f" d="M26 6a18 18 0 0 1 16 16H26Z"/>
    <path d="M6 26a18 18 0 0 0 16 16V26Z"/>
    <path class="f" d="M26 42a18 18 0 0 0 16-16H26Z"/>`),
  colour: svg(`
    <circle class="f" cx="18" cy="18" r="11"/>
    <circle class="s" cx="30" cy="18" r="11" fill-opacity=".55"/>
    <circle cx="24" cy="30" r="11"/>`),
}

// Display groups for the filters (the games themselves live in scores.js)
export const GAME_GROUPS = [
  { key: 'arcade', label: 'Arcade' },
  { key: 'puzzle', label: 'Puzzle' },
  { key: 'quiz',   label: 'Quiz' },
  { key: 'reflex', label: 'Reflex' },
]
const GROUP_OF = { 2048: 'puzzle', memory: 'puzzle', word: 'puzzle', math: 'quiz', trivia: 'quiz', reaction: 'reflex', simon: 'reflex', colour: 'reflex' }
export const groupOf = key => GROUP_OF[key] || 'arcade'
