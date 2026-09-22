import { cms } from '../../cms'

export default defineEventHandler(async (event) => {
  const post = await cms.findOne('posts', { where: { slug: getRouterParam(event, 'slug')! } })
  if (!post) throw createError({ statusCode: 404, statusMessage: 'Post not found' })
  return post
})
