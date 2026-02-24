import 'dotenv/config'
import { app, BrowserWindow, screen } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { disconnectDb } from './db'
import { registerReviewHandlers } from './ipc/reviews'
import { registerWordbankHandlers } from './ipc/wordbank'
import { registerConversationHandlers } from './ipc/conversation'
import { registerTomHandlers } from './ipc/tom'
import { registerProfileHandlers } from './ipc/profile'
import { registerCurriculumHandlers } from './ipc/curriculum'
import { registerPragmaticHandlers } from './ipc/pragmatics'
import { registerContextLogHandlers } from './ipc/context-log'
import { registerDashboardHandlers } from './ipc/dashboard'
import { registerNarrativeHandlers } from './ipc/narrative'
import { registerChatHandlers } from './ipc/chat'
import { registerAuthHandlers } from './ipc/auth'
import { registerOnboardingHandlers } from './ipc/onboarding'
import { createLogger } from './logger'

const log = createLogger('app')

function getWindowBounds(): { width: number; height: number } {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize
  return {
    width: Math.min(1280, width),
    height: Math.min(900, height),
  }
}

function createWindow(): void {
  const isMac = process.platform === 'darwin'
  const { width, height } = getWindowBounds()

  const mainWindow = new BrowserWindow({
    width,
    height,
    minWidth: 800,
    minHeight: 600,
    ...(isMac && {
      titleBarStyle: 'hiddenInset',
      trafficLightPosition: { x: 16, y: 18 },
    }),
    acceptFirstMouse: true,
    webPreferences: {
      preload: join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  log.info('Window created', { platform: process.platform, dev: is.dev, width, height })
}

app.whenReady().then(() => {
  log.info('App ready, registering IPC handlers')

  registerReviewHandlers()
  registerWordbankHandlers()
  registerConversationHandlers()
  registerTomHandlers()
  registerProfileHandlers()
  registerCurriculumHandlers()
  registerPragmaticHandlers()
  registerContextLogHandlers()
  registerDashboardHandlers()
  registerNarrativeHandlers()
  registerChatHandlers()
  registerAuthHandlers()
  registerOnboardingHandlers()

  log.info('All IPC handlers registered')

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      log.info('App activated, creating new window')
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  log.info('All windows closed')
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('will-quit', async () => {
  log.info('App will quit, disconnecting DB')
  await disconnectDb()
  log.info('DB disconnected, quitting')
})