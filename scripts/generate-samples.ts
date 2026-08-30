import { mkdir, rm, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { renderDashboard, TEMPLATE_PACKS } from "../src/templates"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const samples = resolve(root, "samples")
const vault = resolve(samples, "generated-vault", "NotionHub")
const fixtures: Record<string, unknown> = {}

void main()

async function main(): Promise<void> {
  await rm(resolve(samples, "generated-vault"), { recursive: true, force: true })

  for (const [service, pack] of Object.entries(TEMPLATE_PACKS)) {
  const dates = ["2026-08-24", "2026-08-25", "2026-08-26", "2026-08-27", "2026-08-28", "2026-08-29"]
  const entries = dates.slice(0, 4).map((date, index) => ({
    key: `${service}:${pack.primaryEntities[0]}:sample-${index + 1}`,
    entityType: pack.primaryEntities[0], entityId: `sample-${index + 1}`,
    title: `${pack.label} 示例 ${index + 1}`,
    path: `services/${service}/${pack.primaryEntities[0]}/sample-${index + 1}.md`,
    updatedAt: `${date}T08:00:00Z`,
    view: { schemaVersion: 1, dates: { occurredAt: date }, dimensions: { category: ["学习", "收藏", "生活"][index % 3] }, measures: { durationMinutes: (index + 1) * 15 }, media: {} },
  }))
  const catalog = { schemaVersion: 1, service, label: pack.label, icon: pack.icon, color: pack.color, primaryEntities: pack.primaryEntities, generatedAt: "2026-08-29T12:00:00Z", entries }
  const baseSeries = [
    { key: `total:${pack.primaryEntities[0]}`, kind: "kpi", label: pack.primaryEntities[0], unit: "条", points: [{ key: pack.primaryEntities[0], value: entries.length }] },
    { key: "sum:durationMinutes", kind: "kpi", label: "durationMinutes", unit: "分钟", points: [{ key: "durationMinutes", value: 150 }] },
    { key: "heatmap:occurredAt", kind: "heatmap", label: "occurredAt", unit: "分钟", points: dates.map((key, index) => ({ key, value: (index + 1) * 8 })) },
    { key: "category:category", kind: "category", label: "category", unit: "次", points: [{ key: "学习", value: 7 }, { key: "收藏", value: 5 }, { key: "生活", value: 3 }] },
    { key: "monthly:durationMinutes", kind: "timeSeries", label: "durationMinutes", unit: "分钟", points: ["2026-04", "2026-05", "2026-06", "2026-07", "2026-08"].map((key, index) => ({ key, value: 40 + index * 24 })) },
  ]
  const requested = pack.views.flatMap((view) => [...(view.seriesKeys || []), ...(view.seriesKey ? [view.seriesKey] : [])])
  for (const key of requested) {
    if (baseSeries.some((series) => series.key === key)) continue
    const [prefix, label = key] = key.split(":", 2)
    const kind = prefix === "heatmap" ? "heatmap" : prefix === "category" ? "category" : prefix === "monthly" ? "timeSeries" : "kpi"
    const points = kind === "heatmap" ? dates.map((date, index) => ({ key: date, value: (index + 1) * 5 }))
      : kind === "timeSeries" ? ["2026-04", "2026-05", "2026-06", "2026-07", "2026-08"].map((month, index) => ({ key: month, value: 20 + index * 15 }))
        : kind === "category" ? [{ key: "示例 A", value: 7 }, { key: "示例 B", value: 4 }, { key: "示例 C", value: 2 }]
          : [{ key: label, value: 42 }]
    baseSeries.push({ key, kind, label, unit: kind === "timeSeries" || kind === "heatmap" ? "分钟" : "", points })
  }
  const analytics = { schemaVersion: 1, service, generatedAt: "2026-08-29T12:00:00Z", series: baseSeries }
    fixtures[service] = { catalog, analytics }
    await write(resolve(vault, "services", service, "首页.md"), renderDashboard(pack))
    await write(resolve(vault, ".notionhub", "catalog", `${service}.json`), JSON.stringify(catalog, null, 2) + "\n")
    await write(resolve(vault, ".notionhub", "analytics", `${service}.json`), JSON.stringify(analytics, null, 2) + "\n")
  }

  await write(resolve(samples, "fixtures.json"), JSON.stringify(fixtures, null, 2) + "\n")
  await write(resolve(samples, "showcase.html"), showcase())
  await write(resolve(samples, "service-showcase.html"), serviceShowcase())
}

async function write(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, content, "utf8")
}

