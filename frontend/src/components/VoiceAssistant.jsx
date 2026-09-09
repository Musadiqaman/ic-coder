// frontend/src/components/VoiceAssistant.jsx

import React, { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Mic, MicOff, X, Sparkles, Loader2, Send, Volume2, VolumeX } from "lucide-react";
import { api } from "../api/client.js";

const normalizeCourseType = (value) => {
  if (!value) return value;
  const v = String(value).toLowerCase().trim();

  if (v.includes("workspace")) return "workspace";
  if (v === "free" || v.includes("free internship") || v.includes("free course")) return "free";
  if (v === "paid" || v.includes("paid internship") || v.includes("paid course")) return "paid";

  return value;
};

const normalizeDate = (value) => {
  if (!value) return value;

  const raw = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const normalizeStudentData = (data = {}) => {
  const result = {};

  if (data.name !== undefined) result.name = String(data.name).trim();
  if (data.email !== undefined) result.email = String(data.email).trim();
  if (data.phone !== undefined) result.phone = String(data.phone).trim();
  if (data.courseType !== undefined) result.courseType = normalizeCourseType(data.courseType);
  if (data.courseName !== undefined) result.courseName = String(data.courseName).trim();
  if (data.duration !== undefined) result.duration = String(data.duration).trim();
  if (data.batch !== undefined) result.batch = String(data.batch).trim();
  if (data.joiningDate !== undefined) result.joiningDate = normalizeDate(data.joiningDate);
  if (data.registrationFee !== undefined) result.registrationFee = data.registrationFee;
  if (data.monthlyFee !== undefined) result.monthlyFee = data.monthlyFee;

  return result;
};

export default function VoiceAssistant({ isOpen, onClose }) {
  const navigate = useNavigate();
  const location = useLocation();

  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [loading, setLoading] = useState(false);
  // V7.2: text-to-speech is optional. The preference is persisted so the
  // user can completely disable assistant voice-over without disabling the
  // microphone/voice-input feature.
  const [voiceOutputEnabled, setVoiceOutputEnabled] = useState(() => {
    try { return localStorage.getItem("ic_voice_output_enabled") !== "false"; }
    catch { return true; }
  });
  // When a voice CRUD command matches multiple records, the page sends a
  // numbered candidate list here. The next spoken number executes only that
  // selected record.
  const [pendingSelection, setPendingSelection] = useState(null);

  // Drafts are kept only for the current voice conversation. The actual
  // database save is always performed by the existing page form/API.
  const [studentDraft, setStudentDraft] = useState(null);
  const [teacherDraft, setTeacherDraft] = useState(null);
  const [loanDraft, setLoanDraft] = useState(null);
  const [projectDraft, setProjectDraft] = useState(null);
  const [employeeDraft, setEmployeeDraft] = useState(null);
  const [expenseDraft, setExpenseDraft] = useState(null);
  const [editContext, setEditContext] = useState(null);

  const recognitionRef = useRef(null);
  const chatEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    const handleAmbiguous = (event) => {
      const detail = event.detail || {};
      const candidates = Array.isArray(detail.candidates) ? detail.candidates : [];
      const canAwaitQualifier = Boolean(detail.awaitQualifier && detail.entity && detail.operation && detail.originalQuery);
      setPendingSelection(candidates.length ? {
        entity: detail.entity,
        operation: detail.operation,
        candidates,
      } : canAwaitQualifier ? {
        manual: true,
        entity: detail.entity,
        operation: detail.operation,
        originalQuery: detail.originalQuery,
      } : null);
      const lines = candidates.map((c, i) => {
        const label = c.label || c.name || `Record ${i + 1}`;
        const rawDetails = String(c.details || '');
        const parts = rawDetails.split(/\s*[·|]\s*/).map((x) => x.trim()).filter(Boolean);
        const phone = c.phone || (parts.length >= 1 ? parts[0] : '');
        const email = c.email || (parts.length >= 2 ? parts[1] : '');
        const hasStudentIdentity = detail.entity === 'student' || c.phone !== undefined || c.email !== undefined;
        if (hasStudentIdentity) {
          return [
            `Option ${i + 1}:`,
            `Name: ${label}`,
            `Phone Number: ${phone || 'Not available'}`,
            `Gmail: ${email || 'Not available'}`,
          ].join('\n');
        }
        return [`Option ${i + 1}:`, `Name: ${label}`, `Details: ${rawDetails || 'Not available'}`].join('\n');
      });
      const message = detail.message || `I found multiple ${detail.entity || 'records'}. Please choose one by number.`;
      const structured = `${message}${lines.length ? `\n\n${lines.join('\n\n')}` : ''}`;
      setMessages((prev) => [...prev, { sender: 'assistant', text: structured }]);
    };
    const handleResult = (event) => {
      const detail = event.detail || {};
      setPendingSelection(null);
      if (detail.message) {
        setMessages((prev) => [...prev, { sender: 'assistant', text: detail.message }]);
      }
    };
    const handleVoiceNotice = (event) => {
      const message = String(event.detail?.message || '').trim();
      if (message) setMessages((prev) => [...prev, { sender: 'assistant', text: message }]);
    };
    window.addEventListener('AI_ENTITY_ACTION_AMBIGUOUS', handleAmbiguous);
    window.addEventListener('AI_ENTITY_ACTION_RESULT', handleResult);
    window.addEventListener('AI_VOICE_NOTICE', handleVoiceNotice);
    return () => {
      window.removeEventListener('AI_ENTITY_ACTION_AMBIGUOUS', handleAmbiguous);
      window.removeEventListener('AI_ENTITY_ACTION_RESULT', handleResult);
      window.removeEventListener('AI_VOICE_NOTICE', handleVoiceNotice);
    };
  }, []);

  useEffect(() => {
    const handleEditContext = (event) => {
      const detail = event.detail || {};
      if (detail.entity && detail.targetId) {
        setEditContext(detail);
      } else {
        setEditContext(null);
      }
    };
    const clearEditContext = () => setEditContext(null);
    window.addEventListener("AI_EDIT_CONTEXT", handleEditContext);
    window.addEventListener("AI_EDIT_CLEARED", clearEditContext);
    return () => {
      window.removeEventListener("AI_EDIT_CONTEXT", handleEditContext);
      window.removeEventListener("AI_EDIT_CLEARED", clearEditContext);
    };
  }, []);

  // Speak assistant responses using the browser's speech synthesis.
  // V7.2 adds a user-controlled Voice Output toggle.
  const spokenMessageRef = useRef(0);
  useEffect(() => {
    if (!messages.length || typeof window === "undefined" || !window.speechSynthesis) return;
    if (!voiceOutputEnabled) {
      try { window.speechSynthesis.cancel(); } catch {}
      return;
    }
    const latestIndex = messages.length - 1;
    if (latestIndex < spokenMessageRef.current) return;
    const latest = messages[latestIndex];
    if (latest?.sender !== "assistant") return;
    spokenMessageRef.current = messages.length;
    const speak = () => {
      if (!voiceOutputEnabled) return;
      try {
        window.speechSynthesis.cancel();
        const text = String(latest.text || "")
          .replace(/\bOption (\d+)\b/gi, "Option $1.")
          .replace(/\n+/g, ". ");
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = "en-US";
        utterance.rate = 0.92;
        utterance.pitch = 0.9;
        const voices = window.speechSynthesis.getVoices?.() || [];
        const male = voices.find((v) => /male|david|mark|daniel|alex|fred|george|guy|ryan|microsoft.*david/i.test(v.name));
        if (male) utterance.voice = male;
        window.speechSynthesis.speak(utterance);
      } catch (err) {
        console.warn("Speech synthesis unavailable:", err);
      }
    };
    if ((window.speechSynthesis.getVoices?.() || []).length) speak();
    else {
      window.speechSynthesis.onvoiceschanged = speak;
      setTimeout(speak, 300);
    }
    return () => {
      if (window.speechSynthesis) window.speechSynthesis.onvoiceschanged = null;
    };
  }, [messages, voiceOutputEnabled]);

  const toggleVoiceOutput = () => {
    setVoiceOutputEnabled((enabled) => {
      const next = !enabled;
      try { localStorage.setItem("ic_voice_output_enabled", String(next)); } catch {}
      if (!next && typeof window !== "undefined" && window.speechSynthesis) {
        try { window.speechSynthesis.cancel(); } catch {}
      }
      return next;
    });
  };


  const stopListening = () => {
    if (recognitionRef.current && isListening) {
      try {
        recognitionRef.current.stop();
      } catch (err) {
        console.error("Error stopping recognition:", err);
      }
      setIsListening(false);
    }
  };

  const sendToAI = async (text) => {
    if (!text.trim() || loading) return;

    stopListening();

    const userQuery = text.trim();
    setInputText("");
    setMessages((prev) => [...prev, { sender: "user", text: userQuery }]);
    setLoading(true);

    try {
      // Resolve a previously displayed duplicate-name list locally. This keeps
      // the second turn deterministic: "2" means exactly candidate #2 and
      // never gets interpreted as a new database command by the LLM.
      if (pendingSelection && Array.isArray(pendingSelection.candidates)) {
        const match = userQuery.match(/^(?:number|no|index|option)?\s*#?\s*(\d+)\s*$/i);
        if (match) {
          const index = Number(match[1]) - 1;
          if (index >= 0 && index < pendingSelection.candidates.length) {
            window.dispatchEvent(new CustomEvent("AI_ENTITY_ACTION_EXECUTE", {
              detail: {
                entity: pendingSelection.entity,
                operation: pendingSelection.operation,
                candidate: pendingSelection.candidates[index],
              },
            }));
            setPendingSelection(null);
            return;
          }
          setMessages((prev) => [...prev, { sender: "assistant", text: `Please choose a valid index from 1 to ${pendingSelection.candidates.length}.` }]);
          return;
        }
      }

      let requestQuery = userQuery;
      if (pendingSelection?.manual && (pendingSelection.entity === "project" || pendingSelection.entity === "loan")) {
        const qualifierWord = pendingSelection.entity === "project" ? "owner" : "contact";
        requestQuery = `${pendingSelection.operation} ${pendingSelection.entity} ${pendingSelection.originalQuery} ${qualifierWord} ${userQuery}`;
      }

      const resData = await api.post("/ai-assistant/process", {
        query: requestQuery,
        currentPage: location.pathname,
        currentState: {
          studentDraft: studentDraft || {},
          teacherDraft: teacherDraft || {},
          loanDraft: loanDraft || {},
          projectDraft: projectDraft || {},
          employeeDraft: employeeDraft || {},
          expenseDraft: expenseDraft || {},
          editContext: editContext || null,
        },
      });

      const {
        action,
        filter,
        target_page,
        search_query,
        entity,
        operation,
        target_query,
        qualifier,
        reply,
        data = {},
      } = resData || {};

      const responseText = reply || "Action completed successfully.";

      setMessages((prev) => [
        ...prev,
        { sender: "assistant", text: responseText },
      ]);

      // ---------------------------------------------------------------
      // Existing edit modal workflow: update fields, save, or cancel.
      // ---------------------------------------------------------------
      if (action === "UPDATE_EDIT_FORM") {
        window.dispatchEvent(new CustomEvent("AI_UPDATE_EDIT_FORM", {
          detail: { entity, formData: data || {} },
        }));
        return;
      }

      if (action === "SAVE_EDIT") {
        window.dispatchEvent(new CustomEvent("AI_SAVE_EDIT"));
        setEditContext(null);
        return;
      }

      if (action === "CANCEL_EDIT") {
        window.dispatchEvent(new CustomEvent("AI_CANCEL_EDIT"));
        setEditContext(null);
        return;
      }

      // ---------------------------------------------------------------
      // Cancel/clear current voice workflow
      // ---------------------------------------------------------------
      if (action === "CANCEL_VOICE") {
        setStudentDraft(null);
        setTeacherDraft(null);
        setLoanDraft(null);
        setProjectDraft(null);
        setEmployeeDraft(null);
        setExpenseDraft(null);
        setEditContext(null);
        window.dispatchEvent(new CustomEvent("AI_CANCEL_VOICE_FORMS"));
        if (target_page) navigate(target_page);
        return;
      }

      // ---------------------------------------------------------------
      // Existing-record actions (view/edit/delete/activate/deactivate)
      // ---------------------------------------------------------------
      if (action === "ENTITY_ACTION") {
        const applyAction = () => {
          window.dispatchEvent(new CustomEvent("AI_ENTITY_ACTION", {
            detail: {
              entity,
              operation,
              query: target_query,
              qualifier,
            },
          }));
        };

        if (location.pathname !== target_page) {
          navigate(target_page);
          setTimeout(applyAction, 350);
        } else {
          applyAction();
        }
        return;
      }

      // ---------------------------------------------------------------
      // Page date/stat filter
      // ---------------------------------------------------------------
      // Mirrors the Today / This Month / Last Month / All buttons that already
      // exist on Students, Teachers, Projects, Employees, Expenses and Loans.
      if (action === "FILTER_PAGE_DATE") {
        const applyFilter = () => {
          const eventName = target_page === "/attendance" ? "AI_ATTENDANCE_DATE_FILTER" : "AI_PAGE_DATE_FILTER";
          window.dispatchEvent(
            new CustomEvent(eventName, {
              detail: { filter: filter || "thisMonth" },
            })
          );
        };

        if (location.pathname !== target_page) {
          navigate(target_page);
          setTimeout(applyFilter, 350);
        } else {
          applyFilter();
        }
        return;
      }

      // ---------------------------------------------------------------
      // Student batch filter
      // ---------------------------------------------------------------
      if (action === "FILTER_STUDENT_BATCH") {
        const applyBatchFilter = () => {
          window.dispatchEvent(new CustomEvent("AI_STUDENT_BATCH_FILTER", {
            detail: { filter: String(filter || "all").trim() },
          }));
        };
        if (location.pathname !== "/students") {
          navigate("/students");
          setTimeout(applyBatchFilter, 450);
        } else {
          applyBatchFilter();
        }
        return;
      }

      // ---------------------------------------------------------------
      // Student type/list filter
      // ---------------------------------------------------------------
      if (action === "FILTER_STUDENTS") {
        const applyFilter = () => {
          window.dispatchEvent(
            new CustomEvent("AI_STUDENT_FILTER", {
              detail: { filter: filter || "all" },
            })
          );
        };

        if (location.pathname !== "/students") {
          navigate("/students");
          setTimeout(applyFilter, 350);
        } else {
          applyFilter();
        }
        return;
      }

      // ---------------------------------------------------------------
      // Exact quick-search. The backend deliberately returns only the clean
      // search value, so command words such as "karo" or "by" never enter
      // the page search input.
      // ---------------------------------------------------------------
      if (action === "SEARCH_PAGE") {
        const searchValue = String(search_query ?? "").trim();
        const applySearch = () => {
          if (!searchValue) return;
          window.dispatchEvent(
            new CustomEvent("AI_SEARCH_PAGE", {
              detail: { query: searchValue },
            })
          );
        };

        if (location.pathname !== target_page) {
          navigate(target_page);
          setTimeout(applySearch, 350);
        } else {
          applySearch();
        }
        return;
      }

      // ---------------------------------------------------------------
      // Dashboard filter
      // ---------------------------------------------------------------
      // The backend can return exact custom From/To dates as YYYY-MM-DD.
      // Dispatching the same event a few times after navigation makes this
      // reliable even when Dashboard is a lazy-loaded route and has not
      // mounted yet on the first tick. Dashboard state updates are idempotent.
      if (action === "FILTER_DASHBOARD") {
        const dashboardDetail = {
          filter: String(filter || "").trim(),
          startDate: data?.startDate ?? resData?.startDate ?? null,
          endDate: data?.endDate ?? resData?.endDate ?? null,
          dateField: data?.dateField ?? resData?.dateField ?? null,
        };

        const dispatchDashboardFilter = () => {
          window.dispatchEvent(new CustomEvent("AI_DASHBOARD_FILTER", {
            detail: dashboardDetail,
          }));
        };

        if (location.pathname !== "/") {
          navigate("/");
          [100, 300, 650, 1000].forEach((delay) => setTimeout(dispatchDashboardFilter, delay));
        } else {
          dispatchDashboardFilter();
        }

        return;
      }

      // ---------------------------------------------------------------
      // Add/save workflows. Each page listens for these events and uses its
      // existing form/API, so voice entry cannot bypass normal validation.
      // ---------------------------------------------------------------
      const workflow = {
        ADD_STUDENT: {
          draft: studentDraft,
          setDraft: setStudentDraft,
          openEvent: "AI_OPEN_STUDENT_MODAL",
          updateEvent: "AI_UPDATE_STUDENT_FORM",
          saveEvent: "AI_SAVE_STUDENT",
          path: "/students",
        },
        ADD_TEACHER: {
          draft: teacherDraft,
          setDraft: setTeacherDraft,
          openEvent: "AI_OPEN_TEACHER_MODAL",
          updateEvent: "AI_UPDATE_TEACHER_FORM",
          saveEvent: "AI_SAVE_TEACHER",
          path: "/teachers",
        },
        ADD_LOAN: {
          draft: loanDraft,
          setDraft: setLoanDraft,
          openEvent: "AI_OPEN_LOAN_MODAL",
          updateEvent: "AI_UPDATE_LOAN_FORM",
          saveEvent: "AI_SAVE_LOAN",
          path: "/loans",
        },
        ADD_PROJECT: {
          draft: projectDraft,
          setDraft: setProjectDraft,
          openEvent: "AI_OPEN_PROJECT_MODAL",
          updateEvent: "AI_UPDATE_PROJECT_FORM",
          saveEvent: "AI_SAVE_PROJECT",
          path: "/projects",
        },
        ADD_EMPLOYEE: {
          draft: employeeDraft,
          setDraft: setEmployeeDraft,
          openEvent: "AI_OPEN_EMPLOYEE_MODAL",
          updateEvent: "AI_UPDATE_EMPLOYEE_FORM",
          saveEvent: "AI_SAVE_EMPLOYEE",
          path: "/employees",
        },
        ADD_EXPENSE: {
          draft: expenseDraft,
          setDraft: setExpenseDraft,
          openEvent: "AI_OPEN_EXPENSE_MODAL",
          updateEvent: "AI_UPDATE_EXPENSE_FORM",
          saveEvent: "AI_SAVE_EXPENSE",
          path: "/expenses",
        },
      };

      const currentWorkflow =
        workflow[action] ||
        workflow[action.replace(/^SAVE_/, "ADD_")];

      if (currentWorkflow) {
        if (action.startsWith("ADD_")) {
          // An explicit "add/create/new" command always starts a completely
          // fresh form. This prevents yesterday's voice draft (including its
          // date) from leaking into today's new record. Follow-up field turns
          // such as "name is Ali" continue using the existing draft.
          const explicitNewAdd = /\b(?:add|create|new|enroll|register|registration)\b/i.test(userQuery);
          const isFreshAdd = explicitNewAdd || !currentWorkflow.draft || Object.keys(currentWorkflow.draft || {}).length === 0;
          const mergedDraft = isFreshAdd
            ? { __voiceFormOpen: true, ...data }
            : { ...(currentWorkflow.draft || {}), ...data };
          currentWorkflow.setDraft(mergedDraft);

          const eventName = isFreshAdd
            ? currentWorkflow.openEvent
            : currentWorkflow.updateEvent;

          const event = new CustomEvent(eventName, {
            detail: { formData: mergedDraft, fields: data },
          });

          if (location.pathname !== currentWorkflow.path) {
            navigate(currentWorkflow.path);
            setTimeout(() => window.dispatchEvent(event), 350);
          } else {
            window.dispatchEvent(event);
          }
          return;
        }

        if (action.startsWith("SAVE_")) {
          const saveEvent = new CustomEvent(currentWorkflow.saveEvent);
          if (location.pathname !== currentWorkflow.path) {
            navigate(currentWorkflow.path);
            setTimeout(() => window.dispatchEvent(saveEvent), 350);
          } else {
            window.dispatchEvent(saveEvent);
          }
          return;
        }
      }

      // ---------------------------------------------------------------
      // Normal navigation
      // ---------------------------------------------------------------
      if ((action === "NAVIGATE" || target_page) && target_page) {
        let cleanPath = target_page.replace("/#", "");
        if (!cleanPath.startsWith("/")) cleanPath = "/" + cleanPath;
        navigate(cleanPath);

        // A normal navigation away from Students ends the active voice
        // student-entry session, preventing old fields from leaking into a
        // later Add Student operation.
        if (cleanPath !== "/students") setStudentDraft(null);
        if (cleanPath !== "/teachers") setTeacherDraft(null);
        if (cleanPath !== "/loans") setLoanDraft(null);
        if (cleanPath !== "/projects") setProjectDraft(null);
        if (cleanPath !== "/employees") setEmployeeDraft(null);
        if (cleanPath !== "/expenses") setExpenseDraft(null);
      }
    } catch (err) {
      console.error("Voice AI Error:", err);
      setMessages((prev) => [
        ...prev,
        {
          sender: "assistant",
          text: err?.message || "Sorry, I could not process that request.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  // Speech Recognition Listener
  useEffect(() => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = "en-US";

      recognition.onstart = () => setIsListening(true);

      recognition.onresult = (event) => {
        let currentTranscript = "";

        for (let i = event.resultIndex; i < event.results.length; i++) {
          currentTranscript += event.results[i][0].transcript;
        }

        setInputText(currentTranscript);
      };

      recognition.onend = () => {
        setIsListening(false);
        setTimeout(() => {
          inputRef.current?.focus();
        }, 100);
      };

      recognition.onerror = (err) => {
        console.error("Speech Recognition Error:", err);
        setIsListening(false);
      };

      recognitionRef.current = recognition;
    }

    return () => {
      try {
        recognitionRef.current?.stop();
      } catch {
        // Recognition may already be stopped.
      }
    };
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const toggleMic = (e) => {
    if (e) e.preventDefault();

    if (!recognitionRef.current) {
      alert("Speech recognition is not supported in this browser.");
      return;
    }

    if (isListening) {
      stopListening();
    } else {
      try {
        recognitionRef.current.start();
      } catch (err) {
        console.error("Error starting recognition:", err);
      }
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (inputText.trim() && !loading) {
      sendToAI(inputText);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* 1. Backdrop Overlay */}
      <div
        className="fixed inset-0 z-40 bg-black/10 transition-opacity"
        onClick={onClose}
      />

      {/* 2. Side Panel Drawer */}
      <div className="fixed top-0 right-0 z-50 h-full w-80 bg-white shadow-2xl border-l border-gray-200 flex flex-col transition-all duration-300 ease-in-out">
        {/* Header Section */}
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <div className="flex items-center space-x-2">
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg flex items-center justify-center">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-800">
                Voice AI Assistant
              </h3>
              <p className="text-xs text-gray-400">
                Control dashboard via voice or text
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={toggleVoiceOutput}
              className={`p-1.5 rounded-md transition ${voiceOutputEnabled ? "text-indigo-600 hover:bg-indigo-50" : "text-gray-400 hover:bg-gray-100"}`}
              title={voiceOutputEnabled ? "Turn voice output off" : "Turn voice output on"}
              aria-label={voiceOutputEnabled ? "Turn voice output off" : "Turn voice output on"}
            >
              {voiceOutputEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 p-1 rounded-md hover:bg-gray-100 transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Conversation Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.length === 0 && (
            <div className="text-center py-10 text-gray-400 text-xs">
              No conversations yet. Tap the microphone or type below.
            </div>
          )}

          {messages.map((m, idx) => (
            <div
              key={idx}
              className={`flex flex-col ${
                m.sender === "user" ? "items-end" : "items-start"
              }`}
            >
              <div
                className={`max-w-[85%] text-xs p-3 rounded-2xl ${
                  m.sender === "user"
                    ? "bg-indigo-600 text-white rounded-br-none"
                    : "bg-gray-100 text-gray-800 rounded-bl-none border border-gray-200"
                }`}
              >
                {m.sender === "assistant" ? (
                  <div className="whitespace-pre-line leading-5">
                    {String(m.text || "").split("\n").map((line, lineIndex) => {
                      const match = line.match(/^(Option\s+\d+:|Name:|Phone Number:|Gmail:|Details:)(?:\s*)(.*)$/i);
                      if (match) {
                        return (
                          <div key={lineIndex} className={match[1].toLowerCase().startsWith("option") ? "mt-1 first:mt-0" : ""}>
                            <strong>{match[1]}</strong>{match[2] ? ` ${match[2]}` : ""}
                          </div>
                        );
                      }
                      return <div key={lineIndex}>{line || "\u00a0"}</div>;
                    })}
                  </div>
                ) : m.text}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex items-center space-x-2 text-indigo-600 text-xs font-medium">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>AI is processing...</span>
            </div>
          )}

          <div ref={chatEndRef} />
        </div>

        {/* Bottom Input Form */}
        <div className="p-3 border-t border-gray-100 bg-white">
          <form
            onSubmit={handleSubmit}
            className="flex items-center bg-gray-100 rounded-full px-3 py-1.5 border border-gray-200 focus-within:border-indigo-500 shadow-inner"
          >
            <input
              ref={inputRef}
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Ask anything..."
              className="w-full text-xs bg-transparent focus:outline-none text-gray-800 px-2"
            />

            <button
              type="button"
              onClick={toggleMic}
              className={`p-1.5 rounded-full transition-colors mr-1 ${
                isListening
                  ? "bg-red-500 text-white animate-pulse"
                  : "text-gray-500 hover:text-indigo-600"
              }`}
              title={isListening ? "Stop Listening" : "Start Voice Input"}
            >
              {isListening ? (
                <MicOff className="w-4 h-4" />
              ) : (
                <Mic className="w-4 h-4" />
              )}
            </button>

            <button
              type="submit"
              disabled={!inputText.trim() || loading}
              className={`p-1.5 rounded-full transition-all flex items-center justify-center ${
                inputText.trim() && !loading
                  ? "bg-black text-white hover:bg-gray-800 scale-105 cursor-pointer"
                  : "bg-gray-300 text-gray-500 cursor-not-allowed opacity-50"
              }`}
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>
        </div>
      </div>
    </>
  );
}
