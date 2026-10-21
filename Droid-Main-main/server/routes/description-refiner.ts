import { Request, Response } from "express";
import { GoogleGenAI } from "@google/genai";

let genAiClient: GoogleGenAI | null = null;

function getGenAiClient(): GoogleGenAI | null {
  if (!process.env.GEMINI_API_KEY) {
    return null;
  }
  if (!genAiClient) {
    genAiClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return genAiClient;
}

export function countWords(text: string): number {
  if (!text) return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function ensureUnderWordLimit(text: string, limit: number = 20): { text: string; wordCount: number } {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length <= limit) {
    return { text: text.trim(), wordCount: words.length };
  }
  const truncated = words.slice(0, limit).join(" ");
  // Ensure clean trailing punctuation
  const cleaned = truncated.replace(/[,;:\-\s]+$/, "") + ".";
  return { text: cleaned, wordCount: countWords(cleaned) };
}

export interface RefinedResult {
  refinedDescription: string;
  wordCount: number;
  charCount: number;
  targetWordLimit: number;
  constraintMode: string;
  keyPropositions: string[];
  rationale: string;
  variations: Array<{ text: string; wordCount: number; charCount: number; style: string }>;
  originalWordCount: number;
  originalCharCount: number;
  source: "gemini" | "heuristic-engine";
}

/**
 * Heuristic NLP fallback to refine rough descriptions when Gemini API is offline or key is absent.
 */
export function heuristicRefineDescription(
  rawText: string,
  targetLimit: number = 20,
  tone: string = "high-impact",
  constraintMode: string = "twitter_brevity"
): RefinedResult {
  const cleanRaw = rawText.trim();
  const originalWordCount = countWords(cleanRaw);
  const originalCharCount = cleanRaw.length;

  // Common fluff prefixes to strip
  const fluffPatterns = [
    /^this is (an? )?(comprehensive |all-in-one |powerful |modern |simple |intuitive )?(app|application|platform|tool|system|service|project) (designed to|built to|aimed at|created for|used to|that helps to|that allows users to|which allows users to)/i,
    /^(this (app|application|platform|tool|system|service|project) is (designed to|built to|aimed at|created for|used to))/i,
    /^(an? (all-in-one|comprehensive|complete|intuitive|powerful|modern|simple) (app|platform|tool|solution) (that|which|to))/i,
    /^(we have created|we are building|our app is|this is basically|a tool that allows (users|teams) to)/i,
    /^(allows (users|teams|people) to)/i,
    /^(helps (users|teams|people) (to )?)/i,
    /^(designed to help (users|teams|people) (to )?)/i,
  ];

  let stripped = cleanRaw;
  for (const pattern of fluffPatterns) {
    stripped = stripped.replace(pattern, "").trim();
  }
  // Capitalize first character
  if (stripped.length > 0) {
    stripped = stripped.charAt(0).toUpperCase() + stripped.slice(1);
  }

  // Value proposition extraction
  const lower = cleanRaw.toLowerCase();
  const props: string[] = [];

  if (lower.includes("vision") || lower.includes("perception") || lower.includes("detect") || lower.includes("camera") || lower.includes("screen")) {
    props.push("Computer Vision & Screen Perception");
  }
  if (lower.includes("automat") || lower.includes("bot") || lower.includes("agent") || lower.includes("workflow") || lower.includes("orchestrat")) {
    props.push("Autonomous Task Automation");
  }
  if (lower.includes("game") || lower.includes("player") || lower.includes("hud") || lower.includes("movement")) {
    props.push("Adaptive Game & Input Controls");
  }
  if (lower.includes("ai") || lower.includes("model") || lower.includes("reasoning") || lower.includes("gemini")) {
    props.push("Intelligent Multi-Modal Reasoning");
  }
  if (lower.includes("track") || lower.includes("monitor") || lower.includes("log") || lower.includes("analytics")) {
    props.push("Real-Time Tracking & Telemetry");
  }
  if (props.length === 0) {
    props.push("Core Workflow Optimization", "Streamlined Task Execution");
  }

  // Build variations
  let baseSentence = stripped;
  const sentenceEndMatch = baseSentence.match(/^([^.!?]+[.!?])/);
  if (sentenceEndMatch && countWords(sentenceEndMatch[1]) <= targetLimit && countWords(sentenceEndMatch[1]) >= 4) {
    baseSentence = sentenceEndMatch[1].trim();
  }

  const bounded = ensureUnderWordLimit(baseSentence, targetLimit);

  // Variation 1: Direct Action-oriented
  const actionVariationText = ensureUnderWordLimit(
    `${props[0] || "Automates workflows"} with ${props[1] || "intelligent controls"} and precision execution.`,
    targetLimit
  );

  // Variation 2: Outcome-oriented
  const outcomeVariationText = ensureUnderWordLimit(
    `High-performance platform delivering ${props.slice(0, 2).join(" and ")} in unified real-time workflows.`,
    targetLimit
  );

  return {
    refinedDescription: bounded.text,
    wordCount: bounded.wordCount,
    charCount: bounded.text.length,
    targetWordLimit: targetLimit,
    constraintMode,
    keyPropositions: props.slice(0, 3),
    rationale: `Applied '${constraintMode}' constraint: distilled core action verbs and value propositions strictly under ${targetLimit} words (${bounded.text.length} characters).`,
    variations: [
      { text: actionVariationText.text, wordCount: actionVariationText.wordCount, charCount: actionVariationText.text.length, style: "Action-Driven" },
      { text: outcomeVariationText.text, wordCount: outcomeVariationText.wordCount, charCount: outcomeVariationText.text.length, style: "Outcome-Focused" },
    ],
    originalWordCount,
    originalCharCount,
    source: "heuristic-engine",
  };
}

export async function handleRefineDescription(req: Request, res: Response) {
  try {
    const { description, targetWords = 20, tone = "high-impact", constraintMode = "twitter_brevity" } = req.body;

    if (!description || typeof description !== "string" || !description.trim()) {
      return res.status(400).json({
        success: false,
        error: "A valid 'description' string is required.",
      });
    }

    const rawText = description.trim();
    // Support custom word constraints from 4 up to 80 words (e.g. 12 for Twitter, 30 for App Store)
    const wordLimit = Math.min(Math.max(Number(targetWords) || 20, 4), 80);
    const originalWordCount = countWords(rawText);
    const originalCharCount = rawText.length;

    const client = getGenAiClient();

    let constraintDescription = `STRICTLY UNDER ${wordLimit} WORDS`;
    if (constraintMode === "twitter_brevity" || wordLimit <= 12) {
      constraintDescription = `STRICTLY UNDER ${wordLimit} WORDS (Twitter/X-style extreme brevity, punchy and shareable, ideally under 100 characters)`;
    } else if (constraintMode === "app_store_short" || (wordLimit >= 25 && wordLimit <= 35)) {
      constraintDescription = `STRICTLY UNDER ${wordLimit} WORDS (App Store / Google Play short promo description, high clarity on user benefits and app functionality, fitting under 170-250 characters)`;
    } else if (constraintMode === "tagline" || wordLimit <= 8) {
      constraintDescription = `STRICTLY UNDER ${wordLimit} WORDS (Hero Tagline & Subtitle, ultra-concise hook)`;
    }

    if (client) {
      try {
        const prompt = `You are an elite product copywriter, App Store copy strategist, and social media copy editor.
Rewrite the following rough app description into a punchy, crystal-clear description that is ${constraintDescription}.
It MUST maintain the application's core value propositions, target audience, and primary functionality without marketing fluff.

Rough app description:
"${rawText}"

Tone: ${tone}
Constraint Mode: ${constraintMode}
Max Word Limit: ${wordLimit}

Strict constraints:
1. Output MUST be strictly under ${wordLimit} words. NEVER exceed ${wordLimit} words.
2. Maintain core value propositions accurately.
3. Eliminate fillers like "this app allows you to" or "a tool that helps".

Respond ONLY with a valid JSON object matching this exact TypeScript structure:
{
  "refinedDescription": "string (strictly <= ${wordLimit} words)",
  "keyPropositions": ["string", "string"],
  "rationale": "string (brief note on how constraint and value were balanced)",
  "variations": [
    { "text": "string (strictly <= ${wordLimit} words)", "style": "Action-Driven" },
    { "text": "string (strictly <= ${wordLimit} words)", "style": "Minimalist" }
  ]
}`;

        const response = await client.models.generateContent({
          model: "gemini-2.5-flash",
          contents: prompt,
          config: {
            responseMimeType: "application/json",
            temperature: 0.3,
          },
        });

        const responseText = response.text?.trim();
        if (responseText) {
          const parsed = JSON.parse(responseText);
          const safeRefined = ensureUnderWordLimit(parsed.refinedDescription || rawText, wordLimit);
          const safeVariations = (Array.isArray(parsed.variations) ? parsed.variations : []).map((v: any) => {
            const safe = ensureUnderWordLimit(v.text || "", wordLimit);
            return {
              text: safe.text,
              wordCount: safe.wordCount,
              charCount: safe.text.length,
              style: v.style || "Alternative",
            };
          });

          return res.json({
            success: true,
            refinedDescription: safeRefined.text,
            wordCount: safeRefined.wordCount,
            charCount: safeRefined.text.length,
            targetWordLimit: wordLimit,
            constraintMode,
            keyPropositions: Array.isArray(parsed.keyPropositions) ? parsed.keyPropositions : ["Core Automation", "Vision Hub"],
            rationale: parsed.rationale || `Refined to ${safeRefined.wordCount} words (${safeRefined.text.length} chars) matching the ${constraintMode} constraint.`,
            variations: safeVariations,
            originalWordCount,
            originalCharCount,
            source: "gemini",
          });
        }
      } catch (geminiError) {
        console.warn("[Description Refiner] Gemini API error, falling back to heuristic engine:", geminiError);
      }
    }

    // Heuristic fallback
    const result = heuristicRefineDescription(rawText, wordLimit, tone, constraintMode);
    return res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error("[Description Refiner] Error refining description:", error);
    return res.status(500).json({
      success: false,
      error: "Internal server error refining description",
      details: String(error),
    });
  }
}

export function handleGetSamplePresets(_req: Request, res: Response) {
  res.json({
    success: true,
    presets: [
      {
        title: "Current App: DroidVision & Master Orchestrator",
        rough: "Unified AI Automation Master Platform — Autonomous Automation & Vision Control Hub with Master Workflow Orchestrator for real-time game perception and screen controls.",
      },
      {
        title: "Cloud Infrastructure Monitor",
        rough: "This is a comprehensive devops dashboard that helps engineers monitor their cloud clusters, detect anomalous resource spikes across Kubernetes pods, and automatically trigger safe auto-scaling policies.",
      },
      {
        title: "Collaborative Whiteboard",
        rough: "An all-in-one infinite canvas tool where distributed remote product designers and software engineers can brainstorm system architectures, draw wireframes together in real time, and export production assets.",
      },
      {
        title: "AI Personal Finance Assistant",
        rough: "Basically an app designed to track all your daily credit card spending and bank accounts, categorize transactions using artificial intelligence, and send helpful alerts when you are close to exceeding your monthly budget.",
      },
      {
        title: "Autonomous Game Vision Agent",
        rough: "A deep learning neural perception engine that captures desktop video frames, analyzes minimap and player coordinates, and computes safe cubic-spline mouse movements to automate repetitive gaming tasks.",
      },
    ],
  });
}

export interface BulkItemResult {
  id: string;
  keyword: string;
  name: string;
  description: string;
  wordCount: number;
  charCount: number;
  keyPropositions: string[];
  constraintMode: string;
  targetWords: number;
  badge?: string;
  category?: string;
}

export async function handleBulkGenerateNamesDescriptions(req: Request, res: Response) {
  try {
    const {
      keywords,
      rawInput = "",
      targetWords = 18,
      constraintMode = "twitter_brevity",
      tone = "high-impact",
      namingStyle = "modern-saas",
    } = req.body;

    // Parse input keywords (from array or comma/newline delimited text)
    let keywordList: string[] = [];
    if (Array.isArray(keywords) && keywords.length > 0) {
      keywordList = keywords.map((k) => String(k).trim()).filter(Boolean);
    } else if (typeof rawInput === "string" && rawInput.trim()) {
      keywordList = rawInput
        .split(/[\n,;]+/)
        .map((k) => k.trim().replace(/^[-*•0-9.)\s]+/, "").trim())
        .filter(Boolean);
    }

    if (keywordList.length === 0) {
      keywordList = [
        "AI Game Vision Bot",
        "Cloud Observability Hub",
        "Multiplayer Canvas",
        "Autonomous Mouse Orchestrator",
        "Crypto Portfolio Tracker",
      ];
    }

    // Limit to max 25 keywords per batch for performance
    const activeKeywords = keywordList.slice(0, 25);
    const wordLimit = Math.min(Math.max(Number(targetWords) || 18, 4), 80);

    const client = getGenAiClient();
    if (client) {
      try {
        const prompt = `You are a world-class product strategist, creative naming director, and App Store copywriter.
Generate high-converting, professional Product Name and Description pairs for each of the following ${activeKeywords.length} topics/keywords:

${activeKeywords.map((k, idx) => `${idx + 1}. "${k}"`).join("\n")}

CONSTRAINTS:
- Constraint Mode: ${constraintMode}
- Strict Word Limit: Every description MUST BE STRICTLY <= ${wordLimit} WORDS. Never exceed ${wordLimit} words.
- Tone: ${tone}
- Naming Style: ${namingStyle} (e.g. punchy, memorable, 1-3 words, no generic clichés)
- Each item MUST include:
  1. "keyword": matching input
  2. "name": distinctive, brandable product name
  3. "description": ultra-clear, punchy summary strictly under ${wordLimit} words
  4. "keyPropositions": array of 2 short core value hooks (e.g. ["Sub-10ms Latency", "Neural Vision"])
  5. "category": short category tag (e.g. "DevOps", "Gaming AI", "FinTech", "Creative")

Respond ONLY with a valid JSON array of objects matching this exact structure:
[
  {
    "keyword": "AI Game Vision Bot",
    "name": "DroidVision",
    "description": "Autonomous game vision control hub with precision pyautogui mouse execution.",
    "keyPropositions": ["Screen Perception", "Zero-Lag Control"],
    "category": "Gaming AI"
  }
]`;

        const aiResponse = await client.models.generateContent({
          model: "gemini-2.5-flash",
          contents: prompt,
          config: {
            responseMimeType: "application/json",
            temperature: 0.4,
          },
        });

        const text = aiResponse.text?.trim();
        if (text) {
          const parsed = JSON.parse(text);
          if (Array.isArray(parsed) && parsed.length > 0) {
            const results: BulkItemResult[] = parsed.map((item: any, idx: number) => {
              const bounded = ensureUnderWordLimit(item.description || item.keyword, wordLimit);
              return {
                id: `bulk_${Date.now()}_${idx}`,
                keyword: item.keyword || activeKeywords[idx] || `Item #${idx + 1}`,
                name: item.name || `Smart ${activeKeywords[idx]}`,
                description: bounded.text,
                wordCount: bounded.wordCount,
                charCount: bounded.text.length,
                keyPropositions: Array.isArray(item.keyPropositions) ? item.keyPropositions : ["Core Automation", "Fast Integration"],
                constraintMode,
                targetWords: wordLimit,
                category: item.category || "General Utility",
              };
            });

            return res.json({
              success: true,
              total: results.length,
              source: "gemini-2.5-flash",
              constraintMode,
              targetWords: wordLimit,
              items: results,
            });
          }
        }
      } catch (geminiError) {
        console.warn("[Bulk Generator] Gemini API error, falling back to heuristic engine:", geminiError);
      }
    }

    // Heuristic Bulk Generation Fallback
    const heuristicResults: BulkItemResult[] = activeKeywords.map((keyword, idx) => {
      const cleanKey = keyword.trim();
      // Generate clean name
      const nameParts = cleanKey.split(/\s+/);
      let brandName = cleanKey;
      if (nameParts.length === 1) {
        brandName = `${cleanKey.charAt(0).toUpperCase() + cleanKey.slice(1)}Flow`;
      } else if (nameParts.length <= 3) {
        brandName = nameParts.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join("");
      } else {
        brandName = nameParts.slice(0, 2).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join("") + " Studio";
      }

      const refined = heuristicRefineDescription(
        `A high-performance ${cleanKey} system designed to streamline real-time operations, automate repetitive tasks, and boost team productivity.`,
        wordLimit,
        tone,
        constraintMode
      );

      return {
        id: `bulk_h_${Date.now()}_${idx}`,
        keyword: cleanKey,
        name: brandName,
        description: refined.refinedDescription,
        wordCount: refined.wordCount,
        charCount: refined.charCount,
        keyPropositions: refined.keyPropositions,
        constraintMode,
        targetWords: wordLimit,
        category: "Product Suite",
      };
    });

    return res.json({
      success: true,
      total: heuristicResults.length,
      source: "heuristic-engine",
      constraintMode,
      targetWords: wordLimit,
      items: heuristicResults,
    });
  } catch (error) {
    console.error("[Bulk Generator] Error:", error);
    return res.status(500).json({
      success: false,
      error: "Internal server error generating bulk items",
      details: String(error),
    });
  }
}

