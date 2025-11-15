// ============================
// GRADEDASH – BASIC GAME LOOP
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
const continueBtn = document.getElementById("continue-btn");


const gameoverOverlay = document.getElementById("gameover-overlay");
const finalScoreEl = document.getElementById("final-score");
const finalStreakEl = document.getElementById("final-streak");
const gameoverNameDisplay = document.getElementById("gameover-name-display");
const restartBtn = document.getElementById("restart-btn");
const backMenuBtn = document.getElementById("back-menu-btn");
const submitScoreBtn = document.getElementById("submit-score-btn");


// Leaderboard elements
const leaderboardBody = document.getElementById("leaderboard-body");


// Game constants
const groundY = 340;
const gravity = 0.6;
const jumpForce = -12;
const QUESTION_INTERVAL = 12000; // ms
const BASE_SPEED = 5;


// Game state variables
let gameState = "menu"; // "menu" | "playing" | "question" | "gameover"
let playerName = "";
let player;
let obstacles;
let score;
let streak;
let bestStreak;
let speed;
let lastSpawnTime = 0;
let spawnInterval = 1500; // ms
let lastQuestionTime = 0;
let lastFrameTime = performance.now();


// Questions
let questionBank = [];
let questionIndex = 0;
let currentQuestion = null;


// Input state
let keys = {};


// ============================
// SAMPLE QUESTIONS
// (Later: replace with Claude API output)
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
       x: 80,
       y: groundY - 40,
       width: 30,
       height: 40,
       vy: 0,
       onGround: true
   };


   obstacles = [];
   score = 0;
   streak = 0;
   bestStreak = 0;
   speed = BASE_SPEED;
   lastSpawnTime = performance.now();
   lastQuestionTime = performance.now();
   questionIndex = 0;
   currentQuestion = null;
   scoreText.textContent = "0";
   streakText.textContent = "0";
   streakFire.classList.add("hidden");


   // Reset score button state
   submitScoreBtn.disabled = false;
   submitScoreBtn.textContent = "Save Score";


   // Ensure overlays are hidden
   questionOverlay.classList.add("hidden");
   gameoverOverlay.classList.add("hidden");
}


// ============================
// INPUT: JUMP
// ============================
window.addEventListener("keydown", (e) => {
   keys[e.code] = true;


   if ((e.code === "Space" || e.code === "ArrowUp") && gameState === "playing") {
       if (player.onGround) {
           player.vy = jumpForce;
           player.onGround = false;
       }
   }
});


