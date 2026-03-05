'use client'

import { useMemo, useCallback, useState } from 'react'
import { X, Check, ChevronDown, ChevronRight } from 'lucide-react'
import type { UIMessage } from 'ai'
import type { SessionPlan } from '@/lib/session-plan'
import { getToolZone } from '@/lib/tool-zones'
import { usePanel } from '@/hooks/use-panel'
import { ScrollArea } from '@/components/ui/scroll-area'
import { VocabularyCard } from '@/components/chat/vocabulary-card'
import { GrammarNote } from '@/components/chat/grammar-note'
import { CorrectionCard } from '@/components/chat/correction-card'
import { cn } from '@/lib/utils'

interface LearningPanelProps {
  messages: UIMessage[]
  plan: SessionPlan | null
  sessionId: string | null
  onPlanUpdate?: (updates: Partial<SessionPlan>) => void
}

export function LearningPanel({ messages, plan, onPlanUpdate }: LearningPanelProps) {
  const panel = usePanel()
  const [planCollapsed, setPlanCollapsed] = useState(false)

  // Extract panel-zone tool outputs from messages
  const panelCards = useMemo(() => {
    const cards: Array<{ id: string; toolName: string; output: unknown }> = []
    for (const msg of messages) {
      if (msg.role !== 'assistant') continue
      for (let i = 0; i < msg.parts.length; i++) {
        const part = msg.parts[i] as { type: string; state?: string; output?: unknown }
        if (!part.type.startsWith('tool-')) continue
        const toolName = part.type.replace('tool-', '')
        if (getToolZone(toolName) !== 'panel') continue
        if (part.state === 'output-available' && part.output) {
          cards.push({ id: `${msg.id}-${i}`, toolName, output: part.output })
        }
      }
    }
    return cards
  }, [messages])

  const completedCount = plan?.milestones?.filter((m) => m.completed).length ?? 0
  const totalMilestones = plan?.milestones?.length ?? 0

  const handleMilestoneToggle = useCallback(
    (index: number) => {
      if (!plan?.milestones || !onPlanUpdate) return
      const updated = plan.milestones.map((m, i) =>
        i === index ? { ...m, completed: !m.completed } : m
      )
      onPlanUpdate({ milestones: updated })
    },
    [plan, onPlanUpdate]
  )

  return (
    <div className="h-full flex flex-col bg-bg">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border shrink-0">
        <span className="text-[13px] font-medium text-text-primary">Session</span>
        <button
          className="w-6 h-6 flex items-center justify-center rounded text-text-muted hover:text-text-primary hover:bg-bg-hover transition-colors"
          onClick={panel.close}
        >
          <X size={14} />
        </button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {/* Plan section */}
          {plan && (
            <div>
              <button
                className="flex items-center gap-1.5 text-[12px] font-medium text-text-muted uppercase tracking-wide mb-2 hover:text-text-primary transition-colors"
                onClick={() => setPlanCollapsed((v) => !v)}
              >
                {planCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                Plan
                {totalMilestones > 0 && (
                  <span className="text-text-placeholder ml-1">
                    {completedCount}/{totalMilestones}
                  </span>
                )}
              </button>

              {!planCollapsed && (
                <div className="space-y-3">
                  {/* Focus */}
                  <p className="text-[13px] text-text-secondary leading-snug">{plan.focus}</p>

                  {/* Goals */}
                  {plan.goals?.length > 0 && (
                    <div>
                      <span className="text-[11px] font-medium text-text-muted uppercase tracking-wide">Goals</span>
                      <ul className="mt-1 space-y-1">
                        {plan.goals.map((goal, i) => (
                          <li key={i} className="text-[12.5px] text-text-secondary leading-snug flex items-start gap-1.5">
                            <span className="text-text-placeholder mt-0.5">-</span>
                            {goal}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Milestones */}
                  {plan.milestones?.length > 0 && (
                    <div>
                      <span className="text-[11px] font-medium text-text-muted uppercase tracking-wide">Milestones</span>
                      <ul className="mt-1.5 space-y-1">
                        {plan.milestones.map((m, i) => (
                          <li key={i} className="flex items-start gap-2">
                            <button
                              className={cn(
                                'w-4 h-4 rounded border flex items-center justify-center shrink-0 mt-0.5 transition-colors',
                                m.completed
                                  ? 'bg-accent-brand border-accent-brand'
                                  : 'border-border-strong hover:border-accent-brand'
                              )}
                              onClick={() => handleMilestoneToggle(i)}
                            >
                              {m.completed && <Check size={10} className="text-white" />}
                            </button>
                            <span
                              className={cn(
                                'text-[12.5px] leading-snug',
                                m.completed ? 'text-text-muted line-through' : 'text-text-secondary'
                              )}
                            >
                              {m.description}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Target vocabulary */}
                  {plan.targetVocabulary?.length ? (
                    <div>
                      <span className="text-[11px] font-medium text-text-muted uppercase tracking-wide">Vocabulary targets</span>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {plan.targetVocabulary.map((word, i) => (
                          <span
                            key={i}
                            className="inline-block px-2 py-0.5 rounded-full bg-blue-soft text-blue text-[11.5px] font-medium font-jp"
                          >
                            {word}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {/* Target grammar */}
                  {plan.targetGrammar?.length ? (
                    <div>
                      <span className="text-[11px] font-medium text-text-muted uppercase tracking-wide">Grammar targets</span>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {plan.targetGrammar.map((pattern, i) => (
                          <span
                            key={i}
                            className="inline-block px-2 py-0.5 rounded-full bg-purple-soft text-purple text-[11.5px] font-medium font-jp"
                          >
                            {pattern}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {/* Scenario */}
                  {plan.scenario && (
                    <div className="text-[12px] text-text-muted bg-bg-secondary rounded-lg p-2.5 space-y-0.5">
                      <div><span className="font-medium">Setting:</span> {plan.scenario.setting}</div>
                      <div><span className="font-medium">Role:</span> {plan.scenario.aiRole}</div>
                      <div><span className="font-medium">Your goal:</span> {plan.scenario.learnerGoal}</div>
                      <div><span className="font-medium">Register:</span> {plan.scenario.register}</div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Divider */}
          {plan && panelCards.length > 0 && (
            <div className="border-t border-border" />
          )}

          {/* Cards section */}
          {panelCards.length > 0 && (
            <div>
              <span className="text-[12px] font-medium text-text-muted uppercase tracking-wide mb-2 block">
                Cards ({panelCards.length})
              </span>
              <div className="space-y-3">
                {panelCards.map((card) => (
                  <PanelCard key={card.id} toolName={card.toolName} output={card.output} />
                ))}
              </div>
            </div>
          )}

          {/* Empty state */}
          {!plan && panelCards.length === 0 && (
            <div className="text-center py-8">
              <p className="text-[13px] text-text-muted">Session content will appear here.</p>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}

function PanelCard({ toolName, output }: { toolName: string; output: unknown }) {
  const data = output as Record<string, unknown>

  if (toolName === 'showVocabularyCard') {
    return (
      <VocabularyCard
        word={data.word as string}
        reading={data.reading as string | undefined}
        meaning={data.meaning as string}
        partOfSpeech={data.partOfSpeech as string | undefined}
        exampleSentence={data.exampleSentence as string | undefined}
        notes={data.notes as string | undefined}
      />
    )
  }

  if (toolName === 'showGrammarNote') {
    return (
      <GrammarNote
        pattern={data.pattern as string}
        meaning={data.meaning as string}
        formation={data.formation as string}
        examples={data.examples as Array<{ japanese: string; english: string }>}
        level={data.level as string | undefined}
      />
    )
  }

  if (toolName === 'showCorrection') {
    return (
      <CorrectionCard
        original={data.original as string}
        corrected={data.corrected as string}
        explanation={data.explanation as string}
        grammarPoint={data.grammarPoint as string | undefined}
      />
    )
  }

  return null
}
