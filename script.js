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

const leftEye = document.getElementById("leftEye");
const rightEye = document.getElementById("rightEye");
const mouth = document.getElementById("mouth");

const canvas = document.getElementById("fxCanvas");
const ctx = canvas.getContext("2d", { alpha: true });

let appState = "idle";
let soundEnabled = true;
let recognition = null;
let isListening = false;
let isSpeaking = false;
let particles = [];
let typeToken = 0;

let pointer = {
  x: window.innerWidth / 2,
  y: window.innerHeight / 2
};

let eyeMotion = {
  x: 0,
  y: 0,
  tx: 0,
  ty: 0,
  blink: 1,
  blinking: false
};

let mouthMotion = {
  openness: 0,
  target: 0,
  width: 1,
  talkingPhase: 0,
  randomGate: 0,
  randomAmount: 0.45,
  widthAmount: 0.08,
  speedAmount: 1
};

let personaMotion = {
  x: 0,
  y: 0,
  tx: 0,
  ty: 0,
  rx: 0,
  ry: 0,
  trx: 0,
  try: 0,
  speakPower: 0,
  listenPower: 0
};

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

  if (opts.typing) return body;
  return body;
}

function clearTranscript() {
  transcript.innerHTML = "";
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
    burstFromPersona(28, "#8ffcff", 2.2);
  };

  utterance.onend = () => {
    isSpeaking = false;
    mouthMotion.target = 0;
    if (!isListening) setState("idle");
  };

  utterance.onerror = () => {
    isSpeaking = false;
    mouthMotion.target = 0;
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
    mouthMotion.target = 0;
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

function updatePointerTargets(clientX, clientY) {
  const rect = personaFrame.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;

  const dx = (clientX - cx) / rect.width;
  const dy = (clientY - cy) / rect.height;

  personaMotion.try = Math.max(-4, Math.min(4, dx * 5));
personaMotion.trx = Math.max(-3, Math.min(3, -dy * 4));
personaMotion.tx = dx * 4;
personaMotion.ty = dy * 3;

eyeMotion.tx = dx * 3.5;
eyeMotion.ty = dy * 2.5;
}

function animatePersona() {
  const now = performance.now() * 0.001;

  const idleFloatY = Math.sin(now * 0.7) * 2.2;
  const idleFloatX = Math.cos(now * 0.45) * 1.2;
  const idleRotZ = Math.sin(now * 0.35) * 0.18;
  const breathe = Math.sin(now * 0.9) * 0.008;

  personaMotion.listenPower += ((isListening ? 1 : 0) - personaMotion.listenPower) * 0.05;
  personaMotion.speakPower += ((isSpeaking ? 1 : 0) - personaMotion.speakPower) * 0.08;

  personaMotion.x += (personaMotion.tx - personaMotion.x) * 0.04;
  personaMotion.y += (personaMotion.ty - personaMotion.y) * 0.04;
  personaMotion.rx += (personaMotion.trx - personaMotion.rx) * 0.04;
  personaMotion.ry += (personaMotion.try - personaMotion.ry) * 0.04;

  const listenTilt = Math.sin(now * 1.8) * 0.45 * personaMotion.listenPower;
  const listenShift = Math.cos(now * 1.5) * 1.2 * personaMotion.listenPower;

  const speakPulse = Math.sin(now * 4.2) * 0.35 * personaMotion.speakPower;
  const speakLift = Math.abs(Math.sin(now * 3.8)) * 1.4 * personaMotion.speakPower;
  const speakScale = 1 + (0.008 * personaMotion.speakPower) + breathe;

  const frameX = idleFloatX + personaMotion.x + listenShift;
  const frameY = idleFloatY + personaMotion.y - speakLift * 0.15;
  const rotX = personaMotion.rx + (personaMotion.listenPower * 0.35);
  const rotY = personaMotion.ry + listenTilt;
  const rotZ = idleRotZ + speakPulse * 0.08;

  personaFrame.style.transform =
    `perspective(1200px) translate3d(${frameX}px, ${frameY}px, 0) rotateX(${rotX}deg) rotateY(${rotY}deg) rotateZ(${rotZ}deg)`;

  const imgX = frameX * 0.22;
  const imgY = frameY * 0.18 - breathe * 18;
  const imgRot = rotZ * 0.2;

  personaImage.style.transform =
    `translate3d(${imgX}px, ${imgY}px, 0) scale(${speakScale}) rotate(${imgRot}deg)`;

  requestAnimationFrame(animatePersona);
}
animatePersona();

function animateEyesAndMouth() {
  const now = performance.now() * 0.001;

  eyeMotion.x += (eyeMotion.tx - eyeMotion.x) * 0.18;
  eyeMotion.y += (eyeMotion.ty - eyeMotion.y) * 0.18;

  const blinkScale = eyeMotion.blink;

  leftEye.style.transform = `translate(${eyeMotion.x}px, ${eyeMotion.y}px) scaleY(${blinkScale})`;
  rightEye.style.transform = `translate(${eyeMotion.x}px, ${eyeMotion.y}px) scaleY(${blinkScale})`;

  if (isSpeaking) {

    if (now > mouthMotion.randomGate) {
      mouthMotion.randomGate = now + (0.06 + Math.random() * 0.14);
      mouthMotion.randomAmount = 0.25 + Math.random() * 0.95;
      mouthMotion.widthAmount = -0.08 + Math.random() * 0.22;
      mouthMotion.speedAmount = 0.7 + Math.random() * 1.6;
    }

    mouthMotion.talkingPhase += 0.20 * mouthMotion.speedAmount;

    const waveA = (Math.sin(mouthMotion.talkingPhase) + 1) / 2;
    const waveB = (Math.sin(mouthMotion.talkingPhase * 1.83 + 0.7) + 1) / 2;
    const waveC = (Math.sin(mouthMotion.talkingPhase * 2.45 + 1.4) + 1) / 2;

    const mixed =
      (waveA * 0.5) +
      (waveB * 0.32) +
      (waveC * 0.18);

    mouthMotion.target = 0.12 + (mixed * mouthMotion.randomAmount);

  } else {
    mouthMotion.target = 0.02;
    mouthMotion.widthAmount *= 0.9;
  }

  mouthMotion.openness += (mouthMotion.target - mouthMotion.openness) * 0.22;

  const mouthScaleY = 1 + mouthMotion.openness * 3.0;
  const mouthScaleX = 1 + (mouthMotion.openness * 0.12) + mouthMotion.widthAmount;
  const mouthLift = mouthMotion.openness * -2.2;
  const mouthOpacity = 0.22 + mouthMotion.openness * 0.72;
  const mouthBlurGlow = 0.35 + mouthMotion.openness * 0.9;

  mouth.style.transform =
    `translateX(-50%) translateY(${mouthLift}px) scaleX(${mouthScaleX}) scaleY(${mouthScaleY})`;

  mouth.style.opacity = `${mouthOpacity}`;
  mouth.style.filter = `blur(${mouthBlurGlow}px)`;

  requestAnimationFrame(animateEyesAndMouth);
}
animateEyesAndMouth();

function triggerBlink() {
  if (eyeMotion.blinking) return;
  eyeMotion.blinking = true;

  eyeMotion.blink = 0.08;
  setTimeout(() => {
    eyeMotion.blink = 1;
    eyeMotion.blinking = false;
  }, 120);
}

function blinkLoop() {
  const delay = 2200 + Math.random() * 2600;
  setTimeout(() => {
    triggerBlink();
    blinkLoop();
  }, delay);
}
blinkLoop();

window.addEventListener("mousemove", (e) => {
  pointer.x += (e.clientX - pointer.x) * 0.25;
pointer.y += (e.clientY - pointer.y) * 0.25;
  updatePointerTargets(pointer.x, pointer.y);
});

window.addEventListener("touchmove", (e) => {
  if (!e.touches[0]) return;
  pointer.x = e.touches[0].clientX;
  pointer.y = e.touches[0].clientY;
  updatePointerTargets(pointer.x, pointer.y);
}, { passive: true });

window.addEventListener("touchend", () => {
  personaMotion.tx = 0;
  personaMotion.ty = 0;
  personaMotion.trx = 0;
  personaMotion.try = 0;
  eyeMotion.tx = 0;
  eyeMotion.ty = 0;
}, { passive: true });

window.addEventListener("mouseleave", () => {
  personaMotion.tx = 0;
  personaMotion.ty = 0;
  personaMotion.trx = 0;
  personaMotion.try = 0;
  eyeMotion.tx = 0;
  eyeMotion.ty = 0;
});

window.addEventListener("resize", () => {
  resizeCanvas();
});

setState("idle");
