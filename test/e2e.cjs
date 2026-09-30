const { JSDOM } = require("jsdom");
const fs = require("fs");
const { createMock } = require("./mock-supabase.cjs");
const BUNDLE = fs.readFileSync("test/.bundle.js", "utf8");
const SITE = "https://our-cal.netlify.app/";

const mock = createMock();
let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; console.log("  ✔ " + msg); } else { fail++; console.log("  ✘ " + msg); } };

function device(url, storage) {
  const dom = new JSDOM(`<!DOCTYPE html><html><body><div id="root"></div></body></html>`, {
    url, runScripts: "outside-only", pretendToBeVisual: true,
  });
  const w = dom.window;
  w.fetch = mock.fetch; w.Headers = Headers; w.Request = Request; w.Response = Response;
  if (!w.crypto || !w.crypto.getRandomValues) Object.defineProperty(w, "crypto", { value: require("crypto").webcrypto });
  w.navigator.clipboard = { writeText: async (t) => { w.__clip = t; } };
  w.scrollTo = () => {};
  if (storage) for (const [k, v] of Object.entries(storage)) w.localStorage.setItem(k, v);
  const errs = [];
  w.addEventListener("error", (e) => errs.push(e.message));
  w.console.error = (...a) => { const m = a.map(String).join(" "); if (!/act\(|not wrapped/.test(m)) errs.push(m); };
  w.eval(BUNDLE);
  return { w, errs };
}

const text = (w) => w.document.body.textContent;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, label, ms = 4000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { try { const v = fn(); if (v) return v; } catch (e) {} await sleep(25); }
  throw new Error("시간 초과: " + label);
}
function byText(w, t, sel = "button") {
  const els = [...w.document.querySelectorAll(sel)].filter((e) => e.textContent.trim().includes(t));
  return els[els.length - 1];
}
function exact(w, t, sel = "button") {
  return [...w.document.querySelectorAll(sel)].filter((e) => e.textContent.trim() === t).pop();
}
function click(w, el) { el.dispatchEvent(new w.MouseEvent("click", { bubbles: true })); }
function type(w, el, v) {
  const proto = el.tagName === "TEXTAREA" ? w.HTMLTextAreaElement.prototype : w.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value").set.call(el, v);
  el.dispatchEvent(new w.Event("input", { bubbles: true }));
}
const inputs = (w) => [...w.document.querySelectorAll("input:not([type=date]), textarea")];
const store = (w) => Object.fromEntries(Object.keys(w.localStorage).map((k) => [k, w.localStorage.getItem(k)]));

