import { useEffect, useMemo, useRef, useState } from "react";
import "./styles.css";

const project = {
  sourceNo: 2,
  id: "hxyfront-62009",
  port: 62009,
  title: "地毯修复纹样档案",
  domain: "手工地毯修复",
  prompt:
    "做一个给手工地毯修复工作室使用的纹样与修复档案前端项目，可以记录地毯产地、年代、结密度、材质、染色类型、破损区域、补线颜色和修复工序。页面需要有纹样局部标记图、修复前后记录、材料色卡、工序进度和按产地筛选的档案列表。",
  palette: ["#7c2d12", "#b45309", "#0f766e"],
  filters: ["波斯", "安纳托利亚", "高加索", "藏毯"]
};

/* ------------------------------------------------------------------ */
/* 数据模型与本地存储                                                   */
/* ------------------------------------------------------------------ */

const STORAGE_KEY = "hxyfront-62009-archive-v1";
const ORIGINS = project.filters;

interface Sample {
  id: string;
  no: string; // 档案编号
  name: string; // 纹样名称
  origin: string; // 产地
  era: string; // 年代
  knotDensity: string; // 结密度
  material: string; // 材质
  dyeType: string; // 染色类型
  damagedArea: string; // 破损区域
  note: string;
  createdAt: string;
}

interface Studio {
  id: string;
  name: string;
  contact: string;
  createdAt: string;
}

type LoanStatus = "approved" | "rejected" | "returned";

interface Loan {
  id: string;
  code: string; // 借调单号
  sampleId: string;
  studioName: string; // 申请时快照
  startDate: string; // YYYY-MM-DD
  endDate: string;
  purpose: string;
  status: LoanStatus;
  createdAt: string;
  rejectReason?: string;
  actualReturnDate?: string;
  hasNewColor?: boolean; // 归还时是否新增补色记录
}

interface ColorRecord {
  id: string;
  sampleId: string;
  loanId: string;
  color: string;
  material: string;
  note: string;
  date: string;
}

interface Review {
  id: string;
  sampleId: string;
  loanId: string;
  reviewer: string;
  note: string;
  date: string;
}

interface ArchiveDB {
  version: 1;
  samples: Sample[];
  studios: Studio[];
  loans: Loan[];
  colorRecords: ColorRecord[];
  reviews: Review[];
}

type SampleStatus = "available" | "scheduled" | "lent" | "overdue" | "review";

const STATUS_META: Record<SampleStatus, { label: string; cls: string; hint: string }> = {
  available: { label: "在库可借", cls: "b-available", hint: "样本当前未被占用" },
  scheduled: { label: "已排期待借", cls: "b-scheduled", hint: "已有工作室预约借调" },
  lent: { label: "外借中", cls: "b-lent", hint: "借用期内由该工作室独占" },
  overdue: { label: "逾期未还", cls: "b-overdue", hint: "已超过计划归还日期" },
  review: { label: "复核中 · 暂停外借", cls: "b-review", hint: "归还时新增补色，复核通过后重新开放" }
};

function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function toDateStr(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function today(): string {
  return toDateStr(new Date());
}

function addDays(base: string, days: number): string {
  const d = new Date(`${base}T00:00:00`);
  d.setDate(d.getDate() + days);
  return toDateStr(d);
}

/** 起止区间是否重叠（含首尾同日） */
export function rangesOverlap(s1: string, e1: string, s2: string, e2: string): boolean {
  return s1 <= e2 && e1 >= s2;
}

export function seedDB(): ArchiveDB {
  const t = today();
  const mkStudio = (name: string, contact: string): Studio => ({
    id: uid(),
    name,
    contact,
    createdAt: t
  });
  return {
    version: 1,
    // 旧纹样没有任何借阅期，按「未外借」处理：直接推导为在库可借
    samples: [
      {
        id: uid(),
        no: "CAR-092",
        name: "波斯藤蔓纹残片",
        origin: "波斯",
        era: "约1960s",
        knotDensity: "36 结/英寸",
        material: "羊毛",
        dyeType: "植物染，局部化学染补线",
        damagedArea: "边缘磨损待补线",
        note: "临摹时需保留藤蔓走向与做旧层次。",
        createdAt: t
      },
      {
        id: uid(),
        no: "CAR-117",
        name: "安纳托利亚葵花纹样本",
        origin: "安纳托利亚",
        era: "约1930s",
        knotDensity: "42 结/英寸",
        material: "羊毛",
        dyeType: "植物染",
        damagedArea: "中心纹样缺口",
        note: "中心葵花瓣缺两瓣，补线颜色需对色卡。",
        createdAt: t
      },
      {
        id: uid(),
        no: "CAR-138",
        name: "藏毯靛蓝八宝纹样本",
        origin: "藏毯",
        era: "约1970s",
        knotDensity: "30 结/英寸",
        material: "羊毛",
        dyeType: "植物染（靛蓝）",
        damagedArea: "局部褪色",
        note: "需匹配靛蓝色卡，注意水洗牢度记录。",
        createdAt: t
      }
    ],
    studios: [
      mkStudio("赤陶文物修复工作室", "陶师傅 138-0000-0921"),
      mkStudio("青线摹织工作室", "林女士 139-0000-2246"),
      mkStudio("高原染织工坊", "扎西 137-0000-7715")
    ],
    loans: [],
    colorRecords: [],
    reviews: []
  };
}

function loadDB(): ArchiveDB {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as ArchiveDB;
      if (
        parsed &&
        Array.isArray(parsed.samples) &&
        Array.isArray(parsed.studios) &&
        Array.isArray(parsed.loans) &&
        Array.isArray(parsed.colorRecords) &&
        Array.isArray(parsed.reviews)
      ) {
        return parsed;
      }
    }
  } catch {
    // 存储损坏时回退到演示数据
  }
  return seedDB();
}

