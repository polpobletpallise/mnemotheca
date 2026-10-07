import path from 'path'
import fs from 'fs'
import { pathToFileURL } from 'url'
import exifr from 'exifr'
import { app, BrowserWindow, ipcMain, dialog, protocol, net, shell } from 'electron'
import electronUpdater from 'electron-updater'
import serve from 'electron-serve'
import { getMediaType, type MediaType } from '../shared/media-formats.js'
import { createWindow } from './helpers/create-window'
import log from 'electron-log'

const isProd = process.env.NODE_ENV === 'production'
const { autoUpdater } = electronUpdater

log.transports.file.level = 'info'
autoUpdater.logger = log

autoUpdater.autoDownload = true

autoUpdater.on('checking-for-update', () => {
  log.info('Comprobando actualizaciones...')
})

autoUpdater.on('update-available', (info) => {
  log.info('Actualización disponible:', info.version)
})

autoUpdater.on('update-not-available', (info) => {
  log.info('No hay actualizaciones disponibles. Versión:', info.version)
})

autoUpdater.on('download-progress', (progress) => {
  log.info(`Descargando actualización: ${progress.percent.toFixed(1)}%`)

  const mainWindow = BrowserWindow.getAllWindows()[0]

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update-download-progress', progress.percent)
  }
})

autoUpdater.on('update-downloaded', (info) => {
  log.info('Actualización descargada:', info.version)
  autoUpdater.quitAndInstall()
})

autoUpdater.on('error', (error) => {
  log.error('Error al actualizar Mnemotheca:', error)
})

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'local-media',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
  },
])

if (isProd) {
  serve({ directory: 'app' })
} else {
  app.setPath('userData', `${app.getPath('userData')} (development)`)
}

// Registrar el protocolo local
app.whenReady().then(() => {
  protocol.handle('local-media', (request) => {
    let filePath: string

    try {
      const mediaUrl = new URL(request.url)
      if (mediaUrl.hostname !== 'media') {
        return new Response('Ruta multimedia no válida.', { status: 400 })
      }
      filePath = decodeURIComponent(mediaUrl.pathname.slice(1))
    } catch (error) {
      console.error('No se pudo interpretar la URL multimedia:', error)
      return new Response('Ruta multimedia no válida.', { status: 400 })
    }

    if (!path.isAbsolute(filePath)) {
      return new Response('Ruta multimedia no válida.', { status: 400 })
    }

    return net.fetch(pathToFileURL(filePath).toString(), { headers: request.headers })
  })
})

  ; (async () => {
    await app.whenReady()

    if (app.isPackaged) {
      log.info('Aplicación empaquetada. Comprobando actualizaciones...')
      autoUpdater.checkForUpdates().catch((error: unknown) => {
        log.error('No se pudieron comprobar las actualizaciones:', error)
      })
    }

    const mainWindow = createWindow('main', {
      width: 1000,
      height: 600,
      title: 'Mnemotheca',
      autoHideMenuBar: true,
      webPreferences: {
        preload: path.join(import.meta.dirname, 'preload.js'),
      },
    })
    mainWindow.on('page-title-updated', (event) => {
      event.preventDefault()
      mainWindow.setTitle('Mnemotheca')
    })
    mainWindow.maximize()

    if (isProd) {
      await mainWindow.loadURL('app://./home')
    } else {
      const port = process.argv[2]
      await mainWindow.loadURL(`http://localhost:${port}/home`)
    }

  })().catch((error: unknown) => {
    console.error('Error al iniciar la ventana principal:', error)
    app.quit()
  })

app.on('window-all-closed', () => {
  app.quit()
})

// ==========================================
// REGISTRO DE HANDLERS IPC (Asegúrate de que están aquí abajo)
// ==========================================

// Al final de main/main.ts
console.log('>>> CARGANDO HANDLERS IPC DE ELECTRON <<<')

