const statusText = document.getElementById("statusText");
const soundBtn = document.getElementById("soundBtn");
const soundIcon = document.getElementById("soundIcon");
const transcript = document.getElementById("transcript");
const toggleTranscriptBtn = document.getElementById("toggleTranscriptBtn");
const clearBtn = document.getElementById("clearBtn");
const promptInput = document.getElementById("promptInput");
const sendBtn = document.getElementById("sendBtn");
const micBtn = document.getElementById("micBtn");

const bgCanvas = document.getElementById("bgCanvas");
const faceCanvas = document.getElementById("faceCanvas");
const fxCanvas = document.getElementById("fxCanvas");

const bgCtx = bgCanvas.getContext("2d");
const faceCtx = faceCanvas.getContext("2d");
const fxCtx = fxCanvas.getContext("2d");

let soundEnabled = true;
let recognition = null;
let isListening = false;
let isSpeaking = false;
let appState = "idle";
let typeToken = 0;

let w = window.innerWidth;
let h = window.innerHeight;
let dpr = Math.min(window.devicePixelRatio || 1, 2);

const pointer = {
  x: w * 0.5,
  y: h * 0.42,
  tx: w * 0.5,
  ty: h * 0.42,
};

const entity = {
  cx: w * 0.5,
  cy: h * 0.38,
  scale: Math.min(w, h) * 0.2,

  eyeLookX: 0,
  eyeLookY: 0,
  eyeTargetX: 0,
  eyeTargetY: 0,

  eyeOpen: 1,
  blinkT: 0,
  blinkCooldown: 0,

  mouthOpen: 0,
  mouthTarget: 0,
  mouthPhase: 0,
  mouthGate: 0,
  mouthAmp: 0.34,
  mouthWidth: 0.02,
  mouthSpeed: 1,

  hoverX: 0,
  hoverY: 0,
  hoverRX: 0,
  hoverRY: 0,

  listenGlow: 0,
  thinkGlow: 0,
  speakGlow: 0,

  orbitPhase: 0,
  faceNoise: 0,
};

let bgNodes = [];
let fxParticles = [];
let orbitParticles = [];

const STOP_WORDS = [
  "ما", "ماذا", "من", "هو", "هي", "عن", "في", "هل", "كم", "كيف", "أين", "اين",
  "لماذا", "متى", "الى", "إلى", "على", "هذا", "هذه", "ذلك", "تلك", "الذي", "التي",
  "لو", "اذا", "إذا", "أن", "إن", "كان", "كانت", "يكون", "تكون", "مع", "ثم", "او",
  "أو", "بـ", "ب", "ل", "ال", "ماهو", "ماهي", "حدثني", "اخبرني", "أخبرني", "قل", "لي"
];

const STATE_LABELS = {
  idle: "جاهز",
  listening: "يستمع",
  thinking: "يعالج",
  speaking: "يجيب"
};

function resizeAll() {
  w = window.innerWidth;
  h = window.innerHeight;
  dpr = Math.min(window.devicePixelRatio || 1, 2);

  [bgCanvas, faceCanvas, fxCanvas].forEach((canvas) => {
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
  });

  bgCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  faceCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  fxCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

  entity.cx = w >= 860 ? w * 0.33 : w * 0.5;
  entity.cy = h * (w >= 860 ? 0.48 : 0.36);
  entity.scale = Math.min(w, h) * (w >= 860 ? 0.24 : 0.215);

  initBgNodes();
  initOrbitParticles();
}
resizeAll();

function initBgNodes() {
  bgNodes = [];
  const count = Math.max(42, Math.floor((w * h) / 30000));
  for (let i = 0; i < count; i++) {
    bgNodes.push({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.06,
      vy: (Math.random() - 0.5) * 0.06,
      r: 0.8 + Math.random() * 2,
    });
  }
}

