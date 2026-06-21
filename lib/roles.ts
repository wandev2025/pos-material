// Role hierarchy helpers. Rank: SUPERADMIN(4) > OWNER(3) > ADMIN(2) > STAFF(1).
import type { Role } from './ProfileContext';

const RANK: Record<Role, number> = { SUPERADMIN: 4, OWNER: 3, ADMIN: 2, STAFF: 1 };

export const roleRank = (role?: Role | null): number => (role ? (RANK[role] ?? 0) : 0);

// True when `role` is `tier` or higher in the hierarchy (e.g. atLeast(role, 'ADMIN')).
export const atLeast = (role: Role | null | undefined, tier: Role): boolean => roleRank(role) >= RANK[tier];
