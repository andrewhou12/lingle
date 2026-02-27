import type { FrontierData } from '@linguist/shared/types'
import { LevelProgressBar } from './components/level-progress-bar'
import { MasteryPipeline } from './components/mastery-pipeline'
import { CeilingComparison } from './components/ceiling-comparison'

interface LevelBarsViewProps {
  data: FrontierData
}

export function LevelBarsView({ data }: LevelBarsViewProps) {
  const { bubble, profile, masteryDistribution } = data

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <span className="text-[13px] font-bold text-text-muted mb-1">
          Level Coverage
        </span>
        {bubble.levelBreakdowns.map((level) => (
          <LevelProgressBar
            key={level.level}
            level={level}
            isCurrent={level.level === bubble.currentLevel}
            isFrontier={level.level === bubble.frontierLevel}
            isAboveFrontier={isAbove(level.level, bubble.frontierLevel)}
          />
        ))}
        <div className="flex gap-3 mt-1">
          <span className="text-[11px] text-text-muted">
            Dark = production ready | Light = recognition
          </span>
        </div>
      </div>

      <hr className="border-t border-border m-0" />

      <div className="flex flex-col gap-2">
        <span className="text-[13px] font-bold text-text-muted">
          Mastery Distribution
        </span>
        <MasteryPipeline distribution={masteryDistribution} />
      </div>

      <hr className="border-t border-border m-0" />

      <div className="flex flex-col gap-2">
        <span className="text-[13px] font-bold text-text-muted">
          Ceiling
        </span>
        <CeilingComparison
          comprehensionCeiling={profile.comprehensionCeiling}
          productionCeiling={profile.productionCeiling}
        />
      </div>
    </div>
  )
}

const LEVEL_ORDER = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']

function isAbove(level: string, frontier: string): boolean {
  const li = LEVEL_ORDER.indexOf(level)
  const fi = LEVEL_ORDER.indexOf(frontier)
  if (li === -1 || fi === -1) return false
  return li > fi
}
