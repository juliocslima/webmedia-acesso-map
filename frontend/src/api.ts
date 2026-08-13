import type { Category, ReportItem } from './types'

const API = import.meta.env.VITE_API_URL || '/api'

export async function getCategories(): Promise<Category[]> {
  const res = await fetch(`${API}/categories`)
  if (!res.ok) throw new Error('Falha ao carregar categorias')
  return (await res.json()).items
}

export async function getReports(): Promise<ReportItem[]> {
  const res = await fetch(`${API}/reports`)
  if (!res.ok) throw new Error('Falha ao carregar ocorrências')
  return (await res.json()).items
}

export async function createReport(form: FormData): Promise<ReportItem> {
  const res = await fetch(`${API}/reports`, { method: 'POST', body: form })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.detail || 'Falha ao publicar ocorrência')
  }
  return res.json()
}

export async function validateReport(reportId: string, vote: 'confirm' | 'dispute') {
  let token = localStorage.getItem('acessomap-voter-token')
  if (!token) {
    token = crypto.randomUUID()
    localStorage.setItem('acessomap-voter-token', token)
  }
  const res = await fetch(`${API}/reports/${reportId}/validate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ vote, voter_token: token }),
  })
  if (!res.ok) throw new Error('Não foi possível registrar a validação')
  return res.json()
}

export function apiUrl(path: string) {
  if (path.startsWith('/api/')) return `${API}${path.slice(4)}`
  return path
}
