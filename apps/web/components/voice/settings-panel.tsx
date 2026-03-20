'use client'

import type { ReactNode } from 'react'

interface SettingsPanelProps {
  isOpen: boolean
  onClose: () => void
  showTranscript: boolean
  onTranscriptChange: (show: boolean) => void
}

function ToggleSwitch({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!on)}
      className="w-9 h-5 rounded-[10px] border-none shrink-0 cursor-pointer relative"
      style={{
        background: on ? 'var(--text-primary)' : '#e5e5e3',
        transition: 'background 0.18s ease',
      }}
    >
      <div
        className="absolute top-[2px] w-4 h-4 rounded-full bg-white shadow-sm"
        style={{
          left: on ? 18 : 2,
          transition: 'left 0.18s ease',
        }}
      />
    </button>
  )
}

function SettingsRow({
  label,
  sub,
  right,
  onClick,
}: {
  label: string
  sub?: string
  right?: ReactNode
  onClick?: () => void
}) {
  return (
    <div
      onClick={onClick}
      className="flex items-center justify-between py-2.5 px-5 hover:bg-bg-secondary transition-colors"
      style={{ cursor: onClick ? 'pointer' : 'default' }}
    >
      <div>
        <div className="text-[13px] text-text-primary font-normal mb-px">{label}</div>
        {sub && <div className="text-[11px] text-text-muted">{sub}</div>}
      </div>
      {right}
    </div>
  )
}

function SectionTitle({ title }: { title: string }) {
  return (
    <div className="px-5 pt-3 pb-1 text-[11px] text-text-muted font-mono uppercase tracking-wider">
      {title}
    </div>
  )
}

export function SettingsPanel({ isOpen, onClose, showTranscript, onTranscriptChange }: SettingsPanelProps) {
  if (!isOpen) return null

  return (
    <div
      className="fixed bottom-20 right-5 w-[296px] bg-bg-pure border border-border rounded-xl shadow-pop z-[700] overflow-hidden"
      style={{ animation: 'session-panel-up 0.16s ease both' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-border">
        <span className="text-[14px] font-semibold text-text-primary tracking-tight">Settings</span>
        <button
          onClick={onClose}
          className="w-6 h-6 flex items-center justify-center rounded-md border-none bg-transparent text-text-muted cursor-pointer hover:bg-bg-secondary transition-colors"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <SectionTitle title="Display" />
      <SettingsRow
        label="Show transcript"
        sub="What the tutor is saying, below the orb"
        right={<ToggleSwitch on={showTranscript} onChange={onTranscriptChange} />}
        onClick={() => onTranscriptChange(!showTranscript)}
      />

      <div className="h-px bg-border" />
      <SectionTitle title="Audio" />
      <SettingsRow
        label="Microphone"
        sub="Default Microphone"
        right={
          <span className="flex items-center gap-0.5 text-[11px] text-text-muted">
            Change
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </span>
        }
      />
      <SettingsRow
        label="Speaker"
        sub="Default System Output"
        right={
          <span className="flex items-center gap-0.5 text-[11px] text-text-muted">
            Change
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </span>
        }
      />

      <div className="px-5 pt-3 pb-4">
        <p className="text-[12px] text-text-muted leading-relaxed m-0">
          Changes apply at the start of your next exchange.
        </p>
      </div>
    </div>
  )
}
