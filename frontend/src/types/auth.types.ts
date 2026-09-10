export interface User {
  id: string
  name: string
  email: string
  phone?: string
  title?: string
  avatar_url: string
  status: 'active' | 'inactive' | 'suspended'
  status_label: string
  status_color: string
  company_id?: string
  department_id?: string
  timezone: string
  locale: string
  two_factor_enabled: boolean
  email_verified_at?: string
  last_login_at?: string
  last_login_ip?: string
  created_at: string
  company?: Company
  department?: Department
  roles?: Role[]
}

export interface Company {
  id: string
  name: string
  slug: string
  logo?: string
  domain?: string
  tax_number?: string
  address?: string
  phone?: string
  email?: string
  website?: string
  status: 'active' | 'inactive' | 'suspended'
  status_label: string
  plan_type: 'basic' | 'pro' | 'enterprise'
  plan_label: string
  max_users: number
  max_departments: number
  settings: Record<string, unknown>
  created_at: string
  owner?: User
  users_count?: number
  departments_count?: number
}

export interface Department {
  id: string
  name: string
  slug: string
  type?: string
  description?: string
  color: string
  status: 'active' | 'inactive'
  order_index: number
  company_id: string
  manager_id?: string
  manager?: User
  users_count?: number
  created_at: string
}

export interface Role {
  id: string
  name: string
  slug: string
  display_name: string
  description?: string
  level: number
  level_label: string
  color: string
  is_system: boolean
  company_id?: string
  permissions?: string[]
  users_count?: number
  created_at: string
}

export interface Permission {
  id: string
  name: string
  display_name: string
  group: string
  module: string
  resource: string
  action: string
}

export interface AuthState {
  token: string | null
  user: User | null
  company: Company | null
  permissions: string[]
  roleLevel: number
}

export interface LoginResponse {
  success: boolean
  data: {
    token: string
    user: User
    permissions: string[]
    role_level: number
  }
}
