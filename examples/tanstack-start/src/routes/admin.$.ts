import { createFileRoute } from '@tanstack/react-router'
import { cms } from '../cms'

export const Route = createFileRoute('/admin/$')({
  server: { handlers: { GET: ({ request }) => cms.fetch(request) } },
})
