import React, { useState, useEffect } from "react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  PieChart, Pie, Cell, BarChart, Bar,
} from "recharts";
import { ArrowUpRight, ArrowDownRight, Fingerprint, Loader2, CalendarRange, Layers } from "lucide-react";
import { useTheme, fontDisplay, fontMono } from "../theme.jsx";
import { dashboardApi } from "../api/resources.js";

const pkr = (n) => "₨ " + Math.round(n).toLocaleString("en-PK");

// Filter pills shown at the top of the dashboard. "custom" reveals an
// inline date range picker in the same row instead of firing immediately.
const FILTERS = [
  { key: "today", label: "Today" },
  { key: "thisMonth", label: "This Mo" },
  { key: "lastMonth", label: "Last Mo" },
  { key: "all", label: "All" },
  { key: "custom", label: "Custom" },
];

const FILTER_LABELS = {
  today: "Today",
  thisMonth: "This Month",
  lastMonth: "Last Month",
  all: "All Time",
  custom: "Custom Range",
};

export default function Dashboard() {
  const { C } = useTheme();
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [filter, setFilter] = useState("thisMonth");
  const [customRange, setCustomRange] = useState({ start: "", end: "" });

  useEffect(() => {
    const params = { filter };
    if (filter === "custom") {
      // Wait until both custom dates are picked before hitting the API.
      if (!customRange.start || !customRange.end) return;
      params.startDate = customRange.start;
      params.endDate = customRange.end;
    }

    // Cancel any still-in-flight request from a previous filter click —
    // without this, clicking "Today" then quickly "This Month" could have
    // the slower "Today" response land LAST and overwrite the correct
    // "This Month" data on screen. Also means a fast typer flipping through
    // filters doesn't pile up N parallel requests.
    const controller = new AbortController();
    setLoading(true);
    setError("");
    dashboardApi
      .summary(params, controller.signal)
      .then(setSummary)
      .catch((err) => {
        if (err.name === "AbortError") return; // superseded by a newer filter click, not a real error
        setError(err.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [filter, customRange.start, customRange.end]);

  // Cash in Hand follows the selected filter, same as the Cash In / Cash
  // Out breakdown beside it.
  const cashInHand = summary?.cashInHand || 0;

  const MIX_COLORS = { "Paid Internship": C.gold, Workspace: C.teal, "Free Internship": C.rose };
  const studentMix = (summary?.studentMix || []).map((s) => ({ ...s, color: MIX_COLORS[s.name] }));
  const totalStudentsInMix = studentMix.reduce((s, m) => s + m.value, 0);

  // Batch breakdown — how many active students are in each batch. Backend
  // already sorts largest-first with "Unassigned" pushed to the end.
  const batchMix = summary?.batchMix || [];
  const totalBatchedStudents = batchMix.reduce((s, b) => s + b.value, 0);

  // Tailwind's shadow-sm/shadow-md are near-invisible on a dark panel over
  // a black page background (both sides of the shadow are already dark).
  // Depth here comes from a faint top rim-light (like light catching an
  // edge) plus a soft dark ambient shadow that still reads against black.
  const Card = ({ children, className = "", style = {} }) => (
    <div
      className={`rounded-2xl border transition-shadow duration-200 ${className}`}
      style={{
        background: C.panel,
        borderColor: C.line,
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05), 0 12px 28px -16px rgba(0,0,0,0.6)",
        ...style,
      }}
    >
      {children}
    </div>
  );

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload || !payload.length) return null;
    return (
      <div className="rounded-lg border px-3 py-2 text-xs shadow-lg" style={{ background: C.panelSoft, borderColor: C.line, color: C.textHi, ...fontMono }}>
        <div className="mb-1" style={{ color: C.textMid }}>{label}</div>
        {payload.map((p) => (
          <div key={p.dataKey} className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: p.dataKey === "in" ? C.gold : C.rose }} />
            <span>{p.dataKey === "in" ? "Cash In" : "Cash Out"}: {pkr(p.value)}</span>
          </div>
        ))}
      </div>
    );
  };

  // Filter bar: a single-row segmented control. When "Custom" is active,
  // the date pickers sit inline in the SAME row (wrapping only if the
  // viewport is too narrow to fit everything).
  const FilterBar = () => (
    <div className="fade-up">
      {filter === "custom" && (
        <style>{`
          .date-input { color-scheme: light; }
          .date-input::-webkit-calendar-picker-indicator {
            cursor: pointer;
            opacity: 0.55;
            filter: invert(38%) sepia(64%) saturate(454%) hue-rotate(133deg);
          }
          .date-input::-webkit-calendar-picker-indicator:hover { opacity: 1; }
        `}</style>
      )}
      <div className="flex flex-wrap items-center gap-2.5">
        <div
          className="flex items-center gap-1 rounded-full p-1 shadow-sm"
          style={{ background: C.panelSoft, border: `1px solid ${C.line}` }}
        >
          {FILTERS.map((f) => {
            const active = filter === f.key;
            return (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className="text-xs font-semibold px-3.5 py-1.5 rounded-full transition-all duration-150"
                style={{
                  background: active ? C.teal : "transparent",
                  color: active ? "#fff" : C.textMid,
                  boxShadow: active ? `0 4px 14px -2px ${C.teal}80` : "none",
                }}
              >
                {f.label}
              </button>
            );
          })}
        </div>

        {filter === "custom" && (
          <div className="flex flex-nowrap items-center gap-2 overflow-x-auto">
            <div className="flex items-center gap-1.5 rounded-full pl-3 pr-2 py-1.5 shrink-0" style={{ background: C.panel, border: `1px solid ${C.line}` }}>
              <CalendarRange size={13} style={{ color: C.teal }} />
              <span className="text-xs font-medium" style={{ color: C.textLow }}>From</span>
              <input
                type="date"
                value={customRange.start}
                max={customRange.end || undefined}
                onChange={(e) => setCustomRange((r) => ({ ...r, start: e.target.value }))}
                className="date-input"
                style={{ background: "transparent", border: "none", color: C.textHi, accentColor: C.teal, fontSize: "0.8rem", outline: "none", width: 118, ...fontMono }}
              />
            </div>
            <div className="flex items-center gap-1.5 rounded-full pl-3 pr-2 py-1.5 shrink-0" style={{ background: C.panel, border: `1px solid ${C.line}` }}>
              <span className="text-xs font-medium" style={{ color: C.textLow }}>To</span>
              <input
                type="date"
                value={customRange.end}
                min={customRange.start || undefined}
                onChange={(e) => setCustomRange((r) => ({ ...r, end: e.target.value }))}
                className="date-input"
                style={{ background: "transparent", border: "none", color: C.textHi, accentColor: C.teal, fontSize: "0.8rem", outline: "none", width: 118, ...fontMono }}
              />
            </div>
            {(!customRange.start || !customRange.end) && (
              <span className="text-xs shrink-0" style={{ color: C.textLow }}>Pick both dates to apply</span>
            )}
          </div>
        )}
      </div>
    </div>
  );

  // Skeleton block — a pulsing placeholder shaped like real content, used
  // both for the very first load and (smaller/inline) while a filter
  // change is in flight, so the page never feels like it "went blank".
  const Skel = ({ className = "", style = {} }) => (
    <div
      className={`animate-pulse rounded-md ${className}`}
      style={{ background: C.panelSoft, ...style }}
    />
  );

  if (loading && !summary) {
    return (
      <div className="space-y-7">
        <FilterBar />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-1 p-6">
            <Skel className="h-3 w-24 mb-4" />
            <Skel className="h-9 w-40 mb-3" />
            <Skel className="h-3 w-32" />
          </Card>
          <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[0, 1].map((i) => (
              <Card key={i} className="p-5">
                <Skel className="h-8 w-8 rounded-lg mb-4" />
                <Skel className="h-3 w-full mb-2.5" />
                <Skel className="h-3 w-full mb-2.5" />
                <Skel className="h-3 w-full mb-2.5" />
                <Skel className="h-9 w-full" />
              </Card>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2 p-5">
            <Skel className="h-4 w-40 mb-4" />
            <Skel className="h-[220px] w-full" />
          </Card>
          <Card className="p-5">
            <Skel className="h-4 w-28 mb-4" />
            <Skel className="h-[160px] w-full rounded-full mx-auto" style={{ maxWidth: 160 }} />
          </Card>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <FilterBar />
        <div className="rounded-2xl border-2 p-6 text-sm" style={{ borderColor: C.rose, color: C.rose, background: C.roseSoft }}>
          Couldn't reach the backend ({error}). Make sure the API is running on :5000 and MongoDB is connected.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-7">
      <div className="flex items-center gap-2.5">
        <FilterBar />
        {/* Small inline spinner while a filter change is re-fetching — the
            page keeps showing the previous numbers underneath (no jarring
            blank state), this just signals "updating". */}
        {loading && (
          <span className="flex items-center gap-1.5 text-xs fade-up" style={{ color: C.textLow }}>
            <Loader2 size={13} className="animate-spin" /> Updating…
          </span>
        )}
      </div>

      {/* Hero row: Cash in Hand + Cash In / Cash Out breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card
          className="lg:col-span-1 p-6 fade-up relative overflow-hidden"
          style={{
            background: `linear-gradient(160deg, ${C.teal} 0%, ${C.teal} 55%, rgba(0,0,0,0.35) 180%)`,
            borderColor: "rgba(255,255,255,0.12)",
            boxShadow: `0 24px 48px -20px ${C.teal}59, inset 0 1px 0 rgba(255,255,255,0.18)`,
          }}
        >
          <div className="absolute -right-10 -top-14 h-40 w-40 rounded-full" style={{ background: "#fff", opacity: 0.1 }} />
          <div className="absolute -right-4 bottom-[-3rem] h-28 w-28 rounded-full" style={{ background: "#000", opacity: 0.12 }} />
          <div className="flex items-center justify-between mb-4 relative">
            <span className="text-[11px] uppercase tracking-widest font-semibold" style={{ color: "rgba(255,255,255,0.85)" }}>Cash in Hand</span>
            <div className="h-10 w-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "rgba(255,255,255,0.18)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.25)" }}>
              <Fingerprint size={18} color="#fff" />
            </div>
          </div>
          <div className="relative" style={{ ...fontMono, fontSize: "2.5rem", fontWeight: 800, color: "#fff", letterSpacing: "-0.02em", textShadow: "0 2px 16px rgba(0,0,0,0.25)" }}>
            {pkr(cashInHand)}
          </div>
          <div className="mt-2 text-xs relative font-medium" style={{ color: "rgba(255,255,255,0.8)" }}>
            Total In − Total Out · {FILTER_LABELS[filter]}
          </div>
        </Card>

        <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* IN */}
          <Card className="p-5 fade-up">
            <div className="flex items-center gap-2 mb-4">
              <div className="h-8 w-8 rounded-lg flex items-center justify-center" style={{ background: C.goldSoft }}>
                <ArrowUpRight size={16} style={{ color: C.gold }} />
              </div>
              <div>
                <div style={{ ...fontDisplay, fontWeight: 600, color: C.textHi }} className="text-base">Cash In</div>
                <div className="text-xs" style={{ color: C.textLow }}>Total inflows · {FILTER_LABELS[filter]}</div>
              </div>
            </div>
            <div className="space-y-2 text-sm">
              <div className="row-hover flex items-center justify-between p-3 rounded-lg" style={{ background: C.panelSoft }}>
                <span style={{ color: C.textMid }}>Projects Paid</span>
                <span style={{ ...fontMono, color: C.textHi, fontWeight: 600 }}>{pkr(summary.inOutBreakdown?.in?.projectsPaid || 0)}</span>
              </div>
              <div className="row-hover flex items-center justify-between p-3 rounded-lg" style={{ background: C.panelSoft }}>
                <span style={{ color: C.textMid }}>Students Paid</span>
                <span style={{ ...fontMono, color: C.textHi, fontWeight: 600 }}>{pkr(summary.inOutBreakdown?.in?.studentsPaid || 0)}</span>
              </div>
              <div className="row-hover flex items-center justify-between p-3 rounded-lg" style={{ background: C.panelSoft }}>
                <span style={{ color: C.textMid }}>Loans Taken</span>
                <span style={{ ...fontMono, color: C.textHi, fontWeight: 600 }}>{pkr(summary.inOutBreakdown?.in?.loansTaken || 0)}</span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg border-2 mt-3" style={{ background: C.goldSoft, borderColor: C.gold }}>
                <span style={{ color: C.gold, fontWeight: 600 }}>Total In</span>
                <span style={{ ...fontMono, color: C.gold, fontWeight: 700, fontSize: "1.1rem" }}>{pkr(summary.inOutBreakdown?.in?.total || 0)}</span>
              </div>
            </div>
          </Card>

          {/* OUT */}
          <Card className="p-5 fade-up" style={{ animationDelay: "60ms" }}>
            <div className="flex items-center gap-2 mb-4">
              <div className="h-8 w-8 rounded-lg flex items-center justify-center" style={{ background: C.roseSoft }}>
                <ArrowDownRight size={16} style={{ color: C.rose }} />
              </div>
              <div>
                <div style={{ ...fontDisplay, fontWeight: 600, color: C.textHi }} className="text-base">Cash Out</div>
                <div className="text-xs" style={{ color: C.textLow }}>Total outflows · {FILTER_LABELS[filter]}</div>
              </div>
            </div>
            <div className="space-y-2 text-sm">
              <div className="row-hover flex items-center justify-between p-3 rounded-lg" style={{ background: C.panelSoft }}>
                <span style={{ color: C.textMid }}>Employee Salary</span>
                <span style={{ ...fontMono, color: C.textHi, fontWeight: 600 }}>{pkr(summary.inOutBreakdown?.out?.employeeSalaryPaid || 0)}</span>
              </div>
              <div className="row-hover flex items-center justify-between p-3 rounded-lg" style={{ background: C.panelSoft }}>
                <span style={{ color: C.textMid }}>Teachers Salary</span>
                <span style={{ ...fontMono, color: C.textHi, fontWeight: 600 }}>{pkr(summary.inOutBreakdown?.out?.teacherSalaryPaid || 0)}</span>
              </div>
              <div className="row-hover flex items-center justify-between p-3 rounded-lg" style={{ background: C.panelSoft }}>
                <span style={{ color: C.textMid }}>Expenses</span>
                <span style={{ ...fontMono, color: C.textHi, fontWeight: 600 }}>{pkr(summary.inOutBreakdown?.out?.expensesPaid || 0)}</span>
              </div>
              <div className="row-hover flex items-center justify-between p-3 rounded-lg" style={{ background: C.panelSoft }}>
                <span style={{ color: C.textMid }}>Loan Return</span>
                <span style={{ ...fontMono, color: C.textHi, fontWeight: 600 }}>{pkr(summary.inOutBreakdown?.out?.loanReturn || 0)}</span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg border-2 mt-3" style={{ background: C.roseSoft, borderColor: C.rose }}>
                <span style={{ color: C.rose, fontWeight: 600 }}>Total Out</span>
                <span style={{ ...fontMono, color: C.rose, fontWeight: 700, fontSize: "1.1rem" }}>{pkr(summary.inOutBreakdown?.out?.total || 0)}</span>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* Chart row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 p-5">
          <div className="flex items-center justify-between mb-1 pb-3 border-b" style={{ borderColor: C.line }}>
            <div>
              <div style={{ ...fontDisplay, fontWeight: 600, color: C.textHi }} className="text-lg">Cash In vs Cash Out</div>
              <div className="text-xs" style={{ color: C.textLow }}>Last 6 months</div>
            </div>
            <div className="flex items-center gap-4 text-xs">
              <span className="flex items-center gap-1.5" style={{ color: C.textMid }}><span className="h-2 w-2 rounded-full inline-block" style={{ background: C.gold }} /> In</span>
              <span className="flex items-center gap-1.5" style={{ color: C.textMid }}><span className="h-2 w-2 rounded-full inline-block" style={{ background: C.rose }} /> Out</span>
            </div>
          </div>
          <div style={{ height: 220 }} className="pt-3">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={summary.cashFlow} margin={{ left: -18, right: 6, top: 6 }}>
                <defs>
                  <linearGradient id="inGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={C.gold} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={C.gold} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="outGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={C.rose} stopOpacity={0.3} />
                    <stop offset="100%" stopColor={C.rose} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={C.line} vertical={false} strokeDasharray="3 4" />
                <XAxis dataKey="m" stroke={C.textLow} fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke={C.textLow} fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `${v / 1000}k`} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="in" stroke={C.gold} strokeWidth={2} fill="url(#inGrad)" />
                <Area type="monotone" dataKey="out" stroke={C.rose} strokeWidth={2} fill="url(#outGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-5">
          <div className="mb-1 pb-3 border-b" style={{ borderColor: C.line }}>
            <div style={{ ...fontDisplay, fontWeight: 600, color: C.textHi }} className="text-lg">Student Mix</div>
            <div className="text-xs" style={{ color: C.textLow }}>{totalStudentsInMix} enrolled total</div>
          </div>
          <div style={{ height: 160 }} className="pt-3">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={studentMix} dataKey="value" innerRadius={45} outerRadius={68} paddingAngle={3} stroke="none">
                  {studentMix.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-2 mt-2">
            {studentMix.map((s) => (
              <div key={s.name} className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-2" style={{ color: C.textMid }}>
                  <span className="h-2 w-2 rounded-full inline-block" style={{ background: s.color }} /> {s.name}
                </span>
                <span style={{ ...fontMono, color: C.textHi }}>{s.value}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Batches row — which batch each student belongs to, at a glance */}
      <Card className="p-5 fade-up">
        <div className="flex items-center justify-between mb-1 pb-3 border-b" style={{ borderColor: C.line }}>
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg flex items-center justify-center" style={{ background: C.tealSoft }}>
              <Layers size={16} style={{ color: C.teal }} />
            </div>
            <div>
              <div style={{ ...fontDisplay, fontWeight: 600, color: C.textHi }} className="text-lg">Students by Batch</div>
              <div className="text-xs" style={{ color: C.textLow }}>{totalBatchedStudents} active student{totalBatchedStudents !== 1 ? "s" : ""} across {batchMix.length} batch{batchMix.length !== 1 ? "es" : ""}</div>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-3 text-[11px] mb-2" style={{ color: C.textLow }}>
          {[['Paid', C.gold], ['Free', C.rose], ['Workspace', C.teal]].map(([label, color]) => (
            <span key={label} className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: color }} />{label}</span>
          ))}
        </div>
        {batchMix.length === 0 ? (
          <div className="py-10 text-center text-sm" style={{ color: C.textLow }}>No active students yet.</div>
        ) : (
          <div style={{ height: Math.max(180, batchMix.length * 42) }} className="pt-3">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={batchMix} layout="vertical" margin={{ left: 8, right: 24, top: 4, bottom: 4 }}>
                <CartesianGrid stroke={C.line} horizontal={false} strokeDasharray="3 4" />
                <XAxis type="number" allowDecimals={false} stroke={C.textLow} fontSize={11} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="name" stroke={C.textLow} fontSize={11} tickLine={false} axisLine={false} width={120} />
                <Tooltip
                  cursor={{ fill: C.panelSoft }}
                  content={({ active, payload }) => {
                    if (!active || !payload || !payload.length) return null;
                    const row = payload[0]?.payload || {};
                    return (
                      <div className="rounded-xl border px-3 py-2.5 text-xs shadow-lg min-w-[170px]" style={{ background: C.panelSoft, borderColor: C.line, color: C.textHi }}>
                        <div className="font-semibold mb-2">{row.name} · {row.value} students</div>
                        <div className="space-y-1" style={fontMono}>
                          <div className="flex justify-between gap-5"><span>Paid</span><span>{row.paid || 0}</span></div>
                          <div className="flex justify-between gap-5"><span>Free</span><span>{row.free || 0}</span></div>
                          <div className="flex justify-between gap-5"><span>Workspace</span><span>{row.workspace || 0}</span></div>
                        </div>
                      </div>
                    );
                  }}
                />
                <Bar dataKey="paid" stackId="course" fill={C.gold} radius={[5, 0, 0, 5]} />
                <Bar dataKey="free" stackId="course" fill={C.rose} />
                <Bar dataKey="workspace" stackId="course" fill={C.teal} radius={[0, 5, 5, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>
    </div>
  );
}