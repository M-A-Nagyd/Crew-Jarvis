import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

const COUNT = 4200
const MESH_RINGS = 5

/** Returns reactor layout + index boundaries for coloring: core | spoke | ring | haze */
function makeReactorLayout(count) {
  const arr = new Float32Array(count * 3)
  const coreN = Math.floor(count * 0.18)
  const spokeN = Math.floor(count * 0.22)
  const ringN = Math.floor(count * 0.38)
  const hazeN = count - coreN - spokeN - ringN

  const euler = new THREE.Euler()
  const v = new THREE.Vector3()
  let i = 0

  for (; i < coreN; i++) {
    const u = Math.random()
    const v2 = Math.random()
    const theta = 2 * Math.PI * u
    const phi = Math.acos(2 * v2 - 1)
    const r = 0.28 + Math.random() * 0.55
    arr[i * 3] = r * Math.sin(phi) * Math.cos(theta)
    arr[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta)
    arr[i * 3 + 2] = r * Math.cos(phi)
  }

  const spokes = 10
  const spokeEnd = coreN + spokeN
  let s = 0
  while (i < spokeEnd) {
    const angle = (s % spokes) * ((2 * Math.PI) / spokes)
    const dx = Math.cos(angle)
    const dz = Math.sin(angle)
    const t = Math.random()
    const rad = 0.45 + t * 2.95
    arr[i * 3] = dx * rad + (Math.random() - 0.5) * 0.1
    arr[i * 3 + 1] = (Math.random() - 0.5) * 0.14
    arr[i * 3 + 2] = dz * rad + (Math.random() - 0.5) * 0.1
    i++
    s++
  }

  const ringRadii = [1.05, 1.48, 1.92, 2.38, 2.82]
  const ringEnd = spokeEnd + ringN
  let ri = 0
  while (i < ringEnd) {
    const R = ringRadii[ri % ringRadii.length]
    euler.set(0.12 + ri * 0.05, 0, 0.1 + ri * 0.04, 'XYZ')
    const ang = Math.random() * Math.PI * 2
    v.set(Math.cos(ang) * R, 0, Math.sin(ang) * R)
    v.applyEuler(euler)
    arr[i * 3] = v.x + (Math.random() - 0.5) * 0.06
    arr[i * 3 + 1] = v.y + (Math.random() - 0.5) * 0.05
    arr[i * 3 + 2] = v.z + (Math.random() - 0.5) * 0.06
    i++
    ri++
  }

  for (; i < count; i++) {
    const u = Math.random()
    const v2 = Math.random()
    const theta = 2 * Math.PI * u
    const phi = Math.acos(2 * v2 - 1)
    const r = 3.0 + Math.random() * 1.15
    arr[i * 3] = r * Math.sin(phi) * Math.cos(theta) * (0.92 + Math.random() * 0.08)
    arr[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta) * 0.75
    arr[i * 3 + 2] = r * Math.cos(phi) * (0.92 + Math.random() * 0.08)
  }

  return { positions: arr, coreEnd: coreN, spokeEnd: spokeEnd, ringEnd: ringEnd }
}

function makeScatterPositions(count, spread) {
  const arr = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    arr[i * 3] = (Math.random() - 0.5) * spread
    arr[i * 3 + 1] = (Math.random() - 0.5) * spread * 0.65
    arr[i * 3 + 2] = (Math.random() - 0.5) * spread
  }
  return arr
}

function makeTorusPositions(count, R, r) {
  const arr = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    const u = (i / count) * Math.PI * 2
    const v = ((i * 17) % Math.max(count - 1, 1)) / Math.max(count - 1, 1) * Math.PI * 2
    arr[i * 3] = (R + r * Math.cos(v)) * Math.cos(u)
    arr[i * 3 + 1] = r * Math.sin(v)
    arr[i * 3 + 2] = (R + r * Math.cos(v)) * Math.sin(u)
  }
  return arr
}

function makeOctaPositions(count, radius) {
  const verts = [
    [1, 0, 0],
    [-1, 0, 0],
    [0, 1, 0],
    [0, -1, 0],
    [0, 0, 1],
    [0, 0, -1],
  ]
  const arr = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    const vi = i % 6
    const vert = verts[vi]
    const j = Math.sin(i * 2.17) * 0.12 + Math.cos(i * 1.31) * 0.1
    arr[i * 3] = radius * vert[0] + j
    arr[i * 3 + 1] = radius * vert[1] + j * 0.8
    arr[i * 3 + 2] = radius * vert[2] + j
  }
  return arr
}

function mixPositions(a, b, t, out) {
  const s = THREE.MathUtils.clamp(t, 0, 1)
  for (let i = 0; i < out.length; i++) {
    out[i] = a[i] * (1 - s) + b[i] * s
  }
}

