import axios, { type AxiosInstance, type AxiosRequestConfig } from 'axios'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost/api/v1'

function normalizeUrl(url: string): string {
  return url.startsWith('/') ? url.slice(1) : url
}

function createApiClient(): AxiosInstance {
  const tunnelHeaders = API_URL.includes('.loca.lt') ? { 'bypass-tunnel-reminder': 'true' } : {}

  const instance = axios.create({
    baseURL: API_URL,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...tunnelHeaders },
    timeout: 30000,
  })

  const request = instance.request.bind(instance)
  instance.request = (config) => request({ ...config, url: normalizeUrl(config.url ?? '') })

  // Request interceptor — attach token
  instance.interceptors.request.use((config) => {
    if (typeof window !== 'undefined') {
      const raw = localStorage.getItem('bytepanel-auth')
      if (raw) {
        const state = JSON.parse(raw)
        const token = state?.state?.token
        if (token) {
          config.headers.Authorization = `Bearer ${token}`
        }
      }
    }
    return config
  })

  // Response interceptor — handle 401 without stripping the backend payload shape
  instance.interceptors.response.use(
    (response) => response,
    async (error) => {
      if (error.response?.status === 401 && typeof window !== 'undefined') {
        localStorage.removeItem('bytepanel-auth')
        window.location.href = '/login'
      }
      return Promise.reject(error.response?.data ?? { message: 'Bağlantı hatası.' })
    }
  )

  return instance
}

export const api = createApiClient()

// Typed helpers
export async function get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
  const response = await api.get<T>(url, config)
  return response.data as T
}

export async function post<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
  const response = await api.post<T>(url, data, config)
  return response.data as T
}

export async function put<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
  const response = await api.put<T>(url, data, config)
  return response.data as T
}

export async function patch<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
  const response = await api.patch<T>(url, data, config)
  return response.data as T
}

export async function del<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
  const response = await api.delete<T>(url, config)
  return response.data as T
}
