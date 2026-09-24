import { useEffect, useState } from "react";

/**
 * Sandbox storefront: read-only product/cart UI shown after redirect for high-risk or bot sessions.
 * Checkout is disabled; no telemetry is sent. Used to isolate suspicious traffic.
 */
const randomSession = () => `sandbox-${Math.random().toString(16).slice(2, 8)}`;

/** Generate a simple SVG data URL for product placeholder images. */
const generatePlaceholder = (text, color = "#f0f0f0") => {
  try {
    const svg = `
      <svg width="300" height="300" xmlns="http://www.w3.org/2000/svg">
        <rect width="300" height="300" fill="${color}"/>
        <text x="50%" y="50%" font-family="Arial, sans-serif" font-size="16" fill="#666" text-anchor="middle" dominant-baseline="middle">${text}</text>
      </svg>
    `;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  } catch (err) {
    console.error("Error generating placeholder:", err);
    return "data:image/svg+xml;charset=utf-8,%3Csvg%20width%3D%22300%22%20height%3D%22300%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Crect%20width%3D%22300%22%20height%3D%22300%22%20fill%3D%22%23f0f0f0%22%2F%3E%3C%2Fsvg%3E";
  }
};

const products = [
  {
    id: "p1",
    title: "Wireless Bluetooth Headphones - Premium Sound Quality",
    price: 79.99,
    originalPrice: 99.99,
    rating: 4.5,
    reviews: 1234,
    image: generatePlaceholder("Headphones", "#e8f0f8"),
    prime: true,
  },
  {
    id: "p2",
    title: "Smart Watch Fitness Tracker - Waterproof",
    price: 149.99,
    originalPrice: 199.99,
    rating: 4.3,
    reviews: 2345,
    image: generatePlaceholder("Smart Watch", "#f8e8f0"),
    prime: true,
  },
  {
    id: "p3",
    title: "Portable Power Bank 20000mAh - Fast Charging",
    price: 29.99,
    originalPrice: 39.99,
    rating: 4.7,
    reviews: 3456,
    image: generatePlaceholder("Power Bank", "#f0f8e8"),
    prime: false,
  },
  {
    id: "p4",
    title: "USB-C Charging Cable - Fast Charge 6ft",
    price: 12.99,
    originalPrice: 19.99,
    rating: 4.2,
    reviews: 5678,
    image: generatePlaceholder("USB Cable", "#e8f8e8"),
    prime: true,
  },
  {
    id: "p5",
    title: "Mechanical Keyboard RGB Backlit - Gaming",
    price: 89.99,
    originalPrice: 129.99,
    rating: 4.6,
    reviews: 1892,
    image: generatePlaceholder("Keyboard", "#f8f8e8"),
    prime: true,
  },
  {
    id: "p6",
    title: "Wireless Mouse Ergonomic - Silent Click",
    price: 24.99,
    originalPrice: 34.99,
    rating: 4.4,
    reviews: 3421,
    image: generatePlaceholder("Mouse", "#f0f0f8"),
    prime: false,
  },
];

