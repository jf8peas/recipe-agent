import { test } from '@playwright/test';

test('Open Vercel App for Inspection', async ({ page }) => {
  // Replace with your actual Vercel URL
  await page.goto('https://recipe-agent-gamma.vercel.app'); 

  // Keeps the browser open indefinitely so it doesn't close immediately
  await page.pause(); 
});
