import { useMemo, useRef, useState, useCallback } from 'react'

/**
 * Web Speech API (Chrome/Edge).
 * Long sessions: the browser often ends recognition after a short pause; we restart
 * while shouldKeepAlive() is true so the listening window stays open.
 */
export function useSpeechRecognition() {
  const [listening, setListening] = useState(false)
  const [interim, setInterim] = useState('')
  const [error, setError] = useState(null)
  const activeRef = useRef(null)
  const lastInterimRef = useRef('')
  /** Mirrors lastInterimRef for synchronous reads (e.g. onClap before re-render). */
  const interimRef = useRef('')
  const lastFlushedInterimRef = useRef('')
  const keepAliveRef = useRef(null)
  const onFinalChunkRef = useRef(null)
  const reconnectTimerRef = useRef(null)
  const bootRecognitionRef = useRef(() => {})

  const RecognitionCtor = useMemo(() => {
    if (typeof window === 'undefined') return null
    return window.SpeechRecognition || window.webkitSpeechRecognition || null
  }, [])

  const supported = Boolean(RecognitionCtor)

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current)
      reconnectTimerRef.current = null
    }
  }, [])

  const stop = useCallback(() => {
    clearReconnectTimer()
    keepAliveRef.current = null
    onFinalChunkRef.current = null
    const rec = activeRef.current
    if (rec) {
      try {
        rec.stop()
      } catch {
        /* ignore */
      }
      activeRef.current = null
    }
    setListening(false)
    setInterim('')
    lastInterimRef.current = ''
    interimRef.current = ''
    lastFlushedInterimRef.current = ''
  }, [clearReconnectTimer])

  const getInterim = useCallback(() => interimRef.current, [])

  bootRecognitionRef.current = () => {
    if (!RecognitionCtor) return
    const rec = new RecognitionCtor()
    activeRef.current = rec
    rec.continuous = true
    rec.interimResults = true
    rec.lang = 'en-US'

    rec.onresult = (event) => {
      let interimText = ''
      let finalText = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const chunk = event.results[i][0].transcript
        if (event.results[i].isFinal) finalText += chunk
        else interimText += chunk
      }
      lastInterimRef.current = interimText
      interimRef.current = interimText
      setInterim(interimText)
      if (finalText.trim() && onFinalChunkRef.current) {
        onFinalChunkRef.current(finalText.trim())
      }
    }

    rec.onerror = (e) => {
      if (e.error === 'aborted') return
      if (e.error === 'no-speech') return
      setError(e.error || 'speech_error')
      if (e.error === 'not-allowed') {
        stop()
      }
    }

    rec.onend = () => {
      activeRef.current = null
      const should = keepAliveRef.current?.()
      if (should) {
        const tail = lastInterimRef.current?.trim()
        if (tail && tail !== lastFlushedInterimRef.current && onFinalChunkRef.current) {
          lastFlushedInterimRef.current = tail
          onFinalChunkRef.current(tail)
        }
        lastInterimRef.current = ''
        interimRef.current = ''
        setInterim('')
        reconnectTimerRef.current = setTimeout(() => {
          reconnectTimerRef.current = null
          if (keepAliveRef.current?.()) {
            try {
              bootRecognitionRef.current()
            } catch {
              setListening(false)
            }
          } else {
            setListening(false)
          }
        }, 150)
      } else {
        setListening(false)
        setInterim('')
        lastInterimRef.current = ''
        interimRef.current = ''
        lastFlushedInterimRef.current = ''
      }
    }

    try {
      rec.start()
      setListening(true)
    } catch {
      setError('start_failed')
      setListening(false)
    }
  }

  const start = useCallback(
    (onFinalChunk, options = {}) => {
      const { shouldKeepAlive } = options
      if (!RecognitionCtor) {
        setError('not_supported')
        return
      }
      setError(null)
      stop()

      lastFlushedInterimRef.current = ''
      onFinalChunkRef.current = onFinalChunk
      keepAliveRef.current = typeof shouldKeepAlive === 'function' ? shouldKeepAlive : null

      bootRecognitionRef.current()
    },
    [RecognitionCtor, stop]
  )

  const clearError = useCallback(() => setError(null), [])

  return {
    supported,
    listening,
    interim,
    error,
    start,
    stop,
    clearError,
    getInterim,
  }
}