export async function handleGenerateFileSummary(req: Request, res: Response) {
  try {
    const { fileName, mimeType, size } = req.body;
    if (!fileName && !mimeType) {
      return res.status(400).json({ success: false, error: "fileName or mimeType is required" });
    }

    const safeName = String(fileName || "Unnamed file").trim();
    const safeMime = String(mimeType || "application/octet-stream").trim();

    const client = getGenAiClient();
    if (client) {
      try {
        const prompt = `You are a concise file summary generator.
Write a 1-sentence summary of what this file is or contains based on its file name and type.

File Name: "${safeName}"
MIME Type: "${safeMime}"
${size ? `File Size: ${size} bytes` : ""}

STRICT CONSTRAINTS:
1. Output MUST be exactly 1 sentence.
2. Output MUST be strictly UNDER 10 words (maximum 9 words total).
3. Do NOT include phrases like "This file is" or quotes.
4. Output ONLY the plain text sentence.`;

        const response = await client.models.generateContent({
          model: "gemini-2.5-flash",
          contents: prompt,
          config: {
            temperature: 0.2,
          },
        });

        const rawText = response.text?.trim()?.replace(/^["']|["']$/g, "") || "";
        if (rawText) {
          const bounded = ensureUnderWordLimit(rawText, 9);
          return res.json({
            success: true,
            summary: bounded.text,
            wordCount: bounded.wordCount,
            source: "gemini",
          });
        }
      } catch (geminiError) {
        console.warn("[File Summary] Gemini error, falling back to heuristic:", geminiError);
      }
    }

    // Heuristic fallback
    let fallbackText = "Document file containing workspace data.";
    const lowerName = safeName.toLowerCase();
    const ext = lowerName.split(".").pop() || "";

    if (safeMime.includes("image") || ["jpg", "jpeg", "png", "webp", "gif", "svg"].includes(ext)) {
      fallbackText = `Visual image asset for workspace design.`;
    } else if (safeMime.includes("pdf") || ext === "pdf") {
      fallbackText = `Portable PDF document with formatted records.`;
    } else if (safeMime.includes("video") || ["mp4", "webm", "mov", "mkv"].includes(ext)) {
      fallbackText = `Video recording of captured workflow events.`;
    } else if (safeMime.includes("audio") || ["mp3", "wav", "m4a", "ogg"].includes(ext)) {
      fallbackText = `Audio recording containing voice or media tracks.`;
    } else if (safeMime.includes("sheet") || safeMime.includes("csv") || ["csv", "xlsx", "xls"].includes(ext)) {
      fallbackText = `Tabular data spreadsheet with structured metrics.`;
    } else if (safeMime.includes("presentation") || ["pptx", "ppt", "key"].includes(ext)) {
      fallbackText = `Presentation slide deck for team reviews.`;
    } else if (safeMime.includes("json") || ["json", "yaml", "yml", "xml"].includes(ext)) {
      fallbackText = `Structured configuration data file for applications.`;
    } else if (safeMime.includes("zip") || ["zip", "tar", "gz", "7z"].includes(ext)) {
      fallbackText = `Compressed archive containing bundled project resources.`;
    } else if (safeMime.includes("text") || ["txt", "md", "log"].includes(ext)) {
      fallbackText = `Plain text notes and documentation log.`;
    } else if (["ts", "tsx", "js", "jsx", "py", "rs", "go", "java"].includes(ext)) {
      fallbackText = `Source code file containing program logic.`;
    } else if (safeMime.includes("folder")) {
      fallbackText = `Directory folder organizing related workspace files.`;
    } else {
      fallbackText = `Workspace file with ${safeName.split(".").slice(0, -1).join(" ") || safeName} records.`;
    }

    const bounded = ensureUnderWordLimit(fallbackText, 9);
    return res.json({
      success: true,
      summary: bounded.text,
      wordCount: bounded.wordCount,
      source: "heuristic-engine",
    });
  } catch (error) {
    console.error("[File Summary] Error:", error);
    return res.status(500).json({
      success: false,
      error: "Internal server error generating file summary",
      details: String(error),
    });
  }
}

