// ============================
// CONFIG
// ============================

const BACKEND_URL = "http://localhost:3000"; // change if you deploy
// --- REMOVED musicToggle and bgMusic ---

// --- REMOVED character selection ---
const selectedCharacter = "gold"; // Hard-coded to gold

// ============================
// DOM ELEMENTS
// ============================

// Canvas & context
const canvas = document.getElementById("game-canvas");
const ctx = canvas.getContext("2d");

// Setup UI
const setupScreen = document.getElementById("setup-screen");
const startBtn = document.getElementById("start-btn");
const playerNameInput = document.getElementById("player-name-input");

const modeExistingRadio = document.getElementById("mode-existing");
const modeNotesRadio = document.getElementById("mode-notes");

const existingModePanel = document.getElementById("existing-mode-panel");
const notesModePanel = document.getElementById("notes-mode-panel");

const setSearchInput = document.getElementById("set-search-input");
const setResults = document.getElementById("set-results");

const notesInput = document.getElementById("notes-input");
const pdfInput = document.getElementById("pdf-input");

const ANSWER_BLOCK_SPEED_MULT = 0.45; // 45% of normal speed so they linger

const notesQuestionCountInput = document.getElementById(
    "notes-question-count"
);
const notesStyleInput = document.getElementById("notes-style-input");

// HUD
const hud = document.getElementById("hud");
const scoreText = document.getElementById("score-text");
const streakText = document.getElementById("streak-text");
const streakFire = document.getElementById("streak-fire");
const playerNameLabel = document.getElementById("player-name-label");

// Question bar
const questionOverlay = document.getElementById("question-overlay");
const questionTextEl = document.getElementById("question-text");
const explanationTextEl = document.getElementById("explanation-text");
const questionBoxEl = document.getElementById("question-box");

// Game over
const gameoverOverlay = document.getElementById("gameover-overlay");
const finalScoreEl = document.getElementById("final-score");
const finalStreakEl = document.getElementById("final-streak");
const gameoverNameDisplay = document.getElementById(
    "gameover-name-display"
);
const gameoverFeedback = document.getElementById("gameover-feedback");
const restartBtn = document.getElementById("restart-btn");
const backMenuBtn = document.getElementById("back-menu-btn");
const submitScoreBtn = document.getElementById("submit-score-btn");

// Leaderboard
// Leaderboard elements
const leaderboardSection = document.getElementById("leaderboard-section");
const leaderboardBody = document.getElementById("leaderboard-body");

// ============================
// GAME CONSTANTS
// ============================

const NUM_LANES = 4;
const laneY = [90, 170, 250, 330]; // vertical centers for lanes
const PLAYER_X = 140;
const PLAYER_WIDTH = 32;
const PLAYER_HEIGHT = 46;

const QUESTION_INTERVAL = 6000; // ms between questions
const OBSTACLE_SPAWN_INTERVAL = 1500;
const BASE_SPEED_CONST = 5;

// Fun "distraction" obstacles – now as image sprites
// (paths are relative to index.html; adjust if your structure is different)
const OBSTACLE_TYPES = [
    { kind: "tiktok",    src: "../assets/tiktok.png" },
    { kind: "instagram", src: "../assets/instagram.png" },
    { kind: "netflix",   src: "../assets/netflix.png" },
    { kind: "ice",       src: "../assets/ice.gif" },
    { kind: "funny1",    src: "../assets/funny1.gif" },
    { kind: "funny2",    src: "../assets/funny2.gif" }
];

// --- SIMPLIFIED: Only load the gold sprite ---
// (Uses the ../assets/ path, which you said worked for obstacles)
const PLAYER_SPRITE = new Image();
PLAYER_SPRITE.src = "../assets/runner_gold.png";
PLAYER_SPRITE.onload = () => {
    console.log("[PLAYER IMG] Loaded: " + PLAYER_SPRITE.src);
};
PLAYER_SPRITE.onerror = () => {
    console.error("[PLAYER IMG] FAILED to load: " + PLAYER_SPRITE.src);
};
// --- END SIMPLIFICATION ---


