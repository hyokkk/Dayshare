# dayshare

그룹 코드로 참여하는 공유 캘린더 웹앱.

## 폴더 구조

| 경로 | 내용 | 직접 수정 |
|---|---|---|
| `src/app.jsx` | 앱 원본 코드 | ✅ 여기를 고친다 |
| `template.html` | HTML 껍데기 (메타 태그 등) | 가끔 |
| `supabase/setup.sql` | 처음 설치용 SQL (기존 테이블을 지운다) | 구조 변경 시 |
| `supabase/migration_*.sql` | 쓰고 있는 DB를 올리는 SQL (데이터 유지) | 구조 변경 시 |
| `docs/설계서_v3.1.md` | 설계서 | ✅ |
| `site/` | 아이콘/매니페스트 등 정적 파일 | 아이콘 교체 시 |
| `dist/` | **배포용 폴더** | ❌ 빌드로만 생성 |
| `test/` | 자동 테스트 | |
| `build.mjs`, `package.json` | 빌드 설정 | 거의 안 함 |

`dist/` 안의 파일은 압축된 결과물이라 사람이 고칠 수 없다. 항상 `src/app.jsx`를 고친 뒤 빌드한다.

## 테스트

```bash
npx esbuild src/app.jsx --bundle --format=iife --loader:.jsx=jsx --jsx=automatic \
  --define:process.env.NODE_ENV='"development"' --outfile=test/.bundle.js
node test/e2e.cjs
```

가짜 Supabase와 가상 브라우저로 가입부터 그룹 삭제까지 전 과정을 확인한다.
`test/db-permissions.sql`은 PostgreSQL에서 권한/함수 동작을 확인하는 스크립트다.

## 빌드

Node.js 18 이상 필요.

```bash
npm install
npm run build
```

## 배포

1. Netlify → 사이트 → Deploys
2. **`dist` 폴더를 통째로** 끌어다 놓기 (폴더 안의 파일들이 아니라 폴더 자체)
3. `dist` 안의 파일 이름은 바꾸지 않는다. 아이콘은 사이트 루트(`/apple-touch-icon.png`)에서 찾으므로 위치가 바뀌면 안 된다

테이블 구조가 바뀌는 수정이면 **Supabase SQL을 먼저 실행한 뒤** HTML을 올린다.

> ⚠ `supabase/setup.sql`은 기존 테이블을 모두 지우고 새로 만든다. 이미 쓰고 있는 DB에는 실행하지 말고, `migration_*.sql`을 쓴다.
> 구조를 바꿀 때는 setup.sql(새 설치용)과 migration 파일(기존 DB용)을 함께 갱신한다.

## 외부 서비스

- DB: Supabase (Region: Seoul)
- 호스팅: Netlify

## 변경 이력

| 버전 | 날짜 | 내용 |
|---|---|---|
| 1.0.0 | 2026-09-21 | Supabase + Netlify 첫 배포 |
| 1.1.0 | 2026-09-22 | 복구 코드 계정, 그룹장(내보내기/넘기기), 초대 링크·공유. **DB 초기화 필요** |
| 1.1.1 | 2026-09-22 | 앱 이름을 dayshare로 변경. DB 변경 없음 |
| 1.2.0 | 2026-09-29 | 그룹장의 그룹 이름 변경/대리 등록, 홈 화면 아이콘. **`migration_v1.2.sql` 실행 필요 (데이터 유지)** |
| 1.2.1 | 2026-09-30 | 사이트 주소가 루트(`/`)인 것을 확인하여 `together-calendar.html` 사본 제거. DB 변경 없음 |
