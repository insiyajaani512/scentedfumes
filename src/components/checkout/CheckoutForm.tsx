"use client";

import {
  useState,
} from "react";

import {
  useRouter,
} from "next/navigation";

import {
  useCartStore,
} from "@/lib/store/cartStore";

import {
  processCheckout,
  applyManualCoupon,
} from "@/lib/graphql/checkout";

import {
  CheckoutInput,
} from "@/types/checkout";

import {
  extractNumericPrice,
  calculateDisplayTotals,
} from "@/lib/utils";

export default function CheckoutForm() {
  const router =
    useRouter();

  const {
    items,
    clearCart,
    promotion,
  } =
    useCartStore();

  const {
    subtotal:
      subtotalPrice,

    discount:
      promotionDiscount,

    total:
      discountedSubtotal,
  } =
    calculateDisplayTotals(
      items,
      promotion
    );

  const [
    isSubmitting,
    setIsSubmitting,
  ] =
    useState(false);

  const [
    isApplyingPromo,
    setIsApplyingPromo,
  ] =
    useState(false);

  const [
    promoCode,
    setPromoCode,
  ] =
    useState("");

  const [
    appliedPromoCode,
    setAppliedPromoCode,
  ] =
    useState<
      string | null
    >(null);

  const [
    promoMessage,
    setPromoMessage,
  ] =
    useState<
      string | null
    >(null);

  const [
    promoError,
    setPromoError,
  ] =
    useState<
      string | null
    >(null);

  /*
   * ACTUAL PROMO DISCOUNT
   */

  const [
    promoDiscount,
    setPromoDiscount,
  ] =
    useState(0);

  const [
    error,
    setError,
  ] =
    useState<
      string | null
    >(null);

  const [
    formData,
    setFormData,
  ] =
    useState({
      firstName:
        "",

      lastName:
        "",

      email:
        "",

      phone:
        "",

      address1:
        "",

      city:
        "",

      state:
        "",

      postcode:
        "",

      country:
        "PK",
    });

  const handleChange =
    (
      e: React.ChangeEvent<
        | HTMLInputElement
        | HTMLSelectElement
      >
    ) => {
      const {
        name,
        value,
      } =
        e.target;

      setFormData(
        (
          prev
        ) => ({
          ...prev,

          [name]:
            value,
        })
      );
    };

  const handleApplyPromo =
    async () => {
      setPromoError(
        null
      );

      setPromoMessage(
        null
      );

      const code =
        promoCode.trim();

      if (!code) {
        setPromoError(
          "Please enter a promo code."
        );

        return;
      }

      setIsApplyingPromo(
        true
      );

      try {
        const result =
          await applyManualCoupon(
            code
          );

        if (
          result.success
        ) {
          setAppliedPromoCode(
            result.code ||
            code.toUpperCase()
          );

          /*
           * SAVE ACTUAL DISCOUNT
           */

          setPromoDiscount(
            Number(
              result.discountAmount ||
              0
            )
          );

          setPromoMessage(
            result.message ||
            "Promo code applied successfully."
          );
        } else {
          setAppliedPromoCode(
            null
          );

          setPromoDiscount(
            0
          );

          setPromoError(
            result.message ||
            "Invalid promo code."
          );
        }
      } catch (
        err: any
      ) {
        setAppliedPromoCode(
          null
        );

        setPromoDiscount(
          0
        );

        setPromoError(
          err?.message ||
          "Unable to validate the promo code. Please try again."
        );
      } finally {
        setIsApplyingPromo(
          false
        );
      }
    };

  const handleSubmit =
    async (
      e:
        React.FormEvent
    ) => {
      e.preventDefault();

      setError(
        null
      );

      if (
        items.length === 0
      ) {
        setError(
          "Your cart is empty."
        );

        return;
      }

      if (
        !formData.firstName.trim() ||
        !formData.lastName.trim() ||
        !formData.email.trim() ||
        !formData.phone.trim() ||
        !formData.address1.trim() ||
        !formData.city.trim() ||
        !formData.state.trim() ||
        !formData.postcode.trim()
      ) {
        setError(
          "Please complete all required checkout fields."
        );

        return;
      }

      const emailRegex =
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

      if (
        !emailRegex.test(
          formData.email
        )
      ) {
        setError(
          "Please enter a valid email address."
        );

        return;
      }

      const cleanPhone =
        formData.phone.replace(
          /[\s-]/g,
          ""
        );

      if (
        cleanPhone.length <
          10 ||
        !/^[0-9+]+$/.test(
          cleanPhone
        )
      ) {
        setError(
          "Please enter a valid phone number."
        );

        return;
      }

      const invalidItems =
        items.filter(
          (
            item
          ) =>
            !item.databaseId ||
            item.databaseId <=
              0
        );

      if (
        invalidItems.length >
        0
      ) {
        setError(
          "Some items in your cart are invalid. Please refresh and try again."
        );

        return;
      }

      setIsSubmitting(
        true
      );

      try {
        const testerSelectionsNote =
          items
            .filter(
              (
                item
              ) =>
                item.testerSelections &&
                item.testerSelections
                  .length >
                  0
            )
            .map(
              (
                item
              ) => {
                const selections =
                  item.testerSelections
                    ?.map(
                      (
                        selection,
                        index
                      ) =>
                        `Tester ${
                          index +
                          1
                        }: ${selection}`
                    )
                    .join(
                      " | "
                    );

                return `${item.name} -> ${selections}`;
              }
            )
            .join(
              " || "
            );

        const promotionNote =
          promotion
            ? `Promotion: ${promotion.label} | Items: ${promotion.selections
                .map(
                  (
                    id
                  ) =>
                    items.find(
                      (
                        it
                      ) =>
                        it.databaseId ===
                        id
                    )
                      ?.name ??
                    String(
                      id
                    )
                )
                .join(
                  ", "
                )}`
            : "";

        const promoNote =
          appliedPromoCode
            ? `Promo Code: ${appliedPromoCode} | Discount: Rs ${promoDiscount.toLocaleString()}`
            : "";

        const customerNote = [
          promotionNote,

          testerSelectionsNote,

          promoNote,
        ]
          .filter(
            Boolean
          )
          .join(
            " || "
          );

        const input:
          CheckoutInput = {
          clientMutationId:
            crypto.randomUUID(),

          billing: {
            firstName:
              formData.firstName,

            lastName:
              formData.lastName,

            address1:
              formData.address1,

            city:
              formData.city,

            state:
              formData.state,

            postcode:
              formData.postcode,

            country:
              formData.country,

            email:
              formData.email,

            phone:
              formData.phone,
          },

          shipping: {
            firstName:
              formData.firstName,

            lastName:
              formData.lastName,

            address1:
              formData.address1,

            city:
              formData.city,

            state:
              formData.state,

            postcode:
              formData.postcode,

            country:
              formData.country,
          },

          shipToDifferentAddress:
            false,

          paymentMethod:
            "cod",

          isPaid:
            false,

          customerNote:
            customerNote ||
            undefined,
        };

        const cartItems =
          items.map(
            (
              item
            ) => ({
              productId:
                item.databaseId,

              quantity:
                item.quantity,
            })
          );

        const result =
          await processCheckout(
            input,

            cartItems,

            promotion,

            appliedPromoCode
          );

        if (
          result?.result ===
            "success" &&
          result?.order
        ) {
          clearCart();

          router.push(
            "/order-received"
          );

          return;
        }

        setError(
          `Checkout unsuccessful. ${
            result?.result
              ? `Status: ${result.result}.`
              : "Please try again."
          }`
        );
      } catch (
        err: any
      ) {
        console.error(
          "Checkout error:",
          err
        );

        setError(
          err?.message ||
          "An error occurred during checkout. Please try again."
        );
      } finally {
        setIsSubmitting(
          false
        );
      }
    };

  const inputClass =
    "w-full rounded-xl border border-[var(--accent-gold)]/20 bg-[var(--bg-main)]/70 text-[var(--text-secondary)] outline-none transition-all duration-200 focus:border-[var(--accent-gold)]/50 focus:shadow-[0_0_15px_rgba(253,221,173,0.15)]";

  const inputStyle = {
    paddingTop:
      "0.9rem",

    paddingBottom:
      "0.9rem",

    paddingLeft:
      "1rem",

    paddingRight:
      "1rem",

    fontSize:
      "1rem",
  };

  /*
   * TOTAL CALCULATION
   *
   * First:
   * Store promotion discount
   *
   * Then:
   * Apply manual coupon discount
   */

  const totalAfterPromo =
    Math.max(
      0,
      discountedSubtotal -
        promoDiscount
    );

  /*
   * Shipping calculated AFTER
   * coupon discount.
   */

  const shippingFee =
    totalAfterPromo >=
    3000
      ? 0
      : 200;

  const finalTotal =
    totalAfterPromo +
    shippingFee;

  if (
    items.length ===
    0
  ) {
    return (
      <div className="rounded-2xl border border-[var(--accent-gold)]/15 bg-[var(--bg-main)]/60 p-8 text-center">
        <p className="text-[var(--text-secondary)]">
          Your cart is empty.
          Browse our collection to
          find your signature
          scent.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={
        handleSubmit
      }
      className="flex flex-col"
      style={{
        gap:
          "1.5rem",
      }}
    >
      {error && (
        <div className="rounded-xl border border-red-400/30 bg-red-500/10 p-4 text-red-400">
          <strong>
            Checkout Error
          </strong>

          <p className="mt-1">
            {error}
          </p>
        </div>
      )}

      {/* BILLING */}

      <section
        className="flex flex-col"
        style={{
          gap:
            "1rem",
        }}
      >
        <div>
          <p className="text-[var(--accent-gold)]">
            Billing details
          </p>

          <h2
            className="text-[var(--text-primary)]"
            style={{
              fontFamily:
                "var(--font-playfair)",

              fontWeight:
                600,

              fontSize:
                "1.8rem",
            }}
          >
            Who is this order for?
          </h2>
        </div>

        <div
          className="grid"
          style={{
            gridTemplateColumns:
              "repeat(auto-fit, minmax(220px, 1fr))",

            gap:
              "1rem",
          }}
        >
          <Field
            label="First Name"
            name="firstName"
            value={
              formData.firstName
            }
            onChange={
              handleChange
            }
            className={
              inputClass
            }
            style={
              inputStyle
            }
          />

          <Field
            label="Last Name"
            name="lastName"
            value={
              formData.lastName
            }
            onChange={
              handleChange
            }
            className={
              inputClass
            }
            style={
              inputStyle
            }
          />

          <Field
            label="Email"
            name="email"
            type="email"
            value={
              formData.email
            }
            onChange={
              handleChange
            }
            className={
              inputClass
            }
            style={
              inputStyle
            }
          />

          <Field
            label="Phone"
            name="phone"
            type="tel"
            value={
              formData.phone
            }
            onChange={
              handleChange
            }
            className={
              inputClass
            }
            style={
              inputStyle
            }
          />
        </div>
      </section>

      {/* SHIPPING */}

      <section
        className="flex flex-col"
        style={{
          gap:
            "1rem",
        }}
      >
        <div>
          <p className="text-[var(--accent-gold)]">
            Shipping address
          </p>

          <h2
            className="text-[var(--text-primary)]"
            style={{
              fontFamily:
                "var(--font-playfair)",

              fontWeight:
                600,

              fontSize:
                "1.8rem",
            }}
          >
            Where should we deliver?
          </h2>
        </div>

        <Field
          label="Street Address"
          name="address1"
          value={
            formData.address1
          }
          onChange={
            handleChange
          }
          className={
            inputClass
          }
          style={
            inputStyle
          }
        />

        <div
          className="grid"
          style={{
            gridTemplateColumns:
              "repeat(auto-fit, minmax(180px, 1fr))",

            gap:
              "1rem",
          }}
        >
          <Field
            label="City"
            name="city"
            value={
              formData.city
            }
            onChange={
              handleChange
            }
            className={
              inputClass
            }
            style={
              inputStyle
            }
          />

          <Field
            label="Province / State"
            name="state"
            value={
              formData.state
            }
            onChange={
              handleChange
            }
            className={
              inputClass
            }
            style={
              inputStyle
            }
          />

          <Field
            label="Postcode"
            name="postcode"
            value={
              formData.postcode
            }
            onChange={
              handleChange
            }
            className={
              inputClass
            }
            style={
              inputStyle
            }
          />
        </div>

        <div className="flex flex-col gap-2">
          <label
            htmlFor="country"
            className="text-[var(--text-secondary)]"
          >
            Country
          </label>

          <select
            id="country"
            name="country"
            value={
              formData.country
            }
            onChange={
              handleChange
            }
            className={
              inputClass
            }
            style={
              inputStyle
            }
          >
            <option value="PK">
              Pakistan
            </option>
          </select>
        </div>
      </section>

      {/* PROMO CODE */}

      <section className="rounded-2xl border border-[var(--accent-gold)]/15 bg-[var(--bg-main)]/60 p-5">
        <div className="mb-4">
          <p className="text-[var(--accent-gold)]">
            Promo code
          </p>

          <h2
            className="text-[var(--text-primary)]"
            style={{
              fontFamily:
                "var(--font-playfair)",

              fontWeight:
                600,

              fontSize:
                "1.6rem",
            }}
          >
            Have a discount code?
          </h2>
        </div>

        <div
          className="flex flex-wrap"
          style={{
            gap:
              "0.75rem",
          }}
        >
          <input
            type="text"
            id="promoCode"
            name="promoCode"
            value={
              promoCode
            }
            onChange={
              (
                e
              ) => {
                setPromoCode(
                  e.target.value
                );

                setAppliedPromoCode(
                  null
                );

                setPromoDiscount(
                  0
                );

                setPromoMessage(
                  null
                );

                setPromoError(
                  null
                );
              }
            }
            placeholder="Enter promo code"
            className={
              inputClass
            }
            style={{
              ...inputStyle,

              flex:
                1,

              minWidth:
                "200px",
            }}
          />

          <button
            type="button"
            onClick={
              handleApplyPromo
            }
            disabled={
              isApplyingPromo
            }
            className="rounded-xl border border-[var(--accent-gold)]/40 bg-[var(--accent-gold)]/10 px-6 py-3 font-semibold text-[var(--accent-gold)] transition hover:bg-[var(--accent-gold)]/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isApplyingPromo
              ? "Applying..."
              : "Apply"}
          </button>
        </div>

        {promoMessage && (
          <p className="mt-3 text-[var(--accent-gold)]">
            ✓ {
              promoMessage
            }
          </p>
        )}

        {promoError && (
          <p className="mt-3 text-red-400">
            {
              promoError
            }
          </p>
        )}

        {appliedPromoCode && (
          <div className="mt-3">
            <p className="text-[var(--text-secondary)]">
              Applied code:{" "}

              <strong>
                {
                  appliedPromoCode
                }
              </strong>
            </p>

            <p className="mt-1 text-[var(--accent-gold)]">
              Discount:{" "}

              <strong>
                - Rs{" "}

                {
                  promoDiscount.toLocaleString()
                }
              </strong>
            </p>
          </div>
        )}
      </section>

      {/* PAYMENT */}

      <section className="rounded-2xl border border-[var(--accent-gold)]/15 bg-[var(--bg-main)]/60 p-5">
        <p className="text-[var(--accent-gold)]">
          Payment
        </p>

        <h2
          className="mb-4 text-[var(--text-primary)]"
          style={{
            fontFamily:
              "var(--font-playfair)",

            fontWeight:
              600,

            fontSize:
              "1.8rem",
          }}
        >
          How will you pay?
        </h2>

        <div className="flex items-center gap-3">
          <input
            type="radio"
            id="cod"
            name="paymentMethod"
            value="cod"
            checked
            readOnly
            className="h-4 w-4 accent-[var(--accent-gold)]"
          />

          <label
            htmlFor="cod"
            className="text-[var(--text-secondary)]"
          >
            Cash on Delivery
            (COD)
          </label>
        </div>
      </section>

      {/* ORDER SUMMARY */}

      <section className="rounded-2xl border border-[var(--accent-gold)]/15 bg-[var(--bg-main)]/60 p-5">
        <p className="text-[var(--accent-gold)]">
          Order summary
        </p>

        <h2
          className="mb-4 text-[var(--text-primary)]"
          style={{
            fontFamily:
              "var(--font-playfair)",

            fontWeight:
              600,

            fontSize:
              "1.8rem",
          }}
        >
          Review your order
        </h2>

        <div className="flex flex-col gap-3">
          {items.map(
            (
              item
            ) => (
              <div
                key={`checkout-item-${
                  item.databaseId ||
                  item.id
                }`}
                className="flex items-center justify-between border-b border-[var(--accent-gold)]/10 pb-3"
              >
                <div>
                  <p className="text-[var(--text-secondary)]">
                    {
                      item.name
                    }
                  </p>

                  <span
                    style={{
                      opacity:
                        0.7,
                    }}
                  >
                    Qty:{" "}

                    {
                      item.quantity
                    }
                  </span>
                </div>

                <strong className="text-[var(--text-primary)]">
                  Rs{" "}

                  {(
                    extractNumericPrice(
                      item.price
                    ) *
                    (
                      item.quantity ||
                      0
                    )
                  ).toLocaleString()}
                </strong>
              </div>
            )
          )}
        </div>

        {/* TOTALS */}

        <div
          className="mt-5 flex flex-col"
          style={{
            gap:
              "0.75rem",
          }}
        >
          <div className="flex justify-between">
            <span>
              Subtotal
            </span>

            <span>
              Rs{" "}

              {
                subtotalPrice.toLocaleString()
              }
            </span>
          </div>

          {promotionDiscount >
            0 && (
              <div className="flex justify-between">
                <span>
                  Promotion
                </span>

                <span className="text-[var(--accent-gold)]">
                  - Rs{" "}

                  {
                    promotionDiscount.toLocaleString()
                  }
                </span>
              </div>
            )}

          {appliedPromoCode &&
            promoDiscount >
              0 && (
              <div className="flex justify-between">
                <span>
                  Promo (
                  {
                    appliedPromoCode
                  }
                  )
                </span>

                <span className="text-[var(--accent-gold)]">
                  - Rs{" "}

                  {
                    promoDiscount.toLocaleString()
                  }
                </span>
              </div>
            )}

          <div className="flex justify-between">
            <span>
              Shipping
            </span>

            <span
              className={
                shippingFee ===
                0
                  ? "text-[var(--accent-gold)]"
                  : ""
              }
            >
              {shippingFee ===
              0
                ? "Free"
                : `Rs ${shippingFee}`}
            </span>
          </div>

          <div className="flex justify-between border-t border-[var(--accent-gold)]/20 pt-4 text-lg font-semibold">
            <span>
              Total
            </span>

            <span>
              Rs{" "}

              {
                finalTotal.toLocaleString()
              }
            </span>
          </div>
        </div>
      </section>

      <button
        type="submit"
        disabled={
          isSubmitting
        }
        className="w-full rounded-full bg-[var(--accent-gold)] py-4 font-semibold uppercase tracking-wider text-[var(--bg-main)] transition hover:shadow-[0_0_25px_rgba(253,221,173,0.4)] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isSubmitting
          ? "Processing your order..."
          : "Place Order"}
      </button>
    </form>
  );
}

type FieldProps = {
  label:
    string;

  name:
    string;

  value:
    string;

  onChange: (
    e: React.ChangeEvent<
      | HTMLInputElement
      | HTMLSelectElement
    >
  ) => void;

  className:
    string;

  style:
    React.CSSProperties;

  type?:
    string;
};

function Field({
  label,

  name,

  value,

  onChange,

  className,

  style,

  type =
    "text",
}: FieldProps) {
  return (
    <div className="flex flex-col gap-2">
      <label
        htmlFor={
          name
        }
        className="text-[var(--text-secondary)]"
      >
        {
          label
        }
      </label>

      <input
        type={
          type
        }
        id={
          name
        }
        name={
          name
        }
        required
        value={
          value
        }
        onChange={
          onChange
        }
        className={
          className
        }
        style={
          style
        }
      />
    </div>
  );
}
