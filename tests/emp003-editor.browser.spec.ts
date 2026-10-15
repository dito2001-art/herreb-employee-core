import { test, expect } from "@playwright/test";

test("EMP-003 editor: create, save, reload and verify multiline content", async ({ page }) => {
  const tenantId = "herreb-client-0";
  const drafts = new Map<string, Record<string, unknown>>();
  await page.route("**/api/emp003/operations", async route => {
    await route.fulfill({ json: { ok: true, tenantId, campaigns: [...drafts.entries()].map(([campaignId, blueprint]) => ({
      campaignId, blueprint, reviewState: "DRAFT", reviewRevision: 0,
      requiresOwnerReview: true, publishAuthorized: false, publishExecuted: false
    })) } });
  });
  await page.route("**/api/emp003/drafts**", async route => {
    const url = new URL(route.request().url());
    if (route.request().method() === "POST") {
      const { campaignId, blueprint } = route.request().postDataJSON();
      drafts.set(campaignId, blueprint);
      await route.fulfill({ json: { ok: true, tenantId, campaignId, blueprint, persisted: true, readBackConfirmed: true, publishExecuted: false } });
    } else {
      const campaign = drafts.get(url.searchParams.get("campaignId") ?? "");
      await route.fulfill({ json: { ok: true, found: Boolean(campaign), campaign: campaign ?? null } });
    }
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Nueva propuesta" }).click();
  await page.getByRole("textbox", { name: "Objetivo" }).fill("Diagnósticos de crecimiento HerreB");
  await page.getByRole("textbox", { name: "Audiencias" }).fill("Dirección general\nGerencia comercial");
  await page.getByRole("textbox", { name: "Mensajes" }).fill("Estrategia y experiencias\nCrecimiento medible");
  await page.getByRole("button", { name: "Guardar y verificar persistencia" }).click();
  await expect(page.getByText(/Borrador guardado y vuelto a consultar/)).toBeVisible();
  expect(drafts.size).toBe(1);
  const saved = [...drafts.values()][0] as { audiences: string[]; keyMessages: string[] };
  expect(saved.audiences).toEqual(["Dirección general", "Gerencia comercial"]);
  expect(saved.keyMessages).toEqual(["Estrategia y experiencias", "Crecimiento medible"]);
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Objetivo" })).toHaveValue("Diagnósticos de crecimiento HerreB");
  await expect(page.getByRole("textbox", { name: "Audiencias" })).toHaveValue("Dirección general\nGerencia comercial");
});
