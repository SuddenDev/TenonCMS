import { cms } from '../../cms'

export default defineEventHandler(() => cms.find('posts'))
