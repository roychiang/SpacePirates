import { Peer, MediaConnection } from "peerjs";
import { Config } from "../Config";
import { Settings } from "../Settings";

export class VoiceManager {
    private _peer: Peer | null = null;
    private _userId: string | null = null;
    private _localStream: MediaStream | null = null;
    private _processedStream: MediaStream | null = null;
    private _audioCtx: AudioContext | null = null;
    private _micGain: GainNode | null = null;
    private _connections: Map<string, MediaConnection> = new Map();
    private _myPeerId: string = "";
    private _isMuted: boolean = false;
    private _isPeerOpen: boolean = false;
    private _reconnectTimer: number | null = null;
    private _reconnectAttempts: number = 0;
    private _creatingPeer: Promise<void> | null = null;
    private _lifecycleId: number = 0;

    constructor() {
    }

    private _getPeerId(sessionId: string): string {
        // PeerJS often has issues with IDs starting with special chars or containing non-alphanumeric chars depending on server.
        // Colyseus IDs are URL-safe base64 (can contain '-' and '_').
        // We prefix with 'v' and replace '-' with 'd' and '_' with 'u' to ensure a strictly alphanumeric ID.
        return "v" + sessionId.replace(/-/g, "d").replace(/_/g, "u");
    }

    private _clearReconnectTimer(): void {
        if (this._reconnectTimer != null) {
            window.clearTimeout(this._reconnectTimer);
            this._reconnectTimer = null;
        }
    }

    private _scheduleReconnect(): void {
        if (!this._userId) return;
        if (!this._peer) return;
        if ((this._peer as any).destroyed) return;
        if (this._reconnectTimer != null) return;

        const attempt = this._reconnectAttempts;
        const delay = Math.min(8000, 500 * Math.pow(2, attempt));
        this._reconnectAttempts = Math.min(6, attempt + 1);

        this._reconnectTimer = window.setTimeout(() => {
            this._reconnectTimer = null;
            try {
                if (this._peer && !(this._peer as any).destroyed && (this._peer as any).disconnected) {
                    this._peer.reconnect();
                }
            } catch (e) {
                console.warn("VoiceManager: Peer reconnect failed", e);
            }
        }, delay);
    }

    private async _createPeer(): Promise<void> {
        if (!this._userId) return;
        if (this._creatingPeer) {
            await this._creatingPeer;
            return;
        }

        const promise = (async () => {
            this._lifecycleId++;
            const lifecycleId = this._lifecycleId;
            const url = new URL(Config.getPeerServerUrl());
            const isSecure = url.protocol === "https:";
            const port = url.port ? parseInt(url.port, 10) : (isSecure ? 443 : 80);

            const peer = new Peer(this._myPeerId, {
                host: url.hostname,
                port,
                path: url.pathname,
                secure: isSecure,
                debug: 1
            });
            this._peer = peer;
            this._isPeerOpen = false;
            this._clearReconnectTimer();

            peer.on("open", (id) => {
                if (this._lifecycleId !== lifecycleId) return;
                this._isPeerOpen = true;
                this._reconnectAttempts = 0;
                console.log("VoiceManager: PeerJS connected with ID", id);
            });

            peer.on("disconnected", () => {
                if (this._lifecycleId !== lifecycleId) return;
                this._isPeerOpen = false;
                this._scheduleReconnect();
            });

            peer.on("close", () => {
                if (this._lifecycleId !== lifecycleId) return;
                this._isPeerOpen = false;
            });

            peer.on("call", (call) => {
                if (this._lifecycleId !== lifecycleId) return;
                if (!call) return;
                if (!this._peer || (this._peer as any).destroyed || !this._userId) return;
                console.log("VoiceManager: Incoming call from", call.peer);
                try {
                    call.answer(this._localStream || undefined);
                } catch (e) {
                    console.warn("VoiceManager: Answer failed", e);
                }
                this._handleCall(call);
            });

            peer.on("error", (err) => {
                if (this._lifecycleId !== lifecycleId) return;
                this._isPeerOpen = false;
                console.error("VoiceManager: PeerJS error", err);
                this._scheduleReconnect();
            });
        })();

        this._creatingPeer = promise;
        try {
            await promise;
        } finally {
            this._creatingPeer = null;
        }
    }

