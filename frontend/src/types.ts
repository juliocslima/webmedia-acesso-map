export type Category = {
  id: string
  label: string
}

export type ValidationSummary = {
  confirms: number
  disputes: number
  confidence: number | null
}

export type PrivacyMetrics = {
  processing: 'on-device'
  rawVideoUploaded: false
  faceDetection: 'automatic-assisted' | 'manual-only'
  humanReviewed: boolean
  manualMasks: number
  suggestedMasks: number
  acceptedSuggestions: number
  rejectedSuggestions: number
  detectionTimeMs: number
  sanitizationTimeMs: number
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
  privacy_metrics?: PrivacyMetrics | null
  created_at: string
  status: string
  video_url: string
  validations: ValidationSummary
}

export type PrivacyMask = {
  id: string
  kind: 'face' | 'plate'
  source: 'manual' | 'ai-suggestion'
  accepted: boolean
  confidence?: number
  x: number
  y: number
  width: number
  height: number
}
