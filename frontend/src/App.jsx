import { useEffect, useState, useRef } from "react";
import { fetchScore, requestMitigation, sendTelemetry } from "./api";
import SliderCaptcha from "./components/SliderCaptcha";

/**
 * Main storefront UI: streams telemetry to PIA-Shield, shows risk score, and gates
 * checkout with slider CAPTCHA or redirects to sandbox when risk is high/bot.
 */
const randomSession = () => `sess-${Math.random().toString(16).slice(2, 8)}`;

/** Build SVG data URL for product placeholder images. */
const generatePlaceholder = (text, color = "#f0f0f0") => {
  try {
    const svg = `<svg width="300" height="300" xmlns="http://www.w3.org/2000/svg"><rect width="300" height="300" fill="${color}"/><text x="50%" y="50%" font-family="Arial, sans-serif" font-size="18" fill="#666" text-anchor="middle" dominant-baseline="middle">${text}</text></svg>`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  } catch (e) {
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg width="300" height="300" xmlns="http://www.w3.org/2000/svg"><rect width="300" height="300" fill="${color}"/></svg>`)}`;
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
    image: generatePlaceholder("Headphones", "#e8f4f8"),
    prime: true,
  },
  {
    id: "p2",
    title: "Smart Watch with Fitness Tracker - Waterproof",
    price: 149.99,
    originalPrice: 199.99,
    rating: 4.3,
    reviews: 856,
    image: generatePlaceholder("Smart Watch", "#f0e8f0"),
    prime: true,
  },
  {
    id: "p3",
    title: "Laptop Stand Adjustable - Ergonomic Design",
    price: 29.99,
    originalPrice: 39.99,
    rating: 4.7,
    reviews: 2341,
    image: generatePlaceholder("Laptop Stand", "#f8f0e8"),
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

export default function App() {
  // --- Session and UI state ---
  const [sessionId, setSessionId] = useState(randomSession());
  const [sessionStartTime] = useState(new Date());
  const [sessionTimer, setSessionTimer] = useState(0);
  const [status, setStatus] = useState({ risk: "human", score: 0.25, features: { total_score: 25, weighted_score: 25 } });
  const [cart, setCart] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [showCart, setShowCart] = useState(false);
  const [showCheckout, setShowCheckout] = useState(false);
  const [showRiskDetails, setShowRiskDetails] = useState(false);
  const [showCaptcha, setShowCaptcha] = useState(false);
  const [captchaChallenge, setCaptchaChallenge] = useState(null);
  const [captchaAnswer, setCaptchaAnswer] = useState("");
  const [captchaVerifying, setCaptchaVerifying] = useState(false);
  const [captchaProgress, setCaptchaProgress] = useState("");
  const [captchaTimer, setCaptchaTimer] = useState(60);
  const [captchaAttempts, setCaptchaAttempts] = useState(0);
  const [captchaRiskLevel, setCaptchaRiskLevel] = useState("medium");
  const captchaInputRef = useRef(null);

  const [showSandbox, setShowSandbox] = useState(false);
  const [sandboxReason, setSandboxReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [viewedProducts, setViewedProducts] = useState(new Set());

  // --- Session metadata for risk scoring (mouse, scroll, timing, etc.) ---
  const [sessionMetadata, setSessionMetadata] = useState({
    idle_minutes: 0,
    last_view_or_click_time: null,
    page_load_time: new Date(),
    mouse_moved_3s: false,
    scrolling_detected: false,
    interactions_before_cart: 0,
    first_click_time: null,
    add_to_cart_time: null,
    checkout_time: null,
    requests_per_second: 0,
    repeated_cart_checkout_calls: 0,
    rapid_refreshes: 0,
    multiple_checkout_without_nav: false,
    form_submitted_without_focus: false,
    identical_timing_pattern: false,
    no_hesitation_between_steps: false,
    headless_browser: false,
    abnormal_headers: false,
    datacenter_ip: false,
    proxy_ip: false,
    javascript_disabled: false,
    events_blocked: false,
    identical_pattern_across_sessions: false,
    no_randomness: false,
    perfect_repetition: false,
  });

  const [checkoutForm, setCheckoutForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    addressLine1: "",
    addressLine2: "",
    city: "",
    state: "",
    zipCode: "",
    country: "United States",
    paymentMethod: "credit_card",
    cardNumber: "",
    cardName: "",
    expiryDate: "",
    cvv: "",
  });

  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const cartTotal = cart.reduce((sum, item) => sum + (item.product.price * item.quantity), 0);

  console.log("App component rendering", { productsCount: products.length });

  useEffect(() => {
    const timerInterval = setInterval(() => {
      const elapsed = Math.floor((new Date() - sessionStartTime) / 1000);
      setSessionTimer(elapsed);
    }, 1000);

    return () => clearInterval(timerInterval);
  }, [sessionStartTime]);

  /** Format seconds as HH:MM:SS or MM:SS for session timer display. */
  const formatTimer = (seconds) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hrs > 0) {
      return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // --- Page load: attach mouse/scroll/click/touch/keyboard listeners and send interaction_update ---
  useEffect(() => {
    const pageLoadTime = new Date();
    setSessionMetadata(prev => ({
      ...prev,
      page_load_time: pageLoadTime,
      last_view_or_click_time: pageLoadTime,
      idle_minutes: 0
    }));

    let mouseMoved = false;
    let scrollDetected = false;
    let interactionCount = 0;
    let firstClickTime = null;

    const mouseMoveHandler = () => {
      const now = new Date();
      const elapsed = (now - pageLoadTime) / 1000;

      if (!mouseMoved) {
        mouseMoved = true;
        const movedWithin3s = elapsed < 3;

        setSessionMetadata(prev => {
          const updated = {
            ...prev,
            mouse_moved_3s: movedWithin3s,
            mouse_moved_at: now,
            mouse_moved_after_3s: !movedWithin3s,
          };
          console.log(`Mouse moved at ${elapsed.toFixed(2)}s, within_3s: ${movedWithin3s}`);

          const metadataForApi = {
            ...updated,
            page_load_time: updated.page_load_time instanceof Date
              ? updated.page_load_time.toISOString()
              : (updated.page_load_time || new Date().toISOString()),
            first_click_time: updated.first_click_time instanceof Date
              ? updated.first_click_time.toISOString()
              : (updated.first_click_time || null),
            mouse_moved_at: updated.mouse_moved_at instanceof Date
              ? updated.mouse_moved_at.toISOString()
              : (updated.mouse_moved_at || null),
          };

          sendTelemetry({
            session_id: sessionId,
            event_type: "interaction_update",
            timestamp: new Date().toISOString(),
          }, metadataForApi).then(() => {
            setTimeout(() => refreshScore(), 500);
          });

          return updated;
        });
      }
      interactionCount++;
      setSessionMetadata(prev => ({ ...prev, interactions_before_cart: interactionCount }));
    };

    const scrollHandler = () => {
      if (!scrollDetected) {
        scrollDetected = true;
        const now = new Date();
        const elapsed = (now - pageLoadTime) / 1000;

        setSessionMetadata(prev => {
          const updated = {
            ...prev,
            scrolling_detected: true,
            scrolling_detected_at: now,
            scrolling_detected_after_3s: elapsed >= 3
          };
          console.log(`Scrolling detected at ${elapsed.toFixed(2)}s`);

          const metadataForApi = {
            ...updated,
            page_load_time: updated.page_load_time instanceof Date
              ? updated.page_load_time.toISOString()
              : (updated.page_load_time || new Date().toISOString()),
            first_click_time: updated.first_click_time instanceof Date
              ? updated.first_click_time.toISOString()
              : (updated.first_click_time || null),
            scrolling_detected_at: updated.scrolling_detected_at instanceof Date
              ? updated.scrolling_detected_at.toISOString()
              : (updated.scrolling_detected_at || null),
            mouse_moved_at: updated.mouse_moved_at instanceof Date
              ? updated.mouse_moved_at.toISOString()
              : (updated.mouse_moved_at || null),
          };

          sendTelemetry({
            session_id: sessionId,
            event_type: "interaction_update",
            timestamp: new Date().toISOString(),
          }, metadataForApi).then(() => {
            setTimeout(() => refreshScore(), 500);
          });

          return updated;
        });
      }
    };

    const clickHandler = () => {
      if (!firstClickTime) {
        firstClickTime = new Date();
        setSessionMetadata(prev => ({ ...prev, first_click_time: firstClickTime }));
      }
      interactionCount++;
      const now = new Date();
      setSessionMetadata(prev => ({
        ...prev,
        interactions_before_cart: interactionCount,
        last_view_or_click_time: now,
        idle_minutes: 0,
      }));
    };

    const touchHandler = () => {
      interactionCount++;
      setSessionMetadata(prev => ({ ...prev, interactions_before_cart: interactionCount }));
    };

    const keyHandler = (e) => {
      if (e.target && (e.target.id === 'captcha-answer' || e.target.classList.contains('captcha-answer-input'))) {
        return;
      }
      interactionCount++;
      setSessionMetadata(prev => ({ ...prev, interactions_before_cart: interactionCount }));
    };

    const formFocusHandler = (e) => {
      if (e.target && (e.target.id === 'captcha-answer' || e.target.classList.contains('captcha-answer-input'))) {
        return;
      }
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') {
        const focusTime = new Date();
        setSessionMetadata(prev => ({
          ...prev,
          form_focus_times: [...(prev.form_focus_times || []), focusTime]
        }));
      }
    };

    const formInputHandler = (e) => {
      if (e.target && (e.target.id === 'captcha-answer' || e.target.classList.contains('captcha-answer-input'))) {
        return;
      }
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        const inputTime = new Date();
        setSessionMetadata(prev => ({
          ...prev,
          form_input_times: [...(prev.form_input_times || []), inputTime]
        }));
      }
    };

    window.addEventListener('mousemove', mouseMoveHandler);
    window.addEventListener('scroll', scrollHandler, { passive: true });
    window.addEventListener('click', clickHandler);
    window.addEventListener('touchstart', touchHandler, { passive: true });
    window.addEventListener('keydown', keyHandler);
    document.addEventListener('focus', formFocusHandler, true);
    document.addEventListener('input', formInputHandler, true);

    const isHeadless = !window.chrome || navigator.webdriver || window.outerHeight === 0;
    if (isHeadless) {
      setSessionMetadata(prev => ({ ...prev, headless_browser: true }));
    }

    if (typeof window === 'undefined' || typeof document === 'undefined') {
      setSessionMetadata(prev => ({ ...prev, javascript_disabled: true }));
    }

    return () => {
      window.removeEventListener('mousemove', mouseMoveHandler);
      window.removeEventListener('scroll', scrollHandler);
      window.removeEventListener('click', clickHandler);
      window.removeEventListener('touchstart', touchHandler);
      window.removeEventListener('keydown', keyHandler);
      document.removeEventListener('focus', formFocusHandler, true);
      document.removeEventListener('input', formInputHandler, true);
    };
  }, [sessionId]);

  // --- Idle tracking, heartbeat telemetry, and periodic score refresh ---
  useEffect(() => {
    const idleCheckInterval = setInterval(() => {
      setSessionMetadata(prev => {
        const now = new Date();
        let lastViewOrClickTime;

        if (prev.last_view_or_click_time) {
          if (prev.last_view_or_click_time instanceof Date) {
            lastViewOrClickTime = prev.last_view_or_click_time;
          } else if (typeof prev.last_view_or_click_time === 'string') {
            lastViewOrClickTime = new Date(prev.last_view_or_click_time);
          } else {
            lastViewOrClickTime = new Date(prev.last_view_or_click_time);
          }
        } else {
          // Fallback to page_load_time
          if (prev.page_load_time instanceof Date) {
            lastViewOrClickTime = prev.page_load_time;
          } else if (typeof prev.page_load_time === 'string') {
            lastViewOrClickTime = new Date(prev.page_load_time);
          } else {
            lastViewOrClickTime = new Date();
          }
        }

        if (isNaN(lastViewOrClickTime.getTime())) {
          console.error('❌ Invalid last_view_or_click_time, using current time');
          lastViewOrClickTime = now;
        }

        const timeSinceLastViewOrClick = (now - lastViewOrClickTime) / 1000;

        if (timeSinceLastViewOrClick < 0) {
          console.warn(`⚠️ Negative time difference: ${timeSinceLastViewOrClick.toFixed(0)}s. lastViewOrClickTime is in the future!`);
          console.warn(`   lastViewOrClickTime: ${lastViewOrClickTime.toISOString()}`);
          console.warn(`   now: ${now.toISOString()}`);
          lastViewOrClickTime = now;
        }

        if (timeSinceLastViewOrClick >= 60 && timeSinceLastViewOrClick < 86400) {
          const idleTime = timeSinceLastViewOrClick / 60;
          const idleMinutes = Math.floor(idleTime);

          const cappedIdleMinutes = Math.min(idleMinutes, 60);

          if (cappedIdleMinutes !== prev.idle_minutes && cappedIdleMinutes > 0) {
            console.log(`⏱️ IDLE TRACKING: User idle for ${cappedIdleMinutes} minute(s) (${timeSinceLastViewOrClick.toFixed(0)} seconds since last view/click)`);
            console.log(`   last_view_or_click_time: ${lastViewOrClickTime.toISOString()}`);
            console.log(`   now: ${now.toISOString()}`);
            setTimeout(() => refreshScore(), 500);
            return {
              ...prev,
              idle_minutes: cappedIdleMinutes
            };
          }
        } else if (timeSinceLastViewOrClick < 60) {
          if (prev.idle_minutes > 0) {
            console.log(`✅ IDLE RESET: User viewed/clicked - resetting idle timer`);
            return {
              ...prev,
              idle_minutes: 0
            };
          }
        } else {
          console.warn(`⚠️ Invalid time difference: ${timeSinceLastViewOrClick.toFixed(0)} seconds. Resetting idle timer.`);
          if (prev.idle_minutes > 0) {
            return {
              ...prev,
              idle_minutes: 0,
              last_view_or_click_time: now
            };
          }
        }
        return prev;
      });
    }, 10000);

    const sendMetadataUpdate = () => {
      setSessionMetadata(prev => {
        const currentMetadata = {
          ...prev,
          page_load_time: prev.page_load_time instanceof Date
            ? prev.page_load_time.toISOString()
            : (prev.page_load_time || new Date().toISOString()),
          first_click_time: prev.first_click_time instanceof Date
            ? prev.first_click_time.toISOString()
            : (prev.first_click_time || null),
          add_to_cart_time: prev.add_to_cart_time instanceof Date
            ? prev.add_to_cart_time.toISOString()
            : (prev.add_to_cart_time || null),
          checkout_time: prev.checkout_time instanceof Date
            ? prev.checkout_time.toISOString()
            : (prev.checkout_time || null),
        };

        sendTelemetry({
          session_id: sessionId,
          event_type: "heartbeat",
          timestamp: new Date().toISOString(),
        }, currentMetadata).then(() => {
          setTimeout(async () => {
            try {
              const res = await fetchScore(sessionId);
              const weightedScore = res.features?.total_score || res.features?.weighted_score || (res.score * 100) || 25;

              if (res.risk === "bot" || weightedScore >= 91) {
                console.error("🚨 BOT DETECTED in heartbeat - Redirecting to sandbox");
                const reason = encodeURIComponent("bot_detected");
                const currentPath = window.location.pathname;
                const sandboxUrl = `${window.location.origin}${currentPath}?sandbox=true&reason=${reason}`;
                console.error(`HEARTBEAT REDIRECT: ${sandboxUrl}`);
                return;
              }

              refreshScore();
            } catch (err) {
              refreshScore();
            }
          }, 500);
        }).catch(err => {
          console.error("Failed to send heartbeat:", err);
        });

        return prev;
      });
    };

    const initialTimeout = setTimeout(() => {
      sendMetadataUpdate();
      setTimeout(() => refreshScore(), 500);
    }, 1000);

    const interval = setInterval(sendMetadataUpdate, 2000);

    const scoreRefreshInterval = setInterval(() => {
      refreshScore();
    }, 3000);

    return () => {
      clearTimeout(initialTimeout);
      clearInterval(interval);
      clearInterval(scoreRefreshInterval);
      clearInterval(idleCheckInterval);
    };
  }, [sessionId]);

  useEffect(() => {
    if (showCaptcha && captchaChallenge) {
      const timer = setTimeout(() => {
        const input = captchaInputRef.current || document.getElementById('captcha-answer');
        if (input) {
          console.log('Focusing input:', input, 'Disabled:', input.disabled, 'ReadOnly:', input.readOnly);
          input.disabled = false;
          input.readOnly = false;
          input.removeAttribute('readonly');
          input.removeAttribute('disabled');
          input.focus();
          input.click();
          if (input.value !== captchaAnswer) {
            input.value = captchaAnswer;
          }
        } else {
          console.error('CAPTCHA input not found!');
        }
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [showCaptcha, captchaChallenge, captchaAnswer]);

  useEffect(() => {
    if (showCaptcha && captchaChallenge) {
      setCaptchaTimer(60);

      const interval = setInterval(() => {
        setCaptchaTimer((prev) => {
          if (prev <= 1) {
            clearInterval(interval);
            const sandboxUrl = `${window.location.origin}/sandbox?reason=captcha_timeout`;
            window.location.href = sandboxUrl;
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      return () => clearInterval(interval);
    } else {
      setCaptchaTimer(60);
    }
  }, [showCaptcha, captchaChallenge]);

  /** Send a telemetry event (view/add_to_cart/checkout) with current metadata; then re-check score and redirect if bot. */
  const sendEvent = async (event_type, product_id) => {
    const now = new Date();
    const event = {
      session_id: sessionId,
      event_type,
      product_id: product_id || selectedProduct?.id,
      timestamp: now.toISOString(),
      dwell_time: Math.random() * 10 + 2,
      page_depth: Math.floor(Math.random() * 4) + 1,
    };

    let currentMetadata = null;
    setSessionMetadata(prev => {
      currentMetadata = { ...prev };
      return prev; // Don't change state yet
    });

    if (!currentMetadata) {
      currentMetadata = { ...sessionMetadata };
    }

    if (event_type === "add_to_cart") {
      currentMetadata.add_to_cart_time = now;
      currentMetadata.repeated_cart_checkout_calls = (currentMetadata.repeated_cart_checkout_calls || 0) + 1;

      if (currentMetadata.page_load_time) {
        const pageLoad = currentMetadata.page_load_time instanceof Date ? currentMetadata.page_load_time : new Date(currentMetadata.page_load_time);
        const timeSinceLoad = (now - pageLoad) / 1000;
        if (timeSinceLoad < 0.3) {
          currentMetadata.add_to_cart_within_300ms = true;
        }
      }
    }

    if (event_type === "checkout") {
      currentMetadata.checkout_time = now;
      currentMetadata.repeated_cart_checkout_calls = (currentMetadata.repeated_cart_checkout_calls || 0) + 1;

      if (currentMetadata.page_load_time) {
        const pageLoad = currentMetadata.page_load_time instanceof Date ? currentMetadata.page_load_time : new Date(currentMetadata.page_load_time);
        const timeSinceLoad = (now - pageLoad) / 1000;
        if (timeSinceLoad < 1.0) {
          currentMetadata.checkout_within_1s = true;
        }
      }
    }

    if (currentMetadata.page_load_time) {
      const pageLoad = currentMetadata.page_load_time instanceof Date ? currentMetadata.page_load_time : new Date(currentMetadata.page_load_time);
      const timeSinceLoad = (now - pageLoad) / 1000;
      if (timeSinceLoad > 0) {
        const totalEvents = currentMetadata.total_events || 0;
        currentMetadata.total_events = totalEvents + 1;
        currentMetadata.requests_per_second = currentMetadata.total_events / timeSinceLoad;
      }
    }

    if (currentMetadata.first_click_time && currentMetadata.page_load_time) {
      const firstClick = currentMetadata.first_click_time instanceof Date ? currentMetadata.first_click_time : new Date(currentMetadata.first_click_time);
      const pageLoad = currentMetadata.page_load_time instanceof Date ? currentMetadata.page_load_time : new Date(currentMetadata.page_load_time);
      const timeToFirstClick = (firstClick - pageLoad) / 1000;
      if (timeToFirstClick < 0.5) {
        currentMetadata.instant_button_click = true;
      }
    }

    setSessionMetadata(currentMetadata);

    const metadataForApi = {
      ...currentMetadata,
      page_load_time: currentMetadata.page_load_time instanceof Date
        ? currentMetadata.page_load_time.toISOString()
        : (currentMetadata.page_load_time || new Date().toISOString()),
      first_click_time: currentMetadata.first_click_time instanceof Date
        ? currentMetadata.first_click_time.toISOString()
        : (currentMetadata.first_click_time || null),
      add_to_cart_time: currentMetadata.add_to_cart_time instanceof Date
        ? currentMetadata.add_to_cart_time.toISOString()
        : (currentMetadata.add_to_cart_time || null),
      checkout_time: currentMetadata.checkout_time instanceof Date
        ? currentMetadata.checkout_time.toISOString()
        : (currentMetadata.checkout_time || null),
    };


    try {
      await sendTelemetry(event, metadataForApi);
      setTimeout(async () => {
        try {
          const res = await fetchScore(sessionId);
          const weightedScore = res.features?.total_score || res.features?.weighted_score || (res.score * 100) || 25;

          if (res.risk === "bot" || weightedScore >= 91) {
            console.error("🚨🚨🚨 BOT DETECTED IMMEDIATELY 🚨🚨🚨");
            console.error(`Bot detection details: risk=${res.risk}, score=${weightedScore}`);
            console.error("REDIRECTING TO SANDBOX NOW...");

            const reason = encodeURIComponent("bot_detected_consecutive_views");
            const currentPath = window.location.pathname || "/";
            const sandboxUrl = `${window.location.origin}${currentPath}?sandbox=true&reason=${reason}`;

            console.error(`SANDBOX URL: ${sandboxUrl}`);
            console.error("Executing redirect NOW...");

            window.stop();
            window.location.replace(sandboxUrl);

            setTimeout(() => {
              window.location.href = sandboxUrl;
            }, 100);

            return;
          }

          refreshScore();
        } catch (scoreErr) {
          console.error("Failed to check score after event:", scoreErr);
          refreshScore();
        }
      }, 500); // Delay so backend can persist event before we fetch score
    } catch (err) {
      console.error("Failed to send telemetry:", err);
    }
  };

  /** Fetch score from backend and update status; redirect to sandbox if risk is bot or score >= 91. */
  const refreshScore = async () => {
    try {
      const res = await fetchScore(sessionId);
      const weightedScore = res.features?.total_score || res.features?.weighted_score || (res.score * 100) || 25;

      console.log("=== SCORE UPDATE ===");
      console.log(`Session: ${sessionId.slice(0, 8)}...`);
      console.log(`Risk Level: ${res.risk}`);
      console.log(`Raw Score: ${weightedScore} / 100`);
      console.log(`Normalized: ${res.score.toFixed(3)} (0-1 scale)`);
      console.log(`User Events: ${res.features?.user_event_count || 0}`);
      console.log(`Total Events: ${res.features?.event_count || 0}`);
      if (res.features?.details && res.features.details.length > 0) {
        console.log(`Penalties:`, res.features.details.filter(d => d.includes('+') || d.includes('BOT')));
      }
      console.log("===================");

      if (res.risk === "bot" || weightedScore >= 91) {
        console.error("🚨🚨🚨 BOT DETECTED IN SCORE REFRESH 🚨🚨🚨");
        console.error(`Bot details: risk=${res.risk}, score=${weightedScore}`);
        console.error("REDIRECTING TO SANDBOX IMMEDIATELY...");

        const reason = encodeURIComponent("bot_detected_consecutive_views");
        const currentPath = window.location.pathname || "/";
        const sandboxUrl = `${window.location.origin}${currentPath}?sandbox=true&reason=${reason}`;

        console.error(`SANDBOX URL: ${sandboxUrl}`);

        return;
      }

      setStatus({
        risk: res.risk,
        score: res.score,
        lastFetched: Date.now(),
        features: {
          ...res.features,
          total_score: weightedScore,
          weighted_score: weightedScore,
        }
      });
    } catch (err) {
      console.error("Failed to fetch score:", err);
      if (err.response?.status === 404) {
        console.log("Session not found yet, using default human score (25)");
        setStatus({ risk: "human", score: 0.25, lastFetched: Date.now(), features: { total_score: 25, weighted_score: 25 } });
      } else {
        console.error("Score fetch error:", err.message);
        setStatus({ risk: "human", score: 0.25, lastFetched: Date.now(), features: { total_score: 25, weighted_score: 25 } });
      }
    }
  };

  /** Build list of risk explanations for the Risk Details panel (score, repetition, engagement, etc.). */
  const getRiskExplanation = () => {
    const features = status.features || {};
    const score = status.score || 0;
    const risk = status.risk;

    const explanations = [];

    explanations.push({
      label: "Purchase Intent Score",
      value: score.toFixed(3),
      description: `This is the probability (0-1) that you're a genuine shopper. Higher = more likely genuine.`
    });

    explanations.push({
      label: "Risk Level",
      value: risk,
      description: risk === "Safe"
        ? "Score ≥ 0.7: Normal shopping behavior detected"
        : risk === "Doubtful"
          ? "Score 0.4-0.7: Some suspicious patterns, but may be normal"
          : "Score < 0.4: Bot-like behavior detected"
    });

    if (features.total_views) {
      explanations.push({
        label: "Total Views",
        value: Math.round(features.total_views),
        description: "Number of products you've viewed"
      });
    }

    if (features.repetition_ratio !== undefined) {
      const repPercent = (features.repetition_ratio * 100).toFixed(1);
      explanations.push({
        label: "Repetition Ratio",
        value: `${repPercent}%`,
        description: repPercent > 60
          ? "⚠️ High: You're viewing the same products repeatedly (bot-like)"
          : repPercent > 40
            ? "⚠️ Moderate: Some repetition detected"
            : "✓ Low: You're viewing diverse products (human-like)"
      });
    }

    if (features.engagement_ratio !== undefined) {
      const engPercent = (features.engagement_ratio * 100).toFixed(1);
      explanations.push({
        label: "Engagement Ratio",
        value: `${engPercent}%`,
        description: engPercent > 20
          ? "✓ Good: You're adding items to cart (human-like)"
          : engPercent > 10
            ? "⚠️ Low: Few add-to-cart actions"
            : "⚠️ Very Low: No meaningful actions (bot-like)"
      });
    }

    if (features.events_per_minute) {
      explanations.push({
        label: "Events Per Minute",
        value: Math.round(features.events_per_minute),
        description: features.events_per_minute > 30
          ? "⚠️ Very High: Too fast for human browsing (bot-like)"
          : features.events_per_minute > 15
            ? "⚠️ High: Faster than normal"
            : "✓ Normal: Reasonable browsing speed"
      });
    }

    if (features.unique_ratio !== undefined) {
      const uniquePercent = (features.unique_ratio * 100).toFixed(1);
      explanations.push({
        label: "Product Diversity",
        value: `${uniquePercent}%`,
        description: uniquePercent > 50
          ? "✓ Good: Viewing diverse products (human-like)"
          : uniquePercent > 30
            ? "⚠️ Low: Limited product variety"
            : "⚠️ Very Low: Very repetitive (bot-like)"
      });
    }

    if (features.avg_dwell_time !== undefined) {
      explanations.push({
        label: "Avg Time on Page",
        value: `${features.avg_dwell_time.toFixed(1)}s`,
        description: features.avg_dwell_time > 5
          ? "✓ Good: Spending time reading (human-like)"
          : features.avg_dwell_time > 2
            ? "⚠️ Short: Quick browsing"
            : "⚠️ Very Short: Too fast (bot-like)"
      });
    }

    return explanations;
  };

  // --- Product and cart handlers ---

  const handleProductView = async (product) => {
    setSelectedProduct(product);
    if (!viewedProducts.has(product.id)) {
      setViewedProducts(new Set([...viewedProducts, product.id]));
    }
    const now = new Date();
    setSessionMetadata(prev => ({
      ...prev,
      last_view_or_click_time: now,
      idle_minutes: 0,
    }));

    await sendEvent("view", product.id);

    try {
      const currentStatus = await fetchScore(sessionId);
      setStatus({
        risk: currentStatus.risk,
        score: currentStatus.score,
        features: currentStatus.features || {}
      });

      const riskScore = (currentStatus.score * 100);

      if (riskScore > 30) {
        const res = await requestMitigation(sessionId, { sensitive_action: true });

        if (res.action === "captcha") {
          const currentRisk = currentStatus.risk || "medium";
          setCaptchaRiskLevel(currentRisk);
          if (!showCaptcha) {
            setCaptchaAttempts(0);
            setCaptchaChallenge(res.detail);
            setShowCaptcha(true);
          }
        } else if (res.action === "sandbox") {
          const sandboxUrl = `${window.location.origin}/sandbox?reason=${res.detail?.reason || "security_violation"}`;
          window.location.href = sandboxUrl;
        }
      }
    } catch (err) {
      console.error("Risk check failed:", err);
    }
  };

  const addProductToCart = async (product) => {
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

    await sendEvent("add_to_cart", product.id);
    setShowCart(true);
    setSelectedProduct(null);
  };

  const handleAddToCart = async (product) => {
    await addProductToCart(product);
  };

  const handleRemoveFromCart = (productId) => {
    setCart(prevCart => prevCart.filter(item => item.product.id !== productId));
  };

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

  /** Start checkout: if risk > 30, call mitigate with sensitive_action; show slider or redirect to sandbox. */
  const handleCheckout = async () => {
    if (cart.length === 0) {
      setShowCart(true);
      return;
    }

    try {
      const currentStatus = await fetchScore(sessionId);
      setStatus({
        risk: currentStatus.risk,
        score: currentStatus.score,
        features: currentStatus.features || {}
      });

      const riskScore = (currentStatus.score * 100);

      if (riskScore <= 30) {
        setShowCheckout(true);
        setShowCart(false);
        await sendEvent("checkout");
      } else {
        const res = await requestMitigation(sessionId, { sensitive_action: true });
        if (res.action === "slider" || res.action === "captcha") {
          const currentRisk = currentStatus.risk || "medium";
          setCaptchaRiskLevel(currentRisk);
          setCaptchaAttempts(0);
          setCaptchaChallenge(res.detail);
          setShowCaptcha(true);
        } else if (res.action === "sandbox") {
          const sandboxUrl = `${window.location.origin}/sandbox?reason=${res.detail?.reason || "security_violation"}`;
          window.location.href = sandboxUrl;
        } else {
          setShowCheckout(true);
          setShowCart(false);
          await sendEvent("checkout");
        }
      }
    } catch (err) {
      console.error("Failed to check risk:", err);
      setShowCheckout(true);
      setShowCart(false);
      await sendEvent("checkout");
    }
  };

  /** Submit slider CAPTCHA result to backend; on success proceed to checkout, on failure retry or redirect to sandbox. */
  const handleSliderVerify = async (data) => {
    setCaptchaVerifying(true);
    setCaptchaProgress("Verifying trajectory...");

    try {
      const verifyRes = await requestMitigation(sessionId, {
        sensitive_action: true,
        slider_offset: data.offset,
        trajectory: data.trajectory,
        challenge_data: captchaChallenge,
      });

      if (verifyRes.action === "allow") {
        setCaptchaProgress("✓ Verified! Proceeding...");
        setTimeout(async () => {
          setShowCaptcha(false);
          setCaptchaChallenge(null);
          setCaptchaTimer(60);
          setCaptchaAttempts(0);

          if (cart.length > 0) {
            setShowCheckout(true);
            setShowCart(false);
            await sendEvent("checkout");
          }
        }, 1000);
      } else if (verifyRes.action === "slider" && verifyRes.detail?.retry) {
        const newAttempts = captchaAttempts + 1;
        setCaptchaAttempts(newAttempts);
        const maxAttempts = captchaRiskLevel === "high" ? 2 : 3;

        if (newAttempts >= maxAttempts) {
          const sandboxUrl = `${window.location.origin}/sandbox?reason=max_slider_attempts_exceeded`;
          window.location.href = sandboxUrl;
          return;
        }

        setCaptchaProgress(`✗ Verification failed: ${verifyRes.detail.error}. Try again. (${newAttempts}/${maxAttempts})`);
        // Optionally get new challenge?
      } else {
        const sandboxUrl = `${window.location.origin}/sandbox?reason=${verifyRes.detail?.reason || "security_violation"}`;
        window.location.href = sandboxUrl;
      }
    } catch (err) {
      console.error("Slider verification failed:", err);
      const newAttempts = captchaAttempts + 1;
      setCaptchaAttempts(newAttempts);
      setCaptchaProgress("Error verifying. Please try again.");
    } finally {
      setCaptchaVerifying(false);
    }
  };

  /** Submit checkout form (after CAPTCHA if required); show success and clear cart. */
  const handleCheckoutSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Refresh score once more before final checkout submit
      const updatedStatus = await fetchScore(sessionId);
      setStatus({
        risk: updatedStatus.risk,
        score: updatedStatus.score,
        features: updatedStatus.features || {},
      });

      console.log("Checkout submitted:", checkoutForm);
      alert(
        `Order placed successfully! Total: $${cartTotal.toFixed(
          2
        )}\n\nOrder will be delivered to:\n${checkoutForm.addressLine1}\n${
          checkoutForm.city
        }, ${checkoutForm.state} ${checkoutForm.zipCode}`
      );

      setCart([]);
      setShowCheckout(false);
      setCheckoutForm({
        firstName: "",
        lastName: "",
        email: "",
        phone: "",
        addressLine1: "",
        addressLine2: "",
        city: "",
        state: "",
        zipCode: "",
        country: "United States",
        paymentMethod: "credit_card",
        cardNumber: "",
        cardName: "",
        expiryDate: "",
        cvv: "",
      });
    } catch (err) {
      console.error("Checkout failed:", err);
      alert("Checkout failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleFormChange = (field, value) => {
    setCheckoutForm((prev) => ({ ...prev, [field]: value }));
  };

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
      <header className="header">
        <div className="header-top">
          <div className="logo">amazon</div>
          <div className="search-container">
            <select className="search-category">
              <option>All</option>
              <option>Electronics</option>
              <option>Computers</option>
              <option>Accessories</option>
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
          <div className="header-right">
            <div className="header-option">
              <span className="option-line1">Hello, Sign in</span>
              <span className="option-line2">Account & Lists</span>
            </div>
            <div className="header-option">
              <span className="option-line1">Returns</span>
              <span className="option-line2">& Orders</span>
            </div>
            <div className="cart" onClick={() => setShowCart(!showCart)}>
              <span className="cart-count">{cartCount}</span>
              <span className="cart-text">Cart</span>
            </div>
          </div>
        </div>
        <nav className="nav">
          <a href="#" className="nav-link">All</a>
          <a href="#" className="nav-link">Today's Deals</a>
          <a href="#" className="nav-link">Customer Service</a>
          <a href="#" className="nav-link">Registry</a>
          <a href="#" className="nav-link">Gift Cards</a>
          <a href="#" className="nav-link">Sell</a>
          <div className="nav-right">
            <span className="session-info">
              Session: {sessionId.slice(0, 8)}... | Timer: {formatTimer(sessionTimer)} | Risk:{" "}
              <span
                className={`risk-badge ${status.risk === "human" || status.risk === "Safe"
                  ? "safe"
                  : status.risk === "medium" || status.risk === "Doubtful"
                    ? "doubtful"
                    : status.risk === "high" || status.risk === "Suspicious"
                      ? "suspicious"
                      : status.risk === "bot"
                        ? "suspicious"
                        : "unknown"
                  }`}
              >
                {status.risk === "human" ? "Human" : status.risk === "medium" ? "Medium" : status.risk === "high" ? "High" : status.risk === "bot" ? "Bot" : status.risk}
              </span>{" "}
              | Score: <strong style={{ color: status.features?.weighted_score <= 30 ? '#28a745' : status.features?.weighted_score <= 60 ? '#ffc107' : status.features?.weighted_score <= 90 ? '#fd7e14' : '#dc3545' }}>
                {status.features?.weighted_score || status.features?.total_score || Math.round((status.score || 0.25) * 100)}
              </strong> / 100
              <span style={{ fontSize: '0.8em', marginLeft: '8px', color: '#666' }}>
                ({status.features?.user_event_count || 0} actions)
              </span>
            </span>
          </div>
        </nav>
      </header>

      <main className="main-content">
        {showRiskDetails && (
          <div className="risk-details-panel">
            <div className="risk-details-header">
              <h3>Risk Analysis Details</h3>
              <button className="close-button" onClick={() => setShowRiskDetails(false)}>×</button>
            </div>
            <div className="risk-explanation">
              <div className="risk-summary">
                <div className="risk-summary-item">
                  <span className="risk-label">Current Risk:</span>
                  <span className={`risk-value ${status.risk.toLowerCase()}`}>{status.risk}</span>
                </div>
                <div className="risk-summary-item">
                  <span className="risk-label">Risk Score:</span>
                  <span className="risk-value" style={{ fontSize: '1.5em', fontWeight: 'bold', color: status.features?.weighted_score <= 30 ? '#28a745' : status.features?.weighted_score <= 60 ? '#ffc107' : status.features?.weighted_score <= 90 ? '#fd7e14' : '#dc3545' }}>
                    {status.features?.weighted_score || status.features?.total_score || Math.round((status.score || 0.25) * 100)} / 100
                  </span>
                  <span className="risk-note">(Lower = Better | 0-30 = Human, 31-60 = Medium, 61-90 = High, 91+ = Bot)</span>
                </div>
                <div className="risk-summary-item">
                  <span className="risk-label">Normalized Score:</span>
                  <span className="risk-value">{(status.score || 0.25).toFixed(3)}</span>
                  <span className="risk-note">(0.0-1.0 scale for compatibility)</span>
                </div>
              </div>

              <div className="risk-thresholds">
                <h4>Risk Thresholds:</h4>
                <ul>
                  <li><span className="threshold-safe">Safe (≥0.7):</span> Normal shopping behavior</li>
                  <li><span className="threshold-doubtful">Doubtful (0.4-0.7):</span> Some suspicious patterns</li>
                  <li><span className="threshold-suspicious">Suspicious (&lt;0.4):</span> Bot-like behavior detected</li>
                </ul>
              </div>

              <div className="feature-breakdown">
                <h4>Behavior Analysis:</h4>
                {getRiskExplanation().map((item, idx) => (
                  <div key={idx} className="feature-item">
                    <div className="feature-header">
                      <span className="feature-label">{item.label}:</span>
                      <span className="feature-value">{item.value}</span>
                    </div>
                    <div className="feature-description">{item.description}</div>
                  </div>
                ))}
              </div>

              <div className="risk-tips">
                <h4>💡 Tips to Improve Your Score:</h4>
                <ul>
                  <li>View different products (not the same ones repeatedly)</li>
                  <li>Spend time reading product details (dwell time)</li>
                  <li>Add items to cart (shows engagement)</li>
                  <li>Browse at a normal pace (not too fast)</li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {showSandbox && (
          <div className="sandbox-page">
            <div className="sandbox-content">
              <div className="sandbox-icon">🚫</div>
              <h1>Access Restricted</h1>
              <p className="sandbox-message">
                {sandboxReason || "Your session has been flagged for suspicious activity."}
              </p>
              <p className="sandbox-description">
                For security reasons, your access to this website has been temporarily restricted.
                This may be due to multiple failed verification attempts or suspicious behavior patterns.
              </p>
              <div className="sandbox-actions">
                <button
                  className="btn-sandbox-refresh"
                  onClick={() => {
                    window.location.reload();
                  }}
                >
                  Refresh Page
                </button>
                <button
                  className="btn-sandbox-home"
                  onClick={() => {
                    window.location.href = "/";
                  }}
                >
                  Go to Homepage
                </button>
              </div>
            </div>
          </div>
        )}

        {showSandbox && (
          <div className="sandbox-page">
            <div className="sandbox-content">
              <div className="sandbox-icon">🚫</div>
              <h1>Access Restricted</h1>
              <p className="sandbox-message">
                {sandboxReason || "Your session has been flagged for suspicious activity."}
              </p>
              <p className="sandbox-description">
                For security reasons, your access to this website has been temporarily restricted.
                This may be due to multiple failed verification attempts or suspicious behavior patterns.
              </p>
              <div className="sandbox-actions">
                <button
                  className="btn-sandbox-refresh"
                  onClick={() => {
                    window.location.reload();
                  }}
                >
                  Refresh Page
                </button>
                <button
                  className="btn-sandbox-home"
                  onClick={() => {
                    window.location.href = "/";
                  }}
                >
                  Go to Homepage
                </button>
              </div>
            </div>
          </div>
        )}

        {showCaptcha && !showSandbox && (
          <div
            className="slider-captcha-modal"
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1000
            }}
            onClick={(e) => {
              // Close modal if clicking on backdrop (not content)
              if (e.target === e.currentTarget) {
                setShowCaptcha(false);
                setCaptchaChallenge(null);
                setCaptchaTimer(60);
                setCaptchaAttempts(0);
              }
            }}
          >
            <div style={{
              background: 'white',
              borderRadius: '8px',
              maxWidth: '400px',
              width: '100%',
              boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
              overflow: 'hidden'
            }}>
              <div style={{ padding: '20px', borderBottom: '1px solid #eee', textAlign: 'center' }}>
                <h3 style={{ margin: '0 0 10px 0' }}>🧩 Security Check</h3>
                <p style={{ margin: '0', color: '#666' }}>Complete the puzzle to verify you are human.</p>
                {captchaProgress && (
                  <div style={{
                    marginTop: '10px',
                    fontWeight: 'bold',
                    color: captchaProgress.includes('✓') ? '#28a745' : captchaProgress.includes('✗') ? '#dc3545' : '#007bff'
                  }}>
                    {captchaProgress}
                  </div>
                )}
              </div>
              <div style={{ padding: '20px', display: 'flex', justifyContent: 'center' }}>
                <SliderCaptcha
                  challenge={captchaChallenge}
                  onVerify={handleSliderVerify}
                />
              </div>
              <div style={{
                padding: '15px',
                textAlign: 'center',
                borderTop: '1px solid #eee',
                background: '#f8f9fa'
              }}>
                <button
                  onClick={() => {
                    setShowCaptcha(false);
                    setCaptchaChallenge(null);
                    setCaptchaTimer(60);
                    setCaptchaAttempts(0);
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#666',
                    textDecoration: 'underline',
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {showCheckout ? (
          <div className="checkout-page">
            <div className="checkout-header">
              <h2>Checkout</h2>
              <button className="back-button" onClick={() => { setShowCheckout(false); setShowCart(true); }}>
                ← Back to Cart
              </button>
            </div>

            <div className="checkout-content">
              <div className="checkout-form-section">
                <form onSubmit={handleCheckoutSubmit}>
                  <div className="form-section">
                    <h3>1. Shipping Address</h3>
                    <div className="form-row">
                      <div className="form-group">
                        <label>First Name *</label>
                        <input
                          type="text"
                          required
                          value={checkoutForm.firstName}
                          onChange={(e) => handleFormChange("firstName", e.target.value)}
                          placeholder="John"
                        />
                      </div>
                      <div className="form-group">
                        <label>Last Name *</label>
                        <input
                          type="text"
                          required
                          value={checkoutForm.lastName}
                          onChange={(e) => handleFormChange("lastName", e.target.value)}
                          placeholder="Doe"
                        />
                      </div>
                    </div>

                    <div className="form-group">
                      <label>Email *</label>
                      <input
                        type="email"
                        required
                        value={checkoutForm.email}
                        onChange={(e) => handleFormChange("email", e.target.value)}
                        placeholder="john.doe@example.com"
                      />
                    </div>

                    <div className="form-group">
                      <label>Phone Number *</label>
                      <input
                        type="tel"
                        required
                        value={checkoutForm.phone}
                        onChange={(e) => handleFormChange("phone", e.target.value)}
                        placeholder="+1 (555) 123-4567"
                      />
                    </div>

                    <div className="form-group">
                      <label>Address Line 1 *</label>
                      <input
                        type="text"
                        required
                        value={checkoutForm.addressLine1}
                        onChange={(e) => handleFormChange("addressLine1", e.target.value)}
                        placeholder="123 Main Street"
                      />
                    </div>

                    <div className="form-group">
                      <label>Address Line 2 (Optional)</label>
                      <input
                        type="text"
                        value={checkoutForm.addressLine2}
                        onChange={(e) => handleFormChange("addressLine2", e.target.value)}
                        placeholder="Apartment, suite, etc."
                      />
                    </div>

                    <div className="form-row">
                      <div className="form-group">
                        <label>City *</label>
                        <input
                          type="text"
                          required
                          value={checkoutForm.city}
                          onChange={(e) => handleFormChange("city", e.target.value)}
                          placeholder="New York"
                        />
                      </div>
                      <div className="form-group">
                        <label>State/Province *</label>
                        <input
                          type="text"
                          required
                          value={checkoutForm.state}
                          onChange={(e) => handleFormChange("state", e.target.value)}
                          placeholder="NY"
                        />
                      </div>
                      <div className="form-group">
                        <label>ZIP/Postal Code *</label>
                        <input
                          type="text"
                          required
                          value={checkoutForm.zipCode}
                          onChange={(e) => handleFormChange("zipCode", e.target.value)}
                          placeholder="10001"
                        />
                      </div>
                    </div>

                    <div className="form-group">
                      <label>Country *</label>
                      <select
                        required
                        value={checkoutForm.country}
                        onChange={(e) => handleFormChange("country", e.target.value)}
                      >
                        <option value="United States">United States</option>
                        <option value="Canada">Canada</option>
                        <option value="United Kingdom">United Kingdom</option>
                        <option value="Australia">Australia</option>
                        <option value="India">India</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>
                  </div>

                  <div className="form-section">
                    <h3>2. Payment Method</h3>
                    <div className="form-group">
                      <label>Payment Method *</label>
                      <select
                        required
                        value={checkoutForm.paymentMethod}
                        onChange={(e) => handleFormChange("paymentMethod", e.target.value)}
                      >
                        <option value="credit_card">Credit/Debit Card</option>
                        <option value="paypal">PayPal</option>
                        <option value="amazon_pay">Amazon Pay</option>
                      </select>
                    </div>

                    {checkoutForm.paymentMethod === "credit_card" && (
                      <>
                        <div className="form-group">
                          <label>Card Number *</label>
                          <input
                            type="text"
                            required
                            maxLength="19"
                            value={checkoutForm.cardNumber}
                            onChange={(e) => {
                              const value = e.target.value.replace(/\s/g, "").replace(/(.{4})/g, "$1 ").trim();
                              handleFormChange("cardNumber", value);
                            }}
                            placeholder="1234 5678 9012 3456"
                          />
                        </div>

                        <div className="form-group">
                          <label>Name on Card *</label>
                          <input
                            type="text"
                            required
                            value={checkoutForm.cardName}
                            onChange={(e) => handleFormChange("cardName", e.target.value)}
                            placeholder="JOHN DOE"
                          />
                        </div>

                        <div className="form-row">
                          <div className="form-group">
                            <label>Expiry Date *</label>
                            <input
                              type="text"
                              required
                              maxLength="5"
                              value={checkoutForm.expiryDate}
                              onChange={(e) => {
                                let value = e.target.value.replace(/\D/g, "");
                                if (value.length >= 2) {
                                  value = value.slice(0, 2) + "/" + value.slice(2, 4);
                                }
                                handleFormChange("expiryDate", value);
                              }}
                              placeholder="MM/YY"
                            />
                          </div>
                          <div className="form-group">
                            <label>CVV *</label>
                            <input
                              type="text"
                              required
                              maxLength="4"
                              value={checkoutForm.cvv}
                              onChange={(e) => handleFormChange("cvv", e.target.value.replace(/\D/g, ""))}
                              placeholder="123"
                            />
                          </div>
                        </div>
                      </>
                    )}
                  </div>

                  <div className="form-actions">
                    <button type="submit" className="btn-place-order" disabled={loading}>
                      {loading ? "Processing..." : `Place your order ($${cartTotal.toFixed(2)})`}
                    </button>
                  </div>
                </form>
              </div>

              <div className="checkout-summary">
                <h3>Order Summary</h3>
                <div className="order-items">
                  {cart.map((item) => (
                    <div key={item.product.id} className="order-item">
                      <div className="order-item-image">
                        <img src={item.product.image} alt={item.product.title} />
                      </div>
                      <div className="order-item-details">
                        <div className="order-item-title">{item.product.title}</div>
                        <div className="order-item-quantity">Quantity: {item.quantity}</div>
                        <div className="order-item-price">${(item.product.price * item.quantity).toFixed(2)}</div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="order-totals">
                  <div className="total-row">
                    <span>Subtotal ({cartCount} {cartCount === 1 ? 'item' : 'items'}):</span>
                    <span>${cartTotal.toFixed(2)}</span>
                  </div>
                  <div className="total-row">
                    <span>Shipping:</span>
                    <span>Free</span>
                  </div>
                  <div className="total-row">
                    <span>Tax:</span>
                    <span>${(cartTotal * 0.08).toFixed(2)}</span>
                  </div>
                  <div className="total-row total-final">
                    <span>Order Total:</span>
                    <span>${(cartTotal * 1.08).toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : showCart ? (
          <div className="cart-view">
            <div className="cart-header">
              <h2>Shopping Cart ({cartCount} {cartCount === 1 ? 'item' : 'items'})</h2>
              <button className="back-button" onClick={() => setShowCart(false)}>
                ← Continue Shopping
              </button>
            </div>
            {cart.length === 0 ? (
              <div className="empty-cart">
                <p>Your cart is empty.</p>
                <button className="btn-add-cart" onClick={() => setShowCart(false)}>
                  Start Shopping
                </button>
              </div>
            ) : (
              <>
                <div className="cart-items">
                  {cart.map((item) => (
                    <div key={item.product.id} className="cart-item">
                      <div className="cart-item-image">
                        <img src={item.product.image} alt={item.product.title} />
                      </div>
                      <div className="cart-item-details">
                        <h3>{item.product.title}</h3>
                        <div className="cart-item-price">${item.product.price.toFixed(2)}</div>
                        {item.product.prime && <div className="prime-badge-small">Prime</div>}
                      </div>
                      <div className="cart-item-quantity">
                        <label>Qty:</label>
                        <select
                          value={item.quantity}
                          onChange={(e) => handleUpdateQuantity(item.product.id, parseInt(e.target.value))}
                        >
                          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(num => (
                            <option key={num} value={num}>{num}</option>
                          ))}
                        </select>
                        <button
                          className="remove-button"
                          onClick={() => handleRemoveFromCart(item.product.id)}
                        >
                          Delete
                        </button>
                      </div>
                      <div className="cart-item-subtotal">
                        ${(item.product.price * item.quantity).toFixed(2)}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="cart-summary">
                  <div className="cart-total">
                    <span className="subtotal-label">Subtotal ({cartCount} {cartCount === 1 ? 'item' : 'items'}):</span>
                    <span className="subtotal-amount">
                      ${cart.reduce((sum, item) => sum + (item.product.price * item.quantity), 0).toFixed(2)}
                    </span>
                  </div>
                  <button className="btn-buy-now" onClick={() => { setShowCart(false); handleCheckout(); }} style={{ width: '100%', marginTop: '15px' }}>
                    Proceed to Checkout
                  </button>
                </div>
              </>
            )}
          </div>
        ) : selectedProduct ? (
          <div className="product-detail">
            <button className="back-button" onClick={() => setSelectedProduct(null)}>
              ← Back to Products
            </button>
            <div className="product-detail-content">
              <div className="product-image-large">
                <img
                  src={selectedProduct.image}
                  alt={selectedProduct.title}
                  onError={(e) => {
                    e.target.src = generatePlaceholder(selectedProduct.title.slice(0, 10), "#f0f0f0");
                  }}
                />
              </div>
              <div className="product-info">
                <h1>{selectedProduct.title}</h1>
                <div className="product-rating">
                  {renderStars(selectedProduct.rating)}
                  <a href="#" className="rating-link">
                    {selectedProduct.reviews.toLocaleString()} ratings
                  </a>
                </div>
                <div className="product-price">
                  <span className="price-current">${selectedProduct.price.toFixed(2)}</span>
                  {selectedProduct.originalPrice && (
                    <span className="price-original">${selectedProduct.originalPrice.toFixed(2)}</span>
                  )}
                </div>
                {selectedProduct.prime && (
                  <div className="prime-badge">✓ Prime</div>
                )}
                <div className="product-actions">
                  <button
                    className="btn-add-cart"
                    onClick={() => handleAddToCart(selectedProduct)}
                  >
                    Add to Cart
                  </button>
                  <button className="btn-buy-now">Buy Now</button>
                </div>
                <div className="product-description">
                  <h3>About this item</h3>
                  <p>
                    High-quality product with excellent features. Perfect for everyday use.
                    Includes warranty and customer support. Fast shipping available.
                  </p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="banner">
              <h2>Shop deals in Electronics</h2>
            </div>
            <div className="products-grid">
              {filteredProducts.map((product) => (
                <div
                  key={product.id}
                  className="product-card"
                  onClick={() => handleProductView(product)}
                >
                  <div className="product-image">
                    <img
                      src={product.image}
                      alt={product.title}
                      onError={(e) => {
                        e.target.src = generatePlaceholder(product.title.slice(0, 10), "#f0f0f0");
                      }}
                    />
                  </div>
                  <div className="product-details">
                    <h3 className="product-title">{product.title}</h3>
                    <div className="product-rating">
                      {renderStars(product.rating)}
                      <span className="rating-count">({product.reviews})</span>
                    </div>
                    <div className="product-price">
                      <span className="price-current">${product.price.toFixed(2)}</span>
                      {product.originalPrice && (
                        <span className="price-original">${product.originalPrice.toFixed(2)}</span>
                      )}
                    </div>
                    {product.prime && (
                      <div className="prime-badge-small">Prime</div>
                    )}
                    <button
                      className="btn-add-cart-small"
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
          </>
        )}
      </main>

      <footer className="footer">
        <div className="footer-content">
          <div className="footer-section">
            <h4>Get to Know Us</h4>
            <a href="#">Careers</a>
            <a href="#">About Amazon</a>
            <a href="#">Investor Relations</a>
          </div>
          <div className="footer-section">
            <h4>Make Money with Us</h4>
            <a href="#">Sell products on Amazon</a>
            <a href="#">Sell on Amazon Business</a>
            <a href="#">Become an Affiliate</a>
          </div>
          <div className="footer-section">
            <h4>Amazon Payment Products</h4>
            <a href="#">Amazon Business Card</a>
            <a href="#">Shop with Points</a>
            <a href="#">Reload Your Balance</a>
          </div>
        </div>
        <div className="footer-bottom">
          <p>© 2024 Amazon.com, Inc. or its affiliates (PIA-Shield Demo)</p>
        </div>
      </footer>
    </div>
  );
}
