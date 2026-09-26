import { z } from 'astro/zod';

export const labMetaSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1).max(200),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
    .refine((s) => !Number.isNaN(Date.parse(s)), 'Not a real date'),
  status: z.enum(['live', 'wip', 'unlisted']),
  tags: z.array(z.string()).default([]),
});

export type LabMeta = z.infer<typeof labMetaSchema>;
export type LabMetaInput = z.input<typeof labMetaSchema>;

export function defineLab(input: LabMetaInput): LabMeta {
  const result = labMetaSchema.safeParse(input);
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid lab _meta.ts — ${problems}`);
  }
  return result.data;
}
