import { useEffect, useMemo, useRef, useState } from 'react'
import { detectFacesOnFrame } from '../faceDetection'
import type { MaskBox, MaskKeyframe, PrivacyMetrics, PrivacyTrack } from '../types'

type Props = {
  file: File
  onSanitized: (blob: Blob, durationMs: number, metrics: PrivacyMetrics) => void
}

const TRACK_SAMPLE_MS = 500

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value))
}

function interpolate(a: number, b: number, ratio: number) {
  return a + (b - a) * ratio
}

function boxAtTime(track: PrivacyTrack, timeMs: number): MaskBox | null {
  if (timeMs < track.startMs || timeMs > track.endMs || track.keyframes.length === 0) return null
  const frames = [...track.keyframes].sort((a, b) => a.timeMs - b.timeMs)
  if (timeMs <= frames[0].timeMs) return frames[0]
  if (timeMs >= frames[frames.length - 1].timeMs) return frames[frames.length - 1]

  for (let index = 0; index < frames.length - 1; index += 1) {
    const left = frames[index]
    const right = frames[index + 1]
    if (timeMs >= left.timeMs && timeMs <= right.timeMs) {
      const span = Math.max(1, right.timeMs - left.timeMs)
      const ratio = (timeMs - left.timeMs) / span
      return {
        x: interpolate(left.x, right.x, ratio),
        y: interpolate(left.y, right.y, ratio),
        width: interpolate(left.width, right.width, ratio),
        height: interpolate(left.height, right.height, ratio),
      }
    }
  }
  return frames[0]
}

function intersectionOverUnion(a: MaskBox, b: MaskBox) {
  const left = Math.max(a.x, b.x)
  const top = Math.max(a.y, b.y)
  const right = Math.min(a.x + a.width, b.x + b.width)
  const bottom = Math.min(a.y + a.height, b.y + b.height)
  const intersection = Math.max(0, right - left) * Math.max(0, bottom - top)
  const union = a.width * a.height + b.width * b.height - intersection
  return union > 0 ? intersection / union : 0
}

function centerDistance(a: MaskBox, b: MaskBox) {
  const ax = a.x + a.width / 2
  const ay = a.y + a.height / 2
  const bx = b.x + b.width / 2
  const by = b.y + b.height / 2
  return Math.hypot(ax - bx, ay - by)
}

function chooseNearest(previous: MaskBox, candidates: MaskBox[]) {
  if (!candidates.length) return null
  const ranked = candidates
    .map(candidate => ({
      candidate,
      iou: intersectionOverUnion(previous, candidate),
      distance: centerDistance(previous, candidate),
    }))
    .sort((a, b) => (b.iou - a.iou) || (a.distance - b.distance))
  const best = ranked[0]
  return best.iou >= 0.08 || best.distance <= 0.18 ? best.candidate : null
}

function drawFrame(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  tracks: PrivacyTrack[],
  selectedTrackId: string | null,
  reviewMode = false,
) {
  ctx.filter = 'none'
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
  const timeMs = video.currentTime * 1000

  for (const track of tracks) {
    if (!reviewMode && !track.accepted) continue
    const box = boxAtTime(track, timeMs)
    if (!box) continue
    const x = box.x * canvas.width
    const y = box.y * canvas.height
    const w = box.width * canvas.width
    const h = box.height * canvas.height

    if (track.accepted) {
      ctx.save()
      ctx.beginPath()
      ctx.rect(x, y, w, h)
      ctx.clip()
      ctx.filter = 'blur(22px)'
      const pad = 24
      ctx.drawImage(
        video,
        Math.max(0, x - pad), Math.max(0, y - pad),
        Math.min(canvas.width - x + pad, w + 2 * pad),
        Math.min(canvas.height - y + pad, h + 2 * pad),
        Math.max(0, x - pad), Math.max(0, y - pad),
        Math.min(canvas.width - x + pad, w + 2 * pad),
        Math.min(canvas.height - y + pad, h + 2 * pad),
      )
      ctx.restore()
    }

    ctx.save()
    const pending = track.source === 'ai-suggestion' && !track.accepted
    ctx.lineWidth = track.id === selectedTrackId ? 5 : pending ? 4 : 3
    ctx.setLineDash(pending ? [8, 6] : [])
    ctx.strokeStyle = pending ? '#c47a14' : track.kind === 'face' ? '#1d6f7a' : '#7d4b18'
    ctx.strokeRect(x, y, w, h)
    ctx.restore()
  }
}

