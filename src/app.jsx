import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { createRoot } from "react-dom/client";
import { createClient } from "@supabase/supabase-js";

/* ============================================================
   dayshare — 공유 캘린더 MVP
   그룹 코드로 참여하는 공유 캘린더
   UI는 TimeTree의 월간 캘린더 구성을 참고한다.
   ============================================================ */

/* ---------- 토큰 ---------- */
const T = {
  paper: "#FFFFFF",
  panel: "#FFFFFF",
  ink: "#2B2B2B",
  inkSoft: "#767676",
  inkFaint: "#AFAFAF",
  rule: "#E6E6E6",
  ruleSoft: "#F1F1F1",
  band: "#F2F2F2",
  sun: "#E8453C",
  sat: "#3B6FD4",
  shared: "#1B8377",
  holiday: "#E8453C",
};

/* 멤버 색상 — 공동 일정(틸)과 겹치지 않는 8종 */
const PALETTE = [
  "#D9455F", "#E2793A", "#B8901B", "#5B9E3F",
  "#2F8FA8", "#4A62C4", "#8B5CC7", "#B04E8D",
];

const PERIODS = [
  { k: "am", label: "오전" },
  { k: "noon", label: "점심" },
  { k: "pm", label: "오후" },
  { k: "eve", label: "저녁" },
  { k: "all", label: "종일" },
];
const PERIOD_ORDER = { am: 0, noon: 1, pm: 2, eve: 3, all: 4 };
const periodLabel = (k) => (PERIODS.find((p) => p.k === k) || {}).label || "";

const CATS = [
  { k: "work", label: "직장/업무" },
  { k: "life", label: "일상" },
];
const catLabel = (k) => (CATS.find((c) => c.k === k) || {}).label || "";

/* ---------- 공휴일 (2026~2027, 앱 내장) ----------
   출처: 우주항공청 월력요항 (holidays-kr 배포 자료와 대조 확인)
   데이터에 없는 연도는 공휴일이 표시되지 않는다.
   외부 빌더로 전환하면 이 상수를 지우고 getHoliday의 내부 구현만
   @hyunbinseo/holidays-kr 조회로 교체한다.
--------------------------------------------------- */
const HOLIDAY_DATA = {
  "2026-01-01": ["신정", false],
  "2026-02-16": ["설날 연휴", false],
  "2026-02-17": ["설날", false],
  "2026-02-18": ["설날 연휴", false],
  "2026-03-01": ["삼일절", false],
  "2026-03-02": ["대체공휴일", true],
  "2026-05-01": ["노동절", false],
  "2026-05-05": ["어린이날", false],
  "2026-05-24": ["부처님오신날", false],
  "2026-05-25": ["대체공휴일", true],
  "2026-06-03": ["지방선거일", false],
  "2026-06-06": ["현충일", false],
  "2026-07-17": ["제헌절", false],
  "2026-08-15": ["광복절", false],
  "2026-08-17": ["대체공휴일", true],
  "2026-09-24": ["추석 연휴", false],
  "2026-09-25": ["추석", false],
  "2026-09-26": ["추석 연휴", false],
  "2026-10-03": ["개천절", false],
  "2026-10-05": ["대체공휴일", true],
  "2026-10-09": ["한글날", false],
  "2026-12-25": ["성탄절", false],

  "2027-01-01": ["신정", false],
  "2027-02-06": ["설날 연휴", false],
  "2027-02-07": ["설날", false],
  "2027-02-08": ["설날 연휴", false],
  "2027-02-09": ["대체공휴일", true],
  "2027-03-01": ["삼일절", false],
  "2027-05-01": ["노동절", false],
  "2027-05-03": ["대체공휴일", true],
  "2027-05-05": ["어린이날", false],
  "2027-05-13": ["부처님오신날", false],
  "2027-06-06": ["현충일", false],
  "2027-07-17": ["제헌절", false],
  "2027-07-19": ["대체공휴일", true],
  "2027-08-15": ["광복절", false],
  "2027-08-16": ["대체공휴일", true],
  "2027-09-14": ["추석 연휴", false],
  "2027-09-15": ["추석", false],
  "2027-09-16": ["추석 연휴", false],
  "2027-10-03": ["개천절", false],
  "2027-10-04": ["대체공휴일", true],
  "2027-10-09": ["한글날", false],
  "2027-10-11": ["대체공휴일", true],
  "2027-12-25": ["성탄절", false],
  "2027-12-27": ["대체공휴일", true],
};

/* 공휴일 조회는 반드시 이 함수만 사용한다.
   데이터 출처를 바꿀 때 이 함수 하나만 고치면 되도록 한다. */
function getHoliday(date) {
  const h = HOLIDAY_DATA[date];
  return h ? { name: h[0], isSubstitute: h[1] } : null;
}

/* ---------- 날짜 유틸 (문자열 기반, 타임존 영향 없음) ---------- */
const pad = (n) => String(n).padStart(2, "0");
const ymd = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
const parseYmd = (s) => {
  const [y, m, d] = s.split("-").map(Number);
  return { y, m, d };
};
const toDate = (s) => {
  const { y, m, d } = parseYmd(s);
  return new Date(y, m - 1, d);
};
const fromDate = (dt) => ymd(dt.getFullYear(), dt.getMonth() + 1, dt.getDate());
const addDays = (s, n) => {
  const dt = toDate(s);
  dt.setDate(dt.getDate() + n);
  return fromDate(dt);
};
const dow = (s) => toDate(s).getDay();
const todayStr = () => fromDate(new Date());
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
const fmtKo = (s) => {
  const { y, m, d } = parseYmd(s);
  return `${y}. ${m}. ${d} (${WEEKDAYS[dow(s)]})`;
};
const fmtShort = (s) => {
  const { m, d } = parseYmd(s);
  return `${m}월 ${d}일 (${WEEKDAYS[dow(s)]})`;
};

/* 월 그리드: 일요일 시작, 필요한 주 수만큼 */
function monthGrid(year, month) {
  const first = ymd(year, month, 1);
  const start = addDays(first, -dow(first));
  const last = new Date(year, month, 0).getDate();
  const end = ymd(year, month, last);
  const weeks = [];
  let cur = start;
  while (true) {
    const week = [];
    for (let i = 0; i < 7; i++) {
      week.push(cur);
      cur = addDays(cur, 1);
    }
    weeks.push(week);
    if (week[6] >= end) break;
  }
  return weeks;
}

/* ---------- Supabase 연결 ----------
   anon key는 브라우저에 공개되는 값이다.
   복구 코드는 DB 권한으로 직접 읽기를 막고, restore_user 함수로만 조회한다.
   그 외 데이터(그룹/일정)는 화면 단계에서만 그룹 코드를 요구한다.
------------------------------------------- */
const SUPABASE_URL = "https://icixzfiobhfipxksmyzn.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImljaXh6ZmlvYmhmaXB4a3NteXpuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk5Mjk1MDksImV4cCI6MjEwNTUwNTUwOX0.GIGh4B_jZfaPzpALeMwJHNcHONPU_9T8q4HLknEaR8g";

const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});

let lastError = "";
const note = (e) => {
  lastError = (e && (e.message || e.details)) || String(e);
  return null;
};

/* DB 함수가 던지는 오류 코드를 사람이 읽을 문장으로 */
const ERR_TEXT = {
  GROUP_NOT_FOUND: "그룹을 찾을 수 없습니다.",
  NOT_ALLOWED: "그룹장만 할 수 있습니다.",
  EMPTY_NAME: "그룹 이름을 입력하세요.",
  OWNER_MUST_TRANSFER: "그룹장은 다른 멤버에게 그룹장을 넘긴 뒤 나갈 수 있습니다.",
  NOT_A_MEMBER: "그룹 멤버가 아닙니다.",
};
const errText = () => {
  const k = Object.keys(ERR_TEXT).find((x) => lastError.includes(x));
  return k ? ERR_TEXT[k] : lastError || "알 수 없는 오류";
};

/* ---------- 이 기기에 저장하는 내 정보 ---------- */
/* 앱 이름을 바꿔도 이 키는 유지한다. 바꾸면 모든 사용자의 로그인이 풀린다. */
const LS_KEY = "tc:me:v2";
function loadMe() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}
function saveMeLocal(me) {
  try {
    if (me) localStorage.setItem(LS_KEY, JSON.stringify(me));
    else localStorage.removeItem(LS_KEY);
    return true;
  } catch (e) {
    return false;
  }
}

