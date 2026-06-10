import { z } from 'zod';

const accountNameSchema = z.string().trim().min(1).max(32).regex(/^[A-Za-z0-9_-]+$/, 'Account name can contain letters, numbers, _ and - only');
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must use YYYY-MM-DD');
const leftSecondsSchema = z.coerce.number().int().min(0);
const optionalPasswordSchema = z.string().trim().min(1).max(64).optional();

export const listGameAccountsQuerySchema = z.object({
  search: z.string().trim().default(''),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).default(10).catch(10).transform((value) => Math.min(value, 100))
});

export const createGameAccountSchema = z.object({
  accountName: accountNameSchema,
  password: z.string().trim().min(1).max(64),
  secondaryPassword: z.string().trim().min(1).max(64),
  expiresAt: dateSchema,
  leftSeconds: leftSecondsSchema
});

export const updateGameAccountSchema = z.object({
  password: optionalPasswordSchema,
  secondaryPassword: optionalPasswordSchema,
  expiresAt: dateSchema,
  leftSeconds: leftSecondsSchema
});

export type ListGameAccountsQuery = z.infer<typeof listGameAccountsQuerySchema>;
export type CreateGameAccountRequest = z.infer<typeof createGameAccountSchema>;
export type UpdateGameAccountRequest = z.infer<typeof updateGameAccountSchema>;

export type GameAccountView = {
  accountName: string;
  expiresAt: string | null;
  leftSeconds: number | null;
  usedSeconds: number | null;
  status: 'active' | 'banned';
};

export type GameAccountListResponse = {
  items: GameAccountView[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};