function initOrbitParticles() {
  orbitParticles = [];
  for (let i = 0; i < 120; i++) {
    orbitParticles.push({
      a: Math.random() * Math.PI * 2,
      r: entity.scale * (0.8 + Math.random() * 1.25),
      s: 0.0008 + Math.random() * 0.0018,
      yShift: (Math.random() - 0.5) * entity.scale * 0.3,
      alpha: 0.08 + Math.random() * 0.26,
      size: 0.8 + Math.random() * 1.8,
    });
  }
}

function setState(next) {
  appState = next;
  statusText.textContent = STATE_LABELS[next] || "جاهز";
  micBtn.classList.toggle("is-listening", next === "listening");
}

function autoResizeTextarea() {
  promptInput.style.height = "52px";
  promptInput.style.height = `${Math.min(promptInput.scrollHeight, 140)}px`;
}
promptInput.addEventListener("input", autoResizeTextarea);
autoResizeTextarea();

function addMessage(role, text, opts = {}) {
  const wrapper = document.createElement("div");
  wrapper.className = `message ${role}`;

  const bubble = document.createElement("div");
  bubble.className = "message-bubble";

  const label = document.createElement("div");
  label.className = "message-label";
  label.textContent = role === "user" ? "أنت" : "المنظومة";

  const body = document.createElement("div");
  body.className = "message-body";
  body.textContent = text || "";

  bubble.appendChild(label);
  bubble.appendChild(body);
  wrapper.appendChild(bubble);
  transcript.appendChild(wrapper);
  transcript.scrollTop = transcript.scrollHeight;

  if (opts.typing) return body;
  return body;
}

clearBtn.addEventListener("click", () => {
  transcript.innerHTML = "";
});

toggleTranscriptBtn.addEventListener("click", () => {
  transcript.classList.toggle("hidden");
  toggleTranscriptBtn.textContent = transcript.classList.contains("hidden") ? "إظهار النص" : "إخفاء النص";
});

function extractArabicKeyword(text) {
  let cleaned = text
    .replace(/[؟?!.,؛،/\\|()[\]{}"'`~@#$%^&*_+=<>:-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) return "";

  const words = cleaned.split(" ").filter(Boolean);
  const filtered = words.filter((word) => {
    const w2 = word.trim();
    return w2 && !STOP_WORDS.includes(w2) && w2.length > 1;
  });

  if (!filtered.length) return words[words.length - 1] || cleaned;
  if (filtered.length >= 2) return `${filtered[0]} ${filtered[1]}`.trim();
  return filtered[0];
}

async function fetchWikipediaSummary(query) {
  const term = extractArabicKeyword(query);
  if (!term) return "اكتب سؤالًا أو موضوعًا واضحًا لأبحث عنه.";

  const endpoints = [
    `https://ar.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(term)}`,
    `https://ar.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(term)}&limit=1&namespace=0&format=json&origin=*`
  ];

  try {
    const summaryRes = await fetch(endpoints[0], {
      headers: { accept: "application/json" }
    });

    if (summaryRes.ok) {
      const data = await summaryRes.json();
      if (data.extract && !data.extract.includes("قد تشير")) {
        return cleanWikipediaText(data.extract);
      }
    }

    const searchRes = await fetch(endpoints[1]);
    const searchData = await searchRes.json();
    const bestTitle = searchData?.[1]?.[0];

    if (bestTitle) {
      const retryRes = await fetch(
        `https://ar.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(bestTitle)}`,
        { headers: { accept: "application/json" } }
      );
      const retryData = await retryRes.json();
      if (retryData.extract) return cleanWikipediaText(retryData.extract);
    }

    return `لم أجد نتيجة عربية واضحة في ويكيبيديا عن: ${term}`;
  } catch {
    return "تعذر الاتصال بويكيبيديا حاليًا.";
  }
}

function cleanWikipediaText(text) {
  return String(text)
    .replace(/\s+/g, " ")
    .replace(/\[(\d+)\]/g, "")
    .trim();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function typeIntoElement(el, text, speed = 14) {
  typeToken += 1;
  const currentToken = typeToken;
  el.textContent = "";

  for (let i = 0; i < text.length; i++) {
    if (currentToken !== typeToken) return;
    el.textContent += text[i];
    transcript.scrollTop = transcript.scrollHeight;
    await sleep(speed);
  }
}

function speakText(text) {
  if (!soundEnabled || !("speechSynthesis" in window)) return;

  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "ar-SA";
  utterance.rate = 1;
  utterance.pitch = 0.7;

  utterance.onstart = () => {
    isSpeaking = true;
    setState("speaking");
    spawnBurst(entity.cx, entity.cy + entity.scale * 0.12, 28, "116,239,255");
  };

  utterance.onend = () => {
    isSpeaking = false;
    entity.mouthTarget = 0;
    if (!isListening) setState("idle");
  };

  utterance.onerror = () => {
    isSpeaking = false;
    entity.mouthTarget = 0;
    if (!isListening) setState("idle");
  };

  window.speechSynthesis.speak(utterance);
}

soundBtn.addEventListener("click", () => {
  soundEnabled = !soundEnabled;
  soundBtn.classList.toggle("is-on", soundEnabled);
  soundIcon.textContent = soundEnabled ? "🔊" : "🔇";

  if (!soundEnabled && "speechSynthesis" in window) {
    window.speechSynthesis.cancel();
    isSpeaking = false;
    entity.mouthTarget = 0;
    if (!isListening) setState("idle");
  }
});

async function handlePrompt(rawText) {
  const text = rawText.trim();
  if (!text) return;

  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }

  addMessage("user", text);
  promptInput.value = "";
  autoResizeTextarea();

  setState("thinking");
  spawnInputPulse();

  const typingBody = addMessage("ai", "", { typing: true });
  const response = await fetchWikipediaSummary(text);

  spawnBurst(entity.cx, entity.cy - entity.scale * 0.05, 36, "140,245,255");
  await typeIntoElement(typingBody, response, 12);

  if (soundEnabled) speakText(response);
  else setState("idle");
}

sendBtn.addEventListener("click", () => handlePrompt(promptInput.value));

promptInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    handlePrompt(promptInput.value);
  }
});

