
const API = "http://localhost:8080/api";

const $ = (selector) => document.querySelector(selector);

let groceryItems = [];
let groceryLists = [];
let selectedListId = null;
let noticeTimer;

function money(value) {
    return new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR"
    }).format(Number(value) || 0);
}

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[character]);
}

function showNotice(message, type = "success") {
    const notice = $("#notice");
    notice.textContent = message;
    notice.className = `notice ${type}`;

    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => {
        notice.classList.add("hidden");
    }, 4000);
}

async function apiRequest(endpoint, options = {}) {
    let response;

    try {
        response = await fetch(`${API}${endpoint}`, {
            ...options,
            headers: {
                ...(options.headers || {})
            }
        });
    } catch {
        $("#connection-status").textContent = "Backend unavailable";
        $(".status-dot").className = "status-dot offline";
        throw new Error(
            "Cannot connect to the Java API. Make sure GroceryApiServer is running on port 8080."
        );
    }

    if (!response.ok) {
        let message = `Request failed (${response.status})`;

        try {
            const body = await response.json();
            message = body.error || body.message || message;
        } catch {
            // Keep the default error message.
        }

        throw new Error(message);
    }

    const content = await response.text();
    return content ? JSON.parse(content) : null;
}

function formBody(form) {
    return new URLSearchParams(new FormData(form)).toString();
}

async function submitForm(form, endpoint, successMessage, refresh) {
    try {
        await apiRequest(endpoint, {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8"
            },
            body: formBody(form)
        });

        form.reset();
        showNotice(successMessage);
        await refresh();
    } catch (error) {
        showNotice(error.message, "error");
    }
}

function setPage(page) {
    document.querySelectorAll(".page").forEach(section => {
        section.classList.toggle("hidden", section.id !== `${page}-page`);
    });

    document.querySelectorAll(".nav-link").forEach(button => {
        button.classList.toggle("active", button.dataset.page === page);
    });

    const titles = {
        dashboard: "Dashboard",
        lists: "Grocery Lists",
        items: "Grocery Items",
        history: "Shopping History"
    };

    $("#page-title").textContent = titles[page] || "Dashboard";

    if (page === "lists") {
        loadLists().catch(error => showNotice(error.message, "error"));
        loadItems().catch(error => showNotice(error.message, "error"));
    }

    if (page === "items") {
        loadItems().catch(error => showNotice(error.message, "error"));
    }

    if (page === "history") {
        loadLists().catch(error => showNotice(error.message, "error"));
        loadTrips().catch(error => showNotice(error.message, "error"));
    }
}

document.querySelectorAll(".nav-link").forEach(button => {
    button.addEventListener("click", () => setPage(button.dataset.page));
});

document.querySelectorAll("[data-go]").forEach(button => {
    button.addEventListener("click", () => setPage(button.dataset.go));
});

function renderLists(containerSelector) {
    const container = $(containerSelector);

    if (!groceryLists.length) {
        container.innerHTML =
            '<div class="panel"><p class="empty">No grocery lists yet. Create your first list above.</p></div>';
        return;
    }

    container.innerHTML = groceryLists.map(list => {
        const budget = Number(list.budget) || 0;
        const estimated = Number(list.estimated_cost) || 0;
        const percent = budget > 0 ? Math.min(estimated / budget * 100, 100) : 0;
        const overBudget = estimated > budget;

        return `
            <article class="list-card">
                <div class="list-card-top">
                    <div>
                        <h3>${escapeHTML(list.list_name)}</h3>
                        <span class="list-id">List #${list.list_id}</span>
                    </div>
                    <span class="list-emoji">🧺</span>
                </div>

                <div class="budget-labels">
                    <span>Estimated list cost</span>
                    <strong>${money(estimated)}</strong>
                </div>

                <div class="progress">
                    <div class="progress-fill ${overBudget ? "over" : ""}"
                         style="width:${percent}%"></div>
                </div>

                <div class="budget-labels">
                    <span>Budget: ${money(budget)}</span>
                    <strong>${overBudget
                        ? `${money(estimated - budget)} over`
                        : `${money(budget - estimated)} left`}</strong>
                </div>

                <div class="list-card-bottom">
                    <div>
                        <div class="cost">${money(estimated)}</div>
                        <div class="muted">Estimated total</div>
                    </div>
                    <button class="secondary-btn open-list"
                            data-list-id="${list.list_id}">
                        View items →
                    </button>
                </div>
            </article>`;
    }).join("");

    container.querySelectorAll(".open-list").forEach(button => {
        button.addEventListener("click", async () => {
            selectedListId = Number(button.dataset.listId);
            $("#list-select").value = String(selectedListId);
            $("#selected-list-title").textContent =
                groceryLists.find(list => list.list_id === selectedListId)?.list_name
                || "Grocery list";
            setPage("lists");
            $("#list-select").value = String(selectedListId);
            await loadListItems();
            $("#list-detail-panel").scrollIntoView({
                behavior: "smooth",
                block: "start"
            });
        });
    });
}

