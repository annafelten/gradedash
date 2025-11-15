// server.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import Anthropic from "@anthropic-ai/sdk";
import multer from "multer";
import { createRequire } from "module";

dotenv.config();

const require = createRequire(import.meta.url);
const pdf = require("pdf-parse"); // <- FIX: use require for pdf-parse

const app = express();
const PORT = process.env.PORT || 3000;

// Multer for in-memory PDF uploads
const upload = multer({ storage: multer.memoryStorage() });

if (!process.env.ANTHROPIC_API_KEY) {
    console.error("Missing ANTHROPIC_API_KEY in .env");
    process.exit(1);
}

const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY
});

app.use(cors());
app.use(express.json());

// --------------------------
// In-memory demo study sets
// --------------------------
const STUDY_SETS = [
    {
        id: "demo-math",
        title: "Linear Algebra Basics",
        meta: "15 questions · created by Anna",
        questions: [
            {
                question: "What is 3 × 4?",
                options: ["7", "9", "12", "24"],
                correct_index: 2,
                explanation: "3 × 4 = 12."
            },
            {
                question:
                    "If A is a 2×2 matrix with eigenvalues 2 and 5, what is det(A)?",
                options: ["-7", "0", "7", "10"],
                correct_index: 3,
                explanation:
                    "The determinant is the product of eigenvalues: 2·5 = 10."
            },
            {
                question:
                    "If v is an eigenvector of A with eigenvalue λ, what is A v?",
                options: ["0", "λ v", "v + λ", "A + v"],
                correct_index: 1,
                explanation: "By definition, A v = λ v."
            }
        ]
    },
    {
        id: "demo-bio",
        title: "Cell Biology: Mitosis & Meiosis",
        meta: "10 questions · created by Student",
        questions: [
            {
                question:
                    "During which phase of mitosis do sister chromatids separate?",
                options: ["Prophase", "Metaphase", "Anaphase", "Telophase"],
                correct_index: 2,
                explanation: "Sister chromatids split during anaphase."
            }
        ]
    }
];

// -------------------------------------------
// Helper: normalize Claude's JSON output
// -------------------------------------------
function normalizeQuestions(raw) {
    if (!Array.isArray(raw)) return [];
    return raw
        .map((q) => ({
            question: String(q.question || "").trim(),
            options: Array.isArray(q.options) ? q.options.slice(0, 4) : [],
            correct_index:
                typeof q.correct_index === "number" ? q.correct_index : 0,
            explanation: String(q.explanation || "").trim()
        }))
        .filter(
            (q) =>
                q.question &&
                q.options.length >= 2 &&
                q.correct_index >= 0 &&
                q.correct_index < q.options.length
        );
}

// -------------------------------------------
// Helper: ask Claude to generate questions from text
// -------------------------------------------
async function generateQuestionsFromText(notes, instructions, numQuestions) {
    const n =
        typeof numQuestions === "number" && numQuestions > 0
            ? Math.min(numQuestions, 40)
            : 12;

    const baseInstruction = `
You are helping a student create a study game.

You are given some raw notes/syllabus text. 
You must generate exactly ${n} multiple-choice questions.

FORMAT (IMPORTANT):
Return ONLY valid JSON. 
No prose, no markdown, no backticks.
JSON structure:
[
  {
    "question": "string",
    "options": ["A", "B", "C", "D"],
    "correct_index": 0,
    "explanation": "string"
  },
  ...
]

Rules:
- Each question MUST have 4 answer options.
- Exactly one option is correct.
- "correct_index" is the 0-based index of the correct option.
- Explanations should be 1–3 sentences.
`;

    const styleInstruction =
        instructions && instructions.trim().length > 0
            ? `USER PREFERENCES:\n${instructions}\n\n`
            : "";

    const userPrompt = `
NOTES / SYLLABUS TEXT:
----------------------
${notes}

${styleInstruction}
TASK:
Using only the information and concepts suggested by the text above (plus basic prerequisite knowledge), generate ${n} questions in the JSON format described earlier. Remember: output JSON only.
`;

    const message = await anthropic.messages.create({
        model: "claude-3-haiku-20240307",
        max_tokens: 2000,
        temperature: 0.7,
        messages: [
            {
                role: "user",
                content: baseInstruction + "\n\n" + userPrompt
            }
        ]
    });

    const text =
        message.content
            .map((c) => ("text" in c ? c.text : ""))
            .join("")
            .trim() || "";

    let parsed;
    try {
        parsed = JSON.parse(text);
    } catch (err) {
        console.error("Failed to parse Claude JSON:", err);
        console.error("Raw content:", text);
        throw new Error("Claude did not return valid JSON.");
    }

    const questions = normalizeQuestions(parsed);
    if (questions.length === 0) {
        throw new Error("No usable questions generated.");
    }

    return questions;
}

