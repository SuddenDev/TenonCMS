import { createElement, type ComponentType } from 'react'
import { createRoot } from 'react-dom/client'
import type { Mount } from './index.d.ts'

// Mounts a React component with the context as props and re-renders on context changes.
export function renderReact<Ctx extends object>(Component: ComponentType<Ctx>): Mount<Ctx> {
  return (el, ctx) => {
    const root = createRoot(el)
    root.render(createElement(Component, ctx))
    return { update: (ctx) => root.render(createElement(Component, ctx)), unmount: () => root.unmount() }
  }
}
