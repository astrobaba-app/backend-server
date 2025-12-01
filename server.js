require("dotenv").config();
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const initDB = require("./dbConnection/dbSync");

const PORT = process.env.PORT || 6001;
const app = express();

const allowedOrigins = [process.env.FRONTEND_URL];
app.use(
  cors({
    origin: function (origin, callback) {
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
const kundliMatchRoute = require("./routes/horoscope/matchingRoute")

app.use("/api/auth", phoneAuthRoute);
app.use("/api/user", userProfileRoute);
app.use("/api/kundli", kundliRoute);
app.use("/api/horoscope", dailyHoroscopeRoute);
app.use("/api/kundli-matching", kundliMatchRoute);

initDB(() => {
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
});
