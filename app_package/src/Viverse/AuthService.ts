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
        ;(globalThis as any).viverseClient = this.sdkClient
        console.log("[Auth] new viverse.client instantiated", { clientId: config.clientId, domain: config.domain, cookieDomain: (config.cookieDomain || window.location.hostname) })
      } catch (e) {
        console.log("[Auth] instantiate client error", e)
      }
    } else {
      console.log("[Auth] viverse.client constructor not available, loading UMD script")
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
            ;(globalThis as any).viverseClient = this.sdkClient
            console.log("[Auth] UMD script loaded and client instantiated", { clientId: config.clientId, domain: config.domain, cookieDomain: (config.cookieDomain || window.location.hostname) })
          } else {
            console.log("[Auth] UMD script loaded but client constructor missing")
          }
        } catch (e) {
          console.log("[Auth] UMD instantiate error", e)
        }
      }
      script.onerror = (e) => console.log("[Auth] UMD script load error", e)
      document.head.appendChild(script)
    }
  }

  async checkAuth(): Promise<AuthInfo | undefined> {
    const instance = this.sdkClient || (globalThis as any).viverseClient
    if (instance && typeof instance.checkAuth === "function") {
      try {
        const ts = new Date().toISOString()
        const t0 = performance.now()
        console.log("[Auth] checkAuth start", ts)
        const info = await instance.checkAuth()
        const t1 = performance.now()
        console.log("[Auth] checkAuth result", { hasInfo: !!info, hasToken: !!info?.access_token, ts: new Date().toISOString(), ms: Math.round(t1 - t0) })
        if (info && info.access_token) {
          this.token = info.access_token
          this.accountId = info.account_id
          return info as AuthInfo
        }
      } catch (e) {
        console.log("[Auth] checkAuth error", e)
      }
      if (typeof instance.getToken === "function") {
        try {
          const ts2 = new Date().toISOString()
          const t2 = performance.now()
          const t = await instance.getToken()
          const t3 = performance.now()
          console.log("[Auth] getToken fallback", { hasToken: !!t, ts: ts2, ms: Math.round(t3 - t2) })
          if (t) {
            this.token = t
            return { access_token: t, account_id: this.accountId || "", expires_in: 0 }
          }
        } catch (e) {
          console.log("[Auth] getToken fallback error", e)
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
        const ts = new Date().toISOString()
        const t0 = performance.now()
        const t = await instance.getToken()
        const t1 = performance.now()
        console.log("[Auth] getToken direct", { hasToken: !!t, ts, ms: Math.round(t1 - t0) })
        if (t) {
          this.token = t
          return t
        }
      } catch (e) {
        console.log("[Auth] getToken error", e)
      }
    }
    console.log("[Auth] getToken empty")
    return undefined
  }

  async getDisplayName(token?: string): Promise<string> {
    try {
      avatarService.init(token || this.token)
      const profile = await avatarService.getProfile()
      if (profile && profile.name) return profile.name
    } catch (e) {
      console.log("[Auth] getDisplayName error", e)
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
      } catch {}
      if (!this.guestName) {
        const rand = Math.floor(Math.random() * 100000)
        this.guestName = `guest-${rand}`
      }
    }
    return this.guestName
  }

  async isGuest(): Promise<boolean> {
    return true
  }
}