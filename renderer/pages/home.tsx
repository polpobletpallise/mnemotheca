import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  AlertTriangle,
  ArrowUpRight,
  Bookmark,
  Download,
  FileText,
  ExternalLink,
  Folder,
  FolderOpen,
  FolderPen,
  FolderPlus,
  Images,
  Monitor,
  Music,
  Trash2,
  Video,
} from 'lucide-react'
import { AppHeader } from '../components/app-header'
import { useI18n } from '../components/language-provider'
import { SiteFooter } from '../components/site-footer'

interface FolderSummary {
  exists: boolean | null
  fileCount: number | null
  yearRange: string | null
}

type SpecialFolderType = 'desktop' | 'downloads' | 'documents' | 'pictures' | 'music' | 'videos'

const SPECIAL_FOLDER_NAMES: Record<SpecialFolderType, string[]> = {
  desktop: ['desktop', 'escritorio', 'bureau', 'schreibtisch', 'desktop folder'],
  downloads: ['downloads', 'download', 'descargas', 'baixades', 'telechargements', 'mis descargas'],
  documents: ['documents', 'documentos', 'dokumente', 'mis documentos', 'els meus documents'],
  pictures: ['pictures', 'images', 'imágenes', 'imagenes', 'imatges', 'fotos', 'photos', 'bilder', 'mis imágenes', 'les meves imatges'],
  music: ['music', 'música', 'musica', 'musique', 'musik'],
  videos: ['videos', 'vídeos', 'vidéos', 'videoclips', 'mis vídeos', 'els meus vídeos'],
}

const SPECIAL_FOLDER_ICONS = {
  desktop: Monitor,
  downloads: Download,
  documents: FileText,
  pictures: Images,
  music: Music,
  videos: Video,
} satisfies Record<SpecialFolderType, typeof Folder>

const SPECIAL_FOLDER_LABELS = {
  desktop: 'folderDesktop',
  downloads: 'folderDownloads',
  documents: 'folderDocuments',
  pictures: 'folderPictures',
  music: 'folderMusic',
  videos: 'folderVideos',
} as const

