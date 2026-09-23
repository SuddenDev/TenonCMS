import { defineMiddleware } from 'astro:middleware'
import { cms } from '#integral/config'

export const onRequest = defineMiddleware((context, next) => {
  context.locals.integral = cms
  return next()
})
