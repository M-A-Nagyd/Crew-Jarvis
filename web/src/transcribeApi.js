const API_BASE = 'http://localhost:8000'

export async function fetchTranscribeStatus() {
  const res = await fetch(`${API_BASE}/api/transcribe/status`)
  if (!res.ok) return { groq_configured: false }
  return res.json()
}

export async function transcribeAudioBlob(blob) {
  const fd = new FormData()
  const name = blob.type?.includes('webm') ? 'audio.webm' : 'audio.wav'
  fd.append('file', blob, name)
  const res = await fetch(`${API_BASE}/api/transcribe`, {
    method: 'POST',
    body: fd,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    const msg = err.detail || res.statusText || 'Transcription failed'
    throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg))
  }
  const data = await res.json()
  return (data.text || '').trim()
}
