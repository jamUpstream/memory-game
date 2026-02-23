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

    resetTurn();

    if (matchedCount === cards.length) {
        setTimeout(endGame, 400);
    }
}

function handleMismatch(card1, card2) {
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
    finalMoves.textContent = moves;
    finalTime.textContent  = time;
    winOverlay.classList.add("show");
}

/* =========================
   Event Listeners
========================= */
restartBtn.addEventListener("click", createBoard);
playAgainBtn.addEventListener("click", createBoard);

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
