import { useState } from 'react'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { supabase } from '../supabase'
import { FileDown, X, ChevronRight, Loader } from 'lucide-react'

const DOC_TYPES = [
  { key: 'cidb',          label: 'CIDB' },
  { key: 'identity_card', label: 'Identity Card' },
  { key: 'ntsp',          label: 'NTSP' },
  { key: 'ansp',          label: 'ANSP' },
  { key: 'ogsp',          label: 'OGSP' },
]

export default function CompileExport({ members, docs }) {
  const [open, setOpen]                       = useState(false)
  const [selectedMembers, setSelectedMembers] = useState([])
  const [selectedTypes, setSelectedTypes]     = useState(['cidb', 'ntsp'])
  const [compiling, setCompiling]             = useState(false)
  const [progress, setProgress]               = useState('')
  const [done, setDone]                       = useState(false)

  function toggleMember(id) {
    setSelectedMembers(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  function toggleType(key) {
    setSelectedTypes(prev => prev.includes(key) ? prev.filter(x => x !== key) : [...prev, key])
  }

  function toggleAllMembers() {
    if (selectedMembers.length === members.length) setSelectedMembers([])
    else setSelectedMembers(members.map(m => m.id))
  }

  function openModal() {
    setSelectedMembers([])
    setSelectedTypes(['cidb', 'ntsp'])
    setDone(false)
    setProgress('')
    setOpen(true)
  }

  async function handleCompile() {
    if (selectedMembers.length === 0 || selectedTypes.length === 0) return
    setCompiling(true)
    setDone(false)

    try {
      // Fetch full member details including ic_number
      setProgress('Fetching member details…')
      const { data: fullMembers } = await supabase
        .from('team_members')
        .select('id, full_name, role, ic_number')
        .in('id', selectedMembers)
      const memberMap = {}
      ;(fullMembers || []).forEach(m => { memberMap[m.id] = m })

      const mergedPdf = await PDFDocument.create()
      const font      = await mergedPdf.embedFont(StandardFonts.Helvetica)
      const boldFont  = await mergedPdf.embedFont(StandardFonts.HelveticaBold)

      const A4W = 595, A4H = 842
      const ML = 40, MR = 40
      const tableW = A4W - ML - MR  // 515

      // helper: truncate text to fit max width
      function fitText(text, maxWidth, f, size) {
        if (!text) return ''
        let t = text
        while (t.length > 0 && f.widthOfTextAtSize(t, size) > maxWidth) {
          t = t.slice(0, -1)
        }
        return t === text ? text : t + '…'
      }

      // ── Page 1: Namelist ──
      setProgress('Generating namelist…')
      const page = mergedPdf.addPage([A4W, A4H])

      // White background (default)
      // ── Company header ──
      const headerTop = A4H - 40

      // Left: company name + details
      page.drawText('Xradar Asia Sdn Bhd', { x: ML, y: headerTop, font: boldFont, size: 13, color: rgb(0, 0, 0) })
      page.drawText('(1449462P)', { x: ML + 135, y: headerTop, font, size: 11, color: rgb(0.3, 0.3, 0.3) })
      page.drawText('17 Jalan PJS 7/21 Bandar Sunway, 46150 Petaling Jaya, Selangor', { x: ML, y: headerTop - 16, font, size: 8.5, color: rgb(0.3, 0.3, 0.3) })
      page.drawText('Tel:  03-74940629     Email:  info@xradar.asia', { x: ML, y: headerTop - 28, font, size: 8.5, color: rgb(0.3, 0.3, 0.3) })

      // Right: Xradar logo (styled text)
      page.drawText('X', { x: A4W - MR - 72, y: headerTop - 4, font: boldFont, size: 30, color: rgb(0, 0, 0) })
      page.drawText('radar', { x: A4W - MR - 46, y: headerTop - 4, font, size: 30, color: rgb(0, 0.55, 0.55) })

      // Divider line
      const divY = headerTop - 42
      page.drawLine({ start: { x: ML, y: divY }, end: { x: A4W - MR, y: divY }, thickness: 1, color: rgb(0, 0, 0) })

      // ── Table ──
      const dateStr = new Date().toLocaleDateString('en-MY', { day: 'numeric', month: 'long', year: 'numeric' })
      const tableTop = divY - 30

      // Column positions & widths
      const colNoX    = ML,       colNoW    = 28
      const colNameX  = ML + 30,  colNameW  = 210
      const colIcX    = ML + 242, colIcW    = 140
      const colRoleX  = ML + 384, colRoleW  = tableW - 384

      const rowH  = 22
      const hdrH  = 22

      // Draw outer border of table header
      page.drawRectangle({ x: ML, y: tableTop - hdrH, width: tableW, height: hdrH, borderColor: rgb(0,0,0), borderWidth: 0.8, color: rgb(1,1,1) })

      // Header cell dividers
      for (const x of [colNameX, colIcX, colRoleX]) {
        page.drawLine({ start: { x, y: tableTop }, end: { x, y: tableTop - hdrH }, thickness: 0.8, color: rgb(0,0,0) })
      }

      // Header text
      page.drawText('No',              { x: ML + 8,       y: tableTop - 15, font: boldFont, size: 10, color: rgb(0,0,0) })
      page.drawText('Name',            { x: colNameX + 4, y: tableTop - 15, font: boldFont, size: 10, color: rgb(0,0,0) })
      page.drawText('NRIC / Passport', { x: colIcX + 4,   y: tableTop - 15, font: boldFont, size: 10, color: rgb(0,0,0) })
      page.drawText('Position',        { x: colRoleX + 4, y: tableTop - 15, font: boldFont, size: 10, color: rgb(0,0,0) })

      // Rows
      const chosenMembers = selectedMembers.map(id => memberMap[id] || members.find(m => m.id === id)).filter(Boolean)
      let rowY = tableTop - hdrH

      chosenMembers.forEach((member, idx) => {
        const rY = rowY - rowH

        // Row border
        page.drawRectangle({ x: ML, y: rY, width: tableW, height: rowH, borderColor: rgb(0,0,0), borderWidth: 0.5, color: rgb(1,1,1) })

        // Cell dividers
        for (const x of [colNameX, colIcX, colRoleX]) {
          page.drawLine({ start: { x, y: rY + rowH }, end: { x, y: rY }, thickness: 0.5, color: rgb(0,0,0) })
        }

        const nameText = fitText(member.full_name || '', colNameW - 8, font, 9.5)
        const icText   = fitText(member.ic_number  || '—', colIcW   - 8, font, 9.5)
        const roleText = fitText(member.role        || '—', colRoleW - 8, font, 9.5)

        page.drawText(String(idx + 1), { x: ML + 8,        y: rY + 7, font, size: 9.5, color: rgb(0,0,0) })
        page.drawText(nameText,        { x: colNameX + 4,  y: rY + 7, font, size: 9.5, color: rgb(0,0,0) })
        page.drawText(icText,          { x: colIcX + 4,    y: rY + 7, font, size: 9.5, color: rgb(0,0,0) })
        page.drawText(roleText,        { x: colRoleX + 4,  y: rY + 7, font, size: 9.5, color: rgb(0,0,0) })

        rowY = rY
      })

      // ── Documents grouped by member ──
      for (const memberId of selectedMembers) {
        const member = memberMap[memberId] || members.find(m => m.id === memberId)
        if (!member) continue

        for (const docType of selectedTypes) {
          const doc = docs.find(d => d.section === docType && d.member_id === memberId && d.file_type === 'pdf')
          if (!doc) continue

          setProgress(`Adding ${member.full_name} — ${DOC_TYPES.find(t => t.key === docType)?.label}…`)

          try {
            const { data } = await supabase.storage.from('library').createSignedUrl(doc.file_path, 180)
            if (!data?.signedUrl) continue
            const resp     = await fetch(data.signedUrl)
            const pdfBytes = await resp.arrayBuffer()
            const srcPdf   = await PDFDocument.load(pdfBytes, { ignoreEncryption: true })
            const copied   = await mergedPdf.copyPages(srcPdf, srcPdf.getPageIndices())
            copied.forEach(p => mergedPdf.addPage(p))
          } catch (err) {
            console.warn(`Skipped ${member.full_name} ${docType}:`, err)
          }
        }
      }

      setProgress('Saving PDF…')
      const pdfBytes = await mergedPdf.save()
      const blob     = new Blob([pdfBytes], { type: 'application/pdf' })
      const url      = URL.createObjectURL(blob)
      const a        = document.createElement('a')
      a.href         = url
      a.download     = `xradar_namelist_${new Date().toISOString().slice(0, 10)}.pdf`
      a.click()
      URL.revokeObjectURL(url)

      setProgress('')
      setDone(true)
    } catch (err) {
      console.error('Compile error:', err)
      setProgress(`Error: ${err.message}`)
    }

    setCompiling(false)
  }

  const canCompile = selectedMembers.length > 0 && selectedTypes.length > 0

  return (
    <>
      <button
        onClick={openModal}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', background: '#0f172a', color: 'white', border: '1px solid rgba(255,255,255,0.18)', padding: '9px 16px', borderRadius: '10px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}
      >
        <FileDown size={14} /> Compile &amp; Export
      </button>

      {open && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 400, padding: '16px' }}
          onClick={e => e.target === e.currentTarget && !compiling && setOpen(false)}
        >
          <div style={{ background: 'white', borderRadius: '20px', width: '100%', maxWidth: '560px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 32px 80px rgba(0,0,0,0.3)' }}>

            {/* Header */}
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <div>
                <p style={{ fontWeight: '700', fontSize: '16px', color: '#0f172a' }}>Compile &amp; Export</p>
                <p style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>Select members and document types to merge into one PDF</p>
              </div>
              {!compiling && (
                <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', display: 'flex', padding: 0 }}><X size={18} /></button>
              )}
            </div>

            {/* Body */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>

              {/* Members */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <p style={{ fontSize: '13px', fontWeight: '700', color: '#0f172a' }}>
                    Select Members <span style={{ color: '#94a3b8', fontWeight: '400' }}>({selectedMembers.length} selected)</span>
                  </p>
                  <button onClick={toggleAllMembers} style={{ fontSize: '11px', fontWeight: '600', color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                    {selectedMembers.length === members.length ? 'Deselect All' : 'Select All'}
                  </button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px' }}>
                  {members.map(m => {
                    const checked = selectedMembers.includes(m.id)
                    return (
                      <label key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 12px', borderRadius: '10px', border: `1px solid ${checked ? '#2563eb' : '#e2e8f0'}`, background: checked ? '#eff6ff' : 'white', cursor: 'pointer', fontSize: '13px', fontWeight: checked ? '600' : '400', color: checked ? '#1d4ed8' : '#374151' }}>
                        <input type="checkbox" checked={checked} onChange={() => toggleMember(m.id)} style={{ accentColor: '#2563eb', width: '14px', height: '14px' }} />
                        {m.full_name}
                      </label>
                    )
                  })}
                </div>
              </div>

              {/* Document Types */}
              <div>
                <p style={{ fontSize: '13px', fontWeight: '700', color: '#0f172a', marginBottom: '10px' }}>
                  Document Types <span style={{ color: '#94a3b8', fontWeight: '400' }}>({selectedTypes.length} selected)</span>
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px' }}>
                  {DOC_TYPES.map(t => {
                    const checked = selectedTypes.includes(t.key)
                    return (
                      <label key={t.key} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 12px', borderRadius: '10px', border: `1px solid ${checked ? '#2563eb' : '#e2e8f0'}`, background: checked ? '#eff6ff' : 'white', cursor: 'pointer', fontSize: '13px', fontWeight: checked ? '600' : '400', color: checked ? '#1d4ed8' : '#374151' }}>
                        <input type="checkbox" checked={checked} onChange={() => toggleType(t.key)} style={{ accentColor: '#2563eb', width: '14px', height: '14px' }} />
                        {t.label}
                      </label>
                    )
                  })}
                </div>
              </div>

              {/* Preview summary */}
              {canCompile && !compiling && !done && (
                <div style={{ background: '#f8fafc', borderRadius: '12px', padding: '14px 16px', border: '1px solid #e2e8f0' }}>
                  <p style={{ fontSize: '12px', fontWeight: '700', color: '#475569', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>PDF Structure Preview</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#0f172a' }}>
                      <span style={{ width: '20px', height: '20px', borderRadius: '4px', background: '#2563eb', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: '700', flexShrink: 0 }}>1</span>
                      Namelist ({selectedMembers.length} member{selectedMembers.length !== 1 ? 's' : ''})
                    </div>
                    {selectedMembers.map(id => {
                      const member = members.find(m => m.id === id)
                      if (!member) return null
                      return selectedTypes.map(type => {
                        const hasDoc = docs.some(d => d.section === type && d.member_id === id && d.file_type === 'pdf')
                        if (!hasDoc) return null
                        return (
                          <div key={`${id}-${type}`} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#475569' }}>
                            <ChevronRight size={12} color="#94a3b8" />
                            {member.full_name} — {DOC_TYPES.find(t => t.key === type)?.label}
                          </div>
                        )
                      })
                    })}
                  </div>
                </div>
              )}

              {/* Progress */}
              {compiling && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '14px 16px', background: '#eff6ff', borderRadius: '12px', border: '1px solid #bfdbfe' }}>
                  <Loader size={16} color="#2563eb" style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }} />
                  <p style={{ fontSize: '13px', color: '#1d4ed8', fontWeight: '500' }}>{progress || 'Compiling…'}</p>
                </div>
              )}

              {/* Done */}
              {done && (
                <div style={{ padding: '14px 16px', background: '#dcfce7', borderRadius: '12px', border: '1px solid #bbf7d0' }}>
                  <p style={{ fontSize: '13px', color: '#166534', fontWeight: '600' }}>PDF downloaded successfully!</p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={{ padding: '16px 24px', borderTop: '1px solid #f1f5f9', display: 'flex', gap: '10px', flexShrink: 0 }}>
              <button
                onClick={handleCompile}
                disabled={!canCompile || compiling}
                style={{ flex: 1, padding: '12px', borderRadius: '10px', fontSize: '14px', fontWeight: '700', color: 'white', border: 'none', cursor: !canCompile || compiling ? 'not-allowed' : 'pointer', background: '#2563eb', opacity: !canCompile || compiling ? 0.5 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
              >
                {compiling
                  ? <><Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> Compiling…</>
                  : <><FileDown size={14} /> Compile &amp; Download PDF</>
                }
              </button>
              {!compiling && (
                <button onClick={() => setOpen(false)} style={{ padding: '12px 20px', borderRadius: '10px', fontSize: '14px', fontWeight: '600', color: '#0f172a', cursor: 'pointer', background: '#f1f5f9', border: '1px solid #e2e8f0' }}>
                  Close
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
