-- ============================================================
-- dayshare — Supabase 설정 (처음 설치용)
--
-- ⚠ 이 스크립트는 기존 테이블을 모두 지우고 새로 만든다.
--   이미 쓰고 있는 DB에는 실행하지 말 것. 데이터가 전부 삭제된다.
--   이미 설치된 DB를 올릴 때는 migration_*.sql 을 쓴다.
--
-- Supabase 대시보드 > SQL Editor > New query 에 붙여넣고 Run
-- ============================================================

drop function if exists restore_user(text);
drop function if exists remove_member(text, text, text);
drop function if exists transfer_owner(text, text, text);
drop function if exists rename_group(text, text, text);
drop table if exists events        cascade;
drop table if exists group_members cascade;
drop table if exists groups        cascade;
drop table if exists users         cascade;


-- 1) 사용자 -----------------------------------------------
-- recovery_code: 다른 기기에서 같은 계정으로 들어갈 때 쓰는 개인 코드.
--                하이픈 없이 대문자 8자리로 저장한다.
create table users (
  user_id        text primary key,
  nickname       text not null,
  color          text not null,
  recovery_code  text not null unique,
  created_at     timestamptz not null default now()
);

-- 2) 그룹 -------------------------------------------------
create table groups (
  code        text primary key,
  name        text not null,
  owner_id    text not null references users(user_id),
  created_at  timestamptz not null default now()
);

-- 3) 그룹 멤버 --------------------------------------------
create table group_members (
  group_code  text not null references groups(code) on delete cascade,
  user_id     text not null references users(user_id) on delete cascade,
  nickname    text not null,
  color       text not null,
  joined_at   timestamptz not null default now(),
  primary key (group_code, user_id)
);

create index group_members_user_idx on group_members (user_id);

-- 4) 일정 -------------------------------------------------
create table events (
  id            text primary key,
  group_code    text not null references groups(code) on delete cascade,
  user_id       text not null references users(user_id) on delete cascade,
  created_by    text references users(user_id),
  author_name   text not null,
  author_color  text,
  type          text not null default 'personal'
                check (type in ('personal', 'shared')),
  title         text not null,
  start_date    date not null,
  end_date      date not null,
  category      text not null check (category in ('work', 'life')),
  period        text not null check (period in ('am', 'noon', 'pm', 'eve', 'all')),
  location      text,
  memo          text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (end_date >= start_date)
);

create index events_group_date_idx on events (group_code, start_date);


-- ============================================================
-- 접근 권한
-- ============================================================

alter table users         enable row level security;
alter table groups        enable row level security;
alter table group_members enable row level security;
alter table events        enable row level security;

create policy anon_users_select on users for select to anon using (true);
create policy anon_users_insert on users for insert to anon with check (true);
create policy anon_users_update on users for update to anon using (true) with check (true);

create policy anon_all_groups        on groups        for all to anon using (true) with check (true);
create policy anon_all_group_members on group_members for all to anon using (true) with check (true);
create policy anon_all_events        on events        for all to anon using (true) with check (true);

-- 복구 코드는 누구도 직접 읽을 수 없게 한다.
-- 사용자 테이블에서 읽을 수 있는 열을 지정하고, recovery_code는 제외한다.
revoke all on users from anon;
grant select (user_id, nickname, color, created_at) on users to anon;
grant insert (user_id, nickname, color, recovery_code) on users to anon;
grant update (nickname, color) on users to anon;


-- ============================================================
-- 함수
-- ============================================================

-- 복구 코드로 계정 찾기
-- 코드를 정확히 입력한 경우에만 해당 사용자 정보를 돌려준다.
create function restore_user(p_code text)
returns table (user_id text, nickname text, color text)
language sql
security definer
set search_path = public
as $$
  select u.user_id, u.nickname, u.color
  from users u
  where u.recovery_code = upper(replace(replace(trim(p_code), '-', ''), ' ', ''))
  limit 1;
$$;

-- 멤버 제거 / 그룹 나가기
-- - 그룹장은 다른 멤버를 내보낼 수 있다
-- - 누구나 스스로 나갈 수 있다
-- - 그룹장은 다른 멤버가 남아 있으면 나갈 수 없다 (먼저 넘겨야 함)
-- - 그룹장이 혼자 남은 상태에서 나가면 그룹이 삭제된다
-- - 나가거나 내보내진 멤버의 '개인' 일정은 함께 삭제된다
--   (공동 일정은 그룹의 것이므로 남긴다)
create function remove_member(p_code text, p_target text, p_requester text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner  text;
  v_others int;
begin
  select owner_id into v_owner from groups where code = p_code;
  if v_owner is null then
    raise exception 'GROUP_NOT_FOUND';
  end if;

  if p_requester <> v_owner and p_requester <> p_target then
    raise exception 'NOT_ALLOWED';
  end if;

  if p_target = v_owner then
    select count(*) into v_others
      from group_members where group_code = p_code and user_id <> v_owner;
    if v_others > 0 then
      raise exception 'OWNER_MUST_TRANSFER';
    end if;
    delete from groups where code = p_code;
    return 'group_deleted';
  end if;

  delete from events
   where group_code = p_code and user_id = p_target and type = 'personal';
  delete from group_members
   where group_code = p_code and user_id = p_target;
  return 'removed';
end;
$$;

-- 그룹 이름 변경 (그룹장만)
create function rename_group(p_code text, p_name text, p_requester text)
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

-- 그룹장 넘기기
create function transfer_owner(p_code text, p_new_owner text, p_requester text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner text;
begin
  select owner_id into v_owner from groups where code = p_code;
  if v_owner is null then
    raise exception 'GROUP_NOT_FOUND';
  end if;
  if p_requester <> v_owner then
    raise exception 'NOT_ALLOWED';
  end if;
  if not exists (
    select 1 from group_members where group_code = p_code and user_id = p_new_owner
  ) then
    raise exception 'NOT_A_MEMBER';
  end if;

  update groups set owner_id = p_new_owner where code = p_code;
  return 'transferred';
end;
$$;

revoke all on function restore_user(text)                from public;
revoke all on function remove_member(text, text, text)   from public;
revoke all on function transfer_owner(text, text, text)  from public;
revoke all on function rename_group(text, text, text)    from public;
grant execute on function restore_user(text)               to anon;
grant execute on function remove_member(text, text, text)  to anon;
grant execute on function transfer_owner(text, text, text) to anon;
grant execute on function rename_group(text, text, text)   to anon;