function showcase(): string {
  const services = Object.values(TEMPLATE_PACKS).map((pack) => `<span style="--c:${pack.color}">${pack.icon} ${pack.label}</span>`).join("")
  const cells = Array.from({ length: 98 }, (_, index) => `<i style="opacity:${index % 9 === 0 ? .16 : .32 + (index % 5) * .14}"></i>`).join("")
  const cards = ["置身事内", "三体", "可能性的艺术", "现代中国的形成"].map((title, index) => `<article><div>${["经济", "科幻", "历史", "社会"][index]}</div><b>${title}</b><small>最近更新 · 2026-08-${29 - index}</small></article>`).join("")
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>ObsidianHub native templates</title><style>
  :root{font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#e7e9ee;background:#111318}*{box-sizing:border-box}body{margin:0;padding:42px;background:radial-gradient(circle at 85% 0,#26332b 0,transparent 35%),#111318}.shell{max-width:1180px;margin:auto}.eyebrow{color:#6ed17d;font-weight:700;letter-spacing:.08em;text-transform:uppercase}h1{font-size:clamp(30px,5vw,58px);margin:.25em 0 .2em}.sub{color:#a9aeba;max-width:760px;line-height:1.6}.services{display:flex;gap:8px;overflow:hidden;margin:24px 0}.services span{white-space:nowrap;border:1px solid color-mix(in srgb,var(--c) 55%,#343842);border-radius:999px;padding:7px 10px;background:#191c22}.grid{display:grid;grid-template-columns:1.25fr .75fr;gap:18px}.panel{background:#191c22;border:1px solid #2b3039;border-radius:18px;padding:20px;box-shadow:0 18px 45px #0005}.panel h2{margin:0 0 15px;font-size:17px}.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.kpi{border-left:4px solid #52b467;background:#22262d;border-radius:10px;padding:14px}.kpi b{font-size:25px;display:block}.kpi small,article small{color:#9299a7}.heat{display:grid;grid-template-rows:repeat(7,10px);grid-auto-flow:column;grid-auto-columns:10px;gap:3px;overflow:hidden}.heat i{background:#52b467;border-radius:2px}.gallery{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.gallery article{overflow:hidden;background:#22262d;border-radius:12px;border:1px solid #303640}.gallery article div{aspect-ratio:4/3;display:grid;place-items:center;background:linear-gradient(135deg,#30543a,#24312a);color:#bde5c4}.gallery b,.gallery small{display:block;padding:9px 10px 0}.gallery small{padding-top:3px;padding-bottom:11px}.chart{height:180px;display:flex;align-items:end;gap:9px;padding:12px 8px;border-bottom:1px solid #3a404b}.chart i{flex:1;border-radius:6px 6px 0 0;background:linear-gradient(#6ed17d,#377844);height:var(--h)}.donut{width:164px;aspect-ratio:1;border-radius:50%;margin:8px auto;background:conic-gradient(#52b467 0 42%,#8b5cf6 42% 70%,#f59e0b 70% 88%,#3b82f6 88%);display:grid;place-items:center}.donut:after{content:"分类";display:grid;place-items:center;width:96px;aspect-ratio:1;border-radius:50%;background:#191c22;color:#a9aeba}.wide{grid-column:1/-1}@media(max-width:600px){body{padding:20px 14px}.grid{grid-template-columns:1fr}.wide{grid-column:auto}.kpis,.gallery{grid-template-columns:repeat(2,1fr)}.services{margin-right:-14px}.panel{padding:15px}.gallery article:nth-child(n+3){display:none}}
  </style><body><main class="shell"><div class="eyebrow">ObsidianHub · Native Views</div><h1>22 套服务，一个原生分析体验</h1><p class="sub">参考 Notion 信息架构重新设计。无需 Dataview、Charts 或其他社区插件，桌面端和移动端使用同一份模板与数据契约。</p><div class="services">${services}</div><section class="grid"><div class="panel wide"><h2>📚 微信读书 · 阅读概览</h2><div class="kpis"><div class="kpi"><b>128</b><small>书架 · 本</small></div><div class="kpi"><b>6,420</b><small>阅读 · 分钟</small></div><div class="kpi"><b>862</b><small>划线 · 条</small></div><div class="kpi"><b>47</b><small>笔记 · 条</small></div></div></div><div class="panel"><h2>我的书架 · Gallery</h2><div class="gallery">${cards}</div></div><div class="panel"><h2>阅读热力图 · 2026</h2><div class="heat">${cells}</div></div><div class="panel"><h2>阅读时长 · Area / Line</h2><div class="chart">${[35,52,43,70,62,88,74,95].map(value=>`<i style="--h:${value}%"></i>`).join("")}</div></div><div class="panel"><h2>阅读分类 · Donut</h2><div class="donut"></div></div></section></main></body></html>\n`
}

function serviceShowcase(): string {
  const packs = JSON.stringify(TEMPLATE_PACKS).replace(/</g, "\\u003c")
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>ObsidianHub service template</title><style>
  :root{font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#e8eaf0;background:#111318}*{box-sizing:border-box}body{margin:0;padding:34px;background:radial-gradient(circle at 85% 0,color-mix(in srgb,var(--accent) 18%,transparent),transparent 42%),#111318}main{max-width:820px;margin:auto}.meta{color:var(--accent);font-weight:800;letter-spacing:.08em}h1{font-size:42px;margin:10px 0 4px}.desc{color:#9da4b1;margin:0 0 24px}.views{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.view{min-height:154px;padding:17px;border:1px solid #2e3440;border-radius:16px;background:#191c22}.view h2{font-size:17px;margin:0 0 15px}.type{float:right;color:#89919f;font-size:11px;text-transform:uppercase}.kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.kpis b{padding:14px;border-left:3px solid var(--accent);border-radius:8px;background:#23272f}.gallery{display:grid;grid-template-columns:repeat(4,1fr);gap:7px}.gallery i{height:78px;border-radius:8px;background:linear-gradient(145deg,color-mix(in srgb,var(--accent) 50%,#20242b),#242932)}.heat{display:grid;grid-template-rows:repeat(7,8px);grid-auto-flow:column;grid-auto-columns:8px;gap:3px}.heat i{border-radius:2px;background:var(--accent);opacity:var(--o)}.bars{height:92px;display:flex;align-items:end;gap:7px}.bars i{flex:1;height:var(--h);border-radius:5px 5px 0 0;background:linear-gradient(var(--accent),color-mix(in srgb,var(--accent) 45%,#222))}.donut{width:105px;aspect-ratio:1;margin:auto;border-radius:50%;background:conic-gradient(var(--accent) 0 42%,#8b5cf6 42% 70%,#f59e0b 70%);display:grid;place-items:center}.donut:after{content:"";width:58px;aspect-ratio:1;border-radius:50%;background:#191c22}.fallback{margin-top:18px;padding:13px;border-radius:10px;background:#20242b;color:#aab0bb}@media(max-width:520px){body{padding:20px 14px}h1{font-size:32px}.views{grid-template-columns:1fr}}
  </style><body><main><div class="meta">OBSIDIANHUB · NATIVE SERVICE TEMPLATE</div><h1 id="title"></h1><p class="desc" id="desc"></p><section class="views" id="views"></section><div class="fallback">Markdown fallback · [[_index|打开完整索引]] · 用户手写区不会被模板升级覆盖</div></main><script>
  const packs=${packs};const key=new URLSearchParams(location.search).get('service')||'weread';const pack=packs[key]||packs.weread;document.documentElement.style.setProperty('--accent',pack.color);document.querySelector('#title').textContent=pack.icon+' '+pack.label;document.querySelector('#desc').textContent=pack.service+' · '+pack.detailEntities.length+' 种实体详情布局 · 零第三方插件依赖';const cells=Array.from({length:70},(_,i)=>'<i style="--o:'+(0.18+(i%5)*0.16)+'"></i>').join('');const bars=[35,58,47,72,64,88,76].map(v=>'<i style="--h:'+v+'%"></i>').join('');document.querySelector('#views').innerHTML=pack.views.map((v,i)=>'<article class="view"><span class="type">'+v.type+'</span><h2>'+v.title+'</h2>'+(v.type==='kpi'?'<div class="kpis"><b>128</b><b>6,420</b><b>47</b></div>':v.type==='gallery'?'<div class="gallery"><i></i><i></i><i></i><i></i></div>':v.type==='heatmap'?'<div class="heat">'+cells+'</div>':v.type==='donut'?'<div class="donut"></div>':'<div class="bars">'+bars+'</div>')+'</article>').join('');
  </script></body></html>\n`
}
