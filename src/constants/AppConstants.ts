export default class AppConstants {
  static CUSTOM_TABLE_DEFAULT_HEIGHT = '600px'
  static API_REST_TIMEOUT = 15000
  static PAGINATOR_DEFAULT_PAGE_SIZE = 10
  static PAGINATOR_DEFAULT_LIMIT = 20
  static PAGINATOR_DEFAULT_PAGE_SIZE_OPTIONS = [10, 20, 40, 50, 100, 200, 500, 1000]
  static PAGINATOR_DEFAULT_LIMIT_MEDIA = 100

  static LOCAL_STORAGE_AUTHENTICATED = 'isAuthenticated'
  static LOCAL_STORAGE_CURRENT_USER = 'currentUser'
  static LOCAL_STORAGE_LOGIN_EMAIL = 'loginEmail'
  static LOCAL_STORAGE_LOGIN_USERNAME = 'loginUsername'
  static LOCAL_STORAGE_THEME = 'theme'

  static NAVIGATION_PAGE_HOME = '/home'
  static NAVIGATION_PAGE_LOGIN = '/login'
  static NAVIGATION_PAGE_DASHBOARD = '/dashboard'
  static NAVIGATION_PAGE_CHANGE_PASSWORD = '/change-password'
  static NAVIGATION_PAGE_REGISTER = '/pages/register'
  static NAVIGATION_PAGE_VERSION = '/version'
  static NAVIGATION_PAGE_FORGOT_PASSWORD = '/forgot-password'
  static NAVIGATION_PAGE_RESET_PASSWORD = '/reset-password'
  static NAVIGATION_PAGE_ERROR_404 = '/pages/error-404'
  static NAVIGATION_PAGE_ERROR_500 = '/pages/error-500'
  static NAVIGATION_PAGE_CALLBACK = '/pages/callback'
  static NAVIGATION_PAGE_COMINGSOON = '/pages/comingsoon'
  static NAVIGATION_PAGE_BROWSER_NOT_SUPPORT = '/pages/browser-not-support'
  static NAVIGATION_PAGE_MAINTENANCE = '/pages/maintenance'

  static NAVIGATION_PAGE_ADM_USER = '/admin/users'
  static NAVIGATION_PAGE_ADM_USER_REGISTER = '/admin/users/register'

  static NAVIGATION_PAGE_ADM_CLIENT = '/admin/clients'
  static NAVIGATION_PAGE_ADM_CLIENT_REGISTER = '/admin/clients/register'

  static NAVIGATION_PAGE_ADM_REQUESTS = '/admin/requests'
  static NAVIGATION_PAGE_ADM_REQUESTS_EDIT_GESTOR = '/admin/requests/edit/gestor'

  static API_USERS = 'webadmin/usuarios'
  static API_USERS_DETAIL = 'webadmin/usuario/detail'
  static API_USERS_PAGINATE = 'users/paginate'

  static API_CLIENTS = 'webadmin/clientes'
  static API_CLIENTS_DETAIL = 'webadmin/cliente'
  static API_CLIENTS_TAX_SITUATION = 'webadmin/cliente/opcoes/situacao-tributaria'
  static API_CLIENTS_UNIT_LOCATION = 'webadmin/cliente/unidades'
  static API_CLIENTS_DETAIL_UNIT_LOCATION = 'webadmin/clientes/unidades'
  static API_CLIENTS_SECTORS = 'webadmin/clientes/setores'
  static API_CLIENTS_SECTOR = 'webadmin/clientes/setor'
  static API_CLIENT_SECTORS = 'webadmin/cliente/setores'
  static API_CLIENTS_USERS_SECTORS = 'webadmin/clientes/usuarios/setores'
  static API_CLIENTS_FUNCTIONS = 'webadmin/clientes/funcoes'
  static API_CLIENTS_FUNCTION = 'webadmin/clientes/funcao'
  static API_CLIENTS_ACTIVITIES = 'webadmin/clientes/atividades'
  static API_CLIENTS_USERS = 'webadmin/clientes/usuarios'
  static API_CLIENTS_MANAGERS = 'webadmin/clientes/gestores'
  static API_CLIENTS_UNIT_SEL = 'webadmin/clientes/unidades-sel'
  static API_CLIENTS_PROF = 'webadmin/clientes/profissionais'

  static API_REQUESTS = 'webadmin/solicitacoes'
  static API_REQUESTS_DETAIL = 'webadmin/solicitacoes/detail'
  static API_REQUESTS_MANAGERS = 'webadmin/solicitacoes/gestores'
  static API_REQUESTS_EDIT_MANAGERS = 'webadmin/solicitacoes/editar_gestor'

  static API_REQUESTS_COOP = 'webadmin/solicitacoes/cooperado'
  static API_COOP = 'webadmin/cooperados'
  static API_COOP_DETAIL = 'webadmin/cooperados/detail'
  static API_FUNCTIONS_PROFETIONALS = 'webadmin/cooperados/funcoes'
  static API_UPDATE_URL = 'webadmin/cooperados/url-img'

  static API_ADMIN_CONFIG = 'webadmin/admin/config'
  static API_ADMIN_CONFIG_CHANGE_STATUS_MASTER_PASS = 'webadmin/admin/config-senha-mestra'

  static API_BANKS = 'bancos'
  static API_FUNCTIONS = 'funcoes'
  static API_REGIONS = 'webadmin/regioes'

  static API_DASHBOARD_EVENTS_REQUESTS = 'webadmin/dashboard/events/requests'
  static API_DASHBOARD_EVENT_DETAILS = 'webadmin/dashboard/event/details'
  static API_DASHBOARD_DROPDOWN_CLIENTS = 'webadmin/dashboard/dropdown/clients'
  static API_DASHBOARD_DROPDOWN_UNITS = 'webadmin/dashboard/dropdown/units'
  static API_DASHBOARD_DROPDOWN_SECTORS = 'webadmin/dashboard/dropdown/sectors'

  // Dashboard Geral (Home)
  static API_DASHBOARD_SUMMARY = 'api/dashboard/summary'
  static API_DASHBOARD_TIMESERIES = 'api/dashboard/timeseries'
  static API_DASHBOARD_TOP = 'api/dashboard/top'
  static API_DASHBOARD_STATUS_BREAKDOWN = 'api/dashboard/status-breakdown'
  static API_DASHBOARD_STATUS_MONTHLY = 'api/dashboard/status-monthly'
  static API_DASHBOARD_HEATMAP = 'api/dashboard/heatmap'
  static API_DASHBOARD_MOBILITY_SUMMARY = 'api/dashboard/mobility/summary'
  static API_DASHBOARD_MOBILITY_RANKING = 'api/dashboard/mobility/ranking'
  static API_DASHBOARD_MOBILITY_FLOWS = 'api/dashboard/mobility/flows'


  static API_DASHBOARD_AVAILABILITY = 'api/dashboard/availability'


  static API_DASHBOARD_COOP_COMPLIANCE = 'api/dashboard/cooperados/compliance'
  static API_DASHBOARD_COMPLIANCE_CLIENTS = 'api/dashboard/compliance/clients'
  static API_DASHBOARD_COMPLIANCE_EVENTS = 'api/dashboard/compliance/events'
  static API_DASHBOARD_COMPLIANCE_FINANCE = 'api/dashboard/compliance/finance'
  static API_DASHBOARD_COMPLIANCE_SLAS = 'api/dashboard/compliance/slas'


  static KM_RATE_BRL = 1.8




  static API_DROPDOWN_USER_ROLE = 'dropdown/user-role'
  static API_DROPDOWN_USER_PROFILE = 'dropdown/user-profile'

  static EVENT_BUS_OPEN_ORDER_MODAL = 'open-order-modal'
  static EVENT_BUS_OPEN_LOAD_VIEW_TABLE_DATA = 'load-view-table-data'

  static THEME_LIGHT = 'light'
  static THEME_DARK = 'dark'

  static DEVICE_TYPE_MOBILE = 0
  static DEVICE_TYPE_DESKTOP = 1

  static PLATFORM_ANDROID = 0
  static PLATFORM_IOS = 1
  static PLATFORM_OTHER = 2

  static DROPDOWN_ALL_OPTION = { id: 10000, name: 'Todos' }
  static DROPDOWN_EMPTY_OPTION = { id: null as any, name: 'Todos' }
}

