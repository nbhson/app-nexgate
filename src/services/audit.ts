import { desc, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { auditLogs, admins } from "../db/schema.js";
import { getAdminByUsername } from "../db/seed.js";

/**
 * Ghi audit log cho hành động admin. Không bao giờ ném lỗi ra ngoài —
 * audit fail không được làm fail nghiệp vụ chính.
 */
export function recordAudit(adminUsername: string | undefined, action: string, target?: string, ip?: string): void {
  try {
    let adminId: number | null = null;
    if (adminUsername) {
      const row = db.select({ id: admins.id }).from(admins).where(eq(admins.username, adminUsername)).get();
      adminId = row?.id ?? null;
    }
    db.insert(auditLogs).values({ adminId, action, target: target ?? null, ip: ip ?? null, createdAt: Date.now() }).run();
  } catch {
    /* swallow — audit là best-effort */
  }
}

export function listAuditLogs(limit = 100, offset = 0) {
  const rows = db
    .select({
      id: auditLogs.id,
      action: auditLogs.action,
      target: auditLogs.target,
      ip: auditLogs.ip,
      createdAt: auditLogs.createdAt,
      username: admins.username,
    })
    .from(auditLogs)
    .leftJoin(admins, eq(auditLogs.adminId, admins.id))
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit)
    .offset(offset)
    .all();
  return rows;
}
