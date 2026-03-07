const socket = io();

const storeTabsEl = document.getElementById("storeTabs");
const inventoryListEl = document.getElementById("inventoryList");
const billListEl = document.getElementById("billList");
const paidBillListEl = document.getElementById("paidBillList");

const addItemForm = document.getElementById("addItemForm");
const newItemName = document.getElementById("newItemName");
const newItemQty = document.getElementById("newItemQty");

const billForm = document.getElementById("billForm");
const billCompany = document.getElementById("billCompany");
const billDate = document.getElementById("billDate");
const billAmount = document.getElementById("billAmount");

let currentState = { stores: {}, openedBills: [], paidBills: [] };
let selectedStore = "";
let dragFromIndex = null;
let touchDragFromIndex = null;
let touchDropIndex = null;

function formatEUR(amount) {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR"
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

  items.forEach(([itemName, quantity], index) => {
    const row = document.createElement("div");
    row.className = "inventory-item";
    row.dataset.index = String(index);

    const dragHandle = document.createElement("button");
    dragHandle.className = "drag-handle";
    dragHandle.textContent = "☰";
    dragHandle.title = "드래그해서 순서 변경";
    dragHandle.draggable = true;
    dragHandle.addEventListener("dragstart", (event) => {
      dragFromIndex = index;
      row.classList.add("drag-source");
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", String(index));
      }
    });
    dragHandle.addEventListener("dragend", () => {
      dragFromIndex = null;
      row.classList.remove("drag-source");
      clearDragHighlights();
    });
    dragHandle.addEventListener("touchstart", () => {
      touchDragFromIndex = index;
      touchDropIndex = null;
      row.classList.add("drag-source");
    });
    dragHandle.addEventListener(
      "touchmove",
      (event) => {
        if (touchDragFromIndex === null) {
          return;
        }
        event.preventDefault();
        const touch = event.touches[0];
        if (!touch) {
          return;
        }
        clearDragHighlights();
        const target = document
          .elementFromPoint(touch.clientX, touch.clientY)
          ?.closest(".inventory-item");
        if (!target) {
          touchDropIndex = null;
          return;
        }
        target.classList.add("drag-over");
        const nextIndex = Number(target.dataset.index);
        touchDropIndex = Number.isInteger(nextIndex) ? nextIndex : null;
      },
      { passive: false }
    );
    dragHandle.addEventListener("touchend", () => {
      row.classList.remove("drag-source");
      clearDragHighlights();
      if (
        touchDragFromIndex !== null &&
        touchDropIndex !== null &&
        touchDragFromIndex !== touchDropIndex
      ) {
        socket.emit("inventory:reorder", {
          storeName: selectedStore,
          fromIndex: touchDragFromIndex,
          toIndex: touchDropIndex
        });
      }
      touchDragFromIndex = null;
      touchDropIndex = null;
    });
    dragHandle.addEventListener("touchcancel", () => {
      row.classList.remove("drag-source");
      clearDragHighlights();
      touchDragFromIndex = null;
      touchDropIndex = null;
    });

    const name = document.createElement("div");
    name.textContent = `${itemName}`;
    name.className = "item-name";

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

    const remove = document.createElement("button");
    remove.className = "item-remove";
    remove.textContent = "삭제";
    remove.addEventListener("click", () => {
      const ok = window.confirm(`'${itemName}' 항목을 삭제할까요?`);
      if (!ok) {
        return;
      }
      socket.emit("inventory:removeItem", { storeName: selectedStore, itemName });
    });

    row.addEventListener("dragover", (event) => {
      if (dragFromIndex === null) {
        return;
      }
      event.preventDefault();
      row.classList.add("drag-over");
    });

    row.addEventListener("dragleave", () => {
      row.classList.remove("drag-over");
    });

    row.addEventListener("drop", (event) => {
      if (dragFromIndex === null) {
        return;
      }
      event.preventDefault();
      row.classList.remove("drag-over");
      if (dragFromIndex === index) {
        return;
      }
      socket.emit("inventory:reorder", {
        storeName: selectedStore,
        fromIndex: dragFromIndex,
        toIndex: index
      });
    });

    controls.append(minus, qty, plus, remove);
    row.append(dragHandle, name, controls);
    inventoryListEl.appendChild(row);
  });
}

function clearDragHighlights() {
  document.querySelectorAll(".inventory-item.drag-over").forEach((el) => {
    el.classList.remove("drag-over");
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
      <div>금액: ${formatEUR(bill.amount)}</div>
    `;
    li.querySelector(".bill-remove").addEventListener("click", () => {
      socket.emit("bill:remove", { id: bill.id });
    });
    billListEl.appendChild(li);
  });
}

function formatDateTime(dateLike) {
  if (!dateLike) {
    return "-";
  }
  const date = new Date(dateLike);
  if (Number.isNaN(date.getTime())) {
    return String(dateLike);
  }
  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(date);
}

function renderPaidBills() {
  paidBillListEl.innerHTML = "";
  const paidBills = Array.isArray(currentState.paidBills) ? currentState.paidBills : [];

  if (paidBills.length === 0) {
    paidBillListEl.innerHTML = "<li>결제 완료 히스토리가 없습니다.</li>";
    return;
  }

  paidBills.forEach((bill) => {
    const li = document.createElement("li");
    li.className = "bill-item";
    li.innerHTML = `
      <div class="bill-top">
        <strong>${bill.company}</strong>
        <span class="paid-tag">결제완료</span>
      </div>
      <div>수령일: ${bill.receivedAt}</div>
      <div>금액: ${formatEUR(bill.amount)}</div>
      <div>결제일시: ${formatDateTime(bill.paidAt)}</div>
      <div class="bill-actions">
        <button class="bill-restore">되돌리기</button>
        <button class="bill-delete-history">기록에서 삭제</button>
      </div>
    `;
    li.querySelector(".bill-restore").addEventListener("click", () => {
      socket.emit("bill:restore", { id: bill.id });
    });
    li.querySelector(".bill-delete-history").addEventListener("click", () => {
      socket.emit("bill:deletePaid", { id: bill.id });
    });
    paidBillListEl.appendChild(li);
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
  renderPaidBills();
});
