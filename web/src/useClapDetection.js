import { useEffect, useRef } from 'react'

/**
 * Detects hand claps via microphone energy spikes (Web Audio API).
 * @param {object} opts
 * @param {boolean} opts.enabled
 * @param {function} opts.onClap
 * @param {MediaStream|null} [opts.mediaStream] — if set, uses this stream instead of getUserMedia
 * @param {boolean} [opts.stopTracksOnCleanup=true] — if false, leaves MediaStream tracks alone (shared mic)
 * @param {React.MutableRefObject<number>} [opts.ignoreUntilRef] — ignore claps while performance.now() < value
 * @param {React.MutableRefObject<boolean>} [opts.strictListeningRef] — stricter thresholds (speech vs clap)
 */
export function useClapDetection({
  enabled,
  onClap,
  mediaStream = null,
  stopTracksOnCleanup = true,
  minIntervalMs = 750,
  sensitivity = 4,
  minRmsFloor = 0.11,
  ignoreUntilRef = null,
  strictListeningRef = null,
}) {
  const onClapRef = useRef(onClap)
  const lastClapRef = useRef(0)
  const prevRmsRef = useRef(0)

  useEffect(() => {
    onClapRef.current = onClap
  }, [onClap])

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return undefined

    let cancelled = false
    let stream = null
    let ownsStream = false
    let ctx = null
    let raf = null

    const start = async () => {
      if (mediaStream) {
        stream = mediaStream
        ownsStream = false
      } else {
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            },
          })
          ownsStream = true
        } catch {
          return
        }
      }
      if (cancelled) {
        if (ownsStream) stream?.getTracks().forEach((t) => t.stop())
        return
      }

      ctx = new AudioContext()
      const source = ctx.createMediaStreamSource(stream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 2048
      analyser.smoothingTimeConstant = 0.3
      source.connect(analyser)

      const buf = new Uint8Array(analyser.fftSize)
      let smooth = 0.02

      const tick = () => {
        if (cancelled) return
        analyser.getByteTimeDomainData(buf)
        let sum = 0
        for (let i = 0; i < buf.length; i++) {
          const v = (buf[i] - 128) / 128
          sum += v * v
        }
        const rms = Math.sqrt(sum / buf.length)
        smooth = smooth * 0.96 + rms * 0.04

        const now = performance.now()
        if (ignoreUntilRef && now < ignoreUntilRef.current) {
          prevRmsRef.current = rms
          raf = requestAnimationFrame(tick)
          return
        }

        const strict = strictListeningRef?.current
        const floor = strict ? Math.max(minRmsFloor, 0.16) : minRmsFloor
        const sens = strict ? sensitivity * 1.2 : sensitivity
        const interval = strict ? Math.max(minIntervalMs, 950) : minIntervalMs
        const prev = prevRmsRef.current
        const sharpRise = rms - prev > 0.032
        prevRmsRef.current = rms * 0.4 + prev * 0.6

        const transientOk = !strict || sharpRise

        if (
          transientOk &&
          rms > smooth * sens &&
          rms > floor &&
          now - lastClapRef.current > interval
        ) {
          lastClapRef.current = now
          onClapRef.current?.()
        }
        raf = requestAnimationFrame(tick)
      }
      raf = requestAnimationFrame(tick)
    }

    start()

    return () => {
      cancelled = true
      if (raf) cancelAnimationFrame(raf)
      if (ownsStream && stream) stream.getTracks().forEach((t) => t.stop())
      if (stopTracksOnCleanup === false && !ownsStream) {
        /* shared stream — parent stops tracks */
      }
      if (ctx) ctx.close().catch(() => {})
    }
  }, [
    enabled,
    mediaStream,
    stopTracksOnCleanup,
    minIntervalMs,
    sensitivity,
    minRmsFloor,
    ignoreUntilRef,
    strictListeningRef,
  ])
}
