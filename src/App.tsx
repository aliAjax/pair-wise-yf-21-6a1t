import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import "./styles.css";

const project = {
  "sourceNo": 2,
  "id": "hxyfront-62009",
  "port": 62009,
  "title": "地毯修复纹样档案",
  "domain": "手工地毯修复",
  "prompt": "做一个给手工地毯修复工作室使用的纹样与修复档案前端项目，可以记录地毯产地、年代、结密度、材质、染色类型、破损区域、补线颜色和修复工序。页面需要有纹样局部标记图、修复前后记录、材料色卡、工序进度和按产地筛选的档案列表。",
  "palette": [
    "#7c2d12",
    "#b45309",
    "#0f766e"
  ],
  "metrics": [
    "待修复",
    "纹样档案",
    "色卡数量",
    "完工率"
  ],
  "filters": [
    "波斯",
    "安纳托利亚",
    "高加索",
    "藏毯"
  ],
  "fields": [
    "地毯产地",
    "年代",
    "结密度",
    "材质",
    "染色类型",
    "破损区域"
  ],
  "records": [
    [
      "CAR-092",
      "波斯",
      "羊毛，约1960s",
      "边缘磨损待补线"
    ],
    [
      "CAR-117",
      "安纳托利亚",
      "植物染，结密度42",
      "中心纹样缺口"
    ],
    [
      "CAR-138",
      "藏毯",
      "局部褪色",
      "需匹配靛蓝色卡"
    ]
  ]
};

// ---------- 纹样临摹借调闭环 ----------

interface TouchUp {
  id: string;
  area: string;
  color: string;
  note: string;
}

interface Loan {
  id: string;
  sampleId: string;
  studio: string;
  start: string;
  end: string;
  returnedAt: string | null;
  touchUps: TouchUp[];
  reviewPassed: boolean;
}

type SampleStatus = "available" | "lent" | "scheduled" | "review";

// 档案卡即纹样样本，借调闭环直接引用档案编号，档案卡本身保持原样
const SAMPLES = project.records.map((record: string[]) => ({
  id: record[0],
  origin: record[1],
  desc: record[2],
  note: record[3],
}));

// 已登记借阅方（工作室）名录，未在名录内的借阅方一律拒绝
const STUDIOS = [
  "北京宫毯修复中心",
  "苏州经纬织补工作室",
  "西安丝路纹样工作室",
  "成都锦城织造坊",
];

const STORAGE_KEY = "hxyfront-62009:pattern-loans:v1";

const SEED_LOANS: Loan[] = [
  {
    id: "LN-001",
    sampleId: "CAR-117",
    studio: "北京宫毯修复中心",
    start: "2026-09-12",
    end: "2026-09-30",
    returnedAt: null,
    touchUps: [],
    reviewPassed: false,
  },
  {
    id: "LN-002",
    sampleId: "CAR-138",
    studio: "西安丝路纹样工作室",
    start: "2026-08-20",
    end: "2026-09-02",
    returnedAt: "2026-09-02",
    touchUps: [
      { id: "TU-001", area: "中心花头", color: "靛蓝 IND-05", note: "褪色区补色两遍" },
    ],
    reviewPassed: false,
  },
];

function todayStr(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function loadLoans(): Loan[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed as Loan[];
    }
  } catch {
    // 本地数据缺失或损坏时回退到初始排期
  }
  return SEED_LOANS;
}

// 状态推导：有待复核补色 -> 复核中；今天在借期内 -> 外借中；
// 仅有未来排期 -> 已预约；其余（含从未外借的旧纹样）-> 可外借
function sampleStatus(sampleId: string, loans: Loan[], today: string): SampleStatus {
  const related = loans.filter((l) => l.sampleId === sampleId);
  if (related.some((l) => l.returnedAt && l.touchUps.length > 0 && !l.reviewPassed)) {
    return "review";
  }
  const active = related.filter((l) => !l.returnedAt);
  if (active.some((l) => l.start <= today && today <= l.end)) return "lent";
  if (active.length > 0) return "scheduled";
  return "available";
}

function statusLabel(status: SampleStatus, everLent: boolean): string {
  switch (status) {
    case "lent":
      return "外借中";
    case "scheduled":
      return "已预约";
    case "review":
      return "复核中 · 暂停外借";
    default:
      return everLent ? "可外借" : "未外借";
  }
}

