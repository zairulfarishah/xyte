import { Link } from 'react-router-dom'
import { X } from 'lucide-react'
import { GAMES } from '../pages/games/scores'
import { timeAgo } from '../utils/feed'

// What the side panel shows for each object. Real data only; when something
// couldn't load, the panel says so instead of showing a number.

const fmtDay = s => new Date(`${s}T00:00:00`).toLocaleDateString('en-MY', { weekday: 'short', day: 'numeric', month: 'short' })
const titleize = s => String(s || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 19 ? 'Good afternoon' : 'Good evening' }
const n = v => (v == null ? '—' : v)

function Row({ title, sub, meta, to, onClick }) {
  const body = <><div className="main"><b>{title}</b>{sub && <span>{sub}</span>}</div>{meta}</>
  if (to) return <Link className="of-row link" to={to}>{body}</Link>
  if (onClick) return <button className="of-row link" onClick={onClick}>{body}</button>
  return <div className="of-row">{body}</div>
}
const Tag = ({ tone = 'm', children }) => <span className={`of-tag ${tone}`}>{children}</span>
const Tile = ({ title, sub, to }) => <Link className="of-tile" to={to}><b>{title}</b><span>{sub}</span></Link>
const Empty = ({ children }) => <p className="of-empty">{children}</p>
const Btn = ({ to, primary, children, onClick }) => to
  ? <Link className={`of-btn${primary ? ' primary' : ''}`} to={to}>{children}</Link>
  : <button className={`of-btn${primary ? ' primary' : ''}`} onClick={onClick}>{children}</button>

// Game pictograms (static SVG markup from the prototype)
const ICO = {
  blocks: '<path d="M3 14h6v6H3zM9 14h6v6H9zM9 8h6v6H9zM15 14h6v6h-6z"/>',
  colour: '<rect x="3" y="3" width="8" height="8" fill="#e0664f" stroke="none"/><rect x="13" y="3" width="8" height="8" fill="#4fd36f" stroke="none"/><rect x="3" y="13" width="8" height="8" fill="#e8a43c" stroke="none"/><rect x="13" y="13" width="8" height="8" fill="#5b8bd6" stroke="none"/>',
  word: '<rect x="2" y="7" width="6" height="8"/><rect x="9" y="7" width="6" height="8" fill="#4fd36f" stroke="#4fd36f"/><rect x="16" y="7" width="6" height="8"/><path d="M4 19h16"/>',
  flappy: '<circle cx="9" cy="12" r="4"/><path d="M6 12l-3-2M13 11h3M18 2v6M18 16v6"/>',
  2048: '<rect x="3" y="3" width="18" height="18" rx="1"/><text x="12" y="15" font-size="7" text-anchor="middle" fill="currentColor" stroke="none">2048</text>',
  memory: '<rect x="3" y="5" width="9" height="13" rx="1" transform="rotate(-8 7 11)"/><rect x="12" y="5" width="9" height="13" rx="1" transform="rotate(8 16 11)"/><circle cx="16.5" cy="11.5" r="1.6" fill="currentColor"/>',
  math: '<path d="M7 4v8M3 8h8M14 15l6 6M20 15l-6 6M14 6h7"/>',
  reaction: '<path d="M13 2L5 14h6l-1 8 8-12h-6z"/>',
  simon: '<path d="M12 3a9 9 0 0 1 9 9h-9z" fill="#4fd36f" stroke="none"/><path d="M21 12a9 9 0 0 1-9 9v-9z" fill="#e0664f" stroke="none"/><path d="M12 21a9 9 0 0 1-9-9h9z" fill="#5b8bd6" stroke="none"/><path d="M3 12a9 9 0 0 1 9-9v9z" fill="#e8a43c" stroke="none"/>',
  snake: '<path d="M3 18h6v-6h6V6h6"/><circle cx="6" cy="6" r="1.6" fill="currentColor"/>',
  stack: '<path d="M5 20h14M6 16h12M8 12h9M9 8h6"/>',
  trivia: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .8-1 1.7M12 17v.5"/>',
  whack: '<path d="M3 20c2-5 16-5 18 0"/><circle cx="12" cy="13" r="2.5"/><path d="M15 3l5 5M17.5 5.5L13 10"/>',
}
const GameIcon = ({ k }) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: ICO[k] || ICO.blocks }} />