/* ------------------------------------------------------------------ */
/* 派生状态：样本状态完全由借调/复核记录推导，档案卡字段本身不被改动     */
/* ------------------------------------------------------------------ */

/** 已批准且未归还的借调（占用或排期）；缺少借阅期的旧记录视为未外借，不参与占用 */
export function openLoansOf(loans: Loan[]): Loan[] {
  return loans.filter((l) => l.status === "approved" && !!l.startDate && !!l.endDate);
}

export function pendingLoanOf(sampleId: string, loans: Loan[], reviews: Review[]): Loan | undefined {
  return loans
    .filter(
      (l) =>
        l.sampleId === sampleId &&
        l.status === "returned" &&
        l.hasNewColor &&
        !reviews.some((r) => r.loanId === l.id)
    )
    .sort((a, b) => (b.actualReturnDate ?? "").localeCompare(a.actualReturnDate ?? ""))[0];
}

export function deriveStatus(sampleId: string, loans: Loan[], reviews: Review[], now: string): SampleStatus {
  if (pendingLoanOf(sampleId, loans, reviews)) return "review";
  const open = openLoansOf(loans).filter((l) => l.sampleId === sampleId);
  if (open.some((l) => l.startDate <= now && now <= l.endDate)) return "lent";
  if (open.some((l) => l.endDate < now)) return "overdue";
  if (open.some((l) => l.startDate > now)) return "scheduled";
  return "available";
}

/* ------------------------------------------------------------------ */
/* 表单初始值                                                           */
/* ------------------------------------------------------------------ */

const emptySampleForm = {
  no: "",
  name: "",
  origin: ORIGINS[0],
  era: "",
  knotDensity: "",
  material: "",
  dyeType: "",
  damagedArea: "",
  note: ""
};

interface Notice {
  scope: "loan" | "sample" | "studio" | "archive" | "review";
  type: "ok" | "err";
  text: string;
}

interface ReturnDraft {
  open: boolean;
  hasColor: boolean;
  color: string;
  material: string;
  note: string;
}

