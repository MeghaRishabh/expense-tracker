const express = require("express");
const jwt = require("jsonwebtoken");
require("dotenv").config();
const app = express();
const bcrypt = require("bcrypt");
const verifyJWT = require("./middleware");
const mongoose = require("mongoose");
const User = require("./User");

app.use("/auth", verifyJWT);
app.use(express.json());
const PORT = 3000;

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("MongoDB connected");
  } catch (err) {
    console.error("MongoDB connection failed:", err.message);
    process.exit(1);
  }
};

connectDB();

app.post("/register", async (req, res) => {
  const { user, pwd } = req.body;

  if (!user || !pwd) {
    return res
      .status(400)
      .json({ message: "Username and password are required." });
  }

  try {
    // 1️⃣ Check if user already exists
    const duplicate = await User.findOne({ username: user });
    if (duplicate) return res.sendStatus(409);

    // 2️⃣ Hash password
    const hashedPwd = await bcrypt.hash(pwd, 10);

    // 3️⃣ Create user first (IMPORTANT)
    const newUser = await User.create({
      username: user,
      password: hashedPwd,
      transactions: [],
    });

    // 4️⃣ Create JWTs using USER ID
    const accessToken = jwt.sign(
      { id: newUser._id },
      process.env.ACCESS_TOKEN_SECRET,
      { expiresIn: "30s" }
    );

    const refreshToken = jwt.sign(
      { id: newUser._id },
      process.env.REFRESH_TOKEN_SECRET,
      { expiresIn: "1d" }
    );

    // 5️⃣ Save refresh token in DB
    newUser.refreshToken = refreshToken;
    await newUser.save();

    // 6️⃣ Set refresh token cookie
    res.cookie("jwt", refreshToken, {
      httpOnly: true,
      sameSite: "None",
      secure: true,
      maxAge: 24 * 60 * 60 * 1000,
    });

    // 7️⃣ Send access token
    res.status(201).json({ accessToken });
  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
});

app.post("/login", async (req, res) => {
  const { user, pwd } = req.body;

  if (!user || !pwd) {
    return res.status(400).json({
      message: "Username and password are required.",
    });
  }

  // 🔹 Find user in MongoDB
  const foundUser = await User.findOne({ username: user });
  if (!foundUser) return res.sendStatus(401);

  // 🔹 Compare password
  const match = await bcrypt.compare(pwd, foundUser.password);
  if (!match) return res.sendStatus(401);

  // 🔹 Create tokens USING USER ID
  const accessToken = jwt.sign(
    { id: foundUser._id },
    process.env.ACCESS_TOKEN_SECRET,
    { expiresIn: "30s" }
  );

  const refreshToken = jwt.sign(
    { id: foundUser._id },
    process.env.REFRESH_TOKEN_SECRET,
    { expiresIn: "1d" }
  );

  // 🔹 Save refresh token
  foundUser.refreshToken = refreshToken;
  await foundUser.save();

  // 🔹 Send cookie
  res.cookie("jwt", refreshToken, {
    httpOnly: true,
    sameSite: "None",
    secure: true,
    maxAge: 24 * 60 * 60 * 1000,
  });

  res.json({ accessToken });
});

app.post("/refresh", async (req, res) => {
  const cookies = req.cookies;
  if (!cookies?.jwt) return res.sendStatus(401); // Unauthorized

  const refreshToken = cookies.jwt;

  try {
    // 🔍 Find user by refresh token
    const foundUser = await User.findOne({ refreshToken });
    if (!foundUser) return res.sendStatus(403); // Forbidden

    // 🔐 Verify refresh token
    jwt.verify(
      refreshToken,
      process.env.REFRESH_TOKEN_SECRET,
      (err, decoded) => {
        if (err) return res.sendStatus(403);

        // 🔎 Match token user ID with DB user ID
        if (foundUser._id.toString() !== decoded.id) {
          return res.sendStatus(403);
        }

        // ✅ Create new access token USING ID
        const accessToken = jwt.sign(
          { id: foundUser._id },
          process.env.ACCESS_TOKEN_SECRET,
          { expiresIn: "30s" }
        );

        res.json({ accessToken });
      }
    );
  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
});

app.post("/logout", async (req, res) => {
  const cookies = req.cookies;

  // No refresh token → nothing to do
  if (!cookies?.jwt) return res.sendStatus(204);

  const refreshToken = cookies.jwt;

  try {
    // 🔍 Find user with this refresh token
    const foundUser = await User.findOne({ refreshToken });

    // If no user found, just clear cookie
    if (!foundUser) {
      res.clearCookie("jwt", {
        httpOnly: true,
        sameSite: "None",
        secure: true,
      });
      return res.sendStatus(204);
    }

    // ❌ Remove refresh token from DB
    foundUser.refreshToken = null;
    await foundUser.save();

    // 🍪 Clear cookie on client
    res.clearCookie("jwt", {
      httpOnly: true,
      sameSite: "None",
      secure: true,
    });

    res.sendStatus(204);
  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
});

app.post("/auth/create", verifyJWT, async (req, res) => {
  try {
    const { type, category, amount, description, date } = req.body;

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

app.get("/auth/transactions", verifyJWT, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("transactions");
    if (!user) return res.sendStatus(404);

    res.json(user.transactions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/auth/update/:tid", verifyJWT, async (req, res) => {
  try {
    const { type, category, amount, description, date } = req.body;

    if (!type || !category || amount == null) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const user = await User.findById(req.user.id);
    if (!user) return res.sendStatus(404);

    const transaction = user.transactions.id(req.params.tid);
    if (!transaction) return res.sendStatus(404);

    // Replace all fields
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

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
