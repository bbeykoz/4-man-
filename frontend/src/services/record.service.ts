import { get, post, put, patch, del } from '@/lib/api'
import type { PaginatedResponse, ApiResponse, BaseRecord } from '@/types/api.types'
import { buildQueryString } from '@/lib/utils'

export function createRecordService(module: string) {
  const base = `/modules/${module}`

  return {
    list: (params: Record<string, unknown> = {}) => {
      const qs = buildQueryString(params)
      return get<PaginatedResponse<BaseRecord>>(`${base}${qs ? '?' + qs : ''}`)
    },

    get: (id: string) => get<ApiResponse<BaseRecord>>(`${base}/${id}`),

    create: (data: Record<string, unknown>) =>
      post<ApiResponse<BaseRecord>>(base, data),

    update: (id: string, data: Record<string, unknown>) =>
      put<ApiResponse<BaseRecord>>(`${base}/${id}`, data),

    updateStatus: (id: string, status: string) =>
      patch<ApiResponse<BaseRecord>>(`${base}/${id}/status`, { status }),

    delete: (id: string) => del<ApiResponse<null>>(`${base}/${id}`),

    comments: (id: string, page = 1) =>
      get<PaginatedResponse<any>>(`${base}/${id}/comments?page=${page}`),

    addComment: (id: string, content: string, isInternal = false) =>
      post<ApiResponse<any>>(`${base}/${id}/comments`, { content, is_internal: isInternal }),

    attachments: (id: string) => get<ApiResponse<any[]>>(`${base}/${id}/attachments`),

    addAttachment: (id: string, file: File) => {
      const form = new FormData()
      form.append('file', file)
      return post<ApiResponse<any>>(`${base}/${id}/attachments`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
    },

    history: (id: string) => get<ApiResponse<any[]>>(`${base}/${id}/history`),

    dashboard: () => get<ApiResponse<any>>(`/dashboard/module/${module}`),
  }
}

// Pre-built services for each module
export const accountingService   = createRecordService('accounting')
export const marketingService    = createRecordService('marketing')
export const warehouseService    = createRecordService('warehouse')
export const warehouseControlService = createRecordService('warehouse-control')
export const packagingService    = createRecordService('packaging')
export const returnsService      = createRecordService('returns')
export const customsService      = createRecordService('customs')
export const shippingService     = createRecordService('shipping')
