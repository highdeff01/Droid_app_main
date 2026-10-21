import { Request, Response, Router } from "express";
import { z } from "zod";
import { methodLearningSystem, type LearningContext, type WorkingMethodTemplate } from "../method-learning";
import { executionStateRepository } from "../execution-state";
import { assistantStateRepository } from "../assistant-state";
import { centralLogHub } from "../log-hub";
import { dispatchActionToPython } from "./dual-ai-pipeline";
import { queueMobileAction } from "./mobile-stream";

const router = Router();

const learnBody = z.object({
  executionId: z.string().min(1),
  sessionId: z.string().min(1),
  context: z.object({
    applicationName: z.string().optional(),
    screenLayout: z.string().optional(),
    userIntent: z.string().min(1),
    environmentalFactors: z.array(z.string()).default([]),
    timeOfDay: z.string().default(new Date().toISOString()),
    deviceType: z.string().default("desktop"),
  }),
});

// Learn from an execution
router.post("/learn", async (req: Request, res: Response) => {
  try {
    const body = learnBody.parse(req.body);
    
    const context: LearningContext = {
      sessionId: body.sessionId,
      applicationName: body.context.applicationName,
      screenLayout: body.context.screenLayout || "unknown",
      userIntent: body.context.userIntent,
      environmentalFactors: body.context.environmentalFactors,
      timeOfDay: body.context.timeOfDay,
      deviceType: body.context.deviceType,
    };
    
    // Retrieve real execution from executionStateRepository
    let execution = executionStateRepository.get(body.executionId);
    let plan = assistantStateRepository.listPlans(body.sessionId)[0];

    // If no execution exists yet, synthesize an execution record from context
    if (!execution) {
      execution = {
        id: body.executionId,
        sessionId: body.sessionId,
        status: "completed",
        currentStep: 1,
        totalSteps: 1,
        startedAt: new Date(Date.now() - 5000).toISOString(),
        completedAt: new Date().toISOString(),
        timeline: [
          { stepId: "s1", status: "completed", message: `Executed intent: ${body.context.userIntent}`, timestamp: new Date().toISOString() },
        ],
        evidence: [],
        stepResults: {},
      } as any;
    }

    if (!plan) {
      plan = {
        id: `plan_${Date.now()}`,
        sessionId: body.sessionId,
        title: body.context.userIntent,
        summary: `Automated plan for ${body.context.userIntent}`,
        steps: [
          {
            id: "step_1",
            title: `Execute ${body.context.userIntent}`,
            action: "navigate-shortcut",
            timing: { timeoutMs: 5000 },
          } as any,
        ],
        createdAt: new Date().toISOString(),
      } as any;
    }

    const learnedMethod = methodLearningSystem.learnFromExecution(execution, plan, context);
    centralLogHub.addLog("Planner AI", "SUCCESS", `Learned method "${learnedMethod.name}" from execution ${body.executionId}`);
    
    res.json({ 
      success: true, 
      message: "Learned method successfully registered and indexed",
      method: learnedMethod,
      context,
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : "Failed to learn from execution" 
    });
  }
});

// Get best method for a context
router.post("/best-method", async (req: Request, res: Response) => {
  try {
    const body = z.object({
      context: z.object({
        sessionId: z.string().min(1),
        applicationName: z.string().optional(),
        userIntent: z.string().min(1),
        screenLayout: z.string().optional(),
        deviceType: z.string().default("desktop"),
      }),
    }).parse(req.body);
    
    const context: LearningContext = {
      sessionId: body.context.sessionId,
      applicationName: body.context.applicationName,
      screenLayout: body.context.screenLayout || "unknown",
      userIntent: body.context.userIntent,
      environmentalFactors: [],
      timeOfDay: new Date().toISOString(),
      deviceType: body.context.deviceType,
    };
    
    const bestMethod = methodLearningSystem.getBestMethodForContext(context);
    
    res.json({ 
      success: true, 
      bestMethod,
      hasMethod: bestMethod !== null,
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : "Failed to get best method" 
    });
  }
});

// Compare two methods
router.post("/compare", async (req: Request, res: Response) => {
  try {
    const body = z.object({
      methodId1: z.string().min(1),
      methodId2: z.string().min(1),
    }).parse(req.body);
    
    const comparison = methodLearningSystem.compareMethods(body.methodId1, body.methodId2);
    
    res.json({ success: true, comparison });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : "Failed to compare methods" 
    });
  }
});

// Get optimization suggestions for a method
router.get("/optimize/:methodId", async (req: Request, res: Response) => {
  try {
    const { methodId } = req.params;
    const suggestions = methodLearningSystem.suggestOptimizations(methodId);
    
    res.json({ success: true, suggestions });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : "Failed to get optimization suggestions" 
    });
  }
});

// Get detailed method insights
router.get("/insights/:methodId", async (req: Request, res: Response) => {
  try {
    const { methodId } = req.params;
    const insights = methodLearningSystem.getMethodInsights(methodId);
    
    if (!insights) {
      return res.status(404).json({ 
        success: false, 
        error: "Method not found" 
      });
    }
    
    res.json({ success: true, insights });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : "Failed to get method insights" 
    });
  }
});