async function loadDashboard() {
    const data = await apiRequest("/dashboard");

    $("#stat-items").textContent = data.item_count;
    $("#stat-lists").textContent = data.list_count;
    $("#stat-pending").textContent = money(data.pending_cost);
    $("#stat-spent").textContent = money(data.total_spent);

    $("#connection-status").textContent = "Connected to MySQL";
    $(".status-dot").className = "status-dot online";

    await loadLists();
    renderLists("#dashboard-lists");
}

async function loadItems() {
    groceryItems = await apiRequest("/items");

    $("#items-body").innerHTML = groceryItems.length
        ? groceryItems.map(item => `
            <tr>
                <td>${item.item_id}</td>
                <td><strong>${escapeHTML(item.item_name)}</strong></td>
                <td>${escapeHTML(item.category || "Uncategorized")}</td>
                <td>${money(item.price)}</td>
            </tr>
        `).join("")
        : '<tr><td colspan="4" class="empty">No grocery items found.</td></tr>';

    $("#item-select").innerHTML = groceryItems.map(item => `
        <option value="${item.item_id}">
            ${escapeHTML(item.item_name)} — ${money(item.price)}
        </option>
    `).join("");

    if (!groceryItems.length) {
        $("#item-select").innerHTML = '<option value="">Add a grocery item first</option>';
    }
}

async function loadLists() {
    groceryLists = await apiRequest("/lists");

    const options = groceryLists.map(list => `
        <option value="${list.list_id}">
            ${escapeHTML(list.list_name)}
        </option>
    `).join("");

    $("#list-select").innerHTML =
        options || '<option value="">Create a grocery list first</option>';

    $("#trip-list-select").innerHTML =
        options || '<option value="">Create a grocery list first</option>';

    if (selectedListId && groceryLists.some(
        list => list.list_id === selectedListId
    )) {
        $("#list-select").value = String(selectedListId);
    } else if (groceryLists.length) {
        selectedListId = groceryLists[0].list_id;
        $("#list-select").value = String(selectedListId);
    } else {
        selectedListId = null;
    }

    renderLists("#all-lists");

    if (selectedListId) {
        const current = groceryLists.find(
            list => list.list_id === selectedListId
        );
        $("#selected-list-title").textContent = current.list_name;
        $("#selected-list-subtitle").textContent =
            `Budget: ${money(current.budget)} · Estimated cost: ${money(current.estimated_cost)}`;
    } else {
        $("#selected-list-title").textContent = "No grocery lists yet";
        $("#selected-list-subtitle").textContent = "Create a list to get started.";
        $("#list-items-body").innerHTML =
            '<tr><td colspan="6" class="empty">Create a grocery list first.</td></tr>';
    }
}

