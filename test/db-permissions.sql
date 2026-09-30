\set ON_ERROR_STOP 0
set role anon;

-- 사용자 2명 생성
insert into users (user_id, nickname, color, recovery_code) values ('u1','효경','#D9455F','ABCD2345');
insert into users (user_id, nickname, color, recovery_code) values ('u2','민수','#4A62C4','WXYZ6789');

\echo '--- [기대: 성공] 공개 열 조회'
select user_id, nickname, color from users order by user_id;

\echo '--- [기대: 권한 오류] 복구 코드 직접 조회'
select recovery_code from users;

\echo '--- [기대: 권한 오류] select * 로 우회 시도'
select * from users;

\echo '--- [기대: 권한 오류] 복구 코드 변경 시도'
update users set recovery_code = 'HACKED00' where user_id = 'u1';

\echo '--- [기대: u1 반환] 복구 코드로 계정 찾기 (소문자+하이픈 입력)'
select * from restore_user('abcd-2345');

\echo '--- [기대: 빈 결과] 틀린 코드'
select * from restore_user('ZZZZ-ZZZZ');

-- 그룹/멤버/일정
insert into groups (code, name, owner_id) values ('FAM123','우리 가족','u1');
insert into group_members (group_code, user_id, nickname, color) values ('FAM123','u1','효경','#D9455F'),('FAM123','u2','민수','#4A62C4');
insert into events (id, group_code, user_id, author_name, type, title, start_date, end_date, category, period)
values ('e1','FAM123','u2','민수','personal','민수 개인','2026-09-25','2026-09-25','life','eve'),
       ('e2','FAM123','u2','민수','shared','민수가 만든 공동','2026-09-26','2026-09-26','life','eve'),
       ('e3','FAM123','u1','효경','personal','효경 개인','2026-09-27','2026-09-27','work','am');

\echo '--- [기대: NOT_ALLOWED] 일반 멤버가 그룹장을 내보내기'
select remove_member('FAM123','u1','u2');

\echo '--- [기대: OWNER_MUST_TRANSFER] 그룹장이 멤버 남은 채로 나가기'
select remove_member('FAM123','u1','u1');

\echo '--- [기대: removed] 그룹장이 민수 내보내기'
select remove_member('FAM123','u2','u1');

\echo '--- [기대: e2(공동), e3만 남음] 민수 개인 일정만 삭제됐는지'
select id, title, type from events order by id;

\echo '--- [기대: u1만 남음]'
select user_id from group_members;

-- 넘기기 테스트용 재참여
insert into group_members (group_code, user_id, nickname, color) values ('FAM123','u2','민수','#4A62C4');

\echo '--- [기대: NOT_ALLOWED] 일반 멤버가 그룹장 넘기기'
select transfer_owner('FAM123','u2','u2');

\echo '--- [기대: transferred] 그룹장이 민수에게 넘기기'
select transfer_owner('FAM123','u2','u1');
select owner_id from groups;

\echo '--- [기대: removed] 전 그룹장(효경)이 이제 스스로 나가기'
select remove_member('FAM123','u1','u1');

\echo '--- [기대: group_deleted] 혼자 남은 그룹장이 나가기'
select remove_member('FAM123','u2','u2');

\echo '--- [기대: 0, 0, 0] 그룹/멤버/일정 모두 정리됨'
select (select count(*) from groups) g, (select count(*) from group_members) m, (select count(*) from events) e;
