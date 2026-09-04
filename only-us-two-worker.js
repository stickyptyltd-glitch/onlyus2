// Only Us Two — shared backend worker
//
// Provides the one thing local demo mode can't: a place both devices'
// browsers can actually read and write, instead of each having its own
// private, invisible-to-the-other localStorage.
//
// Deploy: Cloudflare dashboard -> Workers & Pages -> Create -> Create Worker
// -> paste this whole file in the editor -> Deploy.
// Then: Settings -> Variables -> KV Namespace Bindings -> Add binding
//   Variable name: OU2_KV
//   KV namespace:  create a new one, e.g. "only-us-two-store"
// Redeploy after adding the binding.
//
// Known limitation, stated plainly: KV doesn't support atomic
// read-modify-write, so joining a room reads the room, checks it's still
// open, then writes — there's a small theoretical race if two people
// tried to join the exact same link in the exact same instant. For a
// two-person pairing tool that's an acceptable, low-probability edge
// case, not a silent one — worth knowing rather than assumed away.

const ALLOWED_ORIGIN = '*'; // tighten to 'https://onlyus2.com' once confirmed working

function cors(resp) {
  resp.headers.set('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  resp.headers.set('Access-Control-Allow-Methods', 'GET,PUT,PATCH,DELETE,OPTIONS');
  resp.headers.set('Access-Control-Allow-Headers', 'Content-Type');
  return resp;
}
function json(data, status = 200) {
  return cors(new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } }));
}
function noContent(status = 204) {
  return cors(new Response(null, { status }));
}

async function getJSON(kv, key) {
  const v = await kv.get(key);
  return v ? JSON.parse(v) : null;
}
async function putJSON(kv, key, value) {
  await kv.put(key, JSON.stringify(value));
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return noContent();
    const kv = env.OU2_KV;
    if (!kv) return json({ error: 'KV binding OU2_KV not configured' }, 500);

    const url = new URL(request.url);
    const parts = url.pathname.split('/').filter(Boolean); // e.g. ['rooms','abc123']

    try {
      // ---- /rooms/:id ----
      if (parts[0] === 'rooms' && parts[1]) {
        const roomId = parts[1];
        const key = 'room:' + roomId;

        if (request.method === 'GET') {
          const room = await getJSON(kv, key);
          return room ? json(room) : json(null, 404);
        }

        if (request.method === 'PUT') {
          const body = await request.json();
          await putJSON(kv, key, body);
          return json(body);
        }

        if (request.method === 'PATCH') {
          const patch = await request.json();
          const existing = await getJSON(kv, key);
          if (!existing) return json({ error: 'not_found' }, 404);
          const merged = { ...existing, ...patch };
          await putJSON(kv, key, merged);
          return json(merged);
        }

        if (request.method === 'DELETE') {
          const idxKey = 'msgindex:' + roomId;
          const ids = (await getJSON(kv, idxKey)) || [];
          await Promise.all(ids.map((id) => kv.delete('msg:' + id)));
          await kv.delete(idxKey);
          await kv.delete(key);
          return noContent();
        }
      }

      // ---- /messages?roomId=X ----
      if (parts[0] === 'messages' && !parts[1] && request.method === 'GET') {
        const roomId = url.searchParams.get('roomId');
        if (!roomId) return json({ error: 'roomId required' }, 400);
        const ids = (await getJSON(kv, 'msgindex:' + roomId)) || [];
        const messages = (await Promise.all(ids.map((id) => getJSON(kv, 'msg:' + id)))).filter(Boolean);
        messages.sort((a, b) => a.createdAt - b.createdAt);
        return json(messages);
      }

      // ---- /messages/:id ----
      if (parts[0] === 'messages' && parts[1]) {
        const msgId = parts[1];
        const key = 'msg:' + msgId;

        if (request.method === 'PUT') {
          const body = await request.json();
          await putJSON(kv, key, body);
          const idxKey = 'msgindex:' + body.roomId;
          const ids = (await getJSON(kv, idxKey)) || [];
          if (!ids.includes(msgId)) {
            ids.push(msgId);
            await putJSON(kv, idxKey, ids);
          }
          return json(body);
        }

        if (request.method === 'DELETE') {
          const existing = await getJSON(kv, key);
          if (existing) {
            const idxKey = 'msgindex:' + existing.roomId;
            const ids = (await getJSON(kv, idxKey)) || [];
            await putJSON(kv, idxKey, ids.filter((id) => id !== msgId));
          }
          await kv.delete(key);
          return noContent();
        }
      }

      return json({ error: 'not_found' }, 404);
    } catch (err) {
      return json({ error: 'server_error', message: String(err) }, 500);
    }
  },
};
