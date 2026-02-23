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
            musicGain.gain.value = 0.18;
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
    // A gentle procedural pad: slow chord arpeggios
    const chordSets = [
        [261.63, 329.63, 392.00, 493.88],  // C maj7
        [293.66, 369.99, 440.00, 554.37],  // D min7
        [349.23, 440.00, 523.25, 659.25],  // F maj7
        [329.63, 415.30, 493.88, 622.25],  // E min7
    ];

    function playMusicNote(freq, delay, duration) {
        if (musicMuted) return;
        const c = getCtx();
        const osc1 = c.createOscillator();
        const osc2 = c.createOscillator();
        const gain = c.createGain();
        osc1.type = 'sine';
        osc2.type = 'triangle';
        osc1.frequency.value = freq;
        osc2.frequency.value = freq * 2;
        osc2.detune.value = 5;
        gain.gain.setValueAtTime(0, c.currentTime + delay);
        gain.gain.linearRampToValueAtTime(0.5, c.currentTime + delay + 0.3);
        gain.gain.setValueAtTime(0.5, c.currentTime + delay + duration - 0.4);
        gain.gain.linearRampToValueAtTime(0, c.currentTime + delay + duration);
        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(musicGain);
        osc1.start(c.currentTime + delay);
        osc1.stop(c.currentTime + delay + duration + 0.1);
        osc2.start(c.currentTime + delay);
        osc2.stop(c.currentTime + delay + duration + 0.1);
        musicNodes.push(osc1, osc2, gain);
    }

    let musicLoop = null;
    let chordIndex = 0;
    let noteIndex = 0;
    const NOTE_INTERVAL = 0.55; // seconds between notes
    const CHORD_NOTES = 4;

    function scheduleMusicBeat() {
        if (musicMuted) return;
        const chord = chordSets[chordIndex % chordSets.length];
        const note = chord[noteIndex % CHORD_NOTES];
        const baseDuration = NOTE_INTERVAL * CHORD_NOTES;
        playMusicNote(note, 0, baseDuration * 1.2);
        noteIndex++;
        if (noteIndex % CHORD_NOTES === 0) chordIndex++;
        musicLoop = setTimeout(scheduleMusicBeat, NOTE_INTERVAL * 1000);
    }

    function startMusic() {
        if (musicStarted) return;
        musicStarted = true;
        getCtx();
        scheduleMusicBeat();
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
            musicGain && (musicGain.gain.value = 0.18);
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
