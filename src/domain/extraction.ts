// Extraction adapter — replaceable provider for invoice field extraction.
// When no provider is configured (or credentials are missing), returns a
// SIMULATED result so the application still works end-to-end for testing.

export interface ExtractedFields {
  filename?: string;
  size_bytes?: number;
  mime_type?: string;
  vendor_name?: string;
  vendor_identifier?: string;
  invoice_number?: string;
  invoice_date?: string;
  due_date?: string;
  po_number?: string;
  currency?: string;
  lines?: { sku?: string; description?: string; quantity?: number; unit_price?: number; tax_code?: string; tax_amount?: number }[];
  subtotal?: number;
  tax_total?: number;
  grand_total?: number;
}

export interface ExtractionResult {
  provider: string;
  confidence: number;
  fields: ExtractedFields;
  error?: string;
}

export type Provider = 'SIMULATED' | 'OCR_SPACE' | 'OPENAI';

export interface ExtractionAdapter {
  provider: Provider;
  extract(file: { name: string; type: string; data: ArrayBuffer }): Promise<ExtractionResult>;
}

export class SimulatedAdapter implements ExtractionAdapter {
  provider: Provider = 'SIMULATED';
  async extract(file: { name: string; type: string; data: ArrayBuffer }): Promise<ExtractionResult> {
    // Simulated extraction — no OCR/LLM invoked.
    return {
      provider: 'SIMULATED',
      confidence: 0.0,
      fields: {
        filename: file.name,
        size_bytes: file.data.byteLength,
        mime_type: file.type,
        invoice_number: 'SIM-' + Date.now(),
        currency: 'USD',
      },
      error: 'Simulated extraction. No provider configured. Use structured JSON import for reliable testing.',
    };
  }
}

export function getExtractionAdapter(): ExtractionAdapter {
  const provider = (import.meta.env.VITE_EXTRACTION_PROVIDER as Provider) ?? 'SIMULATED';
  switch (provider) {
    case 'OCR_SPACE':
      if (!import.meta.env.VITE_OCR_SPACE_API_KEY) return new SimulatedAdapter();
      // Real implementation would call OCR.space here.
      return new SimulatedAdapter();
    case 'OPENAI':
      if (!import.meta.env.VITE_OPENAI_API_KEY) return new SimulatedAdapter();
      // Real implementation would call OpenAI vision here.
      return new SimulatedAdapter();
    default:
      return new SimulatedAdapter();
  }
}
