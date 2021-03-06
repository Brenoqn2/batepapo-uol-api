import express from "express";
import { MongoClient, ObjectId } from "mongodb";
import dotenv from "dotenv";
dotenv.config();
import joi from "joi";
import dayjs from "dayjs";
import cors from "cors";
import { stripHtml } from "string-strip-html";

const mongoClient = new MongoClient(process.env.MONGO_URI);
mongoClient.connect();

const app = express();
app.use(express.json());
app.use(cors());
const PORT = 5000;

const nameSchema = joi.object({
  name: joi.string().alphanum().required(),
});

app.post("/participants", async (req, res) => {
  const name = stripHtml(req.body.name).result.trim();
  const validation = nameSchema.validate({ name: name }, { abortEarly: true });
  if (validation.error) {
    console.log(validation.error.details);
    res.sendStatus(422);
    return;
  }
  try {
    const db = mongoClient.db("bate-papo-uol");
    const participantsCollection = db.collection("participants");
    const alreadyUsedUsername = await participantsCollection.findOne({
      name: name,
    });
    if (alreadyUsedUsername) {
      res.sendStatus(409);
      return;
    }
    await participantsCollection.insertOne({
      name: name,
      lastStatus: Date.now(),
    });
    const messagesCollection = db.collection("messages");
    await messagesCollection.insertOne({
      from: stripHtml(name).result.trim(),
      to: "Todos",
      text: "entra na sala...",
      type: "status",
      time: `${String(dayjs().hour()).padStart(2, "0")}:${String(
        dayjs().minute()
      ).padStart(2, "0")}:${String(dayjs().second()).padStart(2, "0")}}`,
    });
    res.status(201).send({ name: name });
  } catch (e) {
    console.log(e);
    res.sendStatus(500);
  }
});

app.get("/participants", async (req, res) => {
  try {
    const db = mongoClient.db("bate-papo-uol");
    const participantsCollection = db.collection("participants");
    const participants = await participantsCollection.find({}).toArray();
    res.send(participants);
  } catch (e) {
    console.log(e);
    res.sendStatus(500);
  }
});

app.post("/messages", async (req, res) => {
  const to = req.body.to;
  const text = req.body.text;
  const type = req.body.type;
  const from = req.headers.user;

  try {
    const db = mongoClient.db("bate-papo-uol");
    const participantsCollection = db.collection("participants");
    const participants = await participantsCollection.find({}).toArray();
    let participantsNames = [];
    for (let i = 0; i < participants.length; i++) {
      participantsNames.push(participants[i].name);
    }
    const messageSchema = joi.object({
      to: joi.string().alphanum().required(),
      text: joi.string().required(),
      type: joi.string().valid("message", "private_message").required(),
      from: joi
        .string()
        .valid(...participantsNames)
        .required(),
    });
    const validation = messageSchema.validate(
      { to: to, text: text, type: type, from: from },
      { abortEarly: true }
    );
    if (validation.error) {
      console.log(validation.error.details);
      res.sendStatus(422);
      return;
    }
    const messageCollection = db.collection("messages");
    await messageCollection.insertOne({
      to: stripHtml(to).result.trim(),
      text: stripHtml(text).result.trim(),
      type: stripHtml(type).result.trim(),
      from: stripHtml(from).result.trim(),
      time: `${String(dayjs().hour()).padStart(2, "0")}:${String(
        dayjs().minute()
      ).padStart(2, "0")}:${String(dayjs().second()).padStart(2, "0")}}`,
    });
    res.sendStatus(201);
  } catch (e) {
    console.log(e);
    res.sendStatus(500);
  }
});

app.get("/messages", async (req, res) => {
  try {
    const db = mongoClient.db("bate-papo-uol");
    const messagesCollection = db.collection("messages");
    const limit = req.query.limit;
    let messages = await messagesCollection.find({}).toArray();
    messages = messages.filter((message) => {
      if (message.type === "message" || message.type === "status") {
        return message;
      } else if (
        message.to === req.headers.user ||
        message.from === req.headers.user
      ) {
        return message;
      }
    });
    let limitedMessages = [];
    if (limit && limit < messages.length) {
      for (let i = limit; i > 0; i--) {
        limitedMessages.push(messages[messages.length - i]);
      }
    } else {
      limitedMessages = messages;
    }
    res.send(limitedMessages);
  } catch (e) {
    console.log(e);
    res.sendStatus(500);
  }
});

app.post("/status", async (req, res) => {
  const user = req.headers.user;
  try {
    const db = mongoClient.db("bate-papo-uol");
    const participantsCollection = db.collection("participants");
    const loggedUser = await participantsCollection.findOne({ name: user });
    if (!loggedUser) {
      res.sendStatus(404);
      return;
    }
    await participantsCollection.updateOne(
      { name: user },
      { $set: { lastStatus: Date.now() } }
    );
    res.sendStatus(200);
  } catch (e) {
    res.sendStatus(500);
    console.log(e);
  }
});

app.delete("/messages/:id", async (req, res) => {
  try {
    const user = req.headers.user;
    const id = req.params.id;
    const db = mongoClient.db("bate-papo-uol");
    const messagesCollection = db.collection("messages");
    const message = await messagesCollection.findOne({ _id: new ObjectId(id) });
    if (!message) {
      res.sendStatus(404);
      return;
    }
    if (message.from !== user) {
      res.sendStatus(401);
      return;
    }
    await messagesCollection.deleteOne({ _id: new ObjectId(id) });
    res.sendStatus(200);
  } catch (e) {
    console.log(e);
    res.sendStatus(500);
  }
});

setInterval(async () => {
  try {
    const db = mongoClient.db("bate-papo-uol");
    const participantsCollection = db.collection("participants");
    const messagesCollection = db.collection("messages");
    const participants = await participantsCollection.find({}).toArray();
    const now = Date.now();
    for (let i = 0; i < participants.length; i++) {
      if (now - participants[i].lastStatus > 10000) {
        await participantsCollection.deleteOne({ name: participants[i].name });
        await messagesCollection.insertOne({
          from: participants[i].name,
          to: "Todos",
          text: "sai da sala...",
          type: "status",
          time: `${String(dayjs().hour()).padStart(2, "0")}:${String(
            dayjs().minute()
          ).padStart(2, "0")}:${String(dayjs().second()).padStart(2, "0")}}`,
        });
      }
    }
  } catch (e) {
    console.log(e);
  }
}, 15000);

app.listen(5000, () => {
  console.log(`Server is running on port ${PORT}`);
});
