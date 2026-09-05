"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useCartStore } from "@/lib/store/cartStore";
import {
  processCheckout,
  applyManualCoupon,
} from "@/lib/graphql/checkout";
import { CheckoutInput } from "@/types/checkout";
import { cn, extractNumericPrice, calculateDisplayTotals } from "@/lib/utils";

export default function CheckoutForm() {
  const router = useRouter();
  const { items, clearCart, promotion } = useCartStore();
  const { subtotal: subtotalPrice, discount: promotionDiscount, total: discountedSubtotal } =
    calculateDisplayTotals(items, promotion);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [promoCode, setPromoCode] = useState("");
const [appliedPromoCode, setAppliedPromoCode] = useState<string | null>(null);
const [promoMessage, setPromoMessage] = useState<string | null>(null);
const [promoError, setPromoError] = useState<string | null>(null);
const [isApplyingPromo, setIsApplyingPromo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successData, setSuccessData] = useState<{
    orderNumber: string;
    total: string;
    status: string;
  } | null>(null);

  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    address1: "",
    city: "",
    state: "",
    postcode: "",
    country: "PK", // Defaulting to Pakistan as per currency hint (Rs)
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    setSuccessData(null);

    // Comprehensive client-side validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
      setError('Please enter a valid email address (e.g., name@example.com).');
      setIsSubmitting(false);
      return;
    }

    // Validate phone: remove spaces/dashes and check length
    const cleanPhone = formData.phone.replace(/[\s-]/g, '');
    if (cleanPhone.length < 10 || !/^[0-9+]+$/.test(cleanPhone)) {
      setError('Please enter a valid phone number (at least 10 digits, numbers only).');
      setIsSubmitting(false);
      return;
    }

    // Validate required fields
    if (!formData.firstName.trim() || !formData.lastName.trim()) {
      setError('First name and last name are required.');
      setIsSubmitting(false);
      return;
    }

    if (!formData.address1.trim() || !formData.city.trim() || !formData.postcode.trim()) {
      setError('Complete address (street, city, postcode) is required.');
      setIsSubmitting(false);
      return;
    }

    // Validate cart has items with valid prices
    if (items.length === 0) {
      setError('Your cart is empty. Please add items before checkout.');
      setIsSubmitting(false);
      return;
    }

    // Validate all items have valid databaseId (required by backend)
    const invalidItems = items.filter(item => !item.databaseId || item.databaseId <= 0);
    if (invalidItems.length > 0) {
      setError('Some items in your cart are invalid. Please refresh and try again.');
      setIsSubmitting(false);
      return;
    }

    try {
      const testerSelectionsNote = items
        .filter((item) => item.testerSelections && item.testerSelections.length > 0)
        .map((item) => {
          const selections = item.testerSelections
            ?.map((selection, index) => `Tester ${index + 1}: ${selection}`)
            .join(" | ");
          return `${item.name} -> ${selections}`;
        })
        .join(" || ");

      const promotionNote = promotion
        ? `Promotion: ${promotion.label} | Items: ${promotion.selections
            .map((id) => items.find((it) => it.databaseId === id)?.name ?? String(id))
            .join(", ")}`
        : "";

      const customerNote = [promotionNote, testerSelectionsNote].filter(Boolean).join(" || ");

      const input: CheckoutInput = {
        clientMutationId: crypto.randomUUID(),
        billing: {
          firstName: formData.firstName,
          lastName: formData.lastName,
          address1: formData.address1,
          city: formData.city,
          state: formData.state,
          postcode: formData.postcode,
          country: formData.country,
          email: formData.email,
          phone: formData.phone,
        },
        shipping: {
          firstName: formData.firstName,
          lastName: formData.lastName,
          address1: formData.address1,
          city: formData.city,
          state: formData.state,
          postcode: formData.postcode,
          country: formData.country,
        },
        shipToDifferentAddress: false,
        paymentMethod: "cod",
        isPaid: false,
        customerNote: customerNote || undefined,
      };

      // Prepare cart items for WooCommerce
      const cartItems = items.map((item) => ({
        productId: item.databaseId,
        quantity: item.quantity,
      }));

      const result = await processCheckout(input, cartItems, promotion);

      if (result?.result === "success" && result?.order) {
        // Show success confirmation with order details
        setSuccessData({
          orderNumber: result.order.orderNumber || 'N/A',
          total: result.order.total || 'N/A',
          status: result.order.status || 'Processing',
        });
        
        // Clear cart
        clearCart();
        
        // Redirect after showing success message (3 seconds)
        setTimeout(() => {
          router.push("/order-received");
        }, 3000);
      } else {
        // Handle unsuccessful checkout
        setError(`Checkout unsuccessful. Status: ${result?.result || 'Unknown'}. Please contact support or try again.`);
      }
    } catch (err: any) {
      console.error('Checkout error:', err);
      
      // Parse error message for detailed feedback
      let errorMessage = 'An error occurred during checkout. ';
      
      if (err?.message) {
        // Check for specific error types
        if (err.message.includes('network') || err.message.includes('fetch')) {
          errorMessage += 'Network connection issue. Please check your internet and try again.';
        } else if (err.message.includes('email')) {
          errorMessage += 'Invalid email address provided.';
        } else if (err.message.includes('phone')) {
          errorMessage += 'Invalid phone number provided.';
        } else if (err.message.includes('address')) {
          errorMessage += 'Invalid address information. Please verify all fields.';
        } else if (err.message.includes('product')) {
          errorMessage += 'One or more products in your cart are unavailable.';
        } else {
          errorMessage += err.message;
        }
      } else {
        errorMessage += 'Please verify your information and try again, or contact support.';
      }
      
      setError(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const sectionGap = {
    display: "flex",
    flexDirection: "column",
    gap: "clamp(0.9rem, 2vh, 1.3rem)",
  } as const;

  const inputStyle = {
    paddingTop: "clamp(0.85rem, 2vh, 1rem)",
    paddingBottom: "clamp(0.85rem, 2vh, 1rem)",
    paddingLeft: "clamp(1rem, 2.5vw, 1.25rem)",
    paddingRight: "clamp(1rem, 2.5vw, 1.25rem)",
    fontSize: "clamp(0.98rem, 1.05vw, 1.05rem)",
  };

  if (items.length === 0) {
    return (
      <div
        className="rounded-2xl border border-[var(--accent-gold)]/15 bg-[var(--bg-main)]/60 text-center"
        style={{
          paddingTop: "clamp(2rem, 5vh, 3rem)",
          paddingBottom: "clamp(2rem, 5vh, 3rem)",
          paddingLeft: "clamp(1.5rem, 4vw, 2rem)",
          paddingRight: "clamp(1.5rem, 4vw, 2rem)",
        }}
      >
        <p
          className="text-[var(--text-secondary)]"
          style={{ opacity: 0.8, fontSize: "clamp(1rem, 1.1vw, 1.15rem)" }}
        >
          Your cart is empty. Browse our collection to find your signature scent.
        </p>
      </div>
    );
  }

  const shippingFee = discountedSubtotal >= 3000 ? 0 : 200;
  const finalTotal = discountedSubtotal + shippingFee;

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "clamp(1.5rem, 3.5vh, 2.25rem)", position: "relative" }}>
      {/* Loading Overlay */}
      {isSubmitting && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.8)",
            backdropFilter: "blur(8px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            flexDirection: "column",
            gap: "clamp(1rem, 2.5vh, 1.5rem)",
          }}
        >
          <div
            style={{
              width: "clamp(3rem, 8vw, 4rem)",
              height: "clamp(3rem, 8vw, 4rem)",
              border: "3px solid var(--accent-gold)",
              borderTopColor: "transparent",
              borderRadius: "50%",
              animation: "spin 1s linear infinite",
            }}
          />
          <p
            className="text-[var(--accent-gold)]"
            style={{
              fontSize: "clamp(1rem, 1.1vw, 1.15rem)",
              fontWeight: 500,
              letterSpacing: "0.05em",
            }}
          >
            Processing your order...
          </p>
          <style jsx>{`
            @keyframes spin {
              to { transform: rotate(360deg); }
            }
          `}</style>
        </div>
      )}

      {/* Success Confirmation Modal */}
      {successData && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.9)",
            backdropFilter: "blur(12px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: "clamp(1.5rem, 4vw, 2rem)",
          }}
        >
          <div
            className="rounded-2xl border border-[var(--accent-gold)]/30 bg-[var(--bg-surface)]"
            style={{
              maxWidth: "500px",
              width: "100%",
              paddingTop: "clamp(1.5rem, 4vh, 2rem)",
              paddingBottom: "clamp(1.5rem, 4vh, 2rem)",
              paddingLeft: "clamp(1.5rem, 4vw, 2rem)",
              paddingRight: "clamp(1.5rem, 4vw, 2rem)",
              display: "flex",
              flexDirection: "column",
              gap: "clamp(1.2rem, 3vh, 1.8rem)",
              boxShadow: "0 20px 60px rgba(0, 0, 0, 0.5)",
            }}
          >
            {/* Success Icon */}
            <div style={{ display: "flex", justifyContent: "center" }}>
              <div
                style={{
                  width: "clamp(3.5rem, 10vw, 5rem)",
                  height: "clamp(3.5rem, 10vw, 5rem)",
                  borderRadius: "50%",
                  backgroundColor: "var(--accent-gold)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "clamp(1.8rem, 5vw, 2.5rem)",
                }}
              >
                ✓
              </div>
            </div>

            {/* Success Message */}
            <div style={{ textAlign: "center", display: "flex", flexDirection: "column", gap: "clamp(0.5rem, 1.2vh, 0.8rem)" }}>
              <h2
                className="text-[var(--text-primary)]"
                style={{
                  fontFamily: "var(--font-playfair)",
                  fontWeight: 600,
                  fontSize: "clamp(1.5rem, 2.8vw, 2rem)",
                }}
              >
                Order Placed Successfully!
              </h2>
              <p
                className="text-[var(--text-secondary)]"
                style={{
                  fontSize: "clamp(0.95rem, 1.05vw, 1.05rem)",
                  opacity: 0.85,
                  lineHeight: 1.6,
                }}
              >
                Thank you for your order. We'll process it shortly.
              </p>
            </div>

            {/* Order Details */}
            <div
              className="rounded-xl border border-[var(--accent-gold)]/15 bg-[var(--bg-main)]/40"
              style={{
                paddingTop: "clamp(1rem, 2.5vh, 1.25rem)",
                paddingBottom: "clamp(1rem, 2.5vh, 1.25rem)",
                paddingLeft: "clamp(1rem, 2.5vw, 1.25rem)",
                paddingRight: "clamp(1rem, 2.5vw, 1.25rem)",
                display: "flex",
                flexDirection: "column",
                gap: "clamp(0.6rem, 1.5vh, 0.9rem)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span
                  className="text-[var(--text-secondary)]"
                  style={{ fontSize: "clamp(0.92rem, 1vw, 1rem)", opacity: 0.8 }}
                >
                  Order Number
                </span>
                <span
                  className="text-[var(--accent-gold)]"
                  style={{ fontSize: "clamp(0.98rem, 1.05vw, 1.06rem)", fontWeight: 600 }}
                >
                  {successData.orderNumber}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span
                  className="text-[var(--text-secondary)]"
                  style={{ fontSize: "clamp(0.92rem, 1vw, 1rem)", opacity: 0.8 }}
                >
                  Total Amount
                </span>
                <span
                  className="text-[var(--accent-gold)]"
                  style={{ fontSize: "clamp(0.98rem, 1.05vw, 1.06rem)", fontWeight: 600 }}
                >
                  {successData.total}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span
                  className="text-[var(--text-secondary)]"
                  style={{ fontSize: "clamp(0.92rem, 1vw, 1rem)", opacity: 0.8 }}
                >
                  Status
                </span>
                <span
                  className="text-[var(--accent-gold)]"
                  style={{ fontSize: "clamp(0.98rem, 1.05vw, 1.06rem)", fontWeight: 600 }}
                >
                  {successData.status}
                </span>
              </div>
            </div>

            {/* Next Steps */}
            <p
              className="text-[var(--text-secondary)] text-center"
              style={{
                fontSize: "clamp(0.88rem, 0.95vw, 0.96rem)",
                opacity: 0.75,
                lineHeight: 1.6,
              }}
            >
              Redirecting to confirmation page...
            </p>
          </div>
        </div>
      )}

      {error && (
        <div
          className="rounded-xl border border-red-400/30 bg-red-500/10 text-red-400"
          style={{
            paddingTop: "clamp(0.9rem, 2vh, 1.1rem)",
            paddingBottom: "clamp(0.9rem, 2vh, 1.1rem)",
            paddingLeft: "clamp(1.1rem, 2.8vw, 1.4rem)",
            paddingRight: "clamp(1.1rem, 2.8vw, 1.4rem)",
            fontSize: "clamp(0.96rem, 1.05vw, 1.05rem)",
            display: "flex",
            flexDirection: "column",
            gap: "clamp(0.4rem, 1vh, 0.6rem)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span style={{ fontSize: "1.2em" }}>⚠</span>
            <strong>Checkout Error</strong>
          </div>
          <p style={{ lineHeight: 1.5 }}>{error}</p>
        </div>
      )}

      <section style={sectionGap}>
        <div style={{ display: "flex", flexDirection: "column", gap: "clamp(0.35rem, 0.9vh, 0.6rem)" }}>
          <p className="text-[var(--accent-gold)]" style={{ fontSize: "clamp(0.9rem, 1vw, 1rem)" }}>
            Billing details
          </p>
          <h2
            className="text-[var(--text-primary)]"
            style={{ fontFamily: "var(--font-playfair)", fontWeight: 600, fontSize: "clamp(1.4rem, 2.6vw, 1.9rem)" }}
          >
            Who is this order for?
          </h2>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: "clamp(1rem, 2.5vw, 1.4rem)" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "clamp(0.4rem, 1vh, 0.6rem)" }}>
            <label htmlFor="firstName" style={{ fontSize: "clamp(0.95rem, 1.05vw, 1.05rem)", color: "var(--text-secondary)", opacity: 0.92 }}>
              First Name
            </label>
            <input
              type="text"
              id="firstName"
              name="firstName"
              required
              value={formData.firstName}
              onChange={handleChange}
              className="w-full rounded-xl border border-[var(--accent-gold)]/20 bg-[var(--bg-main)]/70 text-[var(--text-secondary)] outline-none transition-all duration-200 focus:border-[var(--accent-gold)]/50 focus:shadow-[0_0_15px_rgba(253,221,173,0.15)]"
              style={inputStyle}
            />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "clamp(0.4rem, 1vh, 0.6rem)" }}>
            <label htmlFor="lastName" style={{ fontSize: "clamp(0.95rem, 1.05vw, 1.05rem)", color: "var(--text-secondary)", opacity: 0.92 }}>
              Last Name
            </label>
            <input
              type="text"
              id="lastName"
              name="lastName"
              required
              value={formData.lastName}
              onChange={handleChange}
              className="w-full rounded-xl border border-[var(--accent-gold)]/20 bg-[var(--bg-main)]/70 text-[var(--text-secondary)] outline-none transition-all duration-200 focus:border-[var(--accent-gold)]/50 focus:shadow-[0_0_15px_rgba(253,221,173,0.15)]"
              style={inputStyle}
            />
          </div>
        </div>
      </section>

      <section style={sectionGap}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: "clamp(1rem, 2.5vw, 1.4rem)" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "clamp(0.4rem, 1vh, 0.6rem)" }}>
            <label htmlFor="email" style={{ fontSize: "clamp(0.95rem, 1.05vw, 1.05rem)", color: "var(--text-secondary)", opacity: 0.92 }}>
              Email
            </label>
            <input
              type="email"
              id="email"
              name="email"
              required
              value={formData.email}
              onChange={handleChange}
              className="w-full rounded-xl border border-[var(--accent-gold)]/20 bg-[var(--bg-main)]/70 text-[var(--text-secondary)] outline-none transition-all duration-200 focus:border-[var(--accent-gold)]/50 focus:shadow-[0_0_15px_rgba(253,221,173,0.15)]"
              style={inputStyle}
            />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "clamp(0.4rem, 1vh, 0.6rem)" }}>
            <label htmlFor="phone" style={{ fontSize: "clamp(0.95rem, 1.05vw, 1.05rem)", color: "var(--text-secondary)", opacity: 0.92 }}>
              Phone
            </label>
            <input
              type="tel"
              id="phone"
              name="phone"
              required
              value={formData.phone}
              onChange={handleChange}
              className="w-full rounded-xl border border-[var(--accent-gold)]/20 bg-[var(--bg-main)]/70 text-[var(--text-secondary)] outline-none transition-all duration-200 focus:border-[var(--accent-gold)]/50 focus:shadow-[0_0_15px_rgba(253,221,173,0.15)]"
              style={inputStyle}
            />
          </div>
        </div>
      </section>

      <section style={sectionGap}>
        <div style={{ display: "flex", flexDirection: "column", gap: "clamp(0.35rem, 0.9vh, 0.6rem)" }}>
          <p className="text-[var(--accent-gold)]" style={{ fontSize: "clamp(0.9rem, 1vw, 1rem)" }}>
            Shipping address
          </p>
          <h2
            className="text-[var(--text-primary)]"
            style={{ fontFamily: "var(--font-playfair)", fontWeight: 600, fontSize: "clamp(1.4rem, 2.6vw, 1.9rem)" }}
          >
            Where should we deliver?
          </h2>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "clamp(0.4rem, 1vh, 0.6rem)" }}>
          <label htmlFor="address1" style={{ fontSize: "clamp(0.95rem, 1.05vw, 1.05rem)", color: "var(--text-secondary)", opacity: 0.92 }}>
            Street Address
          </label>
          <input
            type="text"
            id="address1"
            name="address1"
            required
            value={formData.address1}
            onChange={handleChange}
            className="w-full rounded-xl border border-[var(--accent-gold)]/20 bg-[var(--bg-main)]/70 text-[var(--text-secondary)] outline-none transition-all duration-200 focus:border-[var(--accent-gold)]/50 focus:shadow-[0_0_15px_rgba(253,221,173,0.15)]"
            style={inputStyle}
          />
        </div>
      </section>

      <section style={sectionGap}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "clamp(1rem, 2.5vw, 1.4rem)" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "clamp(0.4rem, 1vh, 0.6rem)" }}>
            <label htmlFor="city" style={{ fontSize: "clamp(0.95rem, 1.05vw, 1.05rem)", color: "var(--text-secondary)", opacity: 0.92 }}>
              City
            </label>
            <input
              type="text"
              id="city"
              name="city"
              required
              value={formData.city}
              onChange={handleChange}
              className="w-full rounded-xl border border-[var(--accent-gold)]/20 bg-[var(--bg-main)]/70 text-[var(--text-secondary)] outline-none transition-all duration-200 focus:border-[var(--accent-gold)]/50 focus:shadow-[0_0_15px_rgba(253,221,173,0.15)]"
              style={inputStyle}
            />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "clamp(0.4rem, 1vh, 0.6rem)" }}>
            <label htmlFor="state" style={{ fontSize: "clamp(0.95rem, 1.05vw, 1.05rem)", color: "var(--text-secondary)", opacity: 0.92 }}>
              Province / State
            </label>
            <input
              type="text"
              id="state"
              name="state"
              required
              value={formData.state}
              onChange={handleChange}
              className="w-full rounded-xl border border-[var(--accent-gold)]/20 bg-[var(--bg-main)]/70 text-[var(--text-secondary)] outline-none transition-all duration-200 focus:border-[var(--accent-gold)]/50 focus:shadow-[0_0_15px_rgba(253,221,173,0.15)]"
              style={inputStyle}
            />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "clamp(0.4rem, 1vh, 0.6rem)" }}>
            <label htmlFor="postcode" style={{ fontSize: "clamp(0.95rem, 1.05vw, 1.05rem)", color: "var(--text-secondary)", opacity: 0.92 }}>
              Postcode
            </label>
            <input
              type="text"
              id="postcode"
              name="postcode"
              required
              value={formData.postcode}
              onChange={handleChange}
              className="w-full rounded-xl border border-[var(--accent-gold)]/20 bg-[var(--bg-main)]/70 text-[var(--text-secondary)] outline-none transition-all duration-200 focus:border-[var(--accent-gold)]/50 focus:shadow-[0_0_15px_rgba(253,221,173,0.15)]"
              style={inputStyle}
            />
          </div>
        </div>
      </section>

      <section style={sectionGap}>
        <div style={{ display: "flex", flexDirection: "column", gap: "clamp(0.4rem, 1vh, 0.6rem)" }}>
          <label htmlFor="country" style={{ fontSize: "clamp(0.95rem, 1.05vw, 1.05rem)", color: "var(--text-secondary)", opacity: 0.92 }}>
            Country
          </label>
          <select
            id="country"
            name="country"
            required
            value={formData.country}
            onChange={handleChange}
            className="w-full rounded-xl border border-[var(--accent-gold)]/20 bg-[var(--bg-main)]/70 text-[var(--text-secondary)] outline-none transition-all duration-200 focus:border-[var(--accent-gold)]/50 focus:shadow-[0_0_15px_rgba(253,221,173,0.15)]"
            style={inputStyle}
          >
            <option value="PK">Pakistan</option>
          </select>
        </div>
      </section>

      <section
        className="rounded-2xl border border-[var(--accent-gold)]/15 bg-[var(--bg-main)]/60"
        style={{
          paddingTop: "clamp(1.1rem, 2.5vh, 1.5rem)",
          paddingBottom: "clamp(1.1rem, 2.5vh, 1.5rem)",
          paddingLeft: "clamp(1.1rem, 2.8vw, 1.5rem)",
          paddingRight: "clamp(1.1rem, 2.8vw, 1.5rem)",
          display: "flex",
          flexDirection: "column",
          gap: "clamp(0.75rem, 1.8vh, 1.1rem)",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "clamp(0.35rem, 0.9vh, 0.6rem)" }}>
          <p className="text-[var(--accent-gold)]" style={{ fontSize: "clamp(0.9rem, 1vw, 1rem)" }}>
            Payment
          </p>
          <h2
            className="text-[var(--text-primary)]"
            style={{ fontFamily: "var(--font-playfair)", fontWeight: 600, fontSize: "clamp(1.4rem, 2.6vw, 1.9rem)" }}
          >
            How will you pay?
          </h2>
        </div>
        <div className="flex items-center" style={{ gap: "clamp(0.65rem, 1.5vw, 0.9rem)" }}>
          <input
            type="radio"
            id="cod"
            name="paymentMethod"
            value="cod"
            checked
            readOnly
            className="h-4 w-4 accent-[var(--accent-gold)]"
          />
          <label htmlFor="cod" style={{ fontSize: "clamp(0.98rem, 1.05vw, 1.06rem)", color: "var(--text-secondary)", opacity: 0.92 }}>
            Cash on Delivery (COD)
          </label>
        </div>
        <p style={{ fontSize: "clamp(0.92rem, 1vw, 1rem)", opacity: 0.75, lineHeight: 1.55 }}>
          Pay with cash when your order is delivered. Please have the exact amount ready for a smooth handoff.
        </p>
      </section>

      <section
        className="rounded-2xl border border-[var(--accent-gold)]/15 bg-[var(--bg-main)]/60"
        style={{
          paddingTop: "clamp(1.1rem, 2.5vh, 1.5rem)",
          paddingBottom: "clamp(1.1rem, 2.5vh, 1.5rem)",
          paddingLeft: "clamp(1.1rem, 2.8vw, 1.5rem)",
          paddingRight: "clamp(1.1rem, 2.8vw, 1.5rem)",
          display: "flex",
          flexDirection: "column",
          gap: "clamp(0.9rem, 2vh, 1.3rem)",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "clamp(0.35rem, 0.9vh, 0.6rem)" }}>
          <p className="text-[var(--accent-gold)]" style={{ fontSize: "clamp(0.9rem, 1vw, 1rem)" }}>
            Order summary
          </p>
          <h2
            className="text-[var(--text-primary)]"
            style={{ fontFamily: "var(--font-playfair)", fontWeight: 600, fontSize: "clamp(1.4rem, 2.6vw, 1.9rem)" }}
          >
            Review your order
          </h2>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "clamp(0.75rem, 1.8vh, 1.1rem)" }}>
          {items.map((item) => (
            <div
              key={`checkout-item-${item.databaseId || item.id}`}
              className="flex items-center justify-between border-b border-[var(--accent-gold)]/10"
              style={{ paddingBottom: "clamp(0.65rem, 1.5vh, 0.9rem)", gap: "clamp(0.8rem, 2vw, 1.2rem)" }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: "clamp(0.25rem, 0.6vh, 0.4rem)", flex: 1 }}>
                <span style={{ fontSize: "clamp(0.98rem, 1.05vw, 1.06rem)", color: "var(--text-secondary)" }}>
                  {item.name}
                </span>
                <span style={{ fontSize: "clamp(0.9rem, 1vw, 0.98rem)", opacity: 0.7 }}>
                  Qty: {item.quantity}
                </span>
              </div>
              <span className="text-[var(--text-primary)]" style={{ fontSize: "clamp(0.98rem, 1.05vw, 1.06rem)", fontWeight: 600 }}>
                Rs {(extractNumericPrice(item.price) * (item.quantity || 0)).toLocaleString()}
              </span>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "clamp(0.6rem, 1.4vh, 0.85rem)", paddingTop: "clamp(0.6rem, 1.5vh, 0.9rem)" }}>
          <div className="flex items-center justify-between" style={{ fontSize: "clamp(0.96rem, 1.05vw, 1.05rem)" }}>
            <span style={{ opacity: 0.85 }}>Subtotal</span>
            <span>Rs {subtotalPrice.toLocaleString()}</span>
          </div>
          {promotionDiscount > 0 && (
            <div className="flex items-center justify-between" style={{ fontSize: "clamp(0.96rem, 1.05vw, 1.05rem)" }}>
              <span style={{ opacity: 0.85 }}>Promotion</span>
              <span className="text-[var(--accent-gold)]">- Rs {promotionDiscount.toLocaleString()}</span>
            </div>
          )}
          <div className="flex items-center justify-between" style={{ fontSize: "clamp(0.96rem, 1.05vw, 1.05rem)" }}>
            <span style={{ opacity: 0.85 }}>Shipping</span>
            <span className={shippingFee === 0 ? "text-[var(--accent-gold)]" : ""}>
              {shippingFee === 0 ? "Free" : `Rs ${shippingFee}`}
            </span>
          </div>
          {discountedSubtotal < 3000 && (
            <p style={{ fontSize: "clamp(0.88rem, 0.95vw, 0.96rem)", opacity: 0.7, lineHeight: 1.5 }}>
              Add Rs {(3000 - discountedSubtotal).toLocaleString()} more to unlock free shipping.
            </p>
          )}
          <div
            className="flex items-center justify-between border-t border-[var(--accent-gold)]/20 text-[var(--text-primary)]"
            style={{ paddingTop: "clamp(0.75rem, 1.8vh, 1rem)", fontSize: "clamp(1.1rem, 1.2vw, 1.25rem)", fontWeight: 600 }}
          >
            <span>Total</span>
            <span>Rs {finalTotal.toLocaleString()}</span>
          </div>
        </div>
      </section>

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full rounded-full bg-[var(--accent-gold)] text-[var(--bg-main)] transition-all duration-200 hover:shadow-[0_0_25px_rgba(253,221,173,0.4)] disabled:cursor-not-allowed disabled:opacity-50"
        style={{
          paddingTop: "clamp(1rem, 2.4vh, 1.25rem)",
          paddingBottom: "clamp(1rem, 2.4vh, 1.25rem)",
          fontSize: "clamp(0.98rem, 1.05vw, 1.06rem)",
          fontWeight: 600,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
        }}
      >
        {isSubmitting ? "Processing your order..." : "Place Order"}
      </button>
    </form>
  );
}
