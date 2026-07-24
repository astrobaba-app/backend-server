const SUPPORT_FAQS = [
  {
    category: "Kundli",
    items: [
      {
        question: "What birth details are required for an accurate Kundli?",
        answer:
          "You need your date of birth and place of birth for accurate predictions.",
      },
    ],
  },
  {
    category: "Astrologer and Wallet",
    items: [
      {
        question:
          "Will I be notified when my wallet balance is low during chat with an astrologer?",
        answer:
          "Yes. While using chat service, you will receive a notification if your wallet balance is insufficient for the next session.",
      },
      {
        question: "How are chat charges calculated?",
        answer:
          "Chat charges are calculated on a per-minute basis according to the astrologer's consultation rate.",
      },
      {
        question: "How can I view my wallet transaction history?",
        answer: "Open the Wallet section and view the Transaction History.",
      },
      {
        question: "Can I view my previous chat history?",
        answer:
          "Yes, your previous consultation history is available in the chat history section.",
      },
    ],
  },
  {
    category: "Graho Store",
    items: [
      {
        question:
          "What is the return and refund policy for Graho Store purchases?",
        answer:
          "Currently, there are no return options available for Graho Store purchases.",
      },
      {
        question: "How do I check the status of my order?",
        answer:
          "Open the My Orders page to view shipping updates and delivery status.",
      },
    ],
  },
  {
    category: "Horoscope & Predictions",
    items: [
      {
        question: "How can I view my daily horoscope?",
        answer:
          "Visit the Horoscope section and select your zodiac sign to view daily predictions.",
      },
      {
        question: "Are weekly and monthly horoscopes available?",
        answer:
          "Yes, you can access daily, weekly, monthly, and yearly horoscope predictions.",
      },
    ],
  },
  {
    category: "Refund Policy",
    items: [
      {
        question:
          "My money was deducted, but I couldn't connect with an astrologer. How can I request a refund?",
        answer:
          "Visit the {link} page for detailed instructions regarding refund eligibility.",
        link: {
          text: "Cancellation and Refund Policy",
          url: "https://graho.in/policies/cancellation_refund",
        },
      },
      {
        question:
          "Can I get a refund if I accidentally added money to my wallet?",
        answer:
          "No, wallet recharges are non-refundable and irreversible once completed.",
      },
    ],
  },
  {
    category: "Notifications & Settings",
    items: [
      {
        question: "Can I disable notifications?",
        answer:
          "Yes, notification preferences can be managed from the Settings page.",
      },
      {
        question: "Why am I not receiving notifications?",
        answer:
          "Please ensure notifications are enabled in both the app settings and your device settings.",
      },
      {
        question: "How do I delete my account?",
        answer: "Please visit the Settings page and request account deletion.",
      },
    ],
  },
  {
    category: "Discussion Forum",
    items: [
      {
        question: "Can I edit or delete my discussion post?",
        answer:
          "Yes, you can edit or delete your own posts at any time from the post options menu.",
      },
      {
        question: "Can I post anonymously?",
        answer:
          "Yes, anonymous mode hides your identity for future posts and comments while preserving the original visibility settings of previous content.",
      },
    ],
  },
  {
    category: "Support",
    items: [
      {
        question: "Is there a support email for Graho?",
        answer: "Yes. You can contact our support team at hello@graho.in",
      },
      {
        question: "How can I raise a support ticket?",
        answer:
          "Go to the Support Ticket section and browse the FAQs first. If your query is still not resolved, tap Raise Ticket, select the appropriate category, and describe your issue.",
      },
    ],
  },
];

const getSupportFaqGroups = () => SUPPORT_FAQS;

module.exports = {
  SUPPORT_FAQS,
  getSupportFaqGroups,
};