// Preload images into a cache so we don't recreate Image() every frame
const OBSTACLE_IMAGES = {};
for (const type of OBSTACLE_TYPES) {
    const img = new Image();
    img.src = type.src; // Uses the path from OBSTACLE_TYPES (../assets/)

    img.onload = () => {
        console.log("[OBSTACLE IMG] loaded:", type.src, img.naturalWidth, img.naturalHeight);
    };
    img.onerror = () => {
        console.error("[OBSTACLE IMG] FAILED to load:", type.src);
    };

    OBSTACLE_IMAGES[type.kind] = img;
}
// ============================
// GAME STATE
// ============================

let gameState = "menu"; // "menu" | "playing" | "gameover";

let playerName = "";
let player;

let obstacles = []; // distractions
let questionBlocks = []; // answer blocks in lanes

let questionPrepare = false; // paused to read question
let questionActive = false; // answer blocks currently moving
let activeQuestion = null;

let score = 0;
let streak = 0;
let bestStreak = 0;
let baseSpeed = BASE_SPEED_CONST; // difficulty baseline
let speed = BASE_SPEED_CONST; // current movement speed

let lastSpawnTime = 0;
let lastQuestionTime = 0;
let lastFrameTime = performance.now();

let feedbackMessage = "";
let feedbackTimer = 0; // ms remaining

// Question data
let questionBank = [];
let questionIndex = 0;

// for existing sets mode
let selectedSetId = null;


// ============================
// SAMPLE QUESTIONS (fallback)
// ============================
function loadSampleQuestions() {
    questionBank = [
        {
            question: "What is 3 × 4?",
            options: ["7", "9", "12", "24"],
            correct_index: 2,
            explanation: "3 multiplied by 4 is 12."
        },
        {
            question: "Which gas do plants absorb for photosynthesis?",
            options: ["Oxygen", "Carbon dioxide", "Nitrogen", "Helium"],
            correct_index: 1,
            explanation: "Plants use carbon dioxide and release oxygen."
        },
        {
            question: "In the word 'resilient', what does it mean?",
            options: [
                "Able to recover quickly from difficulty",
                "Very tired",
                "Always happy",
                "Afraid of change"
            ],
            correct_index: 0,
            explanation: "Resilient means bouncing back after challenges."
        },
        {
            question: "What is the capital of France?",
            options: ["Berlin", "Paris", "Rome", "Madrid"],
            correct_index: 1,
            explanation: "Paris is the capital city of France."
        },
        {
            question: "What is 5²?",
            options: ["10", "15", "20", "25"],
            correct_index: 3,
            explanation: "5 squared is 5 × 5 = 25."
        }
    ];
}

// ============================
// BACKEND INTEGRATION
// ============================

async function loadQuestionsFromExistingSet(setId) {
    const res = await fetch(`${BACKEND_URL}/api/sets/${setId}`);
    if (!res.ok) {
        alert("Failed to load study set. Using sample questions instead.");
        loadSampleQuestions();
        questionIndex = 0;
        return;
    }
    const data = await res.json();
    questionBank = data.questions || [];
    if (!questionBank.length) {
        loadSampleQuestions();
    }
    questionIndex = 0;
}

async function generateQuestionsFromNotes(notesText, count, stylePrompt) {
    const defaultStyle =
        `Based on this text, generate ${count} multiple-choice questions ` +
        `with 4 options each, focusing on conceptual understanding, common exam traps, ` +
        `and a short explanation for each answer.`;

    const fullPrompt =
        stylePrompt && stylePrompt.trim().length > 0
            ? stylePrompt
            : defaultStyle;

    const res = await fetch(`${BACKEND_URL}/api/generate-questions`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({
            notes: notesText,
            instructions: fullPrompt,
            numQuestions: count
        })
    });

    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        console.error("Generation error:", err);
        alert("Could not generate questions. Using sample questions instead.");
        loadSampleQuestions();
        questionIndex = 0;
    }
}