// -------------------------------------------
// GET /api/sets?query=...  (search sets)
// -------------------------------------------
app.get("/api/sets", (req, res) => {
    const q = (req.query.query || "").toString().toLowerCase();
    let result = STUDY_SETS;

    if (q) {
        result = STUDY_SETS.filter(
            (s) =>
                s.title.toLowerCase().includes(q) ||
                (s.meta && s.meta.toLowerCase().includes(q))
        );
    }

    res.json(
        result.map((s) => ({
            id: s.id,
            title: s.title,
            meta: s.meta,
            questionCount: s.questions.length
        }))
    );
});

// -------------------------------------------
// GET /api/sets/:id  (load one set)
// -------------------------------------------
app.get("/api/sets/:id", (req, res) => {
    const set = STUDY_SETS.find((s) => s.id === req.params.id);
    if (!set) {
        return res.status(404).json({ error: "Set not found" });
    }
    res.json(set);
});

// -------------------------------------------
// POST /api/generate-questions
// body: { notes, instructions?, numQuestions? }
// -------------------------------------------
app.post("/api/generate-questions", async (req, res) => {
    try {
        const { notes, instructions, numQuestions } = req.body;

        if (!notes || typeof notes !== "string") {
            return res.status(400).json({ error: "Missing 'notes' text." });
        }

        const questions = await generateQuestionsFromText(
            notes,
            instructions,
            numQuestions
        );

        res.json(questions);
    } catch (err) {
        console.error("Error in /api/generate-questions:", err);
        res.status(500).json({ error: err.message || "Internal server error." });
    }
});

// -------------------------------------------
// POST /api/generate-from-pdf
// multipart/form-data: pdf (file), instructions?, numQuestions?
// -------------------------------------------
app.post(
    "/api/generate-from-pdf",
    upload.single("pdf"),
    async (req, res) => {
        try {
            if (!req.file) {
                return res.status(400).json({ error: "No PDF file uploaded." });
            }

            const { instructions, numQuestions } = req.body;

            // Extract text from PDF
            const pdfData = await pdf(req.file.buffer);
            let text = pdfData.text || "";

            // Optional: trim very long PDFs to keep Claude happy
            const MAX_CHARS = 12000;
            if (text.length > MAX_CHARS) {
                text =
                    text.slice(0, MAX_CHARS) +
                    "\n\n[Truncated for question generation]";
            }

            if (!text.trim()) {
                return res
                    .status(400)
                    .json({ error: "Could not extract text from PDF." });
            }

            const questions = await generateQuestionsFromText(
                text,
                instructions,
                numQuestions ? Number(numQuestions) : undefined
            );

            res.json(questions);
        } catch (err) {
            console.error("Error in /api/generate-from-pdf:", err);
            res
                .status(500)
                .json({ error: err.message || "Internal server error." });
        }
    }
);

app.listen(PORT, () => {
    console.log(`GradeDash backend listening on http://localhost:${PORT}`);
});