function initRecognition() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return;

  recognition = new SR();
  recognition.lang = "ar-SA";
  recognition.interimResults = true;
  recognition.continuous = false;
  recognition.maxAlternatives = 1;

  let finalTranscript = "";

  recognition.onstart = () => {
    isListening = true;
    setState("listening");
    finalTranscript = "";
    spawnBurst(entity.cx, entity.cy, 20, "100,224,255");
  };

  recognition.onresult = (event) => {
    let interim = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const t = event.results[i][0].transcript;
      if (event.results[i].isFinal) finalTranscript += t;
      else interim += t;
    }
    promptInput.value = (finalTranscript + " " + interim).trim();
    autoResizeTextarea();
  };

  recognition.onerror = () => {
    isListening = false;
    setState("idle");
  };

  recognition.onend = () => {
    isListening = false;
    micBtn.classList.remove("is-listening");
    const captured = promptInput.value.trim();
    if (captured) handlePrompt(captured);
    else if (!isSpeaking) setState("idle");
  };
}
initRecognition();

micBtn.addEventListener("click", () => {
  if (!recognition) return;

  if (isListening) {
    recognition.stop();
    isListening = false;
    setState("idle");
    return;
  }

  try {
    recognition.start();
  } catch (_) {}
});

function spawnBurst(x, y, count, color) {
  for (let i = 0; i < count; i++) {
    fxParticles.push({
      x,
      y,
      vx: (Math.random() - 0.5) * 3.4,
      vy: (Math.random() - 0.5) * 3.4,
      life: 24 + Math.random() * 30,
      maxLife: 24 + Math.random() * 30,
      size: 1 + Math.random() * 2.8,
      color
    });
  }
}

