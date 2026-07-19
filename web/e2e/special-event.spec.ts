import { expect, test } from '@playwright/test'

test('special-event wizard and board remain touch-operable', async ({ page }) => {
  const at = new Date().toISOString()
  await page.route('**/api/incidents', (route) => route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({
    schemaVersion: 2, id: 'event-e2e', mode: 'special_event', name: 'FIFA Detail', address: '', marker: null,
    commandPost: { label: 'Command Post', address: '', lat: null, lng: null }, lifecycleStatus: 'active',
    schedule: { scheduledStartAt: null, scheduledEndAt: null, actualStartAt: at, actualEndAt: null },
    createdAt: at, updatedAt: at, closedAt: null, revision: 1,
    timer: { startedAt: null, accumulatedMs: 0, running: false }, board: { columns: [], bankUnitIds: [] }, checklist: [],
  }) }))
  await page.route('**/api/incidents/event-e2e/event-state', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
    incidentId: 'event-e2e', stagingLocations: [{ id: 'stg-1', name: 'North Staging', address: '', lat: null, lng: null, isDefault: true }],
    units: [{ unitId: 'R44', status: 'staged', stagingLocationId: 'stg-1', currentRunId: null, previousStagingLocationId: null, manualHold: false, statusUpdatedAt: at }], runs: [],
  }) }))
  await page.goto('/')
  await page.getByRole('button', { name: 'Special Events Detail' }).click()
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByLabel('Event name').fill('FIFA Detail')
  await page.getByRole('button', { name: 'Create command board' }).click()
  await expect(page.getByRole('button', { name: 'Runs' })).toBeVisible()
  await expect(page.getByText('North Staging')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Active Calls' })).toBeVisible()
})