/* ---------- 식별자 / 코드 생성 ---------- */
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // O/0/I/1 제외
const randChars = (n) => {
  const buf = new Uint32Array(n);
  crypto.getRandomValues(buf);
  return Array.from(buf, (v) => CODE_CHARS[v % CODE_CHARS.length]).join("");
};
const uid = () => randChars(12).toLowerCase() + Date.now().toString(36).slice(-4);
const makeCode = () => randChars(6);
/* 복구 코드: 8자리, 저장은 하이픈 없이 / 표시는 4-4로 */
const makeRecoveryCode = () => randChars(8);
const fmtRecovery = (c) => (c ? `${c.slice(0, 4)}-${c.slice(4)}` : "");
const normRecovery = (c) => (c || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

/* ---------- 행 <-> 앱 객체 변환 ---------- */
const toMember = (r) => ({
  userId: r.user_id,
  nickname: r.nickname,
  color: r.color,
  joinedAt: r.joined_at,
});
const toGroup = (g, ms) => ({
  code: g.code,
  name: g.name,
  ownerId: g.owner_id,
  createdAt: g.created_at,
  members: (ms || []).map(toMember),
});
const toEvent = (r) => ({
  id: r.id,
  userId: r.user_id,
  /* 대신 등록한 사람. 예전 일정에는 없을 수 있어 주인으로 본다. */
  createdBy: r.created_by || r.user_id,
  authorName: r.author_name,
  authorColor: r.author_color,
  type: r.type,
  title: r.title,
  start: r.start_date,
  end: r.end_date,
  category: r.category,
  period: r.period,
  location: r.location || "",
  memo: r.memo || "",
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});
const fromEvent = (ev, code) => ({
  id: ev.id,
  group_code: code,
  user_id: ev.userId,
  created_by: ev.createdBy || ev.userId,
  author_name: ev.authorName,
  author_color: ev.authorColor,
  type: ev.type,
  title: ev.title,
  start_date: ev.start,
  end_date: ev.end,
  category: ev.category,
  period: ev.period,
  location: ev.location || null,
  memo: ev.memo || null,
});


/* ---------- 데이터 접근 ---------- */
const db = {
  async ping() {
    const { error } = await sb.from("groups").select("code").limit(1);
    if (error) return note(error), false;
    return true;
  },

  /* 사용자 */
  async createUser(nickname, color) {
    for (let i = 0; i < 5; i++) {
      const user = { userId: uid(), nickname, color, recoveryCode: makeRecoveryCode() };
      const { error } = await sb.from("users").insert({
        user_id: user.userId,
        nickname,
        color,
        recovery_code: user.recoveryCode,
      });
      if (!error) return user;
      if (error.code !== "23505") return note(error); // 23505: 중복 → 다시 생성
    }
    lastError = "코드 생성에 실패했습니다. 다시 시도해 주세요.";
    return null;
  },

  async userExists(userId) {
    const { data, error } = await sb.from("users").select("user_id").eq("user_id", userId).maybeSingle();
    if (error) return note(error), null;
    return !!data;
  },

  async restoreUser(code) {
    const { data, error } = await sb.rpc("restore_user", { p_code: normRecovery(code) });
    if (error) return note(error);
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return null;
    return { userId: row.user_id, nickname: row.nickname, color: row.color };
  },

  async updateUser(userId, nickname, color) {
    const { error } = await sb.from("users").update({ nickname, color }).eq("user_id", userId);
    if (error) return note(error), false;
    const { error: e2 } = await sb.from("group_members").update({ nickname }).eq("user_id", userId);
    if (e2) return note(e2), false;
    return true;
  },

  async myGroupCodes(userId) {
    const { data, error } = await sb.from("group_members").select("group_code").eq("user_id", userId);
    if (error) return note(error), null;
    return (data || []).map((r) => r.group_code);
  },

  /* 그룹 */
  async getGroup(code) {
    const { data, error } = await sb.from("groups").select("*").eq("code", code).maybeSingle();
    if (error) return note(error);
    if (!data) return null;
    const { data: ms, error: e2 } = await sb
      .from("group_members").select("*").eq("group_code", code).order("joined_at");
    if (e2) return note(e2);
    return toGroup(data, ms);
  },

  async getGroups(codes) {
    if (!codes || !codes.length) return [];
    const { data, error } = await sb.from("groups").select("*").in("code", codes).order("created_at");
    if (error) return note(error) || [];
    const { data: ms } = await sb.from("group_members").select("*").in("group_code", codes).order("joined_at");
    return (data || []).map((g) => toGroup(g, (ms || []).filter((m) => m.group_code === g.code)));
  },

  async createGroup(code, name, member) {
    const { error } = await sb.from("groups").insert({ code, name, owner_id: member.userId });
    if (error) return note(error), false;
    return db.addMember(code, member);
  },

  async addMember(code, m) {
    const { error } = await sb.from("group_members").upsert({
      group_code: code, user_id: m.userId, nickname: m.nickname, color: m.color,
    });
    if (error) return note(error), false;
    return true;
  },

  /* 멤버 제거·나가기 공용. 결과: 'removed' | 'group_deleted' | null(실패) */
  async removeMember(code, targetId, requesterId) {
    const { data, error } = await sb.rpc("remove_member", {
      p_code: code, p_target: targetId, p_requester: requesterId,
    });
    if (error) return note(error);
    return data;
  },

  async transferOwner(code, newOwnerId, requesterId) {
    const { error } = await sb.rpc("transfer_owner", {
      p_code: code, p_new_owner: newOwnerId, p_requester: requesterId,
    });
    if (error) return note(error), false;
    return true;
  },

  async renameGroup(code, name, requesterId) {
    const { error } = await sb.rpc("rename_group", {
      p_code: code, p_name: name, p_requester: requesterId,
    });
    if (error) return note(error), false;
    return true;
  },

  /* 일정 */
  async getEvents(code) {
    const { data, error } = await sb.from("events").select("*").eq("group_code", code);
    if (error) return note(error) || [];
    return (data || []).map(toEvent);
  },

  async insertEvent(code, ev) {
    const { error } = await sb.from("events").insert(fromEvent(ev, code));
    if (error) return note(error), false;
    return true;
  },

  async updateEvent(code, id, ev) {
    const row = fromEvent(ev, code);
    delete row.id;
    delete row.group_code;
    row.updated_at = new Date().toISOString();
    const { error } = await sb.from("events").update(row).eq("id", id);
    if (error) return note(error), false;
    return true;
  },

  async deleteEvent(id) {
    const { error } = await sb.from("events").delete().eq("id", id);
    if (error) return note(error), false;
    return true;
  },
};

/* ---------- 공유 ---------- */
const inviteUrl = (code) => {
  const u = new URL(window.location.href);
  u.search = "";
  u.hash = "";
  u.searchParams.set("join", code);
  return u.toString();
};

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    /* 구형 브라우저 대비 */
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch (e2) {
      return false;
    }
  }
}

/* 휴대폰 기본 공유창(카카오톡 등). 지원하지 않으면 링크 복사로 대체. */
async function shareInvite(group) {
  const url = inviteUrl(group.code);
  const text = `dayshare에서 '${group.name}' 그룹에 초대합니다.\n그룹 코드: ${group.code}`;
  if (navigator.share) {
    try {
      await navigator.share({ title: "dayshare 초대", text, url });
      return "shared";
    } catch (e) {
      if (e && e.name === "AbortError") return "cancelled";
    }
  }
  return (await copyText(`${text}\n${url}`)) ? "copied" : "failed";
}

/* ---------- 공용 UI ---------- */
function Btn({ children, onClick, variant = "solid", disabled, style, type }) {
  const base = {
    font: "inherit",
    fontSize: 15,
    fontWeight: 700,
    padding: "14px 18px",
    borderRadius: 12,
    cursor: disabled ? "not-allowed" : "pointer",
    width: "100%",
    opacity: disabled ? 0.4 : 1,
  };
  const v =
    variant === "solid"
      ? { background: T.ink, color: "#fff", border: "1px solid " + T.ink }
      : variant === "ghost"
      ? { background: "#fff", color: T.ink, border: "1px solid " + T.rule }
      : { background: "#fff", color: T.sun, border: "1px solid " + T.rule };
  return (
    <button type={type || "button"} onClick={onClick} disabled={disabled} style={{ ...base, ...v, ...style }}>
      {children}
    </button>
  );
}

function Field({ label, children, hint }) {
  return (
    <label style={{ display: "block", marginBottom: 18 }}>
      <span style={{ display: "block", fontSize: 13, fontWeight: 700, color: T.inkSoft, marginBottom: 7 }}>
        {label}
      </span>
      {children}
      {hint && <span style={{ display: "block", fontSize: 12, color: T.inkFaint, marginTop: 6 }}>{hint}</span>}
    </label>
  );
}

const inputStyle = {
  font: "inherit",
  fontSize: 15,
  color: T.ink,
  width: "100%",
  boxSizing: "border-box",
  padding: "12px 13px",
  border: "1px solid " + T.rule,
  borderRadius: 10,
  background: "#fff",
  outline: "none",
};

function Segment({ options, value, onChange }) {
  return (
    <div style={{ display: "flex", gap: 6 }}>
      {options.map((o) => {
        const on = value === o.k;
        return (
          <button
            key={o.k}
            type="button"
            onClick={() => onChange(o.k)}
            style={{
              font: "inherit",
              flex: 1,
              fontSize: 14,
              fontWeight: on ? 700 : 500,
              padding: "11px 6px",
              borderRadius: 10,
              cursor: "pointer",
              border: "1px solid " + (on ? T.ink : T.rule),
              background: on ? T.ink : "#fff",
              color: on ? "#fff" : T.inkSoft,
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function Sheet({ open, onClose, title, children, footer, headerActions }) {
  if (!open) return null;
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,.36)",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        zIndex: 70,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="tc-sheet"
        style={{
          width: "100%",
          maxWidth: 460,
          maxHeight: "88%",
          overflowY: "auto",
          background: "#fff",
          borderRadius: "18px 18px 0 0",
        }}
      >
        <div
          style={{
            position: "sticky",
            top: 0,
            background: "#fff",
            padding: "16px 20px 12px",
            borderBottom: "1px solid " + T.ruleSoft,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <strong style={{ fontSize: 17 }}>{title}</strong>
          {headerActions ? (
            <div style={{ display: "flex", gap: 6, flex: "none" }}>{headerActions}</div>
          ) : (
            <button
              type="button"
              onClick={onClose}
              aria-label="닫기"
              style={{ font: "inherit", fontSize: 21, lineHeight: 1, color: T.inkSoft, background: "none", border: "none", cursor: "pointer", padding: 4 }}
            >
              ×
            </button>
          )}
        </div>
        <div style={{ padding: "18px 20px 20px" }}>{children}</div>
        {footer && <div style={{ padding: "0 20px 24px", display: "flex", gap: 8 }}>{footer}</div>}
      </div>
    </div>
  );
}

function HdrBtn({ children, onClick, primary }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        font: "inherit",
        fontSize: 13.5,
        fontWeight: primary ? 800 : 600,
        padding: "7px 14px",
        borderRadius: 999,
        cursor: "pointer",
        border: "1px solid " + (primary ? T.ink : T.rule),
        background: primary ? T.ink : "#fff",
        color: primary ? "#fff" : T.inkSoft,
      }}
    >
      {children}
    </button>
  );
}

function Dot({ color, size = 9, square }) {
  return (
    <span
      style={{
        display: "inline-block",
        width: size,
        height: size,
        borderRadius: square ? 2 : "50%",
        background: color,
        flex: "none",
      }}
    />
  );
}

function FilterChip({ children, sel, onClick, sm }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={!!sel}
      style={{
        font: "inherit",
        display: "inline-flex",
        alignItems: "center",
        gap: sm ? 5 : 6,
        fontSize: sm ? 11.5 : 12.5,
        fontWeight: sel ? 700 : 500,
        padding: sm ? "5px 10px" : "6px 11px",
        borderRadius: 999,
        cursor: "pointer",
        border: "1px solid " + (sel ? T.ink : T.rule),
        background: sel ? T.ink : "#fff",
        color: sel ? "#fff" : T.ink,
      }}
    >
      {children}
    </button>
  );
}

/* ============================================================
   일정 칩 스타일
   - 색(hue)   = 누구의 일정인가 (멤버 / 공동)
   - 채움 여부 = 카테고리 (직장/업무 = 채움, 일상 = 파스텔)
   ============================================================ */
function chipStyle(color, category) {
  if (category === "work") {
    return { background: color, color: "#fff", fontWeight: 700 };
  }
  return { background: color + "24", color: color, fontWeight: 700 };
}

/* ============================================================
   주 단위 레인 배치 (공휴일 + 기간 일정)
   ============================================================ */
const LANE_CAP = 3;
const LANE_H = 18;
const LANE_GAP = 2;
const NUM_H = 24;
const WEEK_H = NUM_H + LANE_CAP * (LANE_H + LANE_GAP) + 4;

function packWeek(week, events) {
  const wStart = week[0];
  const wEnd = week[6];
  const items = [];

  week.forEach((d) => {
    const h = getHoliday(d);
    if (h) items.push({ kind: "holiday", key: "h" + d, start: d, end: d, name: h.name });
  });
  events.forEach((ev) => {
    if (ev.end < wStart || ev.start > wEnd) return;
    items.push({ kind: "event", key: ev.id, start: ev.start, end: ev.end, ev });
  });

  const segs = items.map((it) => {
    const s = it.start < wStart ? wStart : it.start;
    const e = it.end > wEnd ? wEnd : it.end;
    const col = week.indexOf(s);
    return {
      ...it,
      col,
      span: week.indexOf(e) - col + 1,
      contL: it.start < wStart,
      contR: it.end > wEnd,
    };
  });

  segs.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "holiday" ? -1 : 1;
    if (a.col !== b.col) return a.col - b.col;
    if (a.span !== b.span) return b.span - a.span;
    if (a.kind === "event" && b.kind === "event") {
      return PERIOD_ORDER[a.ev.period] - PERIOD_ORDER[b.ev.period];
    }
    return 0;
  });

  const lanes = [];
  const overflow = Array(7).fill(0);
  const placed = [];
  for (const seg of segs) {
    let lane = -1;
    for (let l = 0; l < lanes.length; l++) {
      const fits = lanes[l].every((o) => seg.col + seg.span <= o.col || o.col + o.span <= seg.col);
      if (fits) {
        lane = l;
        break;
      }
    }
    if (lane === -1 && lanes.length < LANE_CAP) {
      lanes.push([]);
      lane = lanes.length - 1;
    }
    if (lane === -1) {
      for (let i = seg.col; i < seg.col + seg.span; i++) overflow[i] += 1;
      continue;
    }
    seg.lane = lane;
    lanes[lane].push(seg);
    placed.push(seg);
  }
  return { segs: placed, overflow, laneCount: lanes.length };
}

/* ============================================================
   온보딩
   ============================================================ */
function ColorPicker({ value, onChange }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
      {PALETTE.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          aria-label={c}
          style={{
            width: 40,
            height: 40,
            borderRadius: "50%",
            background: c,
            cursor: "pointer",
            border: value === c ? "3px solid " + T.ink : "3px solid transparent",
            boxShadow: value === c ? "inset 0 0 0 2px #fff" : "none",
          }}
        />
      ))}
    </div>
  );
}

