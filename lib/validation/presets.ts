import { z } from "zod";

export const presetNameSchema = z
  .string()
  .trim()
  .min(1, "Preset name cannot be empty")
  .max(32, "Preset name must be 32 characters or fewer");

export const presetStoreRequestSchema = z.object({
  ip: z.string().min(1, "Missing ip"),
  mac: z.string().min(1, "Missing mac"),
  slot: z
    .number()
    .int("slot must be an integer")
    .min(1, "slot must be between 1 and 40")
    .max(40, "slot must be between 1 and 40"),
  name: presetNameSchema,
});

export type PresetStoreRequest = z.infer<typeof presetStoreRequestSchema>;