function spawnInputPulse() {
  const x = w >= 860 ? w * 0.72 : w * 0.5;
  const y = h - 140;
  for (let i = 0; i < 22; i++) {
    fxParticles.push({
      x: x + (Math.random() - 0.5) * 80,
      y: y + (Math.random() - 0.5) * 20,
      vx: (Math.random() - 0.5) * 1.6,
      vy: -0.8 - Math.random() * 1.6,
      life: 18 + Math.random() * 20,
      maxLife: 18 + Math.random() * 20,
      size: 1 + Math.random() * 2.4,
      color: "116,239,255"
    });
  }
}

function drawBackground(now) {
  bgCtx.clearRect(0, 0, w, h);

  const g = bgCtx.createRadialGradient(entity.cx, entity.cy, 0, entity.cx, entity.cy, Math.max(w, h) * 0.8);
  g.addColorStop(0, "rgba(40,130,255,0.08)");
  g.addColorStop(0.42, "rgba(10,70,130,0.04)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  bgCtx.fillStyle = g;
  bgCtx.fillRect(0, 0, w, h);

  bgCtx.strokeStyle = "rgba(116,239,255,0.035)";
  bgCtx.lineWidth = 1;
  const gap = 34;
  for (let x = 0; x < w; x += gap) {
    bgCtx.beginPath();
    bgCtx.moveTo(x, 0);
    bgCtx.lineTo(x, h);
    bgCtx.stroke();
  }
  for (let y = 0; y < h; y += gap) {
    bgCtx.beginPath();
    bgCtx.moveTo(0, y);
    bgCtx.lineTo(w, y);
    bgCtx.stroke();
  }

  bgNodes.forEach((n) => {
    n.x += n.vx;
    n.y += n.vy;

    if (n.x < -20) n.x = w + 20;
    if (n.x > w + 20) n.x = -20;
    if (n.y < -20) n.y = h + 20;
    if (n.y > h + 20) n.y = -20;

    bgCtx.beginPath();
    bgCtx.fillStyle = "rgba(116,239,255,0.18)";
    bgCtx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
    bgCtx.fill();
  });

  for (let i = 0; i < bgNodes.length; i++) {
    for (let j = i + 1; j < bgNodes.length; j++) {
      const a = bgNodes[i];
      const b = bgNodes[j];
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 128) {
        bgCtx.beginPath();
        bgCtx.strokeStyle = `rgba(116,239,255,${(1 - dist / 128) * 0.06})`;
        bgCtx.moveTo(a.x, a.y);
        bgCtx.lineTo(b.x, b.y);
        bgCtx.stroke();
      }
    }
  }

  for (let i = 0; i < 4; i++) {
    const yy = h * (0.18 + i * 0.13);
    bgCtx.beginPath();
    bgCtx.moveTo(w * 0.08, yy);
    bgCtx.bezierCurveTo(
      w * 0.22, yy - 28 + Math.sin(now * 0.42 + i) * 16,
      w * 0.76, yy + 20 + Math.cos(now * 0.36 + i) * 16,
      w * 0.92, yy - 8
    );
    bgCtx.strokeStyle = "rgba(116,239,255,0.035)";
    bgCtx.stroke();
  }
}

function roundedFacePath(ctx, s) {
  ctx.beginPath();
  ctx.moveTo(0, -s * 1.02);
  ctx.bezierCurveTo(s * 0.52, -s * 0.94, s * 0.68, -s * 0.34, s * 0.62, s * 0.18);
  ctx.bezierCurveTo(s * 0.56, s * 0.56, s * 0.34, s * 0.92, 0, s * 1.18);
  ctx.bezierCurveTo(-s * 0.34, s * 0.92, -s * 0.56, s * 0.56, -s * 0.62, s * 0.18);
  ctx.bezierCurveTo(-s * 0.68, -s * 0.34, -s * 0.52, -s * 0.94, 0, -s * 1.02);
  ctx.closePath();
}

