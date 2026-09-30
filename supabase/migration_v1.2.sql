-- ============================================================
-- dayshare — v1.1 → v1.2 마이그레이션
--
-- ✅ 기존 데이터를 지우지 않는다. 계정/그룹/일정 모두 그대로 유지된다.
-- 여러 번 실행해도 안전하다.
--
-- Supabase 대시보드 > SQL Editor > New query 에 붙여넣고 Run
-- ============================================================

-- 1) 일정에 '실제로 등록한 사람' 기록 ----------------------
-- 그룹장이 다른 멤버의 일정을 대신 등록할 수 있게 되면서,
-- 일정의 주인(user_id)과 등록한 사람(created_by)이 달라질 수 있다.
alter table events
  add column if not exists created_by text references users(user_id);

-- 기존 일정은 주인이 곧 등록한 사람이다.
update events set created_by = user_id where created_by is null;


-- 2) 그룹 이름 변경 ---------------------------------------
-- 그룹장만 바꿀 수 있다.
create or replace function rename_group(p_code text, p_name text, p_requester text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner text;
  v_name  text := btrim(p_name);
begin
  if v_name = '' then
    raise exception 'EMPTY_NAME';
  end if;

  select owner_id into v_owner from groups where code = p_code;
  if v_owner is null then
    raise exception 'GROUP_NOT_FOUND';
  end if;
  if p_requester <> v_owner then
    raise exception 'NOT_ALLOWED';
  end if;

  update groups set name = v_name where code = p_code;
  return v_name;
end;
$$;

revoke all on function rename_group(text, text, text) from public;
grant execute on function rename_group(text, text, text) to anon;
