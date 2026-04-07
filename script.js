// script.js
const app = document.getElementById("app");
const personaZone = document.getElementById("personaZone");
const personaFrame = document.getElementById("personaFrame");
const personaImage = document.getElementById("personaImage");
const stateText = document.getElementById("stateText");
const transcript = document.getElementById("transcript");
const promptInput = document.getElementById("promptInput");
const sendBtn = document.getElementById("sendBtn");
const micBtn = document.getElementById("micBtn");
const soundBtn = document.getElementById("soundBtn");
const soundIcon = document.getElementById("soundIcon");
const clearBtn = document.getElementById("clearBtn");
const toggleTranscriptBtn = document.getElementById("toggleTranscriptBtn");
const voiceWave = document.getElementById("voiceWave");
const thinkingCore = document.getElementById("thinkingCore");

const canvas = document.getElementById("fxCanvas");
const ctx = canvas.getContext("2d", { alpha: true });

let appState = "idle";
let soundEnabled = true;
let recognition = null;
let isListening = false;
let isSpeaking = false;
let particles = [];
let emitters = [];
let pointer = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
let lastAnswerText = "";
let typeToken = 0;

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

function resizeCanvas() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.floor(window.innerWidth * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);
  canvas.style.width = `${window.innerWidth}px`;
  canvas.style.height = `${window.innerHeight}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
resizeCanvas();

function setState(next) {
  appState = next;
  personaZone.classList.remove("state-idle", "state-listening", "state-thinking", "state-speaking");
  personaZone.classList.add(`state-${next}`);
  stateText.textContent = STATE_LABELS[next] || "جاهز";

  micBtn.classList.toggle("is-listening", next === "listening");
  voiceWave.style.opacity = (next === "listening" || next === "speaking") ? "1" : "0";
  thinkingCore.style.opacity = next === "thinking" ? "1" : "0";
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

  if (opts.typing) {
    return body;
  }
  return body;
}

function clearTranscript() {
  transcript.innerHTML = "";
  lastAnswerText = "";
}

clearBtn.addEventListener("click", clearTranscript);

toggleTranscriptBtn.addEventListener("click", () => {
  transcript.classList.toggle("hidden");
  const hidden = transcript.classList.contains("hidden");
  toggleTranscriptBtn.textContent = hidden ? "إظهار النص" : "إخفاء النص";
});

function extractArabicKeyword(text) {
  let cleaned = text
    .replace(/[؟?!.,؛،/\\|()[\]{}"'`~@#$%^&*_+=<>:-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) return "";

  const words = cleaned.split(" ").filter(Boolean);

  const filtered = words.filter(word => {
    const w = word.trim();
    if (!w) return false;
    if (STOP_WORDS.includes(w)) return false;
    if (w.length <= 1) return false;
    return true;
  });

  if (filtered.length === 0) {
    return words[words.length - 1] || cleaned;
  }

  // محاولة أخذ أفضل عبارة مكونة من كلمة أو كلمتين
  if (filtered.length >= 2) {
    return `${filtered[0]} ${filtered[1]}`.trim();
  }

  return filtered[0];
}

