import { createRouter, createWebHistory } from 'vue-router'
import DivisasView from '../views/DivisasView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      redirect: '/divisas'
    },
    {
      path: '/divisas',
      name: 'divisas',
      component: DivisasView
    }
  ]
})

export default router
