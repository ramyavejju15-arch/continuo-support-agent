// ---------- Small helpers ----------
const avatarColors = ["#5B5FEF", "#FF6B6A", "#14B8A6", "#FFB627"];
function colorForIndex(i) {
  return avatarColors[i % avatarColors.length];
}
function initials(name) {
  return name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

// ---------- View switching (sidebar nav) ----------
const navItems = document.querySelectorAll(".nav-item");
const views = document.querySelectorAll(".view");

navItems.forEach((btn) => {
  btn.addEventListener("click", () => {
    navItems.forEach((b) => b.classList.remove("active"));
    views.forEach((v) => v.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(`view-${btn.dataset.view}`).classList.add("active");
  });
});

// ---------- Shared: fetch customer list once ----------
let customersCache = [];

async function fetchCustomers() {
  const res = await fetch("/api/customers");
  customersCache = await res.json();
  return customersCache;
}

// ---------- DASHBOARD ----------
async function loadDashboard() {
  const [statsRes, customers] = await Promise.all([
    fetch("/api/dashboard-stats").then((r) => r.json()),
    customersCache.length ? Promise.resolve(customersCache) : fetchCustomers(),
  ]);

  document.getElementById("statCustomers").textContent = statsRes.totalCustomers;
  document.getElementById("statTickets").textContent = statsRes.totalTickets;
  document.getElementById("statBanks").textContent = statsRes.memoryBanks;

  const grid = document.getElementById("customerGrid");
  grid.innerHTML = customers
    .map((c, i) => {
      const color = colorForIndex(i);
      return `
        <div class="customer-card">
          <div class="customer-card-top">
            <div class="avatar" style="background:${color}">${initials(c.name)}</div>
            <div>
              <div class="customer-name">${c.name}</div>
              <div class="customer-plan">${c.plan}</div>
            </div>
          </div>
          <div class="customer-meta">${c.environment}</div>
          <div class="badge-row">
            <span class="badge badge-indigo">${c.ticketCount} past tickets</span>
            ${c.lastTicketDate ? `<span class="badge badge-teal">last: ${c.lastTicketDate}</span>` : ""}
          </div>
        </div>`;
    })
    .join("");
}

// ---------- CONVERSATIONS ----------
const customerSelect = document.getElementById("customerSelect");
const messagesEl = document.getElementById("messages");
const memoryListEl = document.getElementById("memoryList");
const chatForm = document.getElementById("chatForm");
const messageInput = document.getElementById("messageInput");

async function populateCustomerSelect(selectEl) {
  const customers = customersCache.length ? customersCache : await fetchCustomers();
  selectEl.innerHTML = customers
    .map((c) => `<option value="${c.id}">${c.name} — ${c.plan}</option>`)
    .join("");
}

function addMessage(text, who) {
  const div = document.createElement("div");
  div.className = `msg ${who}`;
  div.innerHTML = `<span class="who">${who === "customer" ? "Customer" : "Agent"}</span>${text}`;
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function renderMemories(memories) {
  if (!memories || memories.length === 0) {
    memoryListEl.innerHTML = `<p class="memory-empty">No prior memory found for this message — this is new ground for the agent.</p>`;
    return;
  }
  memoryListEl.innerHTML = memories
    .map((m) => `<div class="memory-item">${m}</div>`)
    .join("");
}

chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const message = messageInput.value.trim();
  if (!message) return;

  const customerId = customerSelect.value;
  addMessage(message, "customer");
  messageInput.value = "";

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customerId, message }),
    });
    const data = await res.json();

    if (data.error) {
      addMessage(`Error: ${data.error}`, "agent");
      return;
    }

    addMessage(data.reply, "agent");
    renderMemories(data.recalledMemories);
  } catch (err) {
    addMessage(`Network error: ${err.message}`, "agent");
  }
});

// ---------- MEMORY EXPLORER ----------
const explorerSelect = document.getElementById("explorerSelect");
const timelineEl = document.getElementById("timeline");

async function loadTimeline(customerId) {
  timelineEl.innerHTML = `<p class="memory-empty">Loading memory…</p>`;
  try {
    const res = await fetch(`/api/memory/${customerId}`);
    const data = await res.json();

    if (!data.memories || data.memories.length === 0) {
      timelineEl.innerHTML = `<p class="memory-empty">No memory stored yet for this customer.</p>`;
      return;
    }

    timelineEl.innerHTML = data.memories
      .map(
        (m) => `
        <div class="timeline-item">
          <span class="timeline-dot"></span>
          <div class="timeline-card">
            ${m.date ? `<div class="timeline-date">${m.date}</div>` : ""}
            ${m.text}
          </div>
        </div>`
      )
      .join("");
  } catch (err) {
    timelineEl.innerHTML = `<p class="memory-empty">Error loading memory: ${err.message}</p>`;
  }
}

explorerSelect.addEventListener("change", () => {
  loadTimeline(explorerSelect.value);
});

// ---------- Boot ----------
(async function init() {
  await fetchCustomers();
  await loadDashboard();
  await populateCustomerSelect(customerSelect);
  await populateCustomerSelect(explorerSelect);
  if (explorerSelect.value) loadTimeline(explorerSelect.value);
})();