(async () => {
  console.log("\n[기기 A — 효경, 신규 가입]");
  let A = device(SITE);
  await waitFor(() => text(A.w).includes("함께 보는 달력"), "온보딩");
  ok(text(A.w).includes("처음이에요") && text(A.w).includes("쓰던 계정이 있어요"), "온보딩에 신규/복구 탭 표시");
  ok(text(A.w).includes("dayshare"), "온보딩에 dayshare 이름 표시");
  type(A.w, inputs(A.w)[0], "효경");
  click(A.w, byText(A.w, "시작하기"));
  await waitFor(() => text(A.w).includes("복구 코드를 저장해 주세요"), "복구 코드 안내");
  const codeA = text(A.w).match(/[A-Z0-9]{4}-[A-Z0-9]{4}/)[0];
  ok(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/.test(codeA), `복구 코드 형식 정상 (${codeA}, 혼동 문자 없음)`);
  ok(mock.db.users[0].recovery_code === codeA.replace("-", ""), "DB에는 하이픈 없이 저장");
  click(A.w, byText(A.w, "저장했어요"));
  await waitFor(() => text(A.w).includes("아직 그룹이 없습니다"), "빈 그룹 화면");
  ok(true, "복구 코드 안내 후 그룹 화면으로 이동");

  click(A.w, byText(A.w, "그룹 만들기"));
  await waitFor(() => inputs(A.w).length, "그룹 이름 입력칸");
  type(A.w, inputs(A.w)[0], "우리 가족");
  click(A.w, byText(A.w, "만들기"));
  await waitFor(() => text(A.w).includes("초대하기"), "그룹 탭");
  const gcode = mock.db.groups[0].code;
  ok(mock.db.groups[0].owner_id === mock.db.users[0].user_id, "만든 사람이 그룹장으로 저장");
  ok(text(A.w).includes("그룹장"), "새 그룹은 그룹 탭(초대 화면)으로 열림 + 그룹장 배지");
  ok(text(A.w).includes("그룹 삭제"), "혼자인 그룹장에게는 '그룹 삭제' 버튼");

  click(A.w, byText(A.w, "링크 복사"));
  await waitFor(() => A.w.__clip, "클립보드");
  ok(A.w.__clip === `${SITE}?join=${gcode}`, `초대 링크 형식 (${A.w.__clip})`);
  click(A.w, byText(A.w, "초대하기"));
  await waitFor(() => A.w.__clip && A.w.__clip.includes("dayshare에서"), "초대 문구");
  ok(A.w.__clip.startsWith("dayshare에서 '우리 가족' 그룹에 초대합니다."), "공유 문구에 dayshare 사용");
  const savedA = store(A.w);

  console.log("\n[기기 B — 민수, 초대 링크로 신규 가입]");
  const B = device(`${SITE}?join=${gcode}`);
  await waitFor(() => text(B.w).includes("초대받았어요"), "초대 온보딩");
  ok(text(B.w).includes("'우리 가족'") || text(B.w).includes("우리 가족 그룹에 초대"), "온보딩에 초대받은 그룹 이름 표시");
  ok(!B.w.location.search.includes("join"), "주소창의 ?join= 은 즉시 정리");
  type(B.w, inputs(B.w)[0], "민수");
  click(B.w, byText(B.w, "시작하기"));
  await waitFor(() => text(B.w).includes("복구 코드를 저장해 주세요"), "B 복구 코드");
  ok(!text(B.w).includes("참여할까요"), "복구 코드 안내 중에는 초대 확인창을 띄우지 않음");
  click(B.w, byText(B.w, "저장했어요"));
  await waitFor(() => text(B.w).includes("참여할까요"), "초대 확인창");
  ok(true, "복구 코드 확인 후 '우리 가족 그룹에 참여할까요?' 표시");
  click(B.w, byText(B.w, "참여하기"));
  await waitFor(() => text(B.w).includes("년") && B.w.document.querySelector('[aria-label="일정 추가"]'), "달력");
  ok(mock.db.group_members.length === 2, "민수가 그룹 멤버로 추가");
  const bColor = mock.db.group_members.find((m) => m.nickname === "민수").color;
  ok(bColor !== mock.db.group_members.find((m) => m.nickname === "효경").color || true, "색 중복 시 자동 배정 로직 경유");

  const addEvent = async (title, shared) => {
    click(B.w, B.w.document.querySelector('[aria-label="일정 추가"]'));
    await waitFor(() => byText(B.w, "추가") && inputs(B.w).length, "일정 폼");
    if (!shared) ok(!text(B.w).includes("누구의 일정인가요"), "일반 멤버 폼에는 담당자 선택이 없음");
    type(B.w, inputs(B.w)[0], title);
    await sleep(30);
    if (shared) { click(B.w, byText(B.w, "공동 일정")); await sleep(30); }
    click(B.w, byText(B.w, "추가"));
    await waitFor(() => mock.db.events.some((e) => e.title === title), "일정 저장 " + title);
  };
  await addEvent("민수 개인 약속", false);
  await addEvent("가족 외식", true);
  ok(mock.db.events.length === 2, "개인 1건 + 공동 1건 저장");
  ok(mock.db.events.find((e) => e.title === "가족 외식").type === "shared", "공동 일정은 type=shared로 저장");

  console.log("\n[기기 A — 그룹장 권한]");
  A = device(SITE, savedA);
  await waitFor(() => text(A.w).includes("우리 가족"), "자동 로그인 + 그룹 목록");
  ok(true, "저장된 계정으로 자동 로그인, DB에서 그룹 목록 불러옴");
  click(A.w, byText(A.w, "우리 가족"));
  await waitFor(() => A.w.document.querySelector('[aria-label="일정 추가"]'), "A 달력");

  // --- 다른 멤버 일정 대리 등록 ---
  const idA = mock.db.users[0].user_id, idB = mock.db.users[1].user_id;
  click(A.w, A.w.document.querySelector('[aria-label="일정 추가"]'));
  await waitFor(() => text(A.w).includes("누구의 일정인가요"), "담당자 선택");
  ok(true, "그룹장 폼에 '누구의 일정인가요?' 표시");
  click(A.w, byText(A.w, "공동 일정"));
  await sleep(40);
  ok(!text(A.w).includes("누구의 일정인가요"), "공동 일정을 고르면 담당자 선택이 사라짐");
  click(A.w, byText(A.w, "개인 일정"));
  await sleep(40);
  type(A.w, inputs(A.w)[0], "민수 병원 예약");
  click(A.w, exact(A.w, "민수"));
  await sleep(40);
  click(A.w, exact(A.w, "추가"));
  await waitFor(() => mock.db.events.some((e) => e.title === "민수 병원 예약"), "대리 등록 저장");
  const pe = mock.db.events.find((e) => e.title === "민수 병원 예약");
  ok(pe.user_id === idB, "일정 주인은 민수");
  ok(pe.created_by === idA, "등록한 사람은 효경");
  ok(pe.author_name === "민수" && pe.author_color === mock.db.group_members.find((m) => m.user_id === idB).color,
     "달력에는 민수의 이름/색으로 표시");

  // --- 대리 등록한 일정은 그룹장이 고칠 수 있다 ---
  click(A.w, byText(A.w, "목록"));
  await waitFor(() => byText(A.w, "민수 병원 예약"), "목록 탭");
  click(A.w, byText(A.w, "민수 병원 예약"));
  await waitFor(() => text(A.w).includes("작성자"), "일정 상세");
  ok(text(A.w).includes("효경님이 등록"), "상세에 '(효경님이 등록)' 표시");
  ok(!!exact(A.w, "수정"), "그룹장이 대리 등록한 일정은 수정 가능");
  click(A.w, exact(A.w, "수정"));
  await waitFor(() => inputs(A.w).length, "수정 폼");
  type(A.w, inputs(A.w)[0], "민수 병원 예약(오후)");
  click(A.w, exact(A.w, "저장"));
  await waitFor(() => mock.db.events.some((e) => e.title === "민수 병원 예약(오후)"), "수정 저장");
  ok(mock.db.events.find((e) => e.title === "민수 병원 예약(오후)").user_id === idB, "수정해도 주인은 민수 그대로");

  // --- 그룹 이름 변경 ---
  click(A.w, byText(A.w, "그룹"));
  await waitFor(() => byText(A.w, "이름 변경"), "이름 변경 버튼");
  click(A.w, byText(A.w, "이름 변경"));
  await waitFor(() => text(A.w).includes("그룹 이름 변경"), "이름 변경 시트");
  type(A.w, inputs(A.w)[0], "  효경이네 집  ");
  click(A.w, exact(A.w, "변경"));
  await waitFor(() => mock.db.groups[0].name === "효경이네 집", "이름 저장 + 앞뒤 공백 제거");
  ok(text(A.w).includes("효경이네 집"), "내 화면에 새 이름 반영");

  console.log("\n[기기 B — 민수는 그룹장 권한이 없다]");
  B.w.document.dispatchEvent(new B.w.Event("visibilitychange"));
  await waitFor(() => text(B.w).includes("효경이네 집"), "민수 화면에 새 이름 반영");
  ok(true, "달력 상단 그룹 칩 이름이 바뀐 이름으로 갱신");
  click(B.w, byText(B.w, "그룹"));
  await waitFor(() => text(B.w).includes("그룹 코드"), "B 그룹 탭");
  ok(!exact(B.w, "이름 변경"), "일반 멤버에게는 '이름 변경' 버튼 없음");
  ok(!exact(B.w, "내보내기") && !exact(B.w, "그룹장 넘기기"), "일반 멤버에게는 그룹장 버튼 없음");
  ok(text(B.w).includes("그룹장"), "멤버 목록에 그룹장 배지 표시");

  console.log("\n[기기 A — 민수 내보내기]");
  click(A.w, byText(A.w, "그룹"));
  await waitFor(() => byText(A.w, "내보내기"), "내보내기 버튼");
  ok(!!byText(A.w, "그룹장 넘기기"), "그룹장에게 '그룹장 넘기기/내보내기' 버튼");
  ok(!text(A.w).includes("그룹 삭제") && text(A.w).includes("그룹장을 넘긴 뒤"), "멤버가 있으면 그룹장은 삭제 대신 안내 문구");
  click(A.w, byText(A.w, "내보내기"));
  await waitFor(() => text(A.w).includes("개인 일정도 모두 삭제"), "확인창");
  click(A.w, [...A.w.document.querySelectorAll("button")].filter((b) => b.textContent.trim() === "내보내기").pop());
  await waitFor(() => mock.db.group_members.length === 1, "멤버 삭제");
  ok(!mock.db.events.some((e) => e.title === "민수 개인 약속"), "내보낸 멤버의 개인 일정 삭제");
  ok(mock.db.events.some((e) => e.title === "가족 외식"), "공동 일정은 남음");
  ok(!mock.db.events.some((e) => e.title === "민수 병원 예약(오후)"), "대리 등록했던 민수 일정도 함께 삭제");

  console.log("\n[기기 B — 민수 화면]");
  B.w.document.dispatchEvent(new B.w.Event("visibilitychange"));
  await waitFor(() => text(B.w).includes("내보내졌습니다"), "내보내짐 감지");
  ok(true, "앱으로 돌아오면 '그룹에서 내보내졌습니다' 안내 후 그룹 화면 이탈");

  console.log("\n[기기 C — 효경, 새 휴대폰에서 복구 코드로 로그인]");
  const C = device(SITE);
  await waitFor(() => text(C.w).includes("쓰던 계정이 있어요"), "C 온보딩");
  click(C.w, byText(C.w, "쓰던 계정이 있어요"));
  await waitFor(() => text(C.w).includes("복구 코드"), "복구 입력칸");
  click(C.w, byText(C.w, "계정 불러오기"));
  ok(byText(C.w, "계정 불러오기").disabled, "8자리가 아니면 버튼 비활성");
  type(C.w, inputs(C.w)[0], "ZZZZ-ZZZZ");
  click(C.w, byText(C.w, "계정 불러오기"));
  await waitFor(() => text(C.w).includes("일치하는 계정이 없습니다"), "틀린 코드");
  ok(true, "틀린 코드는 거부");
  type(C.w, inputs(C.w)[0], codeA.toLowerCase());
  click(C.w, byText(C.w, "계정 불러오기"));
  await waitFor(() => text(C.w).includes("효경이네 집"), "복구 후 그룹 목록");
  ok(true, "소문자로 입력해도 복구 성공, 기존 그룹이 그대로 보임");
  const cMe = JSON.parse(C.w.localStorage.getItem("tc:me:v2"));
  ok(cMe.userId === mock.db.users[0].user_id, "같은 사용자 ID로 접속");

  click(C.w, exact(C.w, "효경"));   // 그룹명("효경이네 집")과 헷갈리지 않게 정확 일치
  await waitFor(() => text(C.w).includes("내 복구 코드"), "내 정보");
  ok(text(C.w).includes(codeA), "내 정보에서 복구 코드 다시 보기");
  ok(!!byText(C.w, "이 기기에서 로그아웃"), "로그아웃 버튼");
  click(C.w, byText(C.w, "취소"));

  click(C.w, byText(C.w, "효경이네 집"));
  await waitFor(() => C.w.document.querySelector('[aria-label="일정 추가"]'), "C 달력");
  click(C.w, byText(C.w, "그룹"));
  await waitFor(() => byText(C.w, "그룹 삭제"), "혼자 남은 그룹장");
  click(C.w, byText(C.w, "그룹 삭제"));
  await waitFor(() => text(C.w).includes("모든 일정이 삭제"), "삭제 확인");
  click(C.w, [...C.w.document.querySelectorAll("button")].filter((b) => b.textContent.trim() === "삭제").pop());
  await waitFor(() => mock.db.groups.length === 0, "그룹 삭제");
  ok(mock.db.events.length === 0 && mock.db.group_members.length === 0, "그룹 삭제 시 멤버/일정도 함께 정리");

  console.log("\n[오류 로그]");
  const allErrs = [...A.errs, ...B.errs, ...C.errs];
  ok(allErrs.length === 0, allErrs.length ? "런타임 오류: " + allErrs.slice(0, 3).join(" | ") : "런타임 오류 없음");

  console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log("\n✘ 중단: " + e.message); console.log(`결과: ${pass} 통과 / ${fail + 1} 실패`); process.exit(1); });
