import dotenv from "dotenv";
import connectDB from "./db/index.js";
import app from "./app.js";

dotenv.config({
  path: "./.env",
});

connectDB()
  .then(() => {
    app.on("error", (error) => {
      console.log("Error : ", error);
      throw error;
    });

    app.listen(process.env.PORT,'0.0.0.0' || 4000, () => {
      console.log(
        `Application Running on http://localhost:${process.env.PORT}`
      );
    });
  })
  .catch((error) => {
    console.log("MongoDB connection failed", error);
  });
