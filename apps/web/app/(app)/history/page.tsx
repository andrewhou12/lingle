'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Clock, Target, AlertCircle } from 'lucide-react'
import { api } from '@/lib/api'
import { Skeleton } from '@/components/skeleton'

type SessionListItem = Awaited<ReturnType<typeof api.conversationList>>[number]

export default function HistoryPage() {
  const [sessions, setSessions] = useState<SessionListItem[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    api.conversationList().then((data) => {
      setSessions(data)
      setIsLoading(false)
    }).catch((err) => {
      console.error('Failed to load sessions:', err)
      setIsLoading(false)
    })
  }, [])

  return (
    <div>
      <h1 className="text-[28px] font-bold mb-4">Session History</h1>

      {isLoading ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex gap-4 items-center">
              <Skeleton width={120} height={16} />
              <Skeleton width={80} height={16} />
              <Skeleton width={200} height={16} />
              <Skeleton width={60} height={20} borderRadius={10} />
            </div>
          ))}
        </div>
      ) : sessions.length === 0 ? (
        <p className="text-text-muted">No sessions yet. Start a conversation to see your history here.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead>Focus</TableHead>
              <TableHead>Challenges</TableHead>
              <TableHead>Errors</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sessions.map((session) => {
              const date = new Date(session.timestamp)
              const mins = session.durationSeconds ? Math.max(1, Math.round(session.durationSeconds / 60)) : null
              return (
                <TableRow key={session.id}>
                  <TableCell>
                    <Link
                      href={`/history/${session.id}`}
                      className="no-underline text-accent-warm"
                    >
                      <span className="text-[13px] font-medium block">
                        {date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                      </span>
                      <span className="text-[11px] text-text-muted block">
                        {date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </Link>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Clock size={12} className="text-text-muted" />
                      <span className="text-[13px] text-text-muted">{mins ? `${mins}m` : '\u2014'}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="text-[13px]">{session.sessionFocus || '\u2014'}</span>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Target size={12} className="text-green-600" />
                      <span className="text-[13px]">
                        {session.targetsHitCount}/{session.targetsPlannedCount}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {session.errorsLoggedCount > 0 ? (
                      <div className="flex items-center gap-1">
                        <AlertCircle size={12} className="text-accent-warm" />
                        <span className="text-[13px] text-accent-warm">{session.errorsLoggedCount}</span>
                      </div>
                    ) : (
                      <span className="text-[13px] text-text-muted">0</span>
                    )}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
