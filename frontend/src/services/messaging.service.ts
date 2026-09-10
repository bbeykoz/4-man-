import { get, post, del } from '@/lib/api'
import type { ApiResponse } from '@/types/api.types'
import type { User } from '@/types/auth.types'

export interface MessageAttachment {
  id: string
  message_id: string
  original_name: string
  file_path: string
  mime_type: string
  size: number
  url: string
  created_at: string
}

export interface Message {
  id: string
  conversation_id: string
  sender_id: string
  body: string | null
  type: 'text' | 'file'
  read_at: string | null
  created_at: string
  updated_at: string
  sender: Pick<User, 'id' | 'name' | 'email' | 'avatar_url'>
  attachments: MessageAttachment[]
}

export interface Conversation {
  id: string
  other_user: Pick<User, 'id' | 'name' | 'email' | 'avatar_url'>
  last_message: Message | null
  unread_count: number
  last_message_at: string | null
  created_at: string
}

export interface MessagesResponse {
  success: boolean
  data: Message[]
  meta: {
    current_page: number
    per_page: number
    total: number
    last_page: number
  }
}

const base = '/messages'

export const messagingService = {
  getConversations(): Promise<ApiResponse<Conversation[]>> {
    return get<ApiResponse<Conversation[]>>(`${base}/conversations`)
  },

  findOrCreate(userId: string): Promise<ApiResponse<Conversation>> {
    return post<ApiResponse<Conversation>>(`${base}/conversations`, { user_id: userId })
  },

  getMessages(conversationId: string, page = 1): Promise<MessagesResponse> {
    return get<MessagesResponse>(`${base}/conversations/${conversationId}?page=${page}`)
  },

  sendMessage(conversationId: string, body: string): Promise<ApiResponse<Message>> {
    return post<ApiResponse<Message>>(`${base}/conversations/${conversationId}`, { body })
  },

  sendFile(conversationId: string, file: File, body?: string): Promise<ApiResponse<Message>> {
    const fd = new FormData()
    fd.append('attachment', file)
    if (body) fd.append('body', body)
    return post<ApiResponse<Message>>(`${base}/conversations/${conversationId}`, fd)
  },

  markRead(conversationId: string): Promise<ApiResponse<null>> {
    return post<ApiResponse<null>>(`${base}/conversations/${conversationId}/read`, {})
  },

  unreadCount(): Promise<ApiResponse<{ count: number }>> {
    return get<ApiResponse<{ count: number }>>(`${base}/unread-count`)
  },

  searchUsers(q: string): Promise<ApiResponse<(Pick<User, 'id' | 'name' | 'email' | 'avatar_url'> & { department?: { id: string; name: string } })[]>> {
    return get<ApiResponse<any[]>>(`${base}/users?q=${encodeURIComponent(q)}`)
  },

  deleteMessage(conversationId: string, messageId: string): Promise<ApiResponse<null>> {
    return del<ApiResponse<null>>(`${base}/conversations/${conversationId}/messages/${messageId}`)
  },
}
