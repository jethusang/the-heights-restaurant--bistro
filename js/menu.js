const CART_KEY = 'thandzin_cart';

function saveCartToStorage(cart) {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
}

function loadCartFromStorage() {
    const cartData = localStorage.getItem(CART_KEY);
    return cartData ? JSON.parse(cartData) : [];
}

function clearCartStorage() {
    localStorage.removeItem(CART_KEY);
}

let menuData = [];
let cart = loadCartFromStorage();
const cartButton = document.getElementById('cartButton');
const cartCount = document.getElementById('cartCount');
const finishOrderBtn = document.getElementById('finishOrderBtn');
const orderModal = document.getElementById('orderModal');
const orderDetailsModal = document.getElementById('orderDetailsModal');
const orderItemsContainer = document.getElementById('orderItemsContainer');
const orderTotal = document.getElementById('orderTotal');
const nextToDetailsBtn = document.getElementById('nextToDetailsBtn');
const closeModalBtn = document.getElementById('closeModalBtn');
const sendOrderBtn = document.getElementById('sendOrderBtn');
const backToSummaryBtn = document.getElementById('backToSummaryBtn');
const searchInput = document.getElementById('searchInput');
const categoryBtns = document.querySelectorAll('.category-btn');
const customerNameInput = document.getElementById('customerName');
const collectionTimeInput = document.getElementById('collectionTime');
const specialRequestsInput = document.getElementById('specialRequests');
const nameError = document.getElementById('nameError');
const timeError = document.getElementById('timeError');
const optionModal = document.getElementById('optionModal');
const optionForm = document.getElementById('optionForm');
const optionModalTitle = document.getElementById('optionModalTitle');
const confirmOptionsBtn = document.getElementById('confirmOptionsBtn');
const cancelOptionsBtn = document.getElementById('cancelOptionsBtn');
const emptyCartModal = document.getElementById('emptyCartModal');
const closeEmptyCartBtn = document.getElementById('closeEmptyCartBtn');

let currentItemForOptions = null;
let selectedOptions = {};


const toCents = (value) => Math.round(Number(value) * 100);
const fromCents = (cents) => cents / 100;
const formatRand = (cents) => (cents % 100 === 0 ? String(Math.round(fromCents(cents))) : fromCents(cents).toFixed(2));


const priceForSummaryCents = (value) => {
    let cents = toCents(value);
    const centsPart = cents % 100;
    if (centsPart === 99) {
        cents = (Math.floor(cents / 100) + 1) * 100;
    }
    return cents;
};



async function loadMenu() {
    try {
        const response = await fetch('/json/menu.json');
        const data = await response.json();
        menuData = data.menu;
        renderMenu(menuData);
    } catch (error) {
        console.error('Error loading menu:', error);
    }
}

function renderMenu(items) {
    const container = document.getElementById('menuContainer');
    container.innerHTML = '';
    items.forEach(item => {
        const card = document.createElement('div');
        card.className = 'card';
        card.innerHTML = `
          <div class="item-image">
            <img src="${item['image-url']}" alt="${item.name}">
          </div>
          <div class="item-content">
            <h3 class="font-1">${item.name}</h3>
            <p class="font-2">${item.description}</p>
            <div>
              <span class="item-price font-1">R${Number(item.price).toFixed(2)}</span>
              <span class="order-btn font-3" data-id="${item.name}">Add to order</span>
            </div>
          </div>
        `;
        container.appendChild(card);
    });

    document.querySelectorAll('.order-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const itemName = e.target.getAttribute('data-id');
            addToCart(itemName);
        });
    });
}

function addToCart(itemName) {
    const item = menuData.find(i => i.name === itemName);
    if (item) {

        if (item.options) {
            showOptionModal(item);
            return;
        }


        const existingItem = cart.find(i => i.name === itemName && !i.options);
        if (existingItem) {
            existingItem.quantity++;
        } else {
            cart.push({
                name: item.name,
                price: Number(item.price),
                description: item.description,
                image: item['image-url'],
                quantity: 1
            });
        }
        updateCartUI();
        saveCartToStorage(cart);
    }
}

