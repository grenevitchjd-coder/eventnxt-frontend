// eventnxt-frontend: src/pages/ScanPage.jsx
//
// The door. Mobile-first, auth-guarded (door staff log in with their
// org account), reached from the dashboard's Manage group.
//
// Two ways in, both always available:
// - Camera scanning via the BarcodeDetector API where the browser has
//   it (Chrome/Android natively; guarded so unsupported browsers just
//   don't show the camera and the page still works).
// - Manual code entry — the fallback that always exists, because door
//   lighting, cracked screens, and printed tickets are all real.
//
// Every scan answers with a full-width color card: green admit with
// the person's name/type/seat, amber "already checked in at HH:MM"
// (with who it was), red for refunded/unknown. The tally and recent
// list refresh after every scan.

import { useEffect, useRef, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import jsQR from 'jsqr'
import { api } from '../api'

const RESULT_STYLES = {
  admitted: { bg: '#E1F5EE', border: '#0F6E56', label: 'ADMIT' },
  wrong_day: { bg: '#FDEBD7', border: '#B4590A', label: 'WRONG DAY — DO NOT ADMIT' },
  already_checked_in: { bg: '#FBF3DC', border: '#8A6D1C', label: 'ALREADY CHECKED IN' },
  refunded: { bg: '#FAE4E4', border: '#A33', label: 'REFUNDED — DO NOT ADMIT' },
  not_found: { bg: '#FAE4E4', border: '#A33', label: 'NOT A TICKET FOR THIS EVENT' },
}

// The scanner's own date — venue-local in practice (door staff device).
const localDay = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function ScanPage() {
  const { eventId } = useParams()
  const [stats, setStats] = useState(null)
  const [manual, setManual] = useState('')
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)
  const [cameraState, setCameraState] = useState('off') // off | on | unsupported | denied
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const lastScanRef = useRef({ code: '', at: 0 })

  const loadStats = () => {
    api.checkInStats(eventId).then(setStats).catch(() => {})
  }
  useEffect(() => {
    loadStats()
    return () => stopCamera()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId])

  const redeem = async (code) => {
    const clean = (code || '').trim()
    if (!clean || busy) return
    setBusy(true)
    try {
      const r = await api.checkInTicket(eventId, clean, localDay())
      setResult(r)
      loadStats()
    } catch (err) {
      setResult({ result: 'not_found', code: clean })
    } finally {
      setBusy(false)
    }
  }

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    setCameraState('off')
  }

  const startCamera = async () => {
    // Two decode engines, chosen by capability:
    // - BarcodeDetector (Chrome/Android): native, fast, cheap.
    // - jsQR (everything else, notably iPhone Safari): each tick draws
    //   the video frame to a small offscreen canvas and decodes the
    //   pixels in JS. Downscaling to ~480px wide keeps decode fast
    //   while leaving codes at arm's length readable.
    // Camera support itself (getUserMedia) is the only hard requirement.
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraState('unsupported')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      streamRef.current = stream
      videoRef.current.srcObject = stream
      await videoRef.current.play()
      setCameraState('on')

      const maybeRedeem = (value) => {
        const now = Date.now()
        // Debounce: the same QR sits in frame for many ticks — only
        // redeem when the code changes or 3s have passed.
        if (value !== lastScanRef.current.code || now - lastScanRef.current.at > 3000) {
          lastScanRef.current = { code: value, at: now }
          redeem(value)
        }
      }

      const native = 'BarcodeDetector' in window
      const detector = native ? new window.BarcodeDetector({ formats: ['qr_code'] }) : null
      const canvas = native ? null : document.createElement('canvas')
      const ctx = native ? null : canvas.getContext('2d', { willReadFrequently: true })

      const tick = async () => {
        if (!streamRef.current) return
        try {
          if (native) {
            const codes = await detector.detect(videoRef.current)
            if (codes.length > 0) maybeRedeem(codes[0].rawValue)
          } else {
            const vw = videoRef.current.videoWidth
            const vh = videoRef.current.videoHeight
            if (vw > 0) {
              const w = Math.min(480, vw)
              const h = Math.round((vh / vw) * w)
              canvas.width = w
              canvas.height = h
              ctx.drawImage(videoRef.current, 0, 0, w, h)
              const img = ctx.getImageData(0, 0, w, h)
              const found = jsQR(img.data, w, h)
              if (found && found.data) maybeRedeem(found.data)
            }
          }
        } catch {
          /* a bad frame is not a problem — next tick */
        }
        if (streamRef.current) setTimeout(tick, 350)
      }
      tick()
    } catch {
      setCameraState('denied')
    }
  }

  const style = result ? RESULT_STYLES[result.result] || RESULT_STYLES.not_found : null

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg, #16151A)', color: 'var(--text, #EDEDF0)', padding: '18px 16px', maxWidth: 560, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
        <h1 style={{ fontSize: 20, margin: 0 }}>Door check-in</h1>
        <Link to="/" style={{ fontSize: 13, color: 'var(--text-muted, #9a99a2)' }}>
          ← Dashboard
        </Link>
      </div>
      <div style={{ fontSize: 14, color: 'var(--text-muted, #9a99a2)', marginBottom: 14 }}>
        {stats ? (
          <>
            <strong style={{ color: 'var(--text, #EDEDF0)', fontSize: 17 }}>{stats.checked_in}</strong> of {stats.total_valid} checked in
          </>
        ) : (
          'Loading…'
        )}
      </div>

      {/* Result card — the thing the person at the door actually reads */}
      {result && style && (
        <div style={{ background: style.bg, border: `2px solid ${style.border}`, color: '#222', borderRadius: 12, padding: '14px 16px', marginBottom: 14 }}>
          <div style={{ fontWeight: 800, letterSpacing: 0.5, color: style.border }}>{style.label}</div>
          {result.name && (
            <div style={{ fontSize: 20, fontWeight: 700, marginTop: 2 }}>{result.name}</div>
          )}
          <div style={{ fontSize: 13.5, marginTop: 2 }}>
            {[result.ticket_type_name, result.seat_label, result.party_note].filter(Boolean).join(' · ') || result.code}
          </div>
          {result.result === 'wrong_day' && result.valid_date && (
            <div style={{ fontSize: 13.5, marginTop: 4, fontWeight: 700 }}>
              This ticket is for {new Date(result.valid_date + 'T12:00:00').toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
            </div>
          )}
          {result.result === 'already_checked_in' && result.checked_in_at && (
            <div style={{ fontSize: 13, marginTop: 4 }}>
              First scanned at {new Date(result.checked_in_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
          )}
          <div style={{ fontSize: 11.5, color: '#666', marginTop: 6 }} className="mono">
            {result.code}
          </div>
        </div>
      )}

      {/* Camera */}
      <div style={{ marginBottom: 14 }}>
        {cameraState === 'on' ? (
          <>
            <video ref={videoRef} playsInline muted style={{ width: '100%', borderRadius: 12, background: '#000' }} />
            <button className="btn btn-secondary btn-sm" style={{ marginTop: 8 }} onClick={stopCamera}>
              Stop camera
            </button>
          </>
        ) : (
          <button className="btn btn-primary" style={{ width: '100%' }} onClick={startCamera}>
            Scan with camera
          </button>
        )}
        {cameraState === 'unsupported' && (
          <p style={{ fontSize: 12.5, color: 'var(--text-muted, #9a99a2)', marginTop: 6 }}>
            This browser has no camera access — type the code below instead.
          </p>
        )}
        {cameraState === 'denied' && (
          <p style={{ fontSize: 12.5, color: 'var(--text-muted, #9a99a2)', marginTop: 6 }}>
            Camera permission was blocked — type the code below instead.
          </p>
        )}
      </div>

      {/* Manual entry — always available */}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          redeem(manual)
          setManual('')
        }}
        style={{ display: 'flex', gap: 8, marginBottom: 18 }}
      >
        <input
          placeholder="Type a ticket code (T-XXXXXXXX)"
          value={manual}
          onChange={(e) => setManual(e.target.value)}
          style={{ flex: 1, fontSize: 16 }}
          autoCapitalize="characters"
          autoComplete="off"
        />
        <button className="btn btn-primary" type="submit" disabled={busy || !manual.trim()}>
          Check in
        </button>
      </form>

      {/* Recent admits */}
      {stats && stats.recent.length > 0 && (
        <div>
          <div style={{ fontSize: 12.5, color: 'var(--text-muted, #9a99a2)', marginBottom: 6 }}>Recent</div>
          {stats.recent.map((r) => (
            <div key={r.code} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5, padding: '5px 0', borderBottom: '1px solid var(--border, #2a2930)' }}>
              <span>
                {r.name || r.code}
                <span style={{ color: 'var(--text-muted, #9a99a2)' }}>
                  {r.ticket_type_name ? ` · ${r.ticket_type_name}` : ''}
                </span>
              </span>
              <span style={{ color: 'var(--text-muted, #9a99a2)' }}>
                {r.checked_in_at ? new Date(r.checked_in_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}