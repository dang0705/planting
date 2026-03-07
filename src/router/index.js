import { createRouter, createWebHistory } from 'vue-router'
import Login from '@/views/Auth/Login.vue'
import AiPoetry from '@/views/AiPoetry/Generator.vue'

const routes = [
  {
    path: '/',
    redirect: '/ai-poetry'
  },
  {
    path: '/login',
    name: 'Login',
    component: Login,
    meta: { guest: true }
  },
  {
    path: '/ai-poetry',
    name: 'AiPoetry',
    component: AiPoetry,
    meta: { requiresAuth: true }
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

// 路由守卫
router.beforeEach((to, from, next) => {
  const token = localStorage.getItem('authToken')
  const userInfo = localStorage.getItem('userInfo')
  
  if (to.meta.requiresAuth && (!token || !userInfo)) {
    next('/login')
  } else if (to.meta.guest && token) {
    next('/ai-poetry')
  } else {
    next()
  }
})

export default router