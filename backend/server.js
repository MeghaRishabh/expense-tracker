const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const cookieParser = require("cookie-parser");
require("dotenv").config();

const verifyJWT = require("./middleware");
const User = require("./User");

const app = express();
const PORT = 5000;

/* =========================
   GLOBAL MIDDLEWARES
========================= */

app.use(express.json());

app.use(cookieParser());

app.use(
  cors({
    origin: true, // React frontend
    credentials: true,               // allow cookies
  })
);

/* =========================
   DATABASE CONNECTION
========================= */

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ MongoDB connected");
  } catch (err) {
    console.error("❌ MongoDB connection failed:", err.message);
    process.exit(1);
  }
};

connectDB();

/* =========================
   AUTH ROUTES
========================= */

// REGISTER
app.post("/register", async (req, res) => {
  const { user, pwd } = req.body;

  if (!user || !pwd) {
    return res.status(400).json({ message: "Username and password required" });
  }

  try {
    const duplicate = await User.findOne({ username: user });
    if (duplicate) return res.sendStatus(409);

    const hashedPwd = await bcrypt.hash(pwd, 10);

    const newUser = await User.create({
      username: user,
      password: hashedPwd,
      transactions: [],
    });

    const accessToken = jwt.sign(
      { id: newUser._id },
      process.env.ACCESS_TOKEN_SECRET,
      { expiresIn: "15m" }
    );

    const refreshToken = jwt.sign(
      { id: newUser._id },
      process.env.REFRESH_TOKEN_SECRET,
      { expiresIn: "1d" }
    );

    newUser.refreshToken = refreshToken;
    await newUser.save();

    res.cookie("jwt", refreshToken, {
      httpOnly: true,
      sameSite: "Lax",
      secure: false,
      maxAge: 24 * 60 * 60 * 1000,
    });

    res.status(201).json({ accessToken });
  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
});

// LOGIN
app.post("/login", async (req, res) => {
  const { user, pwd } = req.body;

  if (!user || !pwd) {
    return res.status(400).json({ message: "Username and password required" });
  }

  const foundUser = await User.findOne({ username: user });
  if (!foundUser) return res.sendStatus(401);

  const match = await bcrypt.compare(pwd, foundUser.password);
  if (!match) return res.sendStatus(401);

  const accessToken = jwt.sign(
    { id: foundUser._id },
    process.env.ACCESS_TOKEN_SECRET,
    { expiresIn: "15m" }
  );

  const refreshToken = jwt.sign(
    { id: foundUser._id },
    process.env.REFRESH_TOKEN_SECRET,
    { expiresIn: "1d" }
  );

  foundUser.refreshToken = refreshToken;
  await foundUser.save();

  res.cookie("jwt", refreshToken, {
    httpOnly: true,
    sameSite: "Lax",
    secure: false,
    maxAge: 24 * 60 * 60 * 1000,
  });

  res.json({ accessToken });
});

// REFRESH TOKEN
app.post("/refresh", async (req, res) => {
  const refreshToken = req.cookies?.jwt;
  if (!refreshToken) return res.sendStatus(401);

  const foundUser = await User.findOne({ refreshToken });
  if (!foundUser) return res.sendStatus(403);

  jwt.verify(
    refreshToken,
    process.env.REFRESH_TOKEN_SECRET,
    (err, decoded) => {
      if (err || foundUser._id.toString() !== decoded.id) {
        return res.sendStatus(403);
      }

      const accessToken = jwt.sign(
        { id: foundUser._id },
        process.env.ACCESS_TOKEN_SECRET,
        { expiresIn: "15m" }
      );

      res.json({ accessToken });
    }
  );
});

// LOGOUT
app.post("/logout", async (req, res) => {
  const refreshToken = req.cookies?.jwt;
  if (!refreshToken) return res.sendStatus(204);

  const foundUser = await User.findOne({ refreshToken });
  if (foundUser) {
    foundUser.refreshToken = null;
    await foundUser.save();
  }

  res.clearCookie("jwt", {
    httpOnly: true,
    sameSite: "Lax",
    secure: false,
  });

  res.sendStatus(204);
});

/* =========================
   TRANSACTION ROUTES
========================= */

// CREATE
app.post("/auth/create", verifyJWT, async (req, res) => {
  const { type, category, amount, description, date } = req.body;

  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.sendStatus(404);

    user.transactions.push({
      type,
      category,
      amount,
      description,
      date,
    });

    await user.save();
    res.status(201).json({ message: "Transaction added" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// READ
app.get("/auth/transactions", verifyJWT, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("transactions");
    if (!user) return res.sendStatus(404);

    res.json(user.transactions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// UPDATE
app.put("/auth/update/:tid", verifyJWT, async (req, res) => {
  const { type, category, amount, description, date } = req.body;

  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.sendStatus(404);

    const transaction = user.transactions.id(req.params.tid);
    if (!transaction) return res.sendStatus(404);

    transaction.type = type;
    transaction.category = category;
    transaction.amount = amount;
    transaction.description = description;
    transaction.date = date || transaction.date;

    await user.save();
    res.json({ message: "Transaction updated" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE
app.delete("/auth/delete/:tid", verifyJWT, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.sendStatus(404);

    const transaction = user.transactions.id(req.params.tid);
    if (!transaction) return res.sendStatus(404);

    transaction.deleteOne();
    await user.save();

    res.json({ message: "Transaction deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* =========================
   SERVER START
========================= */

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
