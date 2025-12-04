import { Peer, MediaConnection } from "peerjs";
import { Config } from "../Config";
import { Settings } from "../Settings";

export class VoiceManager {
    private _peer: Peer | null = null;
    private _localStream: MediaStream | null = null;
    private _processedStream: MediaStream | null = null;
    private _audioCtx: AudioContext | null = null;
    private _micGain: GainNode | null = null;
    private _connections: Map<string, MediaConnection> = new Map();
    private _myPeerId: string = "";
    private _isMuted: boolean = false;

    constructor() {
    }

    private _getPeerId(sessionId: string): string {
        // PeerJS often has issues with IDs starting with special chars or containing non-alphanumeric chars depending on server.
        // Colyseus IDs are URL-safe base64 (can contain '-' and '_').
        // We prefix with 'v' and replace '-' with 'd' and '_' with 'u' to ensure a strictly alphanumeric ID.
        return "v" + sessionId.replace(/-/g, "d").replace(/_/g, "u");
    }

    public async initialize(userId: string): Promise<void> {
        if (this._peer) return;

        this._myPeerId = this._getPeerId(userId);

        try {
            this._localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
            if (Ctx) {
                this._audioCtx = new Ctx();
                if (this._audioCtx && this._localStream) {
                    const src = this._audioCtx.createMediaStreamSource(this._localStream);
                    this._micGain = this._audioCtx.createGain();
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

        // Initialize PeerJS
        this._peer = new Peer(this._myPeerId, {
            debug: 1
        });

        this._peer.on('open', (id) => {
            console.log('VoiceManager: PeerJS connected with ID', id);
        });

        this._peer.on('call', (call) => {
            console.log('VoiceManager: Incoming call from', call.peer);
            // Answer the call with our local stream (if available)
            call.answer(this._localStream || undefined);
            this._handleCall(call);
        });

        this._peer.on('error', (err) => {
            console.error('VoiceManager: PeerJS error', err);
        });
    }

    public call(remotePeerId: string): void {
        const targetId = this._getPeerId(remotePeerId);
        if (!this._peer || this._connections.has(targetId)) return;
        if (targetId === this._myPeerId) return;

        console.log(`VoiceManager: Calling ${targetId} (orig: ${remotePeerId})...`);
        // We can call even if we don't have a stream (receive only mode?)
        // PeerJS documentation says we can pass undefined stream.
        const stream = this._processedStream || this._localStream || new MediaStream();
        const call = this._peer.call(targetId, stream);
        this._handleCall(call);
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
        const targetId = this._getPeerId(peerId);
        const conn = this._connections.get(targetId);
        if (conn) {
            console.log(`VoiceManager: Closing connection with ${targetId} (orig: ${peerId})`);
            conn.close();
            this._removeStream(targetId);
            this._connections.delete(targetId);
        }
    }

    public leave(): void {
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
            this._peer.destroy();
            this._peer = null;
        }

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
