export {}

declare global {
  interface Window {
    electronAPI: {
      selectFolder: () => Promise<string | null>
      getSpecialFolders: () => Promise<
        Array<{
          type: 'desktop' | 'downloads' | 'documents' | 'pictures' | 'music' | 'videos'
          path: string
        }>
      >
      openLocation: (targetPath: string) => Promise<void>
      getMediaFiles: (folders: string[], recursive?: boolean) => Promise<
        Array<{
          name: string
          path: string
          type: 'image' | 'video' | 'audio'
          folder: string
          date: string
        }>
      >
      getSubfolders: (folders: string[]) => Promise<
        Array<{
          name: string
          path: string
          parentPath: string
        }>
      >
      onMediaLoadProgress: (
        listener: (progress: { loaded: number; total: number | null }) => void,
      ) => () => void
      getFolderSummaries: (folders: string[]) => Promise<
        Array<{
          path: string
          exists: boolean
          fileCount: number
          yearRange: string | null
        }>
      >
      getCollections: () => Promise<Array<{ name: string; path: string; folders: string[]; files: string[] }>>
      createCollection: (name: string) => Promise<{ name: string; path: string; folders: string[]; files: string[] }>
      addFolderToCollection: (
        collectionName: string,
        folderPath: string,
      ) => Promise<{ name: string; path: string; folders: string[]; files: string[] }>
      addFileToCollection: (
        collectionName: string,
        filePath: string,
      ) => Promise<{ name: string; path: string; folders: string[]; files: string[] }>
      changeZoom: (direction: 'in' | 'out') => Promise<number>
      onUpdateDownloadProgress: (listener: (percent: number) => void) => () => void
    }
  }
}