/* 처음 시작 / 다른 기기에서 쓰던 계정으로 들어가기 */
function Onboarding({ onCreate, onRestore, invitedTo }) {
  const [mode, setMode] = useState("new");
  const [name, setName] = useState("");
  const [color, setColor] = useState(PALETTE[0]);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = async () => {
    setErr("");
    setBusy(true);
    try {
      const r = mode === "new" ? await onCreate(name.trim(), color) : await onRestore(code);
      if (r !== true) setErr(r);
    } finally {
      setBusy(false);
    }
  };

  const tab = (k, label) => (
    <button
      type="button"
      onClick={() => { setMode(k); setErr(""); }}
      style={{
        font: "inherit", flex: 1, padding: "11px 0", fontSize: 14, cursor: "pointer",
        fontWeight: mode === k ? 800 : 500, background: "none", border: "none",
        color: mode === k ? T.ink : T.inkFaint,
        borderBottom: "2px solid " + (mode === k ? T.ink : T.ruleSoft),
      }}
    >
      {label}
    </button>
  );

  return (
    <div style={{ padding: "48px 24px" }}>
      <div style={{ fontSize: 32, fontWeight: 800, lineHeight: 1.2, marginBottom: 4, letterSpacing: "-.03em" }}>
        dayshare
      </div>
      <div style={{ fontSize: 15, fontWeight: 700, color: T.inkSoft, marginBottom: 12 }}>함께 보는 달력</div>
      <p style={{ fontSize: 15, color: T.inkSoft, lineHeight: 1.65, margin: "0 0 26px" }}>
        {invitedTo ? (
          <>
            <strong style={{ color: T.ink }}>{invitedTo}</strong> 그룹에 초대받았어요.
            <br />
            먼저 내 정보를 정해 주세요.
          </>
        ) : (
          <>가족, 친구, 연인의 일정을 한 화면에서 봅니다.</>
        )}
      </p>

      <div style={{ display: "flex", marginBottom: 24 }}>
        {tab("new", "처음이에요")}
        {tab("restore", "쓰던 계정이 있어요")}
      </div>

      {mode === "new" ? (
        <>
          <Field label="이름">
            <input style={inputStyle} value={name} maxLength={10} placeholder="효경" onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="내 색상" hint="달력에서 내 일정을 구분하는 색입니다.">
            <ColorPicker value={color} onChange={setColor} />
          </Field>
        </>
      ) : (
        <Field label="복구 코드" hint="다른 기기에서 받은 8자리 코드를 입력하세요. 하이픈은 빼도 됩니다.">
          <input
            style={{ ...inputStyle, letterSpacing: ".16em", fontWeight: 700, fontSize: 17 }}
            value={code}
            maxLength={9}
            placeholder="ABCD-2345"
            autoCapitalize="characters"
            onChange={(e) => setCode(e.target.value.toUpperCase())}
          />
        </Field>
      )}

      {err && <div style={{ fontSize: 13, color: T.sun, margin: "-6px 0 14px" }}>{err}</div>}

      <Btn
        disabled={busy || (mode === "new" ? !name.trim() : normRecovery(code).length !== 8)}
        onClick={submit}
        style={{ marginTop: 6 }}
      >
        {busy ? "처리 중…" : mode === "new" ? "시작하기" : "계정 불러오기"}
      </Btn>
    </div>
  );
}

/* 계정을 처음 만든 직후, 복구 코드를 보여주고 저장을 권한다 */
function RecoveryIntro({ code, onDone }) {
  const [copied, setCopied] = useState(false);
  return (
    <div style={{ padding: "56px 24px" }}>
      <div style={{ fontSize: 24, fontWeight: 800, lineHeight: 1.35, marginBottom: 12, letterSpacing: "-.02em" }}>
        복구 코드를 저장해 주세요
      </div>
      <p style={{ fontSize: 15, color: T.inkSoft, lineHeight: 1.7, margin: "0 0 28px" }}>
        다른 휴대폰이나 브라우저에서 이 계정으로 들어갈 때 필요해요.
        <br />
        <strong style={{ color: T.ink }}>잃어버리면 되찾을 방법이 없습니다.</strong>
      </p>
      <RecoveryCard code={code} copied={copied} onCopy={async () => {
        if (await copyText(fmtRecovery(code))) { setCopied(true); setTimeout(() => setCopied(false), 1600); }
      }} />
      <p style={{ fontSize: 13, color: T.inkFaint, lineHeight: 1.6, margin: "14px 0 30px" }}>
        메모 앱이나 나에게 보내는 카톡에 붙여넣어 두세요. 나중에 내 정보에서 다시 볼 수 있어요.
      </p>
      <Btn onClick={onDone}>저장했어요</Btn>
    </div>
  );
}

function RecoveryCard({ code, copied, onCopy }) {
  return (
    <div style={{ border: "1px solid " + T.rule, borderRadius: 12, padding: "16px 16px" }}>
      <div style={{ fontSize: 12.5, color: T.inkSoft, marginBottom: 8 }}>내 복구 코드</div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <strong style={{ fontSize: 24, letterSpacing: ".14em" }}>{fmtRecovery(code)}</strong>
        <button
          type="button"
          onClick={onCopy}
          style={{ font: "inherit", fontSize: 13, fontWeight: 700, padding: "8px 14px", borderRadius: 9, border: "1px solid " + T.rule, background: "#fff", cursor: "pointer", color: T.ink, flex: "none" }}
        >
          {copied ? "복사됨" : "복사"}
        </button>
      </div>
    </div>
  );
}

/* 확인 시트 (되돌릴 수 없는 동작 전) */
function ConfirmSheet({ req, onClose }) {
  const [busy, setBusy] = useState(false);
  if (!req) return null;
  return (
    <Sheet
      open={!!req}
      onClose={onClose}
      title={req.title}
      footer={
        <>
          <Btn variant="ghost" onClick={onClose} style={{ flex: "0 0 96px" }}>취소</Btn>
          <Btn
            variant={req.danger ? "danger" : "solid"}
            disabled={busy}
            onClick={async () => { setBusy(true); try { await req.onConfirm(); } finally { setBusy(false); onClose(); } }}
          >
            {busy ? "처리 중…" : req.confirmLabel}
          </Btn>
        </>
      }
    >
      <div style={{ fontSize: 15, lineHeight: 1.7, color: T.ink, whiteSpace: "pre-line" }}>{req.message}</div>
    </Sheet>
  );
}

/* ============================================================
   그룹이 없을 때 (첫 진입)
   ============================================================ */
function Welcome({ me, groups, onOpen, onCreate, onJoin, onEditMe, loading, storageOff }) {
  const [mode, setMode] = useState(null);
  const [gname, setGname] = useState("");
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const close = () => { setMode(null); setGname(""); setCode(""); setErr(""); };
  const submit = async () => {
    setErr(""); setBusy(true);
    try {
      if (mode === "create") {
        if (!gname.trim()) return setErr("그룹 이름을 입력하세요.");
        await onCreate(gname.trim());
        close();
      } else {
        const c = code.trim().toUpperCase();
        if (!c) return setErr("그룹 코드를 입력하세요.");
        const r = await onJoin(c);
        if (r !== true) return setErr(r);
        close();
      }
    } finally { setBusy(false); }
  };

  return (
    <div style={{ padding: "26px 20px 60px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-.02em" }}>내 그룹</div>
        <button
          type="button"
          onClick={onEditMe}
          style={{ font: "inherit", display: "flex", alignItems: "center", gap: 7, fontSize: 14, color: T.inkSoft, background: "none", border: "none", cursor: "pointer", padding: 0 }}
        >
          <Dot color={me.color} />
          {me.nickname}
        </button>
      </div>

      {storageOff && (
        <div style={{ border: "1px solid " + T.rule, background: "#FFF9E8", borderRadius: 12, padding: "12px 14px", marginBottom: 20, fontSize: 12.5, lineHeight: 1.65, color: T.inkSoft }}>
          <strong style={{ color: T.ink, display: "block", marginBottom: 3 }}>서버에 연결하지 못했습니다</strong>
          네트워크를 확인하고 새로고침해 주세요. 연결되기 전에는 일정이 저장되지 않습니다.
        </div>
      )}

      {loading ? (
        <div style={{ color: T.inkFaint, fontSize: 14, padding: "40px 0", textAlign: "center" }}>불러오는 중…</div>
      ) : groups.length === 0 ? (
        <div style={{ border: "1px dashed " + T.rule, borderRadius: 14, padding: "44px 22px", textAlign: "center", marginBottom: 22 }}>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>아직 그룹이 없습니다</div>
          <div style={{ fontSize: 14, color: T.inkSoft, lineHeight: 1.65 }}>
            그룹을 만들어 코드를 공유하거나,<br />받은 코드로 참여하세요.
          </div>
        </div>
      ) : (
        <div style={{ marginBottom: 22 }}>
          {groups.map((g) => (
            <button
              key={g.code}
              type="button"
              onClick={() => onOpen(g.code)}
              style={{ font: "inherit", width: "100%", textAlign: "left", display: "block", padding: "16px 4px", background: "none", border: "none", borderBottom: "1px solid " + T.ruleSoft, cursor: "pointer" }}
            >
              <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 6 }}>{g.name}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: 12, color: T.inkFaint, letterSpacing: ".06em" }}>{g.code}</span>
                <span style={{ display: "flex", gap: 4 }}>
                  {(g.members || []).slice(0, 6).map((m) => <Dot key={m.userId} color={m.color} size={7} />)}
                </span>
                <span style={{ fontSize: 12, color: T.inkFaint }}>{(g.members || []).length}명</span>
              </div>
            </button>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: 8 }}>
        <Btn onClick={() => setMode("create")}>그룹 만들기</Btn>
        <Btn variant="ghost" onClick={() => setMode("join")}>코드로 참여</Btn>
      </div>

      <Sheet
        open={!!mode}
        onClose={close}
        title={mode === "create" ? "그룹 만들기" : "코드로 참여"}
        footer={<Btn onClick={submit} disabled={busy}>{busy ? "처리 중…" : mode === "create" ? "만들기" : "참여하기"}</Btn>}
      >
        {mode === "create" ? (
          <Field label="그룹 이름" hint="만들고 나면 참여용 코드가 자동으로 생성됩니다.">
            <input style={inputStyle} value={gname} maxLength={20} placeholder="우리 가족" onChange={(e) => setGname(e.target.value)} />
          </Field>
        ) : (
          <Field label="그룹 코드" hint="그룹을 만든 사람에게 받은 6자리 코드를 입력하세요.">
            <input style={{ ...inputStyle, letterSpacing: ".18em", fontWeight: 700 }} value={code} maxLength={6} placeholder="ABC123" onChange={(e) => setCode(e.target.value.toUpperCase())} />
          </Field>
        )}
        {err && <div style={{ fontSize: 13, color: T.sun, marginTop: -8 }}>{err}</div>}
      </Sheet>
    </div>
  );
}

/* ============================================================
   월 선택
   ============================================================ */
