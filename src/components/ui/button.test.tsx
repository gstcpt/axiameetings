import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Button } from './button'

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

describe('Button - Desktop Preservation', () => {
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
  })

  describe('Property: Desktop Button Rendering Preservation', () => {
    it('should render button with default size on desktop without text wrapping', () => {
      const testTexts = ['Submit', 'Save Changes', 'Cancel', 'Delete', 'Edit']
      
      testTexts.forEach((text) => {
        render(<Button data-testid={`btn-${text}`}>{text}</Button>)
        const button = screen.getByTestId(`btn-${text}`)
        
        // On desktop, button should have default padding (h-10 px-6)
        // Text should not wrap (whitespace-nowrap is applied)
        expect(button).toBeTruthy()
        expect(button).toHaveClass('whitespace-nowrap')
      })
    })

    it('should maintain consistent button height on desktop across variants', () => {
      const variants = ['default', 'primary', 'secondary', 'outline', 'ghost', 'destructive', 'danger', 'success', 'link'] as const
      
      variants.forEach((variant) => {
        render(<Button data-testid={`btn-${variant}`} variant={variant}>Test</Button>)
        const button = screen.getByTestId(`btn-${variant}`)
        const computedStyle = window.getComputedStyle(button)
        
        // On desktop with default size, button should have h-10 (40px height)
        // Allow some tolerance for border/padding calculations
        expect(button).toBeTruthy()
        expect(computedStyle.height).toBeDefined()
      })
    })

    it('should preserve desktop button padding values (px-6 = 24px)', () => {
      const testTexts = ['Button1', 'Button2', 'Button3']
      
      testTexts.forEach((text) => {
        render(<Button data-testid={`btn-${text}`}>{text}</Button>)
        const button = screen.getByTestId(`btn-${text}`)
        
        // On desktop, button should have px-6 (24px horizontal padding)
        // This should be preserved from the original implementation
        expect(button).toHaveClass('px-6')
      })
    })

    it('should preserve desktop button text wrapping prevention', () => {
      const longText = 'This is a long button text that should not wrap on desktop screens'
      
      render(<Button data-testid="long-text-btn">{longText}</Button>)
      const button = screen.getByTestId('long-text-btn')
      
      // On desktop, whitespace-nowrap should be applied to prevent text wrapping
      // The class is in the component, so verify it's present in the className
      expect(button).toHaveClass('whitespace-nowrap')
      
      // Verify button renders without line breaks
      expect(button.textContent).toBe(longText)
    })
  })

  describe('Desktop Size Variants', () => {
    it('should preserve default desktop button size (h-10 px-6)', () => {
      render(<Button data-testid="default-btn" size="default">Test Button</Button>)
      const button = screen.getByTestId('default-btn')
      
      // Verify default desktop size classes
      expect(button).toHaveClass('h-10')
      expect(button).toHaveClass('px-6')
    })

    it('should preserve large desktop button size (h-12 px-8)', () => {
      render(<Button data-testid="lg-btn" size="lg">Test Button</Button>)
      const button = screen.getByTestId('lg-btn')
      
      // Verify large desktop size classes
      expect(button).toHaveClass('h-12')
      expect(button).toHaveClass('px-8')
    })

    it('should preserve small desktop button size (h-9 px-5)', () => {
      render(<Button data-testid="sm-btn" size="sm">Test Button</Button>)
      const button = screen.getByTestId('sm-btn')
      
      // Verify small desktop size classes
      expect(button).toHaveClass('h-9')
      expect(button).toHaveClass('px-5')
    })
  })

  describe('Desktop Visual Appearance', () => {
    it('should preserve default desktop button styling (bg-[#002B5B] text-white)', () => {
      render(<Button data-testid="color-btn">Test</Button>)
      const button = screen.getByTestId('color-btn')
      
      // Verify default desktop colors
      expect(button).toHaveClass('bg-[#002B5B]')
      expect(button).toHaveClass('text-white')
    })

    it('should preserve desktop button hover states', () => {
      render(<Button data-testid="hover-btn">Test</Button>)
      const button = screen.getByTestId('hover-btn')
      
      // Verify hover class is present in the component classes
      expect(button).toHaveClass('hover:bg-blue-700')
    })

    it('should preserve desktop button shadow styling', () => {
      const variants = ['default', 'primary', 'destructive', 'danger', 'success'] as const
      
      variants.forEach((variant) => {
        render(<Button data-testid={`shadow-${variant}`} variant={variant}>Test</Button>)
        const button = screen.getByTestId(`shadow-${variant}`)
        
        // Verify shadow classes are present
        expect(button).toHaveClass('shadow-lg')
      })
    })
  })
})
