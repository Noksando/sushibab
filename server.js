const fs = require("fs");
const path = require("path");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, "data", "store.json");

app.use(express.static(path.join(__dirname, "public")));

const defaultData = {
  stores: {
    "1호점": {
      "치킨바이트": 3,
      "연어": 8,
      "계란말이": 5
    },
    "2호점": {
      "치킨바이트": 6,
      "연어": 4,
      "계란말이": 7
    },
    "부엌": {
      "치킨바이트": 10,
      "연어": 15,
      "계란말이": 12
    }
  },
  openedBills: [
    {
      id: "bill-1",
      company: "동해식자재",
      receivedAt: "2026-03-05",
      amount: 180000,
      reference: ""
    }
  ],
  paidBills: [],
  notices: []
};

function normalizeState(rawData) {
  const next = rawData && typeof rawData === "object" ? rawData : {};
  if (!next.stores || typeof next.stores !== "object") {
    next.stores = structuredClone(defaultData.stores);
  }
  if (!Array.isArray(next.openedBills)) {
    next.openedBills = [];
  }
  if (!Array.isArray(next.paidBills)) {
    next.paidBills = [];
  }
  if (!Array.isArray(next.notices)) {
    next.notices = [];
  }
  next.paidBills = next.paidBills
    .filter((bill) => bill && typeof bill === "object")
    .sort((a, b) => String(b.paidAt || "").localeCompare(String(a.paidAt || "")))
    .slice(0, 10);
  next.notices = next.notices
    .filter((notice) => notice && typeof notice === "object")
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
    .slice(0, 30);
  return next;
}

function readData() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      fs.writeFileSync(DATA_FILE, JSON.stringify(defaultData, null, 2), "utf8");
      return structuredClone(defaultData);
    }
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    return normalizeState(JSON.parse(raw));
  } catch (error) {
    console.error("Failed to read data file:", error);
    return structuredClone(defaultData);
  }
}

function saveData(nextData) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(nextData, null, 2), "utf8");
}

let state = readData();

function broadcastState() {
  io.emit("state:update", state);
}

io.on("connection", (socket) => {
  socket.emit("state:update", state);

  socket.on("inventory:change", ({ storeName, itemName, delta }) => {
    if (!state.stores[storeName] || typeof state.stores[storeName][itemName] !== "number") {
      return;
    }
    const current = state.stores[storeName][itemName];
    const next = Math.max(0, current + delta);
    state.stores[storeName][itemName] = next;
    saveData(state);
    broadcastState();
  });

  socket.on("inventory:addItem", ({ storeName, itemName, quantity }) => {
    if (!storeName || !itemName || !Number.isInteger(quantity) || quantity < 0) {
      return;
    }
    if (!state.stores[storeName]) {
      state.stores[storeName] = {};
    }
    state.stores[storeName][itemName] = quantity;
    saveData(state);
    broadcastState();
  });

  socket.on("inventory:removeItem", ({ storeName, itemName }) => {
    if (!state.stores[storeName] || typeof state.stores[storeName][itemName] !== "number") {
      return;
    }
    delete state.stores[storeName][itemName];
    saveData(state);
    broadcastState();
  });

  socket.on("inventory:reorder", ({ storeName, fromIndex, toIndex }) => {
    if (!state.stores[storeName]) {
      return;
    }
    const entries = Object.entries(state.stores[storeName]);
    if (
      !Number.isInteger(fromIndex) ||
      !Number.isInteger(toIndex) ||
      fromIndex < 0 ||
      toIndex < 0 ||
      fromIndex >= entries.length ||
      toIndex >= entries.length ||
      fromIndex === toIndex
    ) {
      return;
    }

    const [moved] = entries.splice(fromIndex, 1);
    entries.splice(toIndex, 0, moved);
    state.stores[storeName] = Object.fromEntries(entries);
    saveData(state);
    broadcastState();
  });

  socket.on("bill:add", ({ company, receivedAt, amount, reference }) => {
    if (!company || !receivedAt || !Number.isFinite(amount) || amount < 0) {
      return;
    }
    const newBill = {
      id: `bill-${Date.now()}`,
      company,
      receivedAt,
      amount,
      reference: typeof reference === "string" ? reference.trim() : ""
    };
    state.openedBills.unshift(newBill);
    saveData(state);
    broadcastState();
  });

  socket.on("bill:remove", ({ id }) => {
    const target = state.openedBills.find((bill) => bill.id === id);
    if (!target) {
      return;
    }
    state.openedBills = state.openedBills.filter((bill) => bill.id !== id);
    state.paidBills.unshift({
      ...target,
      paidAt: new Date().toISOString()
    });
    state.paidBills = state.paidBills
      .sort((a, b) => String(b.paidAt || "").localeCompare(String(a.paidAt || "")))
      .slice(0, 10);
    saveData(state);
    broadcastState();
  });

  socket.on("bill:restore", ({ id }) => {
    const target = state.paidBills.find((bill) => bill.id === id);
    if (!target) {
      return;
    }
    state.paidBills = state.paidBills.filter((bill) => bill.id !== id);
    const { paidAt, ...restoredBill } = target;
    state.openedBills.unshift(restoredBill);
    saveData(state);
    broadcastState();
  });

  socket.on("bill:deletePaid", ({ id }) => {
    state.paidBills = state.paidBills.filter((bill) => bill.id !== id);
    saveData(state);
    broadcastState();
  });

  socket.on("notice:add", ({ storeName, content }) => {
    if (!storeName || typeof content !== "string") {
      return;
    }
    const trimmed = content.trim();
    if (!trimmed || trimmed.length > 120) {
      return;
    }
    state.notices.unshift({
      id: `notice-${Date.now()}`,
      storeName,
      content: trimmed,
      createdAt: new Date().toISOString()
    });
    state.notices = state.notices
      .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
      .slice(0, 30);
    saveData(state);
    broadcastState();
  });

  socket.on("notice:remove", ({ id }) => {
    state.notices = state.notices.filter((notice) => notice.id !== id);
    saveData(state);
    broadcastState();
  });
});

server.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
