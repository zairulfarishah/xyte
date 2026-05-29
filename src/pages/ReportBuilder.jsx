import { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabase'
import { useAuth } from '../context/AuthContext'
import { useViewport } from '../utils/useViewport'
import { Plus, Trash2, ArrowLeft, Printer, X, AlertTriangle, Upload, ChevronRight, Check } from 'lucide-react'

const TEAL = '#00b8cc'

// ── Constants ──────────────────────────────────────────────────────────────────

const RADAR_UNITS = [
  { id: 'GPR-001', model: 'GSSI Mini Scan LT', sn: 'Mini LT' },
  { id: 'GPR-002', model: 'GSSI SIR 4000', sn: '20226' },
  { id: 'GPR-003', model: 'GSSI SIR 4000', sn: '29888' },
  { id: 'GPR-004', model: 'GSSI SIR 4000', sn: '2948' },
  { id: 'GPR-005', model: 'GSSI SIR 3000', sn: '1392' },
  { id: 'GPR-006', model: 'GSSI SIR 3000', sn: '1605b' },
]

const ANTENNA_UNITS = [
  { id: 'GPR-007', model: 'GPR Palm Antenna 2000 Mhz', sn: '815' },
  { id: 'GPR-008', model: 'GPR Palm Antenna 2000 Mhz', sn: '862' },
  { id: 'GPR-009', model: 'GPR Palm Antenna 2000 Mhz (Anaconda)', sn: '535' },
  { id: 'GPR-010', model: 'GPR Palm Antenna 1600 Mhz', sn: '349' },
  { id: 'GPR-011', model: 'GPR Palm Antenna 400 Mhz', sn: '2690' },
]

const SERVICES = ['Concrete Scanning', 'Utility Locating', 'Corrosion / Void Survey', 'Advanced Reporting', 'Site Visit', 'Coring']

const SLAB_TYPES = ['Slab On Grade', 'Suspended Slab', 'Wall', 'Column', 'Beam', 'Other']

const DEFAULT_TEAM = [
  'Mohamad Zairul Farishah Bin Ismail',
  'Abu Hafizuddin Bin Abu Daud',
  'Kailash Pal Singh A/L Baldev Singh',
  'Nurul Izni Binti Mat Nazri',
  'Muhammad Nurakmal Bin Nor Hisham',
]

const GENERAL_LIMITATIONS = [
  'Core spot recommendation has been selected based on suitable position for its purpose as per the client on site, combined with consultation from the Xradar technician to remove or reduce the amount of damage to structural steel whilst avoiding other embedded features.',
  'Xradar is not responsible for the decision to cut structural components. Xradar will not cut structural components without written confirmation from the structural engineer or the site superintendent.',
  'Where there is no access to the underside of the slab or pinpointing of the underside of the slab is not possible, marked locations of beams or walls below the slab are approximations. The exact location of beams or walls cannot be confirmed. Strapped conduits or pipes may also exist on the underside of the slab.',
  'Where there is standing water on the surface of the slab in the scan location(s), there is poor radar signal. The presence and location of targets in the slab/wall cannot be confirmed. We cannot ensure that the markings on the slab indicating the locations of targets will remain. Do not drill, core or cut the slab when markings have been removed.',
  'Where we have marked out a specific point on the slab/wall in which coring or drilling should take place please ensure that coring or drilling takes place within this point. Xradar will not be liable for any targets hit where coring or drilling takes place outside of the specified location.',
  'Where Markings on the slab are faded, no longer visible, or tape has been removed a new Xradar concrete scan of the location is required.',
  'Client has confirmed that there are no PT cables present in the slab. Based on this confirmation we have assumed that none of the targets identified in the slab are PT cables. Xradar will not be liable for any PT cables that are hit where the client has confirmed no PT cables are present in the slab.',
  'In order to determine that the slab contains PT cables, Xradar requires access to a large surface area of the slab. There was not enough available survey area to determine that the slab does not contain PT cables. Therefore, it is advised that no coring or drilling is to take place through any of the marked targets.',
  'Scanning has been carried out for the purpose of anchoring in the slab at a specific depth. Based on this we have not cleared the entire extent of the slab and have only marked targets down to the anchor depth. Xradar will not be liable where drilling takes place deeper than the allowed depth.',
  'The horizontal accuracy of the hole spotters used to pin-point locations to the underside of the slab decreases by 0.5 inches (12mm) over every 8 inches (200mm) of concrete.',
  'Estimations of rebar sizes is accurate to within 1 rebar size.',
  'Due to the physical characteristics of the slab and the below grade material, Xradar is only able to guarantee that objects embedded within the concrete have been identified on site. Any below grade excavation is recommended to be completed by hand.',
  'Due to the size of the scan area (one dimension is less than 24 inches or 500mm), one or more locations scanned have been considered to be of restricted access. The presence and location of targets marked within a restricted access zone cannot always be confirmed.',
  'The slab is found to contain metal fibres. Metal fibres limit signal penetration and inhibit scan completion. In addition to this, Xradar is unable to determine the depth of such fibres. Further slab preparation may be required in order to complete the scan.',
]

const SLAB_TECH_LIMITATIONS = [
  'Unable to scan within 3 inches (70mm) of an obstruction. The presence and location of targets in the slab/wall within 3 inches (70mm) of an object or obstruction on the surface cannot be confirmed.',
  'Xradar does not guarantee identification of 1 Inch diameter and smaller metallic conduits in structures with steel reinforcement of similar size.',
  'The stated depths are accurate to approximately 15% of their true depth. The accuracy is depended on several factors including the homogeneity of the concrete mixture.',
  'Xradar has marked the center of embedded targets. It is recommended to allow 2 inches (50mm) of clearance when cutting, coring or drilling.',
  'Yellow and black scan boundaries indicate completed scans. If no yellow or black scan boundary is present, scanning of the locations have not been fully completed. Please note - Black boundaries, whilst complete, indicate depth limited scans. Not all embedded have been marked.',
  'Metallic conduits are known to be in the slab. Xradar recommends to avoid all targets when coring or drilling into the slab.',
  'Xradar has determined the presence of Post Tension (PT) cables in the slab, marked in Pink. It is highly recommended to allow a minimum of 3 Inches (70mm) of clearance from PT cables when cutting, coring or drilling. Drilling over marked PT cables is NOT recommended regardless of their depth.',
]

const DISCLAIMER = `Where:\n1. The Presence and/or location and/or depth of targets in the slab/wall cannot be confirmed due to any of the limitations set out above;\n2. The recommendations set out above are not followed;\n3. The markings on the slab indicating the locations of targets are no longer present; and/or\n4. The scan has not been completed,\n\nXradar shall not be liable for any loss or damage caused in respect of any such targets hit when drilling, coring or cutting the slab/wall.`

// ── Helpers ────────────────────────────────────────────────────────────────────

function uid() { return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2) }

function blankContent(preparedBy) {
  return {
    job_details: { date_of_work: '', client: '', street_address: '', city: '', po_number: '', xradar_project: '', job_quoted: null, quote_number: '', job_complete: null, general_notes: '', cover_image_url: null },
    services_equipment: { radar_units: [], antenna_units: [], services_provided: [] },
    personnel: { lead_technician: preparedBy || '', additional_technicians: [] },
    services_breakdown: { concrete_types: [], general_limitations: [] },
    client_details: { present_on_site: null, representative: '', phone: '', consulted_before: null, consulted_after: null },
    sign_off: { prepared_by: '', reviewed_by: '', sign_off_date: '' },
  }
}

function blankConcreteType() {
  return {
    id: uid(), name: '', slab_type: '', slab_type_notes: '', floorplan_image_url: null, pt_cables_absent: null, gpr_velocity: '', cores_approval_count: '', steel_diam_size: '', dense_steel: null, slab_specific_notes: '',
    floorplans_available: null, cores_require_approval: null, all_locations_same: null,
    steel_diam_determined: null, concrete_corrosion: null, voids_noted: null,
    other_items: null, slab_bands: null, slab_tech_limitations: [], locations: [],
  }
}

function blankLocation() {
  return {
    id: uid(), name: '', image_url: null, notes: '', complete_scan: null,
    limited_scan_black: null, limited_scan_anchoring: null, max_depth_top: '', max_depth_bottom: '',
    slab_thickness_min: '', slab_thickness_max: '', core_hole_laid: null, proposed_core_size: '', core_recommendation: null,
    pt_cables: null, pt_cable_depth: '',
    conduits: null, conduit_depth: '', conduit_material: '',
    live_power: null,
    top_steel: null, top_steel_depth: '', top_steel_spacing_min: '', top_steel_spacing_max: '',
    bottom_steel: null, bottom_steel_depth: '', bottom_steel_spacing_min: '', bottom_steel_spacing_max: '',
    previously_scanned: null, previous_scan_date: '',
    survey_area_clear: null, scanned_both_sides: null, pin_pointed: null,
  }
}

function ynMeta(v) {
  if (v === 'yes') return { bg: '#dcfce7', text: '#166534', label: 'Yes' }
  if (v === 'no') return { bg: '#fee2e2', text: '#991b1b', label: 'No' }
  if (v === 'na') return { bg: '#f1f5f9', text: '#475569', label: 'N/A' }
  return null
}

// ── Shared UI ──────────────────────────────────────────────────────────────────

function YNARadio({ value, onChange, options = ['yes', 'no', 'na'] }) {
  const labels = { yes: 'Yes', no: 'No', na: 'N/A' }
  return (
    <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
      {options.map(opt => (
        <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: '7px', cursor: 'pointer', fontSize: '13px', color: '#374151' }}>
          <div onClick={() => onChange(value === opt ? null : opt)} style={{ width: '17px', height: '17px', borderRadius: '50%', border: `2px solid ${value === opt ? TEAL : '#d1d5db'}`, background: value === opt ? TEAL : 'white', cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {value === opt && <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'white' }} />}
          </div>
          {labels[opt]}
        </label>
      ))}
    </div>
  )
}

function Field({ label, required, hint, children, color }) {
  return (
    <div style={{ marginBottom: '18px' }}>
      {label && (
        <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: color || (required ? TEAL : '#374151'), marginBottom: '7px', letterSpacing: '0.01em' }}>
          {label}{required && ' *'}
        </label>
      )}
      {children}
      {hint && <p style={{ fontSize: '11px', color: '#6b7280', marginTop: '5px', lineHeight: 1.5 }}>{hint}</p>}
    </div>
  )
}