function showOptionModal(item) {
    currentItemForOptions = item;
    selectedOptions = {};

    optionModalTitle.textContent = item.name;
    optionForm.innerHTML = '';

    if (item.options) {
        Object.entries(item.options).forEach(([optionType, choices]) => {
            const optionGroup = document.createElement('div');
            optionGroup.className = 'option-group';

            const title = document.createElement('h3');
            title.textContent = optionType.charAt(0).toUpperCase() + optionType.slice(1);
            optionGroup.appendChild(title);

            const buttonsContainer = document.createElement('div');
            buttonsContainer.className = 'option-buttons';

            choices.forEach(choice => {
                const button = document.createElement('button');
                button.className = 'option-btn';
                button.textContent = choice;
                button.dataset.type = optionType;
                button.dataset.choice = choice;

                button.addEventListener('click', () => {

                    document.querySelectorAll(`.option-btn[data-type="${optionType}"]`).forEach(btn => {
                        btn.classList.remove('selected');
                    });


                    button.classList.add('selected');
                    selectedOptions[optionType] = choice;
                });

                buttonsContainer.appendChild(button);
            });

            optionGroup.appendChild(buttonsContainer);
            optionForm.appendChild(optionGroup);
        });
    }

    optionModal.style.display = 'flex';
}

function updateCartUI() {
    const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
    cartCount.textContent = totalItems;
    finishOrderBtn.style.display = totalItems > 0 ? 'block' : 'none';
}


function showOrderSummary() {
    if (cart.length === 0) {
        emptyCartModal.style.display = 'flex';
        return;
    }


    orderItemsContainer.innerHTML = '';
    let totalCents = 0;

    cart.forEach((item, index) => {
        const unitCents = priceForSummaryCents(item.price);
        const itemTotalCents = unitCents * item.quantity;
        totalCents += itemTotalCents;

        const orderItem = document.createElement('div');
        orderItem.className = 'order-item';

        let optionsHTML = '';
        if (item.options) {
            optionsHTML = `<div class="selected-options">`;
            for (const [optionType, choice] of Object.entries(item.options)) {
                optionsHTML += `<span>${optionType}: ${choice}</span>`;
            }
            optionsHTML += `</div>`;
        }

        orderItem.innerHTML = `
          <img src="${item.image}" alt="${item.name}">
          <div class="order-details">
            <h3 class="font-1">${item.name}</h3>
            <p class="font-2">${item.description}</p>
            ${optionsHTML}
            <p class="item-price font-2">
              Price: R${formatRand(unitCents)} ×
              <button class="qty-btn" data-index="${index}" data-action="decrease">-</button>
              <span class="qty-display">${item.quantity}</span>
              <button class="qty-btn" data-index="${index}" data-action="increase">+</button>
            </p>
            <p class="item-price font-2"><strong>Total: R${formatRand(itemTotalCents)}</strong></p>
          </div>
          <button class="remove-btn" data-index="${index}">🗑️</button>
        `;
        orderItemsContainer.appendChild(orderItem);
    });

    orderTotal.textContent = formatRand(totalCents);
    orderModal.style.display = 'flex';

    document.querySelectorAll('.qty-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const index = parseInt(e.target.dataset.index);
            const action = e.target.dataset.action;
            if (action === 'increase') {
                cart[index].quantity++;
            } else if (action === 'decrease' && cart[index].quantity > 1) {
                cart[index].quantity--;
            } else if (action === 'decrease' && cart[index].quantity === 1) {
                cart.splice(index, 1);
            }
            showOrderSummary();
            saveCartToStorage(cart);
        });
    });

    document.querySelectorAll('.remove-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const index = parseInt(e.target.dataset.index);
            cart.splice(index, 1);
            saveCartToStorage(cart);
            if (cart.length === 0) {
                orderModal.style.display = 'none';
                updateCartUI();
            } else {
                showOrderSummary();
            }
        });
    });
}

closeEmptyCartBtn.addEventListener('click', () => {
    emptyCartModal.style.display = 'none';
});

window.addEventListener('click', (e) => {
    if (e.target === emptyCartModal) {
        emptyCartModal.style.display = 'none';
    }
});

function showOrderDetails() {

    customerNameInput.value = '';
    collectionTimeInput.value = '';
    specialRequestsInput.value = '';
    nameError.style.display = 'none';
    timeError.style.display = 'none';

    const now = new Date();
    const minDateTime = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    collectionTimeInput.min = minDateTime;

    orderDetailsModal.style.display = 'flex';
}

