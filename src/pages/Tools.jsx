import { useState, useRef, useEffect } from 'react'
import {
  Upload, Trash2, RotateCw, Scissors, Layers, Type, Minimize2,
  X, Download, ArrowUp, ArrowDown, FileText, Check, GripVertical,
} from 'lucide-react'
import { PDFDocument, degrees, rgb, StandardFonts } from 'pdf-lib'
import * as pdfjsLib from 'pdfjs-dist'
import { useViewport } from '../utils/useViewport'

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).href

const TOOLS = [
  { id: 'merge',     label: 'Merge',        Icon: Layers,    color: '#2563eb' },
  { id: 'delete',    label: 'Delete Pages', Icon: Trash2,    color: '#ef4444' },
  { id: 'rotate',    label: 'Rotate',       Icon: RotateCw,  color: '#f59e0b' },
  { id: 'extract',   label: 'Extract',      Icon: Scissors,  color: '#8b5cf6' },
  { id: 'split',     label: 'Split',        Icon: FileText,  color: '#06b6d4' },
  { id: 'watermark', label: 'Watermark',    Icon: Type,      color: '#ec4899' },
  { id: 'compress',  label: 'Compress',     Icon: Minimize2, color: '#10b981' },
]

const TIPS = {
  merge:     'Upload PDFs, merge them, then drag the page thumbnails to reorder before downloading.',
  delete:    'Click thumbnails to select pages for deletion. Remaining pages are saved.',
  rotate:    'Select pages, choose an angle, then click "Apply Rotation". You can apply multiple times.',
  extract:   'Select the pages you want to keep in the output file.',
  split:     'Split by page count for equal parts, or enter custom ranges like "1-3, 4-7".',
  watermark: 'Adjust opacity for a subtle watermark. The text is embedded directly in the PDF.',
  compress:  'Re-saves the PDF with compressed object streams. Best for PDFs with lots of metadata.',
}

// ── helpers ──────────────────────────────────────────────────────────────────

function downloadBlob(bytes, filename) {
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))
  const a = Object.assign(document.createElement('a'), { href: url, download: filename })
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function stripExt(name) {
  return name.replace(/\.pdf$/i, '')
}

function parseRanges(str, total) {
  return str.split(',').map(s => s.trim()).filter(Boolean).flatMap(part => {
    const [rawA, rawB] = part.split('-')
    const a = parseInt(rawA) - 1
    const b = rawB !== undefined ? parseInt(rawB) - 1 : a
    if (isNaN(a) || a < 0 || a >= total) return []
    return [{ start: a, end: Math.min(isNaN(b) ? a : b, total - 1) }]
  })
}

// ── PageThumbnail ─────────────────────────────────────────────────────────────