const PROG_INFO = {
  pt: { path: '/pt-mapper', lede: 'Mark scanned post-tension cable positions onto the drawing, floor by floor.', spec: [['Inside', 'draped tendons + anchors'], ['Input', 'PDF / DXF drawing'], ['Output', 'marked PDF, Excel']], count: d => d.ptJobs, unit: 'jobs saved' },
  scan: { path: '/scan-points', lede: 'Mark every drill point on the drawing and clear it before drilling. The whole team can mark at the same time.', spec: [['Inside', 'drill grid · red = clash'], ['Input', 'PDF drawing'], ['Output', 'marked PDF, point list']], count: d => d.scanProjects, unit: 'projects' },
  layout: { path: '/layout', lede: 'Draw structural layouts, sections and loads, with a 3D view.', spec: [['Inside', 'column rebar cage'], ['Input', 'DXF, manual'], ['Output', 'PDF, Excel']] },
  pdf: { path: '/tools', lede: 'Everyday PDF jobs without uploading anywhere.', spec: [['Tools', 'merge · split · rotate'], ['', 'extract · watermark · compress']] },
}

function panelFor(k, ctx) {
  const { data: d, crew, doing, isZairul, go, hotspotTitle } = ctx
  const inOffice = crew.filter(c => c.status === 'office').length
  const onSite = crew.filter(c => c.status === 'site').length

  if (k === 'dashboard') return {
    eyebrow: 'Wall TV', title: greeting(), lede: 'Today across all sites. Everything here is one click from its page.',
    body: <>
      <div className="of-stats">
        <div><b>{d.todaySites.length}</b><span>Sites today</span></div>
        <div><b>{inOffice}<small>/{crew.length}</small></b><span>In the office</span></div>
        <div><b>{n(d.approvals)}</b><span>Waiting for approval</span></div>
        <div><b>{onSite}</b><span>Out on site</span></div>
      </div>
      <h4>Waiting for approval</h4>
      <div className="of-rows">
        <Row title="Expense claims" sub="Pending review" meta={<Tag tone={d.claimsPending ? 'a' : 'm'}>{n(d.claimsPending)}</Tag>} to="/claim?tab=expense" />
        <Row title="Site reports" sub="Submitted, waiting for sign-off" meta={<Tag tone={d.reportsSubmitted ? 'a' : 'm'}>{n(d.reportsSubmitted)}</Tag>} to="/reports" />
      </div>
      <h4>Today's sites</h4>
      {d.todaySites.length ? <div className="of-rows">{d.todaySites.map(s => <Row key={s.id} title={s.name} sub={`${s.place || s.type} · ${s.people.length ? s.people.join(', ') : 'no crew yet'}`} meta={<Tag tone="g">{s.day}</Tag>} to={`/sites/${s.id}`} />)}</div> : <Empty>No site work today.</Empty>}
      <h4>Admin</h4>
      <div className="of-tiles">
        {isZairul && <Tile title="Statistics" sub="Workload, jobs, trends" to="/statistics" />}
        {isZairul && <Tile title="5S" sub="Zones and audits" to="/5s" />}
        <Tile title="Settings" sub="Account, notifications" to="/settings" />
      </div>
    </>,
    foot: <Btn primary to="/dashboard">Open full dashboard</Btn>,
  }

  if (k === 'sites') return {
    eyebrow: 'Frame 01', title: 'Site arrangement', lede: 'Where everyone is going today, and the map of all active sites.',
    body: <><h4>Today · {fmtDay(d.today)}</h4>
      {d.todaySites.length ? <div className="of-rows">{d.todaySites.map(s => <Row key={s.id} title={s.name} sub={`${s.detail}${s.pic ? ` · PIC ${s.pic}` : ''}`} meta={<Tag tone={s.people.length ? 'g' : 'r'}>{s.people.length ? s.day : 'no crew'}</Tag>} to={`/sites/${s.id}`} />)}</div> : <Empty>No site work today.</Empty>}</>,
    foot: <><Btn primary to="/sites">Open Sites</Btn><Btn to="/map">Map</Btn></>,
  }

  if (k === 'schedule') return {
    eyebrow: 'Frame 02', title: 'Schedule & timecard', lede: 'This week for the whole team.',
    body: <><h4>{fmtDay(d.week[0])} – {fmtDay(d.week[6])}</h4>
      <div className="of-week">
        <span />{d.week.map(x => <span key={x} className={`h${x === d.today ? ' now' : ''}`}>{new Date(`${x}T00:00:00`).toLocaleDateString('en-MY', { weekday: 'short' })}</span>)}
        {d.weekGrid.map(r => <WeekRow key={r.name} r={r} />)}
      </div>
      <div className="of-legend"><span><i className="s" />Site</span><span><i className="o" />Office</span><span><i className="l" />Leave</span><span><i />Off</span></div></>,
    foot: <><Btn primary to="/timecard">Open Timecard</Btn><Btn to="/calendar">Calendar</Btn></>,
  }

  if (k === 'team') return {
    eyebrow: 'Frame 03', title: 'The crew', lede: 'Everyone on the team and their role.',
    body: <div className="of-people">{d.members.map(m => (
      <div key={m.id} className="of-person">
        <span className="av">{m.avatar_url ? <img src={m.avatar_url} alt="" /> : (m.full_name || '?').split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase()}</span>
        <b>{m.short_name || m.full_name?.split(' ')[0]}</b><span>{m.role || '—'}</span>
      </div>))}</div>,
    foot: <Btn primary to="/team">Open Team</Btn>,
  }

  if (k === 'games') return {
    eyebrow: 'Bookshelf · the green book', title: 'Games', lede: "Quick games for the break. Beat the team's high score.",
    body: <div className="of-games">{GAMES.map(g => <Link key={g.key} className="of-game" to={`/break-room?section=games&game=${g.key}`}><GameIcon k={g.key} /><span>{g.name}</span></Link>)}</div>,
    foot: <Btn to="/break-room?section=games">All games & scores</Btn>,
  }

  if (k === 'library') {
    const L = d.library
    return {
      eyebrow: 'Bookshelf', title: 'Library', lede: 'Certificates, forms and templates the team keeps coming back to.',
      body: !L ? <Empty>Couldn't load the library right now.</Empty> : !L.total ? <Empty>No documents yet.</Empty> : <div className="of-rows">
        {Object.entries(L.sections).sort((a, b) => b[1] - a[1]).map(([s, c]) => <Row key={s} title={titleize(s)} meta={<span className="of-meta">{c}</span>} to="/library" />)}
        {L.expiring > 0 && <Row title="Expiring in 30 days" sub="Certificates to renew" meta={<Tag tone="a">{L.expiring}</Tag>} to="/library" />}
      </div>,
      foot: <Btn primary to="/library">Open Library</Btn>,
    }
  }

  if (k === 'files') return {
    eyebrow: 'Filing cabinet', title: 'Claims & reports', lede: 'Top drawer for claims, middle for site reports.',
    body: <>
      <div className="of-tiles">
        <Tile title="Expense claims" sub="Receipts, parking, tolls" to="/claim?tab=expense" />
        <Tile title="Mileage claims" sub="Trips to site" to="/claim?tab=mileage" />
        <Tile title="Reports" sub="All site reports" to="/reports" />
        <Tile title="Report builder" sub="Start a new report" to="/report-builder" />
      </div>
      <h4>In the tray</h4>
      <div className="of-rows">
        <Row title="Expense claims pending" meta={<Tag tone={d.claimsPending ? 'a' : 'm'}>{n(d.claimsPending)}</Tag>} to="/claim?tab=expense" />
        <Row title="Reports waiting for sign-off" meta={<Tag tone={d.reportsSubmitted ? 'a' : 'm'}>{n(d.reportsSubmitted)}</Tag>} to="/reports" />
        <Row title="Reports not finished" sub="Scanning jobs done, report open" meta={<Tag tone={d.reportsOpen ? 'a' : 'm'}>{n(d.reportsOpen)}</Tag>} to="/reports" />
      </div>
    </>,
    foot: null,
  }

  if (k === 'feed') return {
    eyebrow: 'Notice board', title: 'Team feed', lede: 'Posts, updates and photos from site.',
    body: !d.feed ? <Empty>Couldn't load the feed right now.</Empty> : !d.feed.length ? <Empty>No posts yet.</Empty>
      : <div className="of-rows">{d.feed.map(p => <Row key={p.id} title={(p.body || 'Photo').slice(0, 80)} sub={p.author?.full_name || p.author_name || ''} meta={<span className="of-meta">{timeAgo(p.created_at)}</span>} to="/feed" />)}</div>,
    foot: <Btn primary to="/feed">Open Feed</Btn>,
  }

  if (k === 'tasks') {
    const T = d.tasks
    return {
      eyebrow: 'Whiteboard', title: 'Tasks', lede: T ? `${T.length} open task${T.length === 1 ? '' : 's'}.` : 'Who is doing what.',
      body: !T ? <Empty>Couldn't load tasks right now.</Empty> : !T.length ? <Empty>Nothing open. Nice.</Empty>
        : <div className="of-checks">{T.slice(0, 8).map(t => <Link key={t.id} to="/tasks" className="of-check"><i /><div><b>{t.title}</b><span>{t.due_date ? `Due ${fmtDay(t.due_date)}` : 'No date'}{t.task_assignments?.length ? ` · ${t.task_assignments.map(a => crew.find(c => c.id === a.member_id)?.name).filter(Boolean).join(', ')}` : ''}</span></div></Link>)}</div>,
      foot: <Btn primary to="/tasks">Open Tasks</Btn>,
    }
  }

  if (k === 'pantry') return {
    eyebrow: 'Pantry', title: 'Break room', lede: 'Lunch and money stuff. The games are on the bookshelf.',
    body: <>
      <div className="of-tiles">
        <Tile title="Where to eat" sub="Everyone puts in a place, the wheel decides" to="/break-room?section=eat" />
        <Tile title="QR & split bill" sub="DuitNow QR and who owes who" to="/break-room?section=pay&view=bills" />
      </div>
      <div className="of-rows" style={{ marginTop: 14 }}>
        {d.lunch !== undefined && <Row title="Latest lunch round" sub={d.lunch ? `${d.lunch.title} · ${titleize(d.lunch.status || '')}` : 'None yet'} to="/break-room?section=eat" />}
        <Row title="Unpaid shares" sub="Across all split bills" meta={<Tag tone={d.unpaidShares ? 'a' : 'm'}>{n(d.unpaidShares)}</Tag>} to="/break-room?section=pay&view=bills" />
      </div>
    </>,
    foot: <Btn to="/break-room">Open Break Room</Btn>,
  }

  if (k === 'city') return {
    eyebrow: 'Model table', title: 'Program city', lede: 'Each building is a program the team built. Drag to turn the model, scroll to zoom, click a building to scan it.',
    body: <div className="of-rows">{['pt', 'scan', 'layout', 'pdf'].map(p => <Row key={p} title={hotspotTitle(p).title} sub={hotspotTitle(p).sub} meta={<span className="of-meta">scan →</span>} onClick={() => go(p)} />)}</div>,
    foot: null,
  }

  if (PROG_INFO[k]) {
    const P = PROG_INFO[k], c = P.count?.(d)
    return {
      eyebrow: 'Program · scanned', title: hotspotTitle(k).title, lede: P.lede,
      body: <><dl className="of-spec">{P.spec.map(([a, b], i) => <div key={i}><dt>{a}</dt><dd>{b}</dd></div>)}</dl>
        {P.count && <p className="of-note">{c == null ? 'Count not available right now.' : `${c} ${P.unit} so far.`}</p>}</>,
      foot: <><Btn primary to={P.path}>Open {hotspotTitle(k).title}</Btn><Btn onClick={() => go('city')}>Other programs</Btn></>,
    }
  }

  if (k === 'crew') return {
    eyebrow: 'Workstation', title: 'Crew today', lede: 'Empty chair = out today. Click a person for more.',
    body: <div className="of-rows">{crew.map((c, i) => <Row key={c.id} title={c.fullName || c.name} sub={statusText(c)} meta={<StatusTag c={c} />} onClick={() => go('crew' + i)} />)}</div>,
    foot: <Btn to="/team">Open Team</Btn>,
  }

  if (k.startsWith('crew')) {
    const i = +k.slice(4), c = crew[i]
    if (!c) return null
    const row = d.weekGrid.find(r => r.name === c.name)
    const siteDays = row ? row.days.filter(x => x === 's').length : 0, officeDays = row ? row.days.filter(x => x === 'o').length : 0
    return {
      eyebrow: `Desk ${String(i + 1).padStart(2, '0')}`, title: c.fullName || c.name, lede: c.role || 'Team member',
      body: <div className="of-rows">
        <Row title="Right now" sub={c.status === 'office' ? (doing[i] || 'Working at the desk') : statusText(c)} />
        <Row title="Today" sub={statusText(c)} meta={<StatusTag c={c} />} />
        <Row title="This week" sub={`${siteDays} site day${siteDays === 1 ? '' : 's'} · ${officeDays} office day${officeDays === 1 ? '' : 's'}`} />
      </div>,
      foot: <>{c.siteIds?.[0] && <Btn primary to={`/sites/${c.siteIds[0]}`}>Open site</Btn>}<Btn to="/team">Profile</Btn></>,
    }
  }
  return null
}

function WeekRow({ r }) {
  return <><span className="n">{r.name}</span>{r.days.map((v, i) => <span key={i} className={`c ${v}`} />)}</>
}
const statusText = c => c.status === 'site' ? `On site · ${c.site}` : c.status === 'leave' ? 'On leave' : c.status === 'off' ? `Off today${c.offLabel ? ` · ${c.offLabel}` : ''}` : 'In the office'
function StatusTag({ c }) {
  return c.status === 'site' ? <Tag tone="a">on site</Tag> : c.status === 'office' ? <Tag tone="g">in</Tag> : <Tag>{c.status === 'leave' ? 'leave' : 'off'}</Tag>
}

// The side panel for one object
export default function OfficePanel({ k, ctx, onClose }) {
  const p = panelFor(k, ctx)
  if (!p) return null
  return <>
    <button className="of-x" onClick={onClose} aria-label="Close"><X size={18} /></button>
    <header><div className="eyebrow">{p.eyebrow}</div><h2>{p.title}</h2><p>{p.lede}</p></header>
    <div className="of-body">{p.body}</div>
    {p.foot && <footer>{p.foot}</footer>}
  </>
}