/** Gold ramp by particle role (core brightest, haze deeper amber) */
function makeGoldVertexColors(count, coreEnd, spokeEnd, ringEnd) {
  const c = new Float32Array(count * 3)
  const hot = new THREE.Color('#fff8e7')
  const bright = new THREE.Color('#fde68a')
  const mid = new THREE.Color('#fbbf24')
  const deep = new THREE.Color('#ea580c')
  const dim = new THREE.Color('#9a3412')

  for (let i = 0; i < count; i++) {
    let col
    if (i < coreEnd) {
      col = hot.clone().lerp(bright, i / Math.max(coreEnd, 1))
    } else if (i < spokeEnd) {
      col = bright.clone().lerp(mid, (i - coreEnd) / Math.max(spokeEnd - coreEnd, 1))
    } else if (i < ringEnd) {
      col = mid.clone().lerp(deep, (i - spokeEnd) / Math.max(ringEnd - spokeEnd, 1))
    } else {
      col = deep.clone().lerp(dim, (i - ringEnd) / Math.max(count - ringEnd, 1))
    }
    c[i * 3] = col.r
    c[i * 3 + 1] = col.g
    c[i * 3 + 2] = col.b
  }
  return c
}

function targetForAgent(agent, reactor, torus, octa, scratch) {
  if (agent === 'Developer') {
    mixPositions(reactor, torus, 0.82, scratch)
    return scratch
  }
  if (agent === 'QA') {
    mixPositions(reactor, octa, 0.78, scratch)
    return scratch
  }
  return reactor
}

