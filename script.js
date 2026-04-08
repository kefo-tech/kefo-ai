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
  ty: h * 0.42
};

const entity = {
  cx: w * 0.5,
  cy: h * 0.39,
  scale: Math.min(w, h) * 0.17,
  idlePhase: 0,
  eyeOpen: 1,
  blinkTimer: 0,
  blinkCooldown: 0,
  eyeLookX: 0,
  eyeLookY: 0,
  eyeTargetX: 0,
  eyeTargetY: 0,
  mouthOpen: 0,
  mouthTarget: 0,
  mouthPhase: 0,
  mouthRandGate: 0,
  mouthRandAmp: 0.3,
  mouthRandWidth: 0.04,
  waveDrift: 0,
  listenGlow: 0,
  thinkGlow: 0,
  speakGlow: 0
};

let fxParticles = [];
let bgNodes = [];

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

  entity.cx = w * 0.5;
  entity.cy = h * (w >= 860 ? 0.46 : 0.36);
  entity.scale = Math.min(w, h) * (w >= 860 ? 0.17 : 0.19);

  initBgNodes();
}
resizeAll();

function initBgNodes() {
  bgNodes = [];
  const count = Math.max(36, Math.floor((w * h) / 38000));
  for (let i = 0; i < count; i++) {
    bgNodes.push({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.08,
      vy: (Math.random() - 0.5) * 0.08,
      r: 1 + Math.random() * 1.8
    });
  }
}
initBgNodes();

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
  } catch (error) {
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

async function typeIntoElement(el, text, speed = 16) {
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
  utterance.pitch = 0.82;

  utterance.onstart = () => {
    isSpeaking = true;
    setState("speaking");
    spawnBurst(entity.cx, entity.cy + entity.scale * 0.05, 22, "116,239,255");
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

  spawnBurst(entity.cx, entity.cy - entity.scale * 0.1, 30, "120,240,255");
  await typeIntoElement(typingBody, response, 12);

  if (soundEnabled) {
    speakText(response);
  } else {
    setState("idle");
  }
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
    spawnBurst(entity.cx, entity.cy, 18, "100,224,255");
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
      vx: (Math.random() - 0.5) * 2.8,
      vy: (Math.random() - 0.5) * 2.8,
      life: 24 + Math.random() * 28,
      maxLife: 24 + Math.random() * 28,
      size: 1 + Math.random() * 2.6,
      color
    });
  }
}

function spawnInputPulse() {
  const x = w * 0.5;
  const y = h - 140;
  for (let i = 0; i < 20; i++) {
    fxParticles.push({
      x: x + (Math.random() - 0.5) * 80,
      y: y + (Math.random() - 0.5) * 20,
      vx: (Math.random() - 0.5) * 1.6,
      vy: -0.8 - Math.random() * 1.6,
      life: 18 + Math.random() * 20,
      maxLife: 18 + Math.random() * 20,
      size: 1 + Math.random() * 2.2,
      color: "116,239,255"
    });
  }
}

function drawBackground(now) {
  bgCtx.clearRect(0, 0, w, h);

  const grad = bgCtx.createRadialGradient(w * 0.5, h * 0.4, 0, w * 0.5, h * 0.4, Math.max(w, h) * 0.55);
  grad.addColorStop(0, "rgba(24,120,200,0.10)");
  grad.addColorStop(1, "rgba(0,0,0,0)");
  bgCtx.fillStyle = grad;
  bgCtx.fillRect(0, 0, w, h);

  bgCtx.strokeStyle = "rgba(116,239,255,0.04)";
  bgCtx.lineWidth = 1;
  const gridGap = 36;
  for (let x = 0; x < w; x += gridGap) {
    bgCtx.beginPath();
    bgCtx.moveTo(x, 0);
    bgCtx.lineTo(x, h);
    bgCtx.stroke();
  }
  for (let y = 0; y < h; y += gridGap) {
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
    bgCtx.fillStyle = "rgba(116,239,255,0.22)";
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
      if (dist < 120) {
        bgCtx.beginPath();
        bgCtx.strokeStyle = `rgba(116,239,255,${(1 - dist / 120) * 0.07})`;
        bgCtx.moveTo(a.x, a.y);
        bgCtx.lineTo(b.x, b.y);
        bgCtx.stroke();
      }
    }
  }

  bgCtx.beginPath();
  for (let i = 0; i < 4; i++) {
    const yy = h * (0.2 + i * 0.12);
    bgCtx.moveTo(w * 0.08, yy);
    bgCtx.bezierCurveTo(
      w * 0.24, yy - 18 + Math.sin(now * 0.4 + i) * 8,
      w * 0.74, yy + 14 + Math.cos(now * 0.35 + i) * 8,
      w * 0.92, yy - 6
    );
  }
  bgCtx.strokeStyle = "rgba(116,239,255,0.05)";
  bgCtx.stroke();
}

