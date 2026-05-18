import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Input } from './inputs'

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

describe('Input - Desktop Preservation', () => {
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

  describe('Property: Desktop Input Rendering Preservation', () => {
    it('should render input with default height on desktop (h-12)', () => {
      const testValues = ['value1', 'value2', 'value3']
      
      testValues.forEach((value) => {
        render(<Input data-testid={`input-${value}`} value={value} onChange={() => {}} placeholder={`Test-${value}`} />)
        const input = screen.getByPlaceholderText(`Test-${value}`)
        
        // On desktop with default inputSize, input should have h-12
        expect(input).toHaveClass('h-12')
      })
    })

    it('should preserve desktop input padding values (px-4 py-3)', () => {
      const testValues = ['val1', 'val2', 'val3']
      
      testValues.forEach((value) => {
        render(<Input data-testid={`input-${value}`} value={value} onChange={() => {}} placeholder={`Test-${value}`} />)
        const input = screen.getByPlaceholderText(`Test-${value}`)
        
        // On desktop, input should have px-4 py-3 padding
        expect(input).toHaveClass('px-4')
        expect(input).toHaveClass('py-3')
      })
    })

    it('should preserve desktop input background and border styling', () => {
      render(<Input data-testid="input-bg" value="test" onChange={() => {}} placeholder="Test" />)
      const input = screen.getByPlaceholderText('Test')
      
      // Verify desktop input styling
      expect(input).toHaveClass('bg-slate-50/50')
      expect(input).toHaveClass('border-slate-100')
      expect(input).toHaveClass('text-[#002B5B]')
    })

    it('should preserve desktop input rounded corners (rounded-2xl)', () => {
      render(<Input data-testid="input-radius" value="test" onChange={() => {}} placeholder="Test" />)
      const input = screen.getByPlaceholderText('Test')
      
      // Verify rounded corners
      expect(input).toHaveClass('rounded-2xl')
    })
  })

  describe('Desktop Input Size Variants', () => {
    it('should preserve default desktop input size (h-12)', () => {
      render(<Input data-testid="input-default" value="test" onChange={() => {}} inputSize="default" placeholder="Test" />)
      const input = screen.getByPlaceholderText('Test')
      
      expect(input).toHaveClass('h-12')
    })

    it('should preserve small desktop input size (h-9 px-3)', () => {
      render(<Input data-testid="input-sm" value="test" onChange={() => {}} inputSize="sm" placeholder="Test" />)
      const input = screen.getByPlaceholderText('Test')
      
      expect(input).toHaveClass('h-9')
      expect(input).toHaveClass('px-3')
    })

    it('should preserve large desktop input size (h-14 px-6)', () => {
      render(<Input data-testid="input-lg" value="test" onChange={() => {}} inputSize="lg" placeholder="Test" />)
      const input = screen.getByPlaceholderText('Test')
      
      expect(input).toHaveClass('h-14')
      expect(input).toHaveClass('px-6')
    })
  })

  describe('Desktop Input in Modals', () => {
    it('should render input with full width in modal context', () => {
      render(<Input data-testid="input-modal" value="test" onChange={() => {}} placeholder="Modal Input" />)
      const input = screen.getByPlaceholderText('Modal Input')
      
      // Input should have w-full for modal usage
      expect(input).toHaveClass('w-full')
    })

    it('should preserve desktop input focus states', () => {
      render(<Input data-testid="input-focus" value="test" onChange={() => {}} placeholder="Test" />)
      const input = screen.getByPlaceholderText('Test')
      
      // Verify focus states
      expect(input).toHaveClass('focus:bg-white')
      expect(input).toHaveClass('focus:border-[#002B5B]')
      expect(input).toHaveClass('focus:ring-4')
      expect(input).toHaveClass('focus:ring-[#002B5B]/5')
    })

    it('should preserve desktop input disabled state', () => {
      render(<Input data-testid="input-disabled" value="test" onChange={() => {}} disabled placeholder="Test" />)
      const input = screen.getByPlaceholderText('Test')
      
      expect(input).toHaveClass('disabled:cursor-not-allowed')
      expect(input).toHaveClass('disabled:opacity-50')
    })
  })

  describe('Desktop Input Variants', () => {
    it('should preserve default desktop input variant styling', () => {
      render(<Input data-testid="input-default-var" value="test" onChange={() => {}} variant="default" placeholder="Test" />)
      const input = screen.getByPlaceholderText('Test')
      
      expect(input).toHaveClass('border-slate-100')
      expect(input).toHaveClass('focus:border-[#002B5B]')
    })

    it('should preserve error desktop input variant styling', () => {
      render(<Input data-testid="input-error" value="test" onChange={() => {}} variant="error" placeholder="Test" />)
      const input = screen.getByPlaceholderText('Test')
      
      expect(input).toHaveClass('border-red-200')
      expect(input).toHaveClass('focus:border-red-500')
    })

    it('should preserve success desktop input variant styling', () => {
      render(<Input data-testid="input-success" value="test" onChange={() => {}} variant="success" placeholder="Test" />)
      const input = screen.getByPlaceholderText('Test')
      
      expect(input).toHaveClass('border-green-200')
      expect(input).toHaveClass('focus:border-green-500')
    })
  })

  describe('Desktop Input Label and Helper Text', () => {
    it('should preserve desktop input label styling', () => {
      render(<Input data-testid="input-label" value="test" onChange={() => {}} label="Test Label" placeholder="Test" />)
      const label = screen.getByText('Test Label')
      
      // Label should have uppercase tracking-widest styling
      expect(label).toBeTruthy()
      expect(label.tagName.toLowerCase()).toBe('label')
    })

    it('should preserve desktop input helper text styling', () => {
      render(<Input data-testid="input-helper" value="test" onChange={() => {}} helperText="Helper text" placeholder="Test" />)
      const helperText = screen.getByText('Helper text')
      
      expect(helperText).toBeTruthy()
      expect(helperText).toHaveClass('text-xs')
    })
  })
})
