// backend/src/controllers/aiAssistantController.js
import Batch from "../models/Batch.js";

const normalizeDate = (value) => {
  if (!value) return undefined;
  const raw = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};

const numberValue = (value) => {
  if (value === undefined || value === null || value === "") return undefined;
  const cleaned = String(value).replace(/[₨,$,\s]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : undefined;
};

const normalizeData = (entity, data = {}) => {
  const out = {};
  const copy = (key, aliases = []) => {
    const source = [key, ...aliases].find((k) => data[k] !== undefined && data[k] !== null && data[k] !== "");
    if (source) out[key] = String(data[source]).trim();
  };

  if (entity === "student") {
    copy("name"); copy("email"); copy("phone");
    copy("courseType"); copy("courseName"); copy("duration"); copy("batch");
    if (data.joiningDate != null && data.joiningDate !== "") out.joiningDate = normalizeDate(data.joiningDate);
    if (data.registrationFee != null && data.registrationFee !== "") out.registrationFee = numberValue(data.registrationFee);
    if (data.monthlyFee != null && data.monthlyFee !== "") out.monthlyFee = numberValue(data.monthlyFee);
    copy("timing");
  }

  if (entity === "teacher") {
    copy("name"); copy("specialization", ["subject", "department"]);
    if (data.salary != null && data.salary !== "") out.salary = numberValue(data.salary);
    if (data.joiningDate != null && data.joiningDate !== "") out.joiningDate = normalizeDate(data.joiningDate);
    copy("accountEmail", ["email", "gmail", "loginEmail", "loginGmail"]);
    const passwordSource = ["accountPassword", "password", "loginPassword"].find((k) => data[k] !== undefined && data[k] !== null && data[k] !== "");
    if (passwordSource) out.accountPassword = String(data[passwordSource]);
    copy("batch", ["batchName", "assignedBatch"]);
    if (Array.isArray(data.batchNames)) {
      const names = data.batchNames.map((v) => String(v).trim()).filter(Boolean);
      if (names.length) out.batchNames = names;
    }
  }

  if (entity === "loan") {
    copy("from", ["borrower", "lender", "person", "company"]);
    copy("kind", ["type"]);
    if (data.amount != null && data.amount !== "") out.amount = numberValue(data.amount);
    copy("contact", ["phone", "contactNumber"]);
  }

  if (entity === "project") {
    copy("name", ["projectName"]);
    copy("ownerName", ["owner", "client"]);
    if (data.totalCost != null && data.totalCost !== "") out.totalCost = numberValue(data.totalCost);
    copy("ownerPhone", ["phone", "contact", "contactNumber"]);
  }

  if (entity === "employee") {
    copy("name"); copy("specialization", ["subject", "department", "role"]);
    if (data.salary != null && data.salary !== "") out.salary = numberValue(data.salary);
    if (data.joiningDate != null && data.joiningDate !== "") out.joiningDate = normalizeDate(data.joiningDate);
  }

  if (entity === "expense") {
    copy("title", ["name", "expenseName", "item"]);
    if (data.amount != null && data.amount !== "") out.amount = numberValue(data.amount);
    copy("description", ["details", "note", "reason"]);
    if (data.date != null && data.date !== "") out.date = normalizeDate(data.date);
  }

  return out;
};

const entityInfo = {
  student: { words: /\b(student|students|enroll|enrollment)\b/i, page: "/students" },
  teacher: { words: /\b(teacher|teachers|faculty)\b/i, page: "/teachers" },
  loan: { words: /\b(loan|loans)\b/i, page: "/loans" },
  project: { words: /\b(project|projects)\b/i, page: "/projects" },
  employee: { words: /\b(employee|employees|staff)\b/i, page: "/employees" },
  expense: { words: /\b(expense|expenses|expenditure|spending)\b/i, page: "/expenses" },
  attendance: { words: /\b(attendance|attendances|attendance log|check-ins?)\b/i, page: "/attendance" },
  settings: { words: /\b(settings|setting|account settings|security settings)\b/i, page: "/settings" },
};

const addWords = /\b(add|create|new|enroll|register|registration)\b/i;
const saveWords = /\b(save|submit|confirm|finish|done)\b/i;

// Add-form dates are intentionally controlled by the page, not by speech/LLM
// parsing.  A new Student/Teacher/Employee always starts with today's browser
// local date, and a new Expense always starts with today's browser local date.
// If the user asks for a different date, the form stays on today and the user
// is told to change it manually.
const hasNonTodayDateRequest = (text, entity) => {
  if (!["student", "teacher", "employee", "expense"].includes(entity)) return false;
  const value = String(text || '').toLowerCase();

  // "today" / "aaj" means the automatic default and needs no manual prompt.
  if (/\b(?:today|aaj|aj|current\s+date|today's\s+date)\b/i.test(value)) return false;

  const explicitDate = /(?:\b\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}\b|\b\d{4}[\/-]\d{1,2}[\/-]\d{1,2}\b|\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b|\b(?:yesterday|tomorrow|day\s+after\s+tomorrow|next\s+(?:day|week)|previous\s+(?:day|week)|last\s+(?:day|week))\b)/i;
  if (!explicitDate.test(value)) return false;

  // A date is only relevant to these NEW-record fields. It is safe to prompt
  // for manual entry when the user gives a date anywhere in an add command.
  const field = entity === 'expense'
    ? /\b(?:expense\s+)?date\b/i
    : /\b(?:joining\s+date|join\s+date|joining|joined)\b/i;
  return field.test(value) || /\b(?:add|create|new|enroll|register)\b/i.test(value);
};

const searchWords = /\b(search|find|lookup|show|display|list|dikhao|dikao|dikha|dekhao|dekhayo|batao|bata|find by|search by)\b/i;

// Extract only the value the user wants to search for.  Voice commands often
// contain helper words such as "mujy", "ki list show karo", "by", or "wale".
// Those words must NEVER be copied into the real page search box because the
// page performs a literal substring search.  This helper intentionally returns
// the smallest meaningful search phrase rather than the whole sentence.
export const extractVoiceSearchQuery = (text, entity) => {
  let value = String(text || "").trim();
  if (!value) return null;

  // An Add/Create/New command is a form-entry workflow, never a quick search.
  // This guard is especially important for phone numbers: the old extractor
  // treated any spoken phone number as a search even when it followed
  // "add a new student/project/loan".
  if (addWords.test(value)) return null;

  // Phone searches: always return digits only.
  const phone = value.match(/(?:\+?\d[\d\s().-]{6,}\d)/);
  if (phone) {
    const digits = phone[0].replace(/\D/g, "");
    if (digits.length >= 7) return digits;
  }

  const entityWords = {
    student: ['student', 'students', 'studenton'],
    teacher: ['teacher', 'teachers', 'faculty'],
    project: ['project', 'projects'],
    employee: ['employee', 'employees', 'staff'],
    expense: ['expense', 'expenses', 'expenditure', 'spending'],
    loan: ['loan', 'loans'],
  };

  const hasSearchCue = searchWords.test(value) ||
    /\b(?:ki|ka|ke)\s+(?:list|data|record|records|entry|entries)\b/i.test(value) ||
    /\b(?:wale|walay|waly|walon|wali|named|called|whose|having)\b/i.test(value);
  if (!hasSearchCue) return null;

  const entities = entityWords[entity] || [];
  const entityRegex = entities.join('|');

  // Keep the part of a long command that actually describes the requested
  // records. This handles commands such as:
  // "teacher page par jao aur mujhe sirf machine learning wali teacher ki list dikhao"
  // -> "machine learning"
  const clauses = value
    .split(/\b(?:aur|and|then|phir)\b/i)
    .map((s) => s.trim())
    .filter(Boolean);
  const entityClause = [...clauses].reverse().find((s) =>
    new RegExp(`\\b(?:${entityRegex})\\b`, 'i').test(s)
  ) || value;

  let candidate = entityClause;

  // Field-labelled searches: "by name Ali", "specialization machine learning",
  // "teacher name is Ali", "project owner Ahmed", etc.
  const fieldPattern = /(?:by|with|whose|having)?\s*(?:the\s+)?\b(?:name|speciali[sz]ation|specialisation|subject|phone|mobile|number|title|expense\s+name|project\s+name|owner(?:\s+name)?|contact|person|company|role|department)\b\s*(?:is|=|:)?\s*(.+)$/i;
  const fieldMatch = candidate.match(fieldPattern);
  if (fieldMatch) {
    candidate = fieldMatch[1];
  }

  // "named/called Ali" is another common speech pattern.
  const namedMatch = candidate.match(/\b(?:named|called)\s+(.+?)(?=\s+(?:ki|ka|ke)\s+(?:list|data|record)|\s+(?:list|data|records)\b|$)/i);
  if (namedMatch) candidate = namedMatch[1];

  // Roman-Urdu pattern: "machine learning wali teacher" / "sirf machine
  // learning wale students". Capture the words immediately before wali/wale.
  const waliMatch = candidate.match(/(?:^|\b(?:sirf|only)\s+)(.+?)\s+\b(?:wali|wale|walay|waly|walon)\b/i);
  if (waliMatch) candidate = waliMatch[1];
  else {
    const beforeEntity = candidate.match(new RegExp(`(?:^|\\b(?:sirf|only)\\s+)(.+?)\\s+(?:${entityRegex})\\b`, 'i'));
    if (beforeEntity && beforeEntity[1].trim()) candidate = beforeEntity[1];
  }

  // Remove the navigation/search shell from the remaining candidate.
  const stopWords = new Set([
    'aap','ap','aisa','aise','is','are','please','mujhe','mujy','mujhy','mujko','mujhko',
    'sirf','only','show','display','find','search','lookup','get','give','me','the','this','that',
    'list','lists','data','record','records','entry','entries','all','every','ki','ka','ke','k','ko',
    'par','pe','pa','andar','ainder','aindar','under','indar','mein','me','wale','walay','waly','walon','wali','logo','logon',
    'karo','kar','karna','kardo','dikhao','dikao','dikha','dekhao','dekhayo','dekh','dikhana',
    'batao','bata','chahiye','go','to','and','page','on','at','jao','jaye','jayen','jana','jane',
    'name','naam','course','specialization','specialisation','subject','position','role','department',
    'project','projectname','expense','expenses','loan','loans','person','company','student','students',
    'studenton','teacher','teachers','faculty','employee','employees','staff','expenditure','spending',
    'phone','mobile','number','contact','owner','title','called','named','with','whose','having','by',
    'for','of','in','is','are','page','per','wale','ki','ka','ke','delete','remove','erase','del','edit','update','modify','change','view','open','details','detail','see','dekho','dekhna','activate','deactivate','disable','enable','inactive','active','band','off','on'
  ]);

  candidate = candidate.toLowerCase();
  candidate = candidate
    .replace(/^[,.:;!?\-]+|[,.:;!?\-]+$/g, ' ')
    .replace(/\b(?:please|mujhe|mujy|mujhy|mujko|mujhko)\b/g, ' ')
    .replace(/\b(?:show|display|find|search|lookup|get|give)(?:\s+me)?\b/g, ' ')
    .replace(/\b(?:dikhao|dikao|dikha|dekhao|dekhayo|dekh|dikhana|batao|bata|karo|karna|kardo)\b/g, ' ')
    .replace(/\b(?:ki|ka|ke|k|ko|par|pe|pa|andar|ainder|aindar|under|indar|mein|me|wale|walay|waly|walon|wali|logo|logon)\b/g, ' ')
    .replace(/\b(?:go|to|and|then|phir|page|on|at|jao|jaye|jayen|jana|jane)\b/g, ' ')
    .replace(/\b(?:list|lists|data|record|records|entry|entries|all|every|the|this|that|these|those|by|with|for|of|whose|having|named|called)\b/g, ' ');

  for (const word of entities) {
    candidate = candidate.replace(new RegExp(`\\b${word}\\b`, 'gi'), ' ');
  }

  candidate = candidate
    .replace(/\s+/g, ' ')
    .trim();

  // Remove a final generic command fragment if it survived token cleanup.
  const words = candidate.split(/\s+/).filter(Boolean).filter((word) => !stopWords.has(word));
  candidate = words.join(' ').trim();

  if (!candidate) return null;

  // Canonicalize common spoken form used by the UI/database.
  candidate = candidate.replace(/\bui\s*\/?\s*ux\b/gi, 'UI/UX');
  candidate = candidate.replace(/\s+/g, ' ').trim();
  return candidate || null;
};


// Voice CRUD action intent for existing records. The frontend resolves the
// requested record against the live page data so duplicate names can be
// handled safely before any edit/delete/status change is performed.
export const entityActionIntent = (text, currentPage) => {
  const value = String(text || '').trim();
  const lower = value.toLowerCase();
  const pageMap = {
    '/students': 'student', '/teachers': 'teacher', '/projects': 'project',
    '/employees': 'employee', '/expenses': 'expense', '/loans': 'loan'
  };
  const pageWords = {
    student: /\b(student|students|studenton)\b/i,
    teacher: /\b(teacher|teachers|faculty)\b/i,
    project: /\b(project|projects)\b/i,
    employee: /\b(employee|employees|staff)\b/i,
    expense: /\b(expense|expenses|expenditure|spending)\b/i,
    loan: /\b(loan|loans)\b/i,
  };
  const entity = Object.keys(pageWords).find((key) => pageWords[key].test(value)) || pageMap[currentPage];
  if (!entity) return null;
  const entityWordsForAction = {
    student: ['student','students','studenton'], teacher: ['teacher','teachers','faculty'],
    project: ['project','projects'], employee: ['employee','employees','staff'],
    expense: ['expense','expenses','expenditure','spending'], loan: ['loan','loans']
  };

  let operation = null;
  if (/\b(deactivate|de-activate|disable|inactive|band|band karo|off)\b/i.test(value)) operation = 'deactivate';
  else if (/\b(activate|activate karo|enable|active|on)\b/i.test(value)) operation = 'activate';
  else if (/\b(delete|remove|erase|del|delete karo|remove karo)\b/i.test(value)) operation = 'delete';
  else if (/\b(edit|update|modify|change|edit karo|update karo)\b/i.test(value)) operation = 'edit';
  else if (/\b(view|open|details|detail|see|dekho|dekhna|view karo|open karo)\b/i.test(value)) operation = 'view';
  if (!operation) return null;

  // A bare action such as "delete student" is not enough to identify a row.
  // Reuse the hardened search extractor by adding a harmless search cue; it
  // strips navigation/action shell words and keeps only the target value.
  let extracted = extractVoiceSearchQuery(`show ${value}`, entity);
  if (!extracted) {
    // Fallback for short action commands where the normal search extractor
    // intentionally requires a search cue. Keep only likely target words.
    const entityWord = new RegExp(`\\b(?:${entityWordsForAction[entity].join('|')})\\b`, 'gi');
    extracted = value
      .replace(/\b(?:delete|remove|erase|del|edit|update|modify|change|view|open|details?|see|dekho|dekhna|activate|deactivate|disable|enable|inactive|active|band|off|on)\b/gi, ' ')
      .replace(/\b(?:please|mujhe|mujy|mujhy|mujko|mujhko|the|this|that|person|his|her|their|name|naam|is|ko|ki|ka|ke|par|pe|pa|andar|ainder|aindar|under|indar|mein|me|karo|kar|kardo|go|to|and|then|phir|page|for|of|in|with|whose|having|named|called)\b/gi, ' ')
      .replace(entityWord, ' ')
      .replace(/[^a-zA-Z0-9@._+\/ -]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  if (!extracted) return { entity, operation, target_query: null, qualifier: null };

  let targetQuery = String(extracted)
    .replace(/\b(?:his|her|their|the|person|name|naam|is|please)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  let qualifier = null;
  if (entity === 'project') {
    const owner = value.match(/\b(?:owner|client)(?:\s+name)?\s*(?:is|=|:)?\s*([a-z0-9][a-z0-9 ._-]*?)(?=\s+(?:for|with|contact|phone|number)\b|$)/i);
    if (owner) {
      qualifier = { type: 'owner', value: owner[1].trim() };
      targetQuery = extractVoiceSearchQuery(`show ${value.replace(owner[0], '')}`, entity) || targetQuery;
    }
  }
  if (entity === 'loan') {
    const contact = value.match(/\b(?:contact|phone|mobile|number|contact number)\s*(?:is|=|:)?\s*(\+?\d[\d\s().-]{6,}\d)/i);
    if (contact) {
      qualifier = { type: 'contact', value: contact[1].replace(/\D/g, '') };
      const withoutContact = value.replace(contact[0], '');
      const q = extractVoiceSearchQuery(`show ${withoutContact}`, entity);
      if (q && !/^\d{7,}$/.test(q)) targetQuery = q;
    }
  }
  return { entity, operation, target_query: targetQuery, qualifier };
};

// Dashboard-specific date parsing.  Dashboard custom ranges are intentionally
// deterministic and do not depend on Gemini: voice can provide exact calendar
// dates in numeric form (1-7-2026), month-name form (1 January 2026), or common
// speech/transcription misspellings (for example "febrary").
const DASHBOARD_MONTHS = {
  jan: 0, january: 0,
  feb: 1, february: 1, febrary: 1, februery: 1,
  mar: 2, march: 2,
  apr: 3, april: 3,
  may: 4,
  jun: 5, june: 5,
  jul: 6, july: 6,
  aug: 7, august: 7,
  sep: 8, sept: 8, september: 8, septemper: 8,
  oct: 9, october: 9,
  nov: 10, november: 10,
  dec: 11, december: 11,
};

const pad2 = (n) => String(n).padStart(2, "0");

const makeYMD = (year, monthIndex, day) => {
  const y = Number(year);
  const m = Number(monthIndex);
  const d = Number(day);
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return null;
  if (y < 1900 || y > 2100 || m < 0 || m > 11 || d < 1 || d > 31) return null;
  const check = new Date(Date.UTC(y, m, d));
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== m || check.getUTCDate() !== d) return null;
  return `${y}-${pad2(m + 1)}-${pad2(d)}`;
};

const pktTodayYMD = () => {
  const shifted = new Date(Date.now() + (5 * 60 * 60 * 1000));
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
  };
};

const shiftCalendarMonth = (year, monthIndex, delta) => {
  const total = year * 12 + monthIndex + delta;
  return {
    year: Math.floor(total / 12),
    month: ((total % 12) + 12) % 12,
  };
};

const daysInMonth = (year, monthIndex) => new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();

const monthRangeYMD = (year, monthIndex) => ({
  startDate: makeYMD(year, monthIndex, 1),
  endDate: makeYMD(year, monthIndex, daysInMonth(year, monthIndex)),
});

const extractDashboardDates = (text) => {
  const value = String(text || "");
  const matches = [];

  // ISO / slash / hyphen numeric forms.  2026-08-16 is also accepted.
  const numeric = /\b(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})\b|\b(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})\b/g;
  for (const match of value.matchAll(numeric)) {
    let date = null;
    if (match[1]) date = makeYMD(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    else {
      let year = Number(match[6]);
      if (year < 100) year += 2000;
      date = makeYMD(year, Number(match[5]) - 1, Number(match[4]));
    }
    if (date) matches.push({ date, index: match.index ?? 0, raw: match[0] });
  }

  // Natural month names, including frequent speech-to-text variants.
  const monthNames = Object.keys(DASHBOARD_MONTHS).sort((a, b) => b.length - a.length).join("|");
  const named = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${monthNames})\\s+(\\d{4})\\b`, "gi");
  for (const match of value.matchAll(named)) {
    const month = DASHBOARD_MONTHS[String(match[2]).toLowerCase()];
    const date = makeYMD(Number(match[3]), month, Number(match[1]));
    if (date) matches.push({ date, index: match.index ?? 0, raw: match[0] });
  }

  // De-duplicate a date that could have been recognized by more than one form.
  return matches
    .sort((a, b) => a.index - b.index)
    .filter((item, i, arr) => i === 0 || item.date !== arr[i - 1].date);
};

const dashboardRelativeRange = (text) => {
  const value = String(text || "").toLowerCase();
  const now = pktTodayYMD();

  // "previous month se lekar abhi tak" / "last month until now" means the
  // first day of the previous calendar month through today's date.
  if (
    /\b(?:previous|last)\s+month\b[\s\S]*\b(?:se\s+(?:le|li)kar|se\s+le\s+kar|until|till|through|upto|up\s+to)\b[\s\S]*\b(?:abhi|abi|now|today)\b/i.test(value) ||
    /\b(?:from|since)\s+(?:the\s+)?(?:previous|last)\s+month\b[\s\S]*\b(?:abhi|abi|now|today)\b/i.test(value)
  ) {
    const prev = shiftCalendarMonth(now.year, now.month, -1);
    return {
      startDate: makeYMD(prev.year, prev.month, 1),
      endDate: makeYMD(now.year, now.month, now.day),
      rangeLabel: "previous month through today",
    };
  }

  // "previous five month(s)" / "last 5 months" means the month exactly N
  // calendar months before the current month, selecting that whole month.
  const countWords = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };
  const countMatch = value.match(/\b(?:previous|last|past)\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+months?\b|\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+months?\s+(?:ago|back)\b/);
  if (countMatch) {
    const rawCount = countMatch[1] || countMatch[2];
    const count = countWords[rawCount] || Number(rawCount);
    if (Number.isInteger(count) && count >= 1 && count <= 12) {
      const explicitYearMatch = value.match(/\b(19\d{2}|20\d{2})\b/);
      const target = shiftCalendarMonth(now.year, now.month, -count);
      if (explicitYearMatch) target.year = Number(explicitYearMatch[1]);
      return { ...monthRangeYMD(target.year, target.month), rangeLabel: `${count} month${count === 1 ? "" : "s"} ago` };
    }
  }

  // "previous month" / "last month" selects the complete previous month as
  // a custom range, rather than merely pressing the Last Month quick filter.
  if (/\b(?:previous|last)\s+month\b/i.test(value)) {
    const prev = shiftCalendarMonth(now.year, now.month, -1);
    return { ...monthRangeYMD(prev.year, prev.month), rangeLabel: "previous month" };
  }

  return null;
};

const dashboardFilterIntent = (text, currentPage) => {
  const value = String(text || "").trim();
  const lower = value.toLowerCase();
  const explicitlyDashboard = /\b(?:dashboard|dashbord|home dashboard)\b/i.test(value);
  const onDashboard = currentPage === "/";
  if (!explicitlyDashboard && !onDashboard) return null;

  // Exact/obvious quick-filter commands.
  if (/\blast\s+(?:month|mo)\b/i.test(lower) && !/\b(?:custom|date|range|from|until|till|through|upto|abhi|now|today)\b/i.test(lower) && !/\bse\s+(?:le|li)kar\b/i.test(lower)) {
    return { filter: "lastMonth", reply: "Switched dashboard filter to Last Month." };
  }
  if (/\b(?:this\s+month|this\s+mo|current\s+month)\b/i.test(lower)) {
    return { filter: "thisMonth", reply: "Switched dashboard filter to This Month." };
  }
  if (/\b(?:today|aaj|aj)\b/i.test(lower) && !/\b(?:custom|date|range)\b/i.test(lower)) {
    return { filter: "today", reply: "Switched dashboard filter to Today." };
  }
  if (/(?:^|\s)(?:all|all\s+time)(?:\s|$)/i.test(lower) && !/\b(?:custom|date|range)\b/i.test(lower)) {
    return { filter: "all", reply: "Showing all historical data on dashboard." };
  }

  const dates = extractDashboardDates(value);
  const relative = dashboardRelativeRange(value);
  const customCue = /\b(?:custom|date|range|from|to|upto|up\s+to|until|till|previous|last|ago|back)\b/i.test(lower);

  if (relative) {
    return {
      filter: "custom",
      startDate: relative.startDate,
      endDate: relative.endDate,
      dateField: null,
      reply: `Applied dashboard custom range for ${relative.rangeLabel}: ${relative.startDate} to ${relative.endDate}.`,
    };
  }

  if (dates.length || (explicitlyDashboard && /\bcustom\b/i.test(lower))) {
    if (!dates.length) {
      return { filter: "custom", startDate: null, endDate: null, dateField: null, reply: "Opened the dashboard Custom date range." };
    }

    const fromCue = /\b(?:from|starting|start)\b/i.test(lower);
    const toCue = /\b(?:to|until|till|upto|up\s+to|ending|end)\b/i.test(lower);
    let startDate = null;
    let endDate = null;

    if (dates.length >= 2) {
      startDate = dates[0].date;
      endDate = dates[1].date;
    } else if (toCue && !fromCue) {
      endDate = dates[0].date;
    } else {
      // With a single date, "from ..." naturally fills From; a bare date in
      // a custom dashboard command also defaults to From so the user can then
      // supply To in a second voice command.
      startDate = dates[0].date;
    }

    if (startDate && endDate && startDate > endDate) {
      [startDate, endDate] = [endDate, startDate];
    }

    return {
      filter: "custom",
      startDate,
      endDate,
      dateField: startDate && !endDate ? "start" : !startDate && endDate ? "end" : null,
      reply: startDate && endDate
        ? `Applied dashboard custom range from ${startDate} to ${endDate}.`
        : startDate
          ? `Set dashboard Custom From date to ${startDate}. Please provide the To date when you are ready.`
          : `Set dashboard Custom To date to ${endDate}. Please provide the From date when you are ready.`,
    };
  }

  // "go to dashboard custom" is still a useful command even with no date.
  if (explicitlyDashboard && /\bcustom\b/i.test(lower) && customCue) {
    return { filter: "custom", startDate: null, endDate: null, dateField: null, reply: "Opened the dashboard Custom date range." };
  }

  return null;
};

// Page-level date/stat filter intent. These filters mirror the four date
// buttons rendered on each management page: Today, This Month, Last Month,
// and All. When a page is explicitly mentioned, this MUST be handled before
// the dashboard date intent so "go to student and show today data" never
// changes the dashboard by mistake.
const pageDateFilterIntent = (text, currentPage) => {
  const value = String(text || "").toLowerCase().trim();

  const pageMap = {
    "/students": "student",
    "/teachers": "teacher",
    "/projects": "project",
    "/employees": "employee",
    "/loans": "loan",
    "/expenses": "expense",
    "/attendance": "attendance",
  };

  const pageWords = {
    student: /\b(student|students|studenton)\b/i,
    teacher: /\b(teacher|teachers|faculty)\b/i,
    project: /\b(project|projects)\b/i,
    employee: /\b(employee|employees|staff)\b/i,
    loan: /\b(loan|loans)\b/i,
    expense: /\b(expense|expenses|expenditure|spending)\b/i,
    attendance: /\b(attendance|attendances|attendance log|check-ins?)\b/i,
  };

  // Explicit page wins; otherwise use the page currently open.
  const explicitEntity = Object.keys(pageWords).find((key) => pageWords[key].test(value));
  const entity = explicitEntity || pageMap[currentPage];
  if (!entity) return null;
  const pageForEntity = {
    student: "/students",
    teacher: "/teachers",
    project: "/projects",
    employee: "/employees",
    loan: "/loans",
    expense: "/expenses",
    attendance: "/attendance",
  };

  // Student has two non-date filter controls that also use words such as
  // "all". Never let the date filter steal those commands.
  if (entity === "student" && (
    /\b(paid|free|workspace|all types|all students|every student|sab students|saray students|saare students)\b/i.test(value) ||
    /\b(batch|batches|batchon|batch wale|batch walay|batch walon)\b/i.test(value)
  )) return null;

  // Require a date/category cue so a normal command containing an entity
  // does not accidentally change the stat period.
  const hasDateCue =
    /\b(today|today's|aaj|aj|aaj ka|aaj ki|aaj ke)\b/i.test(value) ||
    /\b(this month|this mo|current month|current mo|is month|iss month|is mahine|iss mahine|yeh mahina|ye month)\b/i.test(value) ||
    /\b(last month|last mo|previous month|previous mo|previous|pichlay month|pichle month|pichla mahina|pichlay mahine|pichle mahine|pichla)\b/i.test(value) ||
    /\b(all|all data|all records|all history|all time|historical|every)\b/i.test(value);

  if (!hasDateCue) return null;

  if (/\b(last month|last mo|previous month|previous mo|previous|pichlay month|pichle month|pichla mahina|pichlay mahine|pichle mahine|pichla)\b/i.test(value)) {
    return { entity, filter: "lastMonth" };
  }
  if (/\b(this month|this mo|current month|current mo|is month|iss month|is mahine|iss mahine|yeh mahina|ye month)\b/i.test(value)) {
    return { entity, filter: "thisMonth" };
  }
  if (/\b(all|all data|all records|all history|all time|historical|every)\b/i.test(value)) {
    return { entity, filter: "all" };
  }
  if (/\b(today|today's|aaj|aj|aaj ka|aaj ki|aaj ke)\b/i.test(value)) {
    return { entity, filter: "today" };
  }

  return null;
};

// Student batch filter intent. This is separate from generic search so a
// command such as "go to student and show all batches" controls the existing
// batch dropdown instead of writing command text into the search box.
const studentBatchFilterIntent = (text) => {
  const value = String(text || '').toLowerCase().trim();
  const studentContext = /\b(student|students|studenton)\b/i.test(value);
  const batchCue = /\b(batch|batches|batchon|batch wale|batch walay|batch walon)\b/i.test(value);
  if (!studentContext || !batchCue) return null;

  if (/\b(all batches|all batch|sab batches|sabhi batches|tamam batches|every batch|all batchon)\b/i.test(value)) {
    return 'all';
  }

  const cleanCandidate = (raw) => String(raw || '')
    .toLowerCase()
    .replace(/\b(?:aap|ap|aisa|aise|go|to|page|par|pe|pa|jao|jaye|student|students|studenton|show|display|find|search|lookup|list|dikhao|dikao|dikha|dekhao|dekhayo|batao|mujhe|mujy|sirf|only|ki|ka|ke|ko|mein|me|and|aur|then|phir|please|karo|kar|kardo|wale|walay|waly|walon|wali|logo|logon|andar|ainder|aindar|under|indar|batch|batches)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // "summer batch wale students" -> "summer"
  const beforeBatch = value.match(/\b([a-z0-9][a-z0-9 _-]*?)\s+batch(?:es)?\b/i);
  let candidate = beforeBatch ? cleanCandidate(beforeBatch[1]) : '';

  // "batch summer wale students" / "batch is summer"
  const afterBatch = value.match(/\bbatch(?:es)?\s*(?:is|=|:)?\s*([a-z0-9][a-z0-9 _-]*?)(?=\s+(?:wale|walay|walon|students?|studenton|ki|ka|ke|list|show|display|dikhao|dikao|dikha|dekhao|dekhayo|batao|par|pe|mein|ainder|andar)\b|$)/i);
  if (afterBatch && afterBatch[1].trim()) candidate = cleanCandidate(afterBatch[1]);

  // If speech placed navigation words between the student and batch name,
  // keep only the meaningful words left after removing that shell.
  if (!candidate) candidate = cleanCandidate(value);

  if (!candidate || /^(all|every|sab|sabhi|tamam)$/.test(candidate)) return 'all';
  return candidate;
};

// Student list/filter intent. This is deliberately handled without Gemini so
// simple filter commands remain fast and reliable even if the AI service is
// unavailable. It also accepts common Roman-Urdu phrases used with the voice
// assistant (e.g. "paid internship wale", "free internship ki list dikhao").
const studentFilterIntent = (text) => {
  const value = String(text || "").toLowerCase().trim();
  const hasStudentContext =
    /\b(student|students|studenton|student ka|student ke|student ki|students ki|students ke)\b/i.test(value) ||
    /\b(students?\s+(?:type|list|wale|walon|logo|logon))\b/i.test(value);
  const hasListVerb =
    /\b(list|show|display|dikhao|dikao|dikha|dikhana|dekhna|dekhao|dekhayo|batao|bata|filter|only|sirf|wale|walay|walon|logo|logon|types?)\b/i.test(value);
  const hasWorkspace = /\b(workspace|work space|workspace wale|workspace walay|workspace walon)\b/i.test(value);
  const hasPaid = /\b(paid|paid internship|paid internships|paid intership|paid interships|paid intern|paid interns|paid wale|paid walay|paid walon)\b/i.test(value);
  const hasFree = /\b(free|free internship|free internships|free intership|free interships|free intern|free interns|free wale|free walay|free walon)\b/i.test(value);
  const hasAll = /\b(all|all types|all students|every student|sab|sabhi|saray|saare|tamam|sab students|saray students|saare students)\b/i.test(value);

  // Do not steal a generic dashboard command such as "show all". A student
  // filter requires explicit student context, or an explicit student type.
  if (!hasStudentContext && !hasWorkspace && !hasPaid && !hasFree) return null;

  if (hasWorkspace) return "workspace";
  if (hasPaid) return "paid";
  if (hasFree) return "free";
  if (hasAll && hasStudentContext) return "all";

  return null;
};


const editFieldSchemas = {
  student: `name, email, phone, courseType (workspace|free|paid), courseName, duration, joiningDate (YYYY-MM-DD), registrationFee (number), monthlyFee (number), timing`,
  teacher: `name, specialization, salary (number), joiningDate (YYYY-MM-DD), accountEmail, accountPassword, batch, batchNames (array of existing batch names)`,
  employee: `name, specialization, salary (number), joiningDate (YYYY-MM-DD)`,
  project: `name, ownerName, totalCost (number), ownerPhone`,
  expense: `title, amount (number), description, date (YYYY-MM-DD)`,
  loan: `from, kind (person|company), amount (number), contact`,
};

const normalizeEditData = (entity, data = {}) => normalizeData(entity, data);

const editFieldLabel = (entity) => ({
  student: 'student', teacher: 'teacher', employee: 'employee', project: 'project', expense: 'expense', loan: 'loan'
}[entity] || 'record');

export const processVoiceCommand = async (req, res) => {
  try {
    const { query, currentState = {}, currentPage } = req.body;
    if (!query) return res.status(400).json({ action: "NONE", reply: "No query provided." });

    const lower = String(query).toLowerCase().trim();
    const cancelPattern = /\b(cancel|cancel it|cancel this|cancel now|leave it|leave this|leave it alone|rahne do|rehne do|wapis jao|wapas jao|back home|go back home|home)\b/i;

    // ------------------------------------------------------------------
    // Existing-record edit workflow. Once a page has opened an Edit modal,
    // subsequent voice turns are treated as field updates for that exact
    // record. This prevents phrases such as "change the name to ..." from
    // being mistaken for a brand-new edit/search command.
    // ------------------------------------------------------------------
    const editContext = currentState?.editContext;
    if (editContext?.entity && editContext?.targetId && editFieldSchemas[editContext.entity]) {
      const editEntity = editContext.entity;
      const editPage = entityInfo[editEntity]?.page;

      if (cancelPattern.test(lower)) {
        return res.json({
          action: 'CANCEL_EDIT',
          target_page: editPage,
          reply: `Cancelled editing the ${editFieldLabel(editEntity)}.`
        });
      }

      if (/\b(save|save changes|save it|submit|confirm|finish|done|update it)\b/i.test(lower)) {
        return res.json({
          action: 'SAVE_EDIT',
          target_page: editPage,
          entity: editEntity,
          reply: `Saving the changes to this ${editFieldLabel(editEntity)} now.`
        });
      }

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ action: 'CHAT', reply: 'Gemini API key missing in .env file.' });
      }

      const systemInstruction = `
You are the voice assistant for an internal software-house management system.
The user is ALREADY editing an existing ${editEntity}. Do NOT create a new record.
Return RAW JSON ONLY, no markdown:
{
  "action": "UPDATE_EDIT_FORM",
  "target_page": "${editPage}",
  "entity": "${editEntity}",
  "reply": "short conversational confirmation",
  "data": { ${editFieldSchemas[editEntity]} }
}

Rules:
1. Extract ONLY fields the user explicitly wants to change in this turn.
2. Never copy command-shell words such as "karo", "please", "mujhe", "andar", "ainder", "page", "student", "teacher", "employee", "project", "expense", or "loan" into a field unless the user clearly intends that exact value.
3. Understand natural English and common Roman Urdu, including phrases like "name change into Umar Nasir", "naam Umar Nasir kar do", "phone number change to...", "salary 50000 kar do", "course UI UX kar do".
4. Map spoken field names to the schema. For students: name, email, phone, courseType, courseName, duration, joiningDate, registrationFee, monthlyFee, timing. For teachers/employees: name, specialization, salary, joiningDate. For projects: name, ownerName, totalCost, ownerPhone. For expenses: title, amount, description, date. For loans: from, kind, amount, contact.
5. For student courseType use exactly workspace, free, or paid. For loan kind use exactly person or company.
6. For numeric values return plain numbers. For dates return YYYY-MM-DD when reliable.
7. If the user says "change X to Y", Y is the field value. Preserve meaningful spaces and punctuation in names, emails, phone numbers, course names, descriptions, and project names.
8. If no editable field/value can be confidently extracted, return data {} and ask the user to say which field they want to change.
Current editing record context:
${JSON.stringify(editContext.currentForm || {})}
User said: "${query}"
`;

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: systemInstruction }] }],
            generationConfig: { response_mime_type: 'application/json' },
          }),
        }
      );
      const responseData = await response.json();
      if (!response.ok) throw new Error(responseData?.error?.message || `Gemini request failed (${response.status}).`);
      const rawText = responseData?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawText) throw new Error('Gemini returned an empty response.');
      const result = JSON.parse(rawText);
      const normalized = normalizeEditData(editEntity, result.data || {});
      return res.json({
        action: 'UPDATE_EDIT_FORM',
        target_page: editPage,
        entity: editEntity,
        reply: result.reply || 'I updated the requested field in the edit form.',
        data: normalized,
      });
    }

    // Cancel/leave the current voice form workflow immediately.
    if (cancelPattern.test(lower)) {
      const goHome = /\b(back home|go back home|home|wapis jao|wapas jao)\b/i.test(lower);
      return res.json({
        action: "CANCEL_VOICE",
        target_page: goHome ? "/" : null,
        reply: goHome ? "Cancelled. I cleared the form and took you back home." : "Cancelled. I cleared the current form and voice data."
      });
    }

    // Existing-record voice actions (view/edit/delete/activate/deactivate)
    // are handled before search/add routing.
    const requestedEntityAction = entityActionIntent(query, currentPage);
    if (requestedEntityAction) {
      const { entity: actionEntity, operation, target_query, qualifier } = requestedEntityAction;
      if (!target_query) {
        return res.json({
          action: 'CHAT',
          target_page: entityInfo[actionEntity].page,
          reply: `Please tell me which ${actionEntity} you want to ${operation}.`
        });
      }
      const actionLabels = { view: 'view', edit: 'edit', delete: 'delete', activate: 'activate', deactivate: 'deactivate' };
      return res.json({
        action: 'ENTITY_ACTION',
        operation,
        entity: actionEntity,
        target_query,
        qualifier,
        target_page: entityInfo[actionEntity].page,
        reply: `I will ${actionLabels[operation]} ${target_query} on the ${actionEntity} page.`
      });
    }

    // Page date/stat filters must run before the dashboard date filter.
    // Examples:
    //   "go to student and show today data"
    //   "student mein this month stats dikhao"
    //   "teachers show last month data"
    //   "employees par all data show karo"
    //   "loans mein aaj ka data dikhao"
    const requestedPageDateFilter = pageDateFilterIntent(query, currentPage);
    if (requestedPageDateFilter) {
      const { entity: dateEntity, filter: dateFilter } = requestedPageDateFilter;
      const labels = {
        today: "Today",
        thisMonth: "This Month",
        lastMonth: "Last Month",
        all: "All",
      };
      return res.json({
        action: "FILTER_PAGE_DATE",
        filter: dateFilter,
        target_page: entityInfo[dateEntity].page,
        reply: `Showing ${labels[dateFilter]} data on the ${dateEntity} page.`,
      });
    }

    // Student batch filter uses the existing Students batch dropdown. When a
    // voice Add Student draft is active, however, "batch summer" means fill
    // the form's batch field — not filter the background student list.
    const activeStudentDraft = Object.keys(currentState?.studentDraft || {}).length > 0;
    const requestedStudentBatchFilter = !activeStudentDraft && !addWords.test(lower)
      ? studentBatchFilterIntent(lower)
      : null;
    if (requestedStudentBatchFilter) {
      return res.json({
        action: "FILTER_STUDENT_BATCH",
        filter: requestedStudentBatchFilter,
        target_page: "/students",
        reply: requestedStudentBatchFilter === "all"
          ? "Showing students from all batches."
          : `Showing students from the ${requestedStudentBatchFilter} batch.`,
      });
    }

    // Student type/list filters are handled before dashboard "all/show all"
    // matching, because commands such as "show all paid internship" contain
    // the word "all" but are specifically about the Students page.
    // Examples: "go to student and show all paid internship",
    // "student ka free internship wale logo ki list dikhao",
    // "student par workspace walay students dikhao".
    // IMPORTANT: course-type words are also valid student form values.
    // Never let them win the Students list-filter route while an Add Student
    // command/form is active. For example:
    //   "new student add karo aur paid internship karo"
    //   "workspace select karo"
    // must update the Add Student form, not the page filter/search bar.
    const studentVoiceFormActive = Object.keys(currentState?.studentDraft || {}).length > 0;
    const studentFormTurn = addWords.test(lower) || (currentPage === "/students" && studentVoiceFormActive);
    const requestedStudentFilter = studentFormTurn ? null : studentFilterIntent(lower);
    if (requestedStudentFilter) {
      return res.json({
        action: "FILTER_STUDENTS",
        filter: requestedStudentFilter,
        target_page: "/students",
        reply: requestedStudentFilter === "all"
          ? "Showing all students."
          : `Showing all ${requestedStudentFilter === "paid" ? "paid internship" : requestedStudentFilter === "free" ? "free internship" : "workspace"} students.`,
      });
    }

    // Dashboard filters. This runs before page-level filters when the user
    // explicitly says Dashboard, while a command from another page without a
    // page name still belongs to that currently-open page. Custom ranges can
    // carry exact From/To dates or intelligently calculated relative ranges.
    const requestedDashboardFilter = dashboardFilterIntent(query, currentPage);
    if (requestedDashboardFilter) {
      return res.json({
        action: "FILTER_DASHBOARD",
        filter: requestedDashboardFilter.filter,
        startDate: requestedDashboardFilter.startDate || null,
        endDate: requestedDashboardFilter.endDate || null,
        target_page: "/",
        reply: requestedDashboardFilter.reply,
      });
    }

    // Identify the entity from the command or the current page.
    let entity = Object.keys(entityInfo).find((key) => entityInfo[key].words.test(lower));
    if (!entity) {
      const pageEntity = {
        "/students": "student",
        "/teachers": "teacher",
        "/loans": "loan",
        "/projects": "project",
        "/employees": "employee",
        "/expenses": "expense",
      };
      entity = pageEntity[currentPage];
    }

    // Exact quick-search intent.  This is intentionally handled before the
    // Gemini/add-form path so only the extracted search value reaches the
    // page's existing search input. Examples:
    //   "mujy haziq ki list show karo" -> "haziq"
    //   "find by this number 1244587345" -> "1244587345"
    //   "mujy ui ux ki list show karo" -> "UI/UX"
    //   "machine learning wale students dikhao" -> "machine learning"
    if (entity) {
      // Once an Add form has been opened, numeric/text values in follow-up
      // turns (especially phone numbers and course types) are form fields,
      // not quick-search queries. The frontend marks the active draft with
      // __voiceFormOpen even when the first Add command contained no data.
      const activeVoiceDraft = Object.keys(currentState?.[`${entity}Draft`] || {}).length > 0;
      const searchQuery = activeVoiceDraft ? null : extractVoiceSearchQuery(query, entity);
      if (searchQuery) {
        return res.json({
          action: "SEARCH_PAGE",
          search_query: searchQuery,
          target_page: entityInfo[entity].page,
          reply: `Searching ${entity} for "${searchQuery}".`,
        });
      }
    }

    // Save/submit uses the existing page form/API.
    if (saveWords.test(lower) && entity) {
      return res.json({
        action: `SAVE_${entity.toUpperCase()}`,
        target_page: entityInfo[entity].page,
        reply: `Saving the ${entity} now.`,
      });
    }

    const stateKey = `${entity}Draft`;
    const draft = entity ? (currentState?.[stateKey] || {}) : {};
    const hasDraft = Object.keys(draft).length > 0;

    // Explicit add/new/create command OR a follow-up data turn in an active draft.
    const isDataTurn = hasDraft || (
      entity &&
      currentPage === entityInfo[entity].page &&
      /\b(name|title|email|email\s+address|gmail|password|phone|number|salary|specialization|subject|department|amount|cost|owner|contact|course|duration|fee|joining|join|type|person|company|description|details|date|expense|batch|select|assign)\b/i.test(lower)
    );

    if (entity && (addWords.test(lower) || isDataTurn)) {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ action: "CHAT", reply: "Gemini API key missing in .env file." });
      }

      const schemas = {
        student: {
          action: "ADD_STUDENT",
          fields: `name, email, phone, courseType (workspace|free|paid), courseName, duration, batch, joiningDate (YYYY-MM-DD), registrationFee (number), monthlyFee (number)`
        },
        teacher: {
          action: "ADD_TEACHER",
          fields: `name, specialization, salary (number), joiningDate (YYYY-MM-DD), accountEmail, accountPassword, batch, batchNames (array of existing batch names)`
        },
        loan: {
          action: "ADD_LOAN",
          fields: `from, kind (person|company), amount (number), contact`
        },
        project: {
          action: "ADD_PROJECT",
          fields: `name, ownerName, totalCost (number), ownerPhone`
        },
        employee: {
          action: "ADD_EMPLOYEE",
          fields: `name, specialization, salary (number), joiningDate (YYYY-MM-DD)`
        },
        expense: {
          action: "ADD_EXPENSE",
          fields: `title, amount (number), description, date (YYYY-MM-DD)`
        },
      };

      const s = schemas[entity];
      const systemInstruction = `
You are the voice assistant for an internal software-house management system.
The current entity is "${entity}".

Return RAW JSON ONLY, no markdown:
{
  "action": "${s.action}",
  "target_page": "${entityInfo[entity].page}",
  "reply": "short conversational response",
  "data": { ${s.fields} }
}

Rules:
1. Extract ONLY fields actually supplied by the user in this turn. Do not invent missing values.
2. The user may say "go to ${entity} and add a new ${entity}" with no fields; in that case return the ADD action with data {} so the frontend opens the correct Add form.
3. If the user is continuing an existing form, return only newly supplied/changed fields.
4. For numeric amounts/salary/cost, return plain numbers without currency symbols or commas.
5. For loan kind use exactly "person" or "company" when stated. If not stated, omit it.
6. For student courseType use exactly workspace, free, or paid when stated.
7. For teachers, if the user says select/assign a batch (for example "summer ko select karo" or "2026 ko assign karo"), return the exact batch name in batch or all requested names in batchNames. Never invent a batch.
8. For teachers, map "email", "email address", "gmail", "login email" to accountEmail and "password", "login password" to accountPassword. Preserve the exact email and password supplied by the user.
9. Do NOT extract or return joiningDate/date for a NEW record. Those fields are controlled by the frontend and automatically start with today's browser-local date. If the user says today/aaj, return no date field. If the user asks for another date, also return no date field; the frontend will keep today's date and the assistant will tell the user to set a different date manually.
10. Never create a database record yourself; the frontend will use the existing form and API.
Current page: ${currentPage || "unknown"}
Existing draft:
${JSON.stringify(draft)}
`;

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: `${systemInstruction}\nUser said: "${query}"` }] }],
            generationConfig: { response_mime_type: "application/json" },
          }),
        }
      );

      const responseData = await response.json();
      if (!response.ok) {
        throw new Error(responseData?.error?.message || `Gemini request failed (${response.status}).`);
      }

      const rawText = responseData?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawText) throw new Error("Gemini returned an empty response.");

      const result = JSON.parse(rawText);
      const normalized = normalizeData(entity, result.data || {});

      // Deterministic safeguards for fields that are commonly mangled by
      // speech-to-text/LLM extraction. These only fill a field when the user
      // explicitly supplied the corresponding cue in this turn.
      if (entity === "student") {
        // Deterministic course-type extraction for natural voice commands.
        // This deliberately supports both labelled commands and the common
        // Roman-Urdu style "paid internship karo / workspace select karo".
        const labelledType = lower.match(/\b(?:course\s*type|internship\s*type|type)\s*(?:is|=|:)?\s*(paid\s+internship|free\s+internship|paid|free|workspace|work\s*space)\b/i);
        const explicitPaid = /\bpaid\s+internships?\b/i.test(lower);
        const explicitFree = /\bfree\s+internships?\b/i.test(lower);
        const explicitWorkspace = /\bwork\s*space\b/i.test(lower);
        const workspaceAction = /\bwork\s*space\b[\w\s]*(?:karo|kar\s+do|select|choose|choose\s+karo|rakh(?:o|na)?|set)\b/i.test(lower);

        if (labelledType) {
          const ct = labelledType[1].toLowerCase().replace(/\s+/g, " ");
          normalized.courseType = ct.includes("workspace") || ct.includes("work space") ? "workspace" : ct.includes("paid") ? "paid" : "free";
        } else if (explicitPaid) {
          normalized.courseType = "paid";
        } else if (explicitFree) {
          normalized.courseType = "free";
        } else if (explicitWorkspace && (addWords.test(lower) || workspaceAction || studentVoiceFormActive)) {
          normalized.courseType = "workspace";
        }
      }

      if (entity === "teacher") {
        const emailMatch = lower.match(/\b(?:email(?:\s+address)?|gmail|login\s+email)\s*(?:is|=|:)?\s*([a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,})\b/i);
        if (emailMatch) normalized.accountEmail = emailMatch[1].trim();

        const passwordMatch = query.match(/\b(?:password|login\s+password)\s*(?:is|=|:)?\s*([^,.;]+?)(?=\s+(?:and|then|with|for)\b|$)/i);
        if (passwordMatch) normalized.accountPassword = passwordMatch[1].trim();

        if (!normalized.batch && !Array.isArray(normalized.batchNames) && /\b(?:select|assign|choose)\b/i.test(lower)) {
          const batchMatch = query.match(/\b(?:batch\s*)?(?:is\s+)?([a-z0-9][a-z0-9 _-]*?)(?=\s+(?:ko|par|pe|please|select|assign|choose|karo|kar\s+do|do)\b|$)/i);
          if (batchMatch) {
            const candidate = batchMatch[1].trim().replace(/\s+batch$/i, "").trim();
            if (candidate && !/^(?:the|this|that|batch|teacher|page|form)$/i.test(candidate)) normalized.batch = candidate;
          }
        }
      }

      // Students may only use a batch that already exists. Voice Assistant
      // must never create a new batch implicitly. Return the canonical batch
      // name when it exists, otherwise keep the batch field empty and clearly
      // tell the user to create it manually first.
      let batchNotice = "";
      if (entity === "teacher") {
        const requested = [];
        if (normalized.batch) requested.push(String(normalized.batch).trim());
        if (Array.isArray(normalized.batchNames)) requested.push(...normalized.batchNames.map((v) => String(v).trim()).filter(Boolean));
        if (requested.length) {
          const unique = [...new Set(requested.map((v) => v.toLowerCase()))];
          const found = await Batch.find({ active: true, name: { $in: unique } }).select("name");
          const foundNames = found.map((b) => b.name);
          const missing = unique.filter((name) => !foundNames.some((f) => f.toLowerCase() === name));
          if (missing.length) {
            batchNotice = ` I could not find existing batch${missing.length > 1 ? "es" : ""} named "${missing.join('", "')}". Please create that batch first.`;
          }
          const ordered = unique.map((name) => foundNames.find((f) => f.toLowerCase() === name)).filter(Boolean);
          delete normalized.batch;
          delete normalized.batchNames;
          if (ordered.length === 1) normalized.batch = ordered[0];
          else if (ordered.length > 1) normalized.batchNames = ordered;
        }
      }

      if (entity === "student" && normalized.batch) {
        const requestedBatch = String(normalized.batch).trim();
        const existingBatch = await Batch.findOne({
          active: true,
          name: requestedBatch.toLowerCase(),
        }).select("name");
        if (existingBatch) {
          normalized.batch = existingBatch.name;
        } else {
          delete normalized.batch;
          batchNotice = ` I could not find an existing batch named "${requestedBatch}". Please create that batch manually first, then select it for the student.`;
        }
      }

      // NEW-record dates are always owned by the frontend form. Never trust a
      // speech/LLM-generated date for Student/Teacher/Employee/Expense. This
      // also prevents an old draft or timezone conversion from changing the
      // date silently.
      if (entity === "student" || entity === "teacher" || entity === "employee") {
        delete normalized.joiningDate;
      }
      if (entity === "expense") {
        delete normalized.date;
      }

      const manualDateNotice = hasNonTodayDateRequest(query, entity)
        ? ` The date is set automatically to today's date. You requested a different date, so please set the ${entity === 'expense' ? 'expense date' : 'joining date'} manually in the form.`
        : '';

      return res.json({
        action: s.action,
        target_page: entityInfo[entity].page,
        reply: (result.reply || `I opened the Add ${entity} form.`) + batchNotice + manualDateNotice,
        data: normalized,
      });
    }

    // Direct navigation fallbacks.
    // Settings is a normal navigation page, not a CRUD entity.
    if (/\b(settings|setting|account settings|security settings)\b/i.test(lower)) {
      return res.json({ action: "NAVIGATE", target_page: "/settings", reply: "Navigating to Settings." });
    }

    if (lower.includes("attendance")) return res.json({ action: "NAVIGATE", target_page: "/attendance", reply: "Navigating to Attendance." });
    if (lower.includes("teacher") || lower.includes("faculty")) return res.json({ action: "NAVIGATE", target_page: "/teachers", reply: "Navigating to Teachers." });
    if (lower.includes("student")) return res.json({ action: "NAVIGATE", target_page: "/students", reply: "Navigating to Students." });
    if (lower.includes("loan")) return res.json({ action: "NAVIGATE", target_page: "/loans", reply: "Navigating to Loans." });
    if (lower.includes("project")) return res.json({ action: "NAVIGATE", target_page: "/projects", reply: "Navigating to Projects." });
    if (lower.includes("employee") || lower.includes("staff")) return res.json({ action: "NAVIGATE", target_page: "/employees", reply: "Navigating to Employees." });
    if (lower.includes("expense") || lower.includes("expenditure")) return res.json({ action: "NAVIGATE", target_page: "/expenses", reply: "Navigating to Expenses." });
    if (lower.includes("dashboard")) return res.json({ action: "NAVIGATE", target_page: "/", reply: "Taking you to the Dashboard." });

    return res.json({ action: "CHAT", target_page: null, reply: "I can navigate pages and help you add students, teachers, employees, loans, expenses, and projects." });
  } catch (error) {
    console.error("AI Controller Error:", error?.response?.data || error.message);
    return res.status(500).json({ action: "CHAT", reply: "An error occurred while processing your request." });
  }
};

export const processAiQuery = processVoiceCommand;
