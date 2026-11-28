import express, { Router } from 'express';
import { SignJWT, jwtVerify } from 'jose';
import { z } from 'zod';
import type { Role } from '@telecare/shared';
import { AppError } from '../../platform/http/errors';
import type { VideoProvider } from './video';

/**
 * Free video with no vendor account: the two phones send video straight to each
 * other (WebRTC). Our API only introduces them, by passing small "signal"
 * messages (offer, answer, network candidates) between the two people in a room.
 *
 * The call screen is one HTML page this module serves; the app shows it in a
 * web view (phone) or an iframe (web).
 *
 * ponytail: no relay (TURN) server, so some mobile networks that block direct
 * connections won't connect; chat still works. Add a TURN server if that matters.
 * ponytail: signals live in memory, so run one API instance.
 */
const STUN = 'stun:stun.l.google.com:19302';
const MAX_SIGNALS_PER_ROOM = 500;

interface Signal {
  n: number;
  from: string;
  data: unknown;
}
const rooms = new Map<string, { signals: Signal[]; next: number; touched: number }>();

const keyOf = (secret: string) => new TextEncoder().encode(`${secret}:rtc`);

export function createP2pVideoProvider(jwtSecret: string): VideoProvider {
  const key = keyOf(jwtSecret);
  return {
    name: 'p2p',
    createRoom: async (consultationId) => ({ roomId: `c-${consultationId}` }),
    async issueJoinToken(roomId, userId, role, ttlSeconds) {
      const token = await new SignJWT({ room: roomId, role })
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject(userId)
        .setExpirationTime(`${ttlSeconds}s`)
        .sign(key);
      return { token, expiresAt: new Date(Date.now() + ttlSeconds * 1000) };
    },
    endRoom: async (roomId) => {
      rooms.delete(roomId);
    },
  };
}

const SignalBody = z.strictObject({ t: z.string().min(10).max(2000), data: z.unknown() });

