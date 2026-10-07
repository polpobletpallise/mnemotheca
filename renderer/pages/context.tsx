import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import type { IconType } from 'react-icons'
import { FiImage, FiMusic, FiVideo } from 'react-icons/fi'
import {
  CalendarDays,
  AlignCenter,
  ExternalLink,
  Folder,
  FolderOpen,
  Image as ImageIcon,
  LayoutGrid,
  List,
  LoaderCircle,
  Search,
  X,
} from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { AppHeader } from '../components/app-header'
import { useI18n } from '../components/language-provider'
import { SiteFooter } from '../components/site-footer'
import { MEDIA_FORMATS, type MediaType } from '../../shared/media-formats.js'

interface MediaFile {
  name: string
  path: string
  type: MediaType
  folder: string
  date: string
}

interface Subfolder {
  name: string
  path: string
  parentPath: string
}

type MediaFilter = 'all' | MediaFile['type']
type ViewMode = 'grid' | 'rows' | 'centeredRows'
type BrowseView = 'content' | 'folders'

const MEDIA_BATCH_SIZE = 60

function getFolderName(folderPath: string) {
  return folderPath.split(/[\\/]/).filter(Boolean).pop() || folderPath
}

function getFolderBreadcrumbs(rootPath: string, currentPath: string) {
  const root = rootPath.replace(/[\\/]+$/, '')
  const current = currentPath.replace(/[\\/]+$/, '')
  const separator = rootPath.includes('\\') ? '\\' : '/'
  const normalizedRoot = root.toLocaleLowerCase()
  const normalizedCurrent = current.toLocaleLowerCase()

  if (
    normalizedCurrent !== normalizedRoot &&
    !normalizedCurrent.startsWith(`${normalizedRoot}${separator}`)
  ) {
    return []
  }

  const breadcrumbs = [{ name: getFolderName(root), path: rootPath }]
  const relativePath = current.slice(root.length).split(/[\\/]/).filter(Boolean)
  let path = root

  for (const name of relativePath) {
    path = `${path}${path.endsWith(separator) ? '' : separator}${name}`
    breadcrumbs.push({ name, path })
  }

  return breadcrumbs
}

const MEDIA_ICONS: Record<MediaFile['type'], IconType> = {
  image: FiImage,
  video: FiVideo,
  audio: FiMusic,
}

function getFileExtension(fileName: string) {
  const extensionIndex = fileName.lastIndexOf('.')
  return extensionIndex > 0 ? fileName.slice(extensionIndex + 1).toLowerCase() : ''
}

