// Standalone reminder runner — mirrors what the Azure Timer Function does.
//   npm run reminders
async function main() {
  // Load .env into process.env (Node 20.12+) so DATABASE_URL is available.
  try {
    ;(process as unknown as { loadEnvFile?: (p?: string) => void }).loadEnvFile?.()
  } catch {
    // ok if env already provided by the environment
  }

  const { runReminderCheck } = await import("../lib/scheduler/reminders")
  const result = await runReminderCheck()

  console.log("Reminder check complete.")
  console.log(`  Growers checked:   ${result.checked}`)
  console.log(`  Reminders created: ${result.remindersCreated}`)
  for (const m of result.messages) console.log(`   - ${m}`)

  const { prisma } = await import("../lib/db")
  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