function drawFace(now) {
  faceCtx.clearRect(0, 0, w, h);

  entity.idlePhase += 0.012;
  entity.waveDrift += 0.006;

  entity.listenGlow += ((isListening ? 1 : 0) - entity.listenGlow) * 0.05;
  entity.thinkGlow += ((appState === "thinking" ? 1 : 0) - entity.thinkGlow) * 0.05;
  entity.speakGlow += ((isSpeaking ? 1 : 0) - entity.speakGlow) * 0.08;

  pointer.x += (pointer.tx - pointer.x) * 0.06;
  pointer.y += (pointer.ty - pointer.y) * 0.06;

  const dx = (pointer.x - entity.cx) / entity.scale;
  const dy = (pointer.y - entity.cy) / entity.scale;

  entity.eyeTargetX = Math.max(-10, Math.min(10, dx * 8));
  entity.eyeTargetY = Math.max(-6, Math.min(6, dy * 6));

  entity.eyeLookX += (entity.eyeTargetX - entity.eyeLookX) * 0.15;
  entity.eyeLookY += (entity.eyeTargetY - entity.eyeLookY) * 0.15;

  const blinkNow = performance.now();
  if (blinkNow > entity.blinkCooldown && entity.blinkTimer <= 0) {
    entity.blinkTimer = 1;
    entity.blinkCooldown = blinkNow + 2800 + Math.random() * 3200;
  }

  if (entity.blinkTimer > 0) {
    entity.blinkTimer -= 0.16;
    entity.eyeOpen = Math.max(0.08, Math.sin(entity.blinkTimer * Math.PI));
    if (entity.blinkTimer <= 0) entity.eyeOpen = 1;
  } else {
    entity.eyeOpen += (1 - entity.eyeOpen) * 0.18;
  }

  if (isSpeaking) {
    if (now > entity.mouthRandGate) {
      entity.mouthRandGate = now + (0.07 + Math.random() * 0.15);
      entity.mouthRandAmp = 0.12 + Math.random() * 0.34;
      entity.mouthRandWidth = -0.05 + Math.random() * 0.12;
    }
    entity.mouthPhase += 0.22;
    const a = (Math.sin(entity.mouthPhase) + 1) / 2;
    const b = (Math.sin(entity.mouthPhase * 1.73 + 0.6) + 1) / 2;
    entity.mouthTarget = 0.05 + ((a * 0.62 + b * 0.38) * entity.mouthRandAmp);
  } else {
    entity.mouthTarget = 0.008;
    entity.mouthRandWidth *= 0.84;
  }

  entity.mouthOpen += (entity.mouthTarget - entity.mouthOpen) * 0.16;

  const faceScale = entity.scale;
  const faceY = entity.cy + Math.sin(entity.idlePhase * 0.5) * 2.2;
  const faceX = entity.cx + Math.cos(entity.idlePhase * 0.38) * 1.4;

  const halo = faceCtx.createRadialGradient(faceX, faceY, faceScale * 0.2, faceX, faceY, faceScale * 1.45);
  halo.addColorStop(0, `rgba(116,239,255,${0.12 + entity.listenGlow * 0.08 + entity.thinkGlow * 0.06})`);
  halo.addColorStop(0.38, "rgba(40,180,255,0.08)");
  halo.addColorStop(1, "rgba(0,0,0,0)");
  faceCtx.fillStyle = halo;
  faceCtx.beginPath();
  faceCtx.arc(faceX, faceY, faceScale * 1.45, 0, Math.PI * 2);
  faceCtx.fill();

  faceCtx.save();
  faceCtx.translate(faceX, faceY);

  drawWaveHead(faceCtx, faceScale, now);
  drawEyes(faceCtx, faceScale);
  drawMouth(faceCtx, faceScale);
  drawNose(faceCtx, faceScale);
  drawJawLines(faceCtx, faceScale, now);

  faceCtx.restore();
}

