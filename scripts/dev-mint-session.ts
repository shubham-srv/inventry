// DEV-ONLY helper: prints a signed demo session cookie value for a user email.
// Used for local smoke-testing authenticated routes with curl. Not for production.
import { SignJWT } from "jose"
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()
const email = process.argv[2] ?? "admin@demo.local"

const user = await prisma.user.findUniqueOrThrow({ where: { email } })
const secret = new TextEncoder().encode(
  process.env.SESSION_SECRET ?? "dev-only-insecure-secret"
)
const token = await new SignJWT({ userId: user.id })
  .setProtectedHeader({ alg: "HS256" })
  .setIssuedAt()
  .setExpirationTime("7d")
  .sign(secret)

console.log(token)
await prisma.$disconnect()
