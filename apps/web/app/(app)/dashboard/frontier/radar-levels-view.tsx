import type { FrontierData } from '@linguist/shared/types'
import { RadarChart } from './components/radar-chart'
import { LevelProgressBar } from './components/level-progress-bar'

const LEVEL_ORDER = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']

export function RadarLevelsView({ data }: { data: FrontierData }) {
  const { bubble, profile } = data

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-5 flex-wrap items-start">
        <div className="flex flex-col items-center gap-2 flex-[1_1_200px]">
          <span className="text-[13px] font-bold text-text-muted">
            Skill Balance
          </span>
          <div className="w-full max-w-[220px]">
            <RadarChart
              reading={profile.readingLevel}
              writing={profile.writingLevel}
              listening={profile.listeningLevel}
              speaking={profile.speakingLevel}
            />
          </div>
          <div className="flex gap-3 flex-wrap justify-center">
            <span className="text-[11px] text-text-muted">Reading: {Math.round(profile.readingLevel * 100)}%</span>
            <span className="text-[11px] text-text-muted">Writing: {Math.round(profile.writingLevel * 100)}%</span>
            <span className="text-[11px] text-text-muted">Listening: {Math.round(profile.listeningLevel * 100)}%</span>
            <span className="text-[11px] text-text-muted">Speaking: {Math.round(profile.speakingLevel * 100)}%</span>
          </div>
        </div>

        <div className="flex flex-col gap-1 flex-[1_1_250px]">
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
        </div>
      </div>
    </div>
  )
}

function isAbove(level: string, frontier: string): boolean {
  const li = LEVEL_ORDER.indexOf(level)
  const fi = LEVEL_ORDER.indexOf(frontier)
  if (li === -1 || fi === -1) return false
  return li > fi
}
