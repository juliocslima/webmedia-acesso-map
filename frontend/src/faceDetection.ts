import { FaceDetector, FilesetResolver } from '@mediapipe/tasks-vision'
import type { PrivacyMask } from './types'

const WASM_ROOT = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm'
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite'

let detectorPromise: Promise<FaceDetector> | null = null

async function getDetector(): Promise<FaceDetector> {
  if (!detectorPromise) {
    detectorPromise = (async () => {
      const vision = await FilesetResolver.forVisionTasks(WASM_ROOT)
      return FaceDetector.createFromOptions(vision, {
        baseOptions: { modelAssetPath: MODEL_URL },
        runningMode: 'IMAGE',
        minDetectionConfidence: 0.5,
        minSuppressionThreshold: 0.3,
      })
    })()
  }
  return detectorPromise
}

export async function detectFacesOnFrame(video: HTMLVideoElement): Promise<PrivacyMask[]> {
  if (!video.videoWidth || !video.videoHeight) return []

  const detector = await getDetector()
  const result = detector.detect(video)

  return result.detections.flatMap(detection => {
    const box = detection.boundingBox
    if (!box) return []

    const confidence = detection.categories?.[0]?.score ?? undefined
    const paddingX = box.width * 0.12
    const paddingY = box.height * 0.18
    const x = Math.max(0, (box.originX - paddingX) / video.videoWidth)
    const y = Math.max(0, (box.originY - paddingY) / video.videoHeight)
    const width = Math.min(1 - x, (box.width + paddingX * 2) / video.videoWidth)
    const height = Math.min(1 - y, (box.height + paddingY * 2) / video.videoHeight)

    return [{
      id: crypto.randomUUID(),
      kind: 'face' as const,
      source: 'ai-suggestion' as const,
      accepted: false,
      confidence,
      x,
      y,
      width,
      height,
    }]
  })
}
