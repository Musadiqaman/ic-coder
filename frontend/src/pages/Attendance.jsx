import React, { useState, useEffect, useRef } from "react";
import { Fingerprint, ScanFace, CheckCircle2, XCircle, Clock3, Camera, Loader2, AlertCircle, UserX } from "lucide-react";
import { useTheme, fontDisplay, fontMono } from "../theme.jsx";
import { attendanceApi, studentsApi, teachersApi } from "../api/resources.js";
import { loadFaceModels, detectFace, findBestMatch } from "../lib/faceRecognition.js";

const normalize = (doc) => ({
  id: doc._id,
  name: doc.personName,
  refId: doc.refId,
  type: doc.personType,
  method: doc.method,
  time: new Date(doc.checkedInAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
  status: doc.status,
});

export default function Attendance() {
  const { C } = useTheme();
  const [log, setLog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Which scan panel is showing — face-scan (camera) or fingerprint (device/manual ID entry).
  const [scanMode, setScanMode] = useState("face"); // "face" | "fingerprint"

  // face-scan camera state
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [camStage, setCamStage] = useState("idle"); // idle | loading | live | scanning
  const [scanResult, setScanResult] = useState(null); // { type: 'match'|'nomatch'|'already', name, distance }
  const [students, setStudents] = useState([]);

  // fingerprint-scan state — most USB fingerprint attendance devices act as
  // a keyboard (HID) and "type" the enrolled student's fingerprintId into
  // whatever input is focused, followed by Enter. So this is just a
  // focused text input that reacts on Enter, same as scanning a barcode.
  const fpInputRef = useRef(null);
  const [fpValue, setFpValue] = useState("");
  const [fpBusy, setFpBusy] = useState(false);
  const [fpResult, setFpResult] = useState(null); // { type: 'match'|'nomatch'|'already', name, status }
  const [teachers, setTeachers] = useState([]); // Teachers list for scanning
  const recognitionPromiseRef = useRef(null);
  const recognitionLoadedRef = useRef(false);

  // Local calendar date (NOT toISOString, which is UTC and rolls over ~5
  // hours late for PKT users — e.g. at 12:19 AM PKT it still returns
  // YESTERDAY's date, which made this page fetch and label yesterday's log
  // as "Today's Log").
  const today = (() => {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  })();

  const loadLog = () =>
    attendanceApi
      .list(today)
      .then((docs) => setLog(docs.map(normalize)))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));

  useEffect(() => {
    loadLog();
  }, []);

  // Recognition data is loaded only when a scan is actually requested.
  // The attendance page can therefore render the today's log immediately
  // instead of waiting for all student + teacher biometric records.
  const ensureRecognitionData = async () => {
    if (recognitionLoadedRef.current) return { students, teachers };
    if (!recognitionPromiseRef.current) {
      recognitionPromiseRef.current = Promise.all([
        studentsApi.recognition(),
        teachersApi.recognition(),
      ])
        .then(([studentDocs, teacherDocs]) => {
          setStudents(studentDocs);
          setTeachers(teacherDocs);
          recognitionLoadedRef.current = true;
          return { students: studentDocs, teachers: teacherDocs };
        })
        .finally(() => {
          recognitionPromiseRef.current = null;
        });
    }
    return recognitionPromiseRef.current;
  };

  const stopStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  };
  useEffect(() => () => stopStream(), []);

  const startCamera = async () => {
    setError("");
    setScanResult(null);
    try {
      setCamStage("loading");
      // These are independent startup tasks. Starting them together cuts the
      // perceived camera-start time on a cold browser cache.
      const [_, stream] = await Promise.all([
        loadFaceModels(),
        navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240 } }),
      ]);
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCamStage("live");
    } catch (err) {
      setError(err.name === "NotAllowedError" ? "Camera permission denied." : err.message || "Couldn't start the camera.");
      setCamStage("idle");
    }
  };

  const stopCamera = () => { stopStream(); setCamStage("idle"); setScanResult(null); };

  const scanFace = async () => {
    if (!videoRef.current) return;
    setCamStage("scanning");
    setScanResult(null);
    try {
      const { students: freshStudents, teachers: freshTeachers } = await ensureRecognitionData();

      const detection = await detectFace(videoRef.current);
      if (!detection) {
        setScanResult({ type: "nomatch", reason: "no-face" });
        setCamStage("live");
        return;
      }

      // Check students first
      const studentMatch = findBestMatch(detection.descriptor, freshStudents);
      if (studentMatch) {
        const { student, distance } = studentMatch;
        const doc = await attendanceApi.checkIn({
          personName: student.name,
          personType: "Student",
          refId: student._id,
          method: "Face",
        });

        if (doc.alreadyMarked) {
          setScanResult({ type: "already", name: doc.personName, status: doc.status });
          setCamStage("live");
          return;
        }

        setLog((prev) => [normalize(doc), ...prev]);
        setScanResult({ type: "match", name: student.name, distance, status: doc.status });
        setCamStage("live");
        return;
      }

      // Check teachers if no student match
      const teacherMatch = findBestMatch(
        detection.descriptor,
        freshTeachers.map(t => ({ ...t, faceDescriptor: t.faceDescriptor || [] }))
      );
      if (teacherMatch) {
        const { student: teacher, distance } = teacherMatch;
        const doc = await attendanceApi.checkIn({
          personName: teacher.name,
          personType: "Teacher",
          refId: teacher._id,
          method: "Face",
        });

        if (doc.alreadyMarked) {
          setScanResult({ type: "already", name: doc.personName, status: doc.status });
          setCamStage("live");
          return;
        }

        setLog((prev) => [normalize(doc), ...prev]);
        setScanResult({ type: "match", name: teacher.name, distance, status: doc.status });
        setCamStage("live");
        return;
      }

      setScanResult({ type: "nomatch", reason: "unrecognized" });
      setCamStage("live");
    } catch (err) {
      setError(err.message);
      setCamStage("live");
    }
  };

  // Focus the fingerprint input whenever that panel is shown, so a scan can
  // be captured immediately without the admin needing to click into the box.
  useEffect(() => {
    if (scanMode === "fingerprint") fpInputRef.current?.focus();
  }, [scanMode]);

  // Matches a scanned/typed fingerprintId against enrolled students, then
  // checks the student in — same flow as scanFace() above, just keyed off
  // fingerprintId instead of a face descriptor.
  const submitFingerprint = async (e) => {
    e.preventDefault();
    const value = fpValue.trim();
    if (!value || fpBusy) return;

    setFpBusy(true);
    setFpResult(null);
    setError("");
    try {
      const { students: freshStudents, teachers: freshTeachers } = await ensureRecognitionData();

      // Check students first
      const student = freshStudents.find((s) => s.fingerprintId && s.fingerprintId === value);
      if (student) {
        const doc = await attendanceApi.checkIn({
          personName: student.name,
          personType: "Student",
          refId: student._id,
          method: "Biometric",
        });

        if (doc.alreadyMarked) {
          setFpResult({ type: "already", name: doc.personName, status: doc.status });
          return;
        }

        setLog((prev) => [normalize(doc), ...prev]);
        setFpResult({ type: "match", name: student.name, status: doc.status });
        return;
      }

      // Check teachers if no student match
      const teacher = freshTeachers.find((t) => t.fingerprintId && t.fingerprintId === value);
      if (teacher) {
        const doc = await attendanceApi.checkIn({
          personName: teacher.name,
          personType: "Teacher",
          refId: teacher._id,
          method: "Biometric",
        });

        if (doc.alreadyMarked) {
          setFpResult({ type: "already", name: doc.personName, status: doc.status });
          return;
        }

        setLog((prev) => [normalize(doc), ...prev]);
        setFpResult({ type: "match", name: teacher.name, status: doc.status });
        return;
      }

      setFpResult({ type: "nomatch" });
    } catch (err) {
      setError(err.message);
    } finally {
      setFpValue("");
      setFpBusy(false);
      fpInputRef.current?.focus();
    }
  };

  const verifiedFingerprintCount = students.filter((s) => s.fingerprintId).length;

  const StatusBadge = ({ status }) => {
    const map = {
      present: { label: "Present", icon: CheckCircle2, color: C.teal, soft: C.tealSoft },
      late: { label: "Late", icon: Clock3, color: C.gold, soft: C.goldSoft },
      absent: { label: "Absent", icon: XCircle, color: C.rose, soft: C.roseSoft },
    };
    const m = map[status];
    return <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium" style={{ background: m.soft, color: m.color }}><m.icon size={11} /> {m.label}</span>;
  };

  const presentCount = log.filter((l) => l.status === "present").length;
  const lateCount = log.filter((l) => l.status === "late").length;
  const absentCount = log.filter((l) => l.status === "absent").length;
  const verifiedCount = students.filter((s) => s.faceDescriptor && s.faceDescriptor.length === 128).length;

  return (
    <div>
     

      {loading && (
        <div className="flex items-center gap-2 text-sm mb-4" style={{ color: C.textMid }}>
          <Loader2 size={14} className="animate-spin" /> Loading today's log from server…
        </div>
      )}
      {error && !loading && (
        <div className="rounded-xl border px-4 py-3 text-sm mb-4" style={{ borderColor: C.rose, color: C.rose, background: C.roseSoft }}>
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-6">
        {/* Scan panel */}
        <div className="lg:col-span-1 rounded-2xl border p-6 flex flex-col items-center text-center" style={{ background: C.panel, borderColor: C.line }}>
          <div className="flex gap-1 p-1 rounded-xl w-full mb-4" style={{ background: C.panelSoft }}>
            <button
              onClick={() => setScanMode("face")}
              className="flex-1 flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-all"
              style={{ background: scanMode === "face" ? C.panel : "transparent", color: scanMode === "face" ? C.textHi : C.textLow, boxShadow: scanMode === "face" ? `0 1px 4px ${C.line}` : "none" }}
            >
              <ScanFace size={13} /> Face Scan
            </button>
            <button
              onClick={() => { stopCamera(); setScanMode("fingerprint"); }}
              className="flex-1 flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-all"
              style={{ background: scanMode === "fingerprint" ? C.panel : "transparent", color: scanMode === "fingerprint" ? C.textHi : C.textLow, boxShadow: scanMode === "fingerprint" ? `0 1px 4px ${C.line}` : "none" }}
            >
              <Fingerprint size={13} /> Fingerprint
            </button>
          </div>

          {scanMode === "face" ? (
            <>
              <div className="h-52 w-full rounded-2xl border-2 border-dashed flex items-center justify-center mb-4 relative overflow-hidden" style={{ borderColor: camStage !== "idle" ? C.gold : C.line, background: C.panelSoft }}>
                <video ref={videoRef} muted playsInline className="w-full h-full object-cover" style={{ display: camStage === "live" || camStage === "scanning" ? "block" : "none" }} />
                {camStage === "idle" && <Camera size={34} style={{ color: C.textLow }} />}
                {camStage === "loading" && <div className="flex flex-col items-center gap-2 text-xs" style={{ color: C.textMid }}><Loader2 size={26} className="animate-spin" /> Starting camera…</div>}
                {camStage === "scanning" && (
                  <div className="absolute inset-0 flex items-center justify-center" style={{ background: "#00000055" }}>
                    <div className="flex flex-col items-center gap-2 text-xs" style={{ color: "#fff" }}><Loader2 size={26} className="animate-spin" /> Matching face…</div>
                  </div>
                )}
              </div>

              {scanResult?.type === "match" && (
                <div className="w-full rounded-xl px-3 py-2.5 mb-3 flex items-center gap-2 text-sm" style={{ background: C.tealSoft, color: C.teal }}>
                  <CheckCircle2 size={16} /> <span className="font-medium">{scanResult.name}</span> marked {scanResult.status}
                </div>
              )}
              {scanResult?.type === "already" && (
                <div className="w-full rounded-xl px-3 py-2.5 mb-3 flex items-center gap-2 text-sm" style={{ background: C.goldSoft, color: C.gold }}>
                  <AlertCircle size={16} /> <span className="font-medium">{scanResult.name}</span> already marked today
                  {scanResult.status ? <span className="opacity-80">({scanResult.status})</span> : null}
                </div>
              )}
              {scanResult?.type === "nomatch" && (
                <div className="w-full rounded-xl px-3 py-2.5 mb-3 flex items-center gap-2 text-sm" style={{ background: C.roseSoft, color: C.rose }}>
                  <UserX size={16} /> {scanResult.reason === "no-face" ? "No face detected — try again" : "Not recognized — face not registered"}
                </div>
              )}

              <div className="flex gap-3 w-full">
                {camStage === "idle" && (
                  <button onClick={startCamera} className="flex-1 flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-medium" style={{ background: C.goldSoft, color: C.gold }}>
                    <ScanFace size={15} /> Start Face Scan
                  </button>
                )}
                {(camStage === "live" || camStage === "scanning") && (
                  <>
                    <button onClick={scanFace} disabled={camStage === "scanning"} className="flex-1 flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-medium disabled:opacity-60" style={{ background: C.gold, color: C.mode === "dark" ? C.ink : "#fff" }}>
                      <ScanFace size={15} /> Scan Now
                    </button>
                    <button onClick={stopCamera} className="rounded-xl py-2.5 px-4 text-sm font-medium border-2" style={{ borderColor: C.line, color: C.textMid }}>Stop</button>
                  </>
                )}
                {camStage === "loading" && (
                  <button disabled className="flex-1 flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-medium opacity-60" style={{ background: C.goldSoft, color: C.gold }}>
                    <Loader2 size={15} className="animate-spin" /> Loading…
                  </button>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="h-52 w-full rounded-2xl border-2 border-dashed flex items-center justify-center mb-4 relative overflow-hidden" style={{ borderColor: fpBusy ? C.gold : C.line, background: C.panelSoft }}>
                {fpBusy ? (
                  <div className="flex flex-col items-center gap-2 text-xs" style={{ color: C.textMid }}><Loader2 size={26} className="animate-spin" /> Matching fingerprint…</div>
                ) : (
                  <div className="flex flex-col items-center gap-2" style={{ color: C.textLow }}>
                    <Fingerprint size={40} />
                    <span className="text-xs">Touch the device to scan</span>
                  </div>
                )}
              </div>

              {fpResult?.type === "match" && (
                <div className="w-full rounded-xl px-3 py-2.5 mb-3 flex items-center gap-2 text-sm" style={{ background: C.tealSoft, color: C.teal }}>
                  <CheckCircle2 size={16} /> <span className="font-medium">{fpResult.name}</span> marked {fpResult.status}
                </div>
              )}
              {fpResult?.type === "already" && (
                <div className="w-full rounded-xl px-3 py-2.5 mb-3 flex items-center gap-2 text-sm" style={{ background: C.goldSoft, color: C.gold }}>
                  <AlertCircle size={16} /> <span className="font-medium">{fpResult.name}</span> already marked today
                  {fpResult.status ? <span className="opacity-80">({fpResult.status})</span> : null}
                </div>
              )}
              {fpResult?.type === "nomatch" && (
                <div className="w-full rounded-xl px-3 py-2.5 mb-3 flex items-center gap-2 text-sm" style={{ background: C.roseSoft, color: C.rose }}>
                  <UserX size={16} /> Not recognized — fingerprint not enrolled
                </div>
              )}

              <form onSubmit={submitFingerprint} className="w-full">
                <input
                  ref={fpInputRef}
                  value={fpValue}
                  onChange={(e) => setFpValue(e.target.value)}
                  disabled={fpBusy}
                  autoFocus
                  className="w-full bg-transparent border-2 rounded-xl px-4 py-2.5 text-sm text-center disabled:opacity-60"
                  style={{ borderColor: C.line, color: C.textHi, ...fontMono }}
                  placeholder="Scan finger, or type Fingerprint ID"
                />
                <button type="submit" disabled={fpBusy || !fpValue.trim()} className="w-full mt-3 flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-medium disabled:opacity-60" style={{ background: C.gold, color: C.mode === "dark" ? C.ink : "#fff" }}>
                  <Fingerprint size={15} /> Verify
                </button>
              </form>
              <div className="text-[11px] mt-2" style={{ color: C.textLow }}>
                {verifiedFingerprintCount} student{verifiedFingerprintCount !== 1 ? "s" : ""} enrolled for fingerprint attendance
              </div>
            </>
          )}
        </div>

        {/* Summary + log */}
        <div className="lg:col-span-2 flex flex-col gap-5">
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl border p-4" style={{ background: C.panel, borderColor: C.line }}>
              <div style={{ ...fontMono, color: C.teal, fontWeight: 600 }} className="text-lg">{presentCount}</div>
              <div className="text-xs mt-1" style={{ color: C.textLow }}>Present today</div>
            </div>
            <div className="rounded-xl border p-4" style={{ background: C.panel, borderColor: C.line }}>
              <div style={{ ...fontMono, color: C.gold, fontWeight: 600 }} className="text-lg">{lateCount}</div>
              <div className="text-xs mt-1" style={{ color: C.textLow }}>Late arrivals</div>
            </div>
            <div className="rounded-xl border p-4" style={{ background: C.panel, borderColor: C.line }}>
              <div style={{ ...fontMono, color: C.rose, fontWeight: 600 }} className="text-lg">{absentCount}</div>
              <div className="text-xs mt-1" style={{ color: C.textLow }}>Absent</div>
            </div>
          </div>

          <div className="rounded-2xl border p-5 flex-1" style={{ background: C.panel, borderColor: C.line }}>
            <div style={{ ...fontDisplay, fontWeight: 600, color: C.textHi }} className="text-base mb-3">Today's Log</div>
            <div className="divide-y" style={{ borderColor: C.line }}>
              {log.map((l) => (
                <div key={l.id} className="row-hover flex items-center gap-3 py-2.5 px-2 rounded-lg">
                  <div className="h-8 w-8 rounded-full flex items-center justify-center shrink-0" style={{ background: C.panelSoft }}>
                    {l.method === "Face" ? <ScanFace size={14} style={{ color: C.textMid }} /> : <Fingerprint size={14} style={{ color: C.textMid }} />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm truncate" style={{ color: C.textHi }}>{l.name}</div>
                    <div className="text-xs truncate" style={{ color: C.textLow }}>{l.type} · {l.method} verification</div>
                  </div>
                  <div className="text-xs" style={{ color: C.textLow }}>{l.time}</div>
                  <StatusBadge status={l.status} />
                </div>
              ))}
              {log.length === 0 && !loading && <div className="text-sm py-8 text-center" style={{ color: C.textLow }}>No check-ins yet today.</div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}