async function generateQuestionsFromPdf(pdfFile, count, stylePrompt) {
    const formData = new FormData();
    formData.append("pdf", pdfFile);

    if (count) formData.append("numQuestions", String(count));
    if (stylePrompt && stylePrompt.trim().length > 0) {
        formData.append("instructions", stylePrompt);
    }

    try {
        const res = await fetch(`${BACKEND_URL}/api/generate-from-pdf`, {
            method: "POST",
            body: formData
        });

        if (!res.ok) {
            let errMsg = `PDF generation failed (${res.status})`;
            try {
                const err = await res.json();
                if (err && err.error) {
                    errMsg += `: ${err.error}`;
                }
                console.error("PDF generation error:", err);
            } catch {
                // ignore JSON parse error
            }
            alert(errMsg);
            throw new Error(errMsg);
        }

        const data = await res.json();
        questionBank = Array.isArray(data) ? data : [];
        if (!questionBank.length) {
            loadSampleQuestions();
        }
        questionIndex = 0;
    } catch (err) {
        console.error("Error generating from PDF:", err);
        alert(
            "Could not generate questions from the PDF. Using sample questions instead."
        );
        loadSampleQuestions();
        questionIndex = 0;
    }
}


async function fetchSetResults() {
    const q = setSearchInput.value.trim();
    try {
        const res = await fetch(
            `${BACKEND_URL}/api/sets?query=${encodeURIComponent(q)}`
        );
        if (!res.ok) {
            console.error("Sets request failed:", res.status, res.statusText);
            return;
        }
        const sets = await res.json();

        setResults.innerHTML = "";
        selectedSetId = null;

        sets.forEach((s) => {
            const div = document.createElement("div");
            div.className = "set-result";
            div.dataset.setId = s.id;
            div.innerHTML = `
       <div class="set-title">${s.title}</div>
       <div class="set-meta">${s.questionCount} questions · ${s.meta}</div>
     `;
            div.addEventListener("click", () => {
                document
                    .querySelectorAll(".set-result.selected")
                    .forEach((el) => el.classList.remove("selected"));
                div.classList.add("selected");
                selectedSetId = s.id;
            });
            setResults.appendChild(div);
        });
    } catch (err) {
        console.error("Error fetching sets:", err);
    }
}

// simple debounce
function debounce(fn, delay) {
    let id;
    return function (...args) {
        clearTimeout(id);
        id = setTimeout(() => fn.apply(this, args), delay);
    };
}

// ============================
// GAME SETUP / RESET
// ============================
function resetGameState() {
    player = {
        lane: 1,
        x: PLAYER_X,
        y: laneY[1] - PLAYER_HEIGHT / 2,
        width: PLAYER_WIDTH,
        height: PLAYER_HEIGHT
    };

    obstacles = [];
    questionBlocks = [];
    questionPrepare = false;
    questionActive = false;
    activeQuestion = null;
    questionIndex = 0;

    score = 0;
    streak = 0;
    bestStreak = 0;
    baseSpeed = BASE_SPEED_CONST;
    speed = BASE_SPEED_CONST;
    lastSpawnTime = performance.now();
    lastQuestionTime = performance.now();
    feedbackMessage = "";
    feedbackTimer = 0;

    scoreText.textContent = "0";
    streakText.textContent = "0";
    streakFire.classList.add("hidden");

    submitScoreBtn.disabled = false;
    submitScoreBtn.textContent = "Save Score";

    if (questionOverlay) questionOverlay.classList.add("question-hidden");
    if (gameoverOverlay) gameoverOverlay.classList.add("overlay-hidden");
}

// ============================
// INPUT: lanes + Enter
// ============================
window.addEventListener("keydown", (e) => {
    // Prevent page from scrolling while using arrow keys in-game
    if (
        gameState === "playing" &&
        (e.code === "ArrowUp" || e.code === "ArrowDown")
    ) {
        e.preventDefault();
    }

    if (gameState !== "playing") return;

    if (e.code === "ArrowUp") {
        player.lane = Math.max(0, player.lane - 1);
    } else if (e.code === "ArrowDown") {
        player.lane = Math.min(NUM_LANES - 1, player.lane + 1);
    } else if (e.code === "Enter") {
        if (questionPrepare && !questionActive) {
            spawnAnswerBlocks();
        }
    }
});
// ============================
// MAIN GAME LOOP
// ============================
function gameLoop(timestamp) {
    const dt = timestamp - lastFrameTime;
    lastFrameTime = timestamp;

    if (gameState === "playing") {
        update(dt);
        document.body.classList.add("playing");
    }

    draw();
    requestAnimationFrame(gameLoop);
}

