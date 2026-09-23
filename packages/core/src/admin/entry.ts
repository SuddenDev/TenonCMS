import options from '#integral/admin'
import { mountAdmin } from './index.js'

const el = document.getElementById('admin')!
mountAdmin(el, options, el.dataset.base)
