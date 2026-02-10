import { expect, test } from "@playwright/test";

test("core loop smoke: start, pause, game over, save, restart", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: /играть|play/i })).toBeVisible();
  await page.getByRole("button", { name: /играть|play/i }).click();

  await expect(page.locator(".hud")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByText(/пауза|paused/i)).toBeVisible();

  await page.evaluate(() => {
    const api = (window as unknown as { __snake3d?: { forceGameOver: () => void } }).__snake3d;
    api?.forceGameOver();
  });
  await expect(page.getByText(/игра окончена|game over/i)).toBeVisible();

  const input = page.locator(".name-input input");
  await input.fill("Smoke");
  await page.getByRole("button", { name: /сохранить|save/i }).click();
  await expect(page.getByText(/рекорд|record/i)).toBeVisible();

  await page.getByRole("button", { name: /рестарт|restart/i }).click();
  await expect(page.locator(".hud")).toBeVisible();
});
