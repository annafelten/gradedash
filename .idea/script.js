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

const questionOverlay = document.getElementById("question-overlay"); // only for hiding
const explanationTextEl = document.getElementById("explanation-text");
const continueBtn = document.getElementById("continue-btn");

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
const NUM_LANES = 3;
const laneY = [120, 210, 300]; // vertical centers for lanes
const PLAYER_X = 140;
const PLAYER_WIDTH = 32;
const PLAYER_HEIGHT = 46;

// Questions: more frequent
const QUESTION_INTERVAL = 6000;      // ms between questions

const BASE_SPEED_CONST = 5;
const OBSTACLE_SPAWN_INTERVAL = 1500;

// -------- Game state --------
let gameState = "menu"; // "menu" | "playing" | "gameover"

let playerName = "";
let player;

let obstacles = [];      // red blockers
let questionBlocks = []; // blue answer blocks

let questionActive = false;   // answer blocks currently moving
let questionPrepare = false;  // pause state: show question, no movement
let activeQuestion = null;

let score = 0;
let streak = 0;
let bestStreak = 0;
let baseSpeed = BASE_SPEED_CONST; // difficulty baseline
let speed = BASE_SPEED_CONST;     // actual movement speed

let lastSpawnTime = 0;
let lastQuestionTime = 0;
let lastFrameTime = performance.now();