ipcMain.handle('change-zoom', (event, direction: unknown) => {
  if (direction !== 'in' && direction !== 'out') {
    throw new TypeError('Invalid zoom direction.')
  }

  const currentZoom = event.sender.getZoomFactor()
  const zoomChange = direction === 'in' ? 0.1 : -0.1
  const nextZoom = Math.min(2.5, Math.max(0.5, Math.round((currentZoom + zoomChange) * 10) / 10))
  event.sender.setZoomFactor(nextZoom)
  return nextZoom
})

ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory'],
  })
  if (result.canceled) return null
  return result.filePaths[0]
})

ipcMain.handle('get-special-folders', () => {
  const specialFolderTypes = ['desktop', 'downloads', 'documents', 'pictures', 'music', 'videos'] as const
  return specialFolderTypes.flatMap((type) => {
    try {
      return [{ type, path: app.getPath(type) }]
    } catch (error) {
      console.warn(`Could not resolve the ${type} folder:`, error)
      return []
    }
  })
})

ipcMain.handle('open-location', async (_event, targetPath: unknown) => {
  if (typeof targetPath !== 'string' || !path.isAbsolute(targetPath)) {
    throw new TypeError('La ruta que se quiere abrir no es válida.')
  }

  const stat = await fs.promises.stat(targetPath)
  if (stat.isDirectory()) {
    const errorMessage = await shell.openPath(targetPath)
    if (errorMessage) {
      throw new Error(`No se pudo abrir la carpeta ${targetPath}: ${errorMessage}`)
    }
    return
  }

  shell.showItemInFolder(targetPath)
})

interface MediaFile {
  name: string
  path: string
  type: MediaType
  folder: string
  date: string
}

async function getCaptureDate(filePath: string, fileType: MediaType, fallbackDate: Date): Promise<Date> {
  if (fileType === 'image') {
    try {
      const metadata = await exifr.parse(filePath, ['DateTimeOriginal', 'CreateDate'])
      const captureDate = metadata?.DateTimeOriginal ?? metadata?.CreateDate
      if (captureDate instanceof Date && !Number.isNaN(captureDate.getTime())) {
        return captureDate
      }
    } catch (error) {
      console.warn(`No se pudieron leer los metadatos de fecha de ${filePath}:`, error)
    }
  }

  return fallbackDate
}

async function listMediaFiles(
  folderPaths: string[],
  onProgress: (loaded: number, total: number | null) => void = () => { },
  recursive = false,
): Promise<MediaFile[]> {
  const candidates: Array<{ name: string; path: string; type: MediaType; folder: string }> = []

  onProgress(0, null)
  for (const folderPath of folderPaths) {
    const pendingFolders = [folderPath]

    while (pendingFolders.length > 0) {
      const currentFolder = pendingFolders.pop()!

      try {
        const folderStat = await fs.promises.stat(currentFolder)
        if (!folderStat.isDirectory()) continue

        const entries = await fs.promises.readdir(currentFolder, { withFileTypes: true })

        for (const entry of entries) {
          if (entry.isDirectory()) {
            if (recursive) pendingFolders.push(path.join(currentFolder, entry.name))
            continue
          }
          if (!entry.isFile()) continue

          const type = getMediaType(entry.name)
          if (!type) continue

          candidates.push({
            name: entry.name,
            path: path.join(currentFolder, entry.name),
            type,
            folder: currentFolder,
          })
        }
      } catch (error) {
        console.error(`Error leyendo la carpeta ${currentFolder}:`, error)
      }
    }
  }

  const total = candidates.length
  onProgress(0, total)
  const results: Array<MediaFile | undefined> = new Array(total)
  const reportInterval = Math.max(1, Math.ceil(total / 100))
  const workerCount = Math.min(6, total)
  let nextIndex = 0
  let loaded = 0

  const processCandidates = async () => {
    while (nextIndex < total) {
      const index = nextIndex
      nextIndex += 1
      const candidate = candidates[index]

      try {
        const stat = await fs.promises.stat(candidate.path)
        const fallbackDate = stat.birthtime.getTime() > 0 ? stat.birthtime : stat.mtime
        const date = await getCaptureDate(candidate.path, candidate.type, fallbackDate)
        results[index] = {
          name: candidate.name,
          path: candidate.path,
          type: candidate.type,
          folder: candidate.folder,
          date: date.toISOString(),
        }
      } catch (error) {
        console.error(`Error leyendo el archivo multimedia ${candidate.path}:`, error)
      }

      loaded += 1
      if (loaded % reportInterval === 0 || loaded === total) {
        onProgress(loaded, total)
        await new Promise<void>((resolve) => setImmediate(resolve))
      }
    }
  }

  await Promise.all(Array.from({ length: workerCount }, processCandidates))
  return results.filter((file): file is MediaFile => file !== undefined)
}

