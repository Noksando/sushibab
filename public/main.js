const socket = io();

const storeTabsEl = document.getElementById("storeTabs");
const inventoryListEl = document.getElementById("inventoryList");
const billListEl = document.getElementById("billList");

const addItemForm = document.getElementById("addItemForm");
const newItemName = document.getElementById("newItemName");
const newItemQty = document.getElementById("newItemQty");

const billForm = document.getElementById("billForm");
const billCompany = document.getElementById("billCompany");
const billDate = document.getElementById("billDate");
const billAmount = document.getElementById("billAmount");

let currentState = { stores: {}, openedBills: [] };
let selectedStore = "";

function formatKRW(amount) {
  return new Intl.NumberFormat("ko-KR", {
    style: "currency",
    currency: "KRW"
  }).format(amount);
}

function renderStoreTabs() {
  const storeNames = Object.keys(currentState.stores);
  if (!selectedStore && storeNames.length > 0) {
    selectedStore = storeNames[0];
  }
  if (!storeNames.includes(selectedStore) && storeNames.length > 0) {
    selectedStore = storeNames[0];
  }

  storeTabsEl.innerHTML = "";
  storeNames.forEach((storeName) => {
    const btn = document.createElement("button");
    btn.className = `tab-btn ${selectedStore === storeName ? "active" : ""}`;
    btn.textContent = storeName;
    btn.addEventListener("click", () => {
      selectedStore = storeName;
      renderInventory();
      renderStoreTabs();
    });
    storeTabsEl.appendChild(btn);
  });
}

function renderInventory() {
  inventoryListEl.innerHTML = "";
  const inventory = currentState.stores[selectedStore] || {};
  const items = Object.entries(inventory);

  if (items.length === 0) {
    inventoryListEl.innerHTML = "<p>등록된 재고가 없습니다.</p>";
    return;
  }

  items.forEach(([itemName, quantity]) => {
    const row = document.createElement("div");
    row.className = "inventory-item";

    const name = document.createElement("div");
    name.textContent = `${itemName}`;

    const controls = document.createElement("div");
    controls.className = "qty-controls";

    const minus = document.createElement("button");
    minus.textContent = "-";
    minus.addEventListener("click", () => {
      socket.emit("inventory:change", { storeName: selectedStore, itemName, delta: -1 });
    });

    const qty = document.createElement("strong");
    qty.textContent = `${quantity}개`;

    const plus = document.createElement("button");
    plus.textContent = "+";
    plus.addEventListener("click", () => {
      socket.emit("inventory:change", { storeName: selectedStore, itemName, delta: 1 });
    });

    controls.append(minus, qty, plus);
    row.append(name, controls);
    inventoryListEl.appendChild(row);
  });
}

function renderBills() {
  billListEl.innerHTML = "";

  if (currentState.openedBills.length === 0) {
    billListEl.innerHTML = "<li>미결제 영수증이 없습니다.</li>";
    return;
  }

  currentState.openedBills.forEach((bill) => {
    const li = document.createElement("li");
    li.className = "bill-item";
    li.innerHTML = `
      <div class="bill-top">
        <strong>${bill.company}</strong>
        <button class="bill-remove">결제완료</button>
      </div>
      <div>수령일: ${bill.receivedAt}</div>
      <div>금액: ${formatKRW(bill.amount)}</div>
    `;
    li.querySelector(".bill-remove").addEventListener("click", () => {
      socket.emit("bill:remove", { id: bill.id });
    });
    billListEl.appendChild(li);
  });
}

addItemForm.addEventListener("submit", (event) => {
  event.preventDefault();
  socket.emit("inventory:addItem", {
    storeName: selectedStore,
    itemName: newItemName.value.trim(),
    quantity: Number(newItemQty.value)
  });
  addItemForm.reset();
});

billForm.addEventListener("submit", (event) => {
  event.preventDefault();
  socket.emit("bill:add", {
    company: billCompany.value.trim(),
    receivedAt: billDate.value,
    amount: Number(billAmount.value)
  });
  billForm.reset();
});

socket.on("state:update", (state) => {
  currentState = state;
  renderStoreTabs();
  renderInventory();
  renderBills();
});