function MonthPicker({ open, onClose, cursor, onPick, onToday }) {
  const [y, setY] = useState(cursor.y);
  useEffect(() => { if (open) setY(cursor.y); }, [open, cursor.y]);
  return (
    <Sheet open={open} onClose={onClose} title="월 선택" footer={<Btn variant="ghost" onClick={onToday}>오늘로 이동</Btn>}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 22, marginBottom: 18 }}>
        <RoundBtn onClick={() => setY(y - 1)} label="이전 해">‹</RoundBtn>
        <strong style={{ fontSize: 20 }}>{y}년</strong>
        <RoundBtn onClick={() => setY(y + 1)} label="다음 해">›</RoundBtn>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8 }}>
        {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
          const on = y === cursor.y && m === cursor.m;
          return (
            <button
              key={m}
              type="button"
              onClick={() => onPick(y, m)}
              style={{
                font: "inherit", fontSize: 14, fontWeight: on ? 800 : 500,
                padding: "14px 0", borderRadius: 10, cursor: "pointer",
                border: "1px solid " + (on ? T.ink : T.rule),
                background: on ? T.ink : "#fff", color: on ? "#fff" : T.ink,
              }}
            >
              {m}월
            </button>
          );
        })}
      </div>
    </Sheet>
  );
}

function RoundBtn({ children, onClick, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      style={{ font: "inherit", width: 34, height: 34, fontSize: 18, borderRadius: "50%", border: "1px solid " + T.rule, background: "#fff", color: T.ink, cursor: "pointer" }}
    >
      {children}
    </button>
  );
}

/* ============================================================
   월간 캘린더
   ============================================================ */
