import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatLogoUrl(logo: string | null | undefined): string {
  if (!logo) return '';
  const trimmed = logo.trim();
  
  if (trimmed === "AxiaMeetings.svg") {
    return "/AxiaMeetings.svg";
  }
  
  // Data URL or absolute path starting with slash
  if (/^(data:|https?:\/\/|\/)/i.test(trimmed)) {
    return trimmed;
  }
  
  // Protocol relative URL
  if (trimmed.startsWith('//')) {
    return `https:${trimmed}`;
  }
  
  // Check if it's an external URL without protocol
  if (trimmed.startsWith('www.') || (trimmed.includes('.') && trimmed.includes('/') && trimmed.indexOf('/') > trimmed.indexOf('.'))) {
    return `https://${trimmed}`;
  }
  
  // Otherwise, treat as local upload filename
  return `/uploads/${trimmed}`;
}