export default function SandboxApp() {
  const [cart, setCart] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [showCart, setShowCart] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  useEffect(() => {
    console.log("Sandbox mode active - isolated environment");
  }, []);

  /** Add product to cart (local state only; no telemetry). */
  const handleAddToCart = (product) => {
    setCart(prevCart => {
      const existingItem = prevCart.find(item => item.product.id === product.id);
      if (existingItem) {
        return prevCart.map(item =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      } else {
        return [...prevCart, { product, quantity: 1 }];
      }
    });
    setShowCart(true);
  };

  const handleRemoveFromCart = (productId) => {
    setCart(prevCart => prevCart.filter(item => item.product.id !== productId));
  };

  /** Update quantity; remove item if quantity <= 0. */
  const handleUpdateQuantity = (productId, newQuantity) => {
    if (newQuantity <= 0) {
      handleRemoveFromCart(productId);
      return;
    }
    setCart(prevCart =>
      prevCart.map(item =>
        item.product.id === productId
          ? { ...item, quantity: newQuantity }
          : item
      )
    );
  };

  /** Render star rating (full/half/empty). */
  const renderStars = (rating) => {
    const fullStars = Math.floor(rating);
    const hasHalfStar = rating % 1 >= 0.5;
    return (
      <span className="stars">
        {"★".repeat(fullStars)}
        {hasHalfStar && "☆"}
        {"☆".repeat(5 - fullStars - (hasHalfStar ? 1 : 0))}
      </span>
    );
  };

  const filteredProducts = products.filter((p) =>
    p.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="app">
      {/* Banner explaining that the user is in an isolated sandbox. */}
      <div className="sandbox-banner">
        <div className="sandbox-banner-content">
          <span className="sandbox-banner-icon">⚠️</span>
          <span className="sandbox-banner-text">
            You are in a secure sandbox environment. Your session has been isolated for security purposes.
          </span>
        </div>
      </div>

      <header className="amazon-header">
        <div className="header-content">
          <div className="header-left">
            <div className="logo">amazon</div>
          </div>
          <div className="header-center">
            <div className="search-container">
              <select className="search-dropdown">
                <option>All</option>
              </select>
              <input
                type="text"
                className="search-input"
                placeholder="Search Amazon"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <button className="search-button">🔍</button>
            </div>
          </div>
          <div className="header-right">
            <div className="header-link">Hello, Sign in<br />Account & Lists</div>
            <div className="header-link">Returns<br />& Orders</div>
            <div className="cart-link" onClick={() => setShowCart(true)}>
              <span className="cart-icon">🛒</span>
              <span className="cart-count">{cartCount}</span>
            </div>
          </div>
        </div>
      </header>

      <nav className="amazon-nav">
        <div className="nav-content">
          <span className="nav-item">All</span>
          <span className="nav-item">Today's Deals</span>
          <span className="nav-item">Customer Service</span>
          <span className="nav-item">Registry</span>
          <span className="nav-item">Gift Cards</span>
          <span className="nav-item">Sell</span>
        </div>
      </nav>

      <main className="main-content">
        {showCart ? (
          <div className="cart-view">
            <div className="cart-header">
              <h2>Shopping Cart</h2>
              <button className="back-button" onClick={() => setShowCart(false)}>
                Continue Shopping
              </button>
            </div>
            {cart.length === 0 ? (
              <div className="empty-cart">
                <p>Your cart is empty.</p>
                <button className="btn-primary" onClick={() => setShowCart(false)}>
                  Start Shopping
                </button>
              </div>
            ) : (
              <>
                <div className="cart-items">
                  {cart.map((item) => (
                    <div key={item.product.id} className="cart-item">
                      <img src={item.product.image} alt={item.product.title} className="cart-item-image" />
                      <div className="cart-item-details">
                        <h3>{item.product.title}</h3>
                        <p className="cart-item-price">${item.product.price.toFixed(2)}</p>
                        <div className="cart-item-actions">
                          <label>
                            Qty:
                            <select
                              value={item.quantity}
                              onChange={(e) => handleUpdateQuantity(item.product.id, parseInt(e.target.value))}
                            >
                              {[1, 2, 3, 4, 5].map(n => (
                                <option key={n} value={n}>{n}</option>
                              ))}
                            </select>
                          </label>
                          <button
                            className="remove-button"
                            onClick={() => handleRemoveFromCart(item.product.id)}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                      <div className="cart-item-total">
                        ${(item.product.price * item.quantity).toFixed(2)}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="cart-summary">
                  <div className="cart-total">
                    <strong>Subtotal ({cartCount} items): ${cart.reduce((sum, item) => sum + item.product.price * item.quantity, 0).toFixed(2)}</strong>
                  </div>
                  <button className="btn-primary" disabled style={{ opacity: 0.5, cursor: 'not-allowed' }}>
                    Proceed to Checkout (Disabled in Sandbox)
                  </button>
                </div>
              </>
            )}
          </div>
        ) : selectedProduct ? (
          <div className="product-detail-view">
            <button className="back-button" onClick={() => setSelectedProduct(null)}>
              ← Back to Products
            </button>
            <div className="product-detail">
              <img src={selectedProduct.image} alt={selectedProduct.title} className="product-detail-image" />
              <div className="product-info">
                <h1>{selectedProduct.title}</h1>
                <div className="product-rating">
                  {renderStars(selectedProduct.rating)}
                  <span className="rating-text">{selectedProduct.rating} ({selectedProduct.reviews} ratings)</span>
                </div>
                <div className="product-price">
                  <span className="current-price">${selectedProduct.price.toFixed(2)}</span>
                  {selectedProduct.originalPrice && (
                    <span className="original-price">${selectedProduct.originalPrice.toFixed(2)}</span>
                  )}
                </div>
                {selectedProduct.prime && <span className="prime-badge">Prime</span>}
                <div className="product-actions">
                  <button className="btn-primary" onClick={() => handleAddToCart(selectedProduct)}>
                    Add to Cart
                  </button>
                </div>
                <div className="product-description">
                  <h3>About this item</h3>
                  <p>This is a sandbox environment. Product details are not available in this isolated session.</p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="products-section">
            <h2 className="section-title">Shop deals in Electronics</h2>
            <div className="products-grid">
              {filteredProducts.map((product) => (
                <div key={product.id} className="product-card" onClick={() => setSelectedProduct(product)}>
                  <img src={product.image} alt={product.title} className="product-image" />
                  <div className="product-details">
                    <h3 className="product-title">{product.title}</h3>
                    <div className="product-rating">
                      {renderStars(product.rating)}
                      <span className="rating-count">({product.reviews})</span>
                    </div>
                    <div className="product-price">
                      <span className="current-price">${product.price.toFixed(2)}</span>
                      {product.originalPrice && (
                        <span className="original-price">${product.originalPrice.toFixed(2)}</span>
                      )}
                    </div>
                    {product.prime && <span className="prime-badge">Prime</span>}
                    <button
                      className="btn-add-to-cart"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAddToCart(product);
                      }}
                    >
                      Add to Cart
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