async function loadListItems() {
    if (!selectedListId) return;

    const items = await apiRequest(`/lists/${selectedListId}/items`);

    $("#list-items-body").innerHTML = items.length
        ? items.map(item => {
            const purchased = item.is_purchased === "Yes";

            return `
                <tr>
                    <td><strong>${escapeHTML(item.item_name)}</strong></td>
                    <td>${money(item.price)}</td>
                    <td>${item.quantity}</td>
                    <td>${money(item.line_total)}</td>
                    <td><span class="pill ${purchased ? "yes" : "no"}">
                        ${purchased ? "Purchased" : "Pending"}
                    </span></td>
                    <td>
                        <button class="small-btn mark-purchased"
                            data-id="${item.list_item_id}"
                            ${purchased ? "disabled" : ""}>
                            ${purchased ? "Completed ✓" : "Mark done"}
                        </button>
                    </td>
                </tr>`;
        }).join("")
        : '<tr><td colspan="6" class="empty">This list has no items yet.</td></tr>';

    $("#list-items-body").querySelectorAll(".mark-purchased").forEach(button => {
        button.addEventListener("click", async () => {
            try {
                await apiRequest("/purchase", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8"
                    },
                    body: new URLSearchParams({
                        list_item_id: button.dataset.id
                    }).toString()
                });

                showNotice("Item marked as purchased!");
                await loadListItems();
                await loadDashboard();
                await loadLists();
                await loadListItems();
            } catch (error) {
                showNotice(error.message, "error");
            }
        });
    });
}

async function loadTrips() {
    const trips = await apiRequest("/trips");

    $("#trips-body").innerHTML = trips.length
        ? trips.map(trip => `
            <tr>
                <td>${trip.trip_id}</td>
                <td>${escapeHTML(trip.list_name)}</td>
                <td>${escapeHTML(trip.trip_date)}</td>
                <td><strong>${money(trip.total_spent)}</strong></td>
            </tr>
        `).join("")
        : '<tr><td colspan="4" class="empty">No shopping trips recorded yet.</td></tr>';
}

$("#create-item-form").addEventListener("submit", async event => {
    event.preventDefault();
    await submitForm(event.target, "/items", "Grocery item added successfully!", async () => {
        await loadItems();
        await loadLists();
        await loadDashboard();
    });
});

$("#create-list-form").addEventListener("submit", async event => {
    event.preventDefault();
    await submitForm(event.target, "/lists", "Grocery list created successfully!", async () => {
        await loadLists();
        await loadDashboard();
    });
});

$("#add-to-list-form").addEventListener("submit", async event => {
    event.preventDefault();

    if (!selectedListId) {
        showNotice("Create a grocery list first.", "error");
        return;
    }

    await submitForm(event.target, "/list-items", "Item added to your list!", async () => {
        await loadLists();
        await loadListItems();
        await loadDashboard();
    });
});

$("#trip-form").addEventListener("submit", async event => {
    event.preventDefault();
    await submitForm(event.target, "/trips", "Shopping trip recorded!", async () => {
        await loadTrips();
        await loadDashboard();
    });
});

$("#list-select").addEventListener("change", async event => {
    selectedListId = Number(event.target.value) || null;
    await loadLists();
    await loadListItems();
});

$("#refresh-list-btn").addEventListener("click", async () => {
    try {
        await loadLists();
        await loadListItems();
        showNotice("Grocery list refreshed.");
    } catch (error) {
        showNotice(error.message, "error");
    }
});

$("#refresh-items-btn").addEventListener("click", async () => {
    try {
        await loadItems();
        showNotice("Grocery items refreshed.");
    } catch (error) {
        showNotice(error.message, "error");
    }
});

$("#trip-date").value = new Date().toLocaleDateString("en-CA");

async function initializeApp() {
    try {
        await loadItems();
        await loadLists();
        await loadDashboard();
        await loadListItems();
        await loadTrips();
    } catch (error) {
        $("#connection-status").textContent = "Connection failed";
        $(".status-dot").className = "status-dot offline";
        showNotice(error.message, "error");
    }
}

initializeApp();