// feedback text (correct / not quite)
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
        lane: 1, // 0=top,1=middle,2=bottom
        x: PLAYER_X,
        y: laneY[1] - PLAYER_HEIGHT / 2,
        width: PLAYER_WIDTH,
        height: PLAYER_HEIGHT
    };

    obstacles = [];
    questionBlocks = [];
    questionActive = false;
    questionPrepare = false;
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
// INPUT: lane switching + ENTER
// ============================
window.addEventListener("keydown", (e) => {
    if (gameState !== "playing") return;

    if (e.code === "ArrowUp") {
        player.lane = Math.max(0, player.lane - 1);
    } else if (e.code === "ArrowDown") {
        player.lane = Math.min(NUM_LANES - 1, player.lane + 1);
    } else if (e.code === "Enter") {
        // When paused on a question, Enter spawns the moving answer blocks
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

    // Snap player to current lane
    player.y = laneY[player.lane] - player.height / 2;

    // Update feedback timer
    if (feedbackTimer > 0) {
        feedbackTimer -= dt;
        if (feedbackTimer <= 0) {
            feedbackTimer = 0;
            feedbackMessage = "";
        }
    }

    // ---- PAUSE PHASE: question text visible, world frozen ----
    if (questionPrepare) {
        // Player can still change lanes, but nothing moves and score doesn't tick
        return;
    }

    // Difficulty & speed only ramp when we're NOT paused
    baseSpeed += dt * 0.00001;
    speed = baseSpeed;

    // Spawn normal obstacles only when no question answers are active
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

    // Move question blocks (answers moving toward player)
    if (questionActive) {
        for (let i = questionBlocks.length - 1; i >= 0; i--) {
            const qb = questionBlocks[i];
            qb.x -= speed;
            if (qb.x + qb.width < 0) {
                questionBlocks.splice(i, 1);
            }
        }
        // if all passed without collision, count as missed
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

    // Collision with normal obstacles → game over
    for (const obs of obstacles) {
        if (rectIntersect(player, obs)) {
            triggerGameOver();
            return;
        }
    }

    // Collision with one of the answer blocks
    if (questionActive) {
        for (const qb of questionBlocks) {
            if (rectIntersect(player, qb)) {
                handleLaneAnswer(qb);
                break;
            }
        }
    }

    // Score: ticks only while world is moving
    score += dt * 0.02 * (1 + streak * 0.1);
    scoreText.textContent = Math.floor(score);

    // Maybe spawn a new question (start PAUSE phase – just question text)
    if (!questionActive && !questionPrepare && questionBank.length > 0 && now - lastQuestionTime > QUESTION_INTERVAL) {
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

    // ----- Question box at top when a question is active or in pause -----
    if ((questionActive || questionPrepare) && activeQuestion) {
        const boxX = 40;
        const boxY = 16;
        const boxW = canvas.width - 80;
        const boxH = 80;

        ctx.fillStyle = "#151823";
        ctx.fillRect(boxX, boxY, boxW, boxH);

        ctx.strokeStyle = "#4caf50";
        ctx.lineWidth = 2;
        ctx.strokeRect(boxX, boxY, boxW, boxH);

        ctx.fillStyle = "#ffffff";
        ctx.font = "18px system-ui";
        ctx.textBaseline = "top";
        wrapText(
            ctx,
            activeQuestion.question,
            boxX + 12,
            boxY + 12,
            boxW - 24,
            20
        );

        if (questionPrepare) {
            ctx.font = "14px system-ui";
            ctx.fillStyle = "#a5d6a7";
            ctx.fillText("Press Enter when you're ready to see answer choices.", boxX + 12, boxY + boxH - 22);
        }
    }

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

    // A+ indicator when streak > 0
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

    // Question answer blocks
    ctx.fillStyle = "#3949ab";
    ctx.font = "14px system-ui";
    ctx.textBaseline = "middle";

    for (const qb of questionBlocks) {
        ctx.fillRect(qb.x, qb.y, qb.width, qb.height);

        ctx.fillStyle = "#ffffff";
        const textX = qb.x + 8;
        const textY = qb.y + qb.height / 2;
        wrapText(ctx, qb.text, textX, textY - 8, qb.width - 16, 16);
        ctx.fillStyle = "#3949ab";
    }

    // Instructions
    ctx.fillStyle = "#ffffffaa";
    ctx.font = "16px system-ui";
    if (gameState === "playing") {
        ctx.fillText(
            "Use ↑ / ↓ to switch lanes. Avoid red blocks. Run into an answer to choose it.",
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
        ctx.fillText(feedbackMessage, 12, 110);
    }
}

// Helper to wrap text in blocks/box
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
// Question flow
// ----------------------------

// Start the pause phase: show question text, freeze world
function startQuestionPause() {
    if (questionBank.length === 0 || questionActive || questionPrepare) return;

    activeQuestion = questionBank[questionIndex % questionBank.length];
    questionIndex++;
    if(questionIndex >= questionNumber){
        gameoverFeedback = "You answered all questions!"
        triggerGameOver();
    }

    questionPrepare = true;
    questionActive = false;
    questionBlocks = [];

    if (explanationTextEl) explanationTextEl.textContent = "";
}

// Spawn the moving answer blocks after Enter is pressed
function spawnAnswerBlocks() {
    if (!activeQuestion || questionActive) return;

    questionPrepare = false;
    questionActive = true;
    questionBlocks = [];

    const optionIndices = [];
    for (let i = 0; i < Math.min(3, activeQuestion.options.length); i++) {
        optionIndices.push(i);
    }

    // Shuffle lanes
    const laneOrder = [0, 1, 2].sort(() => Math.random() - 0.5);

    const startX = canvas.width + 80;

    optionIndices.forEach((optIdx, i) => {
        const lane = laneOrder[i];
        const width = 160;
        const height = 64;
        const y = laneY[lane] - height / 2;

        questionBlocks.push({
            lane,
            x: startX,
            y,
            width,
            height,
            answerIndex: optIdx,
            text: activeQuestion.options[optIdx]
        });
    });
}

// Called when player collides with an answer block
function handleLaneAnswer(block) {
    if (!activeQuestion) return;

    const isCorrect = block.answerIndex === activeQuestion.correct_index;

    questionActive = false;
    questionBlocks = [];
    lastQuestionTime = performance.now();

    if (isCorrect) {
        streak++;
        bestStreak = Math.max(bestStreak, streak);
        streakText.textContent = streak.toString();
        if (streak >= 3) streakFire.classList.remove("hidden");

        // Speed up based on correct answers
        const speedBoost = 0.6 + 0.15 * Math.min(streak, 5);
        baseSpeed += speedBoost;

        score += 90 * (1 + streak * 0.3);
        scoreText.textContent = Math.floor(score).toString();

        feedbackMessage = "Correct! " + activeQuestion.explanation;
        feedbackTimer = 4000;
    } else {
        streak = 0;
        streakText.textContent = "0";
        streakFire.classList.add("hidden");

        feedbackMessage = "Not quite. " + activeQuestion.explanation;
        feedbackTimer = 4000;
    }
}

// ============================
// GAME OVER
// ============================
function triggerGameOver() {
    if (gameState === "gameover") return;
    gameState = "gameover";

    questionActive = false;
    questionPrepare = false;
    questionBlocks = [];

    finalScoreEl.textContent = Math.floor(score);
    finalStreakEl.textContent = bestStreak;
    gameoverNameDisplay.textContent = `Player: ${playerName || "Unknown"}`;
    gameoverOverlay.classList.remove("overlay-hidden");
}

// Restart
restartBtn.addEventListener("click", () => {
    gameoverOverlay.classList.add("overlay-hidden");
    resetGameState();
    gameState = "playing";
    lastFrameTime = performance.now();
});

// Back to menu
backMenuBtn.addEventListener("click", () => {
    gameoverOverlay.classList.add("overlay-hidden");
    hud.classList.add("hidden");
    setupScreen.classList.remove("hidden");
    gameState = "menu";
});

// ============================
// LEADERBOARD (LOCAL STORAGE)
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
// START GAME BUTTON
// ============================
startBtn.addEventListener("click", () => {
    const nameVal = playerNameInput.value.trim();
    if (!nameVal) {
        alert("Please enter a player name to continue.");
        return;
    }
    playerName = nameVal;
    playerNameLabel.textContent = playerName;

    // Later: use notesInput.value → Claude → questionBank.
    loadSampleQuestions();

    setupScreen.classList.add("hidden");
    hud.classList.remove("hidden");
    resetGameState();
    gameState = "playing";
    lastFrameTime = performance.now();
});

// ============================
// INITIALIZE
// ============================
renderLeaderboard();
resetGameState();
requestAnimationFrame(gameLoop);