function drawWaveHead(ctx, s, now) {
  const verticalGrad = ctx.createLinearGradient(0, -s * 1.2, 0, s * 1.35);
  verticalGrad.addColorStop(0, "rgba(138,247,255,0.22)");
  verticalGrad.addColorStop(0.52, "rgba(49,197,255,0.16)");
  verticalGrad.addColorStop(1, "rgba(18,120,180,0.10)");

  ctx.beginPath();
  ctx.ellipse(0, -s * 0.1, s * 0.62, s * 0.92, 0, 0, Math.PI * 2);
  ctx.fillStyle = verticalGrad;
  ctx.fill();

  ctx.save();
  ctx.beginPath();
  ctx.ellipse(0, -s * 0.1, s * 0.62, s * 0.92, 0, 0, Math.PI * 2);
  ctx.clip();

  const lineCount = 32;
  for (let i = 0; i < lineCount; i++) {
    const t = i / (lineCount - 1);
    const yy = -s * 0.95 + t * s * 1.65;
    const wobble = Math.sin(entity.waveDrift * 2.1 + i * 0.35 + now) * (s * 0.016) * (1 + entity.thinkGlow * 0.7);

    ctx.beginPath();
    ctx.moveTo(-s * 0.72, yy);
    ctx.bezierCurveTo(
      -s * 0.38, yy + wobble,
      s * 0.38, yy - wobble,
      s * 0.72, yy
    );
    ctx.strokeStyle = `rgba(116,239,255,${0.08 + t * 0.07})`;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  const contourCount = 18;
  for (let i = 0; i < contourCount; i++) {
    const t = i / (contourCount - 1);
    const xx = -s * 0.56 + t * s * 1.12;
    ctx.beginPath();
    ctx.moveTo(xx, -s * 1.0);
    ctx.bezierCurveTo(
      xx + Math.sin(now * 0.8 + i) * s * 0.02, -s * 0.45,
      xx - Math.cos(now * 0.7 + i) * s * 0.02, s * 0.35,
      xx, s * 0.82
    );
    ctx.strokeStyle = `rgba(116,239,255,${0.03 + (1 - Math.abs(t - 0.5) * 2) * 0.08})`;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  if (entity.thinkGlow > 0.02) {
    for (let i = 0; i < 8; i++) {
      const ry = -s * 0.55 + i * s * 0.12;
      ctx.beginPath();
      ctx.moveTo(-s * 0.2, ry);
      ctx.lineTo(s * 0.24, ry + Math.sin(now * 2 + i) * 4);
      ctx.strokeStyle = `rgba(170,250,255,${0.04 + entity.thinkGlow * 0.12})`;
      ctx.stroke();
    }
  }

  ctx.restore();

  ctx.beginPath();
  ctx.ellipse(0, -s * 0.1, s * 0.62, s * 0.92, 0, 0, Math.PI * 2);
  ctx.strokeStyle = `rgba(130,244,255,${0.14 + entity.listenGlow * 0.08 + entity.speakGlow * 0.06})`;
  ctx.lineWidth = 1.1;
  ctx.stroke();

  const sideGlowAlpha = 0.12 + entity.listenGlow * 0.09 + entity.speakGlow * 0.1;
  ctx.beginPath();
  ctx.ellipse(0, -s * 0.1, s * 0.66, s * 0.96, 0, 0, Math.PI * 2);
  ctx.strokeStyle = `rgba(116,239,255,${sideGlowAlpha})`;
  ctx.lineWidth = 1;
  ctx.stroke();
}

function drawEyes(ctx, s) {
  const eyeY = -s * 0.08;
  const eyeOffset = s * 0.21;
  const eyeW = s * 0.18;
  const eyeH = s * 0.065 * entity.eyeOpen;

  drawSingleEye(ctx, -eyeOffset, eyeY, eyeW, eyeH, s);
  drawSingleEye(ctx, eyeOffset, eyeY, eyeW, eyeH, s);
}

function drawSingleEye(ctx, x, y, w2, h2, s) {
  ctx.save();
  ctx.translate(x, y);

  ctx.beginPath();
  ctx.ellipse(0, 0, w2, Math.max(h2, 2), 0, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(170,248,255,0.42)";
  ctx.lineWidth = 1.4;
  ctx.stroke();

  const irisR = s * 0.04;
  const px = entity.eyeLookX;
  const py = entity.eyeLookY;

  const irisGrad = ctx.createRadialGradient(px, py, 0, px, py, irisR * 2.2);
  irisGrad.addColorStop(0, "rgba(220,255,255,0.95)");
  irisGrad.addColorStop(0.25, "rgba(120,240,255,0.92)");
  irisGrad.addColorStop(1, "rgba(40,160,230,0.18)");

  ctx.beginPath();
  ctx.fillStyle = irisGrad;
  ctx.arc(px, py, irisR * 1.55, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.fillStyle = "rgba(10,22,35,0.95)";
  ctx.arc(px, py, irisR * 0.55, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.arc(px + irisR * 0.25, py - irisR * 0.28, irisR * 0.18, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawMouth(ctx, s) {
  const mouthY = s * 0.34;
  const mouthW = s * (0.13 + entity.mouthRandWidth + entity.mouthOpen * 0.08);
  const mouthH = s * (0.010 + entity.mouthOpen * 0.11);

  ctx.save();
  ctx.translate(0, mouthY);

  ctx.beginPath();
  ctx.ellipse(0, 0, mouthW, mouthH, 0, 0, Math.PI * 2);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, mouthW);
  g.addColorStop(0, `rgba(180,250,255,${0.18 + entity.mouthOpen * 0.55})`);
  g.addColorStop(1, "rgba(30,140,210,0.02)");
  ctx.fillStyle = g;
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(-mouthW, 0);
  ctx.quadraticCurveTo(0, mouthH * (2.4 + entity.mouthOpen * 4.5), mouthW, 0);
  ctx.strokeStyle = `rgba(180,250,255,${0.22 + entity.mouthOpen * 0.45})`;
  ctx.lineWidth = 1.2;
  ctx.stroke();

  ctx.restore();
}

function drawNose(ctx, s) {
  ctx.beginPath();
  ctx.moveTo(0, s * 0.01);
  ctx.quadraticCurveTo(s * 0.018, s * 0.12, 0, s * 0.2);
  ctx.strokeStyle = "rgba(130,244,255,0.15)";
  ctx.lineWidth = 1;
  ctx.stroke();
}

function drawJawLines(ctx, s, now) {
  const alpha = 0.06 + entity.listenGlow * 0.05 + entity.speakGlow * 0.06;
  ctx.strokeStyle = `rgba(116,239,255,${alpha})`;
  ctx.lineWidth = 1;

  for (let i = 0; i < 8; i++) {
    const x = -s * 0.34 + i * s * 0.095;
    ctx.beginPath();
    ctx.moveTo(x, s * 0.42);
    ctx.lineTo(x + Math.sin(now * 0.7 + i) * 4, s * 0.87);
    ctx.stroke();
  }
}

function drawFx() {
  fxCtx.clearRect(0, 0, w, h);

  fxParticles = fxParticles.filter((p) => p.life > 0);

  fxParticles.forEach((p) => {
    p.x += p.vx;
    p.y += p.vy;
    p.vx *= 0.987;
    p.vy *= 0.987;
    p.life -= 1;

    const a = (p.life / p.maxLife) * 0.92;
    fxCtx.beginPath();
    fxCtx.fillStyle = `rgba(${p.color},${a})`;
    fxCtx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    fxCtx.fill();
  });

  const ringAlpha = 0.04 + entity.listenGlow * 0.05 + entity.thinkGlow * 0.06 + entity.speakGlow * 0.05;
  for (let i = 0; i < 3; i++) {
    fxCtx.beginPath();
    fxCtx.arc(entity.cx, entity.cy, entity.scale * (0.92 + i * 0.16 + Math.sin(performance.now() * 0.0005 + i) * 0.01), 0, Math.PI * 2);
    fxCtx.strokeStyle = `rgba(116,239,255,${ringAlpha - i * 0.012})`;
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
