import React, { useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html, Text } from '@react-three/drei'
import * as THREE from 'three'

/* ─── Single Agent Desk (with chair, voxel person, thought cloud) ─── */
function Desk({ position, rotation, label, active, agentColor, thought, onSelect }) {
  const headRef = useRef()
  const glowRef = useRef()
  const armLRef = useRef()
  const armRRef = useRef()
  const cloudRef = useRef()

  useFrame((state) => {
    const t = state.clock.elapsedTime
    if (active) {
      if (headRef.current) {
        headRef.current.rotation.y = Math.sin(t * 3) * 0.15
        headRef.current.rotation.x = Math.sin(t * 5) * 0.08
      }
      if (armLRef.current) armLRef.current.rotation.x = Math.sin(t * 18) * 0.25 - 0.3
      if (armRRef.current) armRRef.current.rotation.x = Math.sin(t * 18 + Math.PI) * 0.25 - 0.3
      if (glowRef.current) glowRef.current.intensity = Math.sin(t * 4) * 0.6 + 1.8
      if (cloudRef.current) cloudRef.current.position.y = Math.sin(t * 2) * 0.06
    } else {
      if (headRef.current) {
        headRef.current.rotation.y = THREE.MathUtils.lerp(headRef.current.rotation.y, 0, 0.08)
        headRef.current.rotation.x = THREE.MathUtils.lerp(headRef.current.rotation.x, 0, 0.08)
      }
      if (armLRef.current) armLRef.current.rotation.x = THREE.MathUtils.lerp(armLRef.current.rotation.x, 0, 0.08)
      if (armRRef.current) armRRef.current.rotation.x = THREE.MathUtils.lerp(armRRef.current.rotation.x, 0, 0.08)
      if (glowRef.current) glowRef.current.intensity = THREE.MathUtils.lerp(glowRef.current.intensity, 0.15, 0.08)
    }
  })

  const truncate = (s, n) => s && s.length > n ? s.substring(0, n) + '…' : s

  return (
    <group position={position} rotation={rotation} onClick={(e) => { e.stopPropagation(); onSelect?.() }}>

      {/* ── Desk surface ── */}
      <mesh position={[0, 0, 0]} castShadow receiveShadow>
        <boxGeometry args={[2.6, 0.12, 1.2]} />
        <meshStandardMaterial color="#1e293b" metalness={0.7} roughness={0.25} />
      </mesh>

      {/* Desk legs */}
      {[[-1.15, -0.85, -0.45], [1.15, -0.85, -0.45], [-1.15, -0.85, 0.45], [1.15, -0.85, 0.45]].map((p, i) => (
        <mesh key={i} position={p} castShadow>
          <boxGeometry args={[0.06, 1.6, 0.06]} />
          <meshStandardMaterial color="#334155" />
        </mesh>
      ))}

      {/* ── Chair ── */}
      <group position={[0, -0.15, 1.1]}>
        {/* seat */}
        <mesh castShadow>
          <boxGeometry args={[0.55, 0.08, 0.5]} />
          <meshStandardMaterial color="#475569" metalness={0.5} roughness={0.4} />
        </mesh>
        {/* backrest */}
        <mesh position={[0, 0.35, -0.22]} castShadow>
          <boxGeometry args={[0.55, 0.6, 0.06]} />
          <meshStandardMaterial color="#475569" metalness={0.5} roughness={0.4} />
        </mesh>
        {/* chair legs */}
        {[[-0.22, -0.45, -0.18], [0.22, -0.45, -0.18], [-0.22, -0.45, 0.18], [0.22, -0.45, 0.18]].map((p, i) => (
          <mesh key={i} position={p} castShadow>
            <cylinderGeometry args={[0.025, 0.025, 0.8, 6]} />
            <meshStandardMaterial color="#64748b" />
          </mesh>
        ))}
      </group>

      {/* ── Monitor ── */}
      <mesh position={[0, 0.45, -0.35]} rotation={[0.12, 0, 0]} castShadow>
        <boxGeometry args={[1.1, 0.65, 0.04]} />
        <meshStandardMaterial color="#0f172a" />
      </mesh>
      {/* screen glow */}
      <mesh position={[0, 0.45, -0.32]} rotation={[0.12, 0, 0]}>
        <planeGeometry args={[1.02, 0.57]} />
        <meshBasicMaterial color={active ? agentColor : '#111827'} />
      </mesh>
      {/* monitor stand */}
      <mesh position={[0, 0.12, -0.35]}>
        <boxGeometry args={[0.12, 0.24, 0.08]} />
        <meshStandardMaterial color="#1e293b" />
      </mesh>

      {/* screen-glow pointlight */}
      <pointLight ref={glowRef} position={[0, 0.45, 0.3]} color={agentColor} distance={3.5} />

      {/* ── Voxel Person (sitting on the chair) ── */}
      <group position={[0, 0.1, 0.7]}>
        {/* Head */}
        <mesh ref={headRef} position={[0, 0.72, 0]} castShadow>
          <boxGeometry args={[0.28, 0.28, 0.28]} />
          <meshStandardMaterial color="#fcd5ce" roughness={0.7} />
        </mesh>
        {/* Eyes */}
        <mesh position={[-0.07, 0.74, -0.14]}>
          <boxGeometry args={[0.05, 0.05, 0.02]} />
          <meshBasicMaterial color="#1e293b" />
        </mesh>
        <mesh position={[0.07, 0.74, -0.14]}>
          <boxGeometry args={[0.05, 0.05, 0.02]} />
          <meshBasicMaterial color="#1e293b" />
        </mesh>
        {/* Body */}
        <mesh position={[0, 0.35, 0]} castShadow>
          <boxGeometry args={[0.34, 0.45, 0.2]} />
          <meshStandardMaterial color={agentColor} roughness={0.5} metalness={0.2} />
        </mesh>
        {/* Left Arm */}
        <group position={[-0.24, 0.5, 0]}>
          <mesh ref={armLRef} position={[0, -0.16, 0]} castShadow>
            <boxGeometry args={[0.1, 0.36, 0.1]} />
            <meshStandardMaterial color={agentColor} roughness={0.5} metalness={0.2} />
          </mesh>
        </group>
        {/* Right Arm */}
        <group position={[0.24, 0.5, 0]}>
          <mesh ref={armRRef} position={[0, -0.16, 0]} castShadow>
            <boxGeometry args={[0.1, 0.36, 0.1]} />
            <meshStandardMaterial color={agentColor} roughness={0.5} metalness={0.2} />
          </mesh>
        </group>
        {/* Legs (seated) */}
        <mesh position={[-0.1, 0.04, 0.05]} castShadow>
          <boxGeometry args={[0.12, 0.2, 0.12]} />
          <meshStandardMaterial color="#334155" />
        </mesh>
        <mesh position={[0.1, 0.04, 0.05]} castShadow>
          <boxGeometry args={[0.12, 0.2, 0.12]} />
          <meshStandardMaterial color="#334155" />
        </mesh>
      </group>

      {/* ── Label ── */}
      <Text
        position={[0, 1.35, -0.3]}
        fontSize={0.22}
        color={active ? agentColor : '#94a3b8'}
        anchorX="center"
        anchorY="middle"
      >
        {label}
      </Text>

      {/* ── Thought bubble (visible when agent is active + has a thought) ── */}
      {active && thought && (
        <group ref={cloudRef} position={[0.4, 2.0, 0.7]}>
          {/* small connecting circles */}
          <mesh position={[-0.25, -0.35, 0]}>
            <sphereGeometry args={[0.06, 8, 8]} />
            <meshBasicMaterial color="#ffffff" transparent opacity={0.7} />
          </mesh>
          <mesh position={[-0.12, -0.2, 0]}>
            <sphereGeometry args={[0.09, 8, 8]} />
            <meshBasicMaterial color="#ffffff" transparent opacity={0.7} />
          </mesh>
          {/* Html overlay */}
          <Html center distanceFactor={6} zIndexRange={[100, 0]}>
            <div className="thought-bubble" style={{ borderColor: agentColor }}>
              {truncate(thought, 100)}
            </div>
          </Html>
        </group>
      )}
    </group>
  )
}

