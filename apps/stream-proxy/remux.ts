/**
 * Lecture des MKV (et AVI, WMV…) partout : les navigateurs ne savent pas ouvrir
 * ces conteneurs. ffmpeg les réécrit à la volée en HLS, sans toucher à la vidéo
 * (peu de CPU : compatible avec un hébergement gratuit) ; seul l'audio est converti
 * en AAC si besoin (AC3 et DTS ne passent pas dans les navigateurs).
 *
 * ffmpeg lit le fichier en passant par ce proxy lui-même (/s/…) : mêmes contrôles
 * anti-SSRF, redirections et en-têtes, et les identifiants restent dans le jeton.
 *
 * Une session par fichier : une avance rapide hors de ce qui est déjà converti ou un
 * changement de langue la remplace. Sessions limitées, supprimées dès qu'on arrête
 * de les interroger, et segments déjà lus effacés pour ne pas remplir le disque.
 */
import { spawn, execFile, type ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync, promises as fs, rmSync } from 'node:fs';
import type http from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';

const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';
const FFPROBE = process.env.FFPROBE_PATH || 'ffprobe';
const ROOT = join(tmpdir(), 'oria-remux-' + process.pid);
const MAX_SESSIONS = 2;
const IDLE_MS = 60_000;
const PLAYLIST_WAIT_MS = 45_000;
const PROBE_TIMEOUT_MS = 45_000;
/** Lecture d'avance limitée : un film abandonné ne consomme pas tout le quota de trafic. */
const READ_RATE = '4';
const SEGMENT_SEC = '6';
const KEEP_SEGMENTS_BEHIND = 10;
/** Audio que les navigateurs lisent sans conversion. */
const AUDIO_COPY = ['aac', 'mp3'];

export interface MediaInfo {
  duration: number | null;
  video: string | null;
  audio: { id: number; codec: string; lang: string | null; title: string | null; channels: number | null }[];
}

interface Session {
  key: string;
  start: number;
  audio: number;
  dir: string;
  proc: ChildProcess;
  lastUsed: number;
  ended: boolean;
  failed: string | null;
}

const sessions = new Map<string, Session>();
const probes = new Map<string, Promise<MediaInfo>>();
let seq = 0;

export const sourceKey = (url: string) => createHash('sha256').update(url).digest('hex').slice(0, 24);

export function probe(key: string, input: string): Promise<MediaInfo> {
  const hit = probes.get(key);
  if (hit) return hit;
  const p = new Promise<MediaInfo>((resolve, reject) => {
    execFile(
      FFPROBE,
      ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', input],
      { timeout: PROBE_TIMEOUT_MS, maxBuffer: 8 * 1024 * 1024 },
      (err, out) => {
        if (err) return reject(err);
        const d = JSON.parse(out) as {
          format?: { duration?: string };
          streams?: { codec_type?: string; codec_name?: string; channels?: number; tags?: Record<string, string> }[];
        };
        const streams = d.streams || [];
        const duration = Number(d.format && d.format.duration);
        resolve({
          duration: isFinite(duration) && duration > 0 ? duration : null,
          video: (streams.find((s) => s.codec_type === 'video') || {}).codec_name || null,
          audio: streams
            .filter((s) => s.codec_type === 'audio')
            .map((s, id) => ({
              id,
              codec: s.codec_name || '',
              lang: (s.tags && s.tags.language) || null,
              title: (s.tags && s.tags.title) || null,
              channels: s.channels || null,
            })),
        });
      },
    );
  });
  probes.set(key, p);
  p.catch(() => probes.delete(key));
  return p;
}

function stop(s: Session) {
  sessions.delete(s.key);
  s.proc.kill('SIGKILL');
  // Le processus doit avoir lâché ses fichiers.
  setTimeout(() => fs.rm(s.dir, { recursive: true, force: true }).catch(() => undefined), 500);
}

function launch(key: string, input: string, info: MediaInfo, start: number, audio: number): Session {
  const dir = join(ROOT, String(++seq));
  rmSync(dir, { recursive: true, force: true });
  const track = info.audio[audio];
  const hevc = info.video === 'hevc';
  const args = [
    '-nostdin', '-loglevel', 'error', '-readrate', READ_RATE,
    ...(start > 0 ? ['-ss', String(start)] : []),
    '-i', input,
    '-map', '0:v:0',
    '-map', '0:a:' + (track ? audio : 0) + '?',
    '-c:v', 'copy',
    ...(track && AUDIO_COPY.includes(track.codec) ? ['-c:a', 'copy'] : ['-c:a', 'aac', '-ac', '2', '-b:a', '160k']),
    '-sn', '-dn',
    // Le HEVC n'est lisible dans les navigateurs qu'en MP4 fragmenté.
    ...(hevc ? ['-tag:v', 'hvc1', '-hls_segment_type', 'fmp4', '-hls_fmp4_init_filename', 'init.mp4'] : []),
    '-f', 'hls', '-hls_time', SEGMENT_SEC, '-hls_list_size', '0', '-hls_playlist_type', 'event',
    '-hls_flags', 'temp_file',
    '-hls_segment_filename', hevc ? 'seg%d.m4s' : 'seg%d.ts',
    'index.m3u8',
  ];
  const session: Session = { key, start, audio, dir, proc: null as unknown as ChildProcess, lastUsed: Date.now(), ended: false, failed: null };
  mkdirSync(dir, { recursive: true });
  session.proc = run(args, session);
  return session;
}

