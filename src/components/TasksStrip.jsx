import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, ListChecks, Plus } from 'lucide-react'
import { supabase } from '../supabase'
import { Button, Field, Modal, Segmented } from './ui'
import { createTask, dueLabel, dueState, setTaskDone, sortTasks, todayIso } from '../utils/tasks'
import './TasksStrip.css'

// Dashboard "My tasks" strip (navy, like the Sites cards). Two tabs: tasks given to me,
// and tasks I gave others. Tick = done (the giver is notified). "+ Task" gives a task to anyone.
// Classes prefixed tks-.

const SHOW = 4
const shortName = m => m?.short_name || m?.full_name?.split(' ')[0] || '?'
const initials = m => (m?.full_name || '?').split(' ').filter(Boolean).map(p => p[0]).join('').slice(0, 2).toUpperCase()
const assigneesOf = t => (t.task_assignments || []).map(a => a.member_id)

// open tasks for everyone (the team is small) + the last few I gave that are done
async function fetchTasks(memberId) {
  const sel = 'id, title, description, priority, due_date, status, created_by, created_at, task_assignments(member_id)'
  const [open, gaveDone] = await Promise.all([
    supabase.from('tasks').select(sel).neq('status', 'done').order('created_at', { ascending: false }).limit(300),
    supabase.from('tasks').select(sel).eq('status', 'done').eq('created_by', memberId).order('created_at', { ascending: false }).limit(12),
  ])
  const byId = new Map([...(open.data || []), ...(gaveDone.data || [])].map(t => [t.id, t]))
  return [...byId.values()]
}

function Av({ m }) {
  return <span className="tks-av" title={m?.full_name}>{m?.avatar_url ? <img src={m.avatar_url} alt="" loading="lazy" /> : initials(m)}</span>
}