async function fetchWikipediaSummary(query) {
  const term = extractArabicKeyword(query);
  if (!term) {
    return "اكتب سؤالًا أو موضوعًا واضحًا لأبحث عنه.";
  }

  const endpoints = [
    `https://ar.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(term)}`,
    `https://ar.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(term)}&limit=1&namespace=0&format=json&origin=*`
  ];

  try {
    const summaryRes = await fetch(endpoints[0], {
      headers: { "accept": "application/json" }
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
        { headers: { "accept": "application/json" } }
      );
      const retryData = await retryRes.json();
      if (retryData.extract) {
        return cleanWikipediaText(retryData.extract);
      }
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

async function typeIntoElement(el, text, speed = 16) {
  typeToken += 1;
  const currentToken = typeToken;
  el.textContent = "";
  lastAnswerText = text;

  for (let i = 0; i < text.length; i++) {
    if (currentToken !== typeToken) return;
    el.textContent += text[i];
    transcript.scrollTop = transcript.scrollHeight;
    await sleep(speed);
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function speakText(text) {
  if (!soundEnabled || !("speechSynthesis" in window)) return;

  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "ar-SA";
  utterance.rate = 1;
  utterance.pitch = 1;

  utterance.onstart = () => {
    isSpeaking = true;
    setState("speaking");
    burstFromPersona(26, "#8ffcff", 2.2);
  };

  utterance.onend = () => {
    isSpeaking = false;
    if (!isListening) setState("idle");
  };

  utterance.onerror = () => {
    isSpeaking = false;
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
  funnelUserText(text);

  const typingBody = addMessage("ai", "", { typing: true });

  const response = await fetchWikipediaSummary(text);

  burstFromRightSide(34, "#54e7ff", 2.4);
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
    burstFromPersona(18, "#67f0ff", 1.6);
  };

  recognition.onresult = (event) => {
    let interim = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcriptPart = event.results[i][0].transcript;
      if (event.results[i].isFinal) {
        finalTranscript += transcriptPart;
      } else {
        interim += transcriptPart;
      }
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
    if (captured) {
      handlePrompt(captured);
    } else if (!isSpeaking) {
      setState("idle");
    }
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

function funnelUserText(text) {
  const rect = personaFrame.getBoundingClientRect();
  const targetX = rect.left + rect.width * 0.72;
  const targetY = rect.top + rect.height * 0.34;

  const chars = text.split("");
  chars.forEach((char, index) => {
    const startX = window.innerWidth * 0.5 + (Math.random() - 0.5) * 180;
    const startY = window.innerHeight - 120 - Math.random() * 50;

    particles.push({
      x: startX,
      y: startY,
      tx: targetX + (Math.random() - 0.5) * 24,
      ty: targetY + (Math.random() - 0.5) * 24,
      vx: 0,
      vy: -1.2 - Math.random() * 0.8,
      size: 1.3 + Math.random() * 1.7,
      alpha: 0.5 + Math.random() * 0.5,
      life: 70 + index * 2,
      maxLife: 70 + index * 2,
      color: "104,236,255",
      mode: "seek"
    });
  });
}

function burstFromPersona(count = 20, color = "#67f0ff", force = 1.8) {
  const rect = personaFrame.getBoundingClientRect();
  const cx = rect.left + rect.width * 0.72;
  const cy = rect.top + rect.height * 0.34;
  const rgb = hexToRgb(color) || { r: 103, g: 240, b: 255 };

  for (let i = 0; i < count; i++) {
    const angle = -Math.PI / 4 + (Math.random() - 0.5) * 1.6;
    const speed = force + Math.random() * force * 1.3;
    particles.push({
      x: cx + (Math.random() - 0.5) * 24,
      y: cy + (Math.random() - 0.5) * 34,
      vx: Math.cos(angle) * speed + (Math.random() - 0.5) * 0.6,
      vy: Math.sin(angle) * speed + (Math.random() - 0.5) * 0.8,
      size: 1.5 + Math.random() * 2.4,
      alpha: 0.7 + Math.random() * 0.3,
      life: 36 + Math.random() * 28,
      maxLife: 36 + Math.random() * 28,
      color: `${rgb.r},${rgb.g},${rgb.b}`,
      mode: "drift"
    });
  }
}

function burstFromRightSide(count = 28, color = "#54e7ff", force = 2) {
  const rgb = hexToRgb(color) || { r: 84, g: 231, b: 255 };
  const sourceX = window.innerWidth + 30;
  const sourceY = window.innerHeight * 0.32 + Math.random() * 120;

  const rect = personaFrame.getBoundingClientRect();
  const tx = rect.left + rect.width * 0.76;
  const ty = rect.top + rect.height * 0.34;

  for (let i = 0; i < count; i++) {
    particles.push({
      x: sourceX + Math.random() * 60,
      y: sourceY + (Math.random() - 0.5) * 220,
      tx: tx + (Math.random() - 0.5) * 36,
      ty: ty + (Math.random() - 0.5) * 48,
      vx: -force - Math.random() * force,
      vy: (Math.random() - 0.5) * 0.8,
      size: 1.3 + Math.random() * 2.2,
      alpha: 0.5 + Math.random() * 0.4,
      life: 68 + Math.random() * 34,
      maxLife: 68 + Math.random() * 34,
      color: `${rgb.r},${rgb.g},${rgb.b}`,
      mode: "seek"
    });
  }
}

function hexToRgb(hex) {
  const normalized = hex.replace("#", "").trim();
  if (![3, 6].includes(normalized.length)) return null;
  const full = normalized.length === 3
    ? normalized.split("").map(ch => ch + ch).join("")
    : normalized;
  const num = parseInt(full, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255
  };
}

function animateFX() {
  ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

  // روابط خفيفة في الخلفية
  for (let i = 0; i < 14; i++) {
    const y = (window.innerHeight * 0.12) + i * 34 + Math.sin((Date.now() * 0.001) + i) * 6;
    const alpha = 0.03 + (i % 4) * 0.006;
    ctx.beginPath();
    ctx.moveTo(window.innerWidth * 0.1, y);
    ctx.bezierCurveTo(
      window.innerWidth * 0.28, y - 18,
      window.innerWidth * 0.72, y + 14,
      window.innerWidth * 0.9, y - 6
    );
    ctx.strokeStyle = `rgba(104,236,255,${alpha})`;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  particles = particles.filter(p => p.life > 0);

  particles.forEach(p => {
    if (p.mode === "seek" && typeof p.tx === "number" && typeof p.ty === "number") {
      const dx = p.tx - p.x;
      const dy = p.ty - p.y;
      p.vx += dx * 0.006;
      p.vy += dy * 0.006;
      p.vx *= 0.92;
      p.vy *= 0.92;
    } else {
      p.vx *= 0.985;
      p.vy *= 0.985;
    }

    p.x += p.vx;
    p.y += p.vy;
    p.life -= 1;

    const opacity = Math.max(0, (p.life / p.maxLife) * p.alpha);
    ctx.beginPath();
    ctx.fillStyle = `rgba(${p.color},${opacity})`;
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();

    if (opacity > 0.22 && p.mode === "seek" && typeof p.tx === "number") {
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.tx, p.ty);
      ctx.strokeStyle = `rgba(${p.color},${opacity * 0.12})`;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  });

  requestAnimationFrame(animateFX);
}
animateFX();

function updateParallax(clientX, clientY) {
  const rect = personaFrame.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;

  const dx = (clientX - cx) / rect.width;
  const dy = (clientY - cy) / rect.height;

  const rotateY = Math.max(-7, Math.min(7, dx * 10));
  const rotateX = Math.max(-6, Math.min(6, -dy * 10));
  const moveX = dx * 10;
  const moveY = dy * 10;

  personaFrame.style.transform = `perspective(1200px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translate3d(${moveX}px, ${moveY}px, 0)`;
  personaImage.style.transform = `scale(1.02) translate3d(${moveX * 0.65}px, ${moveY * 0.65}px, 0)`;
}

function resetParallax() {
  personaFrame.style.transform = `perspective(1200px) rotateX(0deg) rotateY(0deg) translate3d(0,0,0)`;
  personaImage.style.transform = `scale(1) translate3d(0,0,0)`;
}

window.addEventListener("mousemove", (e) => {
  pointer.x = e.clientX;
  pointer.y = e.clientY;
  updateParallax(pointer.x, pointer.y);
});

window.addEventListener("touchmove", (e) => {
  if (!e.touches[0]) return;
  pointer.x = e.touches[0].clientX;
  pointer.y = e.touches[0].clientY;
  updateParallax(pointer.x, pointer.y);
}, { passive: true });

window.addEventListener("touchend", resetParallax, { passive: true });
window.addEventListener("mouseleave", resetParallax);
window.addEventListener("resize", () => {
  resizeCanvas();
  resetParallax();
});

setState("idle");
