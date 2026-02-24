import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '@shared/types'
import type { ContextLogEntry, ContextType, LearningModality } from '@shared/types'
import { getDb } from '../db'
import { getCurrentUserId } from '../auth-state'
import { createLogger } from '../logger'

const log = createLogger('ipc:context-log')

export function registerContextLogHandlers(): void {
  ipcMain.handle(
    IPC_CHANNELS.CONTEXT_LOG_LIST,
    async (
      _event,
      params: {
        itemId: number
        itemType: 'lexical' | 'grammar'
        limit?: number
        offset?: number
      }
    ): Promise<{ entries: ContextLogEntry[]; total: number }> => {
      log.info('contextLog:list started', { itemId: params.itemId, itemType: params.itemType })
      const db = getDb()
      const where =
        params.itemType === 'lexical'
          ? { lexicalItemId: params.itemId }
          : { grammarItemId: params.itemId }

      const [entries, total] = await Promise.all([
        db.itemContextLog.findMany({
          where,
          orderBy: { timestamp: 'desc' },
          take: params.limit ?? 50,
          skip: params.offset ?? 0,
        }),
        db.itemContextLog.count({ where }),
      ])

      log.info('contextLog:list completed', { itemId: params.itemId, entries: entries.length, total })
      return {
        entries: entries.map((e) => ({
          id: e.id,
          contextType: e.contextType as ContextType,
          modality: e.modality as LearningModality,
          wasProduction: e.wasProduction,
          wasSuccessful: e.wasSuccessful,
          contextQuote: e.contextQuote,
          sessionId: e.sessionId,
          timestamp: e.timestamp.toISOString(),
          lexicalItemId: e.lexicalItemId,
          grammarItemId: e.grammarItemId,
        })),
        total,
      }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.CONTEXT_LOG_ADD,
    async (
      _event,
      params: {
        itemId: number
        itemType: 'lexical' | 'grammar'
        contextType: ContextType
        modality: LearningModality
        wasProduction: boolean
        wasSuccessful?: boolean
        contextQuote?: string
        sessionId?: string
      }
    ): Promise<ContextLogEntry> => {
      log.info('contextLog:add started', {
        itemId: params.itemId,
        itemType: params.itemType,
        contextType: params.contextType,
        modality: params.modality,
      })
      const db = getDb()

      const entry = await db.itemContextLog.create({
        data: {
          userId: getCurrentUserId(),
          contextType: params.contextType,
          modality: params.modality,
          wasProduction: params.wasProduction,
          wasSuccessful: params.wasSuccessful ?? null,
          contextQuote: params.contextQuote ?? null,
          sessionId: params.sessionId ?? null,
          lexicalItemId: params.itemType === 'lexical' ? params.itemId : null,
          grammarItemId: params.itemType === 'grammar' ? params.itemId : null,
        },
      })

      log.info('contextLog:add completed', { entryId: entry.id })

      // Update item's contextTypes and contextCount
      if (params.itemType === 'lexical') {
        const item = await db.lexicalItem.findUniqueOrThrow({
          where: { id: params.itemId },
        })
        if (!item.contextTypes.includes(params.contextType)) {
          await db.lexicalItem.update({
            where: { id: params.itemId },
            data: {
              contextTypes: [...item.contextTypes, params.contextType],
              contextCount: item.contextTypes.length + 1,
            },
          })
        }
      } else {
        const item = await db.grammarItem.findUniqueOrThrow({
          where: { id: params.itemId },
        })
        if (!item.contextTypes.includes(params.contextType)) {
          const isNovel = item.contextTypes.length > 0 // first context is not novel, subsequent ones are
          await db.grammarItem.update({
            where: { id: params.itemId },
            data: {
              contextTypes: [...item.contextTypes, params.contextType],
              contextCount: item.contextTypes.length + 1,
              ...(isNovel ? { novelContextCount: { increment: 1 } } : {}),
            },
          })
        }
      }

      return {
        id: entry.id,
        contextType: entry.contextType as ContextType,
        modality: entry.modality as LearningModality,
        wasProduction: entry.wasProduction,
        wasSuccessful: entry.wasSuccessful,
        contextQuote: entry.contextQuote,
        sessionId: entry.sessionId,
        timestamp: entry.timestamp.toISOString(),
        lexicalItemId: entry.lexicalItemId,
        grammarItemId: entry.grammarItemId,
      }
    }
  )
}