/* ─── Floor grid ─── */
function Floor() {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.65, 0]} receiveShadow>
        <planeGeometry args={[60, 60]} />
        <meshStandardMaterial color="#020617" metalness={0.3} roughness={0.9} />
      </mesh>
      <gridHelper args={[60, 60, '#1e293b', '#020617']} position={[0, -1.64, 0]} />
    </group>
  )
}

/* ─── Exported Scene ─── */
export default function OfficeScene({ activeAgent, agentThoughts, onSelectAgent }) {
  return (
    <group position={[0, 0, -2]}>
      <Desk
        position={[-5.5, 0, -0.5]}
        rotation={[0, Math.PI / 7, 0]}
        label="ARCHITECT"
        active={activeAgent === 'Architect'}
        agentColor="#fbbf24"
        thought={agentThoughts?.Architect}
        onSelect={() => onSelectAgent?.('Architect')}
      />
      <Desk
        position={[0, 0, 2.5]}
        rotation={[0, 0, 0]}
        label="DEVELOPER"
        active={activeAgent === 'Developer'}
        agentColor="#22d3ee"
        thought={agentThoughts?.Developer}
        onSelect={() => onSelectAgent?.('Developer')}
      />
      <Desk
        position={[5.5, 0, -0.5]}
        rotation={[0, -Math.PI / 7, 0]}
        label="QA ENGINEER"
        active={activeAgent === 'QA'}
        agentColor="#f43f5e"
        thought={agentThoughts?.QA}
        onSelect={() => onSelectAgent?.('QA')}
      />
      <Floor />
    </group>
  )
}
