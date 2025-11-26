const AUTH_STORAGE_KEY = 'auth_token'

export const getToken = () => localStorage.getItem(AUTH_STORAGE_KEY) || ''

export const setToken = (token: string) => localStorage.setItem(AUTH_STORAGE_KEY, token)

export const removeToken = () => localStorage.removeItem(AUTH_STORAGE_KEY)

export const verifyToken = async (token?: string): Promise<boolean> => {
  if (!token) {
    return false
  }

  try {
    const response = await fetch('/api/admin/settings', {
      headers: { Authorization: `Bearer ${token}` }
    })
    return response.ok
  } catch {
    return false
  }
}
