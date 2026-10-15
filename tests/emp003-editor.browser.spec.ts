import { test, expect } from "@playwright/test";

const tenant = "herreb-browser-test-a";
let campaignId = "herreb-browser-e2e";
const blueprint = (objective: string) => ({
  tenantId: tenant, correlationId: "ui-" + campaignId, objective,
  audiences: ["Dirección comercial"], positioning: "Estrategia y crecimiento",
  keyMessages: ["Diagnóstico de 30 minutos"], channels: [{ name: "LinkedIn", actions: ["Contactos individuales"] }],
  kpis: [{ metric: "Reuniones", target: "4", measurement: "CRM" }],
  assumptions: ["Piloto interno"], evidenceRefs: ["https://herreb.com"],
  status: "DRAFT", publishApproved: false
});
test("browser: create, edit, reload, read-back, approved lock and failed read-back", async ({ page }) => {
  let stored: ReturnType<typeof blueprint> | undefined;
  let state = "DRAFT";
  let failRead = false;
  await page.route("**/api/emp003/**", async route => {
    const req = route.request();
    const url = new URL(req.url());
    const json = (data: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data) });
    if (url.pathname.endsWith("/operations")) {
      return json({ ok: true, tenantId: tenant, campaigns: stored ? [{
        campaignId, blueprint: stored, reviewState: state, reviewRevision: 0,
        requiresOwnerReview: state === "DRAFT" || state === "IN_REVIEW",
        publishAuthorized: false, publishExecuted: false
      }] : [] });
    }
    if (req.method() === "GET") return failRead ? json({ error: "read failure" }, 503) : json({ ok: true, campaign: stored });
    if (req.method() === "POST") {
      const body = req.postDataJSON();
      campaignId = body.campaignId;
      stored = body.blueprint;
      return json({ ok: true, persisted: true, readBackConfirmed: true });
    }
    return json({ error: "not found" }, 404);
  });
  await page.goto("/");
  await page.getByRole("button", { name: "EMP-003" }).click();
  await page.getByRole("button", { name: "Nueva propuesta" }).click();
  await page.getByRole("button", { name: "Guardar y verificar persistencia" }).click();
  await expect(page.getByText(/Borrador guardado y vuelto a consultar/)).toBeVisible();
  expect(stored?.objective).toBe("Captar reuniones de diagnóstico para consultoría de crecimiento e IA");
  await page.getByRole("textbox", { name: "Objetivo" }).fill("Objetivo actualizado y persistido");
  await page.getByRole("button", { name: "Guardar y verificar persistencia" }).click();
  await expect(page.getByText(/Borrador guardado y vuelto a consultar/)).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "EMP-003" }).click();
  await expect(page.getByRole("textbox", { name: "Objetivo" })).toHaveValue("Objetivo actualizado y persistido");
  expect(stored?.objective).toBe("Objetivo actualizado y persistido");
  state = "APPROVED";
  await page.getByRole("button", { name: "Volver a consultar" }).click();
  await expect(page.getByRole("textbox", { name: "Objetivo" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Guardar y verificar persistencia" })).toBeDisabled();
  state = "DRAFT";
  failRead = true;
  await page.getByRole("button", { name: "Volver a consultar" }).click();
  await expect(page.getByRole("alert")).toContainText("No se pudo volver a consultar");
});