function validateFolderPaths(folderPaths: unknown): folderPaths is string[] {
  return Array.isArray(folderPaths) && folderPaths.every((folderPath) => typeof folderPath === 'string')
}

ipcMain.handle('get-media-files', async (event, folderPaths: unknown, recursive: unknown) => {
  if (!validateFolderPaths(folderPaths)) {
    throw new TypeError('La lista de carpetas multimedia no es válida.')
  }
  if (recursive !== undefined && typeof recursive !== 'boolean') {
    throw new TypeError('El modo de exploración multimedia no es válido.')
  }

  return listMediaFiles(folderPaths, (loaded, total) => {
    if (!event.sender.isDestroyed()) {
      event.sender.send('media-load-progress', { loaded, total })
    }
  }, recursive === true)
})

ipcMain.handle('get-subfolders', async (_event, folderPaths: unknown) => {
  if (!validateFolderPaths(folderPaths) || folderPaths.some((folderPath) => !path.isAbsolute(folderPath))) {
    throw new TypeError('La lista de carpetas para explorar no es válida.')
  }

  const subfolders = await Promise.all(
    folderPaths.map(async (folderPath) => {
      const entries = await fs.promises.readdir(folderPath, { withFileTypes: true })
      return entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => ({
          name: entry.name,
          path: path.join(folderPath, entry.name),
          parentPath: folderPath,
        }))
    }),
  )

  return subfolders
    .flat()
    .sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: 'base' }))
})

ipcMain.handle('get-folder-summaries', async (_event, folderPaths: unknown) => {
  if (!validateFolderPaths(folderPaths)) {
    throw new TypeError('La lista de carpetas multimedia no es válida.')
  }

  const mediaFiles = await listMediaFiles(folderPaths)
  return Promise.all(
    folderPaths.map(async (folderPath) => {
      try {
        const stat = await fs.promises.stat(folderPath)
        if (!stat.isDirectory()) {
          return { path: folderPath, exists: false, fileCount: 0, yearRange: null }
        }

        const folderFiles = mediaFiles.filter((file) => file.folder === folderPath)
        const dates = folderFiles
          .map((file) => new Date(file.date).getFullYear())
          .filter((year) => Number.isFinite(year))
        const yearRange = dates.reduce<{ first: number; last: number } | null>(
          (range, year) =>
            range
              ? { first: Math.min(range.first, year), last: Math.max(range.last, year) }
              : { first: year, last: year },
          null,
        )

        return {
          path: folderPath,
          exists: true,
          fileCount: folderFiles.length,
          yearRange: yearRange === null ? null : yearRange.first === yearRange.last
            ? `${yearRange.first}`
            : `${yearRange.first}–${yearRange.last}`,
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT' || (error as NodeJS.ErrnoException).code === 'ENOTDIR') {
          return { path: folderPath, exists: false, fileCount: 0, yearRange: null }
        }
        console.error(`Error comprobando la carpeta ${folderPath}:`, error)
        throw error
      }
    }),
  )
})