    public async initialize(userId: string): Promise<void> {
        this._userId = userId;
        this._myPeerId = this._getPeerId(userId);

        if (this._peer && !(this._peer as any).destroyed) {
            if ((this._peer as any).disconnected) {
                try {
                    this._peer.reconnect();
                } catch (e) {
                    console.warn("VoiceManager: Peer reconnect failed", e);
                }
                return;
            }
            if (this._isPeerOpen) return;
        }

        if (this._creatingPeer) {
            try {
                await this._creatingPeer;
            } catch { }
            if (this._isPeerOpen && this._peer && !(this._peer as any).destroyed) return;
        }

        try {
            if (!this._localStream) {
                this._localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            }
            const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
            if (Ctx) {
                if (!this._audioCtx) {
                    this._audioCtx = new Ctx();
                }
                if (this._audioCtx && this._localStream && !this._processedStream) {
                    const src = this._audioCtx.createMediaStreamSource(this._localStream);
                    if (!this._micGain) {
                        this._micGain = this._audioCtx.createGain();
                    }
                    this._micGain.gain.value = Settings.micVolume;
                    const dest = this._audioCtx.createMediaStreamDestination();
                    src.connect(this._micGain);
                    this._micGain.connect(dest);
                    this._processedStream = dest.stream;
                }
            }
        } catch (err) {
            console.error("VoiceManager: Failed to get local audio stream", err);
        }

        if (this._peer && !(this._peer as any).destroyed) {
            try {
                this._peer.destroy();
            } catch { }
            this._peer = null;
            this._isPeerOpen = false;
        }
        await this._createPeer();
    }

    private _normalizePeerKey(peerId: string): string {
        if (this._connections.has(peerId)) return peerId;
        if (peerId === this._myPeerId) return peerId;
        if (peerId.includes("-") || peerId.includes("_")) return this._getPeerId(peerId);
        if (peerId.startsWith("v") && /^[a-zA-Z0-9]+$/.test(peerId)) return peerId;
        return this._getPeerId(peerId);
    }

    public call(remotePeerId: string): void {
        if (!remotePeerId || typeof remotePeerId !== "string") return;
        const targetId = this._getPeerId(remotePeerId);
        const peer = this._peer;
        if (!peer || (peer as any).destroyed || this._connections.has(targetId)) return;
        if (targetId === this._myPeerId) return;
        if ((peer as any).disconnected || !this._isPeerOpen) {
            this._scheduleReconnect();
            return;
        }

        console.log(`VoiceManager: Calling ${targetId} (orig: ${remotePeerId})...`);
        const stream = this._processedStream || this._localStream || new MediaStream();
        try {
            const call = peer.call(targetId, stream);
            if (!call) return;
            this._handleCall(call);
        } catch (e) {
            console.warn("VoiceManager: Call failed", e);
            this._scheduleReconnect();
        }
    }

    private _handleCall(call: MediaConnection): void {
        this._connections.set(call.peer, call);

        call.on('stream', (remoteStream) => {
            console.log(`VoiceManager: Received stream from ${call.peer}`);
            this._playStream(call.peer, remoteStream);
        });

        call.on('close', () => {
            console.log(`VoiceManager: Call with ${call.peer} closed`);
            this._removeStream(call.peer);
            this._connections.delete(call.peer);
        });

        call.on('error', (err) => {
            console.error(`VoiceManager: Call error with ${call.peer}`, err);
            this._removeStream(call.peer);
            this._connections.delete(call.peer);
        });
    }

    private _playStream(peerId: string, stream: MediaStream): void {
        let audio = document.getElementById(`audio-${peerId}`) as HTMLAudioElement;
        if (!audio) {
            audio = document.createElement('audio');
            audio.id = `audio-${peerId}`;
            audio.autoplay = true;
            audio.style.display = 'none';
            document.body.appendChild(audio);
        }
        audio.srcObject = stream;
    }

    private _removeStream(peerId: string): void {
        const audio = document.getElementById(`audio-${peerId}`) as HTMLAudioElement;
        if (audio) {
            audio.srcObject = null;
            audio.remove();
        }
    }

    public closeConnection(peerId: string): void {
        const targetId = this._normalizePeerKey(peerId);
        const conn = this._connections.get(targetId);
        if (conn) {
            console.log(`VoiceManager: Closing connection with ${targetId} (orig: ${peerId})`);
            conn.close();
            this._removeStream(targetId);
            this._connections.delete(targetId);
        }
    }

    public leave(): void {
        this._lifecycleId++;
        this._clearReconnectTimer();
        this._reconnectAttempts = 0;
        this._isPeerOpen = false;

        this._connections.forEach(conn => conn.close());
        this._connections.clear();

        if (this._localStream) {
            this._localStream.getTracks().forEach(track => track.stop());
            this._localStream = null;
        }

        this._processedStream = null;
        if (this._audioCtx) {
            this._audioCtx.close();
            this._audioCtx = null;
        }

        if (this._peer) {
            try {
                this._peer.destroy();
            } catch { }
            this._peer = null;
        }
        this._userId = null;
        this._myPeerId = "";

        document.querySelectorAll('[id^="audio-"]').forEach(el => el.remove());
    }

    public toggleMute(): boolean {
        this._isMuted = !this._isMuted;
        if (this._localStream) {
            this._localStream.getAudioTracks().forEach(track => {
                track.enabled = !this._isMuted;
            });
        }
        console.log(`VoiceManager: Microphone ${this._isMuted ? "Muted" : "Unmuted"}`);
        return this._isMuted;
    }

    public isMuted(): boolean {
        return this._isMuted;
    }

    public setMicVolume(v: number): void {
        if (this._micGain) this._micGain.gain.value = v;
    }
}
