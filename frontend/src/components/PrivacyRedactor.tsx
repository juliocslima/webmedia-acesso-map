import { useEffect, useRef, useState } from 'react'
import type { PrivacyMask } from '../types'

type Props = {
  file: File
  onSanitized: (blob: Blob, durationMs: number) => void
}

function drawMaskedFrame(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  masks: PrivacyMask[],
) {
  ctx.filter = 'none'
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
  for (const mask of masks) {
    const x = mask.x * canvas.width
    const y = mask.y * canvas.height
    const w = mask.width * canvas.width
    const h = mask.height * canvas.height
    ctx.save()
    ctx.beginPath()
    ctx.rect(x, y, w, h)
    ctx.clip()
    ctx.filter = 'blur(22px)'
    const pad = 24
    ctx.drawImage(
      video,
      Math.max(0, x - pad),
      Math.max(0, y - pad),
      Math.min(canvas.width - x + pad, w + 2 * pad),
      Math.min(canvas.height - y + pad, h + 2 * pad),
      Math.max(0, x - pad),
      Math.max(0, y - pad),
      Math.min(canvas.width - x + pad, w + 2 * pad),
      Math.min(canvas.height - y + pad, h + 2 * pad),
    )
    ctx.restore()
    ctx.strokeStyle = mask.kind === 'face' ? '#1d6f7a' : '#7d4b18'
    ctx.lineWidth = 3
    ctx.strokeRect(x, y, w, h)
  }
}

export default function PrivacyRedactor({ file, onSanitized }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [sourceUrl, setSourceUrl] = useState('')
  const [masks, setMasks] = useState<PrivacyMask[]>([])
  const [maskKind, setMaskKind] = useState<'face' | 'plate'>('face')
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null)
  const [processing, setProcessing] = useState(false)
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    const url = URL.createObjectURL(file)
    setSourceUrl(url)
    setMasks([])
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
    if (!ctx) return
    drawMaskedFrame(ctx, video, canvas, masks)
  }

  useEffect(refreshCanvas, [masks])

  const pointFromEvent = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
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
      setMasks(prev => [...prev, { id: crypto.randomUUID(), kind: maskKind, x, y, width, height }])
    }
    setDragStart(null)
  }

  const processVideo = async () => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return
    setProcessing(true)
    setProgress(0)

    try {
      video.pause()
      video.currentTime = 0
      await new Promise<void>(resolve => {
        const handler = () => {
          video.removeEventListener('seeked', handler)
          resolve()
        }
        video.addEventListener('seeked', handler)
      })
      refreshCanvas()

      const stream = canvas.captureStream(25)
      const mimeCandidates = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']
      const mimeType = mimeCandidates.find(m => MediaRecorder.isTypeSupported(m)) || ''
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      const chunks: BlobPart[] = []
      recorder.ondataavailable = event => {
        if (event.data.size) chunks.push(event.data)
      }

      const ctx = canvas.getContext('2d')!
      const draw = () => {
        if (!video.paused && !video.ended) {
          drawMaskedFrame(ctx, video, canvas, masks)
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
      setProgress(100)
      onSanitized(blob, Math.round(video.duration * 1000))
      video.currentTime = 0
      refreshCanvas()
    } finally {
      setProcessing(false)
    }
  }

  return (
    <section className="panel privacy-panel" aria-labelledby="privacy-title">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Privacidade no dispositivo</span>
          <h3 id="privacy-title">Anonimize antes de enviar</h3>
        </div>
        <span className="privacy-badge">Vídeo bruto local</span>
      </div>

      <p className="muted">
        Pause no frame desejado e arraste sobre rostos ou placas. Nesta v0.1, as máscaras permanecem na mesma região durante todo o vídeo.
      </p>

      <video
        ref={videoRef}
        src={sourceUrl}
        controls
        playsInline
        className="source-video"
        onLoadedMetadata={refreshCanvas}
        onSeeked={refreshCanvas}
        onPause={refreshCanvas}
      />

      <div className="redaction-toolbar">
        <label>
          Tipo da máscara
          <select value={maskKind} onChange={e => setMaskKind(e.target.value as 'face' | 'plate')}>
            <option value="face">Rosto</option>
            <option value="plate">Placa</option>
          </select>
        </label>
        <button type="button" className="secondary" disabled={!masks.length || processing} onClick={() => setMasks([])}>
          Limpar máscaras
        </button>
      </div>

      <canvas
        ref={canvasRef}
        className="redaction-canvas"
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        aria-label="Área para marcação das regiões que devem ser borradas"
      />

      <div className="mask-list" aria-live="polite">
        {masks.length === 0 ? <span>Nenhuma máscara criada.</span> : <span>{masks.length} máscara(s) pronta(s).</span>}
      </div>

      {processing && <progress max={100} value={progress}>{progress}%</progress>}
      <button type="button" className="primary full" onClick={processVideo} disabled={processing}>
        {processing ? `Gerando vídeo anonimizado… ${Math.round(progress)}%` : 'Gerar vídeo anonimizado no dispositivo'}
      </button>
    </section>
  )
}