function App() {
  const [db, setDB] = useState<ArchiveDB>(loadDB);
  const { samples, studios, loans, colorRecords, reviews } = db;

  const [originFilter, setOriginFilter] = useState<string>("全部");
  const now = today();

  const [loanForm, setLoanForm] = useState({
    sampleId: "",
    studioName: "",
    startDate: now,
    endDate: addDays(now, 7),
    purpose: ""
  });

  const [sampleForm, setSampleForm] = useState(emptySampleForm);
  const [studioForm, setStudioForm] = useState({ name: "", contact: "" });
  const [notice, setNotice] = useState<Notice | null>(null);
  const [returnDrafts, setReturnDrafts] = useState<Record<string, ReturnDraft>>({});
  const [reviewDrafts, setReviewDrafts] = useState<Record<string, { reviewer: string; note: string }>>({});

  const loanFormRef = useRef<HTMLElement | null>(null);
  const reviewRef = useRef<HTMLElement | null>(null);

  // 数据写入浏览器本地，刷新后保留
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
    } catch {
      // 隐私模式等场景下静默失败
    }
  }, [db]);

  /* ---------------- 派生数据 ---------------- */

  const statusBySample = useMemo(() => {
    const map: Record<string, SampleStatus> = {};
    for (const s of samples) map[s.id] = deriveStatus(s.id, loans, reviews, now);
    return map;
  }, [samples, loans, reviews, now]);

  const openLoans = useMemo(() => openLoansOf(loans), [loans]);

  const pendingLoans = useMemo(
    () =>
      loans
        .filter((l) => l.status === "returned" && l.hasNewColor && !reviews.some((r) => r.loanId === l.id))
        .sort((a, b) => (b.actualReturnDate ?? "").localeCompare(a.actualReturnDate ?? "")),
    [loans, reviews]
  );

  const scheduleLoans = useMemo(
    () => openLoans.slice().sort((a, b) => a.startDate.localeCompare(b.startDate)),
    [openLoans]
  );
  const returnedLoans = useMemo(
    () =>
      loans
        .filter((l) => l.status === "returned")
        .sort((a, b) => (b.actualReturnDate ?? "").localeCompare(a.actualReturnDate ?? "")),
    [loans]
  );
  const rejectedLoans = useMemo(
    () => loans.filter((l) => l.status === "rejected").sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [loans]
  );

  const originsWithCount = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of samples) counts[s.origin] = (counts[s.origin] ?? 0) + 1;
    return ORIGINS.map((o) => ({ origin: o, count: counts[o] ?? 0 }));
  }, [samples]);

  const filteredSamples = useMemo(
    () => (originFilter === "全部" ? samples : samples.filter((s) => s.origin === originFilter)),
    [samples, originFilter]
  );

  const sampleById = (id: string) => samples.find((s) => s.id === id);
  const activeLoanOfSample = (sampleId: string) =>
    openLoans.find((l) => l.sampleId === sampleId && l.startDate <= now);

  /* ---------------- 借调申请（闭环入口） ---------------- */

  const rejectApplication = (sampleId: string, reason: string) => {
    setDB((prev) => ({
      ...prev,
      loans: [
        ...prev.loans,
        {
          id: uid(),
          code: `JY-${String(prev.loans.length + 1).padStart(4, "0")}`,
          sampleId,
          studioName: loanForm.studioName.trim(),
          startDate: loanForm.startDate,
          endDate: loanForm.endDate,
          purpose: loanForm.purpose.trim(),
          status: "rejected",
          createdAt: now,
          rejectReason: reason
        }
      ]
    }));
    setNotice({
      scope: "loan",
      type: "err",
      text: `申请已拒绝：${reason} 样本、排期与档案卡均保持原样（仅登记一条未通过申请流水）。`
    });
  };

  const submitLoan = () => {
    const studioName = loanForm.studioName.trim();
    const { sampleId, startDate, endDate } = loanForm;

    if (!sampleId) {
      setNotice({ scope: "loan", type: "err", text: "请选择要借调临摹的纹样样本。" });
      return;
    }
    if (!studioName) {
      setNotice({ scope: "loan", type: "err", text: "请填写借阅工作室名称。" });
      return;
    }
    if (!startDate || !endDate) {
      setNotice({ scope: "loan", type: "err", text: "请填写完整的借调起止日期。" });
      return;
    }
    if (startDate > endDate) {
      setNotice({ scope: "loan", type: "err", text: "起始日期不能晚于计划归还日期。" });
      return;
    }

    const sample = sampleById(sampleId);
    if (!sample) {
      setNotice({ scope: "loan", type: "err", text: "所选样本不存在。" });
      return;
    }

    // 借阅方未登记 → 拒绝
    if (!studios.some((s) => s.name === studioName)) {
      rejectApplication(sampleId, `借阅工作室「${studioName}」未在档案中登记。`);
      return;
    }

    // 复核中 → 暂停外借
    if (statusBySample[sampleId] === "review") {
      rejectApplication(sampleId, `样本 ${sample.no} 正在复核，暂停外借。`);
      return;
    }

    // 同一纹样样本借用期内只能由一个工作室占用：起止时间重叠 → 拒绝
    const clash = openLoans.find(
      (l) => l.sampleId === sampleId && rangesOverlap(startDate, endDate, l.startDate, l.endDate)
    );
    if (clash) {
      rejectApplication(
        sampleId,
        `与现有排期重叠：${clash.startDate} 至 ${clash.endDate} 已由「${clash.studioName}」占用。`
      );
      return;
    }

    const code = `JY-${String(loans.length + 1).padStart(4, "0")}`;
    setDB((prev) => ({
      ...prev,
      loans: [
        ...prev.loans,
        {
          id: uid(),
          code,
          sampleId,
          studioName,
          startDate,
          endDate,
          purpose: loanForm.purpose.trim(),
          status: "approved",
          createdAt: now
        }
      ]
    }));
    setNotice({
      scope: "loan",
      type: "ok",
      text: `借调申请通过（单号 ${code}）：${sample.no} 自 ${startDate} 至 ${endDate} 由「${studioName}」独占借用。`
    });
    setLoanForm((f) => ({ ...f, studioName: "", purpose: "" }));
  };

  /* ---------------- 归还（补色 → 自动复核） ---------------- */

  const updateReturnDraft = (loanId: string, patch: Partial<ReturnDraft>) => {
    setReturnDrafts((prev) => {
      const base: ReturnDraft = prev[loanId] ?? { open: true, hasColor: false, color: "", material: "", note: "" };
      return { ...prev, [loanId]: { ...base, ...patch } };
    });
  };

  const submitReturn = (loanId: string) => {
    const loan = loans.find((l) => l.id === loanId);
    if (!loan) return;
    const draft = returnDrafts[loanId];
    if (draft?.hasColor && !draft.color.trim()) {
      setNotice({ scope: "archive", type: "err", text: "已勾选新增补色记录，请填写补线颜色。" });
      return;
    }

    const hasColor = !!draft?.hasColor;
    setDB((prev) => {
      const nextColorRecords = hasColor
        ? [
            ...prev.colorRecords,
            {
              id: uid(),
              sampleId: loan.sampleId,
              loanId,
              color: draft!.color.trim(),
              material: draft!.material.trim(),
              note: draft!.note.trim(),
              date: now
            }
          ]
        : prev.colorRecords;
      return {
        ...prev,
        colorRecords: nextColorRecords,
        loans: prev.loans.map((l) =>
          l.id === loanId
            ? { ...l, status: "returned", actualReturnDate: now, hasNewColor: hasColor }
            : l
        )
      };
    });
    setReturnDrafts((prev) => {
      const next = { ...prev };
      delete next[loanId];
      return next;
    });
    const sample = sampleById(loan.sampleId);
    setNotice(
      hasColor
        ? {
            scope: "archive",
            type: "ok",
            text: `${sample?.no ?? "样本"} 已归还并登记补色记录，样本自动进入复核、暂停外借；仅复核通过后重新开放。`
          }
        : {
            scope: "archive",
            type: "ok",
            text: `${sample?.no ?? "样本"} 已归还，无新增补色记录，样本重新开放外借。`
          }
    );
  };

  /* ---------------- 复核通过 → 重新开放 ---------------- */

  const submitReview = (loanId: string) => {
    const loan = loans.find((l) => l.id === loanId);
    if (!loan) return;
    const draft = reviewDrafts[loanId];
    setDB((prev) => ({
      ...prev,
      reviews: [
        ...prev.reviews,
        {
          id: uid(),
          sampleId: loan.sampleId,
          loanId,
          reviewer: draft?.reviewer.trim() || "档案管理员",
          note: draft?.note.trim() || "补色与原色卡核对一致，同意重新开放。",
          date: now
        }
      ]
    }));
    setReviewDrafts((prev) => {
      const next = { ...prev };
      delete next[loanId];
      return next;
    });
    const sample = sampleById(loan.sampleId);
    setNotice({
      scope: "review",
      type: "ok",
      text: `${sample?.no ?? "样本"} 复核通过，已解除暂停，重新开放外借。`
    });
  };

  /* ---------------- 档案卡与工作室登记 ---------------- */

  const submitSample = () => {
    if (!sampleForm.no.trim() || !sampleForm.name.trim()) {
      setNotice({ scope: "sample", type: "err", text: "档案编号与纹样名称为必填项。" });
      return;
    }
    if (samples.some((s) => s.no === sampleForm.no.trim())) {
      setNotice({ scope: "sample", type: "err", text: `编号 ${sampleForm.no.trim()} 已存在，请核对档案卡。` });
      return;
    }
    const f = sampleForm;
    setDB((prev) => ({
      ...prev,
      samples: [
        ...prev.samples,
        {
          id: uid(),
          no: f.no.trim(),
          name: f.name.trim(),
          origin: f.origin,
          era: f.era.trim(),
          knotDensity: f.knotDensity.trim(),
          material: f.material.trim(),
          dyeType: f.dyeType.trim(),
          damagedArea: f.damagedArea.trim(),
          note: f.note.trim(),
          createdAt: now
        }
      ]
    }));
    setSampleForm(emptySampleForm);
    setNotice({ scope: "sample", type: "ok", text: "档案卡已登记并同步到档案列表。" });
  };

  const submitStudio = () => {
    const name = studioForm.name.trim();
    if (!name) {
      setNotice({ scope: "studio", type: "err", text: "请填写工作室名称。" });
      return;
    }
    if (studios.some((s) => s.name === name)) {
      setNotice({ scope: "studio", type: "err", text: `「${name}」已登记。` });
      return;
    }
    setDB((prev) => ({
      ...prev,
      studios: [...prev.studios, { id: uid(), name, contact: studioForm.contact.trim(), createdAt: now }]
    }));
    setStudioForm({ name: "", contact: "" });
    setNotice({ scope: "studio", type: "ok", text: `「${name}」已登记，可提交借调申请。` });
  };

  /* ---------------- 导出与重置 ---------------- */

  const exportCSV = () => {
    const header = ["编号", "名称", "产地", "年代", "结密度", "材质", "染色类型", "破损区域", "当前状态", "占用工作室", "备注"];
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const lines = filteredSamples.map((s) => {
      const status = STATUS_META[statusBySample[s.id]].label;
      const holder = activeLoanOfSample(s.id)?.studioName ?? "";
      return [s.no, s.name, s.origin, s.era, s.knotDensity, s.material, s.dyeType, s.damagedArea, status, holder, s.note]
        .map(esc)
        .join(",");
    });
    const csv = "﻿" + [header.map(esc).join(","), ...lines].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `纹样档案-${now}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const resetDemo = () => {
    if (window.confirm("确定清空当前借调数据并恢复演示档案？此操作不可撤销。")) {
      setDB(seedDB());
      setReturnDrafts({});
      setReviewDrafts({});
      setOriginFilter("全部");
      setNotice({ scope: "archive", type: "ok", text: "已恢复演示数据。" });
    }
  };

  const preselectSample = (sampleId: string) => {
    setLoanForm((f) => ({ ...f, sampleId }));
    loanFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  /* ---------------- 渲染 ---------------- */

  const banner = (scope: Notice["scope"]) =>
    notice && notice.scope === scope ? (
      <div className={`banner ${notice.type}`} role="status">
        {notice.text}
        <button className="banner-close" type="button" onClick={() => setNotice(null)} aria-label="关闭提示">
          ×
        </button>
      </div>
    ) : null;

  const metrics = [
    { label: "待修复", value: samples.filter((s) => s.damagedArea.trim()).length },
    { label: "纹样档案", value: samples.length },
    { label: "色卡数量", value: colorRecords.length },
    { label: "可借纹样", value: samples.filter((s) => statusBySample[s.id] === "available").length }
  ];

  return (
    <main className="app">
      <section className="hero">
        <p>{project.id} · 源提示词{project.sourceNo} · Port {project.port}</p>
        <h1>{project.title}</h1>
        <span>{project.prompt}</span>
      </section>

      <section className="metrics">
        {metrics.map((m) => (
          <article key={m.label}>
            <small>{m.label}</small>
            <strong>{m.value}</strong>
          </article>
        ))}
      </section>

      <section className="workspace">
        <aside className="panel">
          <h2>{project.domain}分类</h2>
          <div className="chips">
            <button
              type="button"
              className={originFilter === "全部" ? "chip active" : "chip"}
              onClick={() => setOriginFilter("全部")}
            >
              全部 <em>{samples.length}</em>
            </button>
            {originsWithCount.map(({ origin, count }) => (
              <button
                key={origin}
                type="button"
                className={originFilter === origin ? "chip active" : "chip"}
                onClick={() => setOriginFilter(origin)}
              >
                {origin} <em>{count}</em>
              </button>
            ))}
          </div>
          <p className="muted filter-hint">产地筛选与档案列表、样本状态实时同步。</p>

          <hr className="divider" />

          <h2>登记工作室</h2>
          <p className="muted small">借阅方须先登记；未登记名称提交借调申请时将被拒绝。</p>
          <div className="stack">
            <input
              placeholder="工作室名称"
              value={studioForm.name}
              onChange={(e) => setStudioForm((f) => ({ ...f, name: e.target.value }))}
            />
            <input
              placeholder="联系人 / 联系方式（选填）"
              value={studioForm.contact}
              onChange={(e) => setStudioForm((f) => ({ ...f, contact: e.target.value }))}
            />
            <button type="button" className="primary" onClick={submitStudio}>
              登记工作室
            </button>
          </div>
          {banner("studio")}
          <ul className="studio-list">
            {studios.map((s) => (
              <li key={s.id}>
                <b>{s.name}</b>
                {s.contact && <span>{s.contact}</span>}
              </li>
            ))}
          </ul>
        </aside>

        <section className="panel form-panel" ref={loanFormRef}>
          <div className="heading">
            <div>
              <p>临摹借调闭环</p>
              <h2>纹样借调申请</h2>
            </div>
            <span className="rule-tag">同一借用期内仅一个工作室占用</span>
          </div>
          <div className="field-grid">
            <label className="col-2">
              <span>纹样样本</span>
              <select
                value={loanForm.sampleId}
                onChange={(e) => setLoanForm((f) => ({ ...f, sampleId: e.target.value }))}
              >
                <option value="">请选择样本</option>
                {samples.map((s) => {
                  const st = statusBySample[s.id];
                  return (
                    <option key={s.id} value={s.id} disabled={st === "review"}>
                      {s.no} · {s.name}（{STATUS_META[st].label}）
                    </option>
                  );
                })}
              </select>
            </label>
            <label className="col-2">
              <span>借阅工作室（未登记将直接拒绝）</span>
              <input
                list="registered-studios"
                placeholder="填写或选择已登记工作室"
                value={loanForm.studioName}
                onChange={(e) => setLoanForm((f) => ({ ...f, studioName: e.target.value }))}
              />
              <datalist id="registered-studios">
                {studios.map((s) => (
                  <option key={s.id} value={s.name} />
                ))}
              </datalist>
            </label>
            <label>
              <span>借用起始日期</span>
              <input
                type="date"
                value={loanForm.startDate}
                onChange={(e) => setLoanForm((f) => ({ ...f, startDate: e.target.value }))}
              />
            </label>
            <label>
              <span>计划归还日期</span>
              <input
                type="date"
                value={loanForm.endDate}
                min={loanForm.startDate}
                onChange={(e) => setLoanForm((f) => ({ ...f, endDate: e.target.value }))}
              />
            </label>
            <label className="col-2">
              <span>临摹用途说明（选填）</span>
              <input
                placeholder="如：中心葵花瓣补线前的纹样临摹"
                value={loanForm.purpose}
                onChange={(e) => setLoanForm((f) => ({ ...f, purpose: e.target.value }))}
              />
            </label>
          </div>
          <div className="form-actions">
            <button type="button" className="primary" onClick={submitLoan}>
              提交借调申请
            </button>
          </div>
          {banner("loan")}
        </section>
      </section>

      {pendingLoans.length > 0 && (
        <section className="panel review-panel" ref={reviewRef}>
          <div className="heading">
            <div>
              <p>归还补色复核</p>
              <h2>待复核样本（{pendingLoans.length}）· 暂停外借</h2>
            </div>
          </div>
          {banner("review")}
          <div className="review-grid">
            {pendingLoans.map((loan) => {
              const sample = sampleById(loan.sampleId);
              const draft = reviewDrafts[loan.id] ?? { reviewer: "", note: "" };
              const colors = colorRecords.filter((c) => c.loanId === loan.id);
              return (
                <article key={loan.id} className="review-card">
                  <h3>
                    {sample?.no} · {sample?.name}
                  </h3>
                  <p className="muted">
                    归还于 {loan.actualReturnDate}，借调方「{loan.studioName}」，归还时登记了补色记录：
                  </p>
                  <ul className="color-list">
                    {colors.map((c) => (
                      <li key={c.id}>
                        <i className="swatch" style={{ background: c.color }} title={c.color} />
                        <b>{c.color}</b>
                        {c.material && <span>{c.material}</span>}
                        {c.note && <span>{c.note}</span>}
                      </li>
                    ))}
                  </ul>
                  <div className="stack">
                    <input
                      placeholder="复核人（默认：档案管理员）"
                      value={draft.reviewer}
                      onChange={(e) =>
                        setReviewDrafts((p) => ({ ...p, [loan.id]: { ...draft, reviewer: e.target.value } }))
                      }
                    />
                    <input
                      placeholder="复核意见（选填）"
                      value={draft.note}
                      onChange={(e) =>
                        setReviewDrafts((p) => ({ ...p, [loan.id]: { ...draft, note: e.target.value } }))
                      }
                    />
                    <button type="button" className="primary" onClick={() => submitReview(loan.id)}>
                      复核通过，重新开放外借
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}

      <section className="panel">
        <div className="heading">
          <div>
            <p>档案列表{originFilter !== "全部" ? ` · ${originFilter}` : ""}</p>
            <h2>
              纹样样本档案（{filteredSamples.length}/{samples.length}）
            </h2>
          </div>
          <div className="heading-actions">
            <button type="button" onClick={exportCSV}>
              导出CSV
            </button>
            <button type="button" onClick={resetDemo}>
              恢复演示数据
            </button>
          </div>
        </div>
        {banner("archive")}
        <div className="records">
          {filteredSamples.map((s) => {
            const st = statusBySample[s.id];
            const current = activeLoanOfSample(s.id);
            const pending = pendingLoanOf(s.id, loans, reviews);
            const upcoming = openLoans.find((l) => l.sampleId === s.id && l.startDate > now);
            const draft = returnDrafts[current?.id ?? ""];
            return (
              <article key={s.id} className="record-card">
                <b>{s.no}</b>
                <div className="record-body">
                  <div className="record-head">
                    <h3>{s.name}</h3>
                    <span className={`badge ${STATUS_META[st].cls}`}>{STATUS_META[st].label}</span>
                  </div>
                  <p>
                    {[s.origin, s.era, s.knotDensity, s.material, s.dyeType].filter(Boolean).join(" · ")}
                  </p>
                  {s.damagedArea && <p className="damage">破损区域：{s.damagedArea}</p>}
                  {s.note && <p className="muted small">{s.note}</p>}

                  {st === "review" && pending && (
                    <p className="loan-line review-line">
                      归还补色待复核（{pending.actualReturnDate}，「{pending.studioName}」），期间暂停外借
                      <button
                        type="button"
                        className="link-btn"
                        onClick={() => reviewRef.current?.scrollIntoView({ behavior: "smooth" })}
                      >
                        前往复核 →
                      </button>
                    </p>
                  )}
                  {(st === "lent" || st === "overdue") && current && (
                    <p className="loan-line">
                      占用方：「{current.studioName}」 · {current.startDate} 至 {current.endDate}
                      {current.purpose && <span className="muted">（{current.purpose}）</span>}
                    </p>
                  )}
                  {st === "scheduled" && upcoming && (
                    <p className="loan-line">
                      排期：{upcoming.startDate} 至 {upcoming.endDate} ·「{upcoming.studioName}」
                    </p>
                  )}

                  <div className="row-actions">
                    {st === "available" && (
                      <button type="button" className="primary small-btn" onClick={() => preselectSample(s.id)}>
                        申请借调
                      </button>
                    )}
                    {(st === "lent" || st === "overdue") && current && (
                      <>
                        {!draft?.open ? (
                          <button
                            type="button"
                            className="small-btn"
                            onClick={() => updateReturnDraft(current.id, { open: true })}
                          >
                            登记归还
                          </button>
                        ) : (
                          <div className="inline-form">
                            <label className="check-line">
                              <input
                                type="checkbox"
                                checked={draft.hasColor}
                                onChange={(e) =>
                                  updateReturnDraft(current.id, { hasColor: e.target.checked })
                                }
                              />
                              <span>本次临摹新增了补色记录（勾选后样本进入复核并暂停外借）</span>
                            </label>
                            {draft.hasColor && (
                              <div className="field-grid compact">
                                <input
                                  placeholder="补线颜色，如 靛蓝 #2f4b7c"
                                  value={draft.color}
                                  onChange={(e) =>
                                    updateReturnDraft(current.id, { color: e.target.value })
                                  }
                                />
                                <input
                                  placeholder="色卡编号 / 线材材质（选填）"
                                  value={draft.material}
                                  onChange={(e) =>
                                    updateReturnDraft(current.id, { material: e.target.value })
                                  }
                                />
                                <input
                                  className="col-2"
                                  placeholder="补色说明（选填）"
                                  value={draft.note}
                                  onChange={(e) =>
                                    updateReturnDraft(current.id, { note: e.target.value })
                                  }
                                />
                              </div>
                            )}
                            <div className="heading-actions">
                              <button type="button" className="primary small-btn" onClick={() => submitReturn(current.id)}>
                                确认归还
                              </button>
                              <button
                                type="button"
                                className="small-btn"
                                onClick={() =>
                                  setReturnDrafts((p) => {
                                    const next = { ...p };
                                    delete next[current.id];
                                    return next;
                                  })
                                }
                              >
                                取消
                              </button>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                    {st === "review" && (
                      <button
                        type="button"
                        className="small-btn"
                        onClick={() => reviewRef.current?.scrollIntoView({ behavior: "smooth" })}
                      >
                        复核入口
                      </button>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
          {filteredSamples.length === 0 && <p className="muted">该产地下暂无档案，可在下方新增档案卡。</p>}
        </div>
      </section>

      <section className="workspace bottom-workspace">
        <section className="panel form-panel">
          <div className="heading">
            <div>
              <p>专业字段</p>
              <h2>新增档案卡</h2>
            </div>
          </div>
          <div className="field-grid">
            <label>
              <span>档案编号</span>
              <input
                placeholder="如 CAR-152"
                value={sampleForm.no}
                onChange={(e) => setSampleForm((f) => ({ ...f, no: e.target.value }))}
              />
            </label>
            <label>
              <span>纹样名称</span>
              <input
                placeholder="如 高加索星纹残片"
                value={sampleForm.name}
                onChange={(e) => setSampleForm((f) => ({ ...f, name: e.target.value }))}
              />
            </label>
            <label>
              <span>地毯产地</span>
              <select
                value={sampleForm.origin}
                onChange={(e) => setSampleForm((f) => ({ ...f, origin: e.target.value }))}
              >
                {ORIGINS.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>年代</span>
              <input
                placeholder="填写年代"
                value={sampleForm.era}
                onChange={(e) => setSampleForm((f) => ({ ...f, era: e.target.value }))}
              />
            </label>
            <label>
              <span>结密度</span>
              <input
                placeholder="填写结密度"
                value={sampleForm.knotDensity}
                onChange={(e) => setSampleForm((f) => ({ ...f, knotDensity: e.target.value }))}
              />
            </label>
            <label>
              <span>材质</span>
              <input
                placeholder="填写材质"
                value={sampleForm.material}
                onChange={(e) => setSampleForm((f) => ({ ...f, material: e.target.value }))}
              />
            </label>
            <label>
              <span>染色类型</span>
              <input
                placeholder="填写染色类型"
                value={sampleForm.dyeType}
                onChange={(e) => setSampleForm((f) => ({ ...f, dyeType: e.target.value }))}
              />
            </label>
            <label>
              <span>破损区域</span>
              <input
                placeholder="填写破损区域"
                value={sampleForm.damagedArea}
                onChange={(e) => setSampleForm((f) => ({ ...f, damagedArea: e.target.value }))}
              />
            </label>
            <label className="col-2">
              <span>临摹 / 修复备注（选填）</span>
              <input
                placeholder="填写备注"
                value={sampleForm.note}
                onChange={(e) => setSampleForm((f) => ({ ...f, note: e.target.value }))}
              />
            </label>
          </div>
          <div className="form-actions">
            <button type="button" className="primary" onClick={submitSample}>
              保存档案卡
            </button>
          </div>
          {banner("sample")}
        </section>
      </section>

      <section className="panel">
        <div className="heading">
          <div>
            <p>近期记录</p>
            <h2>借调排期与闭环记录</h2>
          </div>
        </div>

        <h3 className="subhead">当前排期（{scheduleLoans.length}）</h3>
        <div className="loan-table">
          {scheduleLoans.map((l) => {
            const s = sampleById(l.sampleId);
            const phase =
              l.startDate <= now && now <= l.endDate
                ? { label: "占用中", cls: "b-lent" }
                : l.endDate < now
                  ? { label: "已超期", cls: "b-overdue" }
                  : { label: "待出库", cls: "b-scheduled" };
            return (
              <div className="loan-row" key={l.id}>
                <span className={`badge ${phase.cls}`}>{phase.label}</span>
                <b>
                  {s?.no} · {s?.name}
                </b>
                <span>「{l.studioName}」</span>
                <span className="muted">
                  {l.startDate} → {l.endDate}
                </span>
                <span className="muted">{l.code}</span>
              </div>
            );
          })}
          {scheduleLoans.length === 0 && <p className="muted">暂无占用或排期，所有未复核样本均可申请。</p>}
        </div>

        <h3 className="subhead">已归还记录（{returnedLoans.length}）</h3>
        <div className="loan-table">
          {returnedLoans.map((l) => {
            const s = sampleById(l.sampleId);
            const review = reviews.find((r) => r.loanId === l.id);
            return (
              <div className="loan-row" key={l.id}>
                <span className={`badge ${review ? "b-available" : "b-review"}`}>
                  {review ? `复核通过 ${review.date}` : "待复核"}
                </span>
                <b>
                  {s?.no} · {s?.name}
                </b>
                <span>「{l.studioName}」</span>
                <span className="muted">
                  计划 {l.startDate} → {l.endDate}
                </span>
                <span className="muted">
                  实际归还 {l.actualReturnDate} · {l.hasNewColor ? "有新增补色" : "无补色"}
                </span>
              </div>
            );
          })}
          {returnedLoans.length === 0 && <p className="muted">暂无归还记录。</p>}
        </div>

        <h3 className="subhead">未通过申请（{rejectedLoans.length}）</h3>
        <div className="loan-table">
          {rejectedLoans.map((l) => {
            const s = sampleById(l.sampleId);
            return (
              <div className="loan-row rejected" key={l.id}>
                <span className="badge b-overdue">已拒绝</span>
                <b>
                  {s?.no ?? "样本已移除"} · {s?.name ?? ""}
                </b>
                <span>「{l.studioName}」</span>
                <span className="muted">
                  申请 {l.startDate} → {l.endDate}
                </span>
                <span>{l.rejectReason}</span>
              </div>
            );
          })}
          {rejectedLoans.length === 0 && <p className="muted">暂无被拒绝的申请。</p>}
        </div>
      </section>
    </main>
  );
}

export default App;
