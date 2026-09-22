import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import App from './App.vue'
import CollectionList from './pages/CollectionList.vue'
import DocEdit from './pages/DocEdit.vue'
import GlobalEdit from './pages/GlobalEdit.vue'
import Home from './pages/Home.vue'
import './style.css'

const router = createRouter({
  history: createWebHistory('/admin/'),
  routes: [
    { path: '/', component: Home },
    { path: '/collections/:name', component: CollectionList },
    { path: '/collections/:name/:id', component: DocEdit },
    { path: '/globals/:name', component: GlobalEdit },
  ],
})

createApp(App).use(router).mount('#app')
