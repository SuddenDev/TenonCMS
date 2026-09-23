import { createFileRoute } from '@tanstack/react-router'
import { cms } from '../../integral.config'

export const Route = createFileRoute('/admin/$')({
  server: { handlers: { GET: ({ request }) => cms.fetch(request) } },
})
