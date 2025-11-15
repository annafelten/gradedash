// ============================
// GRADEDASH – 3-LANE GAME LOOP
// ============================

// Canvas & context
const canvas = document.getElementById("game-canvas");
const ctx = canvas.getContext("2d");

// UI elements
const setupScreen = document.getElementById("setup-screen");
const startBtn = document.getElementById("start-btn");
const notesInput = document.getElementById("notes-input");
const playerNameInput = document.getElementById("player-name-input");
const playerNameLabel = document.getElementById("player-name-label");

const hud = document.getElementById("hud");
const scoreText = document.getElementById("score-text");
const streakText = document.getElementById("streak-text");
const streakFire = document.getElementById("streak-fire");

const questionOverlay = document.getElementById("question-overlay");
const questionTextEl = document.getElementById("question-text");
const answersContainer = document.getElementById("answers-container");
const explanationTextEl = document.getElementById("explanation-text");
const questionBoxEl = document.getElementById("question-box");

const gameoverOverlay = document.getElementById("gameover-overlay");
const finalScoreEl = document.getElementById("final-score");
const finalStreakEl = document.getElementById("final-streak");
const gameoverNameDisplay = document.getElementById("gameover-name-display");
const restartBtn = document.getElementById("restart-btn");
const backMenuBtn = document.getElementById("back-menu-btn");
const submitScoreBtn = document.getElementById("submit-score-btn");

const gameoverFeedback = document.getElementById("gameover-feedback");

// Leaderboard elements
const leaderboardBody = document.getElementById("leaderboard-body");

// -------- Game constants --------
const NUM_LANES = 4;
// Spread 4 lanes evenly
const laneY = [90, 170, 250, 330];
const PLAYER_X = 140;
const PLAYER_WIDTH = 32;
const PLAYER_HEIGHT = 46;

const QUESTION_INTERVAL = 6000;      // ms between questions
const OBSTACLE_SPAWN_INTERVAL = 1500;
const BASE_SPEED_CONST = 5;

// -------- Game state --------
let gameState = "menu"; // "menu" | "playing" | "gameover";

let playerName = "";
let player;

let obstacles = [];      // red blockers
let questionBlocks = []; // blue answer blocks

let questionPrepare = false;  // paused to read question
let questionActive = false;   // answer blocks currently moving
let activeQuestion = null;

let score = 0;
let streak = 0;
let bestStreak = 0;
let baseSpeed = BASE_SPEED_CONST; // difficulty baseline
let speed = BASE_SPEED_CONST;     // current movement speed

let lastSpawnTime = 0;
let lastQuestionTime = 0;
let lastFrameTime = performance.now();

let feedbackMessage = "";
let feedbackTimer = 0; // ms remaining

// Questions
let questionBank = [];
let questionIndex = 0;
let questionNumber = 1;

// ============================
// SAMPLE QUESTIONS
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

    if (questionOverlay) questionOverlay.classList.add("overlay-hidden");
    if (gameoverOverlay) gameoverOverlay.classList.add("overlay-hidden");
}

