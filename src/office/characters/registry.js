// Character models. To add a real person model later: drop the .glb in public/models/,
// add an entry here, and point people at it.
//   url        .glb / .gltf file (or a .js module whose default export is a data URL)
//   clips      the names of the clips inside the file; sit/type/read/coffee/write/city/look/talk are
//              optional — if a model has them, the real clip is used instead of the pose layer
//   additive   clips layered on top (nods, head shakes)
//   walkSpeed  metres per second the walk clip was made for
// Put the model under the key `default` to switch it on. Until then the built-in people are used.
//   default: { url: '/models/crew.glb', clips: { idle: 'Idle', walk: 'Walk' }, additive: [], walkSpeed: 1.25 },
export const CHARACTER_MODELS = {}

export const TINTS = [
  { body: '#4a4d52', joint: '#e0b131' }, { body: '#7c8189', joint: '#c4302b' }, { body: '#c8a888', joint: '#7a3e33' },
  { body: '#5b5d61', joint: '#d39a4a' }, { body: '#2f3f63', joint: '#c8682f' }, { body: '#2e7d74', joint: '#2b2d31' },
]

// .glb/.gltf load directly; a .js module exporting a data URL is also accepted
export const resolveModelUrl = url => url.endsWith('.js')
  ? import(/* @vite-ignore */ new URL(url, location.href).href).then(m => m.default)
  : Promise.resolve(url)
