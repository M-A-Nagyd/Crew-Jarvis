import { useEffect, useState } from 'react'

const audioConstraints = {
  audio: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  },
}

/**
 * Single shared MediaStream for clap detection + MediaRecorder (Groq path).
 * Stops tracks when disabled or unmounted.
 */
export function useMicStream(enabled) {
  const [stream, setStream] = useState(null)

  useEffect(() => {
    if (!enabled || typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setStream((prev) => {
        prev?.getTracks().forEach((t) => t.stop())
        return null
      })
      return undefined
    }

    let cancelled = false
    navigator.mediaDevices
      .getUserMedia(audioConstraints)
      .then((s) => {
        if (!cancelled) setStream(s)
        else s.getTracks().forEach((t) => t.stop())
      })
      .catch(() => {
        if (!cancelled) setStream(null)
      })

    return () => {
      cancelled = true
      setStream((prev) => {
        prev?.getTracks().forEach((t) => t.stop())
        return null
      })
    }
  }, [enabled])

  return stream
}
