import { cms } from '../cms'

export default defineEventHandler(() => cms.getGlobal('site'))