export default function ParticleSphereScene({ activeAgent, isGenerating, voicePhase = 'idle' }) {
  const rootRef = useRef()
  const counterRef = useRef()
  const coreRef = useRef()
  const pointsRef = useRef()
  const glowPointsRef = useRef()
  const ringMeshRefs = useRef([])
  const convergeRef = useRef(0)
  const chaosRef = useRef(0)

  const layout = useMemo(() => makeReactorLayout(COUNT), [])
  const reactorPos = layout.positions
  const { coreEnd, spokeEnd, ringEnd } = layout

  const torusPos = useMemo(() => makeTorusPositions(COUNT, 2.45, 0.72), [])
  const octaPos = useMemo(() => makeOctaPositions(COUNT, 2.95), [])
  const scratchTarget = useMemo(() => new Float32Array(COUNT * 3), [])
  const idleScatterPos = useMemo(() => makeScatterPositions(COUNT, 15), [])
  const animPos = useMemo(() => new Float32Array(reactorPos), [reactorPos])
  const glowPos = useMemo(() => new Float32Array(reactorPos), [reactorPos])

  const colors = useMemo(
    () => makeGoldVertexColors(COUNT, coreEnd, spokeEnd, ringEnd),
    [coreEnd, spokeEnd, ringEnd]
  )

  const agentHue = useMemo(() => {
    const map = { Architect: 0.12, Developer: 0.52, QA: 0.96, System: 0.08 }
    return map[activeAgent] ?? 0.08
  }, [activeAgent])

  const listening =
    voicePhase === 'listening_prompt' || voicePhase === 'listening_answer'
  const workStarting =
    ['invite', 'clarify_fetch', 'speak_question'].includes(voicePhase) || listening

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime

    const convergeTarget = isGenerating ? 1 : activeAgent !== 'System' ? 0.88 : 0
    convergeRef.current = THREE.MathUtils.lerp(convergeRef.current, convergeTarget, 0.028)

    const chaosTarget = workStarting && !isGenerating ? 1 : isGenerating ? 0.12 : 0.38
    chaosRef.current = THREE.MathUtils.lerp(chaosRef.current, chaosTarget, 0.04)

    const converge = convergeRef.current
    const chaos = chaosRef.current

    const shapePos = targetForAgent(activeAgent, reactorPos, torusPos, octaPos, scratchTarget)

    const mainGeo = pointsRef.current?.geometry
    const glowGeo = glowPointsRef.current?.geometry
    if (mainGeo) {
      const pos = mainGeo.attributes.position.array
      const gpos = glowGeo?.attributes?.position?.array
      const phase = t * 0.35 + agentHue * 2

      for (let i = 0; i < COUNT; i++) {
        const bx = shapePos[i * 3]
        const by = shapePos[i * 3 + 1]
        const bz = shapePos[i * 3 + 2]

        const sx = idleScatterPos[i * 3]
        const sy = idleScatterPos[i * 3 + 1]
        const sz = idleScatterPos[i * 3 + 2]

        const rnd =
          Math.sin(i * 0.017 + t * 1.8) * 1.45 +
          Math.cos(i * 0.013 + t * 2.3) * 1.15 +
          Math.sin(t * 3.1 + i * 0.004) * 0.95

        const sx2 = sx + rnd * chaos * 0.88
        const sy2 = sy + rnd * chaos * 0.58
        const sz2 = sz + rnd * chaos * 0.88

        const n = Math.sin(i * 0.01 + phase) * 0.08 + Math.cos(i * 0.013 + t * 0.4) * 0.06
        const tx = THREE.MathUtils.lerp(sx2, bx * (1 + n * 0.14), converge)
        const ty = THREE.MathUtils.lerp(sy2, by * (1 + n * 0.11), converge)
        const tz = THREE.MathUtils.lerp(sz2, bz * (1 + n * 0.14), converge)

        pos[i * 3] = THREE.MathUtils.lerp(pos[i * 3], tx, 0.1)
        pos[i * 3 + 1] = THREE.MathUtils.lerp(pos[i * 3 + 1], ty, 0.1)
        pos[i * 3 + 2] = THREE.MathUtils.lerp(pos[i * 3 + 2], tz, 0.1)

        if (gpos) {
          const j = 0.04
          gpos[i * 3] = pos[i * 3] + (Math.sin(i * 0.31 + t) * 2 - 1) * j
          gpos[i * 3 + 1] = pos[i * 3 + 1] + (Math.cos(i * 0.27 + t * 1.1) * 2 - 1) * j
          gpos[i * 3 + 2] = pos[i * 3 + 2] + (Math.sin(i * 0.19 + t * 0.9) * 2 - 1) * j
        }
      }
      mainGeo.attributes.position.needsUpdate = true
      if (glowGeo) glowGeo.attributes.position.needsUpdate = true
    }

    const spin = 0.14 + converge * (isGenerating ? 0.55 : 0.38) + chaos * 0.07
    if (rootRef.current) {
      rootRef.current.rotation.y += delta * spin
      rootRef.current.rotation.x = Math.sin(t * 0.12) * 0.05 * (0.35 + chaos * 0.65) * (1 - converge * 0.45)
    }

    if (counterRef.current) {
      counterRef.current.rotation.y -= delta * spin * 0.28
    }

    if (coreRef.current) {
      const pulse = 1 + Math.sin(t * 2.8) * 0.14 * (0.45 + converge * 0.55)
      coreRef.current.scale.setScalar(pulse)
    }

    ringMeshRefs.current.forEach((mesh, i) => {
      if (!mesh) return
      const genBoost = isGenerating ? 1.4 : 1
      mesh.rotation.x = t * (0.11 + i * 0.032) * genBoost
      mesh.rotation.y = t * (0.17 + i * 0.042) * genBoost
      mesh.rotation.z = t * 0.065 + i * 0.095
      const ringScale = 0.32 + converge * 0.68 + chaos * 0.1
      mesh.scale.setScalar(ringScale)
    })
  })

  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(animPos, 3))
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    return g
  }, [animPos, colors])

  const glowGeo = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(glowPos, 3))
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    return g
  }, [glowPos, colors])

  return (
    <group ref={rootRef} position={[0, 0, 0]}>
      <group ref={counterRef}>
        <mesh ref={coreRef}>
          <sphereGeometry args={[0.52, 40, 40]} />
          <meshBasicMaterial color="#fde68a" transparent opacity={0.62} depthWrite={false} />
        </mesh>

        <points ref={pointsRef} geometry={geo}>
          <pointsMaterial
            size={0.028}
            vertexColors
            transparent
            opacity={0.92}
            sizeAttenuation
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </points>

        <points ref={glowPointsRef} geometry={glowGeo}>
          <pointsMaterial
            size={0.072}
            vertexColors
            transparent
            opacity={0.22}
            sizeAttenuation
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </points>

        {Array.from({ length: MESH_RINGS }).map((_, i) => {
          const r = 2.2 + i * 0.44
          return (
            <mesh
              key={i}
              ref={(el) => {
                ringMeshRefs.current[i] = el
              }}
              rotation={[Math.PI / 2.28 + i * 0.16, i * 0.36, 0]}
            >
              <torusGeometry args={[r, 0.005, 8, 160]} />
              <meshBasicMaterial color="#fbbf24" transparent opacity={0.38} depthWrite={false} />
            </mesh>
          )
        })}
      </group>

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -3.6, 0]}>
        <ringGeometry args={[5.5, 5.72, 96]} />
        <meshBasicMaterial color="#78350f" transparent opacity={0.22} side={THREE.DoubleSide} />
      </mesh>

      <gridHelper args={[28, 28, '#451a03', '#0c0a09']} position={[0, -3.6, 0]} />
    </group>
  )
}
