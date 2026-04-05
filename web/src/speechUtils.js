/**
 * Browser Speech Synthesis as awaitable promises.
 */
export function speakText(text, { rate = 0.95, pitch = 0.92 } = {}) {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      resolve()
      return
    }
    const synth = window.speechSynthesis
    const run = () => {
      const u = new SpeechSynthesisUtterance(text)
      u.rate = rate
      u.pitch = pitch
      u.volume = 1
      const voices = synth.getVoices()
      const en =
        voices.find((v) => v.lang?.startsWith('en') && v.localService) ||
        voices.find((v) => v.lang?.startsWith('en')) ||
        voices[0]
      if (en) u.voice = en
      u.onend = () => resolve()
      u.onerror = () => resolve()
      synth.cancel()
      synth.speak(u)
    }
    if (synth.getVoices().length > 0) {
      run()
    } else {
      const onVoices = () => {
        synth.removeEventListener('voiceschanged', onVoices)
        run()
      }
      synth.addEventListener('voiceschanged', onVoices)
      setTimeout(() => {
        synth.removeEventListener('voiceschanged', onVoices)
        run()
      }, 400)
    }
  })
}

export function cancelSpeech() {
  if (typeof window !== 'undefined' && window.speechSynthesis) {
    window.speechSynthesis.cancel()
  }
}