// ============================
// UPDATE LOGIC
// ============================
function update(dt) {
    const now = performance.now();

    // Snap player to lane
    player.y = laneY[player.lane] - player.height / 2;

    // Feedback timer
    if (feedbackTimer > 0) {
        feedbackTimer -= dt;
        if (feedbackTimer <= 0) {
            feedbackTimer = 0;
            feedbackMessage = "";
        }
    }

    // If we're in "read the question" pause: world frozen, score frozen
    if (questionPrepare) {
        return;
    }

    // Only ramp speed when game is actually running
    baseSpeed += dt * 0.00001;
    speed = baseSpeed;

    // Spawn obstacles if no answers are active
    if (!questionActive && now - lastSpawnTime > OBSTACLE_SPAWN_INTERVAL) {
        spawnObstacle();
        lastSpawnTime = now;
    }

    // Move obstacles
    for (let i = obstacles.length - 1; i >= 0; i--) {
        const o = obstacles[i];
        o.x -= speed;
        if (o.x + o.width < 0) {
            obstacles.splice(i, 1);
        }
    }

    // Move answer blocks if active
    if (questionActive) {
        for (let i = questionBlocks.length - 1; i >= 0; i--) {
            const qb = questionBlocks[i];
            qb.x -= speed * ANSWER_BLOCK_SPEED_MULT; // slower so they stay visible longer
            if (qb.x + qb.width < 0) {
                questionBlocks.splice(i, 1);
            }
        }

        // If all pass without collision, you missed the question
        if (questionBlocks.length === 0) {
            questionActive = false;
            lastQuestionTime = now;
            streak = 0;
            streakText.textContent = "0";
            streakFire.classList.add("hidden");
            feedbackMessage = "Missed question — streak reset.";
            feedbackTimer = 2500;
        }
    }


    // Collisions with distractions → game over
    for (const obs of obstacles) {
        if (rectIntersect(player, obs)) {
            triggerGameOver("You ran into a distraction.");
            return;
        }
    }

    // Collisions with answer blocks
    if (questionActive) {
        for (const qb of questionBlocks) {
            if (rectIntersect(player, qb)) {
                handleLaneAnswer(qb);
                break;
            }
        }
    }

    // Score ticks only when world is moving
    score += dt * 0.02 * (1 + streak * 0.1);
    scoreText.textContent = Math.floor(score);

    // Spawn a new question → pause state (questionPrepare)
    if (
        !questionActive &&
        !questionPrepare &&
        questionBank.length > 0 &&
        now - lastQuestionTime > QUESTION_INTERVAL
    ) {
        startQuestionPause();
    }
}