function StatusBadge({ status, everLent }: { status: SampleStatus; everLent: boolean }) {
  return <span className={`badge badge-${status}`}>{statusLabel(status, everLent)}</span>;
}

function newTouchUp(): TouchUp {
  return { id: `TU-${Date.now()}-${Math.round(Math.random() * 1e6)}`, area: "", color: "", note: "" };
}

function App() {
  const today = todayStr();
  const [origin, setOrigin] = useState<string>("全部");
  const [loans, setLoans] = useState<Loan[]>(loadLoans);

  // 借调申请表单
  const [appSample, setAppSample] = useState<string>(SAMPLES[0].id);
  const [appStudio, setAppStudio] = useState<string>("");
  const [appStart, setAppStart] = useState<string>("");
  const [appEnd, setAppEnd] = useState<string>("");
  const [appMsg, setAppMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // 归还表单
  const [returningId, setReturningId] = useState<string | null>(null);
  const [returnDate, setReturnDate] = useState<string>(today);
  const [draftTouchUps, setDraftTouchUps] = useState<TouchUp[]>([]);

  // 数据写浏览器本地，刷新后保留
  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(loans));
    } catch {
      // 本地存储不可用时仅保留本次会话状态
    }
  }, [loans]);

  const loansOf = (sampleId: string) => loans.filter((l) => l.sampleId === sampleId);
  const everLent = (sampleId: string) => loansOf(sampleId).length > 0;

  // 借调申请：借阅方未登记或起止时间与现有排期重叠时拒绝，样本/排期/档案卡保持原样
  function applyLoan(event: FormEvent) {
    event.preventDefault();
    const studio = appStudio.trim();
    if (!STUDIOS.includes(studio)) {
      setAppMsg({ ok: false, text: "申请已拒绝：借阅方未登记" });
      return;
    }
    if (!appStart || !appEnd) {
      setAppMsg({ ok: false, text: "申请已拒绝：请填写完整的起止时间" });
      return;
    }
    if (appStart > appEnd) {
      setAppMsg({ ok: false, text: "申请已拒绝：起始时间不能晚于结束时间" });
      return;
    }
    if (sampleStatus(appSample, loans, today) === "review") {
      setAppMsg({ ok: false, text: "申请已拒绝：样本复核中，暂停外借" });
      return;
    }
    const clash = loans.find(
      (l) => l.sampleId === appSample && !l.returnedAt && appStart <= l.end && appEnd >= l.start
    );
    if (clash) {
      setAppMsg({
        ok: false,
        text: `申请已拒绝：与 ${clash.studio} 的借调期（${clash.start} ~ ${clash.end}）重叠`,
      });
      return;
    }
    const loan: Loan = {
      id: `LN-${Date.now()}`,
      sampleId: appSample,
      studio,
      start: appStart,
      end: appEnd,
      returnedAt: null,
      touchUps: [],
      reviewPassed: false,
    };
    setLoans((prev) => [...prev, loan]);
    setAppMsg({ ok: true, text: `已受理：${appSample} 借调给 ${studio}（${appStart} ~ ${appEnd}）` });
    setAppStudio("");
    setAppStart("");
    setAppEnd("");
  }

  function openReturn(loanId: string) {
    setReturningId(loanId);
    setReturnDate(today);
    setDraftTouchUps([]);
  }

  // 归还确认：新增补色记录时样本自动进入复核并暂停外借
  function confirmReturn(loanId: string) {
    const touchUps = draftTouchUps.filter(
      (t) => t.area.trim() || t.color.trim() || t.note.trim()
    );
    setLoans((prev) =>
      prev.map((l) =>
        l.id === loanId ? { ...l, returnedAt: returnDate || today, touchUps } : l
      )
    );
    setReturningId(null);
    setDraftTouchUps([]);
  }

  // 复核通过后才重新开放外借
  function passReview(sampleId: string) {
    setLoans((prev) =>
      prev.map((l) =>
        l.sampleId === sampleId && l.returnedAt && l.touchUps.length > 0 && !l.reviewPassed
          ? { ...l, reviewPassed: true }
          : l
      )
    );
  }

  // 产地筛选：档案列表与样本状态同步过滤
  const filteredSamples = SAMPLES.filter((s) => origin === "全部" || s.origin === origin);
  const filteredRecords = project.records.filter(
    (r: string[]) => origin === "全部" || r[1] === origin
  );

  return (
    <main className="app">
      <section className="hero">
        <p>{project.id} · 源提示词{project.sourceNo} · Port {project.port}</p>
        <h1>{project.title}</h1>
        <span>{project.prompt}</span>
      </section>

      <section className="metrics">
        {project.metrics.map((metric: string, index: number) => (
          <article key={metric}>
            <small>{metric}</small>
            <strong>{[28, 6, 14, 91][index] ?? 10}</strong>
          </article>
        ))}
      </section>

      <section className="workspace">
        <aside className="panel">
          <h2>{project.domain}分类</h2>
          <div className="chips">
            {["全部", ...project.filters].map((item: string) => (
              <button
                key={item}
                className={origin === item ? "chip-active" : ""}
                onClick={() => setOrigin(item)}
              >
                {item}
              </button>
            ))}
          </div>
        </aside>

        <section className="panel form-panel">
          <div className="heading">
            <div>
              <p>专业字段</p>
              <h2>新增记录</h2>
            </div>
            <button className="primary">保存记录</button>
          </div>
          <div className="field-grid">
            {project.fields.map((field: string) => (
              <label key={field}>
                <span>{field}</span>
                <input placeholder={"填写" + field} />
              </label>
            ))}
          </div>
        </section>
      </section>

      <section className="panel loan-panel">
        <div className="heading">
          <div>
            <p>纹样临摹借调</p>
            <h2>借调闭环管理</h2>
          </div>
          <div className="studio-registry">
            <small>已登记借阅方</small>
            <div className="chips">
              {STUDIOS.map((studio) => (
                <span key={studio} className="studio-chip">{studio}</span>
              ))}
            </div>
          </div>
        </div>

        <div className="loan-grid">
          <form className="loan-form" onSubmit={applyLoan}>
            <h3>借调申请</h3>
            <label>
              <span>纹样样本</span>
              <select value={appSample} onChange={(e) => setAppSample(e.target.value)}>
                {SAMPLES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.id} · {s.origin}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>借阅方（须已登记）</span>
              <input
                list="studio-list"
                value={appStudio}
                onChange={(e) => setAppStudio(e.target.value)}
                placeholder="填写已登记工作室名称"
              />
              <datalist id="studio-list">
                {STUDIOS.map((studio) => (
                  <option key={studio} value={studio} />
                ))}
              </datalist>
            </label>
            <div className="date-row">
              <label>
                <span>起始时间</span>
                <input
                  type="date"
                  value={appStart}
                  onChange={(e) => setAppStart(e.target.value)}
                />
              </label>
              <label>
                <span>结束时间</span>
                <input
                  type="date"
                  value={appEnd}
                  onChange={(e) => setAppEnd(e.target.value)}
                />
              </label>
            </div>
            <button type="submit" className="primary">提交申请</button>
            {appMsg && (
              <p className={appMsg.ok ? "loan-msg ok" : "loan-msg err"}>{appMsg.text}</p>
            )}
          </form>

          <div className="sample-board">
            {filteredSamples.length === 0 && (
              <p className="empty-tip">当前产地暂无纹样样本</p>
            )}
            {filteredSamples.map((sample) => {
              const related = loansOf(sample.id);
              const status = sampleStatus(sample.id, loans, today);
              const activeLoans = related
                .filter((l) => !l.returnedAt)
                .sort((a, b) => a.start.localeCompare(b.start));
              const pendingReview = related.filter(
                (l) => l.returnedAt && l.touchUps.length > 0 && !l.reviewPassed
              );
              const history = related
                .filter((l) => l.returnedAt)
                .sort((a, b) => (b.returnedAt ?? "").localeCompare(a.returnedAt ?? ""));
              return (
                <article className="sample-card" key={sample.id}>
                  <header>
                    <div>
                      <h3>{sample.id}</h3>
                      <p>{sample.origin} · {sample.desc} · {sample.note}</p>
                    </div>
                    <StatusBadge status={status} everLent={everLent(sample.id)} />
                  </header>

                  {activeLoans.length === 0 && pendingReview.length === 0 && (
                    <p className="sample-tip">
                      {everLent(sample.id) ? "当前无外借，可提交借调申请。" : "旧纹样暂无借阅期，按未外借处理。"}
                    </p>
                  )}

                  {activeLoans.map((loan) => (
                    <div className="loan-row" key={loan.id}>
                      <div className="loan-info">
                        <b>{loan.studio}</b>
                        <span>{loan.start} ~ {loan.end}</span>
                      </div>
                      {returningId === loan.id ? (
                        <div className="return-form">
                          <label>
                            <span>归还日期</span>
                            <input
                              type="date"
                              value={returnDate}
                              onChange={(e) => setReturnDate(e.target.value)}
                            />
                          </label>
                          {draftTouchUps.map((t, i) => (
                            <div className="touchup-row" key={t.id}>
                              <input
                                placeholder="补色区域"
                                value={t.area}
                                onChange={(e) =>
                                  setDraftTouchUps((prev) =>
                                    prev.map((x, xi) => (xi === i ? { ...x, area: e.target.value } : x))
                                  )
                                }
                              />
                              <input
                                placeholder="补色色号"
                                value={t.color}
                                onChange={(e) =>
                                  setDraftTouchUps((prev) =>
                                    prev.map((x, xi) => (xi === i ? { ...x, color: e.target.value } : x))
                                  )
                                }
                              />
                              <input
                                placeholder="备注"
                                value={t.note}
                                onChange={(e) =>
                                  setDraftTouchUps((prev) =>
                                    prev.map((x, xi) => (xi === i ? { ...x, note: e.target.value } : x))
                                  )
                                }
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  setDraftTouchUps((prev) => prev.filter((_, xi) => xi !== i))
                                }
                              >
                                移除
                              </button>
                            </div>
                          ))}
                          <div className="return-actions">
                            <button
                              type="button"
                              onClick={() => setDraftTouchUps((prev) => [...prev, newTouchUp()])}
                            >
                              新增补色记录
                            </button>
                            <button
                              type="button"
                              className="primary"
                              onClick={() => confirmReturn(loan.id)}
                            >
                              确认归还
                            </button>
                            <button type="button" onClick={() => setReturningId(null)}>
                              取消
                            </button>
                          </div>
                          <small className="return-hint">
                            归还时新增补色记录，样本将自动进入复核并暂停外借。
                          </small>
                        </div>
                      ) : (
                        <button type="button" onClick={() => openReturn(loan.id)}>
                          办理归还
                        </button>
                      )}
                    </div>
                  ))}

                  {pendingReview.map((loan) => (
                    <div className="review-box" key={loan.id}>
                      <p>
                        归还新增补色记录 {loan.touchUps.length} 条，样本待复核，外借已暂停。
                      </p>
                      <ul>
                        {loan.touchUps.map((t) => (
                          <li key={t.id}>
                            {[t.area, t.color, t.note].filter(Boolean).join(" · ")}
                          </li>
                        ))}
                      </ul>
                      <button
                        type="button"
                        className="primary"
                        onClick={() => passReview(sample.id)}
                      >
                        复核通过，重新开放外借
                      </button>
                    </div>
                  ))}

                  {history.length > 0 && (
                    <div className="loan-history">
                      {history.map((l) => (
                        <p key={l.id}>
                          {l.studio} · {l.start} ~ {l.end} · 已于 {l.returnedAt} 归还
                          {l.touchUps.length > 0 &&
                            ` · 补色${l.touchUps.length}条 · ${l.reviewPassed ? "复核通过" : "待复核"}`}
                        </p>
                      ))}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="heading">
          <div>
            <p>近期记录</p>
            <h2>工作台摘要{origin !== "全部" ? ` · ${origin}` : ""}</h2>
          </div>
          <button>导出CSV</button>
        </div>
        <div className="records">
          {filteredRecords.length === 0 && (
            <p className="empty-tip">当前产地暂无档案记录</p>
          )}
          {filteredRecords.map((record: string[], index: number) => (
            <article key={record.join("-")}>
              <b>{String(index + 1).padStart(2, "0")}</b>
              <div>
                <h3>
                  {record[0]}
                  <StatusBadge
                    status={sampleStatus(record[0], loans, today)}
                    everLent={everLent(record[0])}
                  />
                </h3>
                <p>{record.slice(1).join(" · ")}</p>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

export default App;