export default function HomePage() {
  const { t } = useI18n()
  const [folders, setFolders] = useState<string[]>([])
  const [folderSummaries, setFolderSummaries] = useState<Record<string, FolderSummary>>({})
  const [specialFolders, setSpecialFolders] = useState<Partial<Record<SpecialFolderType, string>>>({})
  useEffect(() => {
    if (!window.electronAPI) return

    window.electronAPI
      .getSpecialFolders()
      .then((knownFolders) => {
        setSpecialFolders(Object.fromEntries(knownFolders.map(({ type, path }) => [type, path])))
      })
      .catch((error: unknown) => {
        console.error('Could not load the system folder locations:', error)
      })

    try {
      const saved = localStorage.getItem('app_folders')
      if (saved) {
        setFolders(JSON.parse(saved))
      }
    } catch (error) {
      console.error('No se pudieron cargar las carpetas guardadas:', error)
    }
  }, [])

  useEffect(() => {
    if (!folders.length || !window.electronAPI) {
      setFolderSummaries({})
      return
    }

    let active = true

    window.electronAPI
      .getFolderSummaries(folders)
      .then((summaries) => {
        if (active) {
          setFolderSummaries(Object.fromEntries(summaries.map((summary) => [summary.path, summary])))
        }
      })
      .catch((error: unknown) => {
        console.error('No se pudo comprobar el estado de las carpetas:', error)
        if (active) {
          setFolderSummaries(
            Object.fromEntries(folders.map((folder) => [folder, { exists: null, fileCount: null, yearRange: null }])),
          )
        }
      })

    return () => {
      active = false
    }
  }, [folders])

  const saveFolders = (updatedFolders: string[]) => {
    setFolders(updatedFolders)
    localStorage.setItem('app_folders', JSON.stringify(updatedFolders))
  }

  const selectFolder = async () => {
    if (!window.electronAPI) return

    try {
      return await window.electronAPI.selectFolder()
    } catch (error) {
      console.error('No se pudo seleccionar la carpeta:', error)
      window.alert(t('pickerFailed'))
    }
  }

  const handleAddFolder = async () => {
    const selectedPath = await selectFolder()
    if (selectedPath && !folders.includes(selectedPath)) {
      saveFolders([...folders, selectedPath])
    }
  }

  const handleChangeFolder = async (index: number) => {
    const selectedPath = await selectFolder()
    if (!selectedPath || selectedPath === folders[index]) return
    if (folders.some((folder, folderIndex) => folder === selectedPath && folderIndex !== index)) {
      window.alert(t('duplicateFolder'))
      return
    }

    const updatedFolders = [...folders]
    updatedFolders[index] = selectedPath
    saveFolders(updatedFolders)
  }

  const handleRemoveFolder = (index: number) => {
    saveFolders(folders.filter((_, folderIndex) => folderIndex !== index))
  }

  const handleOpenLocation = async (folderPath: string) => {
    if (!window.electronAPI) return

    try {
      await window.electronAPI.openLocation(folderPath)
    } catch (error) {
      console.error(`Could not open folder location ${folderPath}:`, error)
      window.alert(t('openLocationFailed'))
    }
  }

  return (
    <main className="app-shell">
      <AppHeader
        eyebrow={t('homeEyebrow')}
        title={t('homeTitle')}
        description={t('homeDescription')}
      />

      {folders.length >= 2 && (
        <Link
          className="all-folders-card"
          href={{
            pathname: '/context',
            query: { folders: JSON.stringify(folders), title: '__all__' },
          }}
        >
          <span className="all-folders-copy">
            <Images size={20} className='all-folders-icon' />
            <span>
              <strong>{t('allMedia')}</strong>
              <span>{t('foldersInLibrary', { count: folders.length })}</span>
            </span>
          </span>
          <ArrowUpRight size={18} />
        </Link>
      )}

      <section aria-labelledby="folders-heading">
        <div className="section-heading">
          <div className="section-heading-copy">
            <span className="count-badge">{folders.length}</span>
            <div>
              <h2 id="folders-heading">{t('foldersHeading')}</h2>
              <p>{t('foldersDescription')}</p>
            </div>
          </div>
          <div className="section-actions">
            <Link className="secondary-button" href="/collections">
              <Bookmark size={16} />
              {t('collections')}
            </Link>
            <button className="primary-button" type="button" onClick={handleAddFolder}>
              <FolderPlus size={16} />
              {t('addFolder')}
            </button>
          </div>
        </div>

        {folders.length === 0 ? (
          <div className="empty-state">
            <span className="empty-icon">
              <FolderOpen size={23} />
            </span>
            <h2>{t('libraryStarts')}</h2>
            <p>{t('libraryStartsDescription')}</p>
            <button className="secondary-button" type="button" onClick={handleAddFolder}>
              <FolderPlus size={15} />
              {t('selectFolder')}
            </button>
          </div>
        ) : (
          <div className="folder-list">
            {folders.map((folder, index) => {
              const folderName = folder.split(/[\\/]/).filter(Boolean).pop() || folder
              const normalizedPath = folder.replace(/[\\/]+$/, '').toLocaleLowerCase()
              const normalizedName = folderName.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase()
              const specialFolderType = (Object.keys(SPECIAL_FOLDER_NAMES) as SpecialFolderType[]).find((type) => {
                const knownPath = specialFolders[type]?.replace(/[\\/]+$/, '').toLocaleLowerCase()
                const normalizedAliases = SPECIAL_FOLDER_NAMES[type].map((name) =>
                  name.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase(),
                )
                return knownPath === normalizedPath || normalizedAliases.includes(normalizedName)
              })
              const FolderIcon = specialFolderType ? SPECIAL_FOLDER_ICONS[specialFolderType] : FolderOpen
              const summary = folderSummaries[folder]
              const isUnavailable = summary?.exists === false
              const verificationFailed = summary?.exists === null

              return (
                <article className="folder-card" key={folder}>
                  <Link
                    className="folder-main"
                    href={{
                      pathname: '/context',
                      query: { folders: JSON.stringify([folder]), title: folderName, root: folder },
                    }}
                  >
                    <span
                      className="folder-icon"
                      title={specialFolderType ? t(SPECIAL_FOLDER_LABELS[specialFolderType]) : undefined}
                    >
                      <FolderIcon size={19} />
                    </span>
                    <span className="folder-details">
                      <span className="folder-name">
                        {folderName}
                        {isUnavailable && (
                          <span className="folder-warning" title={t('folderNotFound')} aria-label={t('folderNotFoundAria')}>
                            <AlertTriangle size={14} />
                          </span>
                        )}
                        {verificationFailed && (
                          <span className="folder-warning" title={t('folderCheckFailed')} aria-label={t('folderCheckFailedAria')}>
                            <AlertTriangle size={14} />
                          </span>
                        )}
                      </span>
                      <span className="folder-path">{folder}</span>
                      <span className="folder-summary">
                        {summary?.fileCount === null || !summary
                          ? t('checkingFiles')
                          : `${summary.fileCount} ${summary.fileCount === 1 ? t('file') : t('files')}`}
                        {summary?.yearRange && <span> · {summary.yearRange}</span>}
                        {isUnavailable && <span> · {t('folderNotFoundShort')}</span>}
                      </span>
                    </span>
                  </Link>
                  <div className="folder-actions">
                    <button
                      className="icon-button"
                      type="button"
                      onClick={() => handleOpenLocation(folder)}
                      disabled={isUnavailable}
                      aria-label={`${t('openLocation')}: ${folderName}`}
                      title={t('openLocation')}
                    >
                      <ExternalLink size={15} />
                    </button>
                    <button
                      className="icon-button"
                      type="button"
                      onClick={() => handleChangeFolder(index)}
                      aria-label={`${t('changeFolder')}: ${folderName}`}
                      title={t('changeFolder')}
                    >
                      <FolderPen size={15} />
                    </button>
                    <button
                      className="icon-button danger"
                      type="button"
                      onClick={() => handleRemoveFolder(index)}
                      aria-label={t('removeFolder', { folder: folderName })}
                      title={t('removeFolder', { folder: folderName })}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </section>

      <SiteFooter />
    </main>
  )
}