// ============================
// DRAWING
// ============================
function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // -------- Background --------
    ctx.fillStyle = "#14151c";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // -------- Lanes --------
    for (let i = 0; i < NUM_LANES; i++) {
        ctx.strokeStyle = "#252a3c";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, laneY[i]);
        ctx.lineTo(canvas.width, laneY[i]);
        ctx.stroke();
    }

    // -------- Player (sprite based on selectedCharacter) --------
    // --- SIMPLIFIED: Always use PLAYER_SPRITE (gold) ---
    if (PLAYER_SPRITE && PLAYER_SPRITE.naturalWidth > 0) {
        ctx.drawImage(PLAYER_SPRITE, player.x, player.y, player.width, player.height);
    } else {
        // Fallback rectangle if image is still loading or failed
        ctx.fillStyle = "#ffc107"; // Hard-coded gold color
        ctx.fillRect(player.x, player.y, player.width, player.height);
    }

    // A+ indicator above player when streak > 0
    if (streak > 0) {
        ctx.fillStyle = "#ffffff";
        ctx.font = "18px system-ui";
        ctx.fillText("A+", player.x + player.width / 2 - 10, player.y - 10);
    }

    // -------- Obstacles (distractions) --------
    for (const obs of obstacles) {
        const img = obs.img;

        // If image actually loaded, draw it; else red fallback box
        if (img && img.naturalWidth > 0) {
            ctx.drawImage(img, obs.x, obs.y, obs.width, obs.height);
        } else {
            ctx.fillStyle = "#e53935"; // Fallback color
            ctx.fillRect(obs.x, obs.y, obs.width, obs.height);
        }
    }

    // -------- Answer blocks (A/B/C/D) --------
    ctx.textBaseline = "top";
    for (const qb of questionBlocks) {
        // Card background
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(qb.x, qb.y, qb.width, qb.height);

        // Card border
        ctx.strokeStyle = "#000000";
        ctx.lineWidth = 2;
        ctx.strokeRect(qb.x, qb.y, qb.width, qb.height);

        // Text
        ctx.fillStyle = "#000000";
        ctx.font = "16px system-ui";

        const labelText = `${qb.label}) ${qb.text || ""}`;
        wrapText(ctx, labelText, qb.x + 10, qb.y + 10, qb.width - 20, 20);
    }

    // -------- Instructions at bottom --------
    ctx.fillStyle = "#ffffffaa";
    ctx.font = "16px system-ui";
    if (gameState === "playing") {
        ctx.fillText(
            "↑ / ↓ to switch lanes. Avoid distractions. Dodge into A/B/C/D blocks to answer.",
            12,
            canvas.height - 18
        );
    } else if (gameState === "menu") {
        ctx.fillText(
            "Fill the setup above and click Start Game.",
            12,
            canvas.height - 18
        );
    }

    // -------- Feedback text (Correct / Not quite / Missed, etc.) --------
    if (feedbackTimer > 0 && feedbackMessage) {
        ctx.fillStyle = "#ffffff";
        ctx.font = "16px system-ui";
        ctx.fillText(feedbackMessage, 12, 40);
    }
}

// ============================
// TEXT WRAP HELPER
// ============================
function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
    const words = text.split(" ");
    let line = "";
    let offsetY = 0;

    for (let n = 0; n < words.length; n++) {
        const testLine = line + words[n] + " ";
        const metrics = ctx.measureText(testLine);
        const testWidth = metrics.width;
        if (testWidth > maxWidth && n > 0) {
            ctx.fillText(line, x, y + offsetY);
            line = words[n] + " ";
            offsetY += lineHeight;
        } else {
            line = testLine;
        }
    }
    ctx.fillText(line, x, y + offsetY);
}

// ============================
// HELPERS
// ============================
function spawnObstacle() {
    const lane = Math.floor(Math.random() * NUM_LANES);

    const size = 60;
    const width = size;
    const height = size;
    const y = laneY[lane] - height / 2;

    const type = OBSTACLE_TYPES[Math.floor(Math.random() * OBSTACLE_TYPES.length)];
    const img = OBSTACLE_IMAGES[type.kind];

    console.log("[SPAWN] obstacle", type.kind, "lane", lane);

    obstacles.push({
        lane,
        x: canvas.width + 40,
        y,
        width,
        height,
        kind: type.kind,
        img
    });
}


function rectIntersect(a, b) {
    return !(
        a.x + a.width < b.x ||
        a.x > b.x + b.width ||
        a.y + a.height < b.y ||
        a.y > b.y + b.height
    );
}

