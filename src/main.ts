import { createApp } from 'vue'
import './index.css'
import App from './App.vue'
import router from './router'
import { useAuth } from './stores/auth'
import Icon from './components/Icon.vue'
import VueApexCharts from 'vue3-apexcharts'

const app = createApp(App)
app.component('Icon', Icon)
app.component('apexchart', VueApexCharts)

const { initAuth } = useAuth()
initAuth()
app.use(router).mount('#app')

