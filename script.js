/* =========================
   Audio Engine (Web Audio API)
========================= */
const AudioEngine = (() => {
    let ctx = null;
    let musicGain = null;
    let sfxGain = null;
    let musicNodes = [];
    let musicStarted = false;
    let muted = false;
    let musicMuted = false;

    function getCtx() {
        if (!ctx) {
            ctx = new (window.AudioContext || window.webkitAudioContext)();
            // Master SFX gain
            sfxGain = ctx.createGain();
            sfxGain.gain.value = 0.5;
            sfxGain.connect(ctx.destination);
            // Master music gain
            musicGain = ctx.createGain();
            musicGain.gain.value = 0.04;
            musicGain.connect(ctx.destination);
        }
        if (ctx.state === 'suspended') ctx.resume();
        return ctx;
    }

    // ---- SFX helpers ----
    function playTone({ freq = 440, type = 'sine', duration = 0.15, vol = 1, startFreq, endFreq, delay = 0, detune = 0 }) {
        if (muted) return;
        const c = getCtx();
        const osc = c.createOscillator();
        const gain = c.createGain();
        osc.type = type;
        osc.detune.value = detune;
        if (startFreq && endFreq) {
            osc.frequency.setValueAtTime(startFreq, c.currentTime + delay);
            osc.frequency.exponentialRampToValueAtTime(endFreq, c.currentTime + delay + duration);
        } else {
            osc.frequency.setValueAtTime(freq, c.currentTime + delay);
        }
        gain.gain.setValueAtTime(0, c.currentTime + delay);
        gain.gain.linearRampToValueAtTime(vol * 0.6, c.currentTime + delay + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + delay + duration);
        osc.connect(gain);
        gain.connect(sfxGain);
        osc.start(c.currentTime + delay);
        osc.stop(c.currentTime + delay + duration + 0.05);
    }

    function playNoise({ duration = 0.1, vol = 0.3, delay = 0, filterFreq = 1000 }) {
        if (muted) return;
        const c = getCtx();
        const bufferSize = c.sampleRate * duration;
        const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
        const source = c.createBufferSource();
        source.buffer = buffer;
        const filter = c.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = filterFreq;
        const gain = c.createGain();
        gain.gain.setValueAtTime(vol, c.currentTime + delay);
        gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + delay + duration);
        source.connect(filter);
        filter.connect(gain);
        gain.connect(sfxGain);
        source.start(c.currentTime + delay);
        source.stop(c.currentTime + delay + duration + 0.05);
    }

    // ---- Sound Effects ----
    const sfx = {
        flip() {
            playTone({ startFreq: 300, endFreq: 520, type: 'sine', duration: 0.12, vol: 0.7 });
            playNoise({ duration: 0.06, vol: 0.08, filterFreq: 3000 });
        },
        match() {
            [0, 0.08, 0.18].forEach((delay, i) => {
                const freqs = [523, 659, 784];
                playTone({ freq: freqs[i], type: 'triangle', duration: 0.25, vol: 0.8, delay });
            });
        },
        mismatch() {
            playTone({ startFreq: 280, endFreq: 140, type: 'sawtooth', duration: 0.22, vol: 0.4 });
            playTone({ startFreq: 260, endFreq: 130, type: 'sawtooth', duration: 0.22, vol: 0.3, delay: 0.03, detune: 15 });
        },
        win() {
            const melody = [523, 659, 784, 1047, 784, 1047, 1319];
            const times  = [0, 0.12, 0.24, 0.38, 0.52, 0.62, 0.74];
            melody.forEach((freq, i) => {
                playTone({ freq, type: 'triangle', duration: 0.28, vol: 0.85, delay: times[i] });
            });
        },
        restart() {
            playTone({ startFreq: 600, endFreq: 300, type: 'sine', duration: 0.2, vol: 0.5 });
        }
    };

    // ---- Ambient Background Music ----
    // Slow-evolving drone pads: two detuned sine layers per note,
    // long fade-in/out so they blur into a seamless wash.
    // Chords drift C maj9 → A min9 → F maj9 → G sus4 in a lazy loop.
    const ambientChords = [
        [130.81, 164.81, 196.00, 246.94, 293.66],  // C maj9  (C E G B D)
        [110.00, 146.83, 174.61, 220.00, 261.63],  // A min9  (A C E G C)
        [174.61, 220.00, 261.63, 329.63, 392.00],  // F maj9  (F A C E G)
        [146.83, 196.00, 246.94, 293.66, 349.23],  // G sus4  (G D G C F)
    ];

    const PAD_DURATION   = 14;   // seconds each chord pad sustains
    const PAD_FADE_IN    = 3.5;  // seconds to fade in
    const PAD_FADE_OUT   = 3.5;  // seconds to fade out
    const CHORD_INTERVAL = 10;   // seconds between chord changes (overlap for smooth crossfade)

    let musicLoop    = null;
    let chordIndex   = 0;

    function spawnPad(chordFreqs, startDelay) {
        if (musicMuted) return;
        const c = getCtx();

        chordFreqs.forEach((freq, i) => {
            // Two slightly detuned oscillators per note for a warm, wide pad
            [-4, 4].forEach(detuneCents => {
                const osc  = c.createOscillator();
                const gain = c.createGain();

                osc.type = 'sine';
                osc.frequency.value = freq;
                osc.detune.value    = detuneCents;

                // Stagger note start slightly so the chord blooms in
                const noteDelay = startDelay + i * 0.18;
                const vol       = 0.12 - i * 0.015; // higher notes a touch quieter

                gain.gain.setValueAtTime(0, c.currentTime + noteDelay);
                gain.gain.linearRampToValueAtTime(vol, c.currentTime + noteDelay + PAD_FADE_IN);
                gain.gain.setValueAtTime(vol, c.currentTime + noteDelay + PAD_DURATION - PAD_FADE_OUT);
                gain.gain.linearRampToValueAtTime(0, c.currentTime + noteDelay + PAD_DURATION);

                osc.connect(gain);
                gain.connect(musicGain);
                osc.start(c.currentTime + noteDelay);
                osc.stop(c.currentTime + noteDelay + PAD_DURATION + 0.2);
                musicNodes.push(osc, gain);
            });
        });
    }

    function scheduleNextChord() {
        if (musicMuted) return;
        spawnPad(ambientChords[chordIndex % ambientChords.length], 0);
        chordIndex++;
        musicLoop = setTimeout(scheduleNextChord, CHORD_INTERVAL * 1000);
    }

    function startMusic() {
        if (musicStarted) return;
        musicStarted = true;
        getCtx();
        scheduleNextChord();
    }

    function stopMusic() {
        musicStarted = false;
        clearTimeout(musicLoop);
        musicNodes.forEach(n => { try { n.stop ? n.stop() : n.disconnect(); } catch(e){} });
        musicNodes = [];
    }

    function toggleMute() {
        muted = !muted;
        sfxGain && (sfxGain.gain.value = muted ? 0 : 0.5);
        return muted;
    }

    function toggleMusic() {
        musicMuted = !musicMuted;
        if (musicMuted) {
            musicGain && (musicGain.gain.value = 0);
        } else {
            musicGain && (musicGain.gain.value = 0.04);
            if (!musicStarted) startMusic();
        }
        return musicMuted;
    }

    return { sfx, startMusic, stopMusic, toggleMute, toggleMusic, isMuted: () => muted, isMusicMuted: () => musicMuted };
})();

