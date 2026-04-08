export interface UploadedFile {
  url: string;
  name: string;
  type: string;
  size: number;
}

export interface GenerationOutput {
  informeHtml?: string;
  actaHtml?: string;
  presentacionPptx?: string;
}

export type GenerationType = "informe" | "acta" | "presentacion" | "full";
export type GenerationStatus = "pending" | "processing" | "completed" | "failed";
export type SubscriptionStatus = "active" | "inactive" | "canceled" | "past_due" | "trialing";