// ============================
// INPUT: lanes + Enter
// ============================
window.addEventListener("keydown", (e) => {
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
            qb.x -= speed;
            if (qb.x + qb.width < 0) {
                questionBlocks.splice(i, 1);
            }
        }

        // If they all pass without collision, you missed the question
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

    // Collisions with normal obstacles → game over
    for (const obs of obstacles) {
        if (rectIntersect(player, obs)) {
            triggerGameOver();
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

    // Background
    ctx.fillStyle = "#14151c";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Lanes
    for (let i = 0; i < NUM_LANES; i++) {
        ctx.strokeStyle = "#252a3c";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, laneY[i]);
        ctx.lineTo(canvas.width, laneY[i]);
        ctx.stroke();
    }

    // Player
    ctx.fillStyle = "#ffc107";
    ctx.fillRect(player.x, player.y, player.width, player.height);

    // A+ indicator
    if (streak > 0) {
        ctx.fillStyle = "#ffffff";
        ctx.font = "18px system-ui";
        ctx.fillText("A+", player.x + player.width / 2 - 10, player.y - 10);
    }

    // Obstacles
    ctx.fillStyle = "#e53935";
    for (const obs of obstacles) {
        ctx.fillRect(obs.x, obs.y, obs.width, obs.height);
    }

    // Moving answer blocks in lanes
    ctx.textBaseline = "middle";
    for (const qb of questionBlocks) {
        ctx.fillStyle = "#3949ab";
        ctx.fillRect(qb.x, qb.y, qb.width, qb.height);

        // Letter label (A, B, C) inside block
        ctx.fillStyle = "#ffffff";
        ctx.font = "22px system-ui";
        const label = qb.label || "";
        const metrics = ctx.measureText(label);
        const textX = qb.x + (qb.width - metrics.width) / 2;
        const textY = qb.y + qb.height / 2;
        ctx.fillText(label, textX, textY);
    }

    // Instructions
    ctx.fillStyle = "#ffffffaa";
    ctx.font = "16px system-ui";
    if (gameState === "playing") {
        ctx.fillText(
            "Use ↑ / ↓ to switch lanes. Avoid red blocks. Run into a letter block (A/B/C) to choose your answer.",
            12,
            canvas.height - 18
        );
    } else if (gameState === "menu") {
        ctx.fillText(
            "Enter your name and click Start Game to begin.",
            12,
            canvas.height - 18
        );
    }

    // Feedback text
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
    const height = 40;
    const width = 26;
    const y = laneY[lane] - height / 2;

    obstacles.push({
        lane,
        x: canvas.width + 40,
        y,
        width,
        height
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

    // Show question bar
    if (questionOverlay) {
        questionOverlay.classList.remove("overlay-hidden");
    }

    // Slight random horizontal shift so it "moves" each time,
    // but stays within the 800px width and never off-screen.
    if (questionBoxEl) {
        const offsets = [-40, -20, 0, 20, 40];
        const dx = offsets[Math.floor(Math.random() * offsets.length)];
        questionBoxEl.style.transform = `translateX(${dx}px)`;
    }

    // Question text
    if (questionTextEl) {
        questionTextEl.textContent = activeQuestion.question;
    }

    // Show up to 4 options in the bar as static white boxes
    if (answersContainer) {
        answersContainer.innerHTML = "";
        const count = Math.min(4, activeQuestion.options.length);
        for (let idx = 0; idx < count; idx++) {
            const opt = activeQuestion.options[idx];
            const div = document.createElement("div");
            div.className = "answer-static";
            const label = String.fromCharCode(65 + idx); // A,B,C,D
            div.textContent = `${label}. ${opt}`;
            answersContainer.appendChild(div);
        }
    }

    if (explanationTextEl) {
        explanationTextEl.textContent =
            "Press Enter when you're ready. A/B/C/D blocks will spawn in the lanes.";
    }
}

function spawnAnswerBlocks() {
    if (!activeQuestion || questionActive) return;

    questionPrepare = false;
    questionActive = true;
    questionBlocks = [];

    // Up to 4 options → 4 lanes
    const optionIndices = [];
    const count = Math.min(4, activeQuestion.options.length);
    for (let i = 0; i < count; i++) {
        optionIndices.push(i);
    }

    // Shuffle lanes [0,1,2,3]
    const laneOrder = [0, 1, 2, 3].sort(() => Math.random() - 0.5);
    const startX = canvas.width + 80;

    optionIndices.forEach((optIdx, i) => {
        const lane = laneOrder[i];
        const width = 120;
        const height = 60;
        const y = laneY[lane] - height / 2;

        const label = String.fromCharCode(65 + optIdx); // A,B,C,D

        questionBlocks.push({
            lane,
            x: startX,
            y,
            width,
            height,
            answerIndex: optIdx,
            label
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
            explanationTextEl.textContent = "Correct! " + activeQuestion.explanation;
        }
    } else {
        streak = 0;
        streakText.textContent = "0";
        streakFire.classList.add("hidden");

        feedbackMessage = "Not quite.";
        feedbackTimer = 2000;

        if (explanationTextEl) {
            explanationTextEl.textContent = "Not quite. " + activeQuestion.explanation;
        }
    }
    if(questionIndex >= questionNumber){
        gameoverFeedback.textContent = "You've answered all questions.";
        triggerGameOver();
    }
}


// ============================
// GAME OVER
// ============================
function triggerGameOver() {
    if (gameState === "gameover") return;
    gameState = "gameover";
    if (questionOverlay) {
        questionOverlay.classList.add("overlay-hidden");
    }

    questionActive = false;
    questionPrepare = false;
    questionBlocks = [];

    finalScoreEl.textContent = Math.floor(score);
    finalStreakEl.textContent = bestStreak;
    gameoverNameDisplay.textContent = `Player: ${playerName || "Unknown"}`;
    gameoverOverlay.classList.remove("overlay-hidden");
}

restartBtn.addEventListener("click", () => {
    gameoverOverlay.classList.add("overlay-hidden");
    resetGameState();
    gameState = "playing";
    lastFrameTime = performance.now();
});

backMenuBtn.addEventListener("click", () => {
    gameoverOverlay.classList.add("overlay-hidden");
    hud.classList.add("hidden");
    setupScreen.classList.remove("hidden");
    gameState = "menu";
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
// START GAME
// ============================
startBtn.addEventListener("click", () => {
    const nameVal = playerNameInput.value.trim();
    if (!nameVal) {
        alert("Please enter a player name to continue.");
        return;
    }
    playerName = nameVal;
    playerNameLabel.textContent = playerName;

    loadSampleQuestions();

    setupScreen.classList.add("hidden");
    hud.classList.remove("hidden");
    resetGameState();
    gameState = "playing";
    lastFrameTime = performance.now();
});

// ============================
// INIT
// ============================
renderLeaderboard();
resetGameState();
requestAnimationFrame(gameLoop);