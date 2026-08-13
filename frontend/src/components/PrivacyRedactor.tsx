import { useEffect, useRef, useState } from 'react'
import { detectFacesOnFrame } from '../faceDetection'
import type { PrivacyMask, PrivacyMetrics } from '../types'

type Props = {
  file: File
  onSanitized: (blob: Blob, durationMs: number, metrics: PrivacyMetrics) => void
}

function drawFrame(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  masks: PrivacyMask[],
  reviewMode = false,
) {
  ctx.filter = 'none'
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

  for (const mask of masks) {
    if (!reviewMode && !mask.accepted) continue
    const x = mask.x * canvas.width
    const y = mask.y * canvas.height
    const w = mask.width * canvas.width
    const h = mask.height * canvas.height

    if (mask.accepted) {
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
    ctx.lineWidth = mask.source === 'ai-suggestion' && !mask.accepted ? 4 : 3
    ctx.setLineDash(mask.source === 'ai-suggestion' && !mask.accepted ? [8, 6] : [])
    ctx.strokeStyle = mask.source === 'ai-suggestion' && !mask.accepted
      ? '#c47a14'
      : mask.kind === 'face' ? '#1d6f7a' : '#7d4b18'
    ctx.strokeRect(x, y, w, h)
    ctx.restore()
  }
}

export default function PrivacyRedactor({ file, onSanitized }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [sourceUrl, setSourceUrl] = useState('')
  const [masks, setMasks] = useState<PrivacyMask[]>([])
  const [rejectedSuggestions, setRejectedSuggestions] = useState(0)
  const [maskKind, setMaskKind] = useState<'face' | 'plate'>('face')
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null)
  const [processing, setProcessing] = useState(false)
  const [detecting, setDetecting] = useState(false)
  const [detectionTimeMs, setDetectionTimeMs] = useState(0)
  const [progress, setProgress] = useState(0)
  const [message, setMessage] = useState('')

  useEffect(() => {
    const url = URL.createObjectURL(file)
    setSourceUrl(url)
    setMasks([])
    setRejectedSuggestions(0)
    setDetectionTimeMs(0)
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
    if (ctx) drawFrame(ctx, video, canvas, masks, true)
  }

  useEffect(refreshCanvas, [masks])

  const pointFromEvent = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    return {
      x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
    }
  }

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    setDragStart(pointFromEvent(e))
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragStart) return
    const end = pointFromEvent(e)
    const x = Math.min(dragStart.x, end.x)
    const y = Math.min(dragStart.y, end.y)
    const width = Math.abs(end.x - dragStart.x)
    const height = Math.abs(end.y - dragStart.y)
    if (width > 0.015 && height > 0.015) {
      setMasks(prev => [...prev, {
        id: crypto.randomUUID(), kind: maskKind, source: 'manual', accepted: true,
        x, y, width, height,
      }])
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
      const suggestions = await detectFacesOnFrame(video)
      setDetectionTimeMs(prev => prev + Math.round(performance.now() - started))
      setMasks(prev => [...prev, ...suggestions])
      setMessage(suggestions.length
        ? `${suggestions.length} rosto(s) sugerido(s) pela IA neste frame. Revise cada sugestão.`
        : 'Nenhum rosto detectado neste frame. Você ainda pode criar máscaras manualmente.')
    } catch (error) {
      setMessage(error instanceof Error ? `Falha na detecção local: ${error.message}` : 'Falha na detecção local.')
    } finally {
      setDetecting(false)
    }
  }

  const acceptMask = (id: string) => setMasks(prev => prev.map(mask => mask.id === id ? { ...mask, accepted: true } : mask))
  const removeMask = (id: string) => {
    setMasks(prev => {
      const target = prev.find(mask => mask.id === id)
      if (target?.source === 'ai-suggestion' && !target.accepted) setRejectedSuggestions(value => value + 1)
      return prev.filter(mask => mask.id !== id)
    })
  }

  const processVideo = async () => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return
    const pending = masks.filter(mask => mask.source === 'ai-suggestion' && !mask.accepted)
    if (pending.length) {
      setMessage(`Revise as ${pending.length} sugestão(ões) pendente(s) antes de gerar o vídeo.`)
      return
    }

    setProcessing(true)
    setProgress(0)
    const sanitizationStarted = performance.now()
    try {
      video.pause()
      video.currentTime = 0
      await new Promise<void>(resolve => {
        const handler = () => { video.removeEventListener('seeked', handler); resolve() }
        video.addEventListener('seeked', handler)
      })

      const ctx = canvas.getContext('2d')!
      drawFrame(ctx, video, canvas, masks)
      const stream = canvas.captureStream(25)
      const mimeCandidates = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']
      const mimeType = mimeCandidates.find(m => MediaRecorder.isTypeSupported(m)) || ''
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      const chunks: BlobPart[] = []
      recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data) }

      const draw = () => {
        if (!video.paused && !video.ended) {
          drawFrame(ctx, video, canvas, masks)
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
      const suggested = masks.filter(mask => mask.source === 'ai-suggestion')
      const metrics: PrivacyMetrics = {
        processing: 'on-device',
        rawVideoUploaded: false,
        faceDetection: suggested.length ? 'automatic-assisted' : 'manual-only',
        humanReviewed: true,
        manualMasks: masks.filter(mask => mask.source === 'manual').length,
        suggestedMasks: suggested.length + rejectedSuggestions,
        acceptedSuggestions: suggested.filter(mask => mask.accepted).length,
        rejectedSuggestions,
        detectionTimeMs,
        sanitizationTimeMs: Math.round(performance.now() - sanitizationStarted),
      }
      setProgress(100)
      onSanitized(blob, Math.round(video.duration * 1000), metrics)
      video.currentTime = 0
      refreshCanvas()
    } finally {
      setProcessing(false)
    }
  }

  const pendingCount = masks.filter(mask => mask.source === 'ai-suggestion' && !mask.accepted).length

  return (
    <section className="panel privacy-panel" aria-labelledby="privacy-title">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Privacidade assistida por IA</span>
          <h3 id="privacy-title">Anonimize antes de enviar</h3>
        </div>
        <span className="privacy-badge">Vídeo bruto local</span>
      </div>

      <p className="muted">
        Pause em um frame e peça sugestões de rostos ou desenhe máscaras manualmente. A IA apenas sugere: você decide o que será anonimizado.
      </p>
      <p className="ai-notice">
        O frame é processado no dispositivo pelo MediaPipe. Na primeira utilização, componentes do modelo são baixados; a biblioteca pode enviar métricas técnicas de uso/desempenho, mas não envia o vídeo ou os frames de entrada ao serviço do modelo.
      </p>

      <video ref={videoRef} src={sourceUrl} controls playsInline className="source-video"
        onLoadedMetadata={refreshCanvas} onSeeked={refreshCanvas} onPause={refreshCanvas} />

      <div className="redaction-toolbar">
        <button type="button" className="ai-action" disabled={detecting || processing} onClick={detectFaces}>
          {detecting ? 'Detectando rostos…' : 'Sugerir rostos neste frame'}
        </button>
        <label>
          Máscara manual
          <select value={maskKind} onChange={e => setMaskKind(e.target.value as 'face' | 'plate')}>
            <option value="face">Rosto</option>
            <option value="plate">Placa</option>
          </select>
        </label>
      </div>

      <canvas ref={canvasRef} className="redaction-canvas"
        onPointerDown={handlePointerDown} onPointerUp={handlePointerUp}
        aria-label="Área para revisão e marcação das regiões que devem ser borradas" />

      <div className="mask-list" aria-live="polite">
        {masks.length === 0 && <span>Nenhuma máscara criada.</span>}
        {masks.map((mask, index) => (
          <div className={`mask-item ${mask.source === 'ai-suggestion' ? 'suggested' : ''}`} key={mask.id}>
            <span>
              {index + 1}. {mask.kind === 'face' ? 'Rosto' : 'Placa'} · {mask.source === 'ai-suggestion' ? 'IA' : 'manual'}
              {mask.confidence !== undefined ? ` · ${Math.round(mask.confidence * 100)}%` : ''}
            </span>
            <div>
              {mask.source === 'ai-suggestion' && !mask.accepted && (
                <button type="button" className="mask-accept" onClick={() => acceptMask(mask.id)}>Aceitar</button>
              )}
              <button type="button" className="mask-remove" onClick={() => removeMask(mask.id)}>
                {mask.source === 'ai-suggestion' && !mask.accepted ? 'Descartar' : 'Remover'}
              </button>
            </div>
          </div>
        ))}
      </div>

      {pendingCount > 0 && <div className="review-warning">{pendingCount} sugestão(ões) de IA aguardando revisão.</div>}
      {message && <div className="status-message compact" role="status">{message}</div>}
      {processing && <progress max={100} value={progress}>{progress}%</progress>}
      <button type="button" className="primary full" onClick={processVideo} disabled={processing || pendingCount > 0}>
        {processing ? `Gerando vídeo anonimizado… ${Math.round(progress)}%` : 'Gerar vídeo anonimizado após revisão'}
      </button>
    </section>
  )
}
