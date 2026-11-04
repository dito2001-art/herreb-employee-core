import type { ImageGenerationProvider, ImageMimeType } from "./image-generation-v2";

/**
 * OpenAI Images API adapter for EMP-003 V2.
 * Server-side only. Never expose OPENAI_API_KEY to the browser.
 * This initial adapter supports text-to-image. Reference-image editing
 * intentionally fails closed until a separately tested edits adapter exists.
 */
export function createOpenAIImageProvider(config: {
  apiKey: string;
  model: string;
  fetchImpl?: typeof fetch;
}): ImageGenerationProvider {
  if (!config.apiKey || !config.model) throw new Error("OpenAI image provider not configured");
  const request = config.fetchImpl ?? fetch;
  return {
    async generate(input) {
      if (input.reference) throw new Error("OPENAI_IMAGE_EDIT_NOT_CONFIGURED");
      const size = input.aspectRatio === "1:1"
        ? "1024x1024"
        : input.aspectRatio === "16:9"
          ? "1536x1024"
          : "1024x1536";
      const response = await request("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: config.model,
          prompt: input.prompt,
          size,
          n: 1,
          output_format: "png",
        }),
      });
      if (!response.ok) {
        // Never include response bodies: providers may echo sensitive data.
        throw new Error(`OPENAI_IMAGE_REQUEST_FAILED_${response.status}`);
      }
      const payload: unknown = await response.json();
      const encoded = (payload as { data?: Array<{ b64_json?: unknown }> })?.data?.[0]?.b64_json;
      if (typeof encoded !== "string" || !encoded.length) {
        throw new Error("OPENAI_IMAGE_RESPONSE_INVALID");
      }
      const raw = atob(encoded);
      const bytes = Uint8Array.from(raw, c => c.charCodeAt(0));
      return { bytes, mimeType: "image/png" as ImageMimeType };
    },
  };
}
