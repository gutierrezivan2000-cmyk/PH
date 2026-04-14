import { generateWithAssistant } from "@/lib/ai-client";
import { STRATEGOS_SYSTEM_PROMPT, buildStrategosPrompt } from "@/lib/ai/strategos";
import { GRAMMATEUS_SYSTEM_PROMPT, buildGrammatusPrompt } from "@/lib/ai/grammateus";
import { recordUsage } from "@/lib/usage";
import { db } from "@/lib/db";

// Cost estimates per 1K tokens (Claude Sonnet 4)
const COST_PER_1K_INPUT = 0.003;
const COST_PER_1K_OUTPUT = 0.015;

function estimateCost(tokens: number): number {
  // Rough estimate: assume 40% input, 60% output
  const inputTokens = tokens * 0.4;
  const outputTokens = tokens * 0.6;
  return (inputTokens / 1000) * COST_PER_1K_INPUT + (outputTokens / 1000) * COST_PER_1K_OUTPUT;
}

export interface PipelineInput {
  generationId: string;
  userId: string;
  propertyName: string;
  month: number;
  year: number;
  consolidatedContent: string;
  type: "informe" | "acta" | "full";
}

export interface PipelineResult {
  informeText?: string;
  actaText?: string;
  totalTokens: number;
  totalCost: number;
}

export async function runGenerationPipeline(
  input: PipelineInput
): Promise<PipelineResult> {
  const { generationId, userId, propertyName, month, year, consolidatedContent, type } = input;

  let informeText: string | undefined;
  let actaText: string | undefined;
  let totalTokens = 0;
  let totalCost = 0;

  // Update status to processing
  await db.generation.update({
    where: { id: generationId },
    data: { status: "processing" },
  });

  try {
    // Run informe and acta generation in PARALLEL to cut time in half
    const informePromise = (type === "informe" || type === "full")
      ? (async () => {
          const prompt = buildStrategosPrompt(propertyName, month, year, consolidatedContent);
          return generateWithAssistant(STRATEGOS_SYSTEM_PROMPT, prompt);
        })()
      : null;

    const actaPromise = (type === "acta" || type === "full")
      ? (async () => {
          const prompt = buildGrammatusPrompt(propertyName, month, year, consolidatedContent);
          return generateWithAssistant(GRAMMATEUS_SYSTEM_PROMPT, prompt);
        })()
      : null;

    const [informeResult, actaResult] = await Promise.all([informePromise, actaPromise]);

    if (informeResult) {
      informeText = informeResult.text;
      totalTokens += informeResult.tokensUsed;
      const cost = estimateCost(informeResult.tokensUsed);
      totalCost += cost;
      await recordUsage(userId, informeResult.tokensUsed, cost, "informe");
    }

    if (actaResult) {
      actaText = actaResult.text;
      totalTokens += actaResult.tokensUsed;
      const cost = estimateCost(actaResult.tokensUsed);
      totalCost += cost;
      await recordUsage(userId, actaResult.tokensUsed, cost, "acta");
    }

    // Update generation record
    await db.generation.update({
      where: { id: generationId },
      data: {
        tokensUsed: totalTokens,
        costUsd: totalCost,
      },
    });

    return { informeText, actaText, totalTokens, totalCost };
  } catch (error) {
    await db.generation.update({
      where: { id: generationId },
      data: {
        status: "failed",
        errorMessage: error instanceof Error ? error.message : "Error desconocido",
      },
    });
    throw error;
  }
}
