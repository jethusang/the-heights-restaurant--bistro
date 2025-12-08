import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import {
    getAuth,
    signInAnonymously,
    signInWithCustomToken,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import {
    getFirestore,
    doc,
    setDoc,
    getDoc,
    updateDoc,
    onSnapshot,
    collection,
    query
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { setLogLevel } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";


// 1. Firebase Setup and Global Variables
setLogLevel('Debug');
const firebaseConfig = JSON.parse(typeof __firebase_config !== 'undefined' ? __firebase_config : '{}');
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

let db;
let auth;
let currentUserId = null;
let isAuthReady = false;

let menuData = [];
let cart = []; // Cart state synchronized with Firestore
let currentItemForOptions = null;
let selectedOptions = {};

// 2. DOM Elements
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
const categoryBtnsContainer = document.getElementById('categoryBtnsContainer'); // New container for buttons
const menuContainer = document.getElementById('menuContainer');
const customerNameInput = document.getElementById('customerName');
const collectionTimeInput = document.getElementById('collectionTime');
const specialRequestsInput = document.getElementById('specialRequests');
const nameError = document.getElementById('nameError');
const timeError = document.getElementById('timeError');
const optionModal = document.getElementById('optionModal');
const optionModalTitle = document.getElementById('optionModalTitle');
const optionForm = document.getElementById('optionForm');
const confirmOptionsBtn = document.getElementById('confirmOptionsBtn');
const cancelOptionsBtn = document.getElementById('cancelOptionsBtn');
const emptyCartModal = document.getElementById('emptyCartModal');
const emptyCartCloseBtn = document.getElementById('emptyCartCloseBtn');
const summaryModalTotal = document.getElementById('summaryModalTotal');
const summaryItemsContainer = document.getElementById('summaryItemsContainer');


// --- Utility Functions ---

/**
 * Creates the Firestore path for the current user's cart.
 * @returns {string} The document path.
 */
function getCartDocPath() {
    if (!currentUserId) return null;
    return `artifacts/${appId}/users/${currentUserId}/user_data/cart`;
}

/**
 * Ensures a monetary value is correctly formatted.
 * @param {number} value 
 * @returns {string} Formatted currency string.
 */
function formatCurrency(value) {
    // Ensuring the value is treated as a number
    const num = parseFloat(value);
    if (isNaN(num)) return 'R 0.00';
    return `R ${num.toFixed(2)}`;
}

// --- Firebase and Cart Management ---

/**
 * Initializes Firebase, authenticates the user, and sets up auth listeners.
 */
async function initializeFirebase() {
    try {
        const app = initializeApp(firebaseConfig);
        db = getFirestore(app);
        auth = getAuth(app);

        // Sign in using the custom token or anonymously if not available
        if (initialAuthToken) {
            await signInWithCustomToken(auth, initialAuthToken);
        } else {
            await signInAnonymously(auth);
        }

        onAuthStateChanged(auth, (user) => {
            if (user) {
                currentUserId = user.uid;
                isAuthReady = true;
                console.log("Firebase initialized. User ID:", currentUserId);

                // Once authenticated, start listening to the cart
                setupCartListener();

            } else {
                currentUserId = null;
                isAuthReady = true;
                console.log("No user signed in. Using anonymous authentication.");
            }
        });

    } catch (error) {
        console.error("Firebase initialization failed:", error);
    }
}

/**
 * Sets up a real-time listener for the user's cart in Firestore.
 */
function setupCartListener() {
    if (!isAuthReady || !currentUserId) return;

    const cartDocRef = doc(db, getCartDocPath());

    // Listen for real-time changes
    onSnapshot(cartDocRef, (docSnap) => {
        if (docSnap.exists()) {
            // Firestore data structure: { items: [cartItem, ...], total: 100.00 }
            const data = docSnap.data();
            cart = data.items || [];
            console.log("Cart updated from Firestore:", cart);
            updateCartUI();
        } else {
            // If the document doesn't exist (first run), initialize it
            saveCartToFirestore([]);
            cart = [];
            updateCartUI();
        }
    }, (error) => {
        console.error("Error listening to cart changes:", error);
    });
}

/**
 * Saves the current cart array to Firestore.
 * @param {Array} currentCart 
 */
async function saveCartToFirestore(currentCart) {
    if (!isAuthReady || !currentUserId) return;

    const cartDocRef = doc(db, getCartDocPath());
    const total = currentCart.reduce((sum, item) => sum + (item.price * item.quantity), 0);

    try {
        await setDoc(cartDocRef, { items: currentCart, total: total }, { merge: true });
        console.log("Cart saved to Firestore.");
    } catch (error) {
        console.error("Error saving cart to Firestore:", error);
    }
}

/**
 * Adds an item to the cart and saves to Firestore.
 * @param {object} itemDetails - Details of the item to add.
 */
async function addItemToCart(itemDetails) {
    const existingItemIndex = cart.findIndex(
        item => item.id === itemDetails.id && JSON.stringify(item.options) === JSON.stringify(itemDetails.options)
    );

    if (existingItemIndex > -1) {
        // Increment quantity if item with same options exists
        cart[existingItemIndex].quantity += itemDetails.quantity;
    } else {
        // Add new item
        cart.push(itemDetails);
    }

    // Save the updated cart array to Firestore
    await saveCartToFirestore(cart);
}

/**
 * Clears the entire cart in Firestore.
 */
async function clearCart() {
    await saveCartToFirestore([]); // Clears the cart array
}

// --- Menu Data and Rendering ---

/**
 * Fetches the menu data from the local JSON file.
 */
async function loadMenuData() {
    try {
        // Fetch the local JSON file
        const response = await fetch('dynamic_menu_structure.json');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        menuData = await response.json();
        console.log("Menu data loaded successfully:", menuData);

        // Dynamically create category buttons and render the initial menu
        renderCategoryButtons();
        renderMenu();

    } catch (error) {
        console.error("Could not load menu data:", error);
        menuContainer.innerHTML = '<p class="text-red-600 text-center text-xl p-8">Error loading menu. Please check the menu data file.</p>';
    }
}

/**
 * Creates and renders the category selection buttons.
 */
function renderCategoryButtons() {
    categoryBtnsContainer.innerHTML = ''; // Clear existing buttons

    // Add an 'All' button
    let allBtn = document.createElement('button');
    allBtn.className = 'category-btn font-3 px-4 py-2 rounded-full transition-colors active';
    allBtn.textContent = 'All Categories';
    allBtn.dataset.category = 'all';
    allBtn.addEventListener('click', () => {
        handleCategoryClick(allBtn);
        filterMenu(searchInput.value, 'all');
    });
    categoryBtnsContainer.appendChild(allBtn);

    menuData.forEach(category => {
        let btn = document.createElement('button');
        btn.className = 'category-btn font-3 px-4 py-2 rounded-full transition-colors';
        btn.textContent = category.name;
        btn.dataset.category = category.id;
        btn.addEventListener('click', () => {
            handleCategoryClick(btn);
            filterMenu(searchInput.value, category.id);
        });
        categoryBtnsContainer.appendChild(btn);
    });
}

/**
 * Handles the visual change for the active category button.
 * @param {HTMLElement} clickedBtn 
 */
function handleCategoryClick(clickedBtn) {
    document.querySelectorAll('.category-btn').forEach(btn => btn.classList.remove('active'));
    clickedBtn.classList.add('active');
}

/**
 * Renders the full or filtered menu based on current search and category.
 * @param {string} searchTerm 
 * @param {string} activeCategory 
 */
function renderMenu(searchTerm = '', activeCategory = 'all') {
    const term = searchTerm.toLowerCase();
    menuContainer.innerHTML = '';

    // Loop through each category
    menuData.forEach(category => {
        // Check if the category is the active one or if 'all' is selected
        if (activeCategory === 'all' || activeCategory === category.id) {

            // Check if any item in this category matches the search term
            const matchingItems = category.items.filter(item =>
                item.name.toLowerCase().includes(term) || item.description.toLowerCase().includes(term)
            );

            if (matchingItems.length > 0) {
                // Render Category Header
                const categoryHeader = document.createElement('div');
                categoryHeader.className = 'w-full my-6';
                categoryHeader.innerHTML = `
                    <h2 class="font-1 text-3xl text-[#8b4513] border-b-2 border-[#8b4513] pb-1">${category.name}</h2>
                    <p class="font-2 text-gray-600 mt-1">${category.description}</p>
                `;
                menuContainer.appendChild(categoryHeader);

                // Render Items Grid
                const itemsGrid = document.createElement('div');
                itemsGrid.className = 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 mb-10';

                matchingItems.forEach(item => {
                    const itemElement = document.createElement('div');
                    itemElement.className = 'menu-item bg-white rounded-xl shadow-lg hover:shadow-2xl transition-all duration-300 overflow-hidden';
                    itemElement.dataset.itemId = item.id;
                    itemElement.dataset.categoryId = category.id;

                    // Use fallback placeholder image if /res/img links fail
                    const imageUrl = item.image_url || 'https://placehold.co/300x200/cccccc/333333?text=No+Image';

                    itemElement.innerHTML = `
                        <img src="${imageUrl}" onerror="this.onerror=null;this.src='https://placehold.co/300x200/cccccc/333333?text=Image+Unavailable';" alt="${item.name}" class="w-full h-48 object-cover">
                        <div class="p-4 flex flex-col justify-between h-auto">
                            <div>
                                <h3 class="font-1 text-xl font-semibold text-[#4e2c0e]">${item.name}</h3>
                                <p class="font-2 text-sm text-gray-500 mt-1 line-clamp-2">${item.description}</p>
                            </div>
                            <div class="flex justify-between items-center mt-4">
                                <span class="font-3 text-2xl font-bold text-[#8b4513]">${formatCurrency(item.price)}</span>
                                <button class="add-to-cart-btn order-btn font-3 px-4 py-2 text-sm rounded-full transition-all duration-300">
                                    <i class="fa fa-shopping-basket mr-1"></i> Order
                                </button>
                            </div>
                        </div>
                    `;

                    // Attach event listener to the "Order" button
                    const orderButton = itemElement.querySelector('.add-to-cart-btn');
                    orderButton.addEventListener('click', () => handleOrderClick(item, category.id));

                    itemsGrid.appendChild(itemElement);
                });

                menuContainer.appendChild(itemsGrid);
            }
        }
    });

    if (menuContainer.innerHTML === '') {
        menuContainer.innerHTML = `<p class="text-center text-gray-500 font-2 text-lg py-10">No items found matching "${searchTerm}" in the selected category.</p>`;
    }
}

/**
 * Handles the search and category filtering logic.
 * @param {string} searchTerm 
 * @param {string} activeCategory 
 */
function filterMenu(searchTerm, activeCategory) {
    renderMenu(searchTerm, activeCategory);
}


// --- Cart UI and Modals ---

/**
 * Recalculates cart total and updates the count bubble and modal summary.
 */
function updateCartUI() {
    const total = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const count = cart.reduce((sum, item) => sum + item.quantity, 0);

    cartCount.textContent = count;

    // Update summary modal
    summaryItemsContainer.innerHTML = '';
    cart.forEach((item, index) => {
        const itemElement = document.createElement('div');
        itemElement.className = 'flex justify-between items-center p-2 border-b';

        let optionsText = '';
        const optionKeys = Object.keys(item.options);
        if (optionKeys.length > 0) {
            optionsText = ' (' + optionKeys.map(key => item.options[key].name).join(', ') + ')';
        }

        itemElement.innerHTML = `
            <div class="flex flex-col flex-grow">
                <span class="font-1 font-semibold text-lg">${item.name}</span>
                <span class="font-2 text-sm text-gray-500">${optionsText}</span>
            </div>
            <div class="flex items-center space-x-3">
                <button class="cart-qty-btn text-lg text-red-500 hover:text-red-700" data-index="${index}" data-action="decrease">-</button>
                <span class="font-3 text-lg">${item.quantity}</span>
                <button class="cart-qty-btn text-lg text-green-500 hover:text-green-700" data-index="${index}" data-action="increase">+</button>
                <span class="font-3 text-lg w-20 text-right">${formatCurrency(item.price * item.quantity)}</span>
            </div>
        `;
        summaryItemsContainer.appendChild(itemElement);
    });

    summaryModalTotal.textContent = formatCurrency(total);

    // Attach listeners to new quantity buttons
    document.querySelectorAll('.cart-qty-btn').forEach(button => {
        button.addEventListener('click', handleCartQuantityChange);
    });
}

/**
 * Handles increasing or decreasing item quantity in the cart.
 * @param {Event} e 
 */
async function handleCartQuantityChange(e) {
    const index = parseInt(e.target.dataset.index);
    const action = e.target.dataset.action;

    if (index >= 0 && index < cart.length) {
        if (action === 'increase') {
            cart[index].quantity++;
        } else if (action === 'decrease') {
            cart[index].quantity--;
            if (cart[index].quantity <= 0) {
                // Remove item if quantity drops to zero
                cart.splice(index, 1);
            }
        }
        await saveCartToFirestore(cart);
    }
}

/**
 * Opens the cart summary modal or the empty cart modal.
 */
function openOrderModal() {
    if (cart.length === 0) {
        emptyCartModal.style.display = 'flex';
        orderModal.style.display = 'none';
        orderDetailsModal.style.display = 'none';
    } else {
        orderModal.style.display = 'flex';
        orderDetailsModal.style.display = 'none';
        updateCartUI(); // Ensure UI is fresh
    }
}

// --- Option Modal Logic (Crucial for the new JSON structure) ---

/**
 * Shows the option modal for items that require choices.
 * @param {object} item - The menu item object.
 * @param {string} categoryId - The ID of the category.
 */
function handleOrderClick(item, categoryId) {
    currentItemForOptions = {
        ...item,
        categoryId: categoryId,
        basePrice: item.price // Store base price separately for calculation
    };
    selectedOptions = {};

    // Check if the item has options
    if (item.options && item.options.length > 0) {
        showOptionsModal(item);
    } else {
        // If no options, add directly to cart
        addItemToCart({
            id: item.id,
            name: item.name,
            description: item.description,
            price: item.price,
            image: item.image_url,
            quantity: 1,
            options: {} // Empty options object
        });
    }
}

/**
 * Populates and displays the modal for item options.
 * @param {object} item 
 */
function showOptionsModal(item) {
    optionModalTitle.textContent = `Customize: ${item.name}`;
    optionForm.innerHTML = '';

    item.options.forEach(optionGroup => {
        const groupDiv = document.createElement('div');
        groupDiv.className = 'option-group p-4 border-b border-gray-200';
        groupDiv.innerHTML = `
            <h4 class="font-1 font-semibold text-lg text-[#4e2c0e] mb-2">${optionGroup.name} 
                ${optionGroup.required ? '<span class="text-red-500 text-sm">(Mandatory)</span>' : '<span class="text-gray-500 text-sm">(Optional)</span>'}
            </h4>
        `;

        optionGroup.choices.forEach(choice => {
            const isRadio = optionGroup.type === 'radio';
            const inputType = isRadio ? 'radio' : 'checkbox';
            const uniqueName = optionGroup.option_id; // Used for grouping radio buttons
            const choiceId = `${item.id}-${optionGroup.option_id}-${choice.choice_id}`;
            const priceAdjText = choice.price_adj > 0 ? ` (+${formatCurrency(choice.price_adj)})` : '';

            const choiceDiv = document.createElement('div');
            choiceDiv.className = 'flex items-center justify-between py-2';
            choiceDiv.innerHTML = `
                <label for="${choiceId}" class="flex-grow font-2 text-gray-700 cursor-pointer">
                    ${choice.name} ${priceAdjText}
                </label>
                <input 
                    type="${inputType}" 
                    id="${choiceId}" 
                    name="${uniqueName}" 
                    data-option-id="${optionGroup.option_id}"
                    data-choice-id="${choice.choice_id}"
                    data-price-adj="${choice.price_adj}"
                    data-name="${choice.name}"
                    class="form-checkbox h-5 w-5 text-[#8b4513] border-gray-300 rounded focus:ring-[#8b4513] cursor-pointer"
                >
            `;

            groupDiv.appendChild(choiceDiv);
        });

        optionForm.appendChild(groupDiv);
    });

    optionModal.style.display = 'flex';

    // Attach change listeners to all new inputs
    optionForm.querySelectorAll('input').forEach(input => {
        input.addEventListener('change', handleOptionChange);
    });
}

/**
 * Updates the selected options object and recalculates the price based on user input.
 * @param {Event} e 
 */
function handleOptionChange(e) {
    const input = e.target;
    const optionId = input.dataset.optionId;
    const choiceId = input.dataset.choiceId;
    const priceAdj = parseFloat(input.dataset.priceAdj);
    const name = input.dataset.name;
    const isChecked = input.checked;
    const isRadio = input.type === 'radio';

    // Find the current item's option group
    const optionGroup = currentItemForOptions.options.find(g => g.option_id === optionId);

    if (isRadio) {
        // For radio buttons, set the single choice
        if (isChecked) {
            selectedOptions[optionId] = {
                choiceId: choiceId,
                name: name,
                price_adj: priceAdj
            };
        } else {
            // Should not happen for standard radio behavior, but included for completeness
            delete selectedOptions[optionId];
        }
    } else { // Checkbox
        if (isChecked) {
            // For checkboxes, maintain an array of selections if multiple choices are allowed,
            // but for simplicity here, we'll store a map of selected choices for that option group.
            if (!selectedOptions[optionId]) {
                selectedOptions[optionId] = {};
            }
            selectedOptions[optionId][choiceId] = {
                name: name,
                price_adj: priceAdj
            };
        } else {
            // Remove the choice if unchecked
            if (selectedOptions[optionId]) {
                delete selectedOptions[optionId][choiceId];
                if (Object.keys(selectedOptions[optionId]).length === 0) {
                    delete selectedOptions[optionId];
                }
            }
        }
    }
}

// --- Event Listeners ---

// Initialize Firebase and load data on window load
window.onload = initializeFirebase;
window.onload = loadMenuData;


// Cart Button Listener
cartButton.addEventListener('click', openOrderModal);

// Close Cart Modal Button
closeModalBtn.addEventListener('click', () => {
    orderModal.style.display = 'none';
});

// Empty Cart Modal Close Button
emptyCartCloseBtn.addEventListener('click', () => {
    emptyCartModal.style.display = 'none';
});

// Next Step (Summary to Details)
nextToDetailsBtn.addEventListener('click', () => {
    orderModal.style.display = 'none';
    orderDetailsModal.style.display = 'flex';
});

// Back Step (Details to Summary)
backToSummaryBtn.addEventListener('click', () => {
    orderDetailsModal.style.display = 'none';
    orderModal.style.display = 'flex';
});

// Confirm Options Button
confirmOptionsBtn.addEventListener('click', () => {
    let finalPrice = currentItemForOptions.basePrice;

    // 1. Validation for mandatory options
    const allRequiredOptionsSelected = currentItemForOptions.options.every(optionGroup => {
        if (optionGroup.required) {
            const selection = selectedOptions[optionGroup.option_id];

            if (!selection) return false;

            // For checkboxes, check if at least one is selected
            if (optionGroup.type === 'checkbox' && Object.keys(selection).length === 0) return false;

            return true;
        }
        return true;
    });

    if (!allRequiredOptionsSelected) {
        alert('Please select all mandatory options before adding to order.');
        return;
    }

    // 2. Calculate Final Price and Compile Options
    const finalOptionsList = {}; // Simple map for display and cart lookup

    for (const optionId in selectedOptions) {
        const selection = selectedOptions[optionId];

        if (Array.isArray(selection)) { // Should not happen with current logic, but safe guard
            selection.forEach(choice => {
                finalPrice += choice.price_adj;
                finalOptionsList[optionId + '_' + choice.choiceId] = choice;
            });
        } else if (typeof selection === 'object' && selection !== null) {
            if (selection.choiceId) { // Radio button structure
                finalPrice += selection.price_adj;
                finalOptionsList[optionId] = selection;
            } else { // Checkbox structure (map of choices)
                for (const choiceId in selection) {
                    finalPrice += selection[choiceId].price_adj;
                    finalOptionsList[optionId + '_' + choiceId] = selection[choiceId];
                }
            }
        }
    }

    // 3. Add to Cart
    addItemToCart({
        id: currentItemForOptions.id,
        name: currentItemForOptions.name,
        description: currentItemForOptions.description,
        price: finalPrice, // Use the adjusted price
        image: currentItemForOptions.image_url,
        quantity: 1,
        options: finalOptionsList // Store the list of selected choices
    });

    // 4. Reset and Close
    optionModal.style.display = 'none';
    currentItemForOptions = null;
    selectedOptions = {};
});

// Cancel Options Button
cancelOptionsBtn.addEventListener('click', () => {
    optionModal.style.display = 'none';
    currentItemForOptions = null;
    selectedOptions = {};
});

// Search and Filter Listeners
searchInput.addEventListener('input', (e) => {
    // Determine the active category ID
    const activeBtn = document.querySelector('.category-btn.active');
    const activeCategory = activeBtn ? activeBtn.dataset.category : 'all';
    filterMenu(e.target.value, activeCategory);
});

// Close Modals on outside click
window.addEventListener('click', (e) => {
    if (e.target === orderModal) orderModal.style.display = 'none';
    if (e.target === orderDetailsModal) orderDetailsModal.style.display = 'none';
    if (e.target === emptyCartModal) emptyCartModal.style.display = 'none';
    if (e.target === optionModal) {
        optionModal.style.display = 'none';
        currentItemForOptions = null;
        selectedOptions = {};
    }
});

// Placeholder for Send Order functionality
sendOrderBtn.addEventListener('click', async() => {
    nameError.textContent = '';
    timeError.textContent = '';

    const name = customerNameInput.value.trim();
    const time = collectionTimeInput.value.trim();

    let hasError = false;

    if (!name) {
        nameError.textContent = 'Please enter your name.';
        hasError = true;
    }

    if (!time) {
        timeError.textContent = 'Please select a collection time.';
        hasError = true;
    }

    if (hasError) {
        return;
    }

    // Prepare final order object
    const finalOrder = {
        userId: currentUserId,
        userName: name,
        collectionTime: time,
        specialRequests: specialRequestsInput.value.trim(),
        items: cart,
        total: cart.reduce((sum, item) => sum + item.price * item.quantity, 0),
        timestamp: new Date().toISOString(),
        status: 'Pending'
    };

    try {
        // Store the final order in a 'orders' collection (publicly accessible)
        const ordersCollectionRef = collection(db, `artifacts/${appId}/public/data/orders`);
        const orderDocRef = await addDoc(ordersCollectionRef, finalOrder);

        // Clear the cart after placing the order
        await clearCart();

        // Show success message (using a simple modal/alert replacement for now)
        alert(`Order placed successfully! Order ID: ${orderDocRef.id}`);

        // Reset UI
        orderDetailsModal.style.display = 'none';
        customerNameInput.value = '';
        collectionTimeInput.value = '';
        specialRequestsInput.value = '';

    } catch (error) {
        console.error("Error placing order:", error);
        alert('Failed to place order. Please try again.');
    }
});

// Simple alert replacement function
function alert(message) {
    const customAlert = document.createElement('div');
    customAlert.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background-color: #fff;
        padding: 30px;
        border-radius: 12px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.25);
        z-index: 2000;
        text-align: center;
        max-width: 80vw;
        font-family: 'Inter', sans-serif;
    `;

    customAlert.innerHTML = `
        <p style="font-size: 1.1em; margin-bottom: 20px;">${message}</p>
        <button id="alertCloseBtn" style="background-color: #8b4513; color: white; padding: 10px 20px; border: none; border-radius: 8px; cursor: pointer; transition: background-color 0.3s;">
            OK
        </button>
    `;

    document.body.appendChild(customAlert);

    document.getElementById('alertCloseBtn').onclick = () => {
        customAlert.remove();
    };
}

// Function to replace dummy addDoc for real import
function addDoc(collectionRef, data) {
    if (!db) {
        console.error("Firestore not initialized.");
        return { id: 'dummy-id' };
    }
    // Real Firestore addDoc is imported, no need for dummy implementation here.
    return import ("https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js").then(module => {
        return module.addDoc(collectionRef, data);
    });
}