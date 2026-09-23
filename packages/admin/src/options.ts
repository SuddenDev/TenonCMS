import type { InjectionKey } from 'vue'
import type { AdminOptions, IntegralContext, Page } from '../../core/src/admin/index.d.ts'

export const optionsKey = Symbol() as InjectionKey<AdminOptions>
export const integralKey = Symbol() as InjectionKey<IntegralContext>

export function pagePath(key: string, page: Page) {
  return page.route ?? `/${key}`
}