function PageThumbnail({ pdfJsDoc, pageNum, selected, rotation = 0, onToggle }) {
  const canvasRef = useRef(null)
  const [rendered, setRendered] = useState(false)

  useEffect(() => {
    if (!pdfJsDoc || !canvasRef.current) return
    let cancelled = false
    ;(async () => {
      try {
        const page = await pdfJsDoc.getPage(pageNum)
        if (cancelled) return
        const vp = page.getViewport({ scale: 0.22 })
        const canvas = canvasRef.current
        if (!canvas) return
        canvas.width = vp.width
        canvas.height = vp.height
        await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise
        if (!cancelled) setRendered(true)
      } catch (_) {}
    })()
    return () => { cancelled = true }
  }, [pdfJsDoc, pageNum])

  return (
    <div
      onClick={onToggle}
      style={{
        cursor: 'pointer',
        borderRadius: '10px',
        border: `2px solid ${selected ? '#2563eb' : '#e2e8f0'}`,
        background: '#f8fafc',
        overflow: 'hidden',
        position: 'relative',
        transition: 'border-color 0.15s, box-shadow 0.15s',
        boxShadow: selected ? '0 0 0 3px rgba(37,99,235,0.15)' : 'none',
      }}
    >
      <div style={{ padding: '6px', transform: rotation ? `rotate(${rotation}deg)` : 'none', transformOrigin: 'center', transition: 'transform 0.25s' }}>
        {!rendered && (
          <div style={{ height: '110px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ width: '14px', height: '14px', borderRadius: '50%', border: '2px solid #e2e8f0', borderTopColor: '#2563eb', animation: 'spin 0.6s linear infinite' }} />
          </div>
        )}
        <canvas ref={canvasRef} style={{ display: rendered ? 'block' : 'none', width: '100%', borderRadius: '4px' }} />
      </div>

      {selected && (
        <div style={{ position: 'absolute', top: 5, right: 5, width: 20, height: 20, borderRadius: '50%', background: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 6px rgba(37,99,235,0.4)' }}>
          <Check size={11} color="white" />
        </div>
      )}
      {rotation !== 0 && (
        <div style={{ position: 'absolute', top: 5, left: 5, background: '#f59e0b', color: 'white', borderRadius: '6px', fontSize: '9px', fontWeight: '700', padding: '2px 5px' }}>
          {rotation}°
        </div>
      )}
      <div style={{ borderTop: '1px solid #e2e8f0', padding: '4px', textAlign: 'center', fontSize: '10px', color: '#94a3b8', fontWeight: '600' }}>
        {pageNum}
      </div>
    </div>
  )
}

// ── Dropzone ──────────────────────────────────────────────────────────────────

function Dropzone({ multiple = false, onFiles, label = 'Drop PDF here or click to upload' }) {
  const inputRef = useRef(null)
  const [dragging, setDragging] = useState(false)

  function handleDrop(e) {
    e.preventDefault()
    setDragging(false)
    const files = [...e.dataTransfer.files].filter(f => f.type === 'application/pdf')
    if (files.length) onFiles(files)
  }

  function handleInput(e) {
    const files = [...e.target.files]
    if (files.length) onFiles(files)
    e.target.value = ''
  }

  return (
    <div
      onClick={() => inputRef.current?.click()}
      onDragOver={e => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      style={{
        border: `2px dashed ${dragging ? '#2563eb' : '#cbd5e1'}`,
        borderRadius: '14px',
        padding: '36px 24px',
        textAlign: 'center',
        cursor: 'pointer',
        background: dragging ? '#eff6ff' : '#f8fafc',
        transition: 'all 0.15s',
      }}
    >
      <Upload size={26} color={dragging ? '#2563eb' : '#94a3b8'} style={{ margin: '0 auto 10px', display: 'block' }} />
      <p style={{ fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '4px' }}>{label}</p>
      <p style={{ fontSize: '11px', color: '#94a3b8' }}>PDF files only</p>
      <input ref={inputRef} type="file" accept="application/pdf" multiple={multiple} onChange={handleInput} style={{ display: 'none' }} />
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function Tools() {
  const { isMobile } = useViewport()
  const [activeTool, setActiveTool] = useState('merge')

  // Merge state
  const [mergeFiles, setMergeFiles] = useState([])
  const [mergeStage, setMergeStage] = useState('upload') // 'upload' | 'rearrange'
  const [mergedBytes, setMergedBytes] = useState(null)
  const [mergedPdfJsDoc, setMergedPdfJsDoc] = useState(null)
  const [mergedPageCount, setMergedPageCount] = useState(0)
  const [pageOrder, setPageOrder] = useState([])
  const [dragIndex, setDragIndex] = useState(null)
  const [dragOverIndex, setDragOverIndex] = useState(null)

  // Single-file state
  const [singleFile, setSingleFile] = useState(null)
  const [pdfJsDoc, setPdfJsDoc] = useState(null)
  const [pageCount, setPageCount] = useState(0)

  // Page selection / rotation
  const [selectedPages, setSelectedPages] = useState(new Set())
  const [pageRotations, setPageRotations] = useState({})

  // Tool-specific options
  const [rotationAmount, setRotationAmount] = useState(90)
  const [splitMode, setSplitMode] = useState('count')
  const [splitValue, setSplitValue] = useState('2')
  const [wmText, setWmText] = useState('CONFIDENTIAL')
  const [wmSize, setWmSize] = useState(48)
  const [wmOpacity, setWmOpacity] = useState(30)
  const [wmAngle, setWmAngle] = useState(-45)

  // Status
  const [processing, setProcessing] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  // Load pdfjs doc whenever singleFile changes
  useEffect(() => {
    if (!singleFile) { setPdfJsDoc(null); setPageCount(0); return }
    ;(async () => {
      const buf = await singleFile.arrayBuffer()
      const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise
      setPdfJsDoc(doc)
      setPageCount(doc.numPages)
      setSelectedPages(new Set())
      setPageRotations({})
    })()
  }, [singleFile])

  function switchTool(id) {
    setActiveTool(id)
    setDone(false)
    setError('')
    setSelectedPages(new Set())
    setPageRotations({})
    setMergeStage('upload')
    setMergedBytes(null)
    setMergedPdfJsDoc(null)
    setPageOrder([])
  }

  function resetSingleFile() {
    setSingleFile(null)
    setPdfJsDoc(null)
    setPageCount(0)
    setSelectedPages(new Set())
    setPageRotations({})
    setDone(false)
    setError('')
  }

  function togglePage(i) {
    setSelectedPages(prev => {
      const next = new Set(prev)
      next.has(i) ? next.delete(i) : next.add(i)
      return next
    })
  }

  function applyRotation() {
    setPageRotations(prev => {
      const next = { ...prev }
      selectedPages.forEach(i => { next[i] = ((next[i] || 0) + rotationAmount) % 360 })
      return next
    })
  }

  async function handleProcess() {
    setProcessing(true)
    setError('')
    setDone(false)
    try {
      if (activeTool === 'merge') {
        if (mergeFiles.length < 2) throw new Error('Upload at least 2 PDF files to merge.')
        const out = await PDFDocument.create()
        for (const f of mergeFiles) {
          const src = await PDFDocument.load(await f.arrayBuffer())
          const pages = await out.copyPages(src, src.getPageIndices())
          pages.forEach(p => out.addPage(p))
        }
        const bytes = await out.save()
        setMergedBytes(bytes)
        const doc = await pdfjsLib.getDocument({ data: new Uint8Array(bytes) }).promise
        setMergedPdfJsDoc(doc)
        const count = doc.numPages
        setMergedPageCount(count)
        setPageOrder(Array.from({ length: count }, (_, i) => i))
        setMergeStage('rearrange')
        setProcessing(false)
        return

      } else if (activeTool === 'delete') {
        if (!singleFile) throw new Error('Upload a PDF first.')
        if (selectedPages.size === 0) throw new Error('Select at least one page to delete.')
        const pdf = await PDFDocument.load(await singleFile.arrayBuffer())
        ;[...selectedPages].sort((a, b) => b - a).forEach(i => pdf.removePage(i))
        downloadBlob(await pdf.save(), `${stripExt(singleFile.name)}_deleted.pdf`)

      } else if (activeTool === 'rotate') {
        if (!singleFile) throw new Error('Upload a PDF first.')
        if (Object.keys(pageRotations).length === 0) throw new Error('Apply rotation to at least one page first.')
        const pdf = await PDFDocument.load(await singleFile.arrayBuffer())
        pdf.getPages().forEach((page, i) => {
          if (pageRotations[i]) {
            page.setRotation(degrees((page.getRotation().angle + pageRotations[i]) % 360))
          }
        })
        downloadBlob(await pdf.save(), `${stripExt(singleFile.name)}_rotated.pdf`)

      } else if (activeTool === 'extract') {
        if (!singleFile) throw new Error('Upload a PDF first.')
        if (selectedPages.size === 0) throw new Error('Select at least one page to extract.')
        const src = await PDFDocument.load(await singleFile.arrayBuffer())
        const out = await PDFDocument.create()
        const sorted = [...selectedPages].sort((a, b) => a - b)
        const pages = await out.copyPages(src, sorted)
        pages.forEach(p => out.addPage(p))
        downloadBlob(await out.save(), `${stripExt(singleFile.name)}_extracted.pdf`)

      } else if (activeTool === 'split') {
        if (!singleFile) throw new Error('Upload a PDF first.')
        const src = await PDFDocument.load(await singleFile.arrayBuffer())
        const total = src.getPageCount()
        let chunks = []
        if (splitMode === 'count') {
          const n = Math.max(1, parseInt(splitValue) || 1)
          for (let i = 0; i < total; i += n)
            chunks.push({ start: i, end: Math.min(i + n - 1, total - 1) })
        } else {
          chunks = parseRanges(splitValue, total)
        }
        if (chunks.length === 0) throw new Error('Invalid split configuration.')
        const base = stripExt(singleFile.name)
        for (let c = 0; c < chunks.length; c++) {
          const { start, end } = chunks[c]
          const out = await PDFDocument.create()
          const indices = Array.from({ length: end - start + 1 }, (_, i) => start + i)
          const pages = await out.copyPages(src, indices)
          pages.forEach(p => out.addPage(p))
          const saved = await out.save()
          await new Promise(res => setTimeout(res, c * 250))
          downloadBlob(saved, `${base}_part${c + 1}.pdf`)
        }

      } else if (activeTool === 'watermark') {
        if (!singleFile) throw new Error('Upload a PDF first.')
        if (!wmText.trim()) throw new Error('Enter watermark text.')
        const pdf = await PDFDocument.load(await singleFile.arrayBuffer())
        const font = await pdf.embedFont(StandardFonts.HelveticaBold)
        for (const page of pdf.getPages()) {
          const { width, height } = page.getSize()
          const textWidth = font.widthOfTextAtSize(wmText, wmSize)
          page.drawText(wmText, {
            x: (width - textWidth) / 2,
            y: height / 2 - wmSize / 2,
            size: wmSize,
            font,
            color: rgb(0.5, 0.5, 0.5),
            opacity: wmOpacity / 100,
            rotate: degrees(wmAngle),
          })
        }
        downloadBlob(await pdf.save(), `${stripExt(singleFile.name)}_watermarked.pdf`)

      } else if (activeTool === 'compress') {
        if (!singleFile) throw new Error('Upload a PDF first.')
        const pdf = await PDFDocument.load(await singleFile.arrayBuffer())
        downloadBlob(await pdf.save({ useObjectStreams: true }), `${stripExt(singleFile.name)}_compressed.pdf`)
      }

      setDone(true)
    } catch (e) {
      setError(e.message || 'An error occurred.')
    } finally {
      setProcessing(false)
    }
  }

  async function handleDownloadMerged() {
    setProcessing(true)
    setError('')
    try {
      const src = await PDFDocument.load(mergedBytes)
      const out = await PDFDocument.create()
      const pages = await out.copyPages(src, pageOrder)
      pages.forEach(p => out.addPage(p))
      downloadBlob(await out.save(), 'merged.pdf')
      setDone(true)
    } catch (e) {
      setError(e.message)
    } finally {
      setProcessing(false)
    }
  }

  function handlePageDrop(dropIndex) {
    if (dragIndex === null || dragIndex === dropIndex) return
    setPageOrder(prev => {
      const next = [...prev]
      const [moved] = next.splice(dragIndex, 1)
      next.splice(dropIndex, 0, moved)
      return next
    })
    setDragIndex(null)
    setDragOverIndex(null)
  }

  const tool = TOOLS.find(t => t.id === activeTool)
  const needsPageGrid = ['delete', 'rotate', 'extract'].includes(activeTool)
  const canProcess = activeTool === 'merge'
    ? (mergeStage === 'upload' ? mergeFiles.length >= 2 : true)
    : singleFile !== null

  const splitFileCount = (() => {
    if (activeTool !== 'split' || !singleFile || splitMode !== 'count') return null
    const n = Math.max(1, parseInt(splitValue) || 1)
    return Math.ceil(pageCount / n)
  })()

  return (
    <div style={{ padding: isMobile ? '16px' : '28px 32px', maxWidth: '1140px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: isMobile ? '20px' : '24px', fontWeight: '800', color: '#0f172a', margin: 0 }}>Tools</h1>
        <p style={{ fontSize: '13px', color: '#94a3b8', marginTop: '4px' }}>
          PDF editing utilities — everything runs in your browser, files never leave your device
        </p>
      </div>

      {/* Tool Tabs */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '24px' }}>
        {TOOLS.map(({ id, label, Icon, color }) => (
          <button
            key={id}
            onClick={() => switchTool(id)}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '8px 14px', borderRadius: '10px', cursor: 'pointer',
              border: `1px solid ${activeTool === id ? color : '#e2e8f0'}`,
              background: activeTool === id ? `${color}18` : 'white',
              color: activeTool === id ? color : '#475569',
              fontSize: '12px', fontWeight: '700', transition: 'all 0.15s',
            }}
          >
            <Icon size={13} />
            {label}
          </button>
        ))}
      </div>

      {/* Two-column layout */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 300px', gap: '20px', alignItems: 'start' }}>

        {/* ── Left column ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

          {/* MERGE: multi-file list */}
          {activeTool === 'merge' && (
            <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '20px', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
              <Dropzone multiple onFiles={fs => { setMergeFiles(p => [...p, ...fs]); setDone(false) }} label="Drop PDFs here to merge" />
              {mergeFiles.length > 0 && (
                <div style={{ marginTop: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                    <p style={{ fontSize: '12px', fontWeight: '700', color: '#475569' }}>
                      {mergeFiles.length} file{mergeFiles.length !== 1 ? 's' : ''}
                    </p>
                    <button onClick={() => { setMergeFiles([]); setDone(false) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: '12px', fontWeight: '600' }}>
                      Clear all
                    </button>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {mergeFiles.map((f, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', background: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                        <GripVertical size={14} color="#cbd5e1" style={{ flexShrink: 0 }} />
                        <FileText size={15} color="#2563eb" style={{ flexShrink: 0 }} />
                        <span style={{ flex: 1, fontSize: '12px', fontWeight: '600', color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {f.name}
                        </span>
                        <span style={{ fontSize: '11px', color: '#94a3b8', flexShrink: 0 }}>{(f.size / 1024).toFixed(0)} KB</span>
                        <div style={{ display: 'flex', gap: '2px', flexShrink: 0 }}>
                          <button
                            onClick={() => setMergeFiles(p => { const a = [...p]; if (i > 0) [a[i-1], a[i]] = [a[i], a[i-1]]; return a })}
                            disabled={i === 0}
                            style={{ background: 'none', border: 'none', cursor: i > 0 ? 'pointer' : 'default', color: i > 0 ? '#475569' : '#e2e8f0', padding: '2px' }}
                          ><ArrowUp size={13} /></button>
                          <button
                            onClick={() => setMergeFiles(p => { const a = [...p]; if (i < a.length-1) [a[i], a[i+1]] = [a[i+1], a[i]]; return a })}
                            disabled={i === mergeFiles.length - 1}
                            style={{ background: 'none', border: 'none', cursor: i < mergeFiles.length-1 ? 'pointer' : 'default', color: i < mergeFiles.length-1 ? '#475569' : '#e2e8f0', padding: '2px' }}
                          ><ArrowDown size={13} /></button>
                          <button
                            onClick={() => setMergeFiles(p => p.filter((_, idx) => idx !== i))}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: '2px' }}
                          ><X size={13} /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* MERGE: rearrange stage */}
          {activeTool === 'merge' && mergeStage === 'rearrange' && (
            <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '20px', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                <div>
                  <p style={{ fontSize: '13px', fontWeight: '700', color: '#0f172a' }}>Rearrange pages</p>
                  <p style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>{mergedPageCount} pages — drag to reorder</p>
                </div>
                <button
                  onClick={() => { setMergeStage('upload'); setMergedBytes(null); setMergedPdfJsDoc(null); setPageOrder([]); setDone(false) }}
                  style={{ fontSize: '12px', fontWeight: '600', color: '#64748b', background: 'none', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '6px 12px', cursor: 'pointer' }}
                >
                  ← Back
                </button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(88px, 1fr))', gap: '10px', maxHeight: '520px', overflowY: 'auto', paddingRight: '2px' }}>
                {pageOrder.map((originalPage, orderIdx) => (
                  <div
                    key={orderIdx}
                    draggable
                    onDragStart={() => setDragIndex(orderIdx)}
                    onDragOver={e => { e.preventDefault(); setDragOverIndex(orderIdx) }}
                    onDrop={() => handlePageDrop(orderIdx)}
                    onDragEnd={() => { setDragIndex(null); setDragOverIndex(null) }}
                    style={{
                      cursor: 'grab',
                      opacity: dragIndex === orderIdx ? 0.4 : 1,
                      outline: dragOverIndex === orderIdx && dragIndex !== orderIdx ? '2px dashed #2563eb' : 'none',
                      outlineOffset: '2px',
                      borderRadius: '10px',
                      transition: 'opacity 0.15s',
                    }}
                  >
                    <PageThumbnail
                      pdfJsDoc={mergedPdfJsDoc}
                      pageNum={originalPage + 1}
                      selected={false}
                      rotation={0}
                      onToggle={() => {}}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Single-file tools: upload area */}
          {activeTool !== 'merge' && (
            <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '20px', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
              {!singleFile ? (
                <Dropzone onFiles={([f]) => { setSingleFile(f); setDone(false) }} />
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 14px', background: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                  <FileText size={20} color="#2563eb" style={{ flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: '13px', fontWeight: '700', color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{singleFile.name}</p>
                    <p style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
                      {(singleFile.size / 1024).toFixed(0)} KB · {pageCount > 0 ? `${pageCount} pages` : 'loading…'}
                    </p>
                  </div>
                  <button onClick={resetSingleFile} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', display: 'flex', padding: '4px' }}
                    onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
                    onMouseLeave={e => e.currentTarget.style.color = '#94a3b8'}
                  >
                    <X size={16} />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Page grid (delete / rotate / extract) */}
          {needsPageGrid && singleFile && pageCount > 0 && (
            <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '20px', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                <p style={{ fontSize: '13px', fontWeight: '700', color: '#0f172a' }}>
                  {activeTool === 'delete' ? 'Select pages to delete' : activeTool === 'rotate' ? 'Select pages to rotate' : 'Select pages to extract'}
                </p>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button onClick={() => setSelectedPages(new Set(Array.from({ length: pageCount }, (_, i) => i)))} style={{ fontSize: '11px', fontWeight: '700', color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer' }}>All</button>
                  <button onClick={() => setSelectedPages(new Set())} style={{ fontSize: '11px', fontWeight: '700', color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer' }}>None</button>
                </div>
              </div>
              <p style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '14px' }}>
                {selectedPages.size} of {pageCount} selected
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(88px, 1fr))', gap: '10px', maxHeight: '520px', overflowY: 'auto', paddingRight: '2px' }}>
                {Array.from({ length: Math.min(pageCount, 100) }, (_, i) => (
                  <PageThumbnail
                    key={i}
                    pdfJsDoc={pdfJsDoc}
                    pageNum={i + 1}
                    selected={selectedPages.has(i)}
                    rotation={pageRotations[i] || 0}
                    onToggle={() => togglePage(i)}
                  />
                ))}
              </div>
              {pageCount > 100 && (
                <p style={{ fontSize: '11px', color: '#94a3b8', textAlign: 'center', marginTop: '12px' }}>
                  Showing first 100 pages
                </p>
              )}
            </div>
          )}
        </div>

        {/* ── Right column: options + process ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '20px', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>

            {/* Tool header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '18px' }}>
              <div style={{ width: '34px', height: '34px', borderRadius: '9px', background: `${tool.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <tool.Icon size={16} color={tool.color} />
              </div>
              <p style={{ fontSize: '14px', fontWeight: '700', color: '#0f172a' }}>{tool.label}</p>
            </div>

            {/* Rotate options */}
            {activeTool === 'rotate' && singleFile && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '4px' }}>
                <p style={{ fontSize: '12px', fontWeight: '600', color: '#64748b' }}>Angle per click</p>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {[90, 180, 270].map(a => (
                    <button
                      key={a}
                      onClick={() => setRotationAmount(a)}
                      style={{
                        flex: 1, padding: '7px 0', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: '700',
                        border: `1px solid ${rotationAmount === a ? tool.color : '#e2e8f0'}`,
                        background: rotationAmount === a ? `${tool.color}12` : 'white',
                        color: rotationAmount === a ? tool.color : '#475569',
                      }}
                    >{a}°</button>
                  ))}
                </div>
                <button
                  onClick={applyRotation}
                  disabled={selectedPages.size === 0}
                  style={{
                    padding: '10px', borderRadius: '10px', border: 'none', cursor: selectedPages.size ? 'pointer' : 'default',
                    background: selectedPages.size ? '#f59e0b' : '#f1f5f9',
                    color: selectedPages.size ? 'white' : '#94a3b8',
                    fontSize: '12px', fontWeight: '700', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                  }}
                >
                  <RotateCw size={13} />
                  Apply {rotationAmount}° to {selectedPages.size} page{selectedPages.size !== 1 ? 's' : ''}
                </button>
              </div>
            )}

            {/* Split options */}
            {activeTool === 'split' && singleFile && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '4px' }}>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {[['count', 'Every N pages'], ['range', 'Page ranges']].map(([v, l]) => (
                    <button
                      key={v}
                      onClick={() => setSplitMode(v)}
                      style={{
                        flex: 1, padding: '7px 0', borderRadius: '8px', cursor: 'pointer', fontSize: '11px', fontWeight: '700',
                        border: `1px solid ${splitMode === v ? tool.color : '#e2e8f0'}`,
                        background: splitMode === v ? `${tool.color}12` : 'white',
                        color: splitMode === v ? tool.color : '#475569',
                      }}
                    >{l}</button>
                  ))}
                </div>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: '600', color: '#64748b', display: 'block', marginBottom: '6px' }}>
                    {splitMode === 'count' ? 'Pages per file' : 'Ranges (e.g. 1-3, 4-6, 7)'}
                  </label>
                  <input
                    value={splitValue}
                    type={splitMode === 'count' ? 'number' : 'text'}
                    min="1"
                    onChange={e => setSplitValue(e.target.value)}
                    placeholder={splitMode === 'range' ? '1-3, 4-6, 7' : '2'}
                    style={{ width: '100%', padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }}
                  />
                  {splitMode === 'count' && splitFileCount !== null && (
                    <p style={{ fontSize: '11px', color: '#94a3b8', marginTop: '5px' }}>
                      Will create {splitFileCount} file{splitFileCount !== 1 ? 's' : ''}
                    </p>
                  )}
                  {splitMode === 'range' && (
                    <p style={{ fontSize: '11px', color: '#94a3b8', marginTop: '5px' }}>Total pages: {pageCount}</p>
                  )}
                </div>
              </div>
            )}

            {/* Watermark options */}
            {activeTool === 'watermark' && singleFile && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '4px' }}>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: '600', color: '#64748b', display: 'block', marginBottom: '6px' }}>Text</label>
                  <input
                    value={wmText}
                    onChange={e => setWmText(e.target.value)}
                    placeholder="CONFIDENTIAL"
                    style={{ width: '100%', padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: '600', color: '#64748b', display: 'block', marginBottom: '6px' }}>Font size: {wmSize}px</label>
                  <input type="range" min="12" max="120" value={wmSize} onChange={e => setWmSize(+e.target.value)} style={{ width: '100%' }} />
                </div>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: '600', color: '#64748b', display: 'block', marginBottom: '6px' }}>Opacity: {wmOpacity}%</label>
                  <input type="range" min="5" max="100" value={wmOpacity} onChange={e => setWmOpacity(+e.target.value)} style={{ width: '100%' }} />
                </div>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: '600', color: '#64748b', display: 'block', marginBottom: '6px' }}>Angle: {wmAngle}°</label>
                  <input type="range" min="-90" max="90" value={wmAngle} onChange={e => setWmAngle(+e.target.value)} style={{ width: '100%' }} />
                </div>
              </div>
            )}

            {/* Compress note */}
            {activeTool === 'compress' && singleFile && (
              <div style={{ padding: '12px', background: '#f0fdf4', borderRadius: '10px', border: '1px solid #bbf7d0', marginBottom: '4px' }}>
                <p style={{ fontSize: '12px', color: '#15803d', lineHeight: 1.6 }}>
                  Re-encodes the PDF with compressed object streams. Reduction typically 5–20%. For heavy compression, use a dedicated PDF compressor.
                </p>
              </div>
            )}

            {/* Error */}
            {error && (
              <div style={{ padding: '10px 12px', background: '#fef2f2', borderRadius: '8px', border: '1px solid #fecaca', marginBottom: '4px' }}>
                <p style={{ fontSize: '12px', color: '#dc2626', fontWeight: '600' }}>{error}</p>
              </div>
            )}

            {/* Done */}
            {done && !error && (
              <div style={{ padding: '10px 12px', background: '#f0fdf4', borderRadius: '8px', border: '1px solid #bbf7d0', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Check size={13} color="#16a34a" />
                <p style={{ fontSize: '12px', color: '#16a34a', fontWeight: '600' }}>
                  {activeTool === 'split' ? 'Files downloaded!' : 'Done! File downloaded.'}
                </p>
              </div>
            )}

            {/* Process button */}
            <button
              onClick={activeTool === 'merge' && mergeStage === 'rearrange' ? handleDownloadMerged : handleProcess}
              disabled={processing || !canProcess}
              style={{
                marginTop: '8px',
                width: '100%', padding: '12px', borderRadius: '10px', border: 'none',
                background: canProcess && !processing ? tool.color : '#e2e8f0',
                color: canProcess && !processing ? 'white' : '#94a3b8',
                fontSize: '13px', fontWeight: '700', cursor: canProcess && !processing ? 'pointer' : 'default',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                transition: 'background 0.15s, opacity 0.15s',
              }}
            >
              {processing ? (
                <>
                  <div style={{ width: '14px', height: '14px', borderRadius: '50%', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'white', animation: 'spin 0.6s linear infinite' }} />
                  Processing…
                </>
              ) : (
                <>
                  <Download size={14} />
                  {activeTool === 'merge' && mergeStage === 'upload' ? 'Merge & Preview'
                    : activeTool === 'merge' && mergeStage === 'rearrange' ? 'Download PDF'
                    : activeTool === 'split' ? 'Split & Download'
                    : 'Process & Download'}
                </>
              )}
            </button>
          </div>

          {/* Tip box */}
          <div style={{ padding: '14px 16px', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
            <p style={{ fontSize: '10px', fontWeight: '700', color: '#64748b', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Tip</p>
            <p style={{ fontSize: '12px', color: '#94a3b8', lineHeight: 1.6 }}>{TIPS[activeTool]}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
