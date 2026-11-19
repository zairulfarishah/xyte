import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Check, CheckCheck, Plus, Trash2, X } from 'lucide-react'
import { supabase } from '../supabase'
import { activeMembers } from '../utils/members'
import { cachedPage, rememberPage } from '../utils/pageCache'
import { useAuth } from '../context/AuthContext'
import { Button, FilterBar, Page, PageHeader, Tabs } from '../components/ui'
import { createTask, setTaskDone } from '../utils/tasks'
import { LANES, PRIORITY_WEIGHT, assigneesOf, byUrgency, dueText, isDone, isLate, parseQuickTask, todayIso } from './tasks/taskUtils'
import './Sites.css'
import './tasks/MissionControl.css'

// Tasks — "Mission Control": open tasks laid out by when they're due, a quick-add bar
// (type "Check DO @Izni !high fri"), team workload, and the full New task form.

const COLORS = ['#f07c1e', '#3478d4', '#6d5bd0', '#16a36a', '#db2777', '#0891b2']
const PRIO_COLOR = { high: 'var(--mc-hi)', medium: 'var(--mc-med)', low: 'var(--mc-low)' }
const LANE_LIMIT = 8
const EMPTY_FORM = { title: '', description: '', priority: 'medium', due_date: '', assignees: [] }

const firstName = m => m ? (m.short_name || m.full_name.split(' ')[0]) : 'Someone'
const initials = m => m ? m.full_name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() : '?'

function Avatar({ member, color }) {
  if (member?.avatar_url) return <img className="mc-av" src={member.avatar_url} alt="" title={member.full_name} />
  return <span className="mc-av" title={member?.full_name} style={{ background: color }}>{initials(member)}</span>
}

function Ring({ value, total, color }) {
  const r = 22, C = 2 * Math.PI * r, f = total ? Math.min(1, value / total) : 0
  return (
    <div className="mc-ring" style={{ '--c': color }}>
      <svg viewBox="0 0 52 52" aria-hidden="true">
        <circle className="bg" cx="26" cy="26" r={r} />
        <circle className="fg" cx="26" cy="26" r={r} strokeDasharray={C} strokeDashoffset={C * (1 - f)} />
      </svg>
      <b>{value}</b>
    </div>
  )
}

