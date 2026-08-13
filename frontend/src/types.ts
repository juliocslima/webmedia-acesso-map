export type Category = {
  id: string
  label: string
}

export type ValidationSummary = {
  confirms: number
  disputes: number
  confidence: number | null
}

export type ReportItem = {
  id: string
  category: string
  category_label: string
  description: string
  start_ms: number
  end_ms: number
  lat: number
  lon: number
  location_precision_m: number
  duration_ms: number
  privacy_reviewed: boolean
  created_at: string
  status: string
  video_url: string
  validations: ValidationSummary
}

export type PrivacyMask = {
  id: string
  kind: 'face' | 'plate'
  x: number
  y: number
  width: number
  height: number
}
