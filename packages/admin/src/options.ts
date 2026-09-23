import type { InjectionKey } from 'vue'
import type { AdminOptions, Page } from '../../core/src/admin/index.d.ts'

export const optionsKey = Symbol() as InjectionKey<AdminOptions>

export function pagePath(key: string, page: Page) {
  return page.route ?? `/${key}`
}
