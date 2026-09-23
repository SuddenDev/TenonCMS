import { defineAdmin } from 'integral-cms/admin'
import { renderReact } from 'integral-cms/admin/react'
import { ColorInput, PostReport, Stats } from './src/admin'

export default defineAdmin({
  fields: { color: renderReact(ColorInput) },
  pages: {
    stats: { label: 'Stats', route: '/reports/stats', mount: renderReact(Stats) },
    // No label: reachable from the Stats page, not the sidebar.
    post: { route: '/reports/posts/:id', mount: renderReact(PostReport) },
  },
})