function TInput({ value, onChange, placeholder, multiline, rows = 4 }) {
  const s = { width: '100%', padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '13px', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', lineHeight: 1.5, color: '#111827', background: 'white' }
  if (multiline) return <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={rows} style={{ ...s, resize: 'vertical' }} />
  return <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={s} />
}

function Card({ children, style }) {
  return <div style={{ background: 'white', borderRadius: '12px', padding: '16px', marginBottom: '12px', border: '1px solid #f3f4f6', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', ...style }}>{children}</div>
}

function SectionHeader({ title, subtitle, onBack }) {
  return (
    <div style={{ background: '#071226', padding: '14px 18px', position: 'sticky', top: 0, zIndex: 10, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
      <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', marginBottom: '6px', padding: 0 }}>
        <ArrowLeft size={13} /> Back
      </button>
      <h2 style={{ color: 'white', fontSize: '17px', fontWeight: '700', margin: 0 }}>{title}</h2>
      {subtitle && <p style={{ color: '#64748b', fontSize: '11px', marginTop: '3px' }}>{subtitle}</p>}
    </div>
  )
}

// ── Image Uploader ─────────────────────────────────────────────────────────────

function ImageUploader({ value, onChange, reportId }) {
  const inputRef = useRef(null)
  const [uploading, setUploading] = useState(false)

  async function handleFile(e) {
    const file = e.target.files[0]
    if (!file) return
    setUploading(true)
    try {
      const ext = file.name.split('.').pop()
      const path = `${reportId}/${uid()}.${ext}`
      const { error } = await supabase.storage.from('report-images').upload(path, file)
      if (error) throw error
      const { data: { publicUrl } } = supabase.storage.from('report-images').getPublicUrl(path)
      onChange(publicUrl)
    } catch (err) { alert('Upload failed: ' + err.message) }
    finally { setUploading(false); e.target.value = '' }
  }

  if (value) return (
    <div style={{ position: 'relative', borderRadius: '10px', overflow: 'hidden', border: '1px solid #e5e7eb' }}>
      <img src={value} alt="" style={{ width: '100%', maxHeight: '220px', objectFit: 'cover', display: 'block' }} />
      <button onClick={() => onChange(null)} style={{ position: 'absolute', top: '8px', right: '8px', width: '26px', height: '26px', borderRadius: '50%', background: 'rgba(0,0,0,0.55)', border: 'none', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <X size={12} />
      </button>
    </div>
  )

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
      {['Camera', 'Photo Library'].map(label => (
        <button key={label} onClick={() => !uploading && inputRef.current?.click()} disabled={uploading}
          style={{ padding: '12px', borderRadius: '10px', border: '1px solid #e5e7eb', background: 'white', cursor: 'pointer', fontSize: '13px', fontWeight: '600', color: '#374151', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
          <Upload size={14} color="#9ca3af" /> {uploading ? 'Uploading…' : label}
        </button>
      ))}
      <input ref={inputRef} type="file" accept="image/*" onChange={handleFile} style={{ display: 'none' }} />
    </div>
  )
}

// ── Section 1: Job Details ─────────────────────────────────────────────────────

function JobDetailsSection({ content, onChange, onBack, reportId, site }) {
  const d = content.job_details
  const upd = (k, v) => onChange({ ...content, job_details: { ...d, [k]: v } })

  // Pre-fill from site on first open if fields are empty
  useEffect(() => {
    if (!site || d.xradar_project) return
    const dt = site.scheduled_date ? new Date(site.scheduled_date + 'T00:00:00') : new Date()
    const yy = String(dt.getFullYear()).slice(2)
    const mm = String(dt.getMonth() + 1).padStart(2, '0')
    const dd = String(dt.getDate()).padStart(2, '0')
    onChange({
      ...content,
      job_details: {
        ...d,
        date_of_work: d.date_of_work || site.scheduled_date || '',
        client: d.client || site.client_company_name || '',
        xradar_project: `X${yy}${mm}${dd}-`,
        cover_image_url: d.cover_image_url || site.site_photo_url || null,
      },
    })
  }, [])

  return (
    <div style={{ minHeight: '100vh', background: '#f9fafb' }}>
      <SectionHeader title="Job Details" subtitle="Tap Save to save your changes" onBack={onBack} />
      <div style={{ padding: '16px' }}>
        <Card>
          <Field label="Date of Work" required>
            <input type="date" value={d.date_of_work} onChange={e => upd('date_of_work', e.target.value)}
              style={{ width: '100%', padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }} />
          </Field>
          <Field label="Client" required>
            <TInput value={d.client} onChange={v => upd('client', v)} placeholder="Answer" />
          </Field>
          <Field label="Street Address" required hint="Unit/Building Number & Street Name only.">
            <TInput value={d.street_address} onChange={v => upd('street_address', v)} placeholder="Answer" />
          </Field>
          <Field label="City" required>
            <TInput value={d.city} onChange={v => upd('city', v)} placeholder="Answer" />
          </Field>
          <Field label="PO #" hint="Double check Zuper or contact Dispatch if unsure.">
            <TInput value={d.po_number} onChange={v => upd('po_number', v)} placeholder="Answer" />
          </Field>
          <Field label="Xradar Project #" required>
            <TInput value={d.xradar_project} onChange={v => upd('xradar_project', v)} placeholder="X260529-" />
          </Field>
        </Card>
        <Card>
          <Field label="Job Quoted?" required>
            <YNARadio value={d.job_quoted} onChange={v => upd('job_quoted', v)} options={['yes', 'no']} />
          </Field>
          {d.job_quoted === 'yes' && (
            <Field label="Quote Number" required>
              <TInput value={d.quote_number || ''} onChange={v => upd('quote_number', v)} placeholder="Enter quote number" />
            </Field>
          )}
          <Field label="Job Complete?" required>
            <YNARadio value={d.job_complete} onChange={v => upd('job_complete', v)} options={['yes', 'no']} />
            <p style={{ fontSize: '11px', color: '#6b7280', marginTop: '6px', lineHeight: 1.5 }}>
              "Complete" means ALL work is concluded, no further site visits are required, and the client can be billed.
            </p>
          </Field>
        </Card>
        <Card>
          <Field label="General Notes / Job Summary">
            <TInput value={d.general_notes} onChange={v => upd('general_notes', v)} placeholder="Answer" multiline rows={5} />
          </Field>
        </Card>
        <Card>
          <Field label="Custom Title Image">
            <ImageUploader value={d.cover_image_url} onChange={v => upd('cover_image_url', v)} reportId={reportId} />
          </Field>
        </Card>
      </div>
    </div>
  )
}

// ── Section 2: Services & Equipment ───────────────────────────────────────────

function ServicesEquipmentSection({ content, onChange, onBack }) {
  const d = content.services_equipment

  function toggle(field, id) {
    const arr = d[field]
    onChange({ ...content, services_equipment: { ...d, [field]: arr.includes(id) ? arr.filter(x => x !== id) : [...arr, id] } })
  }

  function CheckRow({ checked, onToggle, label, sub }) {
    return (
      <div onClick={onToggle} style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', padding: '11px 0', borderBottom: '1px solid #f3f4f6', cursor: 'pointer' }}>
        <div style={{ width: '20px', height: '20px', borderRadius: '5px', border: `2px solid ${checked ? TEAL : '#d1d5db'}`, background: checked ? TEAL : 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '1px' }}>
          {checked && <Check size={11} color="white" strokeWidth={3} />}
        </div>
        <div>
          <p style={{ fontSize: '13px', fontWeight: checked ? '700' : '400', color: '#111827' }}>{label}</p>
          {sub && <p style={{ fontSize: '11px', color: '#9ca3af', marginTop: '2px' }}>{sub}</p>}
        </div>
      </div>
    )
  }

  function GroupHeader({ title, note }) {
    return (
      <div style={{ marginBottom: '4px' }}>
        <p style={{ fontSize: '11px', fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{title}</p>
        {note && <p style={{ fontSize: '11px', color: '#9ca3af', marginTop: '2px' }}>{note}</p>}
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f9fafb' }}>
      <SectionHeader title="Services & Equipment" subtitle="Tap Save to save your changes" onBack={onBack} />
      <div style={{ padding: '16px' }}>
        <Card>
          <GroupHeader title="Radar Units" note="Tick all units used" />
          {RADAR_UNITS.map(u => <CheckRow key={u.id} checked={d.radar_units.includes(u.id)} onToggle={() => toggle('radar_units', u.id)} label={u.model} sub={`${u.id} / SN: ${u.sn}`} />)}
        </Card>
        <Card>
          <GroupHeader title="Antenna Units" note="Tick all units used" />
          {ANTENNA_UNITS.map(u => <CheckRow key={u.id} checked={d.antenna_units.includes(u.id)} onToggle={() => toggle('antenna_units', u.id)} label={u.model} sub={`${u.id} / SN: ${u.sn}`} />)}
        </Card>
        <Card>
          <GroupHeader title="Services Provided" note="Tick all that apply" />
          {SERVICES.map(s => <CheckRow key={s} checked={d.services_provided.includes(s)} onToggle={() => toggle('services_provided', s)} label={s} />)}
        </Card>
      </div>
    </div>
  )
}

// ── Section 3: Personnel ───────────────────────────────────────────────────────

function PersonnelSection({ content, onChange, onBack, teamMembers }) {
  const d = content.personnel
  const names = DEFAULT_TEAM
  const setLead = v => onChange({ ...content, personnel: { ...d, lead_technician: v } })
  const addTech = () => onChange({ ...content, personnel: { ...d, additional_technicians: [...d.additional_technicians, ''] } })
  const updateTech = (i, v) => {
    const arr = [...d.additional_technicians]; arr[i] = v
    onChange({ ...content, personnel: { ...d, additional_technicians: arr } })
  }
  const removeTech = i => onChange({ ...content, personnel: { ...d, additional_technicians: d.additional_technicians.filter((_, idx) => idx !== i) } })

  const sel = { width: '100%', padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '13px', outline: 'none', boxSizing: 'border-box', background: 'white', color: '#111827' }

  return (
    <div style={{ minHeight: '100vh', background: '#f9fafb' }}>
      <SectionHeader title="Personnel" subtitle="Tap Save to save your changes" onBack={onBack} />
      <div style={{ padding: '16px' }}>
        <Card>
          <Field label="Lead Technician">
            <select value={d.lead_technician} onChange={e => setLead(e.target.value)} style={sel}>
              <option value="">— Select name —</option>
              {names.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
            {d.lead_technician && (
              <div style={{ marginTop: '8px', padding: '8px 12px', background: `${TEAL}12`, borderRadius: '8px', border: `1px solid ${TEAL}40` }}>
                <p style={{ fontSize: '13px', fontWeight: '700', color: TEAL }}>{d.lead_technician}</p>
              </div>
            )}
          </Field>
          {d.additional_technicians.map((t, i) => (
            <div key={i} style={{ marginBottom: '10px' }}>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <select value={t} onChange={e => updateTech(i, e.target.value)} style={{ ...sel, flex: 1 }}>
                  <option value="">— Select name —</option>
                  {names.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
                <button onClick={() => removeTech(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: '6px' }}>
                  <X size={14} />
                </button>
              </div>
              {t && (
                <div style={{ marginTop: '6px', padding: '8px 12px', background: '#f0fdf4', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
                  <p style={{ fontSize: '13px', fontWeight: '700', color: '#166534' }}>{t}</p>
                </div>
              )}
            </div>
          ))}
          <button onClick={addTech} style={{ display: 'flex', alignItems: 'center', gap: '6px', color: TEAL, background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: '600', padding: 0, marginTop: '4px' }}>
            <Plus size={14} /> Add technician
          </button>
        </Card>
      </div>
    </div>
  )
}

// ── Limitations Picker ─────────────────────────────────────────────────────────

function LimitationsPicker({ title, options, selected, onChange, onBack }) {
  return (
    <div style={{ minHeight: '100vh', background: '#f9fafb' }}>
      <SectionHeader title={title} subtitle="Tap Save to save your changes" onBack={onBack} />
      <div style={{ padding: '16px' }}>
        {options.map((text, i) => {
          const active = selected.includes(i)
          return (
            <div key={i} onClick={() => onChange(active ? selected.filter(x => x !== i) : [...selected, i])}
              style={{ background: 'white', borderRadius: '10px', padding: '14px', marginBottom: '10px', border: `1px solid ${active ? TEAL : '#f3f4f6'}`, cursor: 'pointer', display: 'flex', gap: '12px', alignItems: 'flex-start', boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
              <div style={{ width: '18px', height: '18px', borderRadius: '50%', border: `2px solid ${active ? TEAL : '#d1d5db'}`, background: active ? TEAL : 'white', flexShrink: 0, marginTop: '2px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {active && <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'white' }} />}
              </div>
              <p style={{ fontSize: '12px', color: '#374151', lineHeight: 1.65, margin: 0 }}>{text}</p>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Location Editor ────────────────────────────────────────────────────────────

function LocationEditor({ location, onSave, onBack, reportId }) {
  const [loc, setLoc] = useState(location)
  const upd = (k, v) => setLoc(l => ({ ...l, [k]: v }))

  function handleBack() { onSave(loc); onBack() }

  return (
    <div style={{ minHeight: '100vh', background: '#f9fafb' }}>
      <SectionHeader title={loc.name || 'Location'} subtitle="Add scan location details" onBack={handleBack} />
      <div style={{ padding: '16px' }}>
        <Card>
          <Field label="Image of Location" required>
            <ImageUploader value={loc.image_url} onChange={v => upd('image_url', v)} reportId={reportId} />
          </Field>
          <Field label="Location" required hint="Scan locations are labeled on the slab with the date scanned followed by the technician initials and the number of scan that day. For example: 2021-01-01 - MN #5">
            <TInput value={loc.name} onChange={v => upd('name', v)} placeholder="Answer" />
          </Field>
          <Field label="Notes" hint='Please specify here in notes if using anything other than 2" clearance from targets.'>
            <TInput value={loc.notes} onChange={v => upd('notes', v)} placeholder="Answer" multiline rows={3} />
          </Field>
        </Card>
        <Card>
          <Field label="Is this a Complete Scan highlighted with a Yellow Boundary?" required>
            <YNARadio value={loc.complete_scan} onChange={v => upd('complete_scan', v)} options={['yes', 'no']} />
          </Field>
          {loc.complete_scan === 'no' && (
            <>
              <Field label="Is this a Limited Scan highlighted with a Black Boundary?" required>
                <YNARadio value={loc.limited_scan_black} onChange={v => upd('limited_scan_black', v)} options={['yes', 'no']} />
              </Field>
              <Field label="Is the Limited Scan for Anchoring?" required>
                <YNARadio value={loc.limited_scan_anchoring} onChange={v => upd('limited_scan_anchoring', v)} options={['yes', 'no']} />
              </Field>
              <Field label="Maximum Depth of Penetration from the top of the slab / front side of the wall:">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input value={loc.max_depth_top || ''} onChange={e => upd('max_depth_top', e.target.value)} placeholder="Answer"
                    style={{ flex: 1, padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '13px', outline: 'none' }} />
                  <span style={{ fontSize: '12px', color: '#6b7280', flexShrink: 0 }}>mm</span>
                </div>
              </Field>
              <Field label="Maximum Depth of Penetration from the bottom of the slab / back side of the wall:">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input value={loc.max_depth_bottom || ''} onChange={e => upd('max_depth_bottom', e.target.value)} placeholder="Answer"
                    style={{ flex: 1, padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '13px', outline: 'none' }} />
                  <span style={{ fontSize: '12px', color: '#6b7280', flexShrink: 0 }}>mm</span>
                </div>
              </Field>
            </>
          )}
          <Field label="Slab Thickness" required>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input value={loc.slab_thickness_min} onChange={e => upd('slab_thickness_min', e.target.value)} placeholder="e.g. 200"
                style={{ flex: 1, padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '13px', outline: 'none' }} />
              <span style={{ fontSize: '12px', color: '#6b7280', flexShrink: 0 }}>mm —</span>
              <input value={loc.slab_thickness_max} onChange={e => upd('slab_thickness_max', e.target.value)} placeholder="optional"
                style={{ flex: 1, padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '13px', outline: 'none' }} />
              <span style={{ fontSize: '12px', color: '#6b7280', flexShrink: 0 }}>mm</span>
            </div>
          </Field>
          <Field label="Has a core hole location been laid out?" required>
            <YNARadio value={loc.core_hole_laid} onChange={v => upd('core_hole_laid', v)} options={['yes', 'no']} />
            {loc.core_hole_laid === 'yes' && (
              <>
                <div style={{ marginTop: '12px' }}>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: TEAL, marginBottom: '6px' }}>Proposed Core Size *</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input value={loc.proposed_core_size || ''} onChange={e => upd('proposed_core_size', e.target.value)} placeholder="Answer"
                      style={{ flex: 1, padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '13px', outline: 'none' }} />
                    <span style={{ fontSize: '12px', color: '#6b7280', flexShrink: 0 }}>mm</span>
                  </div>
                </div>
                <div style={{ marginTop: '12px' }}>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#374151', marginBottom: '8px' }}>Recommendation</label>
                  {[
                    'Use ONLY the proposed core location when coring.',
                    'We recommend using the proposed core location. If another location is chosen then avoid all target by 2 inch (3 inch if PT) when coring.',
                  ].map((opt, i) => (
                    <label key={i} onClick={() => upd('core_recommendation', loc.core_recommendation === opt ? null : opt)}
                      style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '10px', cursor: 'pointer' }}>
                      <div style={{ width: '18px', height: '18px', borderRadius: '50%', border: `2px solid ${loc.core_recommendation === opt ? TEAL : '#d1d5db'}`, background: loc.core_recommendation === opt ? TEAL : 'white', flexShrink: 0, marginTop: '1px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {loc.core_recommendation === opt && <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'white' }} />}
                      </div>
                      <span style={{ fontSize: '12px', color: TEAL, lineHeight: 1.5 }}>{opt}</span>
                    </label>
                  ))}
                </div>
              </>
            )}
          </Field>
        </Card>
        <Card>
          <Field label="Post Tension (PT) Cables (Pink) Present:">
            <YNARadio value={loc.pt_cables} onChange={v => upd('pt_cables', v)} />
            {loc.pt_cables === 'yes' && (
              <div style={{ marginTop: '10px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#374151', marginBottom: '6px' }}>PT Cable Depth</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input value={loc.pt_cable_depth || ''} onChange={e => upd('pt_cable_depth', e.target.value)} placeholder="Answer"
                    style={{ flex: 1, padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '13px', outline: 'none' }} />
                  <span style={{ fontSize: '12px', color: '#6b7280' }}>mm</span>
                </div>
              </div>
            )}
          </Field>
          <Field label="Conduits (Red) Present:">
            <YNARadio value={loc.conduits} onChange={v => upd('conduits', v)} />
            {loc.conduits === 'yes' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '10px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#374151', marginBottom: '6px' }}>Conduit Depth</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <input value={loc.conduit_depth || ''} onChange={e => upd('conduit_depth', e.target.value)} placeholder="Answer"
                      style={{ flex: 1, padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '13px', outline: 'none' }} />
                    <span style={{ fontSize: '12px', color: '#6b7280' }}>mm</span>
                  </div>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#374151', marginBottom: '6px' }}>Conduit Material</label>
                  <input value={loc.conduit_material || ''} onChange={e => upd('conduit_material', e.target.value)} placeholder="Answer"
                    style={{ width: '100%', padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }} />
                </div>
              </div>
            )}
          </Field>
          <Field label="Was live power detected using an EM power sweep?">
            <YNARadio value={loc.live_power} onChange={v => upd('live_power', v)} />
          </Field>
          <Field label="Top Steel Reinforcement (Green) Present:" color="#22c55e">
            <YNARadio value={loc.top_steel} onChange={v => upd('top_steel', v)} />
            {loc.top_steel === 'yes' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '10px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#374151', marginBottom: '6px' }}>Top Steel Reinforcement Depth</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <input value={loc.top_steel_depth || ''} onChange={e => upd('top_steel_depth', e.target.value)} placeholder="Answer"
                      style={{ flex: 1, padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '13px', outline: 'none' }} />
                    <span style={{ fontSize: '12px', color: '#6b7280' }}>mm</span>
                  </div>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#374151', marginBottom: '6px' }}>Top Steel Reinforcement Spacing</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <input value={loc.top_steel_spacing_min || ''} onChange={e => upd('top_steel_spacing_min', e.target.value)} placeholder="e.g. >200"
                      style={{ flex: 1, padding: '10px 8px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '12px', outline: 'none' }} />
                    <span style={{ fontSize: '11px', color: '#6b7280' }}>mm —</span>
                    <input value={loc.top_steel_spacing_max || ''} onChange={e => upd('top_steel_spacing_max', e.target.value)} placeholder="optional"
                      style={{ flex: 1, padding: '10px 8px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '12px', outline: 'none' }} />
                    <span style={{ fontSize: '11px', color: '#6b7280' }}>mm</span>
                  </div>
                </div>
              </div>
            )}
          </Field>
          <Field label="Bottom Steel Reinforcement (Blue) Present:" color="#3b82f6">
            <YNARadio value={loc.bottom_steel} onChange={v => upd('bottom_steel', v)} />
            {loc.bottom_steel === 'yes' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '10px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#374151', marginBottom: '6px' }}>Bottom Steel Reinforcement Depth</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <input value={loc.bottom_steel_depth || ''} onChange={e => upd('bottom_steel_depth', e.target.value)} placeholder="Answer"
                      style={{ flex: 1, padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '13px', outline: 'none' }} />
                    <span style={{ fontSize: '12px', color: '#6b7280' }}>mm</span>
                  </div>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#374151', marginBottom: '6px' }}>Bottom Steel Reinforcement Spacing</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <input value={loc.bottom_steel_spacing_min || ''} onChange={e => upd('bottom_steel_spacing_min', e.target.value)} placeholder="e.g. >200"
                      style={{ flex: 1, padding: '10px 8px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '12px', outline: 'none' }} />
                    <span style={{ fontSize: '11px', color: '#6b7280' }}>mm —</span>
                    <input value={loc.bottom_steel_spacing_max || ''} onChange={e => upd('bottom_steel_spacing_max', e.target.value)} placeholder="optional"
                      style={{ flex: 1, padding: '10px 8px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '12px', outline: 'none' }} />
                    <span style={{ fontSize: '11px', color: '#6b7280' }}>mm</span>
                  </div>
                </div>
              </div>
            )}
          </Field>
        </Card>
        <Card>
          <Field label="Has This Location Been Previously Scanned by Xradar?">
            <YNARadio value={loc.previously_scanned} onChange={v => upd('previously_scanned', v)} options={['yes', 'no']} />
            {loc.previously_scanned === 'yes' && (
              <div style={{ marginTop: '10px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#374151', marginBottom: '6px' }}>Previous Scan Date</label>
                <input type="date" value={loc.previous_scan_date || ''} onChange={e => upd('previous_scan_date', e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }} />
              </div>
            )}
          </Field>
          <Field label="Survey Area Clear of Obstructing Items, Debris and Standing Water?">
            <YNARadio value={loc.survey_area_clear} onChange={v => upd('survey_area_clear', v)} />
          </Field>
          <Field label="Scanned From Both Sides?">
            <YNARadio value={loc.scanned_both_sides} onChange={v => upd('scanned_both_sides', v)} />
          </Field>
          <Field label="Location Pin-Pointed to other side?">
            <YNARadio value={loc.pin_pointed} onChange={v => upd('pin_pointed', v)} />
          </Field>
        </Card>
      </div>
    </div>
  )
}

// ── Concrete Type Editor ───────────────────────────────────────────────────────

function ConcreteTypeEditor({ concreteType, onSave, onBack, reportId }) {
  const [ct, setCt] = useState(concreteType)
  const [sub, setSub] = useState(null) // { view: 'location', id } | { view: 'limits' }
  const upd = (k, v) => setCt(c => ({ ...c, [k]: v }))

  function addLocation() {
    const loc = blankLocation()
    setCt(c => ({ ...c, locations: [...c.locations, loc] }))
    setSub({ view: 'location', id: loc.id })
  }

  if (sub?.view === 'location') {
    const loc = ct.locations.find(l => l.id === sub.id) || blankLocation()
    return <LocationEditor location={loc} onSave={updated => setCt(c => ({ ...c, locations: c.locations.map(l => l.id === updated.id ? updated : l) }))} onBack={() => setSub(null)} reportId={reportId} />
  }

  if (sub?.view === 'limits') {
    return (
      <div style={{ minHeight: '100vh', background: '#f9fafb' }}>
        <SectionHeader title="Slab-specific and Technology Limitations" subtitle="Concrete Type 1" onBack={() => setSub(null)} />
        <div style={{ padding: '16px' }}>
          <Card>
            <Field label="Dense Steel Reinforcement?">
              <YNARadio value={ct.dense_steel} onChange={v => upd('dense_steel', v)} />
            </Field>
          </Card>
          {SLAB_TECH_LIMITATIONS.map((text, i) => {
            const active = ct.slab_tech_limitations.includes(i)
            return (
              <div key={i} onClick={() => upd('slab_tech_limitations', active ? ct.slab_tech_limitations.filter(x => x !== i) : [...ct.slab_tech_limitations, i])}
                style={{ background: 'white', borderRadius: '10px', padding: '14px', marginBottom: '10px', border: `1px solid ${active ? TEAL : '#f3f4f6'}`, cursor: 'pointer', display: 'flex', gap: '12px', alignItems: 'flex-start', boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
                <div style={{ width: '18px', height: '18px', borderRadius: '50%', border: `2px solid ${active ? TEAL : '#d1d5db'}`, background: active ? TEAL : 'white', flexShrink: 0, marginTop: '2px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {active && <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'white' }} />}
                </div>
                <p style={{ fontSize: '12px', color: '#374151', lineHeight: 1.65, margin: 0 }}>{text}</p>
              </div>
            )
          })}
          <Card>
            <Field label="Slab-specific Notes">
              <TInput value={ct.slab_specific_notes || ''} onChange={v => upd('slab_specific_notes', v)} placeholder="Answer" multiline rows={4} />
            </Field>
          </Card>
        </div>
      </div>
    )
  }

  const sel = { width: '100%', padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '13px', outline: 'none', boxSizing: 'border-box', background: 'white' }

  return (
    <div style={{ minHeight: '100vh', background: '#f9fafb' }}>
      <SectionHeader title={ct.name || 'Concrete Type'} subtitle="Add each scan location and its measurements." onBack={() => { onSave(ct); onBack() }} />
      <div style={{ padding: '16px' }}>
        <Card>
          <Field label="Concrete Type Name" required>
            <TInput value={ct.name} onChange={v => upd('name', v)} placeholder="e.g. Column, Beam, Slab" />
          </Field>
          <Field label="Type of Concrete Slab" required>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '4px' }}>
              {SLAB_TYPES.map(t => (
                <button key={t} onClick={() => upd('slab_type', ct.slab_type === t ? '' : t)}
                  style={{ padding: '7px 14px', borderRadius: '20px', border: `1px solid ${ct.slab_type === t ? TEAL : '#e5e7eb'}`, background: ct.slab_type === t ? `${TEAL}18` : 'white', color: ct.slab_type === t ? TEAL : '#374151', fontSize: '12px', fontWeight: ct.slab_type === t ? '700' : '400', cursor: 'pointer' }}>
                  {t}
                </button>
              ))}
            </div>
            {ct.slab_type === 'Other' && (
              <div style={{ marginTop: '10px' }}>
                <TInput value={ct.slab_type_notes || ''} onChange={v => upd('slab_type_notes', v)} placeholder="Please specify…" />
              </div>
            )}
          </Field>
        </Card>
        <Card>
          <Field label="Have you confirmed with the client that the slab does not contain PT cables?" required>
            <YNARadio value={ct.pt_cables_absent} onChange={v => upd('pt_cables_absent', v)} options={['yes', 'no']} />
          </Field>
          <Field label="How was the GPR Equipment Velocity Calibrated?" required hint='For example: "Set correct dielectric by using slab thickness." If unable to Calibrate, note this and the reason why.'>
            <TInput value={ct.gpr_velocity} onChange={v => upd('gpr_velocity', v)} placeholder="Answer" />
          </Field>
          <Field label="Are floorplans / drawings available for this slab?" required>
            <YNARadio value={ct.floorplans_available} onChange={v => upd('floorplans_available', v)} options={['yes', 'no']} />
            {ct.floorplans_available === 'yes' && (
              <div style={{ marginTop: '10px' }}>
                <p style={{ fontSize: '11px', color: '#6b7280', marginBottom: '6px' }}>Upload floorplan / drawing</p>
                <ImageUploader value={ct.floorplan_image_url || null} onChange={v => upd('floorplan_image_url', v)} reportId={reportId} />
              </div>
            )}
          </Field>
          <Field label="Are there cores that require approval?" required>
            <YNARadio value={ct.cores_require_approval} onChange={v => upd('cores_require_approval', v)} options={['yes', 'no']} />
            {ct.cores_require_approval === 'yes' && (
              <div style={{ marginTop: '10px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#374151', marginBottom: '6px' }}>How many cores require approval?</label>
                <input type="number" min="1" value={ct.cores_approval_count || ''} onChange={e => upd('cores_approval_count', e.target.value)}
                  placeholder="Enter number"
                  style={{ width: '100%', padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }} />
              </div>
            )}
          </Field>
          <Field label="Are all Survey Locations for this Slab Type the exact same?" required>
            <YNARadio value={ct.all_locations_same} onChange={v => upd('all_locations_same', v)} options={['yes', 'no']} />
            <div style={{ marginTop: '8px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '7px', padding: '8px 10px', fontSize: '11px', color: '#92400e', lineHeight: 1.5 }}>
              WARNING: Only set to Yes when you are sure all Survey Locations for this Slab Type are identical with regards to Complete/Limited Scans, Anchoring/Trenching, Max Depth of Penetration, Proposed Core Locations/Sizes, Wire Mesh, Top/Bottom Steel Reinforcement, and Slab Thickness.
            </div>
          </Field>
        </Card>

        {/* Survey Locations */}
        <Card>
          <p style={{ fontSize: '13px', fontWeight: '700', color: '#111827', marginBottom: '10px' }}>Survey Locations</p>
          {ct.locations.length === 0 && <p style={{ fontSize: '12px', color: '#9ca3af', marginBottom: '10px' }}>No locations added yet.</p>}
          {ct.locations.map((loc, i) => (
            <div key={loc.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 12px', background: '#f9fafb', borderRadius: '8px', marginBottom: '8px', border: '1px solid #f3f4f6' }}>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: '13px', fontWeight: '600', color: '#111827' }}>{loc.name || `Location ${i + 1}`}</p>
                {loc.complete_scan && <p style={{ fontSize: '11px', color: '#6b7280', marginTop: '2px' }}>{loc.complete_scan === 'yes' ? 'Complete Scan' : 'Limited Scan'}</p>}
              </div>
              <button onClick={() => setSub({ view: 'location', id: loc.id })} style={{ background: 'none', border: 'none', cursor: 'pointer', color: TEAL, padding: '4px' }}>
                <ChevronRight size={16} />
              </button>
              <button onClick={() => setCt(c => ({ ...c, locations: c.locations.filter(l => l.id !== loc.id) }))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: '4px' }}>
                <X size={13} />
              </button>
            </div>
          ))}
          <button onClick={addLocation} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: `1px dashed ${TEAL}60`, background: `${TEAL}08`, color: TEAL, fontSize: '13px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
            <Plus size={13} /> Add Item
          </button>
        </Card>

        <Card>
          <Field label="Steel Reinforcement Diameter Determined?">
            <YNARadio value={ct.steel_diam_determined} onChange={v => upd('steel_diam_determined', v)} />
            {ct.steel_diam_determined === 'yes' && (
              <div style={{ marginTop: '10px' }}>
                <select value={ct.steel_diam_size || ''} onChange={e => upd('steel_diam_size', e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '13px', outline: 'none', boxSizing: 'border-box', background: 'white', color: '#111827' }}>
                  <option value="">— Select diameter —</option>
                  {['6 mm','8 mm','10 mm','12 mm','15 mm','20 mm','25 mm','32 mm','40 mm'].map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            )}
          </Field>
          <Field label="Concrete Corrosion Noted in the Slab?">
            <YNARadio value={ct.concrete_corrosion} onChange={v => upd('concrete_corrosion', v)} />
            {ct.concrete_corrosion === 'yes' && <p style={{ fontSize: '11px', color: '#6b7280', marginTop: '5px' }}>If Yes, a Concrete Corrosion Survey is recommended.</p>}
          </Field>
          <Field label="Voids Noted Within or Below the Concrete Slab?">
            <YNARadio value={ct.voids_noted} onChange={v => upd('voids_noted', v)} />
            {ct.voids_noted === 'yes' && <p style={{ fontSize: '11px', color: '#6b7280', marginTop: '5px' }}>If Yes, a Void Survey is recommended.</p>}
          </Field>
          <Field label="Other Items Present in the Slab?">
            <YNARadio value={ct.other_items} onChange={v => upd('other_items', v)} />
          </Field>
          <Field label="Slab Bands, Beams and Column Caps (Yellow) Present?">
            <YNARadio value={ct.slab_bands} onChange={v => upd('slab_bands', v)} />
          </Field>
        </Card>

        <button onClick={() => setSub({ view: 'limits' })} style={{ width: '100%', background: 'white', border: '1px solid #f3f4f6', borderRadius: '12px', padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', marginBottom: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ textAlign: 'left' }}>
            <p style={{ fontSize: '13px', fontWeight: '600', color: '#111827' }}>Slab-specific and Technology Limitations</p>
            <p style={{ fontSize: '11px', color: ct.slab_tech_limitations.length ? TEAL : '#9ca3af', marginTop: '3px' }}>
              {ct.slab_tech_limitations.length ? `${ct.slab_tech_limitations.length} selected` : 'Not filled'}
            </p>
          </div>
          <ChevronRight size={16} color="#9ca3af" />
        </button>
      </div>
    </div>
  )
}

// ── Section 4: Services Breakdown ─────────────────────────────────────────────

function ServicesBreakdownSection({ content, onChange, onBack, reportId }) {
  const d = content.services_breakdown
  const [sub, setSub] = useState(null) // { view: 'type', id } | { view: 'limits' }

  const updateCT = updated => onChange({ ...content, services_breakdown: { ...d, concrete_types: d.concrete_types.map(ct => ct.id === updated.id ? updated : ct) } })
  const removeCT = id => onChange({ ...content, services_breakdown: { ...d, concrete_types: d.concrete_types.filter(ct => ct.id !== id) } })

  function addCT() {
    const ct = blankConcreteType()
    ct.name = `Concrete Type ${d.concrete_types.length + 1}`
    onChange({ ...content, services_breakdown: { ...d, concrete_types: [...d.concrete_types, ct] } })
    setSub({ view: 'type', id: ct.id })
  }

  if (sub?.view === 'type') {
    const ct = d.concrete_types.find(c => c.id === sub.id)
    if (!ct) { setSub(null); return null }
    return <ConcreteTypeEditor concreteType={ct} onSave={updateCT} onBack={() => setSub(null)} reportId={reportId} />
  }

  if (sub?.view === 'limits') {
    return <LimitationsPicker title="General Limitation" options={GENERAL_LIMITATIONS} selected={d.general_limitations} onChange={v => onChange({ ...content, services_breakdown: { ...d, general_limitations: v } })} onBack={() => setSub(null)} />
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f9fafb' }}>
      <SectionHeader title="Services Breakdown" onBack={onBack} />
      <div style={{ padding: '16px' }}>
        {/* Concrete Scanning Data */}
        <Card>
          <p style={{ fontSize: '14px', fontWeight: '700', color: '#111827', marginBottom: '4px' }}>Concrete Scanning Data</p>
          <p style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '12px' }}>Add each concrete type, then tap the arrow to enter scan data.</p>
          {d.concrete_types.map((ct, i) => (
            <div key={ct.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 12px', background: '#f9fafb', borderRadius: '8px', marginBottom: '8px', border: '1px solid #f3f4f6' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: '13px', fontWeight: '600', color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ct.name || `Concrete Type ${i + 1}`}</p>
                <p style={{ fontSize: '11px', color: '#9ca3af', marginTop: '2px' }}>{ct.locations.length} location{ct.locations.length !== 1 ? 's' : ''}</p>
              </div>
              <button onClick={() => setSub({ view: 'type', id: ct.id })} style={{ background: 'none', border: 'none', cursor: 'pointer', color: TEAL, padding: '4px' }}>
                <ChevronRight size={16} />
              </button>
              <button onClick={() => removeCT(ct.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: '4px' }}>
                <X size={13} />
              </button>
            </div>
          ))}
          <button onClick={addCT} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: `1px dashed ${TEAL}60`, background: `${TEAL}08`, color: TEAL, fontSize: '13px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
            <Plus size={13} /> Add Concrete Type
          </button>
        </Card>

        {/* General Limitation */}
        <button onClick={() => setSub({ view: 'limits' })} style={{ width: '100%', background: 'white', border: '1px solid #f3f4f6', borderRadius: '12px', padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ textAlign: 'left' }}>
            <p style={{ fontSize: '14px', fontWeight: '700', color: '#111827' }}>General Limitation</p>
            <p style={{ fontSize: '11px', color: d.general_limitations.length ? TEAL : '#9ca3af', marginTop: '3px' }}>
              {d.general_limitations.length ? `${d.general_limitations.length} selected` : 'Tap to fill in'}
            </p>
          </div>
          <ChevronRight size={16} color="#9ca3af" />
        </button>
      </div>
    </div>
  )
}

// ── Section 5: Client Details ──────────────────────────────────────────────────

function ClientDetailsSection({ content, onChange, onBack }) {
  const d = content.client_details
  const upd = (k, v) => onChange({ ...content, client_details: { ...d, [k]: v } })

  return (
    <div style={{ minHeight: '100vh', background: '#f9fafb' }}>
      <SectionHeader title="Client Details" subtitle="Tap Save to save your changes" onBack={onBack} />
      <div style={{ padding: '16px' }}>
        <Card>
          <Field label="Client Representative present on site?" required>
            <YNARadio value={d.present_on_site} onChange={v => upd('present_on_site', v)} options={['yes', 'no']} />
          </Field>
        </Card>
        <Card>
          <Field label="Client Representative Name:">
            <TInput value={d.representative} onChange={v => upd('representative', v)} placeholder="Answer" />
          </Field>
          <Field label="Client Phone Number:">
            <TInput value={d.phone || ''} onChange={v => upd('phone', v)} placeholder="Answer" />
          </Field>
        </Card>
        <Card>
          <Field label="Did you consult the client / site representative BEFORE starting work?" required hint="With regards to the scope and its completion.">
            <YNARadio value={d.consulted_before} onChange={v => upd('consulted_before', v)} options={['yes', 'no']} />
          </Field>
        </Card>
        <Card>
          <Field label="Did you consult the client / site representative AFTER finishing work?" required hint="With regards to the scope and its completion.">
            <YNARadio value={d.consulted_after} onChange={v => upd('consulted_after', v)} options={['yes', 'no']} />
          </Field>
        </Card>
      </div>
    </div>
  )
}

// ── Section 6: Sign-off ────────────────────────────────────────────────────────

function SignOffSection({ content, onChange, onBack, teamMembers }) {
  const d = content.sign_off
  const today = new Date().toISOString().split('T')[0]
  const upd = (k, v) => onChange({ ...content, sign_off: { ...d, [k]: v } })

  const names = DEFAULT_TEAM
  const sel = { width: '100%', padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '13px', outline: 'none', boxSizing: 'border-box', background: 'white', color: '#111827' }

  return (
    <div style={{ minHeight: '100vh', background: '#f9fafb' }}>
      <SectionHeader title="Sign-off" subtitle="Tap Save to save your changes" onBack={onBack} />
      <div style={{ padding: '16px' }}>
        <Card>
          <Field label="Prepared by">
            <select value={d.prepared_by || ''} onChange={e => upd('prepared_by', e.target.value)} style={sel}>
              <option value="">- Select name -</option>
              {names.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </Field>
          <Field label="Sign-off date">
            <input type="date" value={d.sign_off_date || today} onChange={e => upd('sign_off_date', e.target.value)}
              style={{ width: '100%', padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }} />
          </Field>
        </Card>
        <button onClick={onBack} style={{ width: '100%', padding: '14px', borderRadius: '10px', border: 'none', background: '#2563eb', color: 'white', fontSize: '14px', fontWeight: '700', cursor: 'pointer', marginTop: '4px' }}>
          Save
        </button>
      </div>
    </div>
  )
}

// ── Print Document ─────────────────────────────────────────────────────────────

function PrintDocument({ report }) {
  const c = report.content || {}
  const jd = c.job_details || {}
  const se = c.services_equipment || {}
  const per = c.personnel || {}
  const sb = c.services_breakdown || {}
  const cd = c.client_details || {}
  const so = c.sign_off || {}

  const selectedRadar = RADAR_UNITS.filter(u => (se.radar_units || []).includes(u.id))
  const selectedAntenna = ANTENNA_UNITS.filter(u => (se.antenna_units || []).includes(u.id))
  const genLimits = (sb.general_limitations || []).map(i => GENERAL_LIMITATIONS[i]).filter(Boolean)
  const addTechs = (per.additional_technicians || []).filter(Boolean)

  const tdR = { padding: '8px 14px', fontSize: '12px', color: '#475569', textAlign: 'right', width: '42%' }
  const tdL = { padding: '8px 14px', fontSize: '12px', color: '#0f172a' }

  function YNBadge({ v }) {
    const m = ynMeta(v)
    if (!m) return <span style={{ color: '#94a3b8' }}>—</span>
    return <span style={{ fontWeight: '700', color: m.text }}>{m.label}</span>
  }

  function TealSection({ title, children }) {
    return (
      <div style={{ marginBottom: '20px', pageBreakInside: 'avoid' }}>
        <div style={{ background: TEAL, color: 'white', padding: '7px 14px', fontSize: '13px', fontWeight: '700' }}>{title}</div>
        {children}
      </div>
    )
  }

  function KVTable({ rows }) {
    const filtered = rows.filter(([, v]) => v !== null && v !== undefined && v !== '')
    if (!filtered.length) return null
    return (
      <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #e2e8f0', borderTop: 'none' }}>
        <tbody>
          <tr style={{ borderBottom: '1px solid #e2e8f0', background: '#fafafa' }}>
            <td style={{ ...tdR, fontWeight: '700', color: '#0f172a' }} />
            <td style={{ ...tdL, fontWeight: '700', color: '#0f172a' }}>Details</td>
          </tr>
          {filtered.map(([label, value], i) => (
            <tr key={i} style={{ borderBottom: '1px solid #e2e8f0' }}>
              <td style={{ ...tdR, background: i % 2 === 0 ? '#fafafa' : 'white' }}>{label}</td>
              <td style={{ ...tdL, background: i % 2 === 0 ? '#fafafa' : 'white' }}>{value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    )
  }

  function BulletList({ items }) {
    return (
      <div style={{ border: '1px solid #e2e8f0', borderTop: 'none', padding: '14px' }}>
        <ul style={{ margin: 0, paddingLeft: '20px' }}>
          {items.map((item, i) => (
            <li key={i} style={{ fontSize: '12px', color: '#475569', marginBottom: i < items.length - 1 ? '10px' : 0, lineHeight: 1.65, paddingBottom: i < items.length - 1 ? '10px' : 0, borderBottom: i < items.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
              {item}
            </li>
          ))}
        </ul>
      </div>
    )
  }

  const fmtDate = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-MY', { day: 'numeric', month: 'long', year: 'numeric' }) : ''

  return (
    <div className="xyte-print-doc" style={{ fontFamily: 'Arial, sans-serif', fontSize: '12px', color: '#0f172a' }}>

      {/* Cover */}
      <div style={{ textAlign: 'center', marginBottom: '40px', paddingBottom: '32px', borderBottom: '2px solid #e2e8f0' }}>
        <div style={{ marginBottom: '24px' }}>
          <div style={{ fontSize: '34px', fontWeight: '900', letterSpacing: '-0.03em', lineHeight: 1 }}>
            <span style={{ color: TEAL }}>X</span><span style={{ color: '#0f172a' }}>radar</span>
          </div>
          <p style={{ fontSize: '12px', color: TEAL, fontWeight: '700', marginTop: '6px' }}>Malaysia</p>
          <p style={{ fontSize: '11px', color: '#475569', marginTop: '2px' }}>Xradar Asia Sdn Bhd</p>
          <p style={{ fontSize: '11px', color: '#475569' }}>17, Jalan PJS 7/21, Bandar Sunway, 46150 Petaling Jaya, Selangor</p>
          <p style={{ fontSize: '11px', color: '#475569' }}>+603-7494 0629</p>
          <a href="https://www.xradar.asia" style={{ fontSize: '11px', color: TEAL }}>www.xradar.asia</a>
        </div>
        {jd.cover_image_url && (
          <img src={jd.cover_image_url} alt="Cover" style={{ width: '100%', height: '240px', objectFit: 'cover', borderRadius: '6px', marginBottom: '24px', display: 'block' }} />
        )}
        <h1 style={{ fontSize: '22px', fontWeight: '700', color: '#0f172a', marginBottom: '16px' }}>Xradar Summary Report</h1>
        <div style={{ fontSize: '13px', color: '#475569', lineHeight: 2.2 }}>
          {jd.xradar_project && <p>Xradar Reference: {jd.xradar_project}</p>}
          {(jd.street_address || jd.city) && <p>Site Address: {[jd.street_address, jd.city].filter(Boolean).join(', ')}</p>}
          {jd.date_of_work && <p>Inspection Date: {fmtDate(jd.date_of_work)}</p>}
          {jd.client && <p>Client: {jd.client}</p>}
        </div>
        <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '16px', marginTop: '16px' }}>
          {(so.prepared_by || per.lead_technician) && <p style={{ fontSize: '13px', color: '#475569', marginBottom: '4px' }}>Prepared by: <strong>{so.prepared_by || per.lead_technician}</strong></p>}
          {so.reviewed_by && <p style={{ fontSize: '13px', color: '#475569' }}>Reviewed &amp; Approved by: <strong>{so.reviewed_by}</strong></p>}
          {report.status === 'approved' && (
            <div style={{ display: 'inline-block', marginTop: '12px', border: '2px solid #166534', borderRadius: '6px', padding: '6px 18px', fontSize: '13px', fontWeight: '700', color: '#166534' }}>✓ Approved</div>
          )}
        </div>
        <div style={{ marginTop: '24px', borderTop: '1px solid #e2e8f0', paddingTop: '12px', display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#94a3b8' }}>
          <span>+603-7494 0629</span>
          <span style={{ color: TEAL, fontWeight: '700' }}>xradar.asia</span>
        </div>
      </div>

      {/* Job Summary */}
      <TealSection title="Job Summary">
        <KVTable rows={[
          ['Xradar Services Provided', (se.services_provided || []).join(', ')],
          ['Job Summary', jd.general_notes],
          ['Client Representative', cd.representative],
          ['Client Representative Present on Site', <YNBadge key="1" v={cd.present_on_site} />],
          ['Client Representative was consulted before starting work', <YNBadge key="2" v={cd.consulted_before} />],
          ['Client Representative was consulted after finishing work', <YNBadge key="3" v={cd.consulted_after} />],
          ['Quoted Job', <YNBadge key="4" v={jd.job_quoted} />],
          ['Quote number', jd.quote_number || cd.quote_number || jd.po_number],
          ['Job complete', <YNBadge key="5" v={jd.job_complete} />],
        ]} />
      </TealSection>

      {/* Concrete Scanning Details */}
      <TealSection title="Xradar Concrete Scanning Details">
        <KVTable rows={[
          ['Xradar Lead Technician', per.lead_technician],
          ['Additional Technician', addTechs.length ? addTechs.join('\n') : null],
          ['Radar Model', selectedRadar.length ? selectedRadar.map(u => u.model).join('\n') : null],
          ['Radar Serial No.', selectedRadar.length ? selectedRadar.map(u => u.sn).join('\n') : null],
          ['Antenna Model', selectedAntenna.length ? selectedAntenna.map(u => u.model).join('\n') : null],
          ['Antenna Serial No.', selectedAntenna.length ? selectedAntenna.map(u => u.sn).join('\n') : null],
        ]} />
      </TealSection>

      {/* Concrete Scanning Data + Legend (once) */}
      {(sb.concrete_types || []).length > 0 && (
        <>
          <TealSection title="Concrete Scanning Data">
            <KVTable rows={[['Number of concrete slab types', (sb.concrete_types || []).length.toString()]]} />
          </TealSection>

          <TealSection title="Legend">
            <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #e2e8f0', borderTop: 'none' }}>
              <tbody>
                {[['#22c55e', 'Top Rebar'], ['#2563eb', 'Bottom Rebar'], ['#ef4444', 'Conduit'], ['#f59e0b', 'PT Cable'], ['#eab308', 'Scan Boundary - Full extent of slab'], ['#000', 'Scan Boundary - Limited extent of slab'], ['#a855f7', 'Targets on underside of slab'], ['#f97316', 'Slab Band/Wall/Q-Deck Valleys/Hollow Cores'], ['#22c55e', 'Rebar Ends'], ['#7c3aed', 'Ducts/Vents']].map(([color, label], i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #e2e8f0' }}>
                    <td style={{ padding: '7px 14px', width: '38%' }}>
                      <div style={{ height: '5px', background: color, borderRadius: '2px' }} />
                    </td>
                    <td style={{ padding: '7px 14px', fontSize: '12px', color: '#475569' }}>{label}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TealSection>
        </>
      )}

      {/* Per Concrete Type */}
      {(sb.concrete_types || []).map(ct => {
        const slabLimits = (ct.slab_tech_limitations || []).map(i => SLAB_TECH_LIMITATIONS[i]).filter(Boolean)
        return (
          <div key={ct.id}>
            <TealSection title={`Slab Type - ${ct.slab_type === 'Other' && ct.slab_type_notes ? ct.slab_type_notes : (ct.slab_type || ct.name)}`}>
              <KVTable rows={[
                ['Type of concrete slab', ct.slab_type],
                ['Number of locations', ct.locations.length.toString()],
              ]} />
            </TealSection>

            <TealSection title="Slab Specific Details">
              <KVTable rows={[
                ['Steel reinforcement diameter was determined', ct.steel_diam_determined ? <YNBadge key="sd" v={ct.steel_diam_determined} /> : 'N/A'],
                ['Concrete Corrosion Noted', ct.concrete_corrosion ? <YNBadge key="cc" v={ct.concrete_corrosion} /> : 'N/A'],
                ['Voids Noted', ct.voids_noted ? <YNBadge key="vn" v={ct.voids_noted} /> : 'N/A'],
                ['Other Items Present', ct.other_items ? <YNBadge key="oi" v={ct.other_items} /> : 'N/A'],
                ['Slab Bands Present', ct.slab_bands ? <YNBadge key="sb" v={ct.slab_bands} /> : 'N/A'],
                ['GPR Velocity Calibration', ct.gpr_velocity],
                ['PT Cables Confirmed Absent', ct.pt_cables_absent ? <YNBadge key="pt" v={ct.pt_cables_absent} /> : 'N/A'],
              ]} />
            </TealSection>

            {slabLimits.length > 0 && (
              <TealSection title="Slab Specific and Technology Limitations">
                <BulletList items={slabLimits} />
              </TealSection>
            )}

            {/* Survey Locations table */}
            {ct.locations.length > 0 && (
              <TealSection title="Survey Locations">
                <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #e2e8f0', borderTop: 'none' }}>
                  <tbody>
                    <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                      {['Location', 'Scan Type', 'Slab Thickness'].map(h => (
                        <td key={h} style={{ padding: '8px 14px', fontSize: '12px', fontWeight: '700', color: '#0f172a' }}>{h}</td>
                      ))}
                    </tr>
                    {ct.locations.map(loc => {
                      const scanType = loc.complete_scan === 'yes' ? 'Complete' : loc.complete_scan === 'no' ? 'Limited' : '—'
                      const scanColor = loc.complete_scan === 'yes' ? '#059669' : loc.complete_scan === 'no' ? '#ef4444' : '#94a3b8'
                      const thick = [loc.slab_thickness_min, loc.slab_thickness_max].filter(Boolean).join(' – ')
                      return (
                        <tr key={loc.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                          <td style={{ padding: '8px 14px', fontSize: '12px', color: '#475569' }}>{loc.name}</td>
                          <td style={{ padding: '8px 14px', fontSize: '12px', fontWeight: '700', color: scanColor }}>{scanType}</td>
                          <td style={{ padding: '8px 14px', fontSize: '12px', color: '#475569' }}>{thick ? `${thick} mm` : 'N/A'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </TealSection>
            )}

            {/* Per Location cards */}
            {ct.locations.map(loc => (
              <div key={loc.id} style={{ marginBottom: '20px', pageBreakInside: 'avoid', border: '1px solid #e2e8f0' }}>
                <div style={{ background: TEAL, color: 'white', padding: '7px 14px', fontSize: '13px', fontWeight: '700' }}>
                  Location: {loc.name}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: loc.image_url ? '1fr 1fr' : '1fr', gap: '16px', padding: '14px' }}>
                  <div>
                    {loc.complete_scan && (
                      <p style={{ fontSize: '12px', fontWeight: '700', color: '#0f172a', marginBottom: '6px' }}>
                        This is a {loc.complete_scan === 'yes' ? 'Complete' : 'Limited'} Scan highlighted by the {loc.complete_scan === 'yes' ? 'Yellow' : 'Black'} scan boundary.
                      </p>
                    )}
                    {(loc.slab_thickness_min || loc.slab_thickness_max) && (
                      <p style={{ fontSize: '12px', color: '#475569', marginBottom: '8px' }}>
                        Slab Thickness: {[loc.slab_thickness_min, loc.slab_thickness_max].filter(Boolean).join(' – ')} mm
                      </p>
                    )}
                    {loc.notes && <p style={{ fontSize: '12px', color: '#475569', marginBottom: '10px', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{loc.notes}</p>}
                    <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #e2e8f0' }}>
                      <tbody>
                        {[['Survey Area Clear', loc.survey_area_clear], ['Scanned Both Sides', loc.scanned_both_sides], ['Pin-Pointed Other Side', loc.pin_pointed]].map(([label, val]) => {
                          const m = ynMeta(val)
                          return (
                            <tr key={label} style={{ borderBottom: '1px solid #e2e8f0' }}>
                              <td style={{ padding: '6px 10px', fontSize: '12px', color: '#475569' }}>{label}</td>
                              <td style={{ padding: '6px 10px', fontSize: '12px', fontWeight: '700', textAlign: 'right', color: m?.text || '#94a3b8', background: m?.bg || 'white' }}>
                                {m?.label || '—'}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                  {loc.image_url && (
                    <img src={loc.image_url} alt="" style={{ width: '100%', borderRadius: '6px', objectFit: 'cover', maxHeight: '220px' }} />
                  )}
                </div>
              </div>
            ))}
          </div>
        )
      })}

      {/* General Limitations */}
      {genLimits.length > 0 && (
        <TealSection title="General Limitations">
          <BulletList items={genLimits} />
        </TealSection>
      )}

      {/* Disclaimer */}
      <TealSection title="Disclaimer">
        <div style={{ border: '1px solid #e2e8f0', borderTop: 'none', padding: '14px' }}>
          <p style={{ fontSize: '12px', color: '#475569', lineHeight: 1.7, whiteSpace: 'pre-line' }}>{DISCLAIMER}</p>
        </div>
      </TealSection>

      {/* Sign-off */}
      {(per.lead_technician || so.reviewed_by) && (
        <div style={{ pageBreakInside: 'avoid' }}>
          <TealSection title="Sign-off">
            <KVTable rows={[
              ['Prepared by', so.prepared_by || per.lead_technician],
              ['Reviewed & Approved by', so.reviewed_by],
              ['Sign-off Date', fmtDate(so.sign_off_date)],
            ]} />
          </TealSection>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '16px' }}>
            {[[(so.prepared_by || per.lead_technician), 'PREPARED BY'], [so.reviewed_by, 'REVIEWED & APPROVED BY']].filter(([n]) => n).map(([name, role]) => (
              <div key={role} style={{ border: '1px solid #e2e8f0', borderRadius: '6px', padding: '16px' }}>
                <p style={{ fontSize: '10px', color: '#94a3b8', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>{role}</p>
                <p style={{ fontSize: '13px', fontWeight: '700', color: '#0f172a', marginBottom: '48px' }}>{name}</p>
                <div style={{ borderBottom: '1px solid #475569' }} />
              </div>
            ))}
          </div>
          {so.sign_off_date && <p style={{ fontSize: '12px', color: '#475569' }}>Date: {fmtDate(so.sign_off_date)}</p>}
        </div>
      )}
    </div>
  )
}

// ── Section Hub ────────────────────────────────────────────────────────────────

const SECTIONS = [
  { key: 'job',       label: 'Job Details',          color: '#f59e0b' },
  { key: 'equipment', label: 'Services & Equipment',  color: '#3b82f6' },
  { key: 'personnel', label: 'Personnel',             color: '#8b5cf6' },
  { key: 'breakdown', label: 'Services Breakdown',    color: '#10b981' },
  { key: 'client',    label: 'Client Details',        color: '#ec4899' },
  { key: 'signoff',   label: 'Sign-off',              color: TEAL },
]

function sectionProgress(key, content) {
  if (!content) return { filled: 0, total: 1 }
  const jd = content.job_details || {}
  const se = content.services_equipment || {}
  const per = content.personnel || {}
  const sb = content.services_breakdown || {}
  const cd = content.client_details || {}
  const so = content.sign_off || {}
  const v = x => x ? 1 : 0
  switch (key) {
    case 'job': {
      const fields = [jd.date_of_work, jd.client, jd.street_address, jd.city, jd.xradar_project, jd.job_quoted, jd.job_complete, jd.general_notes]
      return { filled: fields.filter(Boolean).length, total: fields.length }
    }
    case 'equipment': {
      const fields = [se.radar_units?.length, se.antenna_units?.length, se.services_provided?.length]
      return { filled: fields.filter(Boolean).length, total: fields.length }
    }
    case 'personnel':
      return { filled: v(per.lead_technician), total: 1 }
    case 'breakdown': {
      const fields = [sb.concrete_types?.length, sb.general_limitations?.length]
      return { filled: fields.filter(Boolean).length, total: fields.length }
    }
    case 'client': {
      const fields = [cd.present_on_site, cd.representative, cd.consulted_before, cd.consulted_after]
      return { filled: fields.filter(Boolean).length, total: fields.length }
    }
    case 'signoff': {
      const fields = [so.prepared_by, so.sign_off_date]
      return { filled: fields.filter(Boolean).length, total: fields.length }
    }
    default: return { filled: 0, total: 1 }
  }
}

function sectionFilled(key, content) {
  const { filled } = sectionProgress(key, content)
  return filled > 0
}

function EditorView({ reportId, sites, onBack }) {
  const { fullName } = useAuth()
  const [report, setReport] = useState(null)
  const [site, setSite] = useState(null)
  const [loading, setLoading] = useState(true)
  const [activeSection, setActiveSection] = useState(null)
  const [saveStatus, setSaveStatus] = useState('saved')
  const [teamMembers, setTeamMembers] = useState([])
  const saveTimer = useRef(null)

  useEffect(() => { loadReport() }, [reportId])
  useEffect(() => {
    supabase.from('team_members').select('id, full_name').order('full_name').then(({ data }) => setTeamMembers(data || []))
  }, [])

  async function loadReport() {
    setLoading(true)
    const { data } = await supabase.from('inspection_reports').select('*').eq('id', reportId).maybeSingle()
    if (data) {
      if (!data.content?.job_details) data.content = blankContent(fullName)
      setSite(sites.find(s => s.id === data.site_id) || null)
      setReport(data)
    }
    setLoading(false)
  }

  function updateContent(newContent) {
    const updated = { ...report, content: newContent }
    setReport(updated)
    setSaveStatus('unsaved')
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => doSave(updated), 1500)
  }

  async function doSave(r) {
    setSaveStatus('saving')
    const { error } = await supabase.from('inspection_reports').update({
      reference_number: r.content?.job_details?.xradar_project || '',
      client_name: r.content?.job_details?.client || '',
      prepared_by: r.content?.sign_off?.prepared_by || r.content?.personnel?.lead_technician || '',
      reviewed_by: r.content?.sign_off?.reviewed_by || '',
      sign_off_date: r.content?.sign_off?.sign_off_date || null,
      cover_image_url: r.content?.job_details?.cover_image_url || null,
      content: r.content,
    }).eq('id', r.id)
    setSaveStatus(error ? 'unsaved' : 'saved')
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: '10px', color: '#64748b', fontSize: '14px' }}>
      <div style={{ width: '16px', height: '16px', borderRadius: '50%', border: '2px solid #e2e8f0', borderTopColor: '#2563eb', animation: 'spin 0.7s linear infinite' }} />
      Loading…
    </div>
  )
  if (!report) return <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>Report not found.</div>

  const content = report.content || blankContent(fullName)

  if (activeSection === 'job')       return <JobDetailsSection       content={content} onChange={updateContent} onBack={() => setActiveSection(null)} reportId={reportId} site={site} />
  if (activeSection === 'equipment') return <ServicesEquipmentSection content={content} onChange={updateContent} onBack={() => setActiveSection(null)} />
  if (activeSection === 'personnel') return <PersonnelSection         content={content} onChange={updateContent} onBack={() => setActiveSection(null)} teamMembers={teamMembers} />
  if (activeSection === 'breakdown') return <ServicesBreakdownSection content={content} onChange={updateContent} onBack={() => setActiveSection(null)} reportId={reportId} />
  if (activeSection === 'client')    return <ClientDetailsSection     content={content} onChange={updateContent} onBack={() => setActiveSection(null)} />
  if (activeSection === 'signoff')   return <SignOffSection           content={content} onChange={updateContent} onBack={() => setActiveSection(null)} teamMembers={teamMembers} />

  const refNum = content.job_details?.xradar_project || report.reference_number || 'Untitled Report'
  const filledCount = SECTIONS.filter(s => sectionFilled(s.key, content)).length
  const pct = Math.round((filledCount / SECTIONS.length) * 100)
  const daysLeft = Math.ceil((new Date(report.expires_at) - Date.now()) / (1000 * 60 * 60 * 24))

  return (
    <>
      <style>{`
        @media print {
          .xyte-editor { display: none !important; }
          .xyte-print-doc { display: block !important; }
          body { background: white !important; }
          @page { margin: 20mm; }
        }
        .xyte-print-doc { display: none; }
      `}</style>

      <div className="xyte-editor" style={{ minHeight: '100vh', background: '#071226' }}>
        {/* Top bar */}
        <div style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'white', padding: 0, display: 'flex' }}>
            <ArrowLeft size={18} />
          </button>
          <span style={{ color: 'white', fontSize: '15px', fontWeight: '700', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{refNum}</span>
          <span style={{ fontSize: '10px', fontWeight: '700', padding: '4px 10px', borderRadius: '99px', background: report.status === 'approved' ? '#166534' : '#92400e', color: 'white', flexShrink: 0 }}>
            {(report.status || 'draft').toUpperCase()}
          </span>
        </div>

        {/* Progress bar */}
        <div style={{ padding: '0 20px 12px' }}>
          <div style={{ height: '4px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${pct}%`, background: TEAL, borderRadius: '2px', transition: 'width 0.3s' }} />
          </div>
          <p style={{ fontSize: '10px', color: '#64748b', marginTop: '5px', textAlign: 'right' }}>{pct}%</p>
        </div>

        {daysLeft <= 30 && (
          <div style={{ margin: '0 16px 12px', background: '#fef9c3', border: '1px solid #fde047', borderRadius: '8px', padding: '8px 12px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#854d0e', fontWeight: '600' }}>
            <AlertTriangle size={12} /> Expires in {daysLeft}d
          </div>
        )}

        {/* Save status + Print */}
        <div style={{ padding: '0 20px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '11px', fontWeight: '600', color: saveStatus === 'saved' ? '#22c55e' : saveStatus === 'saving' ? '#f59e0b' : '#94a3b8' }}>
            {saveStatus === 'saved' ? '✓ Saved' : saveStatus === 'saving' ? 'Saving…' : '● Unsaved'}
          </span>
          <button onClick={() => window.print()} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 12px', borderRadius: '8px', background: 'white', border: 'none', cursor: 'pointer', fontSize: '11px', fontWeight: '700', color: '#0f172a' }}>
            <Printer size={12} /> Print / Export PDF
          </button>
        </div>

        {/* 6 Sections grid */}
        <div style={{ padding: '4px 16px 40px' }}>
          <p style={{ fontSize: '10px', fontWeight: '700', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '12px' }}>SECTIONS</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            {SECTIONS.map(sec => {
              const { filled, total } = sectionProgress(sec.key, content)
              const done = filled === total
              const started = filled > 0
              return (
                <button key={sec.key} onClick={() => setActiveSection(sec.key)}
                  style={{ background: 'white', borderRadius: '14px', padding: '16px 14px', border: `2px solid ${started ? sec.color + '40' : 'transparent'}`, cursor: 'pointer', textAlign: 'left', position: 'relative', boxShadow: '0 2px 8px rgba(0,0,0,0.12)' }}>
                  <div style={{ width: '34px', height: '34px', borderRadius: '9px', background: `${sec.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '10px' }}>
                    <div style={{ width: '14px', height: '14px', borderRadius: '3px', background: sec.color }} />
                  </div>
                  <p style={{ fontSize: '12px', fontWeight: '700', color: '#0f172a', lineHeight: 1.3, marginBottom: '6px' }}>{sec.label}</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <div style={{ flex: 1, height: '4px', background: '#f1f5f9', borderRadius: '2px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${(filled / total) * 100}%`, background: done ? '#22c55e' : sec.color, borderRadius: '2px', transition: 'width 0.3s' }} />
                    </div>
                    <span style={{ fontSize: '10px', fontWeight: '700', color: done ? '#22c55e' : started ? sec.color : '#9ca3af', flexShrink: 0 }}>
                      {filled}/{total}
                    </span>
                  </div>
                  <ChevronRight size={14} color="#d1d5db" style={{ position: 'absolute', top: '14px', right: '12px' }} />
                </button>
              )
            })}
          </div>
        </div>
      </div>

      <div style={{ padding: '32px', maxWidth: '800px', margin: '0 auto', fontFamily: 'Arial, sans-serif' }}>
        <PrintDocument report={report} />
      </div>
    </>
  )
}

// ── List View ──────────────────────────────────────────────────────────────────

function ListView({ sites, onOpen }) {
  const { fullName } = useAuth()
  const { isMobile } = useViewport()
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [filterSite, setFilterSite] = useState('all')
  const [showNew, setShowNew] = useState(false)
  const [newSiteId, setNewSiteId] = useState('')
  const [creating, setCreating] = useState(false)

  useEffect(() => { fetchReports() }, [])

  async function fetchReports() {
    setLoading(true)
    const cutoff = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString()
    const { data } = await supabase.from('inspection_reports').select('*').gte('created_at', cutoff).order('created_at', { ascending: false })
    setReports(data || [])
    setLoading(false)
  }

  async function createReport() {
    if (!newSiteId) return
    setCreating(true)
    const site = sites.find(s => s.id === newSiteId)
    const content = blankContent(fullName)

    if (site) {
      const d = site.scheduled_date ? new Date(site.scheduled_date + 'T00:00:00') : new Date()
      const yy = String(d.getFullYear()).slice(2)
      const mm = String(d.getMonth() + 1).padStart(2, '0')
      const dd = String(d.getDate()).padStart(2, '0')
      content.job_details.date_of_work = site.scheduled_date || ''
      content.job_details.client = site.client_company_name || ''
      content.job_details.xradar_project = `X${yy}${mm}${dd}-`
      content.job_details.cover_image_url = site.site_photo_url || null
    }

    const { data, error } = await supabase.from('inspection_reports').insert({
      site_id: newSiteId, reference_number: content.job_details.xradar_project,
      client_name: content.job_details.client,
      prepared_by: fullName, reviewed_by: '', cover_image_url: content.job_details.cover_image_url,
      content, status: 'draft',
    }).select().single()
    setCreating(false)
    if (!error && data) onOpen(data.id)
  }

  const filtered = filterSite === 'all' ? reports : reports.filter(r => r.site_id === filterSite)
  const STATUS_META = {
    draft:     { bg: '#fef3c7', text: '#92400e', border: '#fcd34d', label: 'Draft' },
    submitted: { bg: '#ede9fe', text: '#5b21b6', border: '#c4b5fd', label: 'Submitted' },
    approved:  { bg: '#dcfce7', text: '#166534', border: '#86efac', label: 'Approved' },
  }

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(180deg,#071226 0 88px,#dde4ed 88px 100%)' }}>
      <div style={{ padding: isMobile ? '14px 14px 0' : '18px 40px 0', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: isMobile ? '20px' : '22px', fontWeight: '700', color: 'white' }}>Xport</h1>
          <p style={{ color: '#94a3b8', fontSize: '12px', marginTop: '3px' }}>Create and manage inspection reports</p>
        </div>
        <button onClick={() => setShowNew(v => !v)} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '9px 14px', borderRadius: '10px', background: '#2563eb', border: 'none', cursor: 'pointer', color: 'white', fontSize: '12px', fontWeight: '700', flexShrink: 0 }}>
          <Plus size={13} /> New Report
        </button>
      </div>
      <div style={{ padding: isMobile ? '14px' : '18px 40px 48px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {showNew && (
          <div style={{ background: 'white', borderRadius: '14px', border: '1px solid #e2e8f0', padding: '18px', boxShadow: '0 4px 20px rgba(15,23,42,.08)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <p style={{ fontSize: '14px', fontWeight: '700', color: '#0f172a' }}>New Report</p>
              <button onClick={() => setShowNew(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}><X size={14} /></button>
            </div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#64748b', marginBottom: '6px' }}>Link to site</label>
            <select value={newSiteId} onChange={e => setNewSiteId(e.target.value)}
              style={{ width: '100%', padding: '10px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', outline: 'none', marginBottom: '12px', boxSizing: 'border-box' }}>
              <option value="">Select a site…</option>
              {sites.map(s => <option key={s.id} value={s.id}>{s.site_name} — {s.location}</option>)}
            </select>
            <button onClick={createReport} disabled={!newSiteId || creating}
              style={{ padding: '10px 20px', borderRadius: '9px', border: 'none', background: newSiteId ? '#2563eb' : '#e2e8f0', color: newSiteId ? 'white' : '#94a3b8', fontSize: '13px', fontWeight: '700', cursor: newSiteId ? 'pointer' : 'default' }}>
              {creating ? 'Creating…' : 'Create Report'}
            </button>
          </div>
        )}
        {reports.length > 0 && (
          <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '10px 14px', display: 'flex', gap: '8px', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', flexShrink: 0 }}>Filter by site:</span>
            <select value={filterSite} onChange={e => setFilterSite(e.target.value)}
              style={{ padding: '5px 8px', border: '1px solid #e2e8f0', borderRadius: '7px', fontSize: '12px', outline: 'none', flex: 1 }}>
              <option value="all">All Sites</option>
              {sites.map(s => <option key={s.id} value={s.id}>{s.site_name}</option>)}
            </select>
          </div>
        )}
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '40vh', gap: '10px', color: '#64748b', fontSize: '14px' }}>
            <div style={{ width: '14px', height: '14px', borderRadius: '50%', border: '2px solid #e2e8f0', borderTopColor: '#2563eb', animation: 'spin 0.7s linear infinite' }} />
            Loading…
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '48px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
            {reports.length === 0 ? 'No reports yet. Click "New Report" to get started.' : 'No reports for the selected site.'}
          </div>
        ) : filtered.map(report => {
          const s = sites.find(x => x.id === report.site_id)
          const sm = STATUS_META[report.status] || STATUS_META.draft
          const ref = report.content?.job_details?.xradar_project || report.reference_number || 'Untitled Report'
          return (
            <div key={report.id} onClick={() => onOpen(report.id)}
              style={{ background: 'white', borderRadius: '14px', border: '1px solid #e2e8f0', padding: '16px', cursor: 'pointer', boxShadow: '0 2px 8px rgba(15,23,42,.04)', transition: 'box-shadow 0.15s' }}
              onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 18px rgba(15,23,42,.1)'}
              onMouseLeave={e => e.currentTarget.style.boxShadow = '0 2px 8px rgba(15,23,42,.04)'}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontWeight: '700', color: '#0f172a', fontSize: '14px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ref}</p>
                  {s && <p style={{ color: '#64748b', fontSize: '12px', marginTop: '2px' }}>{s.site_name} — {s.location}</p>}
                  {report.client_name && <p style={{ color: '#94a3b8', fontSize: '11px', marginTop: '2px' }}>{report.client_name}</p>}
                </div>
                <span style={{ background: sm.bg, color: sm.text, border: `1px solid ${sm.border}`, padding: '3px 10px', borderRadius: '99px', fontSize: '11px', fontWeight: '600', flexShrink: 0 }}>
                  {sm.label}
                </span>
              </div>
              <p style={{ fontSize: '11px', color: '#94a3b8', marginTop: '10px' }}>
                {new Date(report.created_at).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' })}
                {report.prepared_by && ` · ${report.prepared_by}`}
              </p>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Main Export ────────────────────────────────────────────────────────────────

export default function ReportBuilder() {
  const [openReportId, setOpenReportId] = useState(null)
  const [sites, setSites] = useState([])

  useEffect(() => {
    supabase.from('sites').select('id, site_name, location, client_company_name, scheduled_date, site_photo_url').order('site_name').then(({ data }) => setSites(data || []))
  }, [])

  if (openReportId) return <EditorView reportId={openReportId} sites={sites} onBack={() => setOpenReportId(null)} />
  return <ListView sites={sites} onOpen={setOpenReportId} />
}
