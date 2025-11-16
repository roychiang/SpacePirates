import { getViverse } from "./Viverse"
export type ActiveAvatar = {
  headIconUrl: string
  vrmUrl?: string
}

export type Profile = {
  name: string
  activeAvatar: ActiveAvatar | null
}

export class AvatarService {
  private token?: string
  private client?: any

  init(token?: string): void {
    this.token = token
    try {
      const viverse = getViverse()
      if (viverse?.avatar) {
        this.client = new viverse.avatar({ baseURL: 'https://sdk-api.viverse.com/', token: token })
        ;(globalThis as any).avatarClient = this.client
        console.log("[Avatar] client instantiated", { hasToken: !!token })
      } else {
        this.client = undefined
        console.log("[Avatar] avatar constructor missing")
      }
    } catch (e) {
      console.log("[Avatar] instantiate error", e)
    }
  }

  async getProfile(): Promise<Profile> {
    const ts = new Date().toISOString()
    const t0 = performance.now()
    console.log("[Avatar] getProfile start", ts)
    try {
      if (this.client && typeof this.client.getProfile === 'function') {
        const p = await this.client.getProfile()
        const t1 = performance.now()
        console.log("[Avatar] getProfile result", { profile: p, ts: new Date().toISOString(), ms: Math.round(t1 - t0) })
        if (p) return p as Profile
      } else {
        const avatar = getViverse()?.avatar
        if (avatar && typeof avatar.getProfile === 'function') {
          const p = await avatar.getProfile(this.token)
          const t1 = performance.now()
          console.log("[Avatar] getProfile via global", { profile: p, ts: new Date().toISOString(), ms: Math.round(t1 - t0) })
          if (p) return p as Profile
        }
      }
    } catch (e) {
      console.log("[Avatar] getProfile error", e)
    }
    return { name: "guest", activeAvatar: null }
  }

  async getActiveAvatar(): Promise<ActiveAvatar> {
    const p = await this.getProfile()
    if (p.activeAvatar) return p.activeAvatar
    return { headIconUrl: "", vrmUrl: "" }
  }

  async getPublicAvatarList(): Promise<ActiveAvatar[]> {
    try {
      if (this.client && typeof this.client.getPublicAvatarList === 'function') {
        const ts = new Date().toISOString()
        const t0 = performance.now()
        const list = await this.client.getPublicAvatarList()
        const t1 = performance.now()
        console.log("[Avatar] getPublicAvatarList", { count: Array.isArray(list) ? list.length : 0, ts, ms: Math.round(t1 - t0) })
        if (Array.isArray(list)) return list
      } else {
        const avatar = getViverse()?.avatar
        if (avatar && typeof avatar.getPublicAvatarList === 'function') {
          const list = await avatar.getPublicAvatarList()
          console.log("[Avatar] getPublicAvatarList via global", Array.isArray(list) ? list.length : 0)
          if (Array.isArray(list)) return list
        }
      }
    } catch (e) {
      console.log("[Avatar] getPublicAvatarList error", e)
    }
    return []
  }

  async getAvatarFileWithSDK(url: string): Promise<ArrayBuffer> {
    try {
      if (this.client && typeof this.client.getAvatarFileWithSDK === 'function') {
        const data = await this.client.getAvatarFileWithSDK(url)
        return data as ArrayBuffer
      } else {
        const avatar = getViverse()?.avatar
        if (avatar && typeof avatar.getAvatarFileWithSDK === 'function') {
          const data = await avatar.getAvatarFileWithSDK(url)
          return data as ArrayBuffer
        }
      }
    } catch (e) {
      console.log("[Avatar] getAvatarFileWithSDK error", e)
    }
    return new ArrayBuffer(0)
  }

  getHeadIconUrlOrDefault(profile?: Profile): string {
    if (!profile) return ""
    if (!profile.activeAvatar) return ""
    return profile.activeAvatar.headIconUrl || ""
  }
}