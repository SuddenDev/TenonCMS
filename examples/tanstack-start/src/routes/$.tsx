import { Link, createFileRoute, notFound } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { seoMeta } from 'integral-cms/presets'
import cms from '../../integral.config'

const getPage = createServerFn()
  .validator((path: string) => path)
  .handler(async ({ data: path }) => {
    const page = await cms.findOne('pages', { where: { path }, populate: false })
    if (!page) throw notFound()
    return page
  })

// `/`, `/posts/$slug`, `/admin/$` and `/api/cms/$` win over this route, so a CMS page at `/` never shows.
export const Route = createFileRoute('/$')({
  loader: ({ params }) => getPage({ data: `/${params._splat ?? ''}` }),
  head: ({ loaderData }) => {
    const meta = loaderData && seoMeta(loaderData)
    return {
      meta: [
        { title: meta?.title },
        ...(meta?.description ? [{ name: 'description', content: meta.description }] : []),
        ...(meta?.noindex ? [{ name: 'robots', content: 'noindex' }] : []),
      ],
    }
  },
  component: Page,
  notFoundComponent: () => <p>Page not found</p>,
})

function Page() {
  const page = Route.useLoaderData()
  return (
    <main>
      <Link to="/">← Home</Link>
      <h1>{page.title}</h1>
      <p style={{ whiteSpace: 'pre-wrap' }}>{page.body}</p>
    </main>
  )
}
