import { useRef, useCallback } from 'react'

function pickRecorderMime() {
  if (typeof MediaRecorder === 'undefined') return ''
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported(c)) return c
  }
  return ''
}

/**
 * Records from a shared MediaStream; start/stop for Groq upload on clap.
 */
export function useVoiceRecording(mediaStream) {
  const recorderRef = useRef(null)
  const chunksRef = useRef([])
  const mimeRef = useRef('')

  const start = useCallback(() => {
    if (!mediaStream || typeof MediaRecorder === 'undefined') return false
    chunksRef.current = []
    const mime = pickRecorderMime()
    mimeRef.current = mime
    let rec
    try {
      rec = mime ? new MediaRecorder(mediaStream, { mimeType: mime }) : new MediaRecorder(mediaStream)
    } catch {
      return false
    }
    rec.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data)
    }
    const sliceMs = 100
    try {
      rec.start(sliceMs)
    } catch {
      return false
    }
    recorderRef.current = rec
    return true
  }, [mediaStream])

  const stop = useCallback(() => {
    const rec = recorderRef.current
    if (!rec || rec.state === 'inactive') {
      recorderRef.current = null
      return Promise.resolve(null)
    }
    return new Promise((resolve) => {
      rec.onstop = () => {
        const type = rec.mimeType || mimeRef.current || 'audio/webm'
        const blob =
          chunksRef.current.length > 0 ? new Blob(chunksRef.current, { type }) : null
        chunksRef.current = []
        recorderRef.current = null
        resolve(blob)
      }
      try {
        rec.stop()
      } catch {
        recorderRef.current = null
        resolve(null)
      }
    })
  }, [])

  const isRecording = useCallback(() => {
    const rec = recorderRef.current
    return Boolean(rec && rec.state === 'recording')
  }, [])

  return { start, stop, isRecording }
}