export default function TaskPage() {
  const { memberId, fullName } = useAuth()
  const [members, setMembers] = useState(() => cachedPage('tasks')?.members || [])
  const [tasks, setTasks]     = useState(() => cachedPage('tasks')?.tasks || [])
  const [loading, setLoading] = useState(() => !cachedPage('tasks'))
  const [scope, setScope]       = useState('all')     // all | mine | gave
  const [person, setPerson]     = useState(null)      // filter to one member's tasks
  const [showDone, setShowDone] = useState(false)
  const [expanded, setExpanded] = useState({})        // lane key -> show all
  const [busy, setBusy]         = useState(null)      // task id being ticked
  const [quick, setQuick]       = useState('')
  const [quickBusy, setQuickBusy] = useState(false)
  const [quickError, setQuickError] = useState(null)
  const [modal, setModal]       = useState(null)      // form state while the dialog is open
  const [saving, setSaving]     = useState(false)
  const [formError, setFormError] = useState(null)
  const quickRef = useRef(null)
  const today = todayIso()

  useEffect(() => {
    let cancelled = false
    Promise.all([
      supabase.from('team_members').select('id, full_name, short_name, avatar_url, is_hidden').order('full_name'),
      supabase.from('tasks').select('*, task_assignments(member_id)').order('created_at', { ascending: false }),
    ]).then(([{ data: m }, { data: t }]) => {
      if (cancelled) return
      const list = activeMembers(m)
      setMembers(list)
      setTasks(t || [])
      setLoading(false)
      rememberPage('tasks', { members: list, tasks: t || [] })
    })
    return () => { cancelled = true }
  }, [])

  // Ctrl/⌘ K jumps to the quick-add bar
  useEffect(() => {
    const onKey = e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); quickRef.current?.focus() } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const memberById = useMemo(() => new Map(members.map(m => [m.id, m])), [members])
  const colorOf = id => COLORS[Math.max(0, members.findIndex(m => m.id === id)) % COLORS.length]

  // ── what's on the board ──
  const inView = t =>
    (scope === 'all' || (scope === 'mine' ? assigneesOf(t).includes(memberId) : t.created_by === memberId))
    && (!person || assigneesOf(t).includes(person))
  const visible = tasks.filter(inView)
  const open = visible.filter(t => !isDone(t))
  const done = visible.filter(isDone)
  const sortUrgent = byUrgency(today)
  const lanes = LANES.map(l => ({ ...l, items: open.filter(t => l.test(t, today)).sort(sortUrgent) }))
  if (showDone) lanes.push({ key: 'done', label: 'Done', color: 'var(--x-success)', empty: 'Nothing done yet', items: done })

  const stats = [
    { label: 'Open',      value: open.length, of: visible.length, color: '#7fb2f0', sub: `of ${visible.length} total` },
    { label: 'Due today', value: open.filter(t => t.due_date === today).length, of: open.length, color: 'var(--x-orange)', sub: 'need doing today' },
    { label: 'Overdue',   value: open.filter(t => isLate(t, today)).length, of: open.length, color: '#f27272', sub: 'past their date' },
    { label: 'Done',      value: done.length, of: visible.length, color: '#34c88a', sub: `${visible.length ? Math.round(done.length / visible.length * 100) : 0}% complete` },
  ]

  // workload across the whole team (high priority counts more)
  const loads = useMemo(() => {
    const openAll = tasks.filter(t => !isDone(t))
    return members.map(m => {
      const mine = openAll.filter(t => assigneesOf(t).includes(m.id))
      return { m, count: mine.length, weight: mine.reduce((s, t) => s + (PRIORITY_WEIGHT[t.priority] || 2), 0) }
    }).sort((a, b) => b.weight - a.weight)
  }, [tasks, members])
  const maxLoad = Math.max(6, ...loads.map(l => l.weight))

  // ── actions ──
  async function toggleDone(task) {
    setBusy(task.id)
    const next = !isDone(task)
    const { error } = await setTaskDone(task, next, { memberId, fullName })
    setBusy(null)
    if (!error) setTasks(list => list.map(t => t.id === task.id ? { ...t, status: next ? 'done' : 'todo' } : t))
  }

  async function removeTask(task) {
    if (!confirm(`Delete "${task.title}"?`)) return
    const { error } = await supabase.from('tasks').delete().eq('id', task.id)
    if (error) { alert(`Could not delete: ${error.message}`); return }
    setTasks(list => list.filter(t => t.id !== task.id))
  }

  const parsed = quick.trim() ? parseQuickTask(quick, members, today) : null

  async function addQuick() {
    if (!parsed) return
    if (!parsed.title) { setQuickError('Add a few words saying what needs doing.'); return }
    const assignees = parsed.assignees.length ? parsed.assignees : memberId ? [memberId] : []
    if (!assignees.length) { openModal({ ...EMPTY_FORM, title: parsed.title, priority: parsed.priority, due_date: parsed.due_date || '' }); return }
    setQuickBusy(true); setQuickError(null)
    const { task, error } = await createTask({ ...parsed, due_date: parsed.due_date || '', description: '', assignees }, { memberId, fullName })
    setQuickBusy(false)
    if (error) { setQuickError(error.message); return }
    setTasks(list => [task, ...list])
    setQuick('')
  }

  function openModal(form = EMPTY_FORM) { setFormError(null); setModal(form) }

  async function saveModal() {
    if (!modal.title.trim())       { setFormError('Task title is required.'); return }
    if (!modal.assignees.length)   { setFormError('Assign to at least one person.'); return }
    setSaving(true); setFormError(null)
    const { task, error } = await createTask(modal, { memberId, fullName })
    setSaving(false)
    if (error) { setFormError(error.message); return }
    setTasks(list => [task, ...list])
    setModal(null)
  }

  if (loading) return (
    <Page className="ss mc">
      <section className="ss-hero"><PageHeader title="Tasks" subtitle="Loading tasks…" /></section>
    </Page>
  )

  const late = stats[2].value
  const scopeTabs = [
    { key: 'all', label: 'Everyone', count: tasks.filter(t => !isDone(t)).length },
    { key: 'mine', label: 'Mine', count: tasks.filter(t => !isDone(t) && assigneesOf(t).includes(memberId)).length },
    { key: 'gave', label: 'I gave', count: tasks.filter(t => !isDone(t) && t.created_by === memberId).length },
  ]
  const shownAssignees = parsed ? (parsed.assignees.length ? parsed.assignees : memberId ? [memberId] : []) : []
  const showLate = () => document.querySelector('.mc .k-late')?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' })

  return (
    <Page className="ss mc">
      <section className="ss-hero">
        <PageHeader
          title="Tasks"
          subtitle={<>
            <b>{open.length}</b> open · <b>{stats[1].value}</b> due today
            {late > 0 && <> · <button className="ss-attn" onClick={showLate}><AlertTriangle size={12} /> {late} overdue</button></>}
          </>}
          actions={<Button variant="primary" icon={Plus} onClick={() => openModal({ ...EMPTY_FORM, assignees: person ? [person] : [] })}>New task</Button>}
        />
        <div className="mc-hud">
          {stats.map(s => (
            <div key={s.label} className="mc-stat">
              <Ring value={s.value} total={s.of} color={s.color} />
              <div><div className="lbl">{s.label}</div><div className="sub">{s.sub}</div></div>
            </div>
          ))}
        </div>
        <Tabs tabs={scopeTabs} active={scope} onChange={setScope} />
      </section>

      <div className="x-card ss-board mc-board">
        <FilterBar>
          <label className="x-inp mc-cmd">
            <span className="k" aria-hidden="true">›_</span>
            <input ref={quickRef} value={quick} disabled={quickBusy} autoComplete="off"
              aria-label="Quick add a task. Use @name for who, !high, !med or !low for priority, and a day like fri or 12 dec."
              placeholder="Quick add… e.g.  Check DO for KLIA @Izni !high fri"
              onChange={e => { setQuick(e.target.value); setQuickError(null) }}
              onKeyDown={e => { if (e.key === 'Enter') addQuick(); if (e.key === 'Escape') setQuick('') }} />
            <span className="mc-kbd">Ctrl K</span>
            <Button variant="primary" size="sm" onClick={e => { e.preventDefault(); addQuick() }} disabled={!parsed || quickBusy}>{quickBusy ? 'Adding…' : 'Add'}</Button>
          </label>
          <button type="button" className={`ss-tool${showDone ? ' on' : ''}`} aria-pressed={showDone} onClick={() => setShowDone(v => !v)}>
            <CheckCheck size={14} /> Show done <span className="mc-done-n">{done.length}</span>
          </button>
        </FilterBar>

        {parsed && (
          <div className="mc-parse" aria-live="polite">
            <span className="mc-chip">“{parsed.title || '…'}”</span>
            {shownAssignees.map(id => (
              <span key={id} className="mc-chip"><Avatar member={memberById.get(id)} color={colorOf(id)} /> {firstName(memberById.get(id))}</span>
            ))}
            <span className={`mc-chip p-${parsed.priority}`}>{parsed.priority}</span>
            <span className="mc-chip mono">{parsed.due_date ? dueText(parsed.due_date, today) : 'no date'}</span>
            {!parsed.assignees.length && <span className="warn">for you — add @name to give it to someone</span>}
          </div>
        )}
        {quickError && <p className="mc-err">{quickError}</p>}
        {person && (
          <div className="mc-filter">Showing {firstName(memberById.get(person))}’s tasks <button type="button" onClick={() => setPerson(null)}>Show everyone</button></div>
        )}

        <div className="mc-lanes" style={{ '--n': lanes.length }}>
          {lanes.map(lane => {
            const all = lane.items
            const shown = expanded[lane.key] ? all : all.slice(0, LANE_LIMIT)
            return (
              <section key={lane.key} className={`mc-lane k-${lane.key}`} style={{ '--c': lane.color }} aria-label={lane.label}>
                <h3><span>{lane.label}</span><i>{all.length}</i></h3>
                {!all.length && <div className="mc-empty">{lane.empty}</div>}
                {shown.map(task => {
                  const who = assigneesOf(task)
                  const giver = task.created_by && task.created_by !== memberId && !who.includes(task.created_by) ? memberById.get(task.created_by) : null
                  const taskLate = isLate(task, today)
                  return (
                    <article key={task.id} className={`mc-tk${taskLate ? ' late' : ''}${isDone(task) ? ' done' : ''}`} style={{ '--pc': PRIO_COLOR[task.priority] || PRIO_COLOR.medium }}>
                      <button type="button" className={`mc-chk${isDone(task) ? ' on' : ''}`} disabled={busy === task.id}
                        onClick={() => toggleDone(task)} aria-label={isDone(task) ? `Mark "${task.title}" not done` : `Mark "${task.title}" done`}>
                        <Check strokeWidth={3.5} />
                      </button>
                      <div className="body">
                        <div className="tt">{task.title}</div>
                        {task.description && !isDone(task) && <div className="td">{task.description}</div>}
                        <div className="meta">
                          <span className={`mc-chip p-${task.priority || 'medium'}`}>{task.priority || 'medium'}</span>
                          <span className={`mc-chip mono${taskLate ? ' late' : ''}`}>{dueText(task.due_date, today)}</span>
                          <span className="mc-avs">{who.map(id => <Avatar key={id} member={memberById.get(id)} color={colorOf(id)} />)}</span>
                        </div>
                        {giver && <div className="from">From {firstName(giver)}</div>}
                      </div>
                      <button type="button" className="mc-del" onClick={() => removeTask(task)} aria-label={`Delete "${task.title}"`} title="Delete"><Trash2 /></button>
                    </article>
                  )
                })}
                {all.length > LANE_LIMIT && (
                  <button type="button" className="mc-more" onClick={() => setExpanded(x => ({ ...x, [lane.key]: !x[lane.key] }))}>
                    {expanded[lane.key] ? 'Show less' : `Show ${all.length - LANE_LIMIT} more`}
                  </button>
                )}
              </section>
            )
          })}
        </div>
      </div>

      <section className="mc-sec" aria-label="Team load">
        <h4>Team load <span>· click a person to see only their tasks</span></h4>
        <div className="mc-loads">
          {loads.map(({ m, count, weight }) => (
            <div key={m.id} role="button" tabIndex={0} className={`mc-load${person === m.id ? ' on' : ''}`} aria-pressed={person === m.id}
              onClick={() => setPerson(p => p === m.id ? null : m.id)}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setPerson(p => p === m.id ? null : m.id) } }}>
              <Avatar member={m} color={colorOf(m.id)} />
              <div>
                <div className="nm">{firstName(m)}</div>
                <div className={`mc-bar${weight >= 10 ? ' over' : weight >= 6 ? ' busy' : ''}`}><i style={{ width: `${weight / maxLoad * 100}%` }} /></div>
                <small>{count} open</small>
              </div>
              <button type="button" className="mc-give" title={`Give ${firstName(m)} a task`} aria-label={`Give ${firstName(m)} a task`}
                onClick={e => { e.stopPropagation(); openModal({ ...EMPTY_FORM, assignees: [m.id] }) }}><Plus /></button>
            </div>
          ))}
        </div>
      </section>

      {modal && (
        <div className="mc-modal-bg" onClick={e => e.target === e.currentTarget && setModal(null)}>
          <div className="mc-modal" role="dialog" aria-modal="true" aria-labelledby="mc-new-title">
            <header>
              <div><b id="mc-new-title">New task</b><p>Add a task and give it to people</p></div>
              <button type="button" className="mc-x" onClick={() => setModal(null)} aria-label="Close"><X size={18} /></button>
            </header>
            <div className="mc-form">
              <label><span>What needs to be done? *</span>
                <input className="mc-in" autoFocus value={modal.title} placeholder="e.g. Contact client about site access"
                  onChange={e => setModal(f => ({ ...f, title: e.target.value }))}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && saveModal()} />
              </label>
              <label><span>Description <em>(optional)</em></span>
                <textarea className="mc-in" rows={2} value={modal.description} placeholder="Add any notes or details…"
                  onChange={e => setModal(f => ({ ...f, description: e.target.value }))} />
              </label>
              <div className="mc-row">
                <div className="mc-field">
                  <span className="mc-lbl">Priority</span>
                  <div className="mc-seg" role="group" aria-label="Priority">
                    {['low', 'medium', 'high'].map(p => (
                      <button key={p} type="button" className={`p-${p}${modal.priority === p ? ' on' : ''}`} aria-pressed={modal.priority === p}
                        onClick={() => setModal(f => ({ ...f, priority: p }))}>{p}</button>
                    ))}
                  </div>
                </div>
                <label><span>Due date <em>(optional)</em></span>
                  <input className="mc-in" type="date" value={modal.due_date} onChange={e => setModal(f => ({ ...f, due_date: e.target.value }))} />
                </label>
              </div>
              <div>
                <span className="mc-lbl">Give it to *</span>
                <div className="mc-people">
                  {members.map(m => {
                    const on = modal.assignees.includes(m.id)
                    return (
                      <button key={m.id} type="button" className={`mc-person${on ? ' on' : ''}`} aria-pressed={on}
                        onClick={() => setModal(f => ({ ...f, assignees: on ? f.assignees.filter(x => x !== m.id) : [...f.assignees, m.id] }))}>
                        <Avatar member={m} color={colorOf(m.id)} /> {firstName(m)} {on && <Check strokeWidth={3} />}
                      </button>
                    )
                  })}
                </div>
              </div>
              {formError && <p className="mc-err">{formError}</p>}
              <div className="mc-actions">
                <Button variant="primary" onClick={saveModal} disabled={saving}>{saving ? 'Adding…' : 'Add task'}</Button>
                <Button variant="secondary" onClick={() => setModal(null)}>Cancel</Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Page>
  )
}
