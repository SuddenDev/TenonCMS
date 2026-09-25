import { defineCollection } from 'integral-cms'
import { page, seo } from 'integral-cms/presets'

export const pages = defineCollection({
  label: 'Pages',
  titleField: 'title',
  fields: { ...page.fields, ...seo.fields, body: { type: 'textarea' } },
  hooks: {
    beforeValidate: page.hooks.beforeValidate,
    beforeChange: page.hooks.beforeChange,
    afterChange: page.hooks.afterChange,
  },
})
