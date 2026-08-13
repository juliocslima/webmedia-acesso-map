import { Fragment, useEffect, useState } from 'react'
import { Circle, MapContainer, Marker, Popup, TileLayer } from 'react-leaflet'
import { apiUrl, getReports, validateReport } from '../api'
import type { ReportItem } from '../types'

type Props = {
  refreshKey: number
}

const DEFAULT_CENTER: [number, number] = [-21.245, -44.999]

export default function MapView({ refreshKey }: Props) {
  const [reports, setReports] = useState<ReportItem[]>([])
  const [message, setMessage] = useState('')

  const load = () => getReports().then(setReports).catch(e => setMessage(e.message))

  useEffect(() => { load() }, [refreshKey])

  const vote = async (id: string, value: 'confirm' | 'dispute') => {
    try {
      await validateReport(id, value)
      setMessage(value === 'confirm' ? 'Validação registrada.' : 'Contestação registrada.')
      load()
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Falha na validação')
    }
  }

  const center: [number, number] = reports[0] ? [reports[0].lat, reports[0].lon] : DEFAULT_CENTER

  return (
    <main className="map-layout">
      <section className="map-header">
        <div>
          <span className="eyebrow">Crowdsensing urbano</span>
          <h2>Mapa colaborativo de barreiras</h2>
          <p>{reports.length} ocorrência(s) publicadas nesta instância.</p>
        </div>
        <div className="export-actions">
          <a href={apiUrl('/api/exports/geojson')} className="secondary-link">GeoJSON</a>
          <a href={apiUrl('/api/exports/csv')} className="secondary-link">CSV</a>
        </div>
      </section>

      {message && <div className="status-message compact" role="status">{message}</div>}

      <div className="map-frame">
        <MapContainer center={center} zoom={15} scrollWheelZoom className="map">
          <TileLayer
            attribution='&copy; OpenStreetMap contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {reports.map(report => (
            <Fragment key={report.id}>
              <Circle
                center={[report.lat, report.lon]}
                radius={report.location_precision_m / 2}
                pathOptions={{ fillOpacity: 0.08, opacity: 0.35 }}
              />
              <Marker position={[report.lat, report.lon]}>
                <Popup minWidth={270}>
                  <article className="popup-card">
                    <strong>{report.category_label}</strong>
                    {report.description && <p>{report.description}</p>}
                    <video src={apiUrl(report.video_url)} controls playsInline preload="metadata" />
                    <small>
                      Trecho: {(report.start_ms / 1000).toFixed(1)}–{(report.end_ms / 1000).toFixed(1)} s · localização ~{report.location_precision_m} m
                    </small>
                    <div className="validation-row">
                      <button onClick={() => vote(report.id, 'confirm')}>Confirmar ({report.validations.confirms})</button>
                      <button onClick={() => vote(report.id, 'dispute')}>Contestar ({report.validations.disputes})</button>
                    </div>
                  </article>
                </Popup>
              </Marker>
            </Fragment>
          ))}
        </MapContainer>
      </div>
    </main>
  )
}
