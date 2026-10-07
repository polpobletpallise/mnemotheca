import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  getSpecialFolders: () => ipcRenderer.invoke('get-special-folders'),
  openLocation: (targetPath: string) => ipcRenderer.invoke('open-location', targetPath),
  getMediaFiles: (folders: string[], recursive?: boolean) =>
    ipcRenderer.invoke('get-media-files', folders, recursive),
  getSubfolders: (folders: string[]) => ipcRenderer.invoke('get-subfolders', folders),
  getFolderSummaries: (folders: string[]) => ipcRenderer.invoke('get-folder-summaries', folders),
  changeZoom: async (direction: 'in' | 'out') => {
    const zoomFactor: unknown = await ipcRenderer.invoke('change-zoom', direction)
    if (typeof zoomFactor !== 'number') {
      throw new TypeError('The app returned an invalid zoom level.')
    }
    return zoomFactor
  },
  onUpdateDownloadProgress: (listener: (percent: number) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, percent: number) => listener(percent)
    ipcRenderer.on('update-download-progress', handler)
    return () => ipcRenderer.removeListener('update-download-progress', handler)
  },
  onMediaLoadProgress: (listener: (progress: { loaded: number; total: number | null }) => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      progress: { loaded: number; total: number | null },
    ) => listener(progress)
    ipcRenderer.on('media-load-progress', handler)
    return () => ipcRenderer.removeListener('media-load-progress', handler)
  },
})