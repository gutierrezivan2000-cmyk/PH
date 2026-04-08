import { generateWithAssistant } from "@/lib/openai";
import { STRATEGOS_SYSTEM_PROMPT, buildStrategosPrompt } from "@/lib/ai/strategos";
import { GRAMMATEUS_SYSTEM_PROMPT, buildGrammatusPrompt } from "@/lib/ai/grammateus";
import { recordUsage } from "@/lib/usage";
import { db } from "@/lib/db";

// Cost estimates per 1K tokens (GPT-4o)
const COST_PER_1K_INPUT = 0.0025;
const COST_PER_1K_OUTPUT = 0.01;

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
    // Generate Informe if needed
    if (type === "informe" || type === "full") {
      const prompt = buildStrategosPrompt(propertyName, month, year, consolidatedContent);
      const result = await generateWithAssistant(STRATEGOS_SYSTEM_PROMPT, prompt);
      informeText = result.text;
      totalTokens += result.tokensUsed;
      const cost = estimateCost(result.tokensUsed);
      totalCost += cost;
      await recordUsage(userId, result.tokensUsed, cost, "informe");
    }

    // Generate Acta if needed
    if (type === "acta" || type === "full") {
      const prompt = buildGrammatusPrompt(propertyName, month, year, consolidatedContent);
      const result = await generateWithAssistant(GRAMMATEUS_SYSTEM_PROMPT, prompt);
      actaText = result.text;
      totalTokens += result.tokensUsed;
      const cost = estimateCost(result.tokensUsed);
      totalCost += cost;
      await recordUsage(userId, result.tokensUsed, cost, "acta");
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
