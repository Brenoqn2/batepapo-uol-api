import express from "express";
import { MongoClient } from "mongodb";
import dotenv from "dotenv";
dotenv.config();
import joi from "joi";
import dayjs from "dayjs";
import cors from "cors";

const mongoClient = new MongoClient(process.env.MONGO_URI);

const app = express();
app.use(express.json());
app.use(cors());
const PORT = 5000;

const nameSchema = joi.object({
  name: joi.string().alphanum().required(),
});

app.post("/participants", async (req, res) => {
  const name = req.body.name;
  const validation = nameSchema.validate({ name: name }, { abortEarly: true });
  if (validation.error) {
    console.log(validation.error.details);
    res.sendStatus(422);
    return;
  }
  try {
    await mongoClient.connect();
    const db = mongoClient.db("bate-papo-uol");
    const participantsCollection = db.collection("participants");
    const alreadyUsedUsername = await participantsCollection.findOne({
      name: name,
    });
    if (alreadyUsedUsername) {
      mongoClient.close();
      res.sendStatus(409);
      return;
    }
    await participantsCollection.insertOne({
      name: name,
      lastStatus: Date.now(),
    });
    const messagesCollection = db.collection("messages");
    await messagesCollection.insertOne({
      from: name,
      to: "Todos",
      text: "entra na sala...",
      type: "status",
      time: `${String(dayjs().hour()).padStart(2, "0")}:${String(
        dayjs().minute()
      ).padStart(2, "0")}:${String(dayjs().second()).padStart(2, "0")}}`,
    });
    res.sendStatus(201);
    mongoClient.close();
  } catch (e) {
    console.log(e);
    res.sendStatus(500);
    mongoClient.close();
  }
});

app.listen(5000, () => {
  console.log(`Server is running on port ${PORT}`);
});