/* =========================
   Game Configuration
========================= */

// Font Awesome icon classes (pairs)
const icons = [
    "fa-heart",
    "fa-star",
    "fa-bolt",
    "fa-moon",
    "fa-leaf",
    "fa-gem",
    "fa-fire",
    "fa-music"
];

const gameBoard    = document.getElementById("gameBoard");
const movesEl      = document.getElementById("moves");
const timeEl       = document.getElementById("time");
const restartBtn   = document.getElementById("restartBtn");
const winOverlay   = document.getElementById("winOverlay");
const finalMoves   = document.getElementById("finalMoves");
const finalTime    = document.getElementById("finalTime");
const playAgainBtn = document.getElementById("playAgainBtn");

/* =========================
   Game State
========================= */
let cards        = [];
let flippedCards = [];
let matchedCount = 0;
let moves        = 0;
let timer        = null;
let time         = 0;
let gameStarted  = false;
let lockBoard    = false;

/* =========================
   Utility Functions
========================= */

// Shuffle array using Fisher-Yates
function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

// Start timer on first move
function startTimer() {
    if (gameStarted) return;
    gameStarted = true;
    timer = setInterval(() => {
        time++;
        timeEl.textContent = time;
    }, 1000);
}

// Reset timer
function resetTimer() {
    clearInterval(timer);
    timer       = null;
    time        = 0;
    timeEl.textContent = 0;
    gameStarted = false;
}

