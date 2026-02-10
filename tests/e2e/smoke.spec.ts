import { expect, test } from "@playwright/test";

test("core loop smoke: start, pause, game over, save, restart", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".menu-player-name")).toBeVisible();
  await page.locator(".menu-player-name").fill("Smoke");
  await page.locator("[data-action='play']").click();

  await expect(page.locator(".hud")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-action='resume']")).toBeVisible();

  await page.evaluate(() => {
    const api = (window as unknown as { __snake3d?: { forceGameOver: () => void } }).__snake3d;
    api?.forceGameOver();
  });
  await expect(page.locator("[data-action='save']")).toBeVisible();

  const input = page.locator(".gameover-panel .name-input input");
  await input.fill("Smoke");
  await page.locator("[data-action='save']").click();
  await expect(page.locator(".save-result")).not.toHaveText("");

  await page.locator("[data-action='restart']").click();
  await expect(page.locator(".hud")).toBeVisible();
});
