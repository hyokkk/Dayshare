// PostgREST + RPC 를 흉내 내는 최소 인메모리 서버 (fetch 대체)
// SQL 함수 규칙(remove_member 등)은 setup.sql과 동일하게 재현한다.
function createMock() {
  const db = { users: [], groups: [], group_members: [], events: [] };
  const log = [];
  const pk = {
    users: (r) => r.user_id,
    groups: (r) => r.code,
    group_members: (r) => r.group_code + "|" + r.user_id,
    events: (r) => r.id,
  };
  const HIDDEN = { users: ["recovery_code"] };
  const now = () => new Date().toISOString();

  function parseFilters(sp) {
    const f = [];
    for (const [k, v] of sp.entries()) {
      if (["select", "order", "limit", "on_conflict", "columns"].includes(k)) continue;
      const m = v.match(/^(eq|in)\.(.*)$/);
      if (!m) continue;
      if (m[1] === "eq") f.push((r) => String(r[k]) === decodeURIComponent(m[2]));
      else {
        const list = m[2].replace(/^\(|\)$/g, "").split(",").map((x) => decodeURIComponent(x.replace(/^"|"$/g, "")));
        f.push((r) => list.includes(String(r[k])));
      }
    }
    return (r) => f.every((fn) => fn(r));
  }

  function project(table, rows, select) {
    const hidden = HIDDEN[table] || [];
    if (!select || select === "*") {
      if (hidden.length) throw { status: 401, body: { code: "42501", message: "permission denied for table " + table } };
      return rows.map((r) => ({ ...r }));
    }
    const cols = select.split(",").map((c) => c.trim());
    if (cols.some((c) => hidden.includes(c))) throw { status: 401, body: { code: "42501", message: "permission denied for table " + table } };
    return rows.map((r) => Object.fromEntries(cols.map((c) => [c, r[c]])));
  }

  function rpc(name, a) {
    if (name === "restore_user") {
      const code = String(a.p_code || "").toUpperCase().replace(/[-\s]/g, "");
      const u = db.users.find((x) => x.recovery_code === code);
      return u ? [{ user_id: u.user_id, nickname: u.nickname, color: u.color }] : [];
    }
    const g = db.groups.find((x) => x.code === a.p_code);
    if (!g) throw { status: 400, body: { code: "P0001", message: "GROUP_NOT_FOUND" } };
    if (name === "rename_group") {
      const nm = String(a.p_name || "").trim();
      if (!nm) throw { status: 400, body: { code: "P0001", message: "EMPTY_NAME" } };
      if (a.p_requester !== g.owner_id) throw { status: 400, body: { code: "P0001", message: "NOT_ALLOWED" } };
      g.name = nm;
      return nm;
    }
    if (name === "remove_member") {
      if (a.p_requester !== g.owner_id && a.p_requester !== a.p_target) throw { status: 400, body: { code: "P0001", message: "NOT_ALLOWED" } };
      if (a.p_target === g.owner_id) {
        const others = db.group_members.filter((m) => m.group_code === g.code && m.user_id !== g.owner_id).length;
        if (others > 0) throw { status: 400, body: { code: "P0001", message: "OWNER_MUST_TRANSFER" } };
        db.groups = db.groups.filter((x) => x.code !== g.code);
        db.group_members = db.group_members.filter((m) => m.group_code !== g.code);
        db.events = db.events.filter((e) => e.group_code !== g.code);
        return "group_deleted";
      }
      db.events = db.events.filter((e) => !(e.group_code === g.code && e.user_id === a.p_target && e.type === "personal"));
      db.group_members = db.group_members.filter((m) => !(m.group_code === g.code && m.user_id === a.p_target));
      return "removed";
    }
    if (name === "transfer_owner") {
      if (a.p_requester !== g.owner_id) throw { status: 400, body: { code: "P0001", message: "NOT_ALLOWED" } };
      if (!db.group_members.some((m) => m.group_code === g.code && m.user_id === a.p_new_owner)) throw { status: 400, body: { code: "P0001", message: "NOT_A_MEMBER" } };
      g.owner_id = a.p_new_owner;
      return "transferred";
    }
    throw { status: 404, body: { message: "no rpc " + name } };
  }

  async function fetchImpl(input, init = {}) {
    const url = new URL(typeof input === "string" ? input : input.url);
    const method = (init.method || "GET").toUpperCase();
    const headers = Object.fromEntries(Object.entries(init.headers || {}).map(([k, v]) => [k.toLowerCase(), v]));
    const body = init.body ? JSON.parse(init.body) : null;
    const path = url.pathname.replace(/^\/rest\/v1\//, "");
    log.push(method + " " + path + url.search);
    const json = (status, data) =>
      new Response(data === undefined ? null : JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
    try {
      if (path.startsWith("rpc/")) return json(200, rpc(path.slice(4), body || {}));
      const table = path;
      if (!db[table]) return json(404, { message: "no table " + table });
      const sp = url.searchParams;
      const match = parseFilters(sp);

      if (method === "GET") {
        let rows = db[table].filter(match);
        const ord = sp.get("order");
        if (ord) { const c = ord.split(".")[0]; rows = rows.slice().sort((a, b) => String(a[c]).localeCompare(String(b[c]))); }
        const lim = sp.get("limit");
        if (lim) rows = rows.slice(0, +lim);
        const out = project(table, rows, sp.get("select"));
        if ((headers["accept"] || "").includes("vnd.pgrst.object")) {
          if (out.length === 1) return json(200, out[0]);
          return json(406, { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned", details: "The result contains 0 rows" });
        }
        return json(200, out);
      }
      if (method === "POST") {
        const rows = Array.isArray(body) ? body : [body];
        const upsert = (headers["prefer"] || "").includes("resolution=merge-duplicates");
        for (const r of rows) {
          const row = { ...r };
          if (table === "groups" && !row.created_at) row.created_at = now();
          if (table === "group_members" && !row.joined_at) row.joined_at = now();
          if (table === "events") { row.created_at = row.created_at || now(); row.updated_at = row.updated_at || now(); }
          const k = pk[table](row);
          const i = db[table].findIndex((x) => pk[table](x) === k);
          if (i >= 0) {
            if (!upsert) return json(409, { code: "23505", message: "duplicate key value violates unique constraint" });
            db[table][i] = { ...db[table][i], ...row };
          } else {
            if (table === "users" && db.users.some((u) => u.recovery_code === row.recovery_code))
              return json(409, { code: "23505", message: "duplicate recovery_code" });
            db[table].push(row);
          }
        }
        return json(201, undefined);
      }
      if (method === "PATCH") {
        if (table === "users" && ("recovery_code" in body)) return json(401, { code: "42501", message: "permission denied" });
        db[table].forEach((r, i) => { if (match(r)) db[table][i] = { ...r, ...body }; });
        return json(204, undefined);
      }
      if (method === "DELETE") {
        db[table] = db[table].filter((r) => !match(r));
        return json(204, undefined);
      }
    } catch (e) {
      if (e && e.status) return json(e.status, e.body);
      throw e;
    }
    return json(400, { message: "unsupported" });
  }
  return { db, log, fetch: fetchImpl };
}
module.exports = { createMock };