/* =========================
   Card tilt on mouse move
========================= */
function addTiltEffect(card) {
    card.addEventListener("mousemove", (e) => {
        if (card.classList.contains("flipped") || card.classList.contains("matched")) return;
        const rect    = card.getBoundingClientRect();
        const x       = e.clientX - rect.left;
        const y       = e.clientY - rect.top;
        const cx      = rect.width  / 2;
        const cy      = rect.height / 2;
        const rotateX = ((y - cy) / cy) * -10;
        const rotateY = ((x - cx) / cx) *  10;
        // Only apply tilt — never set an inline transform on flipped cards
        card.querySelector(".card-inner").style.transform =
            `rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
    });

    card.addEventListener("mouseleave", () => {
        if (card.classList.contains("flipped") || card.classList.contains("matched")) return;
        card.querySelector(".card-inner").style.transform = "";
    });
}

/* =========================
   Game Setup
========================= */
function createBoard() {
    gameBoard.innerHTML = "";
    cards        = [];
    flippedCards = [];
    matchedCount = 0;
    moves        = 0;
    movesEl.textContent = 0;
    lockBoard    = false;
    resetTimer();
    winOverlay.classList.remove("show");

    // Duplicate icons to create pairs
    const cardIcons = shuffle([...icons, ...icons]);

    cardIcons.forEach((icon, index) => {
        const card = document.createElement("div");
        card.classList.add("card");

        card.innerHTML = `
            <div class="card-inner">
                <div class="card-face card-front"></div>
                <div class="card-face card-back">
                    <i class="fa-solid ${icon}"></i>
                </div>
            </div>
        `;

        card.dataset.icon = icon;

        // Staggered entrance animation
        card.style.opacity    = "0";
        card.style.transform  = "translateY(20px) scale(0.9)";
        card.style.transition = `opacity 0.4s ease ${index * 40}ms, transform 0.4s cubic-bezier(0.22,1,0.36,1) ${index * 40}ms`;

        card.addEventListener("click", () => flipCard(card));
        addTiltEffect(card);

        gameBoard.appendChild(card);
        cards.push(card);

        // Trigger entrance
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                card.style.opacity   = "1";
                card.style.transform = "translateY(0) scale(1)";
            });
        });
    });
}

/* =========================
   Game Logic
========================= */
function flipCard(card) {
    if (lockBoard) return;
    if (card.classList.contains("flipped") || card.classList.contains("matched")) return;

    AudioEngine.sfx.flip();
    AudioEngine.startMusic();
    startTimer();

    // Clear any inline tilt transform so the CSS flip class works correctly
    card.querySelector(".card-inner").style.transform = "";

    card.classList.add("flipped");
    flippedCards.push(card);

    if (flippedCards.length === 2) {
        moves++;
        movesEl.textContent = moves;
        checkForMatch();
    }
}

function checkForMatch() {
    lockBoard = true;

    const [card1, card2] = flippedCards;
    const match = card1.dataset.icon === card2.dataset.icon;

    if (match) {
        handleMatch(card1, card2);
    } else {
        handleMismatch(card1, card2);
    }
}

function handleMatch(card1, card2) {
    card1.classList.add("matched");
    card2.classList.add("matched");
    matchedCount += 2;
    AudioEngine.sfx.match();

    resetTurn();

    if (matchedCount === cards.length) {
        setTimeout(endGame, 400);
    }
}

function handleMismatch(card1, card2) {
    AudioEngine.sfx.mismatch();
    // Subtle shake on mismatch
    [card1, card2].forEach(c => {
        c.style.animation = "shake 0.4s ease";
        c.addEventListener("animationend", () => c.style.animation = "", { once: true });
    });

    setTimeout(() => {
        card1.classList.remove("flipped");
        card2.classList.remove("flipped");
        resetTurn();
    }, 900);
}

function resetTurn() {
    flippedCards = [];
    lockBoard    = false;
}

function endGame() {
    clearInterval(timer);
    AudioEngine.stopMusic();
    AudioEngine.sfx.win();
    finalMoves.textContent = moves;
    finalTime.textContent  = time;
    winOverlay.classList.add("show");
}

/* =========================
   Event Listeners
========================= */
restartBtn.addEventListener("click", () => { AudioEngine.sfx.restart(); AudioEngine.stopMusic(); createBoard(); });
playAgainBtn.addEventListener("click", () => { AudioEngine.sfx.restart(); AudioEngine.stopMusic(); createBoard(); });

/* =========================
   Audio Controls Setup
========================= */
function setupAudioControls() {
    const sfxBtn = document.getElementById("sfxBtn");
    const musicBtn = document.getElementById("musicBtn");

    sfxBtn.addEventListener("click", () => {
        const muted = AudioEngine.toggleMute();
        sfxBtn.innerHTML = muted
            ? `<i class="fa-solid fa-volume-xmark"></i>`
            : `<i class="fa-solid fa-volume-high"></i>`;
        sfxBtn.title = muted ? "Unmute SFX" : "Mute SFX";
        sfxBtn.classList.toggle("audio-off", muted);
    });

    musicBtn.addEventListener("click", () => {
        const muted = AudioEngine.toggleMusic();
        musicBtn.innerHTML = muted
            ? `<i class="fa-solid fa-music" style="opacity:0.4"></i>`
            : `<i class="fa-solid fa-music"></i>`;
        musicBtn.title = muted ? "Unmute Music" : "Mute Music";
        musicBtn.classList.toggle("audio-off", muted);
    });
}
setupAudioControls();

/* =========================
   Inject shake keyframe
========================= */
const styleSheet = document.createElement("style");
styleSheet.textContent = `
@keyframes shake {
    0%,100% { transform: translateX(0); }
    20%      { transform: translateX(-5px); }
    40%      { transform: translateX(5px); }
    60%      { transform: translateX(-4px); }
    80%      { transform: translateX(4px); }
}`;
document.head.appendChild(styleSheet);

/* =========================
   Initialize Game
========================= */
createBoard();

/* =========================
   Intro Animation & Particle Canvas
========================= */
(function() {
    const overlay = document.getElementById('introOverlay');
    const playBtn = document.getElementById('introPlayBtn');
    const canvas  = document.getElementById('introCanvas');
    const ctx     = canvas.getContext('2d');

    // Resize canvas
    function resize() {
        canvas.width  = window.innerWidth;
        canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener('resize', resize);

    // Particles
    const particles = [];
    const PARTICLE_COUNT = 90;

    const COLORS = ['#a78bfa', '#38bdf8', '#f472b6', '#6ee7b7', '#fbbf24'];

    for (let i = 0; i < PARTICLE_COUNT; i++) {
        particles.push({
            x: Math.random() * window.innerWidth,
            y: Math.random() * window.innerHeight,
            r: Math.random() * 2.2 + 0.4,
            color: COLORS[Math.floor(Math.random() * COLORS.length)],
            vx: (Math.random() - 0.5) * 0.35,
            vy: (Math.random() - 0.5) * 0.35,
            alpha: Math.random() * 0.6 + 0.2,
            pulse: Math.random() * Math.PI * 2,
            pulseSpeed: 0.015 + Math.random() * 0.02,
        });
    }

    // Shooting stars
    const stars = [];
    function spawnStar() {
        stars.push({
            x: Math.random() * window.innerWidth,
            y: Math.random() * window.innerHeight * 0.5,
            len: 80 + Math.random() * 120,
            speed: 6 + Math.random() * 8,
            angle: Math.PI / 5 + (Math.random() - 0.5) * 0.3,
            alpha: 1,
            color: COLORS[Math.floor(Math.random() * COLORS.length)],
        });
    }
    spawnStar();
    setInterval(spawnStar, 2200);

    let rafId;
    function draw() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Draw connecting lines between nearby particles
        for (let i = 0; i < particles.length; i++) {
            for (let j = i + 1; j < particles.length; j++) {
                const dx = particles[i].x - particles[j].x;
                const dy = particles[i].y - particles[j].y;
                const dist = Math.sqrt(dx*dx + dy*dy);
                if (dist < 100) {
                    ctx.beginPath();
                    ctx.strokeStyle = `rgba(167,139,250,${0.06 * (1 - dist/100)})`;
                    ctx.lineWidth = 0.5;
                    ctx.moveTo(particles[i].x, particles[i].y);
                    ctx.lineTo(particles[j].x, particles[j].y);
                    ctx.stroke();
                }
            }
        }

        // Particles
        particles.forEach(p => {
            p.pulse += p.pulseSpeed;
            const alpha = p.alpha * (0.7 + 0.3 * Math.sin(p.pulse));
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
            ctx.fillStyle = p.color.replace(')', `,${alpha})`).replace('rgb', 'rgba').replace('#', '');
            // simpler hex fill
            ctx.globalAlpha = alpha;
            ctx.fillStyle = p.color;
            ctx.fill();
            ctx.globalAlpha = 1;
            p.x += p.vx;
            p.y += p.vy;
            if (p.x < 0) p.x = canvas.width;
            if (p.x > canvas.width) p.x = 0;
            if (p.y < 0) p.y = canvas.height;
            if (p.y > canvas.height) p.y = 0;
        });

        // Shooting stars
        for (let i = stars.length - 1; i >= 0; i--) {
            const s = stars[i];
            const tx = Math.cos(s.angle) * s.len;
            const ty = Math.sin(s.angle) * s.len;
            const grad = ctx.createLinearGradient(s.x, s.y, s.x + tx, s.y + ty);
            grad.addColorStop(0, `rgba(255,255,255,0)`);
            grad.addColorStop(1, s.color + 'cc');
            ctx.beginPath();
            ctx.moveTo(s.x, s.y);
            ctx.lineTo(s.x + tx, s.y + ty);
            ctx.strokeStyle = grad;
            ctx.lineWidth = 1.5;
            ctx.globalAlpha = s.alpha;
            ctx.stroke();
            ctx.globalAlpha = 1;
            s.x += Math.cos(s.angle) * s.speed;
            s.y += Math.sin(s.angle) * s.speed;
            s.alpha -= 0.012;
            if (s.alpha <= 0) stars.splice(i, 1);
        }

        rafId = requestAnimationFrame(draw);
    }
    draw();

    // Dismiss intro
    function dismissIntro() {
        overlay.classList.add('fade-out');
        setTimeout(() => {
            overlay.classList.add('hidden');
            cancelAnimationFrame(rafId);
        }, 750);
    }

    playBtn.addEventListener('click', dismissIntro);

    // Also allow pressing Enter/Space
    document.addEventListener('keydown', e => {
        if (!overlay.classList.contains('hidden') && (e.key === 'Enter' || e.key === ' ')) {
            dismissIntro();
        }
    });
})();
