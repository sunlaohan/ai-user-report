import { createRouter, createWebHistory } from 'vue-router'
import LoginView from '../views/LoginView.vue'
import FunctionSelectView from '../views/FunctionSelectView.vue'
import ChatView from '../views/ChatView.vue'
import TicketDetailView from '../views/TicketDetailView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      redirect: '/login'
    },
    {
      path: '/login',
      name: 'login',
      component: LoginView
    },
    {
      path: '/home',
      name: 'home',
      component: FunctionSelectView
    },
    {
      path: '/chat/:type',
      name: 'chat',
      component: ChatView
    },
    {
      path: '/ticket/:id',
      name: 'ticketDetail',
      component: TicketDetailView
    }
  ]
})

// 路由守卫：有缓存手机号则视为已登录，跳过登录页；无则拦截受保护页面
// 同时检查 LLM 配置
router.beforeEach((to) => {
  const hasSession = !!localStorage.getItem('userPhone')
  const hasLlmConfig = !!localStorage.getItem('llmConfig')

  if (to.name === 'login' && hasSession && hasLlmConfig) {
    return { name: 'home' }
  }
  if (to.name !== 'login' && !hasSession) {
    return { name: 'login' }
  }
})

export default router