export function p2pRoutes(jwtSecret: string): Router {
  const key = keyOf(jwtSecret);
  const router = Router();

  async function verify(token: unknown) {
    if (typeof token !== 'string') throw new AppError(401, 'UNAUTHENTICATED', 'Missing call token.');
    try {
      const { payload } = await jwtVerify(token, key);
      return { room: String(payload.room), userId: String(payload.sub), role: payload.role as Role };
    } catch {
      throw new AppError(401, 'UNAUTHENTICATED', 'This call link has expired. Rejoin from the app.');
    }
  }

  // The call page fetches cross-origin from a web view, with the token (not cookies) as proof.
  router.use('/v1/rtc', (req, res, next) => {
    res.set({ 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type' });
    if (req.method === 'OPTIONS') return void res.status(204).end();
    next();
  });

  router.get('/v1/rtc/call', async (req, res) => {
    const me = await verify(req.query.t);
    const api = `${req.protocol}://${req.get('host')}`;
    res
      .type('html')
      .set('Cache-Control', 'no-store')
      .send(callPage(api, String(req.query.t), me.role));
  });

  router.post('/v1/rtc/signal', express.json({ limit: '64kb' }), async (req, res) => {
    const { t, data } = SignalBody.parse(req.body);
    const me = await verify(t);
    const room = rooms.get(me.room) ?? { signals: [], next: 1, touched: 0 };
    room.signals.push({ n: room.next++, from: me.userId, data });
    if (room.signals.length > MAX_SIGNALS_PER_ROOM) room.signals.shift();
    room.touched = Date.now();
    rooms.set(me.room, room);
    // Forget rooms nobody has used for an hour.
    for (const [id, r] of rooms) if (Date.now() - r.touched > 3_600_000) rooms.delete(id);
    res.status(204).end();
  });

  router.get('/v1/rtc/signal', async (req, res) => {
    const me = await verify(req.query.t);
    const after = Number(req.query.after) || 0;
    const room = rooms.get(me.room);
    const signals = (room?.signals ?? []).filter((s) => s.n > after && s.from !== me.userId);
    res.json({ signals, last: room ? room.next - 1 : 0 });
  });

  return router;
}

/** The call screen. Doctor makes the offer; patient answers. Polls for signals once a second. */
function callPage(api: string, token: string, role: Role) {
  // Escape '<' so nothing in the config (e.g. a Host header) can close the script tag.
  const cfg = JSON.stringify({ api, token, doctor: role === 'DOCTOR', stun: STUN }).replace(/</g, '\\u003c');
  return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Video call</title>
<style>
  html,body{margin:0;height:100%;background:#111A2E;font-family:system-ui,sans-serif;color:#fff;overflow:hidden}
  #remote{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;background:#111A2E}
  #local{position:absolute;right:12px;top:12px;width:28%;max-width:140px;aspect-ratio:3/4;object-fit:cover;border-radius:12px;border:2px solid #fff;background:#333;transform:scaleX(-1)}
  #status{position:absolute;left:0;right:0;top:45%;text-align:center;font-size:17px;padding:0 24px}
  #bar{position:absolute;left:0;right:0;bottom:16px;display:flex;justify-content:center;gap:16px}
  button{min-width:56px;height:56px;border-radius:28px;border:0;font-size:15px;font-weight:700;padding:0 18px;background:#fff;color:#111A2E}
  button.off{background:#B3261E;color:#fff}
</style></head><body>
<video id="remote" autoplay playsinline></video>
<video id="local" autoplay playsinline muted></video>
<div id="status" role="status">Starting camera…</div>
<div id="bar"><button id="mic" aria-label="Mute microphone">Mic on</button><button id="cam" aria-label="Turn camera off">Camera on</button></div>
<script>
const C=${cfg};
const $=id=>document.getElementById(id);
const say=t=>{$('status').textContent=t;$('status').style.display=t?'block':'none'};
let pc=null,stream=null,after=0,pending=[],sid=null;
async function send(data){await fetch(C.api+'/v1/rtc/signal',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({t:C.token,data})})}
function newPc(id){
  if(pc)pc.close();
  sid=id;pending=[];
  pc=new RTCPeerConnection({iceServers:[{urls:C.stun}]});
  stream.getTracks().forEach(t=>pc.addTrack(t,stream));
  pc.ontrack=e=>{$('remote').srcObject=e.streams[0];say('')};
  pc.onicecandidate=e=>{if(e.candidate)send({type:'ice',sid,c:e.candidate})};
  pc.onconnectionstatechange=()=>{
    if(pc.connectionState==='failed')say('Could not connect the video on this network. Please use the chat.');
    if(pc.connectionState==='disconnected')say('Connection lost. Reconnecting…');
  };
}
async function offer(){newPc(crypto.randomUUID());const o=await pc.createOffer();await pc.setLocalDescription(o);send({type:'offer',sid,sdp:pc.localDescription})}
async function onSignal(d){
  if(d.type==='hello'){if(C.doctor)await offer();else send({type:'hello'});return}
  if(d.type==='offer'&&!C.doctor){newPc(d.sid);await pc.setRemoteDescription(d.sdp);const a=await pc.createAnswer();await pc.setLocalDescription(a);send({type:'answer',sid,sdp:pc.localDescription});flush();return}
  if(d.type==='answer'&&C.doctor&&d.sid===sid){await pc.setRemoteDescription(d.sdp);flush();return}
  if(d.type==='ice'&&d.sid===sid){if(pc.remoteDescription)await pc.addIceCandidate(d.c).catch(()=>{});else pending.push(d.c)}
}
function flush(){pending.forEach(c=>pc.addIceCandidate(c).catch(()=>{}));pending=[]}
async function poll(){
  try{const r=await fetch(C.api+'/v1/rtc/signal?t='+encodeURIComponent(C.token)+'&after='+after);
    if(r.status===401){say('This call link has expired. Go back and rejoin.');return}
    const j=await r.json();for(const s of j.signals){after=Math.max(after,s.n);await onSignal(s.data).catch(()=>{})}
  }catch(e){}
  setTimeout(poll,1000);
}
$('mic').onclick=()=>{const t=stream.getAudioTracks()[0];t.enabled=!t.enabled;$('mic').textContent=t.enabled?'Mic on':'Muted';$('mic').className=t.enabled?'':'off'};
$('cam').onclick=()=>{const t=stream.getVideoTracks()[0];t.enabled=!t.enabled;$('cam').textContent=t.enabled?'Camera on':'Camera off';$('cam').className=t.enabled?'':'off'};
(async()=>{
  try{stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user'},audio:true})}
  catch(e){say('Camera or microphone is blocked. Allow them, or use the chat.');return}
  $('local').srcObject=stream;
  say(C.doctor?'Waiting for your patient to join the video…':'Waiting for the doctor to join the video…');
  // Skip signals from before this page opened; then say hello.
  try{const r=await fetch(C.api+'/v1/rtc/signal?t='+encodeURIComponent(C.token)+'&after=0');after=(await r.json()).last||0}catch(e){}
  await send({type:'hello'});poll();
})();
</script></body></html>`;
}
