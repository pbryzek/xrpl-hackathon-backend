require("dotenv").config();
const express = require("express");
const cors = require("cors");
const app = express();
const PORT = process.env.PORT || 5001;
app.use(express.json());
app.use(cors());

const bondsRouter = require("./routes/bondsRouter");
const xrplRouter = require("./routes/xrplRouter");

// ✅ Mount the bonds router
app.use("/bonds", bondsRouter);
app.use("/xrpl", xrplRouter);

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
