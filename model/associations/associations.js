const User = require("../user/userAuth");
const UserRequest = require("../user/userRequest");
const Kundli = require("../horoscope/kundli");
const MatchingProfile = require("../horoscope/matchingProfile");
const GoogleAuth = require("../user/googleAuth");
const Address = require("../user/address");
const DeviceToken = require("../user/deviceToken");
const Wallet = require("../wallet/wallet");
const WalletTransaction = require("../wallet/walletTransaction");
const Astrologer = require("../astrologer/astrologer");
const Admin = require("../admin/admin");
const Blog = require("../blog/blog");
const BlogLike = require("../blog/blogLike");
const Review = require("../review/review");
const ChatSession = require("../chat/chatSession");
const ChatMessage = require("../chat/chatMessage");
const LiveSession = require("../live/liveSession");
const LiveParticipant = require("../live/liveParticipant");
const CallSession = require("../call/callSession");
const Notification = require("../notification/notification");
const Coupon = require("../coupon/coupon");
const CouponUsage = require("../coupon/couponUsage");
const Follow = require("../follow/follow");
const AssistantPlan = require("../assistant/assistantPlan");
const AssistantChat = require("../assistant/assistantChat");
const SupportTicket = require("../support/supportTicket");
const TicketReply = require("../support/ticketReply");
const Product = require("../store/product");
const Cart = require("../store/cart");
const Order = require("../store/order");
const ProductReview = require("../store/productReview");
const AstrologerEarning = require("../astrologer/astrologerEarning");
const AIChatSession = require("../aiChat/aiChatSession");
const AIChatMessage = require("../aiChat/aiChatMessage");
const CachedHoroscope = require("../horoscope/cachedHoroscope");


  // User has many UserRequests
  User.hasMany(UserRequest, {
    foreignKey: "userId",
    as: "userRequests",
    onDelete: "CASCADE",
  });

  UserRequest.belongsTo(User, {
    foreignKey: "userId",
    as: "user",
  });

  // UserRequest has one Kundli
  UserRequest.hasOne(Kundli, {
    foreignKey: "requestId",
    as: "kundli",
    onDelete: "CASCADE",
  });

  Kundli.belongsTo(UserRequest, {
    foreignKey: "requestId",
    as: "userRequest",
  });


    User.hasOne(GoogleAuth, {
    foreignKey: "userId",
    as: "googleAuth",
    onDelete: "CASCADE",
  });

  GoogleAuth.belongsTo(User, {
    foreignKey: "userId",
    as: "user",
  });

  // MatchingProfile belongs to User
  User.hasMany(MatchingProfile, {
    foreignKey: "userId",
    as: "matchingProfiles",
    onDelete: "CASCADE",
  });

  MatchingProfile.belongsTo(User, {
    foreignKey: "userId",
    as: "user",
  });

  // Address associations
  User.hasMany(Address, {
    foreignKey: "userId",
    as: "addresses",
    onDelete: "CASCADE",
  });

  Address.belongsTo(User, {
    foreignKey: "userId",
    as: "user",
  });

  // DeviceToken associations
  User.hasMany(DeviceToken, {
    foreignKey: "userId",
    as: "deviceTokens",
    onDelete: "CASCADE",
  });

  DeviceToken.belongsTo(User, {
    foreignKey: "userId",
    as: "user",
  });

  // Wallet associations
  User.hasOne(Wallet, {
    foreignKey: "userId",
    as: "wallet",
    onDelete: "CASCADE",
  });

  Wallet.belongsTo(User, {
    foreignKey: "userId",
    as: "user",
  });

  // WalletTransaction associations
  User.hasMany(WalletTransaction, {
    foreignKey: "userId",
    as: "walletTransactions",
    onDelete: "CASCADE",
  });

  WalletTransaction.belongsTo(User, {
    foreignKey: "userId",
    as: "user",
  });

  Wallet.hasMany(WalletTransaction, {
    foreignKey: "walletId",
    as: "transactions",
    onDelete: "CASCADE",
  });

  WalletTransaction.belongsTo(Wallet, {
    foreignKey: "walletId",
    as: "wallet",
  });

  // Blog associations
  Astrologer.hasMany(Blog, {
    foreignKey: "astrologerId",
    as: "blogs",
    onDelete: "CASCADE",
  });

  Blog.belongsTo(Astrologer, {
    foreignKey: "astrologerId",
    as: "astrologer",
  });

  // Blog - BlogLike
  Blog.hasMany(BlogLike, {
    foreignKey: "blogId",
    as: "blogLikes",
    onDelete: "CASCADE",
  });

  BlogLike.belongsTo(Blog, {
    foreignKey: "blogId",
    as: "blog",
  });

  // User - BlogLike
  User.hasMany(BlogLike, {
    foreignKey: "userId",
    as: "blogLikes",
    onDelete: "CASCADE",
  });

  BlogLike.belongsTo(User, {
    foreignKey: "userId",
    as: "user",
  });

  // Review associations
  User.hasMany(Review, {
    foreignKey: "userId",
    as: "reviews",
    onDelete: "CASCADE",
  });

  Review.belongsTo(User, {
    foreignKey: "userId",
    as: "user",
  });

  Astrologer.hasMany(Review, {
    foreignKey: "astrologerId",
    as: "reviews",
    onDelete: "CASCADE",
  });

  Review.belongsTo(Astrologer, {
    foreignKey: "astrologerId",
    as: "astrologer",
  });

  // ChatSession associations
  User.hasMany(ChatSession, {
    foreignKey: "userId",
    as: "chatSessions",
    onDelete: "CASCADE",
  });

  ChatSession.belongsTo(User, {
    foreignKey: "userId",
    as: "user",
  });

  Astrologer.hasMany(ChatSession, {
    foreignKey: "astrologerId",
    as: "chatSessions",
    onDelete: "CASCADE",
  });

  ChatSession.belongsTo(Astrologer, {
    foreignKey: "astrologerId",
    as: "astrologer",
  });

  // ChatMessage associations
  ChatSession.hasMany(ChatMessage, {
    foreignKey: "sessionId",
    as: "messages",
    onDelete: "CASCADE",
  });

  ChatMessage.belongsTo(ChatSession, {
    foreignKey: "sessionId",
    as: "session",
  });

  // LiveSession associations
  Astrologer.hasMany(LiveSession, {
    foreignKey: "astrologerId",
    as: "liveSessions",
    onDelete: "CASCADE",
  });

  LiveSession.belongsTo(Astrologer, {
    foreignKey: "astrologerId",
    as: "astrologer",
  });

  // LiveParticipant associations
  LiveSession.hasMany(LiveParticipant, {
    foreignKey: "liveSessionId",
    as: "participants",
    onDelete: "CASCADE",
  });

  LiveParticipant.belongsTo(LiveSession, {
    foreignKey: "liveSessionId",
    as: "liveSession",
  });

  User.hasMany(LiveParticipant, {
    foreignKey: "userId",
    as: "liveParticipations",
    onDelete: "CASCADE",
  });

  LiveParticipant.belongsTo(User, {
    foreignKey: "userId",
    as: "user",
  });

  // CallSession associations
  User.hasMany(CallSession, {
    foreignKey: "userId",
    as: "calls",
    onDelete: "CASCADE",
  });

  CallSession.belongsTo(User, {
    foreignKey: "userId",
    as: "user",
  });

  Astrologer.hasMany(CallSession, {
    foreignKey: "astrologerId",
    as: "calls",
    onDelete: "CASCADE",
  });

  CallSession.belongsTo(Astrologer, {
    foreignKey: "astrologerId",
    as: "astrologer",
  });

  // Notification associations
  User.hasMany(Notification, {
    foreignKey: "userId",
    as: "notifications",
    onDelete: "CASCADE",
  });

  Notification.belongsTo(User, {
    foreignKey: "userId",
    as: "user",
  });

  // Coupon associations
  Admin.hasMany(Coupon, {
    foreignKey: "createdBy",
    as: "coupons",
  });

  Coupon.belongsTo(Admin, {
    foreignKey: "createdBy",
    as: "admin",
  });

  // CouponUsage associations
  Coupon.hasMany(CouponUsage, {
    foreignKey: "couponId",
    as: "usages",
    onDelete: "CASCADE",
  });

  CouponUsage.belongsTo(Coupon, {
    foreignKey: "couponId",
    as: "coupon",
  });

  User.hasMany(CouponUsage, {
    foreignKey: "userId",
    as: "couponUsages",
    onDelete: "CASCADE",
  });

  CouponUsage.belongsTo(User, {
    foreignKey: "userId",
    as: "user",
  });

  // Follow associations
  User.hasMany(Follow, {
    foreignKey: "userId",
    as: "following",
    onDelete: "CASCADE",
  });

  Follow.belongsTo(User, {
    foreignKey: "userId",
    as: "user",
  });

  Astrologer.hasMany(Follow, {
    foreignKey: "astrologerId",
    as: "followers",
    onDelete: "CASCADE",
  });

  Follow.belongsTo(Astrologer, {
    foreignKey: "astrologerId",
    as: "astrologer",
  });

  // Assistant Plan associations
  Astrologer.hasOne(AssistantPlan, {
    foreignKey: "astrologerId",
    as: "assistantPlan",
    onDelete: "CASCADE",
  });

  AssistantPlan.belongsTo(Astrologer, {
    foreignKey: "astrologerId",
    as: "astrologer",
  });

  // Assistant Chat associations
  User.hasMany(AssistantChat, {
    foreignKey: "userId",
    as: "assistantChats",
    onDelete: "CASCADE",
  });

  AssistantChat.belongsTo(User, {
    foreignKey: "userId",
    as: "user",
  });

  Astrologer.hasMany(AssistantChat, {
    foreignKey: "astrologerId",
    as: "assistantChats",
    onDelete: "CASCADE",
  });

  AssistantChat.belongsTo(Astrologer, {
    foreignKey: "astrologerId",
    as: "astrologer",
  });

  // Support Ticket associations
  User.hasMany(SupportTicket, {
    foreignKey: "userId",
    as: "supportTickets",
    onDelete: "CASCADE",
  });

  SupportTicket.belongsTo(User, {
    foreignKey: "userId",
    as: "user",
  });

  Admin.hasMany(SupportTicket, {
    foreignKey: "adminId",
    as: "assignedTickets",
    onDelete: "SET NULL",
  });

  SupportTicket.belongsTo(Admin, {
    foreignKey: "adminId",
    as: "admin",
  });

  SupportTicket.hasMany(TicketReply, {
    foreignKey: "ticketId",
    as: "replies",
    onDelete: "CASCADE",
  });

  TicketReply.belongsTo(SupportTicket, {
    foreignKey: "ticketId",
    as: "ticket",
  });

  // Store associations
  // User - Cart
  User.hasMany(Cart, {
    foreignKey: "userId",
    as: "cartItems",
    onDelete: "CASCADE",
  });

  Cart.belongsTo(User, {
    foreignKey: "userId",
    as: "user",
  });

  // Product - Cart
  Product.hasMany(Cart, {
    foreignKey: "productId",
    as: "cartItems",
    onDelete: "CASCADE",
  });

  Cart.belongsTo(Product, {
    foreignKey: "productId",
    as: "product",
  });

  // User - Order
  User.hasMany(Order, {
    foreignKey: "userId",
    as: "orders",
    onDelete: "CASCADE",
  });

  Order.belongsTo(User, {
    foreignKey: "userId",
    as: "user",
  });

  // Product - ProductReview
  Product.hasMany(ProductReview, {
    foreignKey: "productId",
    as: "reviews",
    onDelete: "CASCADE",
  });

  ProductReview.belongsTo(Product, {
    foreignKey: "productId",
    as: "product",
  });

  // User - ProductReview
  User.hasMany(ProductReview, {
    foreignKey: "userId",
    as: "productReviews",
    onDelete: "CASCADE",
  });

  ProductReview.belongsTo(User, {
    foreignKey: "userId",
    as: "user",
  });

  // Order - ProductReview
  Order.hasMany(ProductReview, {
    foreignKey: "orderId",
    as: "reviews",
    onDelete: "SET NULL",
  });

  ProductReview.belongsTo(Order, {
    foreignKey: "orderId",
    as: "order",
  });

  // Astrologer - AstrologerEarning
  Astrologer.hasMany(AstrologerEarning, {
    foreignKey: "astrologerId",
    as: "earnings",
    onDelete: "CASCADE",
  });

  AstrologerEarning.belongsTo(Astrologer, {
    foreignKey: "astrologerId",
    as: "astrologer",
  });

  // User - AstrologerEarning
  User.hasMany(AstrologerEarning, {
    foreignKey: "userId",
    as: "astrologerEarnings",
    onDelete: "CASCADE",
  });

  AstrologerEarning.belongsTo(User, {
    foreignKey: "userId",
    as: "user",
  });

  // User - AI Chat Sessions
  User.hasMany(AIChatSession, {
    foreignKey: "userId",
    as: "aiChatSessions",
    onDelete: "CASCADE",
  });

  AIChatSession.belongsTo(User, {
    foreignKey: "userId",
    as: "user",
  });

  // AI Chat Session - Messages
  AIChatSession.hasMany(AIChatMessage, {
    foreignKey: "sessionId",
    as: "messages",
    onDelete: "CASCADE",
  });

  AIChatMessage.belongsTo(AIChatSession, {
    foreignKey: "sessionId",
    as: "session",
  });

