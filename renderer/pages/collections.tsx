import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Bookmark, Folder, Heart } from 'lucide-react'
import { AppHeader } from '../components/app-header'
import { useI18n } from '../components/language-provider'
import { SiteFooter } from '../components/site-footer'

interface Collection {
  name: string
  path: string
  folders: string[]
  files: string[]
}

export default function CollectionsPage() {
  const { t } = useI18n()
  const [collections, setCollections] = useState<Collection[]>([])
  const [loadFailed, setLoadFailed] = useState(false)

  useEffect(() => {
    if (!window.electronAPI) return
    window.electronAPI
      .getCollections()
      .then(setCollections)
      .catch((error: unknown) => {
        console.error('Could not load collections:', error)
        setLoadFailed(true)
      })
  }, [])

  return (
    <main className="app-shell">
      <AppHeader
        eyebrow={t('collections')}
        title={t('collectionsHeading')}
        description={t('collectionsDescription')}
        backHref="/home"
      />

      <section aria-labelledby="collections-heading">
        <div className="section-heading">
          <div className="section-heading-copy">
            <span className="count-badge">{collections.length}</span>
            <div>
              <h2 id="collections-heading">{t('collectionsHeading')}</h2>
              <p>{t('collectionReferencesDescription')}</p>
            </div>
          </div>
        </div>

        {loadFailed ? (
          <p className="folder-load-error" role="alert">{t('collectionLoadFailed')}</p>
        ) : collections.length === 0 ? (
          <div className="empty-state">
            <span className="empty-icon"><Bookmark size={23} /></span>
            <h2>{t('noCollections')}</h2>
          </div>
        ) : (
          <div className="folder-list">
            {collections.map((collection) => {
              const itemCount = collection.folders.length + collection.files.length
              const CollectionIcon = collection.name.toLowerCase() === 'favourites' ? Heart : Folder
              const contents = (
                <>
                  <span className="folder-icon"><CollectionIcon size={19} /></span>
                  <span className="folder-details">
                    <span className="folder-name">{collection.name}</span>
                    <span className="folder-path">{collection.path}</span>
                    <span className="folder-summary">
                      {t('itemsInCollection', { count: itemCount })}
                    </span>
                  </span>
                </>
              )

              return (
                <article className="folder-card" key={collection.name}>
                  {itemCount > 0 ? (
                    <Link
                      className="folder-main"
                      href={{
                        pathname: '/context',
                        query: {
                          folders: JSON.stringify(collection.folders),
                          files: JSON.stringify(collection.files),
                          title: collection.name,
                        },
                      }}
                    >
                      {contents}
                    </Link>
                  ) : (
                    <div className="folder-main">{contents}</div>
                  )}
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
