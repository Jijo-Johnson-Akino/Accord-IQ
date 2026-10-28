import { z } from "zod";

export const citationSchema = z.object({
  quote: z.string().trim().min(1).max(800),
  page: z.number().int().positive().nullable(),
});

export const extractedValueSchema = z.object({
  value: z.string().trim().min(1).max(2000).nullable(),
  confidence: z.number().min(0).max(1),
  citation: citationSchema.nullable(),
});

export const extractedPartySchema = z.object({
  name: z.string().trim().min(1).max(200),
  role: z.enum(["INTERNAL", "COUNTERPARTY", "SIGNATORY", "OTHER"]),
  confidence: z.number().min(0).max(1),
  citation: citationSchema.nullable(),
});

export const extractedClauseSchema = z.object({
  heading: z.string().trim().min(1).max(200),
  summary: z.string().trim().min(1).max(2000),
  confidence: z.number().min(0).max(1),
  citation: citationSchema.nullable(),
});

export const extractedObligationSchema = z.object({
  title: z.string().trim().min(1).max(300),
  dueOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  confidence: z.number().min(0).max(1),
  citation: citationSchema.nullable(),
});

export const extractionSchema = z.object({
  title: extractedValueSchema,
  parties: z.array(extractedPartySchema).max(12),
  startDate: extractedValueSchema,
  endDate: extractedValueSchema,
  renewalTerms: extractedValueSchema,
  governingLaw: extractedValueSchema,
  jurisdiction: extractedValueSchema,
  contractValue: extractedValueSchema,
  currency: extractedValueSchema,
  paymentTerms: extractedValueSchema,
  summary: z.object({
    text: z.string().trim().min(1).max(4000),
    confidence: z.number().min(0).max(1),
  }),
  clauses: z.array(extractedClauseSchema).max(20),
  obligations: z.array(extractedObligationSchema).max(20),
  conflicts: z
    .array(
      z.object({
        field: z.string().trim().min(1).max(80),
        message: z.string().trim().min(1).max(500),
      }),
    )
    .max(20),
});

export const qaSchema = z.object({
  answer: z.string().trim().max(4000).nullable(),
  supported: z.boolean(),
  refusalReason: z.string().trim().max(500).nullable(),
  citations: z.array(citationSchema).max(8),
});

export const comparisonSchema = z.object({
  summary: z.string().trim().min(1).max(4000),
  changes: z
    .array(
      z.object({
        topic: z.string().trim().min(1).max(200),
        before: z.string().trim().max(2000).nullable(),
        after: z.string().trim().max(2000).nullable(),
        citationA: citationSchema.nullable(),
        citationB: citationSchema.nullable(),
      }),
    )
    .max(30),
});

export type Citation = z.infer<typeof citationSchema>;
export type ExtractionPayload = z.infer<typeof extractionSchema>;
export type QaPayload = z.infer<typeof qaSchema>;
export type ComparisonPayload = z.infer<typeof comparisonSchema>;
