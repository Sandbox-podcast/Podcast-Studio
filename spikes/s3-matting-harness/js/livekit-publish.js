/**
 * Optional LiveKit OSS publish helper for S3 matting harness (spike).
 * Token shape matches S1 lab: GET /api/token?room=&identity= → { url, room, identity, token }
 */
import {
  LocalAudioTrack,
  LocalVideoTrack,
  Room,
  RoomEvent,
} from "https://esm.sh/livekit-client@2.9.1";

/** @typedef {(phase: string, detail?: string) => void} StatusCallback */

/**
 * @param {string} tokenUrl
 * @param {string} room
 * @param {string} identity
 */
async function fetchLabToken(tokenUrl, room, identity) {
  const u = new URL(tokenUrl);
  u.searchParams.set("room", room);
  u.searchParams.set("identity", identity);
  const res = await fetch(u);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const msg =
      typeof err.error === "string"
        ? err.error
        : `token HTTP ${res.status}`;
    throw new Error(msg);
  }
  return res.json();
}

export class LiveKitPublisher {
  /** @type {Room | null} */
  #room = null;
  /** @type {LocalVideoTrack | null} */
  #publishedVideo = null;
  /** @type {LocalAudioTrack | null} */
  #publishedAudio = null;
  /** @type {StatusCallback | null} */
  #onStatus = null;

  /**
   * @param {StatusCallback} onStatus
   */
  constructor(onStatus) {
    this.#onStatus = onStatus;
  }

  get connected() {
    return this.#room?.state === "connected";
  }

  #status(phase, detail) {
    this.#onStatus?.(phase, detail);
  }

  /**
   * @param {{
   *   livekitUrl: string;
   *   room: string;
   *   identity: string;
   *   tokenUrl: string;
   *   pastedToken: string;
   * }} opts
   * @param {{ videoTrack: MediaStreamTrack; audioTrack?: MediaStreamTrack | null }} tracks
   */
  async connect(opts, tracks) {
    if (this.#room) {
      await this.disconnect();
    }
    if (!tracks.videoTrack) {
      throw new Error("No video track — enable synthetic smoke or start camera.");
    }

    this.#status("connecting", "fetching token…");

    let url = opts.livekitUrl.trim();
    let token = opts.pastedToken.trim();

    if (!token) {
      try {
        const data = await fetchLabToken(opts.tokenUrl.trim(), opts.room, opts.identity);
        token = data.token;
        if (data.url) {
          url = data.url;
        }
      } catch (e) {
        const hint =
          " Paste a JWT in the harness if the token server is on another origin (CORS).";
        throw new Error(
          `${e instanceof Error ? e.message : String(e)}.${hint}`,
        );
      }
    }

    if (!url) {
      throw new Error("LiveKit URL is empty (set ws://127.0.0.1:7880 or use S1 token server).");
    }
    if (!token) {
      throw new Error("No token — configure token URL or paste JWT.");
    }

    const room = new Room({ adaptiveStream: true, dynacast: true });
    room.on(RoomEvent.Disconnected, () => {
      this.#status("disconnected");
    });
    room.on(RoomEvent.Reconnecting, () => {
      this.#status("reconnecting");
    });
    room.on(RoomEvent.Reconnected, () => {
      this.#status("connected", opts.room);
    });

    await room.connect(url, token);
    this.#room = room;
    this.#status("connected", `${opts.room} as ${opts.identity}`);

    await this.publishTracks(tracks);
  }

  /**
   * @param {{ videoTrack: MediaStreamTrack; audioTrack?: MediaStreamTrack | null }} tracks
   */
  async publishTracks(tracks) {
    if (!this.#room) {
      throw new Error("Not connected");
    }
    if (this.#publishedVideo) {
      await this.#room.localParticipant.unpublishTrack(this.#publishedVideo);
      this.#publishedVideo = null;
    }
    if (this.#publishedAudio) {
      await this.#room.localParticipant.unpublishTrack(this.#publishedAudio);
      this.#publishedAudio = null;
    }
    const localVideo = new LocalVideoTrack(tracks.videoTrack, undefined, true);
    await this.#room.localParticipant.publishTrack(localVideo);
    this.#publishedVideo = localVideo;
    let detail = tracks.videoTrack.label || "video";
    if (tracks.audioTrack) {
      const localAudio = new LocalAudioTrack(tracks.audioTrack, undefined, true);
      await this.#room.localParticipant.publishTrack(localAudio);
      this.#publishedAudio = localAudio;
      detail += " + silent audio";
    }
    this.#status("publishing", detail);
  }

  /** @param {MediaStreamTrack} videoTrack */
  async publishVideoTrack(videoTrack) {
    await this.publishTracks({ videoTrack, audioTrack: null });
  }

  async disconnect() {
    if (this.#publishedVideo) {
      try {
        await this.#room?.localParticipant.unpublishTrack(this.#publishedVideo);
      } catch {
        /* ignore */
      }
      this.#publishedVideo = null;
    }
    if (this.#publishedAudio) {
      try {
        await this.#room?.localParticipant.unpublishTrack(this.#publishedAudio);
      } catch {
        /* ignore */
      }
      this.#publishedAudio = null;
    }
    if (this.#room) {
      await this.#room.disconnect();
      this.#room = null;
    }
    this.#status("idle");
  }
}
