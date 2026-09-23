import { createFileRoute } from '@tanstack/react-router'
import { mountAdmin } from 'integral-cms/admin'
import { useEffect, useRef } from 'react'
import options from '../../integral.admin'

export const Route = createFileRoute('/admin/$')({ ssr: false, component: Admin })

function Admin() {
  const el = useRef<HTMLDivElement>(null)
  useEffect(() => mountAdmin(el.current!, options), [])
  return <div ref={el} />
}