window.addEventListener("keyup", (e) => {
   keys[e.code] = false;
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
   // Physics
   player.vy += gravity;
   player.y += player.vy;
   if (player.y + player.height >= groundY) {
       player.y = groundY - player.height;
       player.vy = 0;
       player.onGround = true;
   }


   const now = performance.now();


   // Spawn new obstacles
   if (now - lastSpawnTime > spawnInterval) {
       spawnObstacle();
       lastSpawnTime = now;
   }


   // Move obstacles
   for (let i = obstacles.length - 1; i >= 0; i--) {
       obstacles[i].x -= speed;
       if (obstacles[i].x + obstacles[i].width < 0) {
           obstacles.splice(i, 1);
       }
   }


   // Collision detection
   for (const obs of obstacles) {
       if (rectIntersect(player, obs)) {
           triggerGameOver();
           return;
       }
   }


   // Update score
   score += dt * 0.02 * (1 + streak * 0.1);
   scoreText.textContent = Math.floor(score);


   // Slight difficulty increase over time
   speed += dt * 0.00002;


   // Trigger question
   if (questionBank.length > 0 && now - lastQuestionTime > QUESTION_INTERVAL) {
       triggerQuestion();
   }
}


// ============================
// DRAWING
// ============================
function draw() {
   ctx.clearRect(0, 0, canvas.width, canvas.height);


   // Background wall
   ctx.fillStyle = "#14151c";
   ctx.fillRect(0, 0, canvas.width, canvas.height);


   // Floor
   ctx.fillStyle = "#1f2230";
   ctx.fillRect(0, groundY, canvas.width, canvas.height - groundY);


   // Lockers (simple rectangles)
   ctx.fillStyle = "#263445";
   for (let x = 0; x < canvas.width; x += 80) {
       ctx.fillRect(x + 12, 40, 50, 120);
   }


   // Player
   ctx.fillStyle = "#ffc107";
   ctx.fillRect(player.x, player.y, player.width, player.height);


   // A+ indicator when streak > 0
   if (streak > 0) {
       ctx.fillStyle = "#fff";
       ctx.font = "16px system-ui";
       ctx.fillText("A+", player.x + player.width / 2 - 8, player.y - 8);
   }


   // Obstacles
   ctx.fillStyle = "#e53935";
   for (const obs of obstacles) {
       ctx.fillRect(obs.x, obs.y, obs.width, obs.height);
   }


   // Instruction hint
   ctx.fillStyle = "#ffffffaa";
   ctx.font = "14px system-ui";
   if (gameState === "playing") {
       ctx.fillText("Press SPACE to jump. Avoid red obstacles.", 12, 20);
   } else if (gameState === "menu") {
       ctx.fillText("Enter your name and click Start Game to begin.", 12, 20);
   }
}


// ============================
// HELPERS
// ============================
function spawnObstacle() {
   const height = 40 + Math.random() * 30;
   obstacles.push({
       x: canvas.width + 20,
       y: groundY - height,
       width: 24,
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


// ============================
// QUESTION LOGIC
// ============================
function triggerQuestion() {
   // Do not ask questions if game is not actively playing
   if (gameState !== "playing") return;


   gameState = "question";
   lastQuestionTime = performance.now();


   currentQuestion = questionBank[questionIndex % questionBank.length];
   questionIndex++;


   // Show overlay
   questionOverlay.classList.remove("hidden");
   explanationTextEl.textContent = "";
   continueBtn.classList.add("hidden");


   // Fill in question & answers
   questionTextEl.textContent = currentQuestion.question;
   answersContainer.innerHTML = "";
   currentQuestion.options.forEach((opt, idx) => {
       const btn = document.createElement("button");
       btn.className = "answer-btn";
       btn.textContent = opt;
       btn.onclick = () => handleAnswer(idx, btn);
       answersContainer.appendChild(btn);
   });
}


function handleAnswer(selectedIndex, clickedBtn) {
   const isCorrect = selectedIndex === currentQuestion.correct_index;
   const allBtns = answersContainer.querySelectorAll(".answer-btn");
   allBtns.forEach((b) => (b.disabled = true));


   if (isCorrect) {
       clickedBtn.classList.add("correct");
       streak++;
       bestStreak = Math.max(bestStreak, streak);
       streakText.textContent = streak;
       if (streak >= 3) {
           streakFire.classList.remove("hidden");
       }
       score += 50 * (1 + streak * 0.2); // bonus
       scoreText.textContent = Math.floor(score);
       explanationTextEl.textContent = "Nice! " + currentQuestion.explanation;
   } else {
       clickedBtn.classList.add("wrong");
       const correctBtn = allBtns[currentQuestion.correct_index];
       correctBtn.classList.add("correct");
       explanationTextEl.textContent =
           "Not quite. " + currentQuestion.explanation;
       streak = 0;
       streakText.textContent = streak;
       streakFire.classList.add("hidden");
   }


   continueBtn.classList.remove("hidden");
}


continueBtn.addEventListener("click", () => {
   questionOverlay.classList.add("hidden");
   if (gameState !== "gameover") {
       gameState = "playing";
   }
});


// ============================
// GAME OVER
// ============================
function triggerGameOver() {
   // Make sure we don't repeatedly trigger
   if (gameState === "gameover") return;


   gameState = "gameover";


   // Hide any question overlay that might be open
   questionOverlay.classList.add("hidden");


   finalScoreEl.textContent = Math.floor(score);
   finalStreakEl.textContent = bestStreak;
   gameoverNameDisplay.textContent = `Player: ${playerName || "Unknown"}`;
   gameoverOverlay.classList.remove("hidden");
}


// Restart
restartBtn.addEventListener("click", () => {
   gameoverOverlay.classList.add("hidden");
   resetGameState();
   gameState = "playing";
   lastFrameTime = performance.now();
});


// Back to menu
backMenuBtn.addEventListener("click", () => {
   gameoverOverlay.classList.add("hidden");
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


   // Later: use notesInput.value → send to backend → Claude → questionBank.
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
