const Razorpay = require("razorpay");

// Initialize single Razorpay helper instance
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

/**
 * Fetches exact payment method details from Razorpay (Google Pay, PhonePe, Paytm, UPI, Card, Netbanking)
 * without requiring any changes to the mobile application.
 */
async function fetchExactRazorpayInstrument(razorpayPaymentId) {
  if (!razorpayPaymentId || typeof razorpayPaymentId !== "string" || !razorpayPaymentId.startsWith("pay_")) {
    return null;
  }

  try {
    const payment = await razorpay.payments.fetch(razorpayPaymentId);
    if (!payment) return null;

    const method = String(payment.method || "").toLowerCase();
    const vpa = payment.vpa || (payment.upi && payment.upi.vpa) || "";

    if (vpa) {
      const vpaLower = vpa.toLowerCase();
      if (vpaLower.includes("@ok")) {
        return `Google Pay (UPI: ${vpa})`;
      } else if (vpaLower.includes("@ybl") || vpaLower.includes("@ibl") || vpaLower.includes("@axl")) {
        return `PhonePe (UPI: ${vpa})`;
      } else if (vpaLower.includes("@paytm")) {
        return `Paytm (UPI: ${vpa})`;
      } else if (vpaLower.includes("@apl")) {
        return `Amazon Pay (UPI: ${vpa})`;
      } else if (vpaLower.includes("@ikwik")) {
        return `MobiKwik (UPI: ${vpa})`;
      } else {
        return `UPI (${vpa})`;
      }
    } else if (method === "card") {
      const card = payment.card || {};
      const network = card.network || "Card";
      const type = card.type ? card.type.toUpperCase() : "DEBIT";
      const last4 = card.last4 ? ` ending ${card.last4}` : "";
      return `${network} ${type}${last4}`.trim();
    } else if (method === "netbanking") {
      const bank = payment.bank || "Bank";
      return `Netbanking (${bank})`;
    } else if (method === "wallet") {
      const wallet = payment.wallet || "Wallet";
      return `Razorpay Wallet (${wallet.charAt(0).toUpperCase() + wallet.slice(1)})`;
    } else if (method) {
      return `Razorpay (${method.toUpperCase()})`;
    }

    return null;
  } catch (error) {
    // Ignore fetch errors if payment ID invalid or network busy
    return null;
  }
}

module.exports = {
  fetchExactRazorpayInstrument,
};
