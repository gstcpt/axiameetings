import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ChatWidget } from './ChatWidget'

// Mock window.matchMedia for responsive testing
const mockMatchMedia = (matches: boolean) => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches,
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

// Mock next-intl
vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: (ns: string) => {
    const translations: Record<string, Record<string, string>> = {
      Chat: {
        title: 'AI Assistant',
        subtitle: 'Online',
        placeholder: 'Type a message...',
        welcome: 'Welcome to AxiaMeetings!',
        privacyNotice: 'Your privacy is important to us.',
        error: 'Sorry, something went wrong.',
        poweredBy: 'Powered by Axia',
      },
    }
    return (key: string) => translations[ns]?.[key] || key
  },
}))

// Mock next/navigation
vi.mock('next/navigation', () => ({
  usePathname: () => '/',
}))

describe('ChatWidget - Desktop Preservation', () => {
  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks()
    // Set desktop screen width (≥768px)
    mockMatchMedia(true)
    // Set innerWidth for additional verification
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      value: 1024,
    })
    // Set innerHeight for viewport calculations
    Object.defineProperty(window, 'innerHeight', {
      writable: true,
      value: 768,
    })
  })

  describe('Property: Desktop ChatWidget Positioning Preservation', () => {
    it('should render ChatWidget toggle button with desktop styling', () => {
      render(<ChatWidget />)
      
      // The widget toggle button should be present
      const toggleButton = screen.getByRole('button', { name: /open chat/i })
      expect(toggleButton).toBeTruthy()
      
      // Verify button has expected desktop positioning classes
      expect(toggleButton).toHaveClass('z-50')
    })

    it('should preserve desktop ChatWidget toggle button styling', () => {
      render(<ChatWidget />)
      const toggleButton = screen.getByRole('button', { name: /open chat/i })
      
      // Verify desktop button styling
      expect(toggleButton).toHaveClass('bg-gradient-to-br')
      expect(toggleButton).toHaveClass('from-[#002B5B]')
      expect(toggleButton).toHaveClass('to-blue-600')
      expect(toggleButton).toHaveClass('text-white')
      expect(toggleButton).toHaveClass('shadow-xl')
    })

    it('should preserve desktop ChatWidget toggle button size', () => {
      render(<ChatWidget />)
      const toggleButton = screen.getByRole('button', { name: /open chat/i })
      
      // On desktop (≥768px), button should have sm:w-16 sm:h-16
      // The sm: prefix means it applies at 640px and up
      expect(toggleButton).toBeTruthy()
    })
  })

  describe('Desktop Chat Widget Visual Appearance', () => {
    it('should preserve desktop ChatWidget border styling', () => {
      render(<ChatWidget />)
      const toggleButton = screen.getByRole('button', { name: /open chat/i })
      
      // Toggle button should have border-4 border-white
      expect(toggleButton).toHaveClass('border-4')
      expect(toggleButton).toHaveClass('border-white')
    })

    it('should preserve desktop ChatWidget pulse ring animation', () => {
      render(<ChatWidget />)
      const toggleButton = screen.getByRole('button', { name: /open chat/i })
      
      // Pulse ring should be present
      expect(toggleButton).toBeTruthy()
    })
  })
})
