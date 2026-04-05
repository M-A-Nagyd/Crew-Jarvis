import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Environment, ContactShadows } from '@react-three/drei'
import { EffectComposer, Bloom } from '@react-three/postprocessing'
import {
  Terminal,
  Code2,
  X,
  Mic,
  MicOff,
  Keyboard,
  ChevronUp,
  Building2,
  Sparkles,
  Hand,
  Volume2,
  FileText,
  Activity,
  Users,
} from 'lucide-react'
import OfficeScene from './OfficeScene'
import ParticleSphereScene from './ParticleSphereScene'
import { useSpeechRecognition } from './useSpeechRecognition'
import { useClapDetection } from './useClapDetection'
import { useMicStream } from './useMicStream'
import { useVoiceRecording } from './useVoiceRecording'
import { fetchTranscribeStatus, transcribeAudioBlob } from './transcribeApi'
import { pickRandom, WELCOME_LINES, INVITE_LINES, CLARIFY_INTRO_LINES } from './voiceCopy'
import { speakText, cancelSpeech } from './speechUtils'
import HudMarkIcon from './HudMarkIcon'
import './index.css'

const AGENT_META = {
  Architect: {
    color: '#fbbf24',
    icon: '🏛️',
    role: 'Software Architect',
    desc: 'Plans the system architecture and file structure for the project.',
  },
  Developer: {
    color: '#22d3ee',
    icon: '💻',
    role: 'Senior Developer',
    desc: 'Writes all the source code files using the Architect\'s plan.',
  },
  QA: {
    color: '#f43f5e',
    icon: '🔍',
    role: 'QA Engineer',
    desc: 'Reviews and fixes the code, then delivers the final output.',
  },
  System: {
    color: '#94a3b8',
    icon: '⚙️',
    role: 'System',
    desc: 'JARVIS OS orchestrator — manages agent coordination.',
  },
}

