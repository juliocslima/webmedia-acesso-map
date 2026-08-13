import { useEffect, useMemo, useState } from 'react'
import { createReport, getCategories } from '../api'
import type { Category } from '../types'
import PrivacyRedactor from './PrivacyRedactor'

type Props = {
  onCreated: () => void
}

function quantizeLocation(lat: number, lon: number, meters = 50) {
  const latStep = meters / 111_320
  const lonScale = Math.max(0.2, Math.cos((lat * Math.PI) / 180))
  const lonStep = meters / (111_320 * lonScale)
  return {
    lat: Math.round(lat / latStep) * latStep,
    lon: Math.round(lon / lonStep) * lonStep,
    precision: meters,
  }
}

export default function ReportForm({ onCreated }: Props) {
  const [categories, setCategories] = useState<Category[]>([])
  const [category, setCategory] = useState('')
  const [description, setDescription] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [sanitizedBlob, setSanitizedBlob] = useState<Blob | null>(null)
  const [sanitizedUrl, setSanitizedUrl] = useState('')
  const [durationMs, setDurationMs] = useState(0)
  const [startMs, setStartMs] = useState(0)
  const [endMs, setEndMs] = useState(0)
  const [location, setLocation] = useState<{ lat: number; lon: number; precision: number } | null>(null)
  const [locating, setLocating] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    getCategories().then(items => {
      setCategories(items)
      if (items[0]) setCategory(items[0].id)
    }).catch(e => setMessage(e.message))
  }, [])

  useEffect(() => () => {
    if (sanitizedUrl) URL.revokeObjectURL(sanitizedUrl)
  }, [sanitizedUrl])

  const maxSeconds = useMemo(() => Math.max(1, Math.ceil(durationMs / 1000)), [durationMs])

  const chooseFile = (next: File | null) => {
    setFile(next)
    setSanitizedBlob(null)
    setSanitizedUrl('')
    setDurationMs(0)
    setStartMs(0)
    setEndMs(0)
    setMessage('')
  }

  const onSanitized = (blob: Blob, duration: number) => {
    if (sanitizedUrl) URL.revokeObjectURL(sanitizedUrl)
    const url = URL.createObjectURL(blob)
    setSanitizedBlob(blob)
    setSanitizedUrl(url)
    setDurationMs(duration)
    setStartMs(0)
    setEndMs(duration)
    setMessage('Vídeo anonimizado gerado localmente. Revise antes de publicar.')
  }

  const getLocation = () => {
    if (!navigator.geolocation) {
      setMessage('Geolocalização indisponível neste navegador.')
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      pos => {
        setLocation(quantizeLocation(pos.coords.latitude, pos.coords.longitude, 50))
        setLocating(false)
        setMessage('Localização aproximada calculada. A coordenada exata não será enviada.')
      },
      err => {
        setLocating(false)
        setMessage(`Não foi possível obter a localização: ${err.message}`)
      },
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 30_000 },
    )
  }

  const publish = async () => {
    if (!file || !sanitizedBlob || !location || !category) {
      setMessage('Complete vídeo anonimizado, categoria e localização antes de publicar.')
      return
    }
    setPublishing(true)
    setMessage('')
    try {
      const form = new FormData()
      form.append('category', category)
      form.append('description', description)
      form.append('start_ms', String(startMs))
      form.append('end_ms', String(endMs))
      form.append('lat', String(location.lat))
      form.append('lon', String(location.lon))
      form.append('location_precision_m', String(location.precision))
      form.append('duration_ms', String(durationMs))
      form.append('privacy_reviewed', 'true')
      form.append('video', new File([sanitizedBlob], 'sanitized.webm', { type: 'video/webm' }))
      await createReport(form)
      setMessage('Ocorrência publicada com sucesso.')
      setDescription('')
      chooseFile(null)
      setLocation(null)
      onCreated()
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Falha ao publicar')
    } finally {
      setPublishing(false)
    }
  }

  return (
    <main className="content-grid">
      <section className="intro-card">
        <span className="eyebrow">Novo registro</span>
        <h2>Documente uma barreira sem expor pessoas</h2>
        <p>O fluxo foi desenhado para que o vídeo original permaneça no dispositivo e apenas a cópia revisada seja publicada.</p>
      </section>

      <section className="panel">
        <h3>1. Vídeo e categoria</h3>
        <label className="field">
          Vídeo curto
          <input
            type="file"
            accept="video/*"
            capture="environment"
            onChange={e => chooseFile(e.target.files?.[0] || null)}
          />
          <small>Em celulares compatíveis, você poderá gravar com a câmera ou escolher um arquivo.</small>
        </label>

        <label className="field">
          Categoria da barreira
          <select value={category} onChange={e => setCategory(e.target.value)}>
            {categories.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </label>

        <label className="field">
          Observação opcional
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            maxLength={280}
            placeholder="Ex.: rampa interrompida por degrau e poste."
          />
        </label>
      </section>

      {file && <PrivacyRedactor file={file} onSanitized={onSanitized} />}

      {sanitizedUrl && (
        <section className="panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Revisão obrigatória</span>
              <h3>2. Confira a versão que será enviada</h3>
            </div>
          </div>
          <video src={sanitizedUrl} controls playsInline className="source-video" />

          <div className="range-grid">
            <label>
              Início da barreira: {(startMs / 1000).toFixed(1)} s
              <input
                type="range"
                min={0}
                max={durationMs}
                step={100}
                value={startMs}
                onChange={e => setStartMs(Math.min(Number(e.target.value), endMs))}
              />
            </label>
            <label>
              Fim da barreira: {(endMs / 1000).toFixed(1)} s
              <input
                type="range"
                min={0}
                max={durationMs}
                step={100}
                value={endMs}
                onChange={e => setEndMs(Math.max(Number(e.target.value), startMs))}
              />
            </label>
          </div>
          <small>Duração aproximada do vídeo: {maxSeconds} s.</small>
        </section>
      )}

      <section className="panel">
        <h3>3. Localização aproximada</h3>
        <p className="muted">A posição é arredondada para uma grade de aproximadamente 50 metros antes de sair do navegador.</p>
        <button type="button" className="secondary" onClick={getLocation} disabled={locating}>
          {locating ? 'Obtendo localização…' : 'Usar minha localização aproximada'}
        </button>
        {location && (
          <div className="location-preview" aria-live="polite">
            <strong>Precisão publicada:</strong> ~{location.precision} m<br />
            {location.lat.toFixed(5)}, {location.lon.toFixed(5)}
          </div>
        )}
      </section>

      {message && <div className="status-message" role="status">{message}</div>}

      <button type="button" className="primary publish-button" onClick={publish} disabled={publishing || !sanitizedBlob || !location}>
        {publishing ? 'Publicando…' : 'Publicar ocorrência revisada'}
      </button>
    </main>
  )
}