function run(args: string[], s: Session): ChildProcess {
  const proc = spawn(FFMPEG, args, { cwd: s.dir, stdio: ['ignore', 'ignore', 'pipe'] });
  let errors = '';
  proc.stderr!.on('data', (d) => {
    if (errors.length < 2000) errors += String(d);
  });
  proc.on('error', (e) => {
    s.failed = 'ffmpeg indisponible : ' + e.message;
    s.ended = true;
  });
  proc.on('exit', (code) => {
    s.ended = true;
    if (code) {
      s.failed = 'ffmpeg ' + code + ' : ' + errors.slice(0, 300);
      if (code !== null) console.error('[remux]', s.failed);
    }
  });
  return proc;
}

function sessionFor(key: string, input: string, info: MediaInfo, start: number, audio: number): Session {
  const cur = sessions.get(key);
  if (cur && cur.start === start && cur.audio === audio) return cur;
  if (cur) stop(cur);
  if (sessions.size >= MAX_SESSIONS) {
    const oldest = Array.from(sessions.values()).sort((a, b) => a.lastUsed - b.lastUsed)[0]!;
    stop(oldest);
  }
  const s = launch(key, input, info, start, audio);
  sessions.set(key, s);
  return s;
}

const reaper = setInterval(() => {
  const now = Date.now();
  for (const s of sessions.values()) if (now - s.lastUsed > IDLE_MS) stop(s);
}, 15_000);
reaper.unref();

export function stopAllRemux() {
  for (const s of sessions.values()) stop(s);
  rmSync(ROOT, { recursive: true, force: true });
}

const count = (text: string) => (text.match(/#EXTINF/g) || []).length;

/** La playlist existe et contient assez de segments pour démarrer ? */
async function waitPlaylist(s: Session): Promise<string | null> {
  const file = join(s.dir, 'index.m3u8');
  const until = Date.now() + PLAYLIST_WAIT_MS;
  while (Date.now() < until) {
    s.lastUsed = Date.now();
    const text = existsSync(file) ? await fs.readFile(file, 'utf8').catch(() => '') : '';
    if (text && (count(text) >= 2 || s.ended)) return text;
    if (s.ended) return null;
    await new Promise((r) => setTimeout(r, 300));
  }
  return null;
}

type Send = (res: http.ServerResponse, status: number, body: string) => void;

export async function servePlaylist(
  res: http.ServerResponse,
  cors: Record<string, string>,
  send: Send,
  key: string,
  input: string,
  start: number,
  audio: number,
) {
  const info = await probe(key, input);
  const s = sessionFor(key, input, info, start, audio);
  const text = await waitPlaylist(s);
  if (!text) return send(res, s.failed ? 502 : 503, s.failed || 'remux not ready');
  // Une playlist en cours d'écriture démarre sinon vers sa fin sur certains lecteurs.
  const body = text.replace('#EXTM3U', '#EXTM3U\n#EXT-X-START:TIME-OFFSET=0,PRECISE=YES');
  res.writeHead(200, { ...cors, 'Content-Type': 'application/vnd.apple.mpegurl', 'Cache-Control': 'no-store' });
  res.end(body);
}

export async function serveSegment(res: http.ServerResponse, cors: Record<string, string>, send: Send, key: string, name: string) {
  const s = sessions.get(key);
  if (!s) return send(res, 404, 'no session');
  s.lastUsed = Date.now();
  const file = join(s.dir, name);
  if (!existsSync(file)) return send(res, 404, 'no segment');

  const m = /^seg(\d+)\./.exec(name);
  if (m) {
    const old = Number(m[1]) - KEEP_SEGMENTS_BEHIND - 1;
    if (old >= 0) fs.rm(join(s.dir, name.replace(/\d+/, String(old))), { force: true }).catch(() => undefined);
  }
  res.writeHead(200, {
    ...cors,
    'Content-Type': name.endsWith('.ts') ? 'video/mp2t' : 'video/mp4',
    'Cache-Control': 'no-store',
  });
  await pipeline(createReadStream(file), res).catch(() => undefined);
}