function AgentInspectPanel({ agent, thoughts, logs, onClose }) {
  const meta = AGENT_META[agent] || AGENT_META.System
  const agentLogs = logs.filter((l) => l.type === agent)

  return (
    <div className="inspect-panel" style={{ borderColor: meta.color }}>
      <div className="inspect-header" style={{ borderBottomColor: meta.color }}>
        <div className="inspect-title">
          <span className="inspect-icon">{meta.icon}</span>
          <div>
            <div className="inspect-name" style={{ color: meta.color }}>
              {agent}
            </div>
            <div className="inspect-role">{meta.role}</div>
          </div>
        </div>
        <button type="button" className="inspect-close" onClick={onClose}>
          <X size={18} />
        </button>
      </div>

      <div className="inspect-body">
        <p className="inspect-desc">{meta.desc}</p>

        {thoughts && (
          <div className="inspect-section">
            <div className="inspect-section-title" style={{ color: meta.color }}>
              Currently thinking
            </div>
            <div className="inspect-thought" style={{ borderColor: meta.color }}>
              {thoughts}
            </div>
          </div>
        )}

        <div className="inspect-section">
          <div className="inspect-section-title" style={{ color: meta.color }}>
            Activity log ({agentLogs.length})
          </div>
          <div className="inspect-log-scroll">
            {agentLogs.length === 0 ? (
              <div className="inspect-empty">No activity yet…</div>
            ) : (
              agentLogs.map((l, i) => (
                <div key={i} className="inspect-log-entry">
                  {l.text}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function buildClarificationContext(rows) {
  return rows.map((r) => `Q: ${r.q}\nA: ${r.a}`).join('\n\n')
}

const LISTENING_TIMEOUT_MS = 60_000

export default function App() {
  const [prompt, setPrompt] = useState('')
  const [project, setProject] = useState('example-app')
  const [logs, setLogs] = useState([])
  const [activeAgent, setActiveAgent] = useState('System')
  const [agentThoughts, setAgentThoughts] = useState({
    Architect: '',
    Developer: '',
    QA: '',
  })
  const [isGenerating, setIsGenerating] = useState(false)
  const [files, setFiles] = useState({})
  const [selectedFile, setSelectedFile] = useState(null)
  const [inspectedAgent, setInspectedAgent] = useState(null)

  const [viewMode, setViewMode] = useState('hud')
  const [showTextPrompt, setShowTextPrompt] = useState(false)
  const [welcomeVisible, setWelcomeVisible] = useState(true)
  /** Flyout panel from corner HUD: brief | intel | agents | files */
  const [hudPanel, setHudPanel] = useState(null)
  const [clapEnabled, setClapEnabled] = useState(false)

  const [voicePhase, setVoicePhase] = useState('idle')
  const voicePhaseRef = useRef('idle')
  const ttsLockRef = useRef(false)
  const originalPromptRef = useRef('')
  const clarifyQuestionsRef = useRef([])
  const clarifyIndexRef = useRef(0)
  const clarifyRowsRef = useRef([])

  const speech = useSpeechRecognition()
  const [groqConfigured, setGroqConfigured] = useState(false)
  const micStream = useMicStream(clapEnabled)
  const { start: startVoiceRecord, stop: stopVoiceRecord } = useVoiceRecording(micStream)
  /** 'groq' | 'webspeech' | 'idle' — which capture is active for clap-driven listening */
  const listenSttRef = useRef('idle')
  const [listenSurface, setListenSurface] = useState('idle')
  const clapIgnoreUntilRef = useRef(0)
  const strictListeningRef = useRef(false)
  const ws = useRef(null)
  const logsEndRef = useRef(null)
  const welcomeSpokenRef = useRef(false)
  /** Prevents duplicate speakWelcome() setups (timer + click, or StrictMode) before run() fires. */
  const welcomeScheduledRef = useRef(false)
  const promptRef = useRef('')
  const manualMicRef = useRef(false)
  const listenTimeoutRef = useRef(null)

  const speechListenOptions = useMemo(
    () => ({
      shouldKeepAlive: () =>
        voicePhaseRef.current === 'listening_prompt' ||
        voicePhaseRef.current === 'listening_answer',
    }),
    []
  )

  const welcomePick = useMemo(() => pickRandom(WELCOME_LINES), [])

  const disarmListenCapture = useCallback(() => {
    speech.stop()
    if (listenSttRef.current === 'groq') {
      void stopVoiceRecord()
    }
    listenSttRef.current = 'idle'
    setListenSurface('idle')
  }, [speech, stopVoiceRecord])

  const armListeningStt = useCallback(() => {
    clapIgnoreUntilRef.current = performance.now() + 450
    if (groqConfigured && micStream && startVoiceRecord()) {
      listenSttRef.current = 'groq'
      setListenSurface('groq')
      return true
    }
    if (!speech.supported) {
      listenSttRef.current = 'idle'
      setListenSurface('idle')
      return false
    }
    listenSttRef.current = 'webspeech'
    setListenSurface('webspeech')
    speech.start(
      (chunk) => {
        setPrompt((p) => (p ? `${p} ${chunk}` : chunk))
      },
      speechListenOptions
    )
    return true
  }, [groqConfigured, micStream, startVoiceRecord, speech, speechListenOptions])

  const setPhase = (p) => {
    voicePhaseRef.current = p
    setVoicePhase(p)
  }

  useEffect(() => {
    strictListeningRef.current =
      voicePhase === 'listening_prompt' || voicePhase === 'listening_answer'
  }, [voicePhase])

  useEffect(() => {
    if (listenTimeoutRef.current) {
      clearTimeout(listenTimeoutRef.current)
      listenTimeoutRef.current = null
    }
    if (voicePhase !== 'listening_prompt' && voicePhase !== 'listening_answer') {
      return undefined
    }
    listenTimeoutRef.current = setTimeout(() => {
      listenTimeoutRef.current = null
      const p = voicePhaseRef.current
      if (p !== 'listening_prompt' && p !== 'listening_answer') return
      disarmListenCapture()
      voicePhaseRef.current = 'idle'
      setVoicePhase('idle')
      setLogs((prev) => [
        ...prev,
        {
          type: 'System',
          text: 'Voice listening closed after 1 minute with no clap. Clap to start again when ready.',
        },
      ])
    }, LISTENING_TIMEOUT_MS)
    return () => {
      if (listenTimeoutRef.current) {
        clearTimeout(listenTimeoutRef.current)
        listenTimeoutRef.current = null
      }
    }
  }, [voicePhase, disarmListenCapture])

  useEffect(() => {
    fetchTranscribeStatus().then((s) => setGroqConfigured(Boolean(s?.groq_configured)))
  }, [])

  const displayPrompt =
    listenSurface === 'groq' && (voicePhase === 'listening_prompt' || voicePhase === 'listening_answer')
      ? [prompt.trim(), '· Recording (Groq) — clap when finished'].filter(Boolean).join(' ')
      : [prompt.trim(), speech.interim].filter(Boolean).join(' ')

  useEffect(() => {
    promptRef.current = prompt
  }, [prompt])

  const connectWs = useCallback(() => {
    ws.current = new WebSocket('ws://localhost:8000/ws/agents')

    ws.current.onopen = () => {
      setLogs((prev) => [
        ...prev,
        { type: 'System', text: 'Connected to JARVIS OS orchestrator.' },
      ])
    }

    ws.current.onmessage = (event) => {
      let data
      try {
        data = JSON.parse(event.data)
      } catch {
        return
      }
      if (!data || typeof data.type !== 'string') return
      if (data.type === 'log') {
        const msgText = data.message || ''
        setLogs((prev) => [...prev, { type: data.agent, text: msgText }])
        setActiveAgent(data.agent)
        if (data.agent !== 'System') {
          setAgentThoughts((prev) => ({ ...prev, [data.agent]: msgText }))
        }
      } else if (data.type === 'files') {
        setFiles(data.data)
        setIsGenerating(false)
        setActiveAgent('System')
        setPhase('idle')
        cancelSpeech()
      } else if (data.type === 'close') {
        setIsGenerating(false)
        setActiveAgent('System')
        setPhase('idle')
      }
    }

    ws.current.onclose = () => {
      setTimeout(connectWs, 2000)
    }
  }, [])

  useEffect(() => {
    connectWs()
    return () => {
      ws.current?.close()
    }
  }, [connectWs])

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  const speakWelcome = useCallback(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return
    if (welcomeSpokenRef.current) return
    if (welcomeScheduledRef.current) return
    welcomeScheduledRef.current = true

    const synth = window.speechSynthesis
    const run = () => {
      if (welcomeSpokenRef.current) return
      // Mark immediately so timer + click, or voiceschanged + fallback, cannot start a second utterance.
      welcomeSpokenRef.current = true

      const utterance = new SpeechSynthesisUtterance(welcomePick)
      utterance.rate = 0.95
      utterance.pitch = 0.9
      utterance.volume = 1
      const voices = synth.getVoices()
      const en =
        voices.find((v) => v.lang?.startsWith('en') && v.localService) ||
        voices.find((v) => v.lang?.startsWith('en')) ||
        voices[0]
      if (en) utterance.voice = en
      synth.cancel()
      synth.speak(utterance)
    }

    if (synth.getVoices().length > 0) {
      run()
    } else {
      let fallbackTimer
      const onVoices = () => {
        synth.removeEventListener('voiceschanged', onVoices)
        clearTimeout(fallbackTimer)
        run()
      }
      fallbackTimer = setTimeout(() => {
        synth.removeEventListener('voiceschanged', onVoices)
        run()
      }, 500)
      synth.addEventListener('voiceschanged', onVoices)
    }
  }, [welcomePick])

  useEffect(() => {
    const onInteract = () => speakWelcome()
    window.addEventListener('pointerdown', onInteract, { passive: true })
    window.addEventListener('keydown', onInteract)
    const t = setTimeout(() => speakWelcome(), 400)
    return () => {
      clearTimeout(t)
      window.removeEventListener('pointerdown', onInteract)
      window.removeEventListener('keydown', onInteract)
    }
  }, [speakWelcome])

  useEffect(() => {
    const timer = setTimeout(() => setWelcomeVisible(false), 3200)
    return () => clearTimeout(timer)
  }, [])

  const runGenerate = useCallback(
    async (userPrompt, clarificationContext) => {
      if (!userPrompt.trim()) return
      setPhase('generating')
      setIsGenerating(true)
      setLogs([])
      setFiles({})
      setSelectedFile(null)
      setActiveAgent('System')
      setAgentThoughts({ Architect: '', Developer: '', QA: '' })
      setInspectedAgent(null)
      disarmListenCapture()
      cancelSpeech()
      try {
        const res = await fetch('http://localhost:8000/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: userPrompt.trim(),
            project_name: project,
            clarification_context: clarificationContext || '',
          }),
        })
        const started = await res.json().catch(() => ({}))
        if (started?.project && typeof started.project === 'string') {
          setProject(started.project)
        }
      } catch (err) {
        console.error(err)
        setIsGenerating(false)
        setPhase('idle')
      }
    },
    [project, disarmListenCapture]
  )

  const speakQuestionAt = useCallback(
    async (index) => {
      const questions = clarifyQuestionsRef.current
      if (!questions.length || index >= questions.length) {
        const ctx = buildClarificationContext(clarifyRowsRef.current)
        await runGenerate(originalPromptRef.current, ctx)
        return
      }
      ttsLockRef.current = true
      setPhase('speak_question')
      await speakText(questions[index])
      ttsLockRef.current = false
      setPhase('listening_answer')
      setPrompt('')
      const ok = armListeningStt()
      if (!ok) setPhase('idle')
    },
    [runGenerate, speechListenOptions, armListeningStt]
  )

  const afterPromptCapturedWithText = useCallback(
    async (text) => {
      const trimmed = (text || '').trim()
      if (!trimmed) {
        setPhase('idle')
        return
      }
      setPrompt(trimmed)
      originalPromptRef.current = trimmed
      setPhase('clarify_fetch')
      try {
        const res = await fetch('http://localhost:8000/api/clarify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: trimmed }),
        })
        const data = await res.json()
        const questions = Array.isArray(data.questions) ? data.questions : []
        clarifyQuestionsRef.current = questions
        clarifyIndexRef.current = 0
        clarifyRowsRef.current = []
        if (questions.length === 0) {
          ttsLockRef.current = true
          await speakText('Brief acknowledged. Beginning execution.')
          ttsLockRef.current = false
          await runGenerate(trimmed, '')
          return
        }
        ttsLockRef.current = true
        await speakText(
          `I have ${questions.length} question${questions.length > 1 ? 's' : ''}. ${pickRandom(CLARIFY_INTRO_LINES)}`
        )
        ttsLockRef.current = false
        await speakQuestionAt(0)
      } catch (e) {
        console.error(e)
        await runGenerate(trimmed, '')
      }
    },
    [runGenerate, speakQuestionAt]
  )

  const startVoiceSession = useCallback(async () => {
    if (isGenerating) return
    if (!groqConfigured && !speech.supported) return
    cancelSpeech()
    welcomeSpokenRef.current = true
    ttsLockRef.current = true
    setPhase('invite')
    await speakText(pickRandom(INVITE_LINES))
    ttsLockRef.current = false
    setPhase('listening_prompt')
    setPrompt('')
    const ok = armListeningStt()
    if (!ok) setPhase('idle')
  }, [isGenerating, groqConfigured, speech.supported, armListeningStt])

  const onClap = useCallback(() => {
    if (ttsLockRef.current) return
    if (isGenerating) return
    const phase = voicePhaseRef.current
    if (phase === 'idle') {
      void startVoiceSession()
    } else if (phase === 'listening_prompt') {
      void (async () => {
        if (listenSttRef.current === 'groq') {
          speech.stop()
          const blob = await stopVoiceRecord()
          listenSttRef.current = 'idle'
          setListenSurface('idle')
          let transcribed = ''
          if (blob && blob.size > 12) {
            try {
              transcribed = await transcribeAudioBlob(blob)
            } catch (e) {
              console.error(e)
            }
          }
          const typed = promptRef.current.trim()
          const text = [typed, transcribed].filter(Boolean).join(' ').trim()
          if (!text) {
            setPhase('idle')
            return
          }
          void afterPromptCapturedWithText(text)
        } else {
          const interim = speech.getInterim()
          speech.stop()
          listenSttRef.current = 'idle'
          setListenSurface('idle')
          const text = [promptRef.current.trim(), interim].filter(Boolean).join(' ').trim()
          void afterPromptCapturedWithText(text)
        }
      })()
    } else if (phase === 'listening_answer') {
      void (async () => {
        if (listenSttRef.current === 'groq') {
          speech.stop()
          const blob = await stopVoiceRecord()
          listenSttRef.current = 'idle'
          setListenSurface('idle')
          let transcribed = ''
          if (blob && blob.size > 12) {
            try {
              transcribed = await transcribeAudioBlob(blob)
            } catch (e) {
              console.error(e)
            }
          }
          const typed = promptRef.current.trim()
          const answerText = [typed, transcribed].filter(Boolean).join(' ').trim()
          const questions = clarifyQuestionsRef.current
          const idx = clarifyIndexRef.current
          if (questions[idx]) {
            clarifyRowsRef.current.push({ q: questions[idx], a: answerText })
          }
          clarifyIndexRef.current = idx + 1
          if (clarifyIndexRef.current < questions.length) {
            void speakQuestionAt(clarifyIndexRef.current)
          } else {
            const ctx = buildClarificationContext(clarifyRowsRef.current)
            void runGenerate(originalPromptRef.current, ctx)
          }
        } else {
          const interim = speech.getInterim()
          speech.stop()
          listenSttRef.current = 'idle'
          setListenSurface('idle')
          const answerText = [promptRef.current.trim(), interim].filter(Boolean).join(' ').trim()
          const questions = clarifyQuestionsRef.current
          const idx = clarifyIndexRef.current
          if (questions[idx]) {
            clarifyRowsRef.current.push({ q: questions[idx], a: answerText })
          }
          clarifyIndexRef.current = idx + 1
          if (clarifyIndexRef.current < questions.length) {
            void speakQuestionAt(clarifyIndexRef.current)
          } else {
            const ctx = buildClarificationContext(clarifyRowsRef.current)
            void runGenerate(originalPromptRef.current, ctx)
          }
        }
      })()
    }
  }, [
    afterPromptCapturedWithText,
    isGenerating,
    runGenerate,
    speakQuestionAt,
    speech,
    startVoiceSession,
    stopVoiceRecord,
  ])

  useClapDetection({
    enabled: Boolean(clapEnabled && !isGenerating && micStream),
    onClap,
    mediaStream: micStream,
    stopTracksOnCleanup: false,
    ignoreUntilRef: clapIgnoreUntilRef,
    strictListeningRef,
  })

  const handleGenerateManual = async () => {
    const finalPrompt = prompt.trim()
    if (!finalPrompt) return
    setPhase('generating')
    await runGenerate(finalPrompt, '')
  }

  const toggleMic = () => {
    speech.clearError()
    if (speech.listening) {
      manualMicRef.current = false
      speech.stop()
      return
    }
    manualMicRef.current = true
    speech.start(
      (chunk) => {
        setPrompt((p) => (p ? `${p} ${chunk}` : chunk))
      },
      { shouldKeepAlive: () => manualMicRef.current }
    )
  }

  const canRunManual = Boolean(prompt.trim()) && !isGenerating && voicePhase === 'idle'

  const voiceStatusLabel = () => {
    switch (voicePhase) {
      case 'invite':
        return 'Speaking invitation'
      case 'listening_prompt':
        return listenSurface === 'groq'
          ? 'Recording your brief — clap when finished'
          : 'Listening for your brief — clap when done'
      case 'clarify_fetch':
        return 'Reviewing brief…'
      case 'speak_question':
        return 'Speaking question'
      case 'listening_answer':
        return listenSurface === 'groq'
          ? 'Recording your answer — clap when finished'
          : 'Listening for your answer — clap when done'
      case 'generating':
        return 'Execution in progress'
      default:
        return clapEnabled ? 'Clap to begin voice session' : 'Enable clap in Brief panel'
    }
  }

  const toggleHudPanel = useCallback((id) => {
    setHudPanel((p) => (p === id ? null : id))
  }, [])

  useEffect(() => {
    if (!hudPanel) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') setHudPanel(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [hudPanel])

  return (
    <div className="app-container">
      {hudPanel ? (
        <button
          type="button"
          className="hud-backdrop"
          aria-label="Close panel"
          onClick={() => setHudPanel(null)}
        />
      ) : null}

      <div className="canvas-container">
        <Canvas camera={{ position: [0, 5, 14], fov: 50 }} shadows>
          <color attach="background" args={['#020617']} />
          <ambientLight intensity={viewMode === 'hud' ? 0.15 : 0.35} />
          <pointLight
            position={[10, 10, 10]}
            intensity={viewMode === 'hud' ? 0.6 : 0.8}
            color={viewMode === 'hud' ? '#fbbf24' : '#f59e0b'}
          />
          <spotLight
            position={[-10, 18, 8]}
            angle={0.25}
            penumbra={1}
            intensity={viewMode === 'hud' ? 1.35 : 2}
            castShadow
            color={viewMode === 'hud' ? '#f97316' : '#7c3aed'}
          />

          {viewMode === 'office' ? (
            <>
              <OfficeScene
                activeAgent={activeAgent}
                agentThoughts={agentThoughts}
                onSelectAgent={(name) => setInspectedAgent((prev) => (prev === name ? null : name))}
              />
              <ContactShadows
                resolution={1024}
                scale={24}
                blur={2.5}
                opacity={0.6}
                far={12}
                color="#000"
              />
              <Environment preset="city" />
              <OrbitControls
                enablePan={false}
                minPolarAngle={Math.PI / 6}
                maxPolarAngle={Math.PI / 2.2}
                minDistance={6}
                maxDistance={28}
              />
            </>
          ) : (
            <>
              <ParticleSphereScene
                activeAgent={activeAgent}
                isGenerating={isGenerating}
                voicePhase={voicePhase}
              />
              <OrbitControls
                enablePan={false}
                minPolarAngle={Math.PI / 8}
                maxPolarAngle={Math.PI / 2}
                minDistance={8}
                maxDistance={32}
              />
              <EffectComposer enableNormalPass={false}>
                <Bloom luminanceThreshold={0.22} intensity={1.2} mipmapBlur radius={0.55} />
              </EffectComposer>
            </>
          )}
        </Canvas>

        <div className="canvas-hint">
          {viewMode === 'office' ? 'Click any agent to inspect' : 'Neural HUD — orbit to explore'}
        </div>
        {welcomeVisible && (
          <div className="welcome-master-banner">
            <span className="welcome-master-title">{welcomePick}</span>
            <span className="welcome-master-hint">Tap or click anywhere if you don&apos;t hear audio</span>
          </div>
        )}

        <div className="voice-ribbon" role="status">
          <Volume2 size={14} className="voice-ribbon-icon" />
          <span>{voiceStatusLabel()}</span>
        </div>
      </div>

      <header className="hud-min-header">
        <div className="hud-min-header-brand" aria-label="Neural HUD">
          <HudMarkIcon className="hud-min-header-mark" />
        </div>
        {isGenerating && (
          <div className="hud-min-header-status">
            <div className="pulse-dot" />
            <span>Orchestrating…</span>
          </div>
        )}
      </header>

      <div className="hud-corner-dock hud-corner-dock--left" role="toolbar" aria-label="Brief controls">
        <button
          type="button"
          className={`hud-trap-btn ${hudPanel === 'brief' ? 'active' : ''}`}
          onClick={() => toggleHudPanel('brief')}
          aria-expanded={hudPanel === 'brief'}
        >
          <FileText size={15} strokeWidth={2} />
          <span>Brief</span>
        </button>
      </div>

      <div className="hud-corner-dock hud-corner-dock--right" role="toolbar" aria-label="System controls">
        <button
          type="button"
          className={`hud-trap-btn ${hudPanel === 'intel' ? 'active' : ''}`}
          onClick={() => toggleHudPanel('intel')}
          aria-expanded={hudPanel === 'intel'}
        >
          <Activity size={15} strokeWidth={2} />
          <span>Intel</span>
        </button>
        <button
          type="button"
          className={`hud-trap-btn ${hudPanel === 'agents' ? 'active' : ''}`}
          onClick={() => toggleHudPanel('agents')}
          aria-expanded={hudPanel === 'agents'}
        >
          <Users size={15} strokeWidth={2} />
          <span>Crew</span>
        </button>
        <button
          type="button"
          className={`hud-trap-btn ${viewMode === 'office' ? 'active' : ''}`}
          onClick={() => setViewMode('office')}
          title="Office scene"
        >
          <Building2 size={15} strokeWidth={2} />
          <span>Office</span>
        </button>
        <button
          type="button"
          className={`hud-trap-btn ${viewMode === 'hud' ? 'active' : ''}`}
          onClick={() => setViewMode('hud')}
          title="Neural HUD"
        >
          <Sparkles size={15} strokeWidth={2} />
          <span>HUD</span>
        </button>
        {Object.keys(files).length > 0 ? (
          <button
            type="button"
            className={`hud-trap-btn ${hudPanel === 'files' ? 'active' : ''}`}
            onClick={() => toggleHudPanel('files')}
            aria-expanded={hudPanel === 'files'}
          >
            <Code2 size={15} strokeWidth={2} />
            <span>Files</span>
          </button>
        ) : null}
      </div>

      {hudPanel === 'brief' ? (
        <div className="hud-flyout-panel hud-flyout--brief" role="dialog" aria-label="Brief and voice">
          <div className="controls-card controls-card-refined classy-card hud-flyout-inner">
            <div className="clap-row">
            <Hand size={18} className="clap-row-icon" />
            <div className="clap-row-text">
              <div className="clap-row-title">Clap control</div>
              <div className="clap-row-desc">
                Enable microphone, then clap: start session → finish speaking → answer questions.
              </div>
            </div>
            <button
              type="button"
              className={`toggle-pill ${clapEnabled ? 'on' : ''}`}
              onClick={() => setClapEnabled((v) => !v)}
            >
              {clapEnabled ? 'On' : 'Off'}
            </button>
            </div>

            <div className="input-group">
            <label htmlFor="project-name">Project</label>
            <input
              id="project-name"
              className="input-field input-classy"
              value={project}
              onChange={(e) => setProject(e.target.value)}
              disabled={isGenerating}
              autoComplete="off"
            />
            </div>

            <div className="prompt-row">
            <div className="prompt-row-label">
              <span>Brief</span>
              <button
                type="button"
                className="link-toggle"
                onClick={() => setShowTextPrompt((v) => !v)}
              >
                {showTextPrompt ? (
                  <>
                    <ChevronUp size={14} /> Hide typing
                  </>
                ) : (
                  <>
                    <Keyboard size={14} /> Type instead
                  </>
                )}
              </button>
            </div>

            {showTextPrompt && (
              <textarea
                className="input-field prompt-textarea input-classy"
                rows={4}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe what to build…"
                disabled={isGenerating}
              />
            )}

            <div className="speech-row">
              <button
                type="button"
                className={`btn-mic ${speech.listening ? 'listening' : ''}`}
                onClick={toggleMic}
                disabled={isGenerating}
                title={speech.supported ? 'Speech to text' : 'Not supported in this browser'}
              >
                {speech.listening ? <MicOff size={22} /> : <Mic size={22} />}
                <span>{speech.listening ? 'Stop' : 'Speak'}</span>
              </button>
              {!speech.supported && (
                <span className="speech-hint warn">Chrome or Edge recommended for voice.</span>
              )}
              {speech.error && (
                <span className="speech-hint err">
                  {speech.error === 'not_supported'
                    ? 'Voice input needs Chrome or Edge.'
                    : speech.error === 'not-allowed'
                      ? 'Microphone permission denied.'
                      : speech.error}
                </span>
              )}
            </div>

            {(speech.listening || listenSurface === 'groq' || prompt.trim() || speech.interim) && (
              <div className="transcript-preview" aria-live="polite">
                <div className="transcript-label">Transcript</div>
                <div className="transcript-body">{displayPrompt.trim() || '…'}</div>
              </div>
            )}
            </div>

            <button
              type="button"
              className="btn-generate btn-classy"
              onClick={handleGenerateManual}
              disabled={!canRunManual}
            >
              <Terminal size={18} />
              {isGenerating ? 'Generating…' : 'Execute brief'}
            </button>
          </div>
        </div>
      ) : null}

      {hudPanel === 'intel' ? (
        <div className="hud-flyout-panel hud-flyout--intel" role="dialog" aria-label="Intel feed">
          <div className="logs-card classy-card logs-card-compact hud-flyout-inner">
            <div className="logs-header">
              <span>Intel feed</span>
              <span>{logs.length}</span>
            </div>
            <div className="logs-content">
              {logs.map((log, i) => {
                const meta = AGENT_META[log.type] || AGENT_META.System
                return (
                  <div key={i} className={`log-entry ${log.type}`}>
                    <span
                      className="agent-badge"
                      style={{
                        background: `${meta.color}22`,
                        color: meta.color,
                        borderColor: `${meta.color}44`,
                      }}
                    >
                      {meta.icon} {log.type}
                    </span>
                    <div>{log.text}</div>
                  </div>
                )
              })}
              <div ref={logsEndRef} />
            </div>
          </div>
        </div>
      ) : null}

      {hudPanel === 'agents' ? (
        <div className="hud-flyout-panel hud-flyout--agents" role="dialog" aria-label="Crew">
          <div className="hud-flyout-inner hud-agents-flyout">
            <div className="agent-status-row agent-status-row--flyout">
              {['Architect', 'Developer', 'QA'].map((name) => {
                const meta = AGENT_META[name]
                const isActive = activeAgent === name
                return (
                  <button
                    type="button"
                    key={name}
                    className={`agent-status-badge ${isActive ? 'active' : ''}`}
                    style={{ borderColor: isActive ? meta.color : '#1e293b' }}
                    onClick={() => setInspectedAgent((prev) => (prev === name ? null : name))}
                  >
                    <span>{meta.icon}</span>
                    <span style={{ color: isActive ? meta.color : '#64748b' }}>{name}</span>
                    {isActive && <div className="agent-status-dot" style={{ background: meta.color }} />}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      ) : null}

      {hudPanel === 'files' && Object.keys(files).length > 0 ? (
        <div className="hud-flyout-panel hud-flyout--files" role="dialog" aria-label="Generated files">
          <div className={`files-card classy-card hud-flyout-inner files-card--dock ${inspectedAgent ? 'with-inspect' : ''}`}>
            <div className="logs-header">
              <span>Generated files</span>
              <Code2 size={16} />
            </div>
            <div className="file-list">
              {Object.keys(files).map((filename) => (
                <button
                  type="button"
                  key={filename}
                  className="file-item"
                  onClick={() => setSelectedFile(filename)}
                  style={{
                    background: selectedFile === filename ? 'rgba(34,211,238,0.12)' : '',
                  }}
                >
                  <Code2 size={14} color="#64748b" />
                  <span>{filename}</span>
                </button>
              ))}
            </div>
            {selectedFile ? (
              <div className="code-viewer">
                <pre>
                  <code>{files[selectedFile]}</code>
                </pre>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {inspectedAgent && (
        <AgentInspectPanel
          agent={inspectedAgent}
          thoughts={agentThoughts[inspectedAgent]}
          logs={logs}
          onClose={() => setInspectedAgent(null)}
        />
      )}
    </div>
  )
}
