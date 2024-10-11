const express = require("express");
const bodyParser = require("body-parser");
const session = require("express-session");
const { OpenAI } = require("openai");
const path = require("path");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 3000;

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Middleware
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));

// Set up session management
app.use(
  session({
    secret: process.env.SESSION_SECRET || "your_secret_key",
    resave: false,
    saveUninitialized: true,
    cookie: { secure: process.env.NODE_ENV === "production" },
  })
);

// Helper function to wait for a specified time
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Chat endpoint
app.post("/chat", async (req, res) => {
  const userMessage = req.body.message;
  console.log("Received message:", userMessage);

  try {
    console.log("Checking OpenAI API key and Assistant ID...");
    if (!process.env.OPENAI_API_KEY || !process.env.OPENAI_ASSISTANT_ID) {
      throw new Error("OpenAI API key or Assistant ID is not set");
    }

    console.log("Initializing or retrieving thread ID...");
    let isNewThread = false;
    if (!req.session.threadId) {
      const thread = await openai.beta.threads.create();
      req.session.threadId = thread.id;
      console.log("Created new thread:", thread.id);
      isNewThread = true;
    } else {
      console.log("Using existing thread:", req.session.threadId);
    }

    if (isNewThread || userMessage === "INIT") {
      console.log("Sending initial greeting...");
      await openai.beta.threads.messages.create(req.session.threadId, {
        role: "user",
        content:
          "Please greet me as a new visitor to the Golden Share Canada website with an interesting fact and how you can help.",
      });
    } else {
      console.log("Adding user message to thread...");
      await openai.beta.threads.messages.create(req.session.threadId, {
        role: "user",
        content: userMessage,
      });
    }
    console.log("Message added successfully");

    console.log("Starting assistant run...");
    const run = await openai.beta.threads.runs.create(req.session.threadId, {
      assistant_id: process.env.OPENAI_ASSISTANT_ID,
    });
    console.log("Assistant run started:", run.id);

    console.log("Checking run status...");
    let runStatus;
    do {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      runStatus = await openai.beta.threads.runs.retrieve(
        req.session.threadId,
        run.id
      );
      console.log("Run status:", runStatus.status);
    } while (runStatus.status !== "completed" && runStatus.status !== "failed");

    if (runStatus.status === "failed") {
      throw new Error("Assistant run failed: " + runStatus.last_error?.message);
    }

    console.log("Retrieving messages...");
    const messages = await openai.beta.threads.messages.list(
      req.session.threadId
    );
    console.log("Messages retrieved successfully");

    const lastMessageForRun = messages.data
      .filter(
        (message) => message.run_id === run.id && message.role === "assistant"
      )
      .pop();

    if (lastMessageForRun) {
      const assistantMessage = lastMessageForRun.content[0].text.value;
      console.log("Assistant response:", assistantMessage);
      res.json({ message: assistantMessage, isNewThread: isNewThread });
    } else {
      console.log("No response from assistant");
      res.status(500).json({ message: "No response from assistant." });
    }
  } catch (error) {
    console.error("Error in /chat route:", error);
    if (error.message.includes("exceeded your current quota")) {
      res
        .status(429)
        .json({
          message:
            "Service temporarily unavailable due to high demand. Please try again later.",
        });
    } else {
      res
        .status(500)
        .json({
          message: "An error occurred while processing your request.",
          error: error.message,
        });
    }
  }
});

// Start the server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
  console.log(
    "OpenAI API Key:",
    process.env.OPENAI_API_KEY ? "Set" : "Not set"
  );
  console.log(
    "OpenAI Assistant ID:",
    process.env.OPENAI_ASSISTANT_ID ? "Set" : "Not set"
  );
  console.log(
    "Session Secret:",
    process.env.SESSION_SECRET
      ? "Set"
      : "Using default (not recommended for production)"
  );
  console.log("Node Environment:", process.env.NODE_ENV || "development");
});