function seek(video: HTMLVideoElement, seconds: number) {
  return new Promise<void>((resolve, reject) => {
    const target = Math.min(Math.max(0, seconds), Math.max(0, video.duration - 0.001))
    if (Math.abs(video.currentTime - target) < 0.01) {
      resolve()
      return
    }
    const onSeeked = () => { cleanup(); resolve() }
    const onError = () => { cleanup(); reject(new Error('Falha ao navegar pelo vídeo para rastreamento.')) }
    const cleanup = () => {
      video.removeEventListener('seeked', onSeeked)
      video.removeEventListener('error', onError)
    }
    video.addEventListener('seeked', onSeeked)
    video.addEventListener('error', onError)
    video.currentTime = target
  })
}

export default function PrivacyRedactor({ file, onSanitized }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [sourceUrl, setSourceUrl] = useState('')
  const [tracks, setTracks] = useState<PrivacyTrack[]>([])
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null)
  const [rejectedSuggestions, setRejectedSuggestions] = useState(0)
  const [maskKind, setMaskKind] = useState<'face' | 'plate'>('face')
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null)
  const [processing, setProcessing] = useState(false)
  const [detecting, setDetecting] = useState(false)
  const [tracking, setTracking] = useState(false)
  const [detectionTimeMs, setDetectionTimeMs] = useState(0)
  const [trackingTimeMs, setTrackingTimeMs] = useState(0)
  const [trackingSamples, setTrackingSamples] = useState(0)
  const [progress, setProgress] = useState(0)
  const [message, setMessage] = useState('')
  const [durationMs, setDurationMs] = useState(0)

  const selectedTrack = useMemo(
    () => tracks.find(track => track.id === selectedTrackId) || null,
    [tracks, selectedTrackId],
  )

  useEffect(() => {
    const url = URL.createObjectURL(file)
    setSourceUrl(url)
    setTracks([])
    setSelectedTrackId(null)
    setRejectedSuggestions(0)
    setDetectionTimeMs(0)
    setTrackingTimeMs(0)
    setTrackingSamples(0)
    setDurationMs(0)
    setMessage('')
    return () => URL.revokeObjectURL(url)
  }, [file])

  const refreshCanvas = () => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || !video.videoWidth) return
    const maxWidth = 720
    const scale = Math.min(1, maxWidth / video.videoWidth)
    canvas.width = Math.round(video.videoWidth * scale)
    canvas.height = Math.round(video.videoHeight * scale)
    const ctx = canvas.getContext('2d')
    if (ctx) drawFrame(ctx, video, canvas, tracks, selectedTrackId, true)
  }

  useEffect(refreshCanvas, [tracks, selectedTrackId])

  const pointFromEvent = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    return {
      x: clamp01((e.clientX - rect.left) / rect.width),
      y: clamp01((e.clientY - rect.top) / rect.height),
    }
  }

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (tracking || processing) return
    setDragStart(pointFromEvent(e))
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragStart) return
    const video = videoRef.current
    if (!video) return
    const end = pointFromEvent(e)
    const x = Math.min(dragStart.x, end.x)
    const y = Math.min(dragStart.y, end.y)
    const width = Math.abs(end.x - dragStart.x)
    const height = Math.abs(end.y - dragStart.y)
    const timeMs = Math.round(video.currentTime * 1000)

    if (width > 0.015 && height > 0.015) {
      const keyframe: MaskKeyframe = { timeMs, source: 'manual', x, y, width, height }
      if (selectedTrackId) {
        setTracks(prev => prev.map(track => {
          if (track.id !== selectedTrackId) return track
          const withoutNearby = track.keyframes.filter(frame => Math.abs(frame.timeMs - timeMs) > 80)
          return {
            ...track,
            startMs: Math.min(track.startMs, timeMs),
            endMs: Math.max(track.endMs, timeMs),
            keyframes: [...withoutNearby, keyframe].sort((a, b) => a.timeMs - b.timeMs),
          }
        }))
        setMessage('Keyframe manual adicionado ao track selecionado.')
      } else {
        const id = crypto.randomUUID()
        setTracks(prev => [...prev, {
          id,
          kind: maskKind,
          source: 'manual',
          accepted: true,
          startMs: 0,
          endMs: durationMs || timeMs,
          keyframes: [keyframe],
        }])
        setSelectedTrackId(id)
        setMessage('Track manual criado. Desenhe novamente em outro instante para adicionar um keyframe.')
      }
    }
    setDragStart(null)
  }

  const detectFaces = async () => {
    const video = videoRef.current
    if (!video) return
    setDetecting(true)
    setMessage('')
    const started = performance.now()
    try {
      video.pause()
      const timeMs = Math.round(video.currentTime * 1000)
      const suggestions = await detectFacesOnFrame(video)
      setDetectionTimeMs(prev => prev + Math.round(performance.now() - started))
      const created = suggestions.map(suggestion => ({
        id: crypto.randomUUID(),
        kind: 'face' as const,
        source: 'ai-suggestion' as const,
        accepted: false,
        startMs: timeMs,
        endMs: timeMs,
        keyframes: [{
          timeMs,
          source: 'ai' as const,
          confidence: suggestion.confidence,
          x: suggestion.x, y: suggestion.y,
          width: suggestion.width, height: suggestion.height,
        }],
      }))
      setTracks(prev => [...prev, ...created])
      if (created[0]) setSelectedTrackId(created[0].id)
      setMessage(created.length
        ? `${created.length} rosto(s) sugerido(s) neste frame. Aceite uma sugestão e use o rastreamento temporal.`
        : 'Nenhum rosto detectado neste frame. Você ainda pode criar tracks manualmente.')
    } catch (error) {
      setMessage(error instanceof Error ? `Falha na detecção local: ${error.message}` : 'Falha na detecção local.')
    } finally {
      setDetecting(false)
    }
  }

  const acceptTrack = (id: string) => setTracks(prev => prev.map(track => track.id === id ? { ...track, accepted: true } : track))

  const removeTrack = (id: string) => {
    setTracks(prev => {
      const target = prev.find(track => track.id === id)
      if (target?.source === 'ai-suggestion' && !target.accepted) setRejectedSuggestions(value => value + 1)
      return prev.filter(track => track.id !== id)
    })
    if (selectedTrackId === id) setSelectedTrackId(null)
  }

  const setBoundaryToCurrent = (boundary: 'start' | 'end') => {
    const video = videoRef.current
    if (!video || !selectedTrackId) return
    const timeMs = Math.round(video.currentTime * 1000)
    setTracks(prev => prev.map(track => {
      if (track.id !== selectedTrackId) return track
      if (boundary === 'start') return { ...track, startMs: Math.min(timeMs, track.endMs) }
      return { ...track, endMs: Math.max(timeMs, track.startMs) }
    }))
  }

  const trackSelectedFace = async () => {
    const video = videoRef.current
    const track = selectedTrack
    if (!video || !track || track.kind !== 'face' || track.keyframes.length === 0) return
    setTracking(true)
    setMessage('Rastreando rosto localmente ao longo do vídeo…')
    const started = performance.now()
    const originalTime = video.currentTime
    video.pause()

    try {
      const seed = [...track.keyframes].sort((a, b) => Math.abs(a.timeMs - originalTime * 1000) - Math.abs(b.timeMs - originalTime * 1000))[0]
      const collected: MaskKeyframe[] = [seed]
      let samples = 0

      const follow = async (times: number[], initial: MaskBox) => {
        let previous = initial
        for (const timeMs of times) {
          await seek(video, timeMs / 1000)
          const detected = await detectFacesOnFrame(video)
          samples += 1
          const match = chooseNearest(previous, detected)
          if (!match) continue
          const confidence = detected.find(item => item.x === match.x && item.y === match.y)?.confidence
          const frame: MaskKeyframe = {
            timeMs,
            source: 'ai',
            confidence,
            x: match.x, y: match.y, width: match.width, height: match.height,
          }
          collected.push(frame)
          previous = match
        }
      }

      const forwardTimes: number[] = []
      for (let t = seed.timeMs + TRACK_SAMPLE_MS; t <= durationMs; t += TRACK_SAMPLE_MS) forwardTimes.push(t)
      const backwardTimes: number[] = []
      for (let t = seed.timeMs - TRACK_SAMPLE_MS; t >= 0; t -= TRACK_SAMPLE_MS) backwardTimes.push(t)

      await follow(forwardTimes, seed)
      await follow(backwardTimes, seed)

      const unique = Array.from(new Map(collected.map(frame => [frame.timeMs, frame])).values())
        .sort((a, b) => a.timeMs - b.timeMs)
      const first = unique[0]?.timeMs ?? track.startMs
      const last = unique[unique.length - 1]?.timeMs ?? track.endMs
      setTracks(prev => prev.map(item => item.id === track.id ? {
        ...item,
        accepted: true,
        startMs: first,
        endMs: last,
        keyframes: unique,
      } : item))
      setTrackingSamples(prev => prev + samples)
      setTrackingTimeMs(prev => prev + Math.round(performance.now() - started))
      setMessage(`Rastreamento concluído com ${unique.length} keyframes em ${samples} amostras. Revise a trajetória antes de anonimizar.`)
    } catch (error) {
      setMessage(error instanceof Error ? `Falha no rastreamento temporal: ${error.message}` : 'Falha no rastreamento temporal.')
    } finally {
      await seek(video, originalTime).catch(() => undefined)
      refreshCanvas()
      setTracking(false)
    }
  }

  const processVideo = async () => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return
    const pending = tracks.filter(track => track.source === 'ai-suggestion' && !track.accepted)
    if (pending.length) {
      setMessage(`Revise as ${pending.length} sugestão(ões) pendente(s) antes de gerar o vídeo.`)
      return
    }

    setProcessing(true)
    setProgress(0)
    const sanitizationStarted = performance.now()
    try {
      video.pause()
      await seek(video, 0)
      const ctx = canvas.getContext('2d')!
      drawFrame(ctx, video, canvas, tracks, selectedTrackId)
      const stream = canvas.captureStream(25)
      const mimeCandidates = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']
      const mimeType = mimeCandidates.find(m => MediaRecorder.isTypeSupported(m)) || ''
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      const chunks: BlobPart[] = []
      recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data) }

      const draw = () => {
        if (!video.paused && !video.ended) {
          drawFrame(ctx, video, canvas, tracks, selectedTrackId)
          setProgress(video.duration ? Math.min(100, (video.currentTime / video.duration) * 100) : 0)
          requestAnimationFrame(draw)
        }
      }

      const done = new Promise<Blob>(resolve => {
        recorder.onstop = () => resolve(new Blob(chunks, { type: 'video/webm' }))
      })
      recorder.start(500)
      await video.play()
      requestAnimationFrame(draw)
      await new Promise<void>(resolve => video.addEventListener('ended', () => resolve(), { once: true }))
      recorder.stop()
      const blob = await done
      const suggested = tracks.filter(track => track.source === 'ai-suggestion')
      const metrics: PrivacyMetrics = {
        processing: 'on-device',
        rawVideoUploaded: false,
        faceDetection: suggested.length ? 'automatic-assisted' : 'manual-only',
        humanReviewed: true,
        manualMasks: tracks.filter(track => track.source === 'manual').length,
        suggestedMasks: suggested.length + rejectedSuggestions,
        acceptedSuggestions: suggested.filter(track => track.accepted).length,
        rejectedSuggestions,
        detectionTimeMs,
        sanitizationTimeMs: Math.round(performance.now() - sanitizationStarted),
        temporalTracks: tracks.filter(track => track.accepted).length,
        keyframes: tracks.reduce((total, track) => total + track.keyframes.length, 0),
        trackingSamples,
        trackingTimeMs,
      }
      setProgress(100)
      onSanitized(blob, Math.round(video.duration * 1000), metrics)
      await seek(video, 0)
      refreshCanvas()
    } finally {
      setProcessing(false)
    }
  }

  const pendingCount = tracks.filter(track => track.source === 'ai-suggestion' && !track.accepted).length

  return (
    <section className="panel privacy-panel" aria-labelledby="privacy-title">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Privacidade temporal · v0.3</span>
          <h3 id="privacy-title">Anonimize objetos em movimento</h3>
        </div>
        <span className="privacy-badge">Vídeo bruto local</span>
      </div>

      <p className="muted">
        Cada máscara agora é um track temporal. Keyframes definem posição e tamanho ao longo do vídeo; entre eles, a região é interpolada automaticamente.
      </p>
      <p className="ai-notice">
        Para rostos, o AcessoMap pode amostrar o vídeo localmente a cada {TRACK_SAMPLE_MS} ms e associar detecções consecutivas. O resultado continua sujeito à revisão humana antes da publicação.
      </p>

      <video ref={videoRef} src={sourceUrl} controls playsInline className="source-video"
        onLoadedMetadata={() => {
          const video = videoRef.current
          if (video) setDurationMs(Math.round(video.duration * 1000))
          refreshCanvas()
        }}
        onTimeUpdate={refreshCanvas} onSeeked={refreshCanvas} onPause={refreshCanvas} />

      <div className="redaction-toolbar temporal-toolbar">
        <button type="button" className="ai-action" disabled={detecting || tracking || processing} onClick={detectFaces}>
          {detecting ? 'Detectando rostos…' : 'Sugerir rostos neste frame'}
        </button>
        <label>
          Novo track manual
          <select value={maskKind} onChange={e => setMaskKind(e.target.value as 'face' | 'plate')}>
            <option value="face">Rosto</option>
            <option value="plate">Placa</option>
          </select>
        </label>
        <button type="button" className="secondary" onClick={() => setSelectedTrackId(null)} disabled={!selectedTrackId}>
          Criar novo track
        </button>
      </div>

      <canvas ref={canvasRef} className="redaction-canvas"
        onPointerDown={handlePointerDown} onPointerUp={handlePointerUp}
        aria-label="Área para revisão e criação de keyframes de anonimização" />

      {selectedTrack && (
        <div className="track-editor">
          <strong>Track selecionado: {selectedTrack.kind === 'face' ? 'rosto' : 'placa'}</strong>
          <span>{selectedTrack.keyframes.length} keyframe(s) · {(selectedTrack.startMs / 1000).toFixed(1)}–{(selectedTrack.endMs / 1000).toFixed(1)} s</span>
          <div className="track-actions">
            <button type="button" className="secondary" onClick={() => setBoundaryToCurrent('start')}>Início = frame atual</button>
            <button type="button" className="secondary" onClick={() => setBoundaryToCurrent('end')}>Fim = frame atual</button>
            {selectedTrack.kind === 'face' && (
              <button type="button" className="ai-action" disabled={tracking || processing} onClick={trackSelectedFace}>
                {tracking ? 'Rastreando…' : 'Rastrear rosto no vídeo'}
              </button>
            )}
          </div>
          <small>Para corrigir a trajetória, pause em outro ponto do vídeo e desenhe a caixa novamente com este track selecionado.</small>
        </div>
      )}

      <div className="mask-list" aria-live="polite">
        {tracks.length === 0 && <span>Nenhum track criado.</span>}
        {tracks.map((track, index) => (
          <div className={`mask-item ${track.source === 'ai-suggestion' ? 'suggested' : ''} ${track.id === selectedTrackId ? 'selected' : ''}`} key={track.id}>
            <button type="button" className="track-select" onClick={() => setSelectedTrackId(track.id)}>
              {index + 1}. {track.kind === 'face' ? 'Rosto' : 'Placa'} · {track.source === 'ai-suggestion' ? 'IA' : 'manual'} · {track.keyframes.length} keyframe(s)
            </button>
            <div>
              {track.source === 'ai-suggestion' && !track.accepted && (
                <button type="button" className="mask-accept" onClick={() => acceptTrack(track.id)}>Aceitar</button>
              )}
              <button type="button" className="mask-remove" onClick={() => removeTrack(track.id)}>
                {track.source === 'ai-suggestion' && !track.accepted ? 'Descartar' : 'Remover'}
              </button>
            </div>
          </div>
        ))}
      </div>

      {pendingCount > 0 && <div className="review-warning">{pendingCount} sugestão(ões) de IA aguardando revisão.</div>}
      {message && <div className="status-message compact" role="status">{message}</div>}
      {processing && <progress max={100} value={progress}>{progress}%</progress>}
      <button type="button" className="primary full" onClick={processVideo} disabled={processing || tracking || pendingCount > 0}>
        {processing ? `Gerando vídeo anonimizado… ${Math.round(progress)}%` : 'Gerar vídeo anonimizado com tracks temporais'}
      </button>
    </section>
  )
}
