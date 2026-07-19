import { expect, test } from '@playwright/test'

test('touch command shell remains operable without page overflow', async ({ page }, testInfo) => {
  await page.route('**/api/incidents', async (route) => {
    if (route.request().method() !== 'POST') return route.continue()
    const at = new Date().toISOString()
    await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({
      schemaVersion: 2, id: 'inc-e2e', mode: 'scene', name: 'Responsive Test', address: '', marker: null,
      commandPost: null, lifecycleStatus: 'active', schedule: { scheduledStartAt: null, scheduledEndAt: null, actualStartAt: at, actualEndAt: null },
      createdAt: at, updatedAt: at, closedAt: null, revision: 1,
      timer: { startedAt: null, accumulatedMs: 0, running: false },
      board: { columns: [], bankUnitIds: [] }, checklist: [],
    }) })
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Scene Command' }).click()
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByLabel('Incident name').fill('Responsive Test')
  await page.getByRole('button', { name: 'Create command board' }).click()

  await expect(page.getByRole('button', { name: 'Board' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Map' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Audio' })).toBeVisible()

  const viewport = page.viewportSize()
  expect(viewport).not.toBeNull()
  const overflow = await page.evaluate(() => ({
    body: document.body.scrollWidth - document.body.clientWidth,
    root: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }))
  expect(overflow.body).toBeLessThanOrEqual(1)
  expect(overflow.root).toBeLessThanOrEqual(1)

  const openDrawer = page.getByRole('button', { name: 'Open PulsePoint incidents' })
  const collapseDrawer = page.getByRole('button', { name: 'Collapse PulsePoint incidents' })
  if (await openDrawer.isVisible()) await openDrawer.click()
  await expect(collapseDrawer).toBeVisible()

  const drawer = page.getByLabel('PulsePoint incident monitor')
  if ((viewport?.width ?? 0) < 1280) {
    const box = await drawer.boundingBox()
    expect(box?.width ?? 0).toBeLessThanOrEqual((viewport?.width ?? 0) * 0.92 + 1)
  }

  await page.screenshot({
    path: testInfo.outputPath(`responsive-${testInfo.project.name}.png`),
    fullPage: false,
  })
})