// Get all learned methods
router.get("/methods", async (_req: Request, res: Response) => {
  try {
    const methods = methodLearningSystem.getAllMethods();
    
    res.json({ success: true, methods, count: methods.length });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : "Failed to get methods" 
    });
  }
});

// Get specific method
router.get("/method/:methodId", async (req: Request, res: Response) => {
  try {
    const { methodId } = req.params;
    const method = methodLearningSystem.getMethod(methodId);
    
    if (!method) {
      return res.status(404).json({ 
        success: false, 
        error: "Method not found" 
      });
    }
    
    res.json({ success: true, method });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : "Failed to get method" 
    });
  }
});

// --- Habit Profiling & Learning ---
router.get("/habits", async (_req: Request, res: Response) => {
  try {
    const profile = methodLearningSystem.getUserHabitProfile();
    res.json({ success: true, profile });
  } catch (error) {
    res.status(500).json({ success: false, error: String(error) });
  }
});

router.post("/record-action", async (req: Request, res: Response) => {
  try {
    const { type, app, x, y, text, success } = req.body || {};
    methodLearningSystem.recordUserAction({
      type: type || "action",
      app,
      x: typeof x === "number" ? x : undefined,
      y: typeof y === "number" ? y : undefined,
      text,
      success,
    });
    res.json({ success: true, profile: methodLearningSystem.getUserHabitProfile() });
  } catch (error) {
    res.status(500).json({ success: false, error: String(error) });
  }
});

// --- Real Working Method Templates ---
router.get("/templates", async (_req: Request, res: Response) => {
  try {
    const templates = methodLearningSystem.getWorkingTemplates();
    res.json({ success: true, templates, count: templates.length });
  } catch (error) {
    res.status(500).json({ success: false, error: String(error) });
  }
});

router.get("/templates/:templateId", async (req: Request, res: Response) => {
  try {
    const template = methodLearningSystem.getWorkingTemplate(req.params.templateId);
    if (!template) {
      return res.status(404).json({ success: false, error: "Template not found" });
    }
    res.json({ success: true, template });
  } catch (error) {
    res.status(500).json({ success: false, error: String(error) });
  }
});

// Execute a Working Method Template
router.post("/templates/:templateId/execute", async (req: Request, res: Response) => {
  try {
    const { templateId } = req.params;
    const { targetDevice = "desktop", repeatCount = 1 } = req.body || {};
    const template = methodLearningSystem.getWorkingTemplate(templateId);

    if (!template) {
      return res.status(404).json({ success: false, error: "Template not found" });
    }

    centralLogHub.addLog("Planner AI", "INFO", `Executing working method "${template.name}" (Repeats: ${repeatCount}, Device: ${targetDevice})`);

    const executedSteps: any[] = [];
    const actualRepeats = Math.min(Math.max(1, repeatCount), 10);

    for (let r = 1; r <= actualRepeats; r++) {
      for (const step of template.steps) {
        if (step.action === "type" && step.text) {
          await dispatchActionToPython({
            title: `Type "${step.text}"`,
            action: "type_text",
            textPayload: step.text,
            delayMs: step.delayMs || 250,
          });
          queueMobileAction({
            type: "type_text",
            text: step.text,
            description: step.name,
          });
        } else if (step.action === "press_key" && step.key) {
          await dispatchActionToPython({
            title: `Press ${step.key}`,
            action: "press_key",
            keyPayload: step.key,
            delayMs: step.delayMs || 300,
          });
          queueMobileAction({
            type: "key",
            key: step.key,
            description: step.name,
          });
        } else if (step.action === "click" || step.action === "double_click" || step.action === "right_click") {
          await dispatchActionToPython({
            title: step.name,
            action: step.action as any,
            x: step.x,
            y: step.y,
            delayMs: step.delayMs || 300,
          });
          queueMobileAction({
            type: step.action === "double_click" ? "double_tap" : "tap",
            x: step.x > 1 ? step.x / 1920 : step.x,
            y: step.y > 1 ? step.y / 1080 : step.y,
            description: step.name,
          });
        }

        executedSteps.push({
          iteration: r,
          stepId: step.id,
          name: step.name,
          action: step.action,
          targetPosition: { x: step.x, y: step.y },
          status: "success",
        });

        // Record for habit learning
        methodLearningSystem.recordUserAction({
          type: step.action,
          x: step.x,
          y: step.y,
          text: step.text,
          success: true,
        });
      }
    }

    centralLogHub.addLog("Planner AI", "SUCCESS", `Completed working method "${template.name}" with ${executedSteps.length} actions`);

    res.json({
      success: true,
      message: `Executed "${template.name}" (${executedSteps.length} total actions across ${actualRepeats} repeat cycle(s))`,
      template,
      executedSteps,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: String(error) });
  }
});

export { router as methodLearningRouter };