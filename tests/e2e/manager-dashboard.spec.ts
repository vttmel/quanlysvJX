import { expect, test } from '@playwright/test';

test('manager dashboard loads', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'JX Compose Manager' })).toBeVisible();
});

test('backup files route shows workspace tabs', async ({ page }) => {
  await page.goto('/backup/files');

  await expect(page.getByRole('tab', { name: 'Sao lưu (Backup)' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tab', { name: 'Files' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tab', { name: 'Schedule' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Jobs' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Settings' })).toBeVisible();
});

test('backup schedule route opens schedule tab', async ({ page }) => {
  await page.goto('/backup/schedule');

  await expect(page.getByRole('tab', { name: 'Sao lưu (Backup)' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tab', { name: 'Schedule' })).toHaveAttribute('aria-selected', 'true');
});

test('backup tab clicks update the URL', async ({ page }) => {
  await page.goto('/backup/files');

  await page.getByRole('tab', { name: 'Jobs' }).click();

  await expect(page).toHaveURL(/\/backup\/jobs$/);
});

test('unknown route falls back to dashboard', async ({ page }) => {
  await page.goto('/not-real');

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('tab', { name: 'Bảng điều khiển & Logs' })).toHaveAttribute('aria-selected', 'true');
});