// ----------------------------
// QUESTION FLOW
// ----------------------------
function startQuestionPause() {
    if (questionBank.length === 0 || questionActive || questionPrepare) return;

    activeQuestion = questionBank[questionIndex % questionBank.length];
    questionIndex++;

    questionPrepare = true;
    questionActive = false;
    questionBlocks = [];

    // Show question bar (it already has reserved space)
    if (questionOverlay) {
        questionOverlay.classList.remove("question-hidden");
    }

    // slight horizontal jitter so it "moves" a bit
    if (questionBoxEl) {
        const offsets = [-20, -10, 0, 10, 20];
        const dx = offsets[Math.floor(Math.random() * offsets.length)];
        questionBoxEl.style.transform = `translateX(${dx}px)`;
    }

    if (questionTextEl) {
        questionTextEl.textContent = activeQuestion.question;
    }

    if (explanationTextEl) {
        explanationTextEl.textContent =
            "Press Enter when you're ready. Answer choices will appear as A/B/C/D blocks in lanes.";
    }
}

function spawnAnswerBlocks() {
    if (!activeQuestion || questionActive) return;

    questionPrepare = false;
    questionActive = true;
    questionBlocks = [];

    const options = activeQuestion.options || [];
    const count = Math.min(4, options.length);
    if (count === 0) {
        questionActive = false;
        return;
    }

    const optionIndices = [];
    for (let i = 0; i < count; i++) {
        optionIndices.push(i);
    }

    const laneOrder = [0, 1, 2, 3].sort(() => Math.random() - 0.5);
    const startX = canvas.width + 80;

    optionIndices.forEach((optIdx, i) => {
        const lane = laneOrder[i];
        const width = 260;   // wider cards
        const height = 80;   // taller so text isn’t cramped
        const y = laneY[lane] - height / 2;

        const label = String.fromCharCode(65 + optIdx); // A,B,C,D

        questionBlocks.push({
            lane,
            x: startX,
            y,
            width,
            height,
            answerIndex: optIdx,
            label,
            text: options[optIdx]
        });
    });

    if (explanationTextEl) {
        explanationTextEl.textContent =
            "Dodge into the lane for A, B, C, or D to choose your answer!";
    }
}

function handleLaneAnswer(block) {
    if (!activeQuestion) return;

    const isCorrect = block.answerIndex === activeQuestion.correct_index;

    questionActive = false;
    questionBlocks = [];
    lastQuestionTime = performance.now();

    if (isCorrect) {
        streak++;
        bestStreak = Math.max(bestStreak, streak);
        streakText.textContent = String(streak);
        if (streak >= 3) streakFire.classList.remove("hidden");

        const speedBoost = 0.6 + 0.15 * Math.min(streak, 5);
        baseSpeed += speedBoost;

        score += 90 * (1 + streak * 0.3);
        scoreText.textContent = String(Math.floor(score));

        feedbackMessage = "Correct!";
        feedbackTimer = 2000;

        if (explanationTextEl) {
            explanationTextEl.textContent =
                "Correct! " + (activeQuestion.explanation || "");
        }
    } else {
        streak = 0;
        streakText.textContent = "0";
        streakFire.classList.add("hidden");

        feedbackMessage = "Not quite.";
        feedbackTimer = 2000;

        if (explanationTextEl) {
            explanationTextEl.textContent =
                "Not quite. " + (activeQuestion.explanation || "");
        }
    }
}

// ============================
// GAME OVER
// ============================
function triggerGameOver(message) {
    if (gameState === "gameover") return;
    gameState = "gameover";

    if (questionOverlay) {
        questionOverlay.classList.add("question-hidden");
    }

    questionActive = false;
    questionPrepare = false;
    questionBlocks = [];

    finalScoreEl.textContent = Math.floor(score);
    finalStreakEl.textContent = bestStreak;
    gameoverNameDisplay.textContent = `Player: ${playerName || "Unknown"}`;
    if (gameoverFeedback) {
        gameoverFeedback.textContent = message || "";
    }
    gameoverOverlay.classList.remove("overlay-hidden");

    // show leaderboard again on game over
    leaderboardSection.classList.remove("hidden");
}

restartBtn.addEventListener("click", () => {
    gameoverOverlay.classList.add("overlay-hidden");
    resetGameState();
    gameState = "playing";
    hud.classList.remove("hidden");
    leaderboardSection.classList.add("hidden");
    lastFrameTime = performance.now();
});

