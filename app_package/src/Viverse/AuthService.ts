import { getViverse } from "./Viverse"
import { avatarService } from "./Viverse"
export type AuthConfig = {
  clientId: string
  domain: string
  cookieDomain?: string
}

export type AuthInfo = {
  access_token: string
  account_id: string
  expires_in: number
  state?: string
}

export class AuthService {
  private config?: AuthConfig
  private token?: string
  private accountId?: string
  private guestName?: string
  private sdkClient?: any

  initClient(config: AuthConfig): void {
    this.config = config
    const viverse = getViverse()
    if (viverse?.client) {
      try {
        this.sdkClient = new viverse.client({
          clientId: config.clientId,
          domain: config.domain,
          cookieDomain: config.cookieDomain || window.location.hostname
        })
          ; (globalThis as any).viverseClient = this.sdkClient
      } catch (e) {
      }
    } else {
      const script = document.createElement("script")
      script.src = "https://www.viverse.com/static-assets/viverse-sdk/index.umd.cjs"
      script.onload = () => {
        try {
          const v2 = getViverse()
          if (v2?.client) {
            this.sdkClient = new v2.client({
              clientId: config.clientId,
              domain: config.domain,
              cookieDomain: config.cookieDomain || window.location.hostname
            })
              ; (globalThis as any).viverseClient = this.sdkClient
          } else {
          }
        } catch (e) {
        }
      }
      script.onerror = (e) => {}
      document.head.appendChild(script)
    }
  }

  async checkAuth(): Promise<AuthInfo | undefined> {
    const instance = this.sdkClient || (globalThis as any).viverseClient
    if (instance && typeof instance.checkAuth === "function") {
      try {
        const info = await instance.checkAuth()
        if (info && info.access_token) {
          this.token = info.access_token
          this.accountId = info.account_id
          return info as AuthInfo
        }
      } catch (e) {
      }
      if (typeof instance.getToken === "function") {
        try {
          const t = await instance.getToken()
          if (t) {
            this.token = t
            return { access_token: t, account_id: this.accountId || "", expires_in: 0 }
          }
        } catch (e) {
        }
      }
    }
    return undefined
  }

  async getToken(): Promise<string | undefined> {
    if (this.token) return this.token
    const instance = this.sdkClient || (globalThis as any).viverseClient
    if (instance && typeof instance.getToken === "function") {
      try {
        const t = await instance.getToken()
        if (t) {
          this.token = t
          return t
        }
      } catch (e) {
      }
    }
    return undefined
  }

  async getDisplayName(token?: string): Promise<string> {
    try {
      avatarService.init(token || this.token)
      const profile = await avatarService.getProfile()
      if (profile && profile.name) return profile.name
    } catch (e) {
    }
    if (!this.guestName) {
      try {
        const stored = window.localStorage.getItem("sp_guest_name")
        if (stored) {
          this.guestName = stored
        } else {
          const rand = Math.floor(Math.random() * 100000)
          this.guestName = `guest-${rand}`
          window.localStorage.setItem("sp_guest_name", this.guestName)
        }
      } catch { }
      if (!this.guestName) {
        const rand = Math.floor(Math.random() * 100000)
        this.guestName = `guest-${rand}`
      }
    }
    return this.guestName
  }

  async getAccountId(): Promise<string | undefined> {
    if (this.accountId) return this.accountId
    const info = await this.checkAuth()
    if (info && info.account_id) {
      this.accountId = info.account_id
      return this.accountId
    }
    try {
      const stored = window.localStorage.getItem("sp_session_id")
      if (stored) return stored
      const rand = Math.random().toString(36).slice(2)
      window.localStorage.setItem("sp_session_id", rand)
      return rand
    } catch {
      return Math.random().toString(36).slice(2)
    }
  }

  async isGuest(): Promise<boolean> {
    return true
  }

  loginWithWorlds(options?: any): void {
    const instance = this.sdkClient || (globalThis as any).viverseClient
    if (instance && typeof instance.loginWithWorlds === "function") {
      try {
        instance.loginWithWorlds(options)
      } catch (e) {
      }
    } else {
    }
  }
}