async function sendOrder() {

    let isValid = true;

    if (!customerNameInput.value.trim()) {
        nameError.style.display = 'block';
        isValid = false;
    } else {
        nameError.style.display = 'none';
    }

    if (!collectionTimeInput.value) {
        timeError.style.display = 'block';
        isValid = false;
    } else {
        timeError.style.display = 'none';
    }

    if (!isValid) return;

    const customerName = customerNameInput.value;
    const collectionTime = new Date(collectionTimeInput.value);
    const specialRequests = specialRequestsInput.value;

    let message = `*New Order Summary*\n\n`;
    message += `*Customer:* ${customerName}\n`;
    message += `*Collection Time:* ${collectionTime.toLocaleString()}\n`;

    if (specialRequests) {
        message += `*Special Requests:* ${specialRequests}\n\n`;
    }

    let totalCents = 0;

    cart.forEach(item => {
        const unitCents = priceForSummaryCents(item.price);
        const itemTotalCents = unitCents * item.quantity;
        totalCents += itemTotalCents;

        message += `• *${item.name}*\n`;

        if (item.options) {
            for (const [optionType, choice] of Object.entries(item.options)) {
                message += `   ${optionType}: ${choice}\n`;
            }
        }

        message += `   Quantity: ${item.quantity}\n`;
        message += `   Unit Price: R${formatRand(unitCents)}\n`;
        message += `   Item Total: R${formatRand(itemTotalCents)}\n\n`;
    });

    message += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    message += `*TOTAL AMOUNT:* R${formatRand(totalCents)}\n`;
    message += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    message += `Please prepare this order.\nThank you for choosing Thandzin-at-Service!`;

    const phoneNumber = "+27731972528";
    const whatsappUrl = `https://wa.me/${phoneNumber}?text=${encodeURIComponent(message)}`;

    try {
        const canvas = await html2canvas(document.querySelector("#orderItemsContainer"), { backgroundColor: "#fff", scale: 2 });
        const imageData = canvas.toDataURL("image/png");
        await fetch("/send-whatsapp-image", {
            method: "POST",
            body: JSON.stringify({ image: imageData, phone: phoneNumber }),
            headers: { "Content-Type": "application/json" }
        });
    } catch (err) {
        console.error("Error capturing image:", err);
    }

    window.open(whatsappUrl, '_blank');


    cart = [];
    saveCartToStorage(cart);
    clearCartStorage();
    updateCartUI();
    orderDetailsModal.style.display = 'none';
}

function filterMenu(searchTerm, category = 'all') {
    const term = searchTerm.toLowerCase();
    const filtered = menuData.filter(item => {
        const matchesSearch = item.name.toLowerCase().includes(term) || item.description.toLowerCase().includes(term);
        const matchesCategory = category === 'all' || (item.category || '').toLowerCase() === category.toLowerCase();
        return matchesSearch && matchesCategory;
    });
    renderMenu(filtered);
}


document.addEventListener('DOMContentLoaded', () => {

    updateCartUI();

    loadMenu();
    finishOrderBtn.addEventListener('click', showOrderSummary);
    cartButton.addEventListener('click', showOrderSummary);
    nextToDetailsBtn.addEventListener('click', () => {
        if (cart.length === 0) {
            alert('Please add items to your order first');
            return;
        }
        orderModal.style.display = 'none';
        showOrderDetails();
    });
    sendOrderBtn.addEventListener('click', sendOrder);
    closeModalBtn.addEventListener('click', () => orderModal.style.display = 'none');
    backToSummaryBtn.addEventListener('click', () => {
        orderDetailsModal.style.display = 'none';
        orderModal.style.display = 'flex';
    });

    confirmOptionsBtn.addEventListener('click', () => {
        if (currentItemForOptions) {

            const allOptionsSelected = Object.keys(currentItemForOptions.options).every(
                optionType => selectedOptions[optionType]
            );

            if (!allOptionsSelected) {
                alert('Please select all options');
                return;
            }


            const existingItem = cart.find(i =>
                i.name === currentItemForOptions.name &&
                JSON.stringify(i.options) === JSON.stringify(selectedOptions)
            );

            if (existingItem) {
                existingItem.quantity++;
            } else {
                cart.push({
                    name: currentItemForOptions.name,
                    price: Number(currentItemForOptions.price),
                    description: currentItemForOptions.description,
                    image: currentItemForOptions['image-url'],
                    quantity: 1,
                    options: {...selectedOptions }
                });
            }

            updateCartUI();
            saveCartToStorage(cart);
            optionModal.style.display = 'none';
            currentItemForOptions = null;
            selectedOptions = {};
        }
    });

    cancelOptionsBtn.addEventListener('click', () => {
        optionModal.style.display = 'none';
        currentItemForOptions = null;
        selectedOptions = {};
    });

    searchInput.addEventListener('input', (e) => {
        const activeCategory = document.querySelector('.category-btn.active').dataset.category;
        filterMenu(e.target.value, activeCategory);
    });

    categoryBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            categoryBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            filterMenu(searchInput.value, btn.dataset.category);
        });
    });

    window.addEventListener('click', (e) => {
        if (e.target === orderModal) orderModal.style.display = 'none';
        if (e.target === orderDetailsModal) orderDetailsModal.style.display = 'none';
        if (e.target === optionModal) {
            optionModal.style.display = 'none';
            currentItemForOptions = null;
            selectedOptions = {};
        }
    });
});