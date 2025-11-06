import { createRouter, createWebHistory, type RouteRecordRaw, type RouteLocationRaw } from 'vue-router'
// Import estático para contornar falha de import dinâmico no CooperadoCreatePage
import CooperadoCreatePage from '../components/cooperados/CooperadoCreatePage.vue'
import { authGuard } from './guards'

const routes: RouteRecordRaw[] = [
  { path: '/', name: 'login', component: () => import('../views/LoginView.vue') },
  {
    path: '/',
    component: () => import('../layout/LayoutShell.vue'),
    meta: { requiresAuth: true },
    children: [
      { path: '/dashboard', name: 'dashboard', component: () => import('../views/DashboardHomeView.vue'), meta: { title: 'Dashboard' } },
      { path: '/clients', name: 'clients', component: () => import('../views/ClientsView.vue'), meta: { title: 'Clientes' } },
      // Rotas /new devem vir ANTES das rotas /:id
      { path: '/clients/new', name: 'client-new', component: () => import('../components/clients/ClientDetailPage.vue'), meta: { title: 'Novo Cliente' } },
      { path: '/clients/:id', name: 'client-detail', component: () => import('../components/clients/ClientDetailPage.vue'), meta: { title: 'Detalhe do Cliente' } },
      { path: '/users', name: 'users', component: () => import('../views/UsersView.vue'), meta: { title: 'Usuários' } },
      // Rotas específicas antes de rotas dinâmicas
      { path: '/users/register', name: 'user-register', component: () => import('../views/UserFormView.vue'), meta: { title: 'Novo usuário' } },
      { path: '/users/edit/:id', name: 'user-edit', component: () => import('../views/UserFormView.vue'), meta: { title: 'Editar usuário' } },
      { path: '/requests', name: 'requests', component: () => import('../views/RequestsView.vue'), meta: { title: 'Solicitações' } },
      { path: '/settings', name: 'settings', component: () => import('../views/SettingsView.vue'), meta: { title: 'Configurações' } },
      { path: '/cooperados', name: 'cooperados', component: () => import('../views/CooperadosView.vue'), meta: { title: 'Cooperados', keepAlive: true } },
      // Rotas /new devem vir ANTES das rotas /:id para evitar que "new" seja interpretado como ID
      { path: '/cooperados/new', name: 'cooperado-new', component: CooperadoCreatePage, meta: { title: 'Novo Cooperado' } },
      { path: '/cooperados/:id', name: 'cooperado-detail', component: () => import('../components/cooperados/CooperadoDetailPage.vue'), meta: { title: 'Detalhe do Cooperado' } },
      { path: '/cooperados/:id/edit', name: 'cooperado-edit', component: () => import('../components/cooperados/CooperadoEditPage.vue'), meta: { title: 'Editar Cooperado' } },
      { path: '/billing', name: 'billing', component: () => import('../views/BillingView.vue'), meta: { title: 'Faturamento', keepAlive: true } },
      { path: '/solicitacoes', name: 'solicitacoes', component: () => import('../views/EventView.vue'), meta: { title: 'Solicitações', keepAlive: true } },
      // Rota /new também antes de rotas dinâmicas
      { path: '/solicitacoes/new', name: 'request-new', component: () => import('../components/requests/SolicitationCreatePage.vue'), meta: { title: 'Nova Solicitação' } },
    ],
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior: () => ({ left: 0, top: 0 }),
})

router.beforeEach((to) => authGuard(to) as RouteLocationRaw | void)

// Limpa rascunhos de "Nova Solicitação" ao acessar diretamente a rota
router.beforeEach((to) => {
  if (to.name === 'request-new') {
    try {
      const prefixes = ['solicitacoes:new:', 'evsp:last']
      const ls = (typeof localStorage !== 'undefined') ? localStorage : null
      if (ls) {
        for (let i = ls.length - 1; i >= 0; i--) {
          const key = ls.key(i)
          if (key && prefixes.some(p => key.startsWith(p))) {
            ls.removeItem(key)
          }
        }
      }
    } catch {}
  }
})

export default router

