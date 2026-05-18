import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { GridCardView } from './ui/gridCardView'
import { CornerControls } from './ui/CornerControls'
import { ThemeProvider } from '../contexts/ThemeContext'

// Mock matchMedia for desktop testing
const mockMatchMedia = (matches: boolean) => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('prefers-color-scheme: dark') ? false : matches,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
}

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: (ns: string) => {
    return (key: string) => key
  },
}))

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
}))

describe('Preservation Checking (Desktop ≥768px)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockMatchMedia(true) // Desktop layout
    Object.defineProperty(window, 'innerWidth', { writable: true, value: 1024 })
    Object.defineProperty(window, 'innerHeight', { writable: true, value: 768 })
  })

  describe('Property 2: Desktop Behavior Preservation', () => {
    it('data table rendering on desktop should use standard table layout', () => {
      const columns = [{ header: 'Test Col', accessorKey: 'test', id: 'test', cell: () => null }]
      const data = [{ test: 'Data 1' }]
      
      render(<GridCardView columns={columns} data={data} />)
      const desktopView = screen.getByTestId('grid-card-view-desktop')
      expect(desktopView).toBeTruthy()
      expect(desktopView.className).toContain('hidden md:block')
    })

    it('light mode display should be preserved by default', () => {
      render(
        <ThemeProvider>
          <CornerControls />
        </ThemeProvider>
      )
      
      // Light mode is the default state
      expect(document.documentElement.classList.contains('dark')).toBe(false)
    })
  })
})
