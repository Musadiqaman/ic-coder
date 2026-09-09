import React, { useEffect, useRef, useState } from "react";
import { Camera, RefreshCcw, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { useTheme } from "../theme.jsx";
import { loadFaceModels, detectFace } from "../lib/faceRecognition.js";

// Controlled-ish webcam capture widget.
// Props:
//   onCapture(descriptor: number[], photoDataUrl: string) — called when a face is captured
//   captured: boolean — parent tells us whether a face is already stored (shows a "Recapture" state)
//   height: css height for the video box (default 220)
export default function FaceCapture({ onCapture, captured, height = 220 }) {
  const { C } = useTheme();
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [stage, setStage] = useState("idle"); // idle | loading-models | starting-camera | live | capturing | error
  const [errorMsg, setErrorMsg] = useState("");

  const stopStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  };

  useEffect(() => () => stopStream(), []);

  const start = async () => {
    setErrorMsg("");
    try {
      setStage("loading-models");
      await loadFaceModels();
      setStage("starting-camera");
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240 } });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setStage("live");
    } catch (err) {
      setErrorMsg(err.name === "NotAllowedError"
        ? "Camera permission denied — allow camera access and try again."
        : err.message || "Couldn't start the camera.");
      setStage("error");
    }
  };

  const capture = async () => {
    if (!videoRef.current) return;
    setStage("capturing");
    setErrorMsg("");
    try {
      const result = await detectFace(videoRef.current);
      if (!result) {
        setErrorMsg("No face detected — face the camera directly with good lighting.");
        setStage("live");
        return;
      }
      const canvas = document.createElement("canvas");
      canvas.width = 200;
      canvas.height = 200;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      const photo = canvas.toDataURL("image/jpeg", 0.85);
      onCapture(result.descriptor, photo);
      stopStream();
      setStage("idle");
    } catch (err) {
      setErrorMsg(err.message || "Face capture failed.");
      setStage("live");
    }
  };

  return (
    <div className="rounded-xl border-2 p-3" style={{ borderColor: C.line }}>
      <div className="relative rounded-lg overflow-hidden flex items-center justify-center" style={{ height, background: C.panelSoft }}>
        <video ref={videoRef} muted playsInline className="w-full h-full object-cover" style={{ display: stage === "live" || stage === "capturing" ? "block" : "none" }} />
        {stage !== "live" && stage !== "capturing" && (
          <div className="flex flex-col items-center gap-2 text-xs px-4 text-center" style={{ color: C.textLow }}>
            {stage === "loading-models" && <><Loader2 size={22} className="animate-spin" /> Loading face model…</>}
            {stage === "starting-camera" && <><Loader2 size={22} className="animate-spin" /> Starting camera…</>}
            {stage === "idle" && !captured && <><Camera size={22} /> Camera off</>}
            {stage === "idle" && captured && <><CheckCircle2 size={22} style={{ color: C.teal }} /> Face already captured</>}
            {stage === "error" && <><AlertCircle size={22} style={{ color: C.rose }} /> {errorMsg}</>}
          </div>
        )}
      </div>

      {errorMsg && stage === "live" && (
        <div className="flex items-center gap-1.5 text-xs mt-2" style={{ color: C.rose }}><AlertCircle size={12} /> {errorMsg}</div>
      )}

      <div className="flex gap-2 mt-3">
        {stage === "idle" && (
          <button type="button" onClick={start} className="flex-1 flex items-center justify-center gap-2 rounded-lg py-2 text-xs font-semibold" style={{ background: C.goldSoft, color: C.gold }}>
            <Camera size={14} /> {captured ? "Recapture Face" : "Start Camera"}
          </button>
        )}
        {(stage === "loading-models" || stage === "starting-camera") && (
          <button type="button" disabled className="flex-1 flex items-center justify-center gap-2 rounded-lg py-2 text-xs font-semibold opacity-60" style={{ background: C.goldSoft, color: C.gold }}>
            <Loader2 size={14} className="animate-spin" /> Please wait…
          </button>
        )}
        {stage === "live" && (
          <>
            <button type="button" onClick={capture} className="flex-1 flex items-center justify-center gap-2 rounded-lg py-2 text-xs font-semibold" style={{ background: C.gold, color: C.mode === "dark" ? C.ink : "#fff" }}>
              <CheckCircle2 size={14} /> Capture Face
            </button>
            <button type="button" onClick={() => { stopStream(); setStage("idle"); }} className="rounded-lg py-2 px-3 text-xs font-medium border-2" style={{ borderColor: C.line, color: C.textMid }}>
              Cancel
            </button>
          </>
        )}
        {stage === "capturing" && (
          <button type="button" disabled className="flex-1 flex items-center justify-center gap-2 rounded-lg py-2 text-xs font-semibold opacity-60" style={{ background: C.gold, color: C.mode === "dark" ? C.ink : "#fff" }}>
            <Loader2 size={14} className="animate-spin" /> Analyzing…
          </button>
        )}
        {stage === "error" && (
          <button type="button" onClick={start} className="flex-1 flex items-center justify-center gap-2 rounded-lg py-2 text-xs font-semibold" style={{ background: C.goldSoft, color: C.gold }}>
            <RefreshCcw size={14} /> Try Again
          </button>
        )}
      </div>
    </div>
  );
}
