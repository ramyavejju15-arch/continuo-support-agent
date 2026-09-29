// seed.js
// Loads synthetic customer + ticket history into Hindsight so the agent
// has "memory" to recall from on its very first real conversation.
//
// Run with: npm run seed

require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { HindsightClient } = require("@vectorize-io/hindsight-client");

const client = new HindsightClient({
  baseUrl: process.env.HINDSIGHT_BASE_URL,
  apiKey: process.env.HINDSIGHT_API_KEY,
});

async function seed() {
  const customers = JSON.parse(
    fs.readFileSync(path.join(__dirname, "data", "customers.json"), "utf-8")
  );

  for (const customer of customers) {
    const bankId = customer.id; // one memory bank per customer

    console.log(`\nSeeding memory bank: ${bankId} (${customer.name})`);

    // Store profile facts
    await client.retain(
      bankId,
      `${customer.name} is on the ${customer.plan} plan. Environment: ${customer.environment}. Communication style: ${customer.style}.`,
      { context: "customer profile" }
    );

    // Store each past ticket as its own memory, with its real date
    for (const ticket of customer.tickets) {
      await client.retain(
        bankId,
        `Support ticket: ${ticket.issue}. Resolution: ${ticket.resolution}.`,
        { context: "past support ticket", timestamp: ticket.date }
      );
      console.log(`  - retained ticket from ${ticket.date}`);
    }
  }

  console.log("\nSeeding complete. Memory banks ready:");
  customers.forEach((c) => console.log(`  - ${c.id} (${c.name})`));
}

seed().catch((err) => {
  console.error("Seeding failed:", err);
  process.exit(1);
});
