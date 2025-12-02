require("dotenv").config();
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const path = require("path");
const initDB = require("./dbConnection/dbSync");

const PORT = process.env.PORT || 6001;
const app = express();

const allowedOrigins = [process.env.FRONTEND_URL,process.env.FRONTEND_URL1];
app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (like mobile apps, Postman, or same-origin)
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS: " + origin));
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json());
app.use(cookieParser());
app.use(express.urlencoded({ extended: false }));


// Routes
const phoneAuthRoute = require("./routes/authRoute/phoneAuthRoute");
const userProfileRoute = require("./routes/profileRoute/userProfileRoute");
const kundliRoute = require("./routes/horoscope/kundliRoute");
const dailyHoroscopeRoute = require("./routes/horoscope/dailyHoroscopeRoute");
const kundliMatchRoute = require("./routes/horoscope/matchingRoute");
const walletRoute = require("./routes/wallet/walletRoute");
const astrologerAuthRoute = require("./routes/astrologer/astrologerAuthRoute");
const astrologerRoute = require("./routes/astrologer/astrologerRoute");
const adminRoute = require("./routes/admin/adminRoute");
const blogRoute = require("./routes/blog/blogRoute");
const reviewRoute = require("./routes/review/reviewRoute");
const chatRoute = require("./routes/chat/chatRoute");
const liveRoute = require("./routes/live/liveRoute");
const callRoute = require("./routes/call/callRoute");
const notificationRoute = require("./routes/notification/notificationRoute");
const couponRoute = require("./routes/coupon/couponRoute");
const followRoute = require("./routes/follow/followRoute");
const assistantRoute = require("./routes/assistant/assistantRoute");
const supportRoute = require("./routes/support/supportRoute");
const storeRoute = require("./routes/store/storeRoute");

app.use("/api/auth", phoneAuthRoute);
app.use("/api/user", userProfileRoute);
app.use("/api/kundli", kundliRoute);
app.use("/api/horoscope", dailyHoroscopeRoute);
app.use("/api/kundli-matching", kundliMatchRoute);
app.use("/api/wallet", walletRoute);
app.use("/api/astrologer/auth", astrologerAuthRoute);
app.use("/api/astrologers", astrologerRoute);
app.use("/api/admin", adminRoute);
app.use("/api/blogs", blogRoute);
app.use("/api/reviews", reviewRoute);
app.use("/api/chat", chatRoute);
app.use("/api/live", liveRoute);
app.use("/api/call", callRoute);
app.use("/api/notifications", notificationRoute);
app.use("/api/coupons", couponRoute);
app.use("/api/follow", followRoute);
app.use("/api/assistant", assistantRoute);
app.use("/api/support", supportRoute);
app.use("/api/store", storeRoute);

initDB(() => {
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
});