export default function TasksStrip({ members, memberId, fullName, onDue }) {
  const [tasks, setTasks] = useState(null)
  const [tab, setTab] = useState('mine')
  const [ticking, setTicking] = useState(() => new Set())
  const [adding, setAdding] = useState(false)
  const memberById = useMemo(() => Object.fromEntries(members.map(m => [m.id, m])), [members])
  const me = { memberId, fullName }
  const today = todayIso()

  // reload on mount and whenever the window gets focus back (someone may have given you a task)
  useEffect(() => {
    if (!memberId) return undefined
    let cancelled = false
    const load = () => fetchTasks(memberId).then(list => { if (!cancelled) setTasks(list) })
    load()
    window.addEventListener('focus', load)
    return () => { cancelled = true; window.removeEventListener('focus', load) }
  }, [memberId])

  const mine = useMemo(() => sortTasks((tasks || []).filter(t => t.status !== 'done' && assigneesOf(t).includes(memberId)), today), [tasks, memberId, today])
  const gave = useMemo(() => {
    const list = (tasks || []).filter(t => t.created_by === memberId && assigneesOf(t).some(id => id !== memberId))
    const open = sortTasks(list.filter(t => t.status !== 'done'), today)
    return [...open, ...list.filter(t => t.status === 'done')]
  }, [tasks, memberId, today])
  // late / due-today tasks also go into the banner's "things need you"
  const dueKey = mine.filter(t => ['over', 'today'].includes(dueState(t, today))).map(t => t.id).join(',')
  useEffect(() => {
    if (!onDue) return
    onDue(mine.filter(t => ['over', 'today'].includes(dueState(t, today))).map(t => ({
      key: `task-${t.id}`, sev: dueState(t, today) === 'over' ? 'red' : 'amber', when: t.due_date,
      title: `Task — ${t.title}`, sub: dueState(t, today) === 'over' ? `${dueLabel(t, today)}` : 'Due today', go: 'Open', link: '/tasks',
    })))
  }, [dueKey]) // eslint-disable-line react-hooks/exhaustive-deps -- only when the set of due tasks changes
  const gaveOpen = gave.filter(t => t.status !== 'done').length
  const list = tab === 'mine' ? mine : gave
  const shown = list.slice(0, SHOW)

  async function tick(t) {
    const done = t.status !== 'done'
    if (tab === 'mine') setTicking(prev => new Set(prev).add(t.id))
    const { error, status } = await setTaskDone(t, done, me)
    if (error) { setTicking(prev => { const n = new Set(prev); n.delete(t.id); return n }); return }
    // let the tick show for a moment before the tile slides out
    setTimeout(() => {
      setTasks(prev => prev.map(x => x.id === t.id ? { ...x, status } : x))
      setTicking(prev => { const n = new Set(prev); n.delete(t.id); return n })
    }, tab === 'mine' ? 550 : 0)
  }

  if (!memberId || tasks === null) return null

  const header = (
    <div className="tks-h">
      <h2><ListChecks size={18} />My tasks{mine.length > 0 && <span className="n">{mine.length}</span>}</h2>
      <Segmented label="Which tasks" value={tab} onChange={setTab}
        options={[{ key: 'mine', label: `For me · ${mine.length}` }, { key: 'gave', label: `I gave · ${gaveOpen}` }]} />
      <span className="sp" />
      <Link to="/tasks" className="tks-all">View all →</Link>
      <button type="button" className="tks-add" onClick={() => setAdding(true)}><Plus size={15} />Task</button>
    </div>
  )

  return (
    <>
    <section className={`tks${shown.length ? '' : ' empty'}`}>
      {header}
      {shown.length === 0
        ? <p className="tks-empty">{tab === 'mine' ? 'Nothing on your plate.' : 'You haven’t given anyone a task yet.'} <button type="button" onClick={() => setAdding(true)}>+ Give a task</button></p>
        : (
          <div className="tks-row">
            {shown.map(t => {
              const isDone = t.status === 'done' || ticking.has(t.id)
              const state = t.status === 'done' ? 'done' : dueState(t, today)
              const giver = memberById[t.created_by]
              const to = assigneesOf(t).filter(id => id !== memberId).map(id => memberById[id]).filter(Boolean)
              return (
                <div key={t.id} className={`tks-t ${state}${ticking.has(t.id) ? ' going' : ''}`}>
                  <div className="tks-top">
                    <button type="button" className={`tks-ck${isDone ? ' on' : ''}`} onClick={() => tick(t)}
                      aria-label={isDone ? 'Mark as not done' : 'Mark as done'} title={isDone ? 'Mark as not done' : 'Mark as done'}>
                      {isDone && <Check size={13} strokeWidth={3} />}
                    </button>
                    <Link to="/tasks" className="tks-title" title={t.description || t.title}>{t.title}</Link>
                    {t.priority === 'high' && !isDone && <i className="tks-pri" title="High priority" />}
                  </div>
                  <div className="tks-foot">
                    {tab === 'mine'
                      ? <><Av m={giver} /><span className="from">{t.created_by === memberId ? <b>Myself</b> : <>from <b>{giver ? shortName(giver) : 'someone'}</b></>}</span></>
                      : <><Av m={to[0]} /><span className="from">to <b>{to[0] ? shortName(to[0]) : '?'}</b>{to.length > 1 && ` +${to.length - 1}`}</span></>}
                    <span className="due">{t.status === 'done' ? 'Done' : dueLabel(t, today)}</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      {list.length > SHOW && <Link to="/tasks" className="tks-more">+{list.length - SHOW} more</Link>}
    </section>
      {adding && <AddTask members={members} me={me} onClose={() => setAdding(false)}
        onAdded={task => { setTasks(prev => [task, ...(prev || [])]); setTab(task.task_assignments.some(a => a.member_id === memberId) ? 'mine' : 'gave') }} />}
    </>
  )
}

function AddTask({ members, me, onClose, onAdded }) {
  const [form, setForm] = useState({ title: '', description: '', priority: 'medium', due_date: '', assignees: [] })
  const [err, setErr] = useState(null)
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const toggle = id => set('assignees', form.assignees.includes(id) ? form.assignees.filter(x => x !== id) : [...form.assignees, id])
  const people = [...members].sort((a, b) => (a.id === me.memberId ? -1 : b.id === me.memberId ? 1 : shortName(a).localeCompare(shortName(b))))

  async function save() {
    if (!form.title.trim()) { setErr('What needs to be done?'); return }
    if (!form.assignees.length) { setErr('Pick at least one person.'); return }
    setSaving(true); setErr(null)
    const { task, error } = await createTask(form, me)
    setSaving(false)
    if (error) { setErr(error.message); return }
    onAdded(task); onClose()
  }

  return (
    <Modal title="Give a task" onClose={onClose}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Give task'}</Button></>}>
      <div className="tks-form">
        <Field label="Task" error={err && !form.title.trim() ? err : null}>
          <input className="x-control" autoFocus value={form.title} onChange={e => set('title', e.target.value)} placeholder="e.g. Submit cutting report for Pavilion"
            onKeyDown={e => { if (e.key === 'Enter') save() }} />
        </Field>
        <Field label="Give to" hint="Pick yourself, someone else, or several people" error={err && form.title.trim() ? err : null}>
          <div className="tks-people">
            {people.map(m => (
              <button key={m.id} type="button" className={form.assignees.includes(m.id) ? 'on' : ''} onClick={() => toggle(m.id)} aria-pressed={form.assignees.includes(m.id)}>
                <Av m={m} />{m.id === me.memberId ? 'Me' : shortName(m)}
              </button>
            ))}
          </div>
        </Field>
        <div className="tks-two">
          <Field label="Due date">
            <input type="date" className="x-control" value={form.due_date} onChange={e => set('due_date', e.target.value)} />
          </Field>
          <Field label="Priority">
            <Segmented label="Priority" value={form.priority} onChange={v => set('priority', v)}
              options={[{ key: 'low', label: 'Low' }, { key: 'medium', label: 'Medium' }, { key: 'high', label: 'High' }]} />
          </Field>
        </div>
        <Field label="Notes (optional)">
          <textarea className="x-control" rows={2} value={form.description} onChange={e => set('description', e.target.value)} />
        </Field>
      </div>
    </Modal>
  )
}
