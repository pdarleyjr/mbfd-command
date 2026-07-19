import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Incident } from '@/types'
import { downloadEventSummaryPdf } from './export'

describe('downloadEventSummaryPdf', () => {
  afterEach(() => vi.restoreAllMocks())

  it('uses the server-rendered PDF and attachment filename', async () => {
    const fetchMock = vi.fn(async () => new Response(new Blob(['%PDF-test'], { type: 'application/pdf' }), {
      status: 200, headers: { 'Content-Disposition': 'attachment; filename="detail-summary.pdf"' },
    }))
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:report'), revokeObjectURL: vi.fn() })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    const incident = { id: 'inc/a', name: 'Detail', mode: 'special_event' } as Incident

    await downloadEventSummaryPdf(incident)

    expect(fetchMock).toHaveBeenCalledWith('/api/incidents/inc%2Fa/exports/event-summary.pdf', expect.objectContaining({ method: 'POST' }))
    expect(click).toHaveBeenCalledOnce()
  })
})
