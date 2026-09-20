// tests/inspect.spec.ts
import { test } from '@playwright/test';

test('Open Vercel App for Inspection', async ({ page }) => {
  // Replace with your Vercel URL or relative path if baseURL is configured
  await page.goto('https://recipe-agent-gamma.vercel.app/'); 

  // Keeps the browser open indefinitely so it doesn't close after loading
  await page.pause(); 
});
