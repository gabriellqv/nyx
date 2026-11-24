import { z } from 'zod';

const postgresBigintMaximum = 9223372036854775807n;
const unsignedMinorUnitPattern = /^(0|[1-9]\d{0,18})$/;

export const minorUnitInputSchema = z
  .union([
    z.string().regex(unsignedMinorUnitPattern, 'Amount must be an integer in minor currency units'),
    z
      .number()
      .int()
      .nonnegative()
      .refine(Number.isSafeInteger, 'Numeric amounts must be safe integers'),
  ])
  .transform(value => String(value))
  .refine(value => BigInt(value) <= postgresBigintMaximum, 'Amount exceeds the supported range');

export const positiveMinorUnitInputSchema = minorUnitInputSchema.refine(
  value => BigInt(value) > 0n,
  'Amount must be greater than zero',
);

export const nonNegativeMinorUnitStringSchema = z
  .string()
  .regex(unsignedMinorUnitPattern)
  .refine(value => BigInt(value) <= postgresBigintMaximum);

export const positiveMinorUnitStringSchema = nonNegativeMinorUnitStringSchema.refine(
  value => BigInt(value) > 0n,
);

export const signedMinorUnitStringSchema = z
  .string()
  .regex(/^-?(0|[1-9]\d{0,99})$/)
  .refine(value => value !== '-0');
