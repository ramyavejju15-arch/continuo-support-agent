// server.js
// Core backend for the AI Customer Support Agent.
//
// Flow for every incoming message:
//   1. RECALL relevant memories about this customer from Hindsight
//   2. Build a prompt that includes those memories as context
//   3. Call the LLM (Groq) for a reply
//   4. RETAIN a new memory summarizing what happened in this exchange
//   5. Return both the reply AND the recalled memories (so the UI can show them)

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");
const fs = require("fs");
const path = require("path");
const { HindsightClient } = require("@vectorize-io/hindsight-client");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const hindsight = new HindsightClient({
  baseUrl: process.env.HINDSIGHT_BASE_URL,
  apiKey: process.env.HINDSIGHT_API_KEY,
});

const GROQ_MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-120b";

// ---- Helper: read the synthetic customer dataset ----
function loadCustomers() {
  return JSON.parse(
    fs.readFileSync(path.join(__dirname, "data", "customers.json"), "utf-8")
  );
}

// ---- List customers (for the dropdown + dashboard cards) ----
app.get("/api/customers", (req, res) => {
  const customers = loadCustomers();
  res.json(
    customers.map((c) => ({
      id: c.id,
      name: c.name,
      plan: c.plan,
      environment: c.environment,
      style: c.style,
      ticketCount: c.tickets.length,
      lastTicketDate: c.tickets.length
        ? c.tickets[c.tickets.length - 1].date
        : null,
    }))
  );
});

// ---- Dashboard summary stats ----
app.get("/api/dashboard-stats", (req, res) => {
  const customers = loadCustomers();
  const totalTickets = customers.reduce((sum, c) => sum + c.tickets.length, 0);
  res.json({
    totalCustomers: customers.length,
    totalTickets,
    memoryBanks: customers.length, // one Hindsight bank per customer
  });
});

// ---- Memory Explorer: pull everything Hindsight knows about one customer ----
app.get("/api/memory/:customerId", async (req, res) => {
  const { customerId } = req.params;
  try {
    const recall = await hindsight.recall(
      customerId,
      "full profile, environment, communication style, and complete support history"
    );
    const memories = (recall.results || []).map((m) => ({
      text: m.text || m.content,
      date: m.timestamp || m.date || null,
    }));
    res.json({ customerId, memories });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ---- Helper: call Groq's OpenAI-compatible chat completion endpoint ----
async function callGroq(systemPrompt, userMessage) {
  const response = await fetch(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        temperature: 0.4,
      }),
    }
  );

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Groq API error (${response.status}): ${errText}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

// ---- Main chat endpoint ----
app.post("/api/chat", async (req, res) => {
  const { customerId, message } = req.body;

  if (!customerId || !message) {
    return res.status(400).json({ error: "customerId and message are required" });
  }

  try {
    // 1. RECALL — pull relevant memories for this customer
    const recall = await hindsight.recall(customerId, message);
    const memories = (recall.results || []).map((m) => m.text || m.content);

    // 2. Build context-aware system prompt
    const systemPrompt = `You are a customer support agent for a SaaS product.
Use the customer's memory below to personalize your response.
If the memory shows a past issue related to the current message, reference it naturally
instead of asking the customer to repeat themselves. Match the customer's communication
style implied by the memory (technical vs non-technical, tone, etc).

Known memory about this customer:
${memories.length ? memories.map((m, i) => `${i + 1}. ${m}`).join("\n") : "(no prior memory yet - this is a new customer)"}

Respond concisely and helpfully.`;

    // 3. Call the LLM
    const reply = await callGroq(systemPrompt, message);

    // 4. RETAIN — store this exchange as a new memory for future recall
    await hindsight.retain(
      customerId,
      `Customer said: "${message}". Agent replied: "${reply}".`,
      { context: "live support chat" }
    );

    // 5. Return reply + the memories that were used (so UI can visualize them)
    res.json({ reply, recalledMemories: memories });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Support agent running at http://localhost:${PORT}`);
});