function getLocalDateValue(dateString: string) {
  const date = new Date(dateString)
  if (Number.isNaN(date.getTime())) return ''
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

export default function ContentPage() {
  const router = useRouter()
  const { locale, t } = useI18n()
  const [files, setFiles] = useState<MediaFile[]>([])
  const [subfolders, setSubfolders] = useState<Subfolder[]>([])
  const [folderLoadFailed, setFolderLoadFailed] = useState(false)
  const [browseView, setBrowseView] = useState<BrowseView>('content')
  const [showAllContent, setShowAllContent] = useState(false)
  const [filter, setFilter] = useState<MediaFilter>('all')
  const [nameQuery, setNameQuery] = useState('')
  const [extensionFilter, setExtensionFilter] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [loading, setLoading] = useState(true)
  const [mediaProgress, setMediaProgress] = useState<{ loaded: number; total: number | null } | null>(null)
  const [visibleCount, setVisibleCount] = useState(MEDIA_BATCH_SIZE)
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [selectedImage, setSelectedImage] = useState<MediaFile | null>(null)
  const [imageZoom, setImageZoom] = useState(1)
  const [imageOffset, setImageOffset] = useState({ x: 0, y: 0 })
  const [isDraggingImage, setIsDraggingImage] = useState(false)
  const imageZoomRef = useRef(1)
  const imageOffsetRef = useRef({ x: 0, y: 0 })
  const dragRef = useRef<{ pointerId: number; x: number; y: number; offsetX: number; offsetY: number } | null>(null)
  const lightboxRef = useRef<HTMLDivElement>(null)
  const lightboxImageRef = useRef<HTMLImageElement>(null)
  const loadMoreRef = useRef<HTMLDivElement>(null)
  const [playbackErrors, setPlaybackErrors] = useState<Record<string, string>>({})
  const { folders, title, root } = router.query

  useEffect(() => {
    setBrowseView('content')
    setNameQuery('')
  }, [folders])

  useEffect(() => {
    try {
      const savedView = localStorage.getItem('gallery_view')
      if (savedView === 'grid' || savedView === 'rows' || savedView === 'centeredRows') setViewMode(savedView)
    } catch (error) {
      console.error('No se pudo cargar la vista de galería guardada:', error)
    }
  }, [])

  useEffect(() => {
    if (!selectedImage) return

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelectedImage(null)
    }

    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [selectedImage])

  useEffect(() => {
    if (!selectedImage || !lightboxRef.current) return

    const previousBodyOverflow = document.body.style.overflow
    const previousDocumentOverflow = document.documentElement.style.overflow
    document.body.style.overflow = 'hidden'
    document.documentElement.style.overflow = 'hidden'

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault()
      event.stopPropagation()

      const viewport = lightboxRef.current?.getBoundingClientRect()
      const previousZoom = imageZoomRef.current
      const nextZoom = Math.max(1, Math.min(5, previousZoom * Math.exp(-event.deltaY * 0.002)))
      if (viewport && previousZoom !== nextZoom) {
        const cursorX = event.clientX - (viewport.left + viewport.width / 2)
        const cursorY = event.clientY - (viewport.top + viewport.height / 2)
        const nextOffset = {
          x: cursorX - (cursorX - imageOffsetRef.current.x) * (nextZoom / previousZoom),
          y: cursorY - (cursorY - imageOffsetRef.current.y) * (nextZoom / previousZoom),
        }
        imageZoomRef.current = nextZoom
        imageOffsetRef.current = nextOffset
        setImageZoom(nextZoom)
        setImageOffset(nextOffset)
      }
    }

    window.addEventListener('wheel', handleWheel, { passive: false, capture: true })

    return () => {
      window.removeEventListener('wheel', handleWheel, true)
      document.body.style.overflow = previousBodyOverflow
      document.documentElement.style.overflow = previousDocumentOverflow
    }
  }, [selectedImage])

  useEffect(() => {
    if (!router.isReady) return
    if (!folders) {
      setFiles([])
      setSubfolders([])
      setFolderLoadFailed(false)
      setLoading(false)
      setMediaProgress(null)
      return
    }

    let active = true
    setFiles([])
    setSubfolders([])
    setFolderLoadFailed(false)
    setMediaProgress({ loaded: 0, total: null })
    setVisibleCount(MEDIA_BATCH_SIZE)
    const unsubscribe = window.electronAPI?.onMediaLoadProgress((progress) => {
      if (active) setMediaProgress(progress)
    })

    async function loadFiles() {
      setLoading(true)
      try {
        const parsedFolders: string[] = JSON.parse(Array.isArray(folders) ? folders[0] : folders)
        if (!Array.isArray(parsedFolders) || parsedFolders.some((folder) => typeof folder !== 'string')) {
          throw new Error('La lista de carpetas no tiene un formato válido.')
        }
        if (window.electronAPI) {
          const [result, childFolders] = await Promise.all([
            window.electronAPI.getMediaFiles(parsedFolders, showAllContent),
            window.electronAPI.getSubfolders(parsedFolders).catch((error: unknown) => {
              console.error('No se pudieron cargar las subcarpetas:', error)
              if (active) setFolderLoadFailed(true)
              return []
            }),
          ])
          if (active) {
            setFiles(result)
            setSubfolders(childFolders)
          }
        }
      } catch (error) {
        console.error('Error al cargar los archivos multimedia:', error)
        if (active) setFiles([])
      } finally {
        if (active) {
          setLoading(false)
          setMediaProgress(null)
        }
      }
    }

    loadFiles()
    return () => {
      active = false
      unsubscribe?.()
    }
  }, [folders, router.isReady, showAllContent])

  const visibleSubfolders = useMemo(() => {
    const normalizedQuery = nameQuery.trim().toLocaleLowerCase(locale)
    return subfolders.filter((folder) => folder.name.toLocaleLowerCase(locale).includes(normalizedQuery))
  }, [locale, nameQuery, subfolders])

  const folderPaths = useMemo(() => {
    if (!folders) return []
    try {
      const parsedFolders: string[] = JSON.parse(Array.isArray(folders) ? folders[0] : folders)
      return Array.isArray(parsedFolders) && parsedFolders.every((folder) => typeof folder === 'string')
        ? parsedFolders
        : []
    } catch (error) {
      console.error('La lista de carpetas no tiene un formato válido:', error)
      return []
    }
  }, [folders])
  const currentFolderPath = folderPaths.length === 1 ? folderPaths[0] : null
  const rootFolderPath =
    (typeof root === 'string' ? root : Array.isArray(root) ? root[0] : undefined) ??
    (currentFolderPath ?? undefined)
  const breadcrumbs =
    currentFolderPath && rootFolderPath
      ? getFolderBreadcrumbs(rootFolderPath, currentFolderPath)
      : []
  const pageTitle = typeof title === 'string' && title !== '__all__' ? title : t('galleryTitle')

  const filteredFiles = useMemo(() => {
    const normalizedNameQuery = nameQuery.trim().toLocaleLowerCase(locale)
    return files.filter((file) => {
      const matchesType = filter === 'all' || file.type === filter
      const matchesName = file.name.toLocaleLowerCase(locale).includes(normalizedNameQuery)
      const matchesExtension = extensionFilter === 'all' || getFileExtension(file.name) === extensionFilter
      const fileDate = getLocalDateValue(file.date)
      const matchesDateFrom = !dateFrom || (fileDate !== '' && fileDate >= dateFrom)
      const matchesDateTo = !dateTo || (fileDate !== '' && fileDate <= dateTo)
      return matchesType && matchesName && matchesExtension && matchesDateFrom && matchesDateTo
    })
  }, [dateFrom, dateTo, extensionFilter, files, filter, locale, nameQuery])
  const extensions = useMemo(() => {
    const availableExtensions = new Set(files.map((file) => getFileExtension(file.name)))
    return Object.values(MEDIA_FORMATS)
      .flatMap((formats) => formats.map((format) => format.slice(1)))
      .filter((extension) => availableExtensions.has(extension))
      .sort()
  }, [files])
  const counts = useMemo(
    () =>
      files.reduce(
        (result, file) => {
          result[file.type] += 1
          return result
        },
        { all: files.length, image: 0, video: 0, audio: 0 },
      ),
    [files],
  )
  const progressPercent =
    mediaProgress?.total === null || mediaProgress === null
      ? null
      : mediaProgress.total === 0
        ? 100
        : Math.min(100, Math.floor((mediaProgress.loaded / mediaProgress.total) * 100))
  useEffect(() => {
    setVisibleCount(MEDIA_BATCH_SIZE)
  }, [dateFrom, dateTo, extensionFilter, filter, files, nameQuery])

  useEffect(() => {
    if (loading || visibleCount >= filteredFiles.length || !loadMoreRef.current) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisibleCount((count) => Math.min(count + MEDIA_BATCH_SIZE, filteredFiles.length))
        }
      },
      { rootMargin: '500px' },
    )
    observer.observe(loadMoreRef.current)
    return () => observer.disconnect()
  }, [filteredFiles.length, loading, visibleCount])

  const updateViewMode = (nextViewMode: ViewMode) => {
    setViewMode(nextViewMode)
    setSelectedImage(null)
    try {
      localStorage.setItem('gallery_view', nextViewMode)
    } catch (error) {
      console.error('No se pudo guardar la vista de galería:', error)
    }
  }

  const reportPlaybackError = (file: MediaFile, mediaError: MediaError | null) => {
    console.error(`No se pudo reproducir ${file.path}:`, mediaError)
    setPlaybackErrors((errors) => ({
      ...errors,
      [file.path]: 'No se pudo reproducir. El formato o códec puede no ser compatible.',
    }))
  }

  const clearPlaybackError = (filePath: string) => {
    setPlaybackErrors((errors) => {
      if (!(filePath in errors)) return errors
      const nextErrors = { ...errors }
      delete nextErrors[filePath]
      return nextErrors
    })
  }

  const handleOpenLocation = async (filePath: string) => {
    if (!window.electronAPI) return

    try {
      await window.electronAPI.openLocation(filePath)
    } catch (error) {
      console.error(`Could not open file location ${filePath}:`, error)
      window.alert(t('openLocationFailed'))
    }
  }

  const resetImageTransform = () => {
    imageZoomRef.current = 1
    imageOffsetRef.current = { x: 0, y: 0 }
    dragRef.current = null
    setImageZoom(1)
    setImageOffset({ x: 0, y: 0 })
    setIsDraggingImage(false)
  }

  const handleImagePointerDown = (event: PointerEvent<HTMLImageElement>) => {
    if (imageZoom <= 1) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    setIsDraggingImage(true)
    dragRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      offsetX: imageOffsetRef.current.x,
      offsetY: imageOffsetRef.current.y,
    }
  }

  const handleImagePointerMove = (event: PointerEvent<HTMLImageElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return

    const nextOffset = {
      x: drag.offsetX + event.clientX - drag.x,
      y: drag.offsetY + event.clientY - drag.y,
    }
    imageOffsetRef.current = nextOffset
    setImageOffset(nextOffset)
  }

  const handleImagePointerUp = (event: PointerEvent<HTMLImageElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null
      setIsDraggingImage(false)
    }
  }

  return (
    <main className="app-shell">
      <AppHeader
        eyebrow={t('galleryEyebrow')}
        title={pageTitle}
        description={t('galleryDescription')}
        backHref="/home"
      />

      {breadcrumbs.length > 1 && (
        <nav className="folder-breadcrumbs" aria-label={t('folderBreadcrumbs')}>
          {breadcrumbs.map((breadcrumb, index) => (
            <span className="folder-breadcrumb-item" key={breadcrumb.path}>
              {index > 0 && <span aria-hidden="true">/</span>}
              {index === breadcrumbs.length - 1 ? (
                <span aria-current="page">{breadcrumb.name}</span>
              ) : (
                <Link
                  href={{
                    pathname: '/context',
                    query: {
                      folders: JSON.stringify([breadcrumb.path]),
                      title: breadcrumb.name,
                      root: rootFolderPath,
                    },
                  }}
                >
                  {breadcrumb.name}
                </Link>
              )}
            </span>
          ))}
        </nav>
      )}

      {subfolders.length > 0 && (
        <div className="browse-view-tabs" role="group" aria-label={t('displayMode')}>
          <button
            className={`browse-view-tab${browseView === 'content' ? ' active' : ''}`}
            type="button"
            aria-pressed={browseView === 'content'}
            onClick={() => setBrowseView('content')}
          >
            {t('contentView')}
          </button>
          <button
            className={`browse-view-tab${browseView === 'folders' ? ' active' : ''}`}
            type="button"
            aria-pressed={browseView === 'folders'}
            onClick={() => setBrowseView('folders')}
          >
            {t('foldersView')}
            <span>{subfolders.length}</span>
          </button>
        </div>
      )}

      <div className="browse-search-controls">
        <label className="media-search">
          <Search size={16} />
          <input
            type="search"
            value={nameQuery}
            onChange={(event) => setNameQuery(event.target.value)}
            placeholder={t('searchByName')}
            aria-label={t('searchByName')}
          />
        </label>
      </div>

      <section
        className="media-content-view"
        aria-label={t('mediaFilesLabel')}
        hidden={browseView !== 'content'}
      >
        <div className="media-toolbar">
          <div className="media-heading">
            <span className="count-badge">{counts.all}</span>
            <div>
              <h2>{t('filesHeading')}</h2>
              <p>{loading ? t('searchingContent') : t('itemsInLibrary', { count: counts.all })}</p>
            </div>
          </div>

          <div className="media-toolbar-controls">
            <div className="filter-list" role="group" aria-label={t('filterMediaType')}>
              {([
                { id: 'all', label: t('allTypes') },
                { id: 'image', label: t('images') },
                { id: 'video', label: t('videos') },
                { id: 'audio', label: t('audio') },
              ] as Array<{ id: MediaFilter; label: string }>).map(({ id, label }) => (
                <button
                  className={`filter-button${filter === id ? ' active' : ''}`}
                  type="button"
                  key={id}
                  onClick={() => setFilter(id)}
                  aria-pressed={filter === id}
                >
                  {label}
                  <span>{counts[id]}</span>
                </button>
              ))}
            </div>
            <div className="view-toggle" role="group" aria-label={t('displayMode')}>
              <button
                className={`icon-button${viewMode === 'grid' ? ' active' : ''}`}
                type="button"
                onClick={() => updateViewMode('grid')}
                aria-label={t('gridView')}
                aria-pressed={viewMode === 'grid'}
                title={t('gridView')}
              >
                <LayoutGrid size={16} />
              </button>
              <button
                className={`icon-button${viewMode === 'rows' ? ' active' : ''}`}
                type="button"
                onClick={() => updateViewMode('rows')}
                aria-label={t('listView')}
                aria-pressed={viewMode === 'rows'}
                title={t('listView')}
              >
                <List size={16} />
              </button>
              <button
                className={`icon-button${viewMode === 'centeredRows' ? ' active' : ''}`}
                type="button"
                onClick={() => updateViewMode('centeredRows')}
                aria-label={t('centeredRowsView')}
                aria-pressed={viewMode === 'centeredRows'}
                title={t('centeredRowsView')}
              >
                <AlignCenter size={16} />
              </button>
            </div>
          </div>
        </div>

        <div className="media-search-controls">
          <button
            className={`filter-button all-content-toggle${showAllContent ? ' active' : ''}`}
            type="button"
            onClick={() => setShowAllContent((enabled) => !enabled)}
            aria-pressed={showAllContent}
          >
            {t('showAllContent')}
          </button>
          <select
            className="extension-select"
            value={extensionFilter}
            onChange={(event) => setExtensionFilter(event.target.value)}
            aria-label={t('filterByExtension')}
          >
            <option value="all">{t('filterByExtension')}</option>
            {extensions.map((extension) => (
              <option value={extension} key={extension}>
                .{extension}
              </option>
            ))}
          </select>
          <label className="date-filter">
            <span>{t('dateFrom')}</span>
            <input
              type="date"
              value={dateFrom}
              max={dateTo || undefined}
              onChange={(event) => setDateFrom(event.target.value)}
              aria-label={t('dateFrom')}
            />
          </label>
          <label className="date-filter">
            <span>{t('dateTo')}</span>
            <input
              type="date"
              value={dateTo}
              min={dateFrom || undefined}
              onChange={(event) => setDateTo(event.target.value)}
              aria-label={t('dateTo')}
            />
          </label>
          {(dateFrom || dateTo) && (
            <button
              className="secondary-button clear-date-filter"
              type="button"
              onClick={() => {
                setDateFrom('')
                setDateTo('')
              }}
            >
              {t('clearDateFilters')}
            </button>
          )}
        </div>

        {folderLoadFailed && (
          <p className="folder-load-error" role="alert">
            {t('folderLoadFailed')}
          </p>
        )}

        {loading ? (
          <div className="empty-state">
            <span className="empty-icon">
              <LoaderCircle className="loading-icon" size={22} />
            </span>
            <h2>{t('loadingFiles')}</h2>
            <p>{t('loadingFilesDescription')}</p>
            <div className="media-load-progress">
              <div className="media-load-progress-copy">
                <span>
                  {mediaProgress?.total === null || mediaProgress === null
                    ? t('loadingFilesDescription')
                    : t('mediaLoadProgress', {
                        loaded: mediaProgress.loaded,
                        total: mediaProgress.total,
                      })}
                </span>
                <span>{progressPercent === null ? '…' : `${progressPercent}%`}</span>
              </div>
              <div
                className="media-load-progress-track"
                role="progressbar"
                aria-label={t('loadingFiles')}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progressPercent ?? undefined}
              >
                <div
                  className={`media-load-progress-fill${progressPercent === null ? ' indeterminate' : ''}`}
                  style={progressPercent === null ? undefined : { width: `${progressPercent}%` }}
                />
              </div>
            </div>
          </div>
        ) : filteredFiles.length === 0 ? (
          <div className="empty-state">
            <span className="empty-icon">
              {files.length === 0 ? <FolderOpen size={23} /> : <ImageIcon size={23} />}
            </span>
            <h2>{files.length === 0 ? t('noMediaFiles') : t('noFilterResults')}</h2>
            <p>
              {files.length === 0
                ? t('noMediaFilesDescription')
                : t('noFilterResultsDescription')}
            </p>
          </div>
        ) : (
          <div
            className={`media-grid${viewMode === 'rows' ? ' media-rows' : ''}${viewMode === 'centeredRows' ? ' media-centered-rows' : ''}`}
          >
            {filteredFiles.slice(0, visibleCount).map((file) => {
              const MediaIcon = MEDIA_ICONS[file.type]
              const srcUrl = `local-media://media/${encodeURIComponent(file.path)}`
              const extensionIndex = file.name.lastIndexOf('.')
              const extension = extensionIndex > 0 ? file.name.slice(extensionIndex).toUpperCase() : ''
              const displayName = extensionIndex > 0 ? file.name.slice(0, extensionIndex) : file.name
              const fileDate = new Date(file.date)
              const formattedDate = Number.isNaN(fileDate.getTime())
                ? t('noDate')
                : new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' }).format(fileDate)

              return (
                <article className="media-card" key={file.path}>
                  <div className={`media-preview media-preview-${file.type}`}>
                    {file.type === 'image' && (
                      <button
                        className="image-preview-button"
                        type="button"
                        onClick={() => {
                          resetImageTransform()
                          setSelectedImage(file)
                        }}
                        aria-label={t('enlargeImage', { file: file.name })}
                      >
                        <img src={srcUrl} alt={file.name} loading="lazy" />
                      </button>
                    )}
                    {file.type === 'video' && (
                      <video
                        controls
                        preload="none"
                        src={srcUrl}
                        onError={(event) => reportPlaybackError(file, event.currentTarget.error)}
                        onCanPlay={() => clearPlaybackError(file.path)}
                      />
                    )}
                    {file.type === 'audio' && (
                      <div className="media-preview-placeholder">
                        <audio
                          controls
                          preload="none"
                          src={srcUrl}
                          onError={(event) => reportPlaybackError(file, event.currentTarget.error)}
                          onCanPlay={() => clearPlaybackError(file.path)}
                        />
                      </div>
                    )}
                  </div>
                  <div className="media-card-body">
                    <div className="media-card-heading">
                      <strong title={file.name}>
                        <span>{displayName}</span>
                        {extension && <span className="file-extension">{extension.replace('.', "")}</span>}
                      </strong>
                      <span className="media-card-actions">
                        <button
                          className="icon-button"
                          type="button"
                          onClick={() => handleOpenLocation(file.path)}
                          aria-label={`${t('openLocation')}: ${file.name}`}
                          title={t('openLocation')}
                        >
                          <ExternalLink size={14} />
                        </button>
                        <span className="media-type" title={file.type}>
                          <MediaIcon size={15} />
                        </span>
                      </span>
                    </div>
                    {playbackErrors[file.path] && <p className="playback-error">{t('playbackError')}</p>}
                    <div className="media-meta">
                      <CalendarDays size={12} />
                      <span>{formattedDate}</span>
                    </div>
                    <div className="media-meta">
                      <FolderOpen size={12} />
                      <span title={file.folder}>{file.folder}</span>
                    </div>
                  </div>
                </article>
              )
            })}
            {visibleCount < filteredFiles.length && <div ref={loadMoreRef} className="media-load-more" />}
          </div>
        )}
      </section>

      {subfolders.length > 0 && (
        <section
          className="browse-folders-view"
          aria-label={t('foldersView')}
          hidden={browseView !== 'folders'}
        >
          <div className="section-heading">
            <div className="section-heading-copy">
              <span className="count-badge">{visibleSubfolders.length}</span>
              <div>
                <h2>{t('subfoldersHeading')}</h2>
              </div>
            </div>
          </div>
          {visibleSubfolders.length === 0 ? (
            <div className="empty-state compact-empty-state">
              <span className="empty-icon">
                <FolderOpen size={23} />
              </span>
              <h2>{t('noFolderResults')}</h2>
            </div>
          ) : (
            <div className="folder-list">
              {visibleSubfolders.map((folder) => {
                const folderRoot = rootFolderPath ?? folder.parentPath

                return (
                  <article className="folder-card" key={folder.path}>
                    <Link
                      className="folder-main"
                      href={{
                        pathname: '/context',
                        query: {
                          folders: JSON.stringify([folder.path]),
                          title: folder.name,
                          root: folderRoot,
                        },
                      }}
                    >
                      <span className="folder-icon">
                        <Folder size={19} />
                      </span>
                      <span className="folder-details">
                        <span className="folder-name">{folder.name}</span>
                        <span className="folder-path">{folder.path}</span>
                      </span>
                    </Link>
                  </article>
                )
              })}
            </div>
          )}
        </section>
      )}

      {selectedImage && (
        <div
          ref={lightboxRef}
          className="image-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={t('imageEnlarged', { file: selectedImage.name })}
          onPointerDown={(event) => {
            if (event.target === event.currentTarget) setSelectedImage(null)
          }}
        >
          <div className="lightbox-toolbar">
            <span>{selectedImage.name}</span>
            <button
              className="icon-button"
              type="button"
              onClick={() => setSelectedImage(null)}
              aria-label={t('closeEnlargedImage')}
              title={t('closeEnlargedImage')}
            >
              <X size={19} />
            </button>
          </div>
          <img
            ref={lightboxImageRef}
            className={`lightbox-image${imageZoom > 1 ? ' zoomed' : ''}${isDraggingImage ? ' dragging' : ''}`}
            src={`local-media://media/${encodeURIComponent(selectedImage.path)}`}
            alt={selectedImage.name}
            onPointerDown={handleImagePointerDown}
            onPointerMove={handleImagePointerMove}
            onPointerUp={handleImagePointerUp}
            onPointerCancel={handleImagePointerUp}
            style={{
              transform: `translate(${imageOffset.x}px, ${imageOffset.y}px) scale(${imageZoom})`,
            }}
          />
        </div>
      )}
      <SiteFooter />
    </main>
  )
}