function drawFace(now) {
  faceCtx.clearRect(0, 0, w, h);

  entity.listenGlow += ((isListening ? 1 : 0) - entity.listenGlow) * 0.05;
  entity.thinkGlow += ((appState === "thinking" ? 1 : 0) - entity.thinkGlow) * 0.05;
  entity.speakGlow += ((isSpeaking ? 1 : 0) - entity.speakGlow) * 0.08;

  pointer.x += (pointer.tx - pointer.x) * 0.07;
  pointer.y += (pointer.ty - pointer.y) * 0.07;

  const dx = (pointer.x - entity.cx) / entity.scale;
  const dy = (pointer.y - entity.cy) / entity.scale;

  entity.eyeTargetX = Math.max(-12, Math.min(12, dx * 9));
  entity.eyeTargetY = Math.max(-7, Math.min(7, dy * 7));

  entity.eyeLookX += (entity.eyeTargetX - entity.eyeLookX) * 0.16;
  entity.eyeLookY += (entity.eyeTargetY - entity.eyeLookY) * 0.16;

  const nowMs = performance.now();
  if (nowMs > entity.blinkCooldown && entity.blinkT <= 0) {
    entity.blinkT = 1;
    entity.blinkCooldown = nowMs + 2600 + Math.random() * 3000;
  }

  if (entity.blinkT > 0) {
    entity.blinkT -= 0.18;
    entity.eyeOpen = Math.max(0.06, Math.sin(entity.blinkT * Math.PI));
    if (entity.blinkT <= 0) entity.eyeOpen = 1;
  } else {
    entity.eyeOpen += (1 - entity.eyeOpen) * 0.18;
  }

  if (isSpeaking) {
    if (now > entity.mouthGate) {
      entity.mouthGate = now + (0.06 + Math.random() * 0.14);
      entity.mouthAmp = 0.16 + Math.random() * 0.42;
      entity.mouthWidth = -0.035 + Math.random() * 0.09;
      entity.mouthSpeed = 0.85 + Math.random() * 1.2;
    }
    entity.mouthPhase += 0.2 * entity.mouthSpeed;
    const a = (Math.sin(entity.mouthPhase) + 1) / 2;
    const b = (Math.sin(entity.mouthPhase * 1.8 + 0.7) + 1) / 2;
    entity.mouthTarget = 0.04 + ((a * 0.64 + b * 0.36) * entity.mouthAmp);
  } else {
    entity.mouthTarget = 0.006;
    entity.mouthWidth *= 0.88;
  }

  entity.mouthOpen += (entity.mouthTarget - entity.mouthOpen) * 0.18;
  entity.orbitPhase += 0.01;
  entity.faceNoise += 0.005;

  const s = entity.scale;
  const driftX = Math.cos(entity.orbitPhase * 0.52) * 1.4;
  const driftY = Math.sin(entity.orbitPhase * 0.35) * 2.4;
  const cx = entity.cx + driftX;
  const cy = entity.cy + driftY;

  const halo = faceCtx.createRadialGradient(cx, cy, s * 0.14, cx, cy, s * 1.6);
  halo.addColorStop(0, `rgba(140,245,255,${0.18 + entity.listenGlow * 0.08 + entity.thinkGlow * 0.12 + entity.speakGlow * 0.1})`);
  halo.addColorStop(0.45, "rgba(40,180,255,0.08)");
  halo.addColorStop(1, "rgba(0,0,0,0)");
  faceCtx.fillStyle = halo;
  faceCtx.beginPath();
  faceCtx.arc(cx, cy, s * 1.6, 0, Math.PI * 2);
  faceCtx.fill();

  faceCtx.save();
  faceCtx.translate(cx, cy);

  drawEnergyRibbons(faceCtx, s, now);
  drawOrbitalDust(faceCtx, s, now);
  drawHeadMesh(faceCtx, s, now);
  drawEyeSet(faceCtx, s, now);
  drawNose(faceCtx, s);
  drawMouth(faceCtx, s);
  drawNeckAndChest(faceCtx, s, now);

  faceCtx.restore();
}

