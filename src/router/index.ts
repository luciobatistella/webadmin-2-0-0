import { createRouter, createWebHistory, type RouteRecordRaw, type RouteLocationRaw } from 'vue-router'
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
      { path: '/clients/:id', name: 'client-detail', component: () => import('../components/clients/ClientDetailPage.vue'), meta: { title: 'Detalhe do Cliente' } },
      { path: '/clients/new', name: 'client-new', component: () => import('../components/clients/ClientDetailPage.vue'), meta: { title: 'Novo Cliente' } },
      { path: '/users', name: 'users', component: () => import('../views/UsersView.vue'), meta: { title: 'Usuários' } },
      { path: '/users/register', name: 'user-register', component: () => import('../views/UserFormView.vue'), meta: { title: 'Novo usuário' } },
      { path: '/users/edit/:id', name: 'user-edit', component: () => import('../views/UserFormView.vue'), meta: { title: 'Editar usuário' } },
      { path: '/requests', name: 'requests', component: () => import('../views/RequestsView.vue'), meta: { title: 'Solicitações' } },
      { path: '/settings', name: 'settings', component: () => import('../views/SettingsView.vue'), meta: { title: 'Configurações' } },
      { path: '/cooperados', name: 'cooperados', component: () => import('../views/CooperadosView.vue'), meta: { title: 'Cooperados', keepAlive: true } },
      { path: '/billing', name: 'billing', component: () => import('../views/BillingView.vue'), meta: { title: 'Faturamento', keepAlive: true } },
      { path: '/solicitacoes', name: 'solicitacoes', component: () => import('../views/EventView.vue'), meta: { title: 'Solicitações', keepAlive: true } },
    ],
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior: () => ({ left: 0, top: 0 }),
})

router.beforeEach((to) => authGuard(to) as RouteLocationRaw | void)

export default router