// BUG FIX: Moved this listener OUT of the gameLoop to prevent memory leak
backMenuBtn.addEventListener("click", () => {
    gameoverOverlay.classList.add("overlay-hidden");
    hud.classList.add("hidden");
    setupScreen.classList.remove("hidden");
    leaderboardSection.classList.remove("hidden");
    gameState = "menu";
    document.body.classList.remove("playing");
    leaderboardSection.classList.remove("hidden"); // This was in your original, but it's redundant
});

// ============================
// LEADERBOARD
// ============================
const LEADERBOARD_KEY = "gradedash_leaderboard";

function loadLeaderboard() {
    const raw = localStorage.getItem(LEADERBOARD_KEY);
    if (!raw) return [];
    try {
        return JSON.parse(raw);
    } catch {
        return [];
    }
}

function saveLeaderboard(entries) {
    localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(entries));
}

function renderLeaderboard() {
    const entries = loadLeaderboard()
        .sort((a, b) => b.score - a.score)
        .slice(0, 10);

    leaderboardBody.innerHTML = "";
    entries.forEach((entry, idx) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
      <td>${idx + 1}</td>
      <td>${entry.name}</td>
      <td>${entry.score}</td>
      <td>${entry.bestStreak}</td>
    `;
        leaderboardBody.appendChild(tr);
    });
}

submitScoreBtn.addEventListener("click", () => {
    const entries = loadLeaderboard();
    entries.push({
        name: playerName || "Unknown",
        score: Math.floor(score),
        bestStreak
    });
    saveLeaderboard(entries);
    renderLeaderboard();
    submitScoreBtn.disabled = true;
    submitScoreBtn.textContent = "Saved!";
});

// ============================
// START GAME FLOW
// ============================

modeExistingRadio.addEventListener("change", () => {
    if (modeExistingRadio.checked) {
        existingModePanel.classList.remove("hidden");
        notesModePanel.classList.add("hidden");
    }
});

modeNotesRadio.addEventListener("change", () => {
    if (modeNotesRadio.checked) {
        existingModePanel.classList.add("hidden");
        notesModePanel.classList.remove("hidden");
    }
});

setSearchInput.addEventListener("input", debounce(fetchSetResults, 300));

startBtn.addEventListener("click", async () => {
    const nameVal = playerNameInput.value.trim();
    if (!nameVal) {
        alert("Please enter a player name to continue.");
        return;
    }
    playerName = nameVal;
    playerNameLabel.textContent = playerName;

    // --- REMOVED character selection logic ---
    // selectedCharacter is already "gold" by default

    // --- REMOVED music toggle logic ---

    startBtn.disabled = true;
    const originalText = startBtn.textContent;
    startBtn.textContent = "Loading questions...";

    try {
        const count = parseInt(notesQuestionCountInput.value, 10) || 12;
        const style = notesStyleInput.value;
        const pdfFile = pdfInput.files && pdfInput.files[0];

        if (pdfFile) {
            // prefer PDF
            await generateQuestionsFromPdf(pdfFile, count, style);
        } else if (modeExistingRadio.checked) {
            if (!selectedSetId) {
                alert("Please choose a study set first.");
                return;
            }
            await loadQuestionsFromExistingSet(selectedSetId);
        } else {
            const notes = (notesInput.value || "").trim();
            if (!notes) {
                alert("Upload a PDF or paste some notes first.");
                return;
            }
            await generateQuestionsFromNotes(notes, count, style);
        }

        // fallback
        if (!questionBank || !questionBank.length) {
            loadSampleQuestions();
        }

        setupScreen.classList.add("hidden");
        hud.classList.remove("hidden");
        leaderboardSection.classList.add("hidden");

        resetGameState();
        gameState = "playing";
        lastFrameTime = performance.now();
    } catch (err) {
        console.error("Error in Start Game:", err);
        alert("Something went wrong starting the game. Check the console.");
    } finally {
        startBtn.disabled = false;
        startBtn.textContent = originalText;
    }
});

// ============================
// INIT
// ============================
renderLeaderboard();
loadSampleQuestions(); // default questions if backend fails / not used
resetGameState();
requestAnimationFrame(gameLoop);