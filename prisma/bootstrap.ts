import { PrismaClient } from "@prisma/client"
import { ROLES } from "../lib/constants"

/**
 * Idempotent production bootstrap — SAFE to run on every deploy.
 *
 * Unlike prisma/seed.ts (which WIPES the database for the local demo), this only
 * *ensures* the reference roles and a single first admin exist, using upserts.
 * Run it once after `prisma migrate deploy` (e.g. as a pipeline step):
 *
 *   BOOTSTRAP_ADMIN_EMAIL=admin@client.com \
 *   BOOTSTRAP_ADMIN_FIRST_NAME=Jane \
 *   BOOTSTRAP_ADMIN_LAST_NAME=Doe \
 *   npm run db:bootstrap
 *
 * The admin signs in via Entra (Microsoft login) — no password is stored here.
 * The email is a pre-authorization, not a credential: only the person who can
 * authenticate as that Entra identity can actually use it (see docs §10a).
 */
const prisma = new PrismaClient()

const ROLE_DEFS = [
  { roleName: ROLES.SUPER_ADMIN, description: "Full access incl. settings" },
  { roleName: ROLES.INTERNAL_ADMIN, description: "Admin incl. onboarding & settings" },
  { roleName: ROLES.EDITOR, description: "Master data, no onboarding/settings" },
  { roleName: ROLES.GROWER_USER, description: "On-field grower inventory user" },
  { roleName: ROLES.VENDOR_USER, description: "Vendor supply reporting user" },
]

async function main() {
  // 1. Reference roles — upsert on the (now unique) roleName so this never duplicates.
  console.log("Ensuring roles…")
  for (const r of ROLE_DEFS) {
    await prisma.role.upsert({
      where: { roleName: r.roleName },
      update: { description: r.description },
      create: r,
    })
  }

  // 2. First admin — provisioned by email, authenticates via Entra (no password).
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase()
  if (!email) {
    console.log("BOOTSTRAP_ADMIN_EMAIL not set — roles ensured, skipping admin.")
    return
  }
  const firstName = process.env.BOOTSTRAP_ADMIN_FIRST_NAME?.trim() || "System"
  const lastName = process.env.BOOTSTRAP_ADMIN_LAST_NAME?.trim() || "Admin"

  const superAdmin = await prisma.role.findUniqueOrThrow({
    where: { roleName: ROLES.SUPER_ADMIN },
  })

  const user = await prisma.user.upsert({
    where: { email },
    // Never clobber an existing user — role/active state stays admin-controlled
    // once the app is live. This only creates the very first admin.
    update: {},
    create: {
      email,
      firstName,
      lastName,
      roleId: superAdmin.id,
      isActive: true,
    },
  })
  console.log(`Bootstrap admin ready: ${user.email} (id ${user.id}, SuperAdmin).`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
