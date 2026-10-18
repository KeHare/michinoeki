// 廻 — 合言葉でつなぐ旅帳（D1 binding: DB / 表は schema.sql）
// POST /api/sync  {k, ver, state}
//   k     = sha256("meguri|合言葉")（64桁の16進）。サーバは合言葉そのものを受け取らない
//   state = 端末の旅帳。null なら読むだけ（ver が同じなら {same:true} だけ返す）
//   返り値 {ver, state} = サーバで両方を重ねた結果。端末はこれを自分の帳に重ねる
// 重ね方（mergeState）は index.html の同名関数と同じ。片方を直したらもう片方も直す
const MARK_KINDS = ["visited", "want", "trip"];
const MAX_BYTES = 200_000;

function mergeState(a, b){
  a = a || {}; b = b || {};
  const out = { marks:{}, vdate:{}, plan:null, drive:null };
  for(const kind of MARK_KINDS){
    const A = (a.marks && a.marks[kind]) || {}, B = (b.marks && b.marks[kind]) || {};
    const m = {};
    for(const id of new Set([...Object.keys(A), ...Object.keys(B)])){
      const x = A[id], y = B[id];
      if(!Array.isArray(x)) { if(Array.isArray(y)) m[id] = y; continue; }
      if(!Array.isArray(y)) { m[id] = x; continue; }
      // 新しく触った方が勝ち。同時刻（つないだ直後の古い記録どうし）は「ある」方を残す
      m[id] = y[1] > x[1] ? y : x[1] > y[1] ? x : (x[0] >= y[0] ? x : y);
    }
    out.marks[kind] = m;
  }
  const VA = a.vdate || {}, VB = b.vdate || {}, vis = out.marks.visited;
  for(const id of Object.keys(vis)){
    if(!vis[id][0]) continue;
    const fromB = (b.marks && b.marks.visited && b.marks.visited[id]) === vis[id];
    const d = fromB ? (VB[id] || VA[id]) : (VA[id] || VB[id]);
    if(d) out.vdate[id] = d;
  }
  const newer = (x, y) => !x ? (y || null) : !y ? x : ((y.t || 0) > (x.t || 0) ? y : x);
  out.plan = newer(a.plan, b.plan);
  out.drive = newer(a.drive, b.drive);
  return out;
}

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type",
  "access-control-max-age": "86400",
};
const json = (o, s = 200) => new Response(JSON.stringify(o), {
  status: s, headers: { "content-type": "application/json;charset=utf-8", "cache-control": "no-store", ...CORS },
});

export async function onRequestOptions(){ return new Response(null, { status: 204, headers: CORS }); }

export async function onRequestPost({ request, env }){
  let body;
  try{ body = await request.json(); }catch{ return json({ error: "bad json" }, 400); }
  const k = String((body && body.k) || "").toLowerCase();
  if(!/^[0-9a-f]{64}$/.test(k)) return json({ error: "auth" }, 401);
  const DB = env.DB;
  const read = () => DB.prepare("SELECT state, ver FROM tabi WHERE k=?").bind(k).first();

  // 読むだけ
  if(!body.state){
    const row = await read();
    if(!row) return json({ ver: 0, state: null });
    if(body.ver != null && +body.ver === row.ver) return json({ ver: row.ver, same: true });
    return json({ ver: row.ver, state: JSON.parse(row.state) });
  }

  if(typeof body.state !== "object") return json({ error: "bad state" }, 400);
  if(JSON.stringify(body.state).length > MAX_BYTES) return json({ error: "too large" }, 413);

  // 重ねて書く。間にもう一台が書いていたら（ver がずれていたら）読み直してやり直す
  for(let tries = 0; tries < 5; tries++){
    const row = await read();
    const merged = mergeState(row ? JSON.parse(row.state) : null, body.state);
    const s = JSON.stringify(merged);
    const now = Date.now();
    if(row){
      if(s === row.state) return json({ ver: row.ver, state: merged });
      const r = await DB.prepare("UPDATE tabi SET state=?, ver=ver+1, updated=? WHERE k=? AND ver=?")
        .bind(s, now, k, row.ver).run();
      if(r.meta && r.meta.changes === 1) return json({ ver: row.ver + 1, state: merged });
    }else{
      const r = await DB.prepare("INSERT OR IGNORE INTO tabi (k, state, ver, created, updated) VALUES (?, ?, 1, ?, ?)")
        .bind(k, s, now, now).run();
      if(r.meta && r.meta.changes === 1) return json({ ver: 1, state: merged });
    }
  }
  return json({ error: "busy" }, 503);
}
