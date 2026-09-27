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
  temporalTracks: number
  keyframes: number
  trackingSamples: number
  trackingTimeMs: number
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

export type MaskBox = {
  x: number
  y: number
  width: number
  height: number
}

export type MaskKeyframe = MaskBox & {
  timeMs: number
  confidence?: number
  source: 'manual' | 'ai'
}

export type PrivacyTrack = {
  id: string
  kind: 'face' | 'plate'
  source: 'manual' | 'ai-suggestion'
  accepted: boolean
  startMs: number
  endMs: number
  keyframes: MaskKeyframe[]
}

export type PrivacyMask = MaskBox & {
  id: string
  kind: 'face' | 'plate'
  source: 'manual' | 'ai-suggestion'
  accepted: boolean
  confidence?: number
}
