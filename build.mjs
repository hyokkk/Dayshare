// src/app.jsx 를 번들링하여 dist/ 에 배포용 폴더를 만든다.
// 사용법: npm install  →  npm run build
// 결과물 dist/ 폴더를 통째로 Netlify에 끌어다 놓는다.
import { build } from "esbuild";
import { readFileSync, writeFileSync, mkdirSync, readdirSync, copyFileSync, statSync } from "fs";

const result = await build({
  entryPoints: ["src/app.jsx"],
  bundle: true,
  minify: true,
  format: "iife",
  target: "es2019",
  jsx: "automatic",
  loader: { ".jsx": "jsx" },
  define: { "process.env.NODE_ENV": '"production"' },
  write: false,
});

const js = result.outputFiles[0].text;
const html = readFileSync("template.html", "utf8").replace("%%BUNDLE%%", () => js);

mkdirSync("dist", { recursive: true });

// 앱 본체. 사이트 주소(/)로 접속하면 이 파일이 열린다.
writeFileSync("dist/index.html", html);

// 아이콘과 매니페스트 등 정적 파일
for (const f of readdirSync("site")) {
  if (statSync(`site/${f}`).isFile()) copyFileSync(`site/${f}`, `dist/${f}`);
}

console.log(`dist/  (index.html ${(html.length / 1024).toFixed(0)} KB + 정적 파일 ${readdirSync("site").length}개)`);