function CalendarView({
  groups, group, onSwitchGroup,
  cursor, setCursor, sel, setSel,
  events, colorOf,
  selMembers, selCats, selPeriods, toggleMember, toggleCat, togglePeriod, anyFilter, clearFilters,
  onOpenDay, onPickEvent, onOpenMonth,
}) {
  const today = todayStr();
  const [panelOpen, setPanelOpen] = useState(true);
  const members = group.members || [];
  const weeks = useMemo(() => monthGrid(cursor.y, cursor.m), [cursor]);

  const [dir, setDir] = useState(0);
  const move = (n) => {
    setDir(n);
    setCursor((c) => {
      let m = c.m + n, y = c.y;
      if (m > 12) { m = 1; y += 1; }
      if (m < 1) { m = 12; y -= 1; }
      return { y, m };
    });
  };

  /* 좌우 스와이프로 월 이동 */
  const touch = useRef({ x: 0, y: 0, t: 0 });
  const onTouchStart = (e) => {
    const p = e.touches[0];
    touch.current = { x: p.clientX, y: p.clientY, t: Date.now() };
  };
  const onTouchEnd = (e) => {
    const p = e.changedTouches[0];
    const dx = p.clientX - touch.current.x;
    const dy = p.clientY - touch.current.y;
    const dt = Date.now() - touch.current.t;
    if (dt < 700 && Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.4) {
      move(dx < 0 ? 1 : -1);
    }
  };

  return (
    <div>
      {/* 헤더 */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 16px 10px" }}>
        <button
          type="button"
          onClick={onOpenMonth}
          style={{ font: "inherit", display: "inline-flex", alignItems: "center", gap: 7, background: "none", border: "none", cursor: "pointer", padding: 0, color: T.ink }}
        >
          <span style={{ fontSize: 23, fontWeight: 800, letterSpacing: "-.02em" }}>
            {cursor.y}년 {cursor.m}월
          </span>
          <span style={{ fontSize: 11, color: T.inkSoft }}>▼</span>
        </button>
        <div style={{ display: "flex", gap: 6 }}>
          <RoundBtn onClick={() => move(-1)} label="이전 달">‹</RoundBtn>
          <RoundBtn onClick={() => move(1)} label="다음 달">›</RoundBtn>
        </div>
      </div>

      {/* 그룹 전환 + 필터 */}
      <div style={{ padding: "0 14px 10px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <div style={{ display: "flex", gap: 7, overflowX: "auto", flex: 1, paddingBottom: 2 }} className="tc-noscroll">
            {groups.map((g) => {
              const on = g.code === group.code;
              return (
                <button
                  key={g.code}
                  type="button"
                  onClick={() => onSwitchGroup(g.code)}
                  style={{
                    font: "inherit", display: "inline-flex", alignItems: "center", gap: 7,
                    padding: "5px 13px 5px 5px", borderRadius: 999, cursor: "pointer", flex: "none",
                    border: "1px solid " + (on ? T.ink : T.ruleSoft),
                    background: on ? "#fff" : T.ruleSoft,
                    fontSize: 13.5, fontWeight: 700, color: T.ink,
                  }}
                >
                  <span
                    style={{
                      width: 22, height: 22, borderRadius: 7, flex: "none",
                      display: "inline-flex", alignItems: "center", justifyContent: "center",
                      background: on ? T.ink : "#fff", color: on ? "#fff" : T.inkFaint, fontSize: 12,
                    }}
                  >
                    ✓
                  </span>
                  {g.name}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => setPanelOpen((v) => !v)}
            aria-label={panelOpen ? "필터 접기" : "필터 펼치기"}
            style={{ font: "inherit", fontSize: 15, color: T.inkSoft, background: "none", border: "none", cursor: "pointer", padding: "4px 2px", flex: "none" }}
          >
            {panelOpen ? "⌃" : "⌄"}
          </button>
        </div>

        {panelOpen && (
          <>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 10 }}>
              {members.map((m) => (
                <FilterChip key={m.userId} sel={selMembers.has(m.userId)} onClick={() => toggleMember(m.userId)}>
                  <Dot color={m.color} size={8} />
                  {m.nickname}
                </FilterChip>
              ))}
              <FilterChip sel={selMembers.has("__SHARED__")} onClick={() => toggleMember("__SHARED__")}>
                <Dot color={T.shared} size={8} square />
                공동
              </FilterChip>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 5, marginTop: 6 }}>
              {CATS.map((c) => (
                <FilterChip key={c.k} sm sel={selCats.has(c.k)} onClick={() => toggleCat(c.k)}>{c.label}</FilterChip>
              ))}
              <span style={{ width: 1, height: 14, background: T.rule, margin: "0 3px" }} />
              {PERIODS.map((p) => (
                <FilterChip key={p.k} sm sel={selPeriods.has(p.k)} onClick={() => togglePeriod(p.k)}>{p.label}</FilterChip>
              ))}
              {anyFilter && (
                <button
                  type="button"
                  onClick={clearFilters}
                  style={{ font: "inherit", fontSize: 11.5, color: T.inkSoft, background: "none", border: "none", cursor: "pointer", padding: "5px 4px", textDecoration: "underline", textUnderlineOffset: 3 }}
                >
                  전체 보기
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {/* 요일 */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", padding: "6px 0 4px" }}>
        {WEEKDAYS.map((w, i) => (
          <div
            key={w}
            style={{ textAlign: "center", fontSize: 12, fontWeight: 600, color: i === 0 ? T.sun : i === 6 ? T.sat : T.inkSoft }}
          >
            {w}
          </div>
        ))}
      </div>

      {/* 그리드 — 세로 격자선 없음, 주 높이 고정 */}
      <div
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        style={{ borderTop: "1px solid " + T.ruleSoft, touchAction: "pan-y" }}
      >
        <div key={`${cursor.y}-${cursor.m}`} className={dir > 0 ? "tc-next" : dir < 0 ? "tc-prev" : ""}>
        {weeks.map((week, wi) => {
          const { segs, overflow } = packWeek(week, events);
          return (
            <div
              key={wi}
              style={{ position: "relative", height: WEEK_H, borderBottom: "1px solid " + T.ruleSoft }}
            >
              {/* 선택 날짜 세로 띠 */}
              {week.indexOf(sel) >= 0 && (
                <div
                  style={{
                    position: "absolute",
                    left: `${(week.indexOf(sel) / 7) * 100}%`,
                    width: `${100 / 7}%`,
                    top: 0,
                    bottom: 0,
                    background: T.band,
                  }}
                />
              )}

              {/* 날짜 셀 (탭 영역) */}
              <div style={{ position: "absolute", inset: 0, display: "grid", gridTemplateColumns: "repeat(7,1fr)" }}>
                {week.map((d) => {
                  const inMonth = parseYmd(d).m === cursor.m;
                  const wd = dow(d);
                  const isToday = d === today;
                  const hol = getHoliday(d);
                  let numColor = T.ink;
                  if (hol || wd === 0) numColor = T.sun;
                  else if (wd === 6) numColor = T.sat;
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() => { setSel(d); onOpenDay(d); }}
                      style={{
                        font: "inherit", background: "transparent", border: "none", cursor: "pointer",
                        padding: 0, display: "flex", flexDirection: "column", alignItems: "center",
                        opacity: inMonth ? 1 : 0.32,
                      }}
                    >
                      <span
                        style={{
                          marginTop: 4,
                          display: "inline-flex", alignItems: "center", justifyContent: "center",
                          minWidth: 19, height: 19, fontSize: 12.5,
                          fontWeight: isToday ? 800 : 500,
                          color: isToday ? "#fff" : numColor,
                          background: isToday ? T.ink : "transparent",
                          borderRadius: "50%",
                        }}
                      >
                        {parseYmd(d).d}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* 막대 */}
              {segs.map((seg) => {
                const isHol = seg.kind === "holiday";
                const st = isHol
                  ? { background: T.holiday, color: "#fff", fontWeight: 700 }
                  : chipStyle(colorOf(seg.ev), seg.ev.category);
                return (
                  <div
                    key={seg.key}
                    onClick={(e) => { e.stopPropagation(); if (!isHol) onPickEvent(seg.ev); else { setSel(seg.start); onOpenDay(seg.start); } }}
                    title={isHol ? seg.name : seg.ev.title}
                    style={{
                      position: "absolute",
                      left: `calc(${(seg.col / 7) * 100}% + 2px)`,
                      width: `calc(${(seg.span / 7) * 100}% - 4px)`,
                      top: NUM_H + seg.lane * (LANE_H + LANE_GAP),
                      height: LANE_H,
                      lineHeight: `${LANE_H}px`,
                      fontSize: 10.5,
                      textAlign: "center",
                      padding: "0 3px",
                      borderRadius: 5,
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      ...st,
                    }}
                  >
                    {isHol ? seg.name : seg.ev.title}
                  </div>
                );
              })}

              {/* 넘침 */}
              {overflow.map((n, i) =>
                n > 0 ? (
                  <div
                    key={"of" + i}
                    style={{
                      position: "absolute",
                      left: `${(i / 7) * 100}%`,
                      width: `${100 / 7}%`,
                      top: NUM_H + LANE_CAP * (LANE_H + LANE_GAP),
                      fontSize: 10,
                      textAlign: "center",
                      color: T.inkFaint,
                      pointerEvents: "none",
                    }}
                  >
                    +{n}
                  </div>
                ) : null
              )}
            </div>
          );
        })}
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   목록 탭
   ============================================================ */
function AgendaView({ cursor, events, colorOf, members, onPickEvent }) {
  const list = useMemo(() => {
    const first = ymd(cursor.y, cursor.m, 1);
    const lastDay = new Date(cursor.y, cursor.m, 0).getDate();
    const last = ymd(cursor.y, cursor.m, lastDay);
    const byDate = {};
    for (let d = first; d <= last; d = addDays(d, 1)) {
      const day = events
        .filter((ev) => ev.start <= d && d <= ev.end)
        .sort((a, b) => PERIOD_ORDER[a.period] - PERIOD_ORDER[b.period]);
      if (day.length || getHoliday(d)) byDate[d] = day;
    }
    return Object.entries(byDate);
  }, [cursor, events]);

  return (
    <div style={{ padding: "18px 16px 40px" }}>
      <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 16, letterSpacing: "-.02em" }}>
        {cursor.y}년 {cursor.m}월 일정
      </div>
      {list.length === 0 ? (
        <div style={{ color: T.inkFaint, fontSize: 14, padding: "48px 0", textAlign: "center" }}>
          이 달에 등록된 일정이 없습니다.
        </div>
      ) : (
        list.map(([d, evs]) => (
          <div key={d} style={{ marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8 }}>
              <strong style={{ fontSize: 14.5, color: getHoliday(d) || dow(d) === 0 ? T.sun : dow(d) === 6 ? T.sat : T.ink }}>
                {fmtShort(d)}
              </strong>
              {getHoliday(d) && <span style={{ fontSize: 12, color: T.sun }}>{getHoliday(d).name}</span>}
            </div>
            {evs.map((ev) => (
              <EventRow key={ev.id} ev={ev} color={colorOf(ev)} members={members} onClick={() => onPickEvent(ev)} />
            ))}
          </div>
        ))
      )}
    </div>
  );
}

function EventRow({ ev, color, members, onClick }) {
  const author =
    ev.type === "shared" ? "전체" : (members.find((m) => m.userId === ev.userId) || {}).nickname || ev.authorName;
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        font: "inherit", display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left",
        padding: "12px 12px", marginBottom: 6, borderRadius: 10, border: "none", cursor: "pointer",
        ...chipStyle(color, ev.category),
      }}
    >
      <span style={{ fontSize: 12, opacity: 0.8, minWidth: 30, flex: "none" }}>{periodLabel(ev.period)}</span>
      <span style={{ flex: 1, fontSize: 14.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {ev.title}
      </span>
      <span style={{ fontSize: 12, opacity: 0.75, flex: "none" }}>{author}</span>
    </button>
  );
}

/* ============================================================
   날짜 상세 화면 (TimeTree처럼 별도 화면)
   ============================================================ */
function DayScreen({ date, events, colorOf, members, onClose, onAdd, onPickEvent }) {
  const hol = getHoliday(date);
  const list = events
    .filter((ev) => ev.start <= date && date <= ev.end)
    .sort((a, b) => {
      const p = PERIOD_ORDER[a.period] - PERIOD_ORDER[b.period];
      return p !== 0 ? p : a.createdAt < b.createdAt ? -1 : 1;
    });
  const wd = dow(date);

  return (
    <div style={{ position: "fixed", inset: 0, background: "#fff", zIndex: 50, display: "flex", justifyContent: "center" }}>
      <div style={{ width: "100%", maxWidth: 460, display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 16px", borderBottom: "1px solid " + T.ruleSoft }}>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            style={{ font: "inherit", fontSize: 18, color: T.ink, background: "none", border: "none", cursor: "pointer", padding: "2px 6px 2px 0" }}
          >
            ‹
          </button>
          <strong style={{ fontSize: 17, color: hol || wd === 0 ? T.sun : wd === 6 ? T.sat : T.ink }}>
            {fmtShort(date)}
          </strong>
          {hol && (
            <span style={{ fontSize: 11.5, fontWeight: 700, color: "#fff", background: T.holiday, padding: "3px 8px", borderRadius: 999 }}>
              {hol.name}
            </span>
          )}
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "16px 16px 100px" }}>
          {list.length === 0 ? (
            <div style={{ color: T.inkFaint, fontSize: 14, padding: "56px 0", textAlign: "center" }}>
              등록된 일정이 없습니다.
            </div>
          ) : (
            list.map((ev) => (
              <EventRow key={ev.id} ev={ev} color={colorOf(ev)} members={members} onClick={() => onPickEvent(ev)} />
            ))
          )}
        </div>

        <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: "12px 16px 20px", background: "#fff", borderTop: "1px solid " + T.ruleSoft }}>
          <Btn onClick={() => onAdd(date)}>＋ 일정 추가</Btn>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   그룹 탭
   ============================================================ */
function SmallBtn({ children, onClick, primary, danger }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        font: "inherit", fontSize: 12.5, fontWeight: 700, padding: "7px 11px", borderRadius: 8,
        cursor: "pointer", flex: "none",
        border: "1px solid " + (primary ? T.ink : T.rule),
        background: primary ? T.ink : "#fff",
        color: primary ? "#fff" : danger ? T.sun : T.ink,
      }}
    >
      {children}
    </button>
  );
}

function GroupView({
  me, group, groups, onSwitchGroup, onLeave, onEditMe, onCreate, onJoin, storageOff,
  onKick, onTransfer, onRename, say,
}) {
  const [mode, setMode] = useState(null);
  const [gname, setGname] = useState("");
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");

  const isOwner = group.ownerId === me.userId;
  const others = group.members.filter((m) => m.userId !== me.userId);

  const close = () => { setMode(null); setGname(""); setCode(""); setErr(""); };
  const submit = async () => {
    setErr("");
    if (mode === "create") {
      if (!gname.trim()) return setErr("그룹 이름을 입력하세요.");
      await onCreate(gname.trim()); close();
    } else if (mode === "rename") {
      if (!gname.trim()) return setErr("그룹 이름을 입력하세요.");
      const r = await onRename(gname.trim());
      if (r !== true) return setErr(r);
      close();
    } else {
      const c = code.trim().toUpperCase();
      if (!c) return setErr("그룹 코드를 입력하세요.");
      const r = await onJoin(c);
      if (r !== true) return setErr(r);
      close();
    }
  };
  const sheetTitle =
    mode === "create" ? "그룹 만들기" : mode === "rename" ? "그룹 이름 변경" : "코드로 참여";
  const sheetAction =
    mode === "create" ? "만들기" : mode === "rename" ? "변경" : "참여하기";

  const share = async () => {
    const r = await shareInvite(group);
    if (r === "copied") say("초대 문구와 링크를 복사했습니다.");
    else if (r === "failed") say("공유하지 못했습니다. 링크 복사를 이용해 주세요.");
  };
  const copyLink = async () => {
    say((await copyText(inviteUrl(group.code))) ? "초대 링크를 복사했습니다." : "복사하지 못했습니다.");
  };
  const copyCode = async () => {
    say((await copyText(group.code)) ? "그룹 코드를 복사했습니다." : "복사하지 못했습니다.");
  };

  let leaveLabel = "이 그룹 나가기";
  if (isOwner && others.length === 0) leaveLabel = "그룹 삭제";

  return (
    <div style={{ padding: "18px 16px 40px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-.02em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {group.name}
          </div>
          {isOwner && (
            <SmallBtn onClick={() => { setGname(group.name); setErr(""); setMode("rename"); }}>
              이름 변경
            </SmallBtn>
          )}
        </div>
        <button
          type="button"
          onClick={onEditMe}
          style={{ font: "inherit", display: "flex", alignItems: "center", gap: 7, fontSize: 13.5, color: T.inkSoft, background: "none", border: "none", cursor: "pointer", flex: "none" }}
        >
          <Dot color={me.color} />
          {me.nickname}
        </button>
      </div>

      {storageOff && (
        <div style={{ border: "1px solid " + T.rule, background: "#FFF9E8", borderRadius: 12, padding: "12px 14px", marginBottom: 18, fontSize: 12.5, lineHeight: 1.65, color: T.inkSoft }}>
          <strong style={{ color: T.ink, display: "block", marginBottom: 3 }}>서버에 연결하지 못했습니다</strong>
          네트워크를 확인하고 새로고침해 주세요.
        </div>
      )}

      {/* 초대 */}
      <div style={{ border: "1px solid " + T.rule, borderRadius: 12, padding: "14px 16px", marginBottom: 22 }}>
        <div style={{ fontSize: 12.5, color: T.inkSoft, marginBottom: 8 }}>그룹 코드</div>
        <strong style={{ display: "block", fontSize: 24, letterSpacing: ".16em", marginBottom: 12 }}>{group.code}</strong>
        <Btn onClick={share} style={{ padding: "12px 14px", fontSize: 14.5 }}>초대하기 (카카오톡 등)</Btn>
        <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
          <Btn variant="ghost" onClick={copyLink} style={{ padding: "10px 8px", fontSize: 13.5 }}>링크 복사</Btn>
          <Btn variant="ghost" onClick={copyCode} style={{ padding: "10px 8px", fontSize: 13.5 }}>코드 복사</Btn>
        </div>
        <div style={{ fontSize: 12, color: T.inkFaint, marginTop: 10, lineHeight: 1.6 }}>
          링크를 받은 사람은 열자마자 참여 화면으로 이동합니다. 믿을 수 있는 사람에게만 보내 주세요.
        </div>
      </div>

      {/* 멤버 */}
      <div style={{ fontSize: 13, fontWeight: 700, color: T.inkSoft, marginBottom: 4 }}>멤버 {group.members.length}명</div>
      {group.members.map((m) => {
        const mine = m.userId === me.userId;
        const owner = m.userId === group.ownerId;
        return (
          <div key={m.userId} style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 2px", borderBottom: "1px solid " + T.ruleSoft, minHeight: 50 }}>
            <Dot color={m.color} size={11} />
            <span style={{ fontSize: 15, flex: "0 1 auto", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.nickname}</span>
            {owner && (
              <span style={{ fontSize: 11, fontWeight: 800, color: "#fff", background: T.ink, padding: "2px 7px", borderRadius: 999, flex: "none" }}>
                그룹장
              </span>
            )}
            {mine && <span style={{ fontSize: 12, color: T.inkFaint, flex: "none" }}>나</span>}
            <span style={{ flex: 1 }} />
            {isOwner && !mine && (
              <>
                <SmallBtn onClick={() => onTransfer(m)}>그룹장 넘기기</SmallBtn>
                <SmallBtn danger onClick={() => onKick(m)}>내보내기</SmallBtn>
              </>
            )}
          </div>
        );
      })}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 2px", borderBottom: "1px solid " + T.ruleSoft }}>
        <Dot color={T.shared} size={11} square />
        <span style={{ fontSize: 15 }}>공동 일정</span>
      </div>

      {groups.length > 1 && (
        <>
          <div style={{ fontSize: 13, fontWeight: 700, color: T.inkSoft, margin: "24px 0 4px" }}>다른 그룹</div>
          {groups.filter((g) => g.code !== group.code).map((g) => (
            <button
              key={g.code}
              type="button"
              onClick={() => onSwitchGroup(g.code)}
              style={{ font: "inherit", width: "100%", textAlign: "left", padding: "13px 2px", background: "none", border: "none", borderBottom: "1px solid " + T.ruleSoft, cursor: "pointer", fontSize: 15 }}
            >
              {g.name}
              <span style={{ fontSize: 12, color: T.inkFaint, marginLeft: 8 }}>{g.code}</span>
            </button>
          ))}
        </>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 24 }}>
        <Btn variant="ghost" onClick={() => setMode("create")}>그룹 만들기</Btn>
        <Btn variant="ghost" onClick={() => setMode("join")}>코드로 참여</Btn>
      </div>
      <Btn variant="danger" onClick={onLeave} style={{ marginTop: 10 }}>{leaveLabel}</Btn>
      {isOwner && others.length > 0 && (
        <div style={{ fontSize: 12, color: T.inkFaint, marginTop: 8, lineHeight: 1.6, textAlign: "center" }}>
          그룹장은 다른 멤버에게 그룹장을 넘긴 뒤 나갈 수 있어요.
        </div>
      )}

      <Sheet
        open={!!mode}
        onClose={close}
        title={sheetTitle}
        footer={<Btn onClick={submit}>{sheetAction}</Btn>}
      >
        {mode === "create" || mode === "rename" ? (
          <Field
            label="그룹 이름"
            hint={mode === "rename" ? "모든 멤버에게 바뀐 이름이 보입니다." : undefined}
          >
            <input style={inputStyle} value={gname} maxLength={20} placeholder="우리 가족" onChange={(e) => setGname(e.target.value)} />
          </Field>
        ) : (
          <Field label="그룹 코드">
            <input style={{ ...inputStyle, letterSpacing: ".18em", fontWeight: 700 }} value={code} maxLength={6} placeholder="ABC123" onChange={(e) => setCode(e.target.value.toUpperCase())} />
          </Field>
        )}
        {err && <div style={{ fontSize: 13, color: T.sun, marginTop: -8 }}>{err}</div>}
      </Sheet>
    </div>
  );
}

/* ============================================================
   일정 입력 / 수정
   ============================================================ */
function EventForm({ open, onClose, onSave, onDelete, initial, defaultDate, canEdit, members, isOwner, meId }) {
  const [title, setTitle] = useState("");
  const [start, setStart] = useState(defaultDate);
  const [end, setEnd] = useState("");
  const [category, setCategory] = useState("life");
  const [period, setPeriod] = useState("am");
  const [type, setType] = useState("personal");
  const [forUserId, setForUserId] = useState(meId);
  const [location, setLocation] = useState("");
  const [memo, setMemo] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setTitle(initial.title);
      setStart(initial.start);
      setEnd(initial.end === initial.start ? "" : initial.end);
      setCategory(initial.category);
      setPeriod(initial.period);
      setType(initial.type);
      setForUserId(initial.userId);
      setLocation(initial.location || "");
      setMemo(initial.memo || "");
    } else {
      setTitle(""); setStart(defaultDate); setEnd("");
      setCategory("life"); setPeriod("am"); setType("personal");
      setForUserId(meId);
      setLocation(""); setMemo("");
    }
    setErr("");
  }, [open, initial, defaultDate, meId]);

  /* 그룹장은 다른 멤버의 개인 일정을 대신 등록할 수 있다.
     공동 일정에는 주인이 없으므로 표시하지 않는다. */
  const canPickPerson = isOwner && type === "personal" && (members || []).length > 1;

  const save = () => {
    if (!title.trim()) return setErr("일정 제목을 입력하세요.");
    if (!start) return setErr("시작 날짜를 선택하세요.");
    const e = end || start;
    if (e < start) return setErr("종료일이 시작일보다 빠릅니다.");
    onSave({
      title: title.trim(), start, end: e, category, period, type,
      forUserId: type === "shared" ? meId : forUserId,
      location: location.trim(), memo: memo.trim(),
    });
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={initial ? "일정 수정" : "일정 추가"}
      headerActions={
        <>
          <HdrBtn onClick={onClose}>취소</HdrBtn>
          <HdrBtn primary onClick={save}>{initial ? "저장" : "추가"}</HdrBtn>
        </>
      }
    >
      <Field label="일정 제목">
        <input style={inputStyle} value={title} maxLength={40} placeholder="가족 외식" onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <Field label="기간" hint="종료일을 비우면 하루 일정으로 등록됩니다.">
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input type="date" style={inputStyle} value={start} onChange={(e) => setStart(e.target.value)} />
          <span style={{ color: T.inkFaint }}>~</span>
          <input type="date" style={inputStyle} value={end} min={start} onChange={(e) => setEnd(e.target.value)} />
        </div>
      </Field>
      <Field label="카테고리">
        <Segment options={CATS} value={category} onChange={setCategory} />
      </Field>
      <Field label="시간대">
        <div style={{ display: "flex", gap: 5 }}>
          {PERIODS.map((p) => {
            const on = period === p.k;
            return (
              <button
                key={p.k}
                type="button"
                onClick={() => setPeriod(p.k)}
                style={{
                  font: "inherit", flex: 1, fontSize: 13, fontWeight: on ? 700 : 500,
                  padding: "11px 2px", borderRadius: 9, cursor: "pointer",
                  border: "1px solid " + (on ? T.ink : T.rule),
                  background: on ? T.ink : "#fff", color: on ? "#fff" : T.inkSoft,
                }}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      </Field>
      <Field label="일정 유형" hint="공동 일정은 그룹의 모든 멤버가 수정하거나 삭제할 수 있습니다.">
        <Segment
          options={[{ k: "personal", label: "개인 일정" }, { k: "shared", label: "공동 일정" }]}
          value={type}
          onChange={setType}
        />
      </Field>
      {canPickPerson && (
        <Field label="누구의 일정인가요?" hint="그룹장은 다른 멤버의 일정을 대신 등록할 수 있습니다.">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {members.map((m) => {
              const on = forUserId === m.userId;
              return (
                <button
                  key={m.userId}
                  type="button"
                  onClick={() => setForUserId(m.userId)}
                  style={{
                    font: "inherit", display: "inline-flex", alignItems: "center", gap: 6,
                    fontSize: 13, fontWeight: on ? 700 : 500,
                    padding: "8px 12px", borderRadius: 999, cursor: "pointer",
                    border: "1px solid " + (on ? T.ink : T.rule),
                    background: on ? T.ink : "#fff",
                    color: on ? "#fff" : T.ink,
                  }}
                >
                  <Dot color={m.color} size={8} />
                  {m.nickname}
                  {m.userId === meId && <span style={{ opacity: 0.6, fontSize: 11 }}>나</span>}
                </button>
              );
            })}
          </div>
        </Field>
      )}
      <Field label="장소">
        <input style={inputStyle} value={location} maxLength={40} placeholder="선택 입력" onChange={(e) => setLocation(e.target.value)} />
      </Field>
      <Field label="메모">
        <textarea style={{ ...inputStyle, minHeight: 68, resize: "vertical", lineHeight: 1.55 }} value={memo} maxLength={200} placeholder="선택 입력" onChange={(e) => setMemo(e.target.value)} />
      </Field>
      {err && <div style={{ fontSize: 13, color: T.sun, marginTop: -6 }}>{err}</div>}
      {initial && canEdit && (
        <Btn variant="danger" onClick={onDelete} style={{ marginTop: 6 }}>
          일정 삭제
        </Btn>
      )}
    </Sheet>
  );
}

/* ============================================================
   일정 상세
   ============================================================ */
function EventDetail({ open, onClose, ev, members, me, onEdit, onDelete }) {
  if (!ev) return null;
  const isShared = ev.type === "shared";
  const member = members.find((m) => m.userId === ev.userId);
  const color = isShared ? T.shared : member ? member.color : T.inkSoft;
  /* 내 일정이거나, 내가 대신 등록한 일정이면 고칠 수 있다 */
  const canEdit = isShared || ev.userId === me.userId || ev.createdBy === me.userId;
  const proxy = !isShared && ev.createdBy && ev.createdBy !== ev.userId;
  const proxyName = proxy
    ? (members.find((m) => m.userId === ev.createdBy) || {}).nickname
    : null;
  const range = ev.start === ev.end ? fmtKo(ev.start) : `${fmtKo(ev.start)}  ~  ${fmtKo(ev.end)}`;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="일정"
      footer={
        canEdit ? (
          <>
            <Btn variant="danger" onClick={onDelete} style={{ flex: "0 0 96px" }}>삭제</Btn>
            <Btn onClick={onEdit}>수정</Btn>
          </>
        ) : null
      }
    >
      <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.35, marginBottom: 14, letterSpacing: "-.01em" }}>
        {ev.title}
      </div>
      <div style={{ fontSize: 15, marginBottom: 4 }}>{range}</div>
      <div style={{ fontSize: 15, color: T.inkSoft, marginBottom: 20 }}>{periodLabel(ev.period)}</div>
      <Row k="카테고리">
        <span style={{ fontWeight: ev.category === "work" ? 700 : 400 }}>{catLabel(ev.category)}</span>
      </Row>
      <Row k="작성자">
        <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
          <Dot color={color} square={isShared} />
          {isShared ? `전체 (등록: ${ev.authorName})` : member ? member.nickname : ev.authorName}
          {proxy && (
            <span style={{ color: T.inkSoft, fontSize: 13.5 }}>
              ({proxyName ? `${proxyName}님이` : "그룹장이"} 등록)
            </span>
          )}
        </span>
      </Row>
      {ev.location && <Row k="장소">{ev.location}</Row>}
      {ev.memo && <Row k="메모">{ev.memo}</Row>}
      {!canEdit && (
        <div style={{ fontSize: 13, color: T.inkFaint, marginTop: 18, lineHeight: 1.6 }}>
          다른 멤버가 등록한 개인 일정은 수정하거나 삭제할 수 없습니다.
        </div>
      )}
    </Sheet>
  );
}

function Row({ k, children }) {
  return (
    <div style={{ display: "flex", gap: 14, padding: "11px 0", borderTop: "1px solid " + T.ruleSoft, fontSize: 14.5 }}>
      <span style={{ color: T.inkSoft, minWidth: 62, flex: "none" }}>{k}</span>
      <span style={{ flex: 1, lineHeight: 1.6, wordBreak: "break-word" }}>{children}</span>
    </div>
  );
}

function ProfileSheet({ open, onClose, me, onSave, onLogout }) {
  const [name, setName] = useState(me.nickname);
  const [color, setColor] = useState(me.color);
  const [copied, setCopied] = useState(false);
  useEffect(() => { if (open) { setName(me.nickname); setColor(me.color); } }, [open, me]);
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="내 정보"
      headerActions={
        <>
          <HdrBtn onClick={onClose}>취소</HdrBtn>
          <HdrBtn primary onClick={() => name.trim() && onSave(name.trim(), color)}>저장</HdrBtn>
        </>
      }
    >
      <Field label="이름">
        <input style={inputStyle} value={name} maxLength={10} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="내 색상" hint="이미 다른 멤버가 쓰는 색이면 그룹 안에서는 다른 색이 배정될 수 있습니다.">
        <ColorPicker value={color} onChange={setColor} />
      </Field>

      <div style={{ marginTop: 6 }}>
        <RecoveryCard
          code={me.recoveryCode}
          copied={copied}
          onCopy={async () => {
            if (await copyText(fmtRecovery(me.recoveryCode))) { setCopied(true); setTimeout(() => setCopied(false), 1600); }
          }}
        />
        <div style={{ fontSize: 12, color: T.inkFaint, lineHeight: 1.6, margin: "8px 2px 0" }}>
          다른 기기에서 "쓰던 계정이 있어요"를 누르고 이 코드를 입력하면 같은 계정으로 들어갈 수 있어요.
          코드를 아는 사람은 누구나 내 계정으로 들어올 수 있으니 공유하지 마세요.
        </div>
      </div>

      <Btn variant="ghost" onClick={onLogout} style={{ marginTop: 22, fontSize: 14 }}>
        이 기기에서 로그아웃
      </Btn>
    </Sheet>
  );
}

/* ============================================================
   탭바 / FAB
   ============================================================ */
const TABS = [
  { k: "cal", label: "달력" },
  { k: "list", label: "목록" },
  { k: "group", label: "그룹" },
];

function TabBar({ tab, onChange }) {
  return (
    <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, display: "flex", justifyContent: "center", background: "#fff", borderTop: "1px solid " + T.ruleSoft, zIndex: 40 }}>
      <div style={{ width: "100%", maxWidth: 460, display: "grid", gridTemplateColumns: "repeat(3,1fr)" }}>
        {TABS.map((t) => {
          const on = tab === t.k;
          return (
            <button
              key={t.k}
              type="button"
              onClick={() => onChange(t.k)}
              style={{
                font: "inherit", padding: "12px 0 18px", background: "none", border: "none", cursor: "pointer",
                fontSize: 12, fontWeight: on ? 800 : 500, color: on ? T.ink : T.inkFaint,
                display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
              }}
            >
              <TabIcon k={t.k} on={on} />
              {t.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function TabIcon({ k, on }) {
  const c = on ? T.ink : T.inkFaint;
  if (k === "cal")
    return (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <rect x="2.5" y="4" width="15" height="13" rx="2.5" stroke={c} strokeWidth="1.6" />
        <path d="M2.5 8h15" stroke={c} strokeWidth="1.6" />
        <path d="M6.5 2.5v3M13.5 2.5v3" stroke={c} strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    );
  if (k === "list")
    return (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <path d="M7 5.5h10M7 10h10M7 14.5h10" stroke={c} strokeWidth="1.6" strokeLinecap="round" />
        <circle cx="3.6" cy="5.5" r="1.1" fill={c} />
        <circle cx="3.6" cy="10" r="1.1" fill={c} />
        <circle cx="3.6" cy="14.5" r="1.1" fill={c} />
      </svg>
    );
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="7.3" cy="7" r="3" stroke={c} strokeWidth="1.6" />
      <path d="M2 16.5c0-2.6 2.4-4.2 5.3-4.2s5.3 1.6 5.3 4.2" stroke={c} strokeWidth="1.6" strokeLinecap="round" />
      <path d="M13.4 4.4a3 3 0 010 5.2M14.6 12.6c2 .5 3.4 1.9 3.4 3.9" stroke={c} strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function Fab({ onClick }) {
  return (
    <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, display: "flex", justifyContent: "center", pointerEvents: "none", zIndex: 45 }}>
      <div style={{ width: "100%", maxWidth: 460, position: "relative" }}>
        <button
          type="button"
          onClick={onClick}
          aria-label="일정 추가"
          style={{
            position: "absolute", right: 16, bottom: 78,
            width: 56, height: 56, borderRadius: "50%",
            background: T.ink, color: "#fff", border: "none",
            fontSize: 26, lineHeight: 1, cursor: "pointer",
            boxShadow: "0 4px 14px rgba(0,0,0,.22)",
            pointerEvents: "auto",
          }}
        >
          ＋
        </button>
      </div>
    </div>
  );
}

/* ============================================================
   루트
   ============================================================ */
export default function App() {
  const [me, setMe] = useState(null);
  const [booted, setBooted] = useState(false);
  const [storageOff, setStorageOff] = useState(false);
  const [groups, setGroups] = useState([]);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [recoveryIntro, setRecoveryIntro] = useState(null);
  const [pendingJoin, setPendingJoin] = useState(null);
  const [invite, setInvite] = useState(null);
  const [confirmReq, setConfirmReq] = useState(null);

  const [activeCode, setActiveCode] = useState(null);
  const [group, setGroup] = useState(null);
  const [events, setEvents] = useState([]);

  const [tab, setTab] = useState("cal");
  const today = todayStr();
  const [cursor, setCursor] = useState(() => { const { y, m } = parseYmd(todayStr()); return { y, m }; });
  const [sel, setSel] = useState(today);
  const [dayOpen, setDayOpen] = useState(null);
  const [monthOpen, setMonthOpen] = useState(false);

  const [selMembers, setSelMembers] = useState(() => new Set());
  const [selCats, setSelCats] = useState(() => new Set());
  const [selPeriods, setSelPeriods] = useState(() => new Set());

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [formDate, setFormDate] = useState(today);
  const [detail, setDetail] = useState(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [toast, setToast] = useState("");

  const say = (m) => { setToast(m); setTimeout(() => setToast(""), 2600); };
  const confirmFirst = (req) => setConfirmReq(req);

  const mkToggle = (setter) => (key) =>
    setter((prev) => {
      const n = new Set(prev);
      if (n.has(key)) n.delete(key); else n.add(key);
      return n;
    });
  const toggleMember = mkToggle(setSelMembers);
  const toggleCat = mkToggle(setSelCats);
  const togglePeriod = mkToggle(setSelPeriods);
  const anyFilter = selMembers.size + selCats.size + selPeriods.size > 0;
  const clearFilters = () => { setSelMembers(new Set()); setSelCats(new Set()); setSelPeriods(new Set()); };

  /* ---------- 시작 ---------- */
  useEffect(() => {
    (async () => {
      const ok = await db.ping();
      setStorageOff(!ok);

      /* 초대 링크로 들어온 경우 (?join=CODE) */
      const params = new URLSearchParams(window.location.search);
      const joinCode = (params.get("join") || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (joinCode) {
        const g = ok ? await db.getGroup(joinCode) : null;
        setPendingJoin({ code: joinCode, name: g ? g.name : null, found: !!g });
        params.delete("join");
        const rest = params.toString();
        window.history.replaceState(null, "", window.location.pathname + (rest ? "?" + rest : "") + window.location.hash);
      }

      /* 이 기기에 저장된 계정 */
      try { localStorage.removeItem("tc:me"); } catch (e) {} // 로그인 도입 전 형식
      const saved = loadMe();
      if (saved && saved.userId && saved.recoveryCode) {
        const exists = ok ? await db.userExists(saved.userId) : true;
        if (exists === false) saveMeLocal(null); // DB에서 사라진 계정
        else setMe(saved);
      }
      setBooted(true);
    })();
  }, []);

  /* 내 그룹 목록은 DB 기준으로 불러온다 (어느 기기에서든 동일) */
  const syncGroups = useCallback(async (userId) => {
    setLoadingGroups(true);
    const codes = await db.myGroupCodes(userId);
    const list = codes ? await db.getGroups(codes) : [];
    setGroups(list);
    setLoadingGroups(false);
    return list;
  }, []);

  const myId = me ? me.userId : null;
  useEffect(() => { if (myId) syncGroups(myId); }, [myId, syncGroups]);

  const openGroup = useCallback(async (code, toTab) => {
    setActiveCode(code);
    setTab(toTab || "cal");
    const g = await db.getGroup(code);
    setGroup(g);
    setEvents(await db.getEvents(code));
    clearFilters();
  }, []);

  const exitGroup = useCallback(() => {
    setActiveCode(null);
    setGroup(null);
    setEvents([]);
    setDayOpen(null);
    if (myId) syncGroups(myId);
  }, [myId, syncGroups]);

  /* 다른 멤버의 변경 반영 + 내보내짐/그룹 삭제 감지 */
  const refresh = useCallback(async () => {
    if (!activeCode || !myId) return;
    lastError = "";
    const [g, ev] = await Promise.all([db.getGroup(activeCode), db.getEvents(activeCode)]);
    if (!g) {
      if (!lastError) { exitGroup(); say("그룹이 삭제되었습니다."); }
      return;
    }
    if (!g.members.some((m) => m.userId === myId)) {
      exitGroup();
      say("그룹에서 내보내졌습니다.");
      return;
    }
    setGroup(g);
    /* 그룹 이름/멤버가 바뀌었을 수 있으니 목록 쪽도 같이 맞춘다 */
    setGroups((list) => list.map((x) => (x.code === g.code ? g : x)));
    setEvents(ev);
  }, [activeCode, myId, exitGroup]);

  useEffect(() => {
    if (!activeCode) return;
    const t = setInterval(refresh, 20000);
    const onVisible = () => { if (!document.hidden) refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", onVisible); };
  }, [activeCode, refresh]);

  /* 초대 링크 처리: 로그인이 끝난 뒤, 복구 코드 안내를 본 뒤에 묻는다 */
  useEffect(() => {
    if (!me || !pendingJoin || recoveryIntro) return;
    const pj = pendingJoin;
    setPendingJoin(null);
    if (!pj.found) { say("초대받은 그룹을 찾을 수 없습니다."); return; }
    (async () => {
      const g = await db.getGroup(pj.code);
      if (g && g.members.some((m) => m.userId === me.userId)) openGroup(pj.code);
      else if (g) setInvite({ code: g.code, name: g.name });
    })();
  }, [me, pendingJoin, recoveryIntro, openGroup]);

  /* ---------- 계정 ---------- */
  const createAccount = async (nickname, color) => {
    const u = await db.createUser(nickname, color);
    if (!u) return "계정을 만들지 못했습니다: " + errText();
    saveMeLocal(u);
    setMe(u);
    setRecoveryIntro(u.recoveryCode);
    return true;
  };

  const restoreAccount = async (code) => {
    lastError = "";
    const u = await db.restoreUser(code);
    if (!u) return lastError ? "불러오지 못했습니다: " + errText() : "일치하는 계정이 없습니다. 코드를 확인해 주세요.";
    const next = { ...u, recoveryCode: normRecovery(code) };
    saveMeLocal(next);
    setMe(next);
    say(`${u.nickname}님, 다시 오셨네요.`);
    return true;
  };

  const saveProfile = async (nickname, color) => {
    const ok = await db.updateUser(me.userId, nickname, color);
    if (!ok) return say("저장 실패: " + errText());
    /* 색은 그룹 안에서 다른 멤버와 겹치지 않을 때만 반영한다 */
    for (const g of groups) {
      const clash = g.members.some((m) => m.userId !== me.userId && m.color === color);
      if (!clash) await db.addMember(g.code, { userId: me.userId, nickname, color });
    }
    const next = { ...me, nickname, color };
    setMe(next);
    saveMeLocal(next);
    await syncGroups(next.userId);
    if (activeCode) await refresh();
    setProfileOpen(false);
    say("저장했습니다.");
  };

  const logout = () =>
    confirmFirst({
      title: "이 기기에서 로그아웃",
      message: `복구 코드를 저장해 두셨나요?\n코드가 없으면 이 계정으로 다시 들어올 수 없습니다.\n\n내 복구 코드: ${fmtRecovery(me.recoveryCode)}`,
      confirmLabel: "로그아웃",
      danger: true,
      onConfirm: async () => {
        saveMeLocal(null);
        setProfileOpen(false);
        setActiveCode(null);
        setGroup(null);
        setEvents([]);
        setGroups([]);
        setMe(null);
      },
    });

  /* ---------- 그룹 ---------- */
  const createGroup = async (name) => {
    let code = makeCode();
    for (let i = 0; i < 5; i++) {
      const exists = await db.getGroup(code);
      if (!exists) break;
      code = makeCode();
    }
    const ok = await db.createGroup(code, name, { userId: me.userId, nickname: me.nickname, color: me.color });
    if (!ok) return say("그룹 저장 실패: " + errText());
    await syncGroups(me.userId);
    say("그룹을 만들었습니다. 멤버를 초대해 보세요.");
    openGroup(code, "group"); // 새 그룹은 초대부터 하게 되므로 그룹 탭으로 연다
  };

  const joinGroup = async (code) => {
    const g = await db.getGroup(code);
    if (!g) return "그룹을 찾을 수 없습니다. 코드를 확인해 주세요.";
    if (!g.members.some((m) => m.userId === me.userId)) {
      const used = new Set(g.members.map((m) => m.color));
      const color = used.has(me.color) ? PALETTE.find((c) => !used.has(c)) || me.color : me.color;
      const ok = await db.addMember(code, { userId: me.userId, nickname: me.nickname, color });
      if (!ok) return "참여에 실패했습니다: " + errText();
      say(`'${g.name}' 그룹에 참여했습니다.`);
    }
    await syncGroups(me.userId);
    openGroup(code);
    return true;
  };

  const leaveGroup = () => {
    const isOwner = group.ownerId === me.userId;
    const others = group.members.filter((m) => m.userId !== me.userId).length;
    if (isOwner && others > 0) return say(ERR_TEXT.OWNER_MUST_TRANSFER);
    confirmFirst({
      title: isOwner ? "그룹 삭제" : "그룹 나가기",
      message: isOwner
        ? `'${group.name}' 그룹과 모든 일정이 삭제됩니다.\n되돌릴 수 없습니다.`
        : `'${group.name}' 그룹에서 나갑니다.\n내가 등록한 개인 일정은 모두 삭제됩니다.\n공동 일정은 그룹에 남습니다.`,
      confirmLabel: isOwner ? "삭제" : "나가기",
      danger: true,
      onConfirm: async () => {
        const r = await db.removeMember(activeCode, me.userId, me.userId);
        if (!r) return say("실패: " + errText());
        exitGroup();
        say(r === "group_deleted" ? "그룹을 삭제했습니다." : "그룹에서 나왔습니다.");
      },
    });
  };

  const kickMember = (m) =>
    confirmFirst({
      title: "멤버 내보내기",
      message: `${m.nickname}님을 그룹에서 내보냅니다.\n${m.nickname}님이 등록한 개인 일정도 모두 삭제됩니다.\n공동 일정은 그룹에 남습니다.`,
      confirmLabel: "내보내기",
      danger: true,
      onConfirm: async () => {
        const r = await db.removeMember(activeCode, m.userId, me.userId);
        if (!r) return say("실패: " + errText());
        await refresh();
        say(`${m.nickname}님을 내보냈습니다.`);
      },
    });

  const renameGroup = async (name) => {
    const ok = await db.renameGroup(activeCode, name, me.userId);
    if (!ok) return errText();
    setGroup((g) => (g ? { ...g, name } : g));
    setGroups((list) => list.map((g) => (g.code === activeCode ? { ...g, name } : g)));
    say("그룹 이름을 바꿨습니다.");
    return true;
  };

  const transferTo = (m) =>
    confirmFirst({
      title: "그룹장 넘기기",
      message: `${m.nickname}님에게 그룹장을 넘깁니다.\n넘긴 뒤에는 멤버를 내보낼 수 없습니다.`,
      confirmLabel: "넘기기",
      onConfirm: async () => {
        const ok = await db.transferOwner(activeCode, m.userId, me.userId);
        if (!ok) return say("실패: " + errText());
        await refresh();
        say(`${m.nickname}님이 그룹장이 되었습니다.`);
      },
    });

  /* ---------- 일정 ---------- */
  const saveEvent = async (data) => {
    /* forUserId는 '누구의 일정인가'. 그룹장이 대신 등록할 때만 나와 다르다. */
    const { forUserId, ...rest } = data;
    const gm = (group && group.members) || [];
    const target = rest.type === "shared" ? null : gm.find((m) => m.userId === forUserId);

    if (editing) {
      const merged = { ...editing, ...rest };
      if (target) {
        merged.userId = target.userId;
        merged.authorName = target.nickname;
        merged.authorColor = target.color;
      }
      const ok = await db.updateEvent(activeCode, editing.id, merged);
      if (!ok) return say("저장 실패: " + errText());
      setEvents((list) => list.map((e) => (e.id === editing.id ? merged : e)));
      say("일정을 저장했습니다.");
    } else {
      const owner = target || { userId: me.userId, nickname: me.nickname, color: me.color };
      const now = new Date().toISOString();
      const ev = {
        id: uid(), ...rest,
        userId: owner.userId, authorName: owner.nickname, authorColor: owner.color,
        createdBy: me.userId,
        createdAt: now, updatedAt: now,
      };
      const ok = await db.insertEvent(activeCode, ev);
      if (!ok) return say("저장 실패: " + errText());
      setEvents((list) => [...list, ev]);
      say(
        owner.userId === me.userId
          ? "일정을 추가했습니다."
          : `${owner.nickname}님의 일정을 추가했습니다.`
      );
    }
    setFormOpen(false);
    setEditing(null);
  };

  const deleteEvent = async (id) => {
    const ok = await db.deleteEvent(id);
    if (!ok) return say("삭제 실패: " + errText());
    setEvents((list) => list.filter((e) => e.id !== id));
    setFormOpen(false);
    setEditing(null);
    setDetail(null);
    say("일정을 삭제했습니다.");
  };

  const members = (group && group.members) || [];
  const colorOf = useCallback(
    (ev) => {
      if (ev.type === "shared") return T.shared;
      const m = members.find((x) => x.userId === ev.userId);
      return m ? m.color : ev.authorColor || T.inkSoft;
    },
    [members]
  );

  const visible = useMemo(() => {
    return events.filter((ev) => {
      if (selCats.size && !selCats.has(ev.category)) return false;
      if (selPeriods.size && !selPeriods.has(ev.period)) return false;
      const key = ev.type === "shared" ? "__SHARED__" : ev.userId;
      if (selMembers.size && !selMembers.has(key)) return false;
      return true;
    });
  }, [events, selCats, selPeriods, selMembers]);

  const shell = (content, withTabs) => (
    <div
      style={{
        fontFamily:
          "'Pretendard Variable', Pretendard, -apple-system, 'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', sans-serif",
        background: "#fff",
        color: T.ink,
        minHeight: "100vh",
        WebkitFontSmoothing: "antialiased",
      }}
    >
      <style>{`
        @import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css');
        * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
        button:focus-visible, input:focus-visible, textarea:focus-visible { outline: 2px solid ${T.ink}; outline-offset: 2px; }
        input:focus, textarea:focus { border-color: ${T.ink}; }
        .tc-noscroll::-webkit-scrollbar { display: none; }
        .tc-noscroll { scrollbar-width: none; }
        .tc-sheet { animation: tcUp .18s ease-out; }
        @keyframes tcUp { from { transform: translateY(16px); opacity: .6 } to { transform: none; opacity: 1 } }
        .tc-next { animation: tcNext .17s ease-out; }
        .tc-prev { animation: tcPrev .17s ease-out; }
        @keyframes tcNext { from { transform: translateX(26px); opacity: .3 } to { transform: none; opacity: 1 } }
        @keyframes tcPrev { from { transform: translateX(-26px); opacity: .3 } to { transform: none; opacity: 1 } }
        @media (prefers-reduced-motion: reduce) {
          .tc-sheet, .tc-next, .tc-prev { animation: none }
        }
      `}</style>
      <div style={{ maxWidth: 460, margin: "0 auto", minHeight: "100vh", paddingBottom: withTabs ? 72 : 0 }}>
        {content}
      </div>
      {toast && (
        <div
          style={{
            position: "fixed", left: "50%", bottom: 96, transform: "translateX(-50%)",
            background: "rgba(0,0,0,.86)", color: "#fff", fontSize: 13.5,
            padding: "11px 17px", borderRadius: 999, zIndex: 90, maxWidth: "90%", textAlign: "center",
          }}
        >
          {toast}
        </div>
      )}
    </div>
  );

  if (!booted) return shell(<div style={{ padding: 40, color: T.inkFaint, fontSize: 14 }}>불러오는 중…</div>);

  if (!me) {
    return shell(
      <Onboarding
        onCreate={createAccount}
        onRestore={restoreAccount}
        invitedTo={pendingJoin && pendingJoin.found ? pendingJoin.name : null}
      />
    );
  }

  if (recoveryIntro) return shell(<RecoveryIntro code={recoveryIntro} onDone={() => setRecoveryIntro(null)} />);

  /* 어느 화면에서든 뜰 수 있는 시트들 */
  const overlays = (
    <>
      <ProfileSheet open={profileOpen} onClose={() => setProfileOpen(false)} me={me} onSave={saveProfile} onLogout={logout} />
      <Sheet
        open={!!invite}
        onClose={() => setInvite(null)}
        title="그룹 초대"
        footer={
          <>
            <Btn variant="ghost" onClick={() => setInvite(null)} style={{ flex: "0 0 96px" }}>나중에</Btn>
            <Btn
              onClick={async () => {
                const code = invite.code;
                setInvite(null);
                const r = await joinGroup(code);
                if (r !== true) say(r);
              }}
            >
              참여하기
            </Btn>
          </>
        }
      >
        {invite && (
          <div style={{ fontSize: 16, lineHeight: 1.7 }}>
            <strong>'{invite.name}'</strong> 그룹에 참여할까요?
          </div>
        )}
      </Sheet>
      <ConfirmSheet req={confirmReq} onClose={() => setConfirmReq(null)} />
    </>
  );

  if (!activeCode || !group) {
    return shell(
      <>
        <Welcome
          me={me}
          groups={groups}
          loading={loadingGroups}
          storageOff={storageOff}
          onOpen={openGroup}
          onCreate={createGroup}
          onJoin={joinGroup}
          onEditMe={() => setProfileOpen(true)}
        />
        {overlays}
      </>
    );
  }

  const canEditCurrent = editing
    ? editing.type === "shared" || editing.userId === me.userId || editing.createdBy === me.userId
    : true;
  const iAmOwner = !!group && group.ownerId === me.userId;

  return shell(
    <>
      {tab === "cal" && (
        <CalendarView
          groups={groups}
          group={group}
          onSwitchGroup={openGroup}
          cursor={cursor}
          setCursor={setCursor}
          sel={sel}
          setSel={setSel}
          events={visible}
          colorOf={colorOf}
          selMembers={selMembers}
          selCats={selCats}
          selPeriods={selPeriods}
          toggleMember={toggleMember}
          toggleCat={toggleCat}
          togglePeriod={togglePeriod}
          anyFilter={anyFilter}
          clearFilters={clearFilters}
          onOpenDay={(d) => setDayOpen(d)}
          onPickEvent={(ev) => setDetail(ev)}
          onOpenMonth={() => setMonthOpen(true)}
        />
      )}

      {tab === "list" && (
        <AgendaView cursor={cursor} events={visible} colorOf={colorOf} members={members} onPickEvent={(ev) => setDetail(ev)} />
      )}

      {tab === "group" && (
        <GroupView
          me={me}
          group={group}
          groups={groups}
          storageOff={storageOff}
          onSwitchGroup={openGroup}
          onLeave={leaveGroup}
          onEditMe={() => setProfileOpen(true)}
          onCreate={createGroup}
          onJoin={joinGroup}
          onKick={kickMember}
          onTransfer={transferTo}
          onRename={renameGroup}
          say={say}
        />
      )}

      <TabBar tab={tab} onChange={setTab} />
      {tab !== "group" && (
        <Fab
          onClick={() => {
            setEditing(null);
            setFormDate(sel);
            setFormOpen(true);
          }}
        />
      )}

      {dayOpen && (
        <DayScreen
          date={dayOpen}
          events={visible}
          colorOf={colorOf}
          members={members}
          onClose={() => setDayOpen(null)}
          onAdd={(d) => { setEditing(null); setFormDate(d); setFormOpen(true); }}
          onPickEvent={(ev) => setDetail(ev)}
        />
      )}

      <MonthPicker
        open={monthOpen}
        onClose={() => setMonthOpen(false)}
        cursor={cursor}
        onPick={(y, m) => { setCursor({ y, m }); setMonthOpen(false); }}
        onToday={() => {
          const { y, m } = parseYmd(today);
          setCursor({ y, m });
          setSel(today);
          setMonthOpen(false);
        }}
      />

      <EventDetail
        open={!!detail}
        ev={detail}
        members={members}
        me={me}
        onClose={() => setDetail(null)}
        onEdit={() => { setEditing(detail); setFormDate(detail.start); setDetail(null); setFormOpen(true); }}
        onDelete={() => deleteEvent(detail.id)}
      />

      <EventForm
        open={formOpen}
        initial={editing}
        defaultDate={formDate}
        canEdit={canEditCurrent}
        members={members}
        isOwner={iAmOwner}
        meId={me.userId}
        onClose={() => { setFormOpen(false); setEditing(null); }}
        onSave={saveEvent}
        onDelete={() => editing && deleteEvent(editing.id)}
      />

      {overlays}
    </>,
    true
  );
}


createRoot(document.getElementById("root")).render(<App />);
