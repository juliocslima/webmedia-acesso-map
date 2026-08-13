import { useState } from 'react'
import MapView from './components/MapView'
import ReportForm from './components/ReportForm'

export default function App() {
  const [tab, setTab] = useState<'map' | 'report'>('map')
  const [refreshKey, setRefreshKey] = useState(0)

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-block">
          <div className="brand-mark" aria-hidden="true">A</div>
          <div>
            <strong>AcessoMap Video</strong>
            <span>barreiras urbanas · privacidade por design</span>
          </div>
        </div>
        <nav className="tabs" aria-label="Navegação principal">
          <button className={tab === 'map' ? 'active' : ''} onClick={() => setTab('map')}>Mapa</button>
          <button className={tab === 'report' ? 'active' : ''} onClick={() => setTab('report')}>Registrar barreira</button>
        </nav>
      </header>

      {tab === 'map' ? (
        <MapView refreshKey={refreshKey} />
      ) : (
        <ReportForm onCreated={() => {
          setRefreshKey(v => v + 1)
          setTab('map')
        }} />
      )}

      <footer>
        <strong>Privacy-aware crowdsensing</strong>
        <span>O vídeo bruto não é enviado ao servidor nesta versão.</span>
      </footer>
    </div>
  )
}
