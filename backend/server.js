// server.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import Anthropic from "@anthropic-ai/sdk";
import multer from "multer";
import { createRequire } from "module";

dotenv.config();

const require = createRequire(import.meta.url);

// ------------------------------
// PDF PARSING SETUP (pdf-parse)
// ------------------------------
let pdfParse = null;
try {
    const mod = require("pdf-parse");
    // After installing pdf-parse@1.1.1 this will be a function
    pdfParse = typeof mod === "function" ? mod : mod.default;
    if (typeof pdfParse === "function") {
        console.log("[pdf-parse] OK, typeof pdfParse =", typeof pdfParse);
    } else {
        console.warn(
            "[pdf-parse] did not export a function; got",
            typeof mod,
            "PDF text extraction disabled."
        );
        pdfParse = null;
    }
} catch (err) {
    console.error("[pdf-parse] failed to load:", err);
    pdfParse = null;
}

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
                explanation: "The determinant is the product of eigenvalues: 2·5 = 10."
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
                question: "During which phase of mitosis do sister chromatids separate?",
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
// Helper: parse plain-text Q/A format from Claude
// -------------------------------------------
function parseClaudeTextQuestions(rawText, expectedCount) {
    const blocks = rawText
        .split(/\n(?=Q\d+\s*:\s*)/i) // split on lines that start with Q1:, Q2:, etc.
        .map((b) => b.trim())
        .filter(Boolean);

    const questions = [];

    for (const block of blocks) {
        if (questions.length >= expectedCount) break;

        // Question line: Q1: ...
        const qMatch = block.match(/^Q\d+\s*:\s*(.+)$/im);
        if (!qMatch) continue;
        const question = qMatch[1].trim();

        // Options A) ... B) ... C) ... D) ...
        const optionMatches = [...block.matchAll(/^[A-D]\)\s*(.+)$/gim)];
        if (optionMatches.length < 4) continue;

        const options = optionMatches
            .slice(0, 4)
            .map((m) => m[1].trim());

        // Answer: A/B/C/D
        const ansMatch = block.match(/^Answer\s*:\s*([ABCD])/im);
        if (!ansMatch) continue;
        const letter = ansMatch[1].toUpperCase();
        const correct_index = { A: 0, B: 1, C: 2, D: 3 }[letter];

        // Explanation: [rest of block after "Explanation:"]
        let explanation = "";
        const expMatch = block.match(/^Explanation\s*:\s*([\s\S]+)$/im);
        if (expMatch) {
            explanation = expMatch[1].trim();
        }

        questions.push({
            question,
            options,
            correct_index,
            explanation
        });
    }

    return questions;
}

// --------------------------------------------------
// Helper: ask Claude to generate questions from text
// --------------------------------------------------
// --------------------------------------------------
// Helper: ask Claude to generate questions from text
// (Plain-text format, then parsed into JSON)
// --------------------------------------------------
async function generateQuestionsFromText(notes, instructions, numQuestions) {
    const n =
        typeof numQuestions === "number" && numQuestions > 0
            ? Math.min(numQuestions, 40)
            : 12;

    const systemPrompt = `
You are helping a student create a study game.

You will be given raw notes / textbook / exam-style material.
Your job is to generate EXACTLY ${n} multiple-choice questions about the SUBJECT CONTENT.

You are helping a student create a study game.

You will be given raw notes / textbook / exam-style material.
Your job is to generate EXACTLY ${n} multiple-choice questions about the SUBJECT CONTENT.

IMPORTANT STYLE RULES FOR ANSWERS:
- Each question has exactly 4 options: A, B, C, D.
- Each option must be a SHORT phrase, not a long sentence.
  * Ideally 1–6 words.
  * No full sentences.
  * No long clauses, no multiple commas.
- The question stem can be a full sentence, but options must be super short and scannable.


Output rules (VERY IMPORTANT):
- Do NOT output JSON or markdown.
- Use ONLY this plain-text format:

Q1: <question text>
A) <option A>
B) <option B>
C) <option C>
D) <option D>
Answer: <A/B/C/D>
Explanation: <1–3 sentences>

Q2: <question text>
A) <option A>
B) <option B>
C) <option C>
D) <option D>
Answer: <A/B/C/D>
Explanation: <1–3 sentences>

... and so on until Q${n}.

- Use exactly four options A–D for each question.
- The "Answer:" line must contain only a single letter A, B, C, or D.
- The Explanation should explain WHY the correct answer is correct, based on the notes.
- IMPORTANT: Ask about the actual subject matter (history, linear algebra, biology, etc.), NOT about JSON, instructions, or file metadata.
`;

    const styleInstruction =
        instructions && instructions.trim().length > 0
            ? `User preferences for question style:\n${instructions}\n\n`
            : "";

    const userPrompt = `
Here are the student's notes / PDF text:

---------------------- START OF NOTES ----------------------
${notes}
---------------------- END OF NOTES ------------------------

${styleInstruction}
Task:
Using ONLY the concepts and content from the notes above and basic prerequisite knowledge,
generate ${n} good multiple-choice questions in the exact plain-text format described in the system instructions.
Remember: no JSON, no markdown, no numbering style other than Q1:, Q2:, etc.
`;

    const message = await anthropic.messages.create({
        model: "claude-3-haiku-20240307",
        max_tokens: 2000,
        temperature: 0.3,
        system: systemPrompt,
        messages: [
            {
                role: "user",
                content: userPrompt
            }
        ]
    });

    const raw = message.content
        .map((c) => ("text" in c ? c.text : ""))
        .join("")
        .trim();

    // Parse our custom text format into normalized question objects
    const parsed = parseClaudeTextQuestions(raw, n);
    const questions = normalizeQuestions(parsed);

    if (!questions.length) {
        console.error("No usable questions parsed from Claude output.");
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
        res
            .status(500)
            .json({ error: err.message || "Internal server error." });
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

            console.log(
                `Received PDF: ${req.file.originalname}, size = ${req.file.size} bytes`
            );

            if (!pdfParse) {
                console.error(
                    "[/api/generate-from-pdf] pdf-parse not available; cannot extract text."
                );
                return res.status(500).json({
                    error:
                        "PDF text extraction is not available. Make sure pdf-parse@1.1.1 is installed."
                });
            }

            const { instructions, numQuestions } = req.body;

            // Extract text from PDF
            const pdfData = await pdfParse(req.file.buffer);
            let text = pdfData.text || "";
            console.log(
                "[/api/generate-from-pdf] extracted text length =",
                text.length
            );

            const MAX_CHARS = 12000;
            if (text.length > MAX_CHARS) {
                text =
                    text.slice(0, MAX_CHARS) +
                    "\n\n[Truncated for question generation]";
            }

            if (!text.trim()) {
                console.error(
                    "[/api/generate-from-pdf] No text extracted from PDF."
                );
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