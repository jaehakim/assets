// docs/*.md → docs/*.html (marked + mermaid, 라이트 모드)
// 사용법: node docs/build-html.mjs
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, basename } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const docs = readdirSync(dir).filter((f) => f.endsWith(".md")).sort((a, b) =>
  a === "README.md" ? -1 : b === "README.md" ? 1 : a.localeCompare(b));

const htmlName = (md) => (md === "README.md" ? "index.html" : md.replace(/\.md$/, ".html"));
const titleOf = (text, file) => (text.match(/^#\s+(.+)$/m)?.[1] ?? basename(file, ".md")).trim();

const items = docs.map((file) => {
  const text = readFileSync(join(dir, file), "utf8");
  return { file, text, html: htmlName(file), title: titleOf(text, file) };
});

const css = `
:root{--bg:#ffffff;--panel:#f7f8fa;--text:#1f2937;--muted:#6b7280;--line:#e5e7eb;--accent:#3b5bdb;--accent-soft:#edf2ff;--code:#f3f4f6}
*{box-sizing:border-box}
html,body{margin:0;background:var(--bg);color:var(--text);color-scheme:light}
body{font-family:"Pretendard","Malgun Gothic","Apple SD Gothic Neo",system-ui,sans-serif;font-size:15px;line-height:1.7;display:flex;min-height:100vh}
nav{width:270px;flex:none;background:var(--panel);border-right:1px solid var(--line);padding:24px 16px;position:sticky;top:0;height:100vh;overflow:auto}
nav .brand{font-weight:800;font-size:17px;margin:0 8px 4px}
nav .sub{color:var(--muted);font-size:12px;margin:0 8px 18px}
nav a{display:block;padding:8px 10px;border-radius:8px;color:var(--text);text-decoration:none;font-size:14px;margin-bottom:2px}
nav a:hover{background:#eceff3}
nav a.active{background:var(--accent-soft);color:var(--accent);font-weight:700}
main{flex:1;min-width:0;padding:40px 48px 80px;max-width:1180px}
h1{font-size:28px;margin:0 0 12px;padding-bottom:12px;border-bottom:2px solid var(--line)}
h2{font-size:21px;margin:40px 0 12px;padding-left:10px;border-left:4px solid var(--accent)}
h3{font-size:17px;margin:28px 0 10px}
a{color:var(--accent)}
blockquote{margin:12px 0;padding:10px 16px;background:var(--accent-soft);border-left:4px solid var(--accent);border-radius:0 8px 8px 0;color:#374151}
blockquote p{margin:4px 0}
table{border-collapse:collapse;width:100%;margin:12px 0 20px;font-size:13.5px;display:block;overflow-x:auto}
th,td{border:1px solid var(--line);padding:7px 10px;text-align:left;vertical-align:top}
th{background:var(--panel);font-weight:700;white-space:nowrap}
tr:nth-child(even) td{background:#fbfbfc}
code{background:var(--code);padding:1px 5px;border-radius:4px;font-family:"D2Coding",Consolas,monospace;font-size:.9em}
pre{background:#f6f8fa;border:1px solid var(--line);border-radius:8px;padding:14px;overflow:auto}
pre code{background:none;padding:0}
.mermaid{background:#fff;border:1px solid var(--line);border-radius:10px;padding:16px;margin:14px 0 22px;text-align:center;overflow-x:auto}
.foot{margin-top:56px;color:var(--muted);font-size:12px;border-top:1px solid var(--line);padding-top:12px}
@media (max-width:860px){body{display:block}nav{position:static;width:auto;height:auto;border-right:0;border-bottom:1px solid var(--line)}main{padding:24px 16px 60px}}
@media print{nav{display:none}main{max-width:none;padding:0}}
`;

const page = (it) => `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${it.title} | AssetFlow 검토</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css">
<style>${css}</style>
</head>
<body>
<nav>
  <div class="brand">AssetFlow 검토</div>
  <div class="sub">IT자산관리 · 보안 · 인프라 · 디자인 · 웹</div>
  ${items.map((x) => `<a href="${x.html}"${x === it ? ' class="active"' : ""}>${x.file === "README.md" ? "개요 (README)" : x.title}</a>`).join("\n  ")}
</nav>
<main id="content"></main>
<script id="md" type="application/json">${JSON.stringify(it.text).replace(/</g, "\\u003c")}</script>
<script src="https://cdn.jsdelivr.net/npm/marked@12.0.2/marked.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/mermaid@11.4.1/dist/mermaid.min.js"></script>
<script>
  const links = ${JSON.stringify(Object.fromEntries(items.map((x) => [x.file, x.html])))};
  const main = document.getElementById("content");
  main.innerHTML = marked.parse(JSON.parse(document.getElementById("md").textContent), { gfm: true });
  main.querySelectorAll("a[href]").forEach((a) => {
    const target = decodeURIComponent(a.getAttribute("href"));
    if (links[target]) a.setAttribute("href", links[target]);
  });
  main.querySelectorAll("pre > code.language-mermaid").forEach((code) => {
    const box = document.createElement("div");
    box.className = "mermaid";
    box.textContent = code.textContent;
    code.parentElement.replaceWith(box);
  });
  const foot = document.createElement("div");
  foot.className = "foot";
  foot.textContent = "원본: ${it.file} · 생성: build-html.mjs";
  main.appendChild(foot);
  mermaid.initialize({ startOnLoad: false, theme: "default", securityLevel: "strict",
    themeVariables: { darkMode: false, background: "#ffffff", fontFamily: "Pretendard, Malgun Gothic, sans-serif" },
    flowchart: { htmlLabels: true, curve: "basis" }, gantt: { axisFormat: "%y-%m" } });
  mermaid.run({ querySelector: ".mermaid" });
</script>
</body>
</html>
`;

for (const it of items) {
  writeFileSync(join(dir, it.html), page(it), "utf8");
  console.log(`${it.file} -> ${it.html}`);
}