function drawEnergyRibbons(ctx, s, now) {
  ctx.save();
  for (let i = 0; i < 8; i++) {
    const radius = s * (1.05 + i * 0.08);
    const offset = now * (0.7 + i * 0.06);
    ctx.beginPath();
    for (let a = -1.2; a <= 1.2; a += 0.06) {
      const x = Math.sin(a * 2.2 + offset) * radius;
      const y = Math.cos(a + offset * 0.35) * radius * 0.32 + a * s * 0.55;
      if (a === -1.2) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = `rgba(120,240,255,${0.02 + i * 0.006 + entity.speakGlow * 0.02})`;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  ctx.restore();
}

function drawOrbitalDust(ctx, s, now) {
  orbitParticles.forEach((p, i) => {
    p.a += p.s * (1 + entity.listenGlow * 0.5 + entity.thinkGlow * 0.4);
    const x = Math.cos(p.a + now * 0.2) * p.r;
    const y = Math.sin(p.a * 0.82 + now * 0.12) * (p.r * 0.44) + p.yShift;
    ctx.beginPath();
    ctx.fillStyle = `rgba(130,245,255,${p.alpha + entity.thinkGlow * 0.06})`;
    ctx.arc(x, y, p.size, 0, Math.PI * 2);
    ctx.fill();
  });
}

function drawHeadMesh(ctx, s, now) {
  ctx.save();
  roundedFacePath(ctx, s);
  ctx.clip();

  const skin = ctx.createLinearGradient(0, -s * 1.1, 0, s * 1.2);
  skin.addColorStop(0, "rgba(150,248,255,0.18)");
  skin.addColorStop(0.32, "rgba(72,200,255,0.12)");
  skin.addColorStop(0.72, "rgba(18,110,165,0.09)");
  skin.addColorStop(1, "rgba(10,60,110,0.04)");
  ctx.fillStyle = skin;
  ctx.fillRect(-s * 1.1, -s * 1.3, s * 2.2, s * 2.8);

  for (let i = 0; i < 58; i++) {
    const t = i / 57;
    const yy = -s * 1.02 + t * s * 2.05;
    const bow = Math.sin((t * Math.PI) + entity.faceNoise) * s * 0.08;
    ctx.beginPath();
    ctx.moveTo(-s * 0.8, yy);
    ctx.bezierCurveTo(
      -s * 0.34, yy + bow,
      s * 0.34, yy - bow,
      s * 0.8, yy
    );
    ctx.strokeStyle = `rgba(140,245,255,${0.03 + t * 0.09 + entity.thinkGlow * 0.04})`;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  for (let i = 0; i < 34; i++) {
    const t = i / 33;
    const xx = -s * 0.62 + t * s * 1.24;
    const ripple = Math.sin(now * 0.8 + i * 0.45) * s * 0.018;
    ctx.beginPath();
    ctx.moveTo(xx, -s * 1.05);
    ctx.bezierCurveTo(
      xx + ripple, -s * 0.36,
      xx - ripple, s * 0.44,
      xx, s * 1.0
    );
    ctx.strokeStyle = `rgba(130,240,255,${0.025 + (1 - Math.abs(t - 0.5) * 2) * 0.06})`;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  const leftVoid = ctx.createLinearGradient(-s * 0.8, 0, -s * 0.2, 0);
  leftVoid.addColorStop(0, "rgba(140,245,255,0.24)");
  leftVoid.addColorStop(0.6, "rgba(40,180,255,0.08)");
  leftVoid.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = leftVoid;
  ctx.fillRect(-s * 0.82, -s * 0.9, s * 0.42, s * 1.7);

  const rightFragment = ctx.createLinearGradient(s * 0.24, 0, s * 0.82, 0);
  rightFragment.addColorStop(0, "rgba(0,0,0,0)");
  rightFragment.addColorStop(0.45, "rgba(110,240,255,0.08)");
  rightFragment.addColorStop(1, "rgba(180,250,255,0.22)");
  ctx.fillStyle = rightFragment;
  ctx.fillRect(s * 0.24, -s * 0.9, s * 0.6, s * 1.7);

  for (let i = 0; i < 220; i++) {
    const px = s * (0.18 + Math.random() * 0.7);
    const py = -s * 0.95 + Math.random() * s * 1.95;
    const sz = 0.5 + Math.random() * 1.6;
    const drift = Math.sin(now * 0.8 + i) * 3;
    ctx.fillStyle = `rgba(150,248,255,${0.04 + Math.random() * 0.18})`;
    ctx.fillRect(px + drift, py, sz, sz);
  }

  ctx.restore();

  ctx.beginPath();
  roundedFacePath(ctx, s);
  ctx.strokeStyle = `rgba(160,248,255,${0.18 + entity.listenGlow * 0.06 + entity.speakGlow * 0.07})`;
  ctx.lineWidth = 1.3;
  ctx.stroke();

  ctx.beginPath();
  roundedFacePath(ctx, s * 1.02);
  ctx.strokeStyle = `rgba(120,240,255,${0.08 + entity.thinkGlow * 0.08})`;
  ctx.lineWidth = 1;
  ctx.stroke();
}

function drawEyeSet(ctx, s) {
  const y = -s * 0.12;
  const x = s * 0.23;
  const eyeW = s * 0.16;
  const eyeH = Math.max(2, s * 0.055 * entity.eyeOpen);

  drawSingleEye(ctx, -x, y, eyeW, eyeH, s);
  drawSingleEye(ctx, x, y, eyeW, eyeH, s);

  ctx.beginPath();
  ctx.moveTo(-s * 0.34, -s * 0.26);
  ctx.quadraticCurveTo(-s * 0.23, -s * 0.31, -s * 0.08, -s * 0.23);
  ctx.moveTo(s * 0.34, -s * 0.26);
  ctx.quadraticCurveTo(s * 0.23, -s * 0.31, s * 0.08, -s * 0.23);
  ctx.strokeStyle = "rgba(140,245,255,0.16)";
  ctx.lineWidth = 1;
  ctx.stroke();
}

function drawSingleEye(ctx, x, y, eyeW, eyeH, s) {
  ctx.save();
  ctx.translate(x, y);

  ctx.beginPath();
  ctx.ellipse(0, 0, eyeW, eyeH, 0, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(170,248,255,0.38)";
  ctx.lineWidth = 1.3;
  ctx.stroke();

  const irisX = entity.eyeLookX;
  const irisY = entity.eyeLookY;
  const irisR = s * 0.045;

  const iris = ctx.createRadialGradient(irisX, irisY, 0, irisX, irisY, irisR * 2.4);
  iris.addColorStop(0, "rgba(255,255,255,0.96)");
  iris.addColorStop(0.22, "rgba(160,248,255,0.96)");
  iris.addColorStop(0.58, "rgba(60,190,255,0.72)");
  iris.addColorStop(1, "rgba(20,120,190,0.06)");
  ctx.fillStyle = iris;
  ctx.beginPath();
  ctx.arc(irisX, irisY, irisR * 1.7, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.fillStyle = "rgba(8,20,35,0.95)";
  ctx.arc(irisX, irisY, irisR * 0.55, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.arc(irisX + irisR * 0.32, irisY - irisR * 0.32, irisR * 0.18, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawNose(ctx, s) {
  ctx.beginPath();
  ctx.moveTo(0, -s * 0.03);
  ctx.quadraticCurveTo(s * 0.04, s * 0.12, 0, s * 0.25);
  ctx.strokeStyle = "rgba(140,245,255,0.16)";
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(-s * 0.04, s * 0.24);
  ctx.quadraticCurveTo(0, s * 0.29, s * 0.04, s * 0.24);
  ctx.strokeStyle = "rgba(140,245,255,0.10)";
  ctx.stroke();
}

function drawMouth(ctx, s) {
  const y = s * 0.38;
  const w2 = s * (0.12 + entity.mouthWidth + entity.mouthOpen * 0.08);
  const h2 = s * (0.008 + entity.mouthOpen * 0.09);

  ctx.save();
  ctx.translate(0, y);

  const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, w2 * 1.8);
  glow.addColorStop(0, `rgba(190,252,255,${0.12 + entity.mouthOpen * 0.44})`);
  glow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.ellipse(0, 0, w2 * 1.3, h2 * 3.6, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(-w2, 0);
  ctx.quadraticCurveTo(0, h2 * (2.2 + entity.mouthOpen * 4.2), w2, 0);
  ctx.strokeStyle = `rgba(190,252,255,${0.26 + entity.mouthOpen * 0.48})`;
  ctx.lineWidth = 1.2;
  ctx.stroke();

  ctx.restore();
}

function drawNeckAndChest(ctx, s, now) {
  ctx.save();

  const neckGrad = ctx.createLinearGradient(0, s * 0.5, 0, s * 1.9);
  neckGrad.addColorStop(0, "rgba(150,248,255,0.14)");
  neckGrad.addColorStop(1, "rgba(20,110,165,0.03)");
  ctx.fillStyle = neckGrad;

  ctx.beginPath();
  ctx.moveTo(-s * 0.18, s * 0.72);
  ctx.lineTo(-s * 0.1, s * 1.35);
  ctx.quadraticCurveTo(0, s * 1.56, s * 0.1, s * 1.35);
  ctx.lineTo(s * 0.18, s * 0.72);
  ctx.closePath();
  ctx.fill();

  for (let i = 0; i < 20; i++) {
    const t = i / 19;
    const xx = -s * 0.55 + t * s * 1.1;
    ctx.beginPath();
    ctx.moveTo(xx, s * 0.95);
    ctx.quadraticCurveTo(
      xx * 0.65 + Math.sin(now * 0.7 + i) * 3,
      s * 1.25,
      xx * 0.28,
      s * 1.72
    );
    ctx.strokeStyle = `rgba(130,240,255,${0.03 + (1 - Math.abs(t - 0.5) * 2) * 0.08})`;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  ctx.restore();
}

function drawFx() {
  fxCtx.clearRect(0, 0, w, h);

  fxParticles = fxParticles.filter((p) => p.life > 0);

  fxParticles.forEach((p) => {
    p.x += p.vx;
    p.y += p.vy;
    p.vx *= 0.986;
    p.vy *= 0.986;
    p.life -= 1;

    const a = (p.life / p.maxLife) * 0.95;
    fxCtx.beginPath();
    fxCtx.fillStyle = `rgba(${p.color},${a})`;
    fxCtx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    fxCtx.fill();
  });

  const ringAlpha = 0.04 + entity.listenGlow * 0.05 + entity.thinkGlow * 0.08 + entity.speakGlow * 0.06;
  for (let i = 0; i < 4; i++) {
    fxCtx.beginPath();
    fxCtx.ellipse(
      entity.cx,
      entity.cy,
      entity.scale * (0.88 + i * 0.14),
      entity.scale * (1.18 + i * 0.09),
      0,
      0,
      Math.PI * 2
    );
    fxCtx.strokeStyle = `rgba(116,239,255,${ringAlpha - i * 0.01})`;
    fxCtx.lineWidth = 1;
    fxCtx.stroke();
  }
}

function animate() {
  const now = performance.now() * 0.001;
  drawBackground(now);
  drawFace(now);
  drawFx();
  requestAnimationFrame(animate);
}
animate();

function updatePointerTarget(x, y) {
  pointer.tx = x;
  pointer.ty = y;
}

window.addEventListener("mousemove", (e) => {
  updatePointerTarget(e.clientX, e.clientY);
});

window.addEventListener("touchmove", (e) => {
  if (!e.touches[0]) return;
  updatePointerTarget(e.touches[0].clientX, e.touches[0].clientY);
}, { passive: true });

window.addEventListener("touchend", () => {
  updatePointerTarget(w * 0.5, h * 0.42);
}, { passive: true });

window.addEventListener("mouseleave", () => {
  updatePointerTarget(w * 0.5, h * 0.42);
});

window.addEventListener("resize", resizeAll);

setState("idle");
