import { AuthService } from "./AuthService"
import { AvatarService } from "./AvatarService"
import { PlayService } from "./PlayService"

export const authService = new AuthService()
export const avatarService = new AvatarService()
export const playService = new PlayService()

export function getViverse(): any {
  try {
    const w: any = window as any
    const fromWindow = w?.viverse
    const fromParent = (w?.parent && w.parent !== w) ? (w.parent as any)?.viverse : undefined
    const fromTop = (w?.top && w.top !== w) ? (w.top as any)?.viverse : undefined
    if (!fromWindow && (fromParent || fromTop)) {
      console.log("[SDK] using cross-frame viverse", { parent: !!fromParent, top: !!fromTop })
    }
    return fromWindow || fromParent || fromTop
  } catch {
    return (window as any).viverse
  }
}