import { createClient } from "redis";

const MAX_NAME_LENGTH = 20;
const MAX_SCORE = 500;
const MAX_RANKINGS_PER_DAY = 1000;

function sanitizeName(name) {
  if (typeof name !== "string") return null;
  const trimmed = name.trim().slice(0, MAX_NAME_LENGTH);
  // Strip anything that isn't alphanumeric, space, dash, underscore
  const clean = trimmed.replace(/[^a-zA-Z0-9 _\-]/g, "");
  return clean.length > 0 ? clean : null;
}

function validateScore(score) {
  if (typeof score !== "number" || !Number.isFinite(score)) return null;
  if (score < 0 || score > MAX_SCORE) return null;
  return Math.floor(score);
}

function validateAvatarIndex(index) {
  if (typeof index !== "number" || !Number.isFinite(index)) return 0;
  return Math.max(0, Math.min(99, Math.floor(index)));
}

function validateDate(date) {
  if (typeof date !== "string") return null;
  // Must be YYYY-MM-DD format
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const parsed = new Date(date);
  if (isNaN(parsed.getTime())) return null;
  // Only allow today or yesterday
  const now = new Date();
  const diffDays = Math.floor((now - parsed) / 86400000);
  if (diffDays < 0 || diffDays > 1) return null;
  return date;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { name, score, avatarIndex, date } = req.body || {};

  const cleanName = sanitizeName(name);
  const cleanScore = validateScore(score);
  const cleanAvatar = validateAvatarIndex(avatarIndex);
  const cleanDate = validateDate(date);

  if (!cleanName) return res.status(400).json({ error: "Invalid name" });
  if (cleanScore === null) return res.status(400).json({ error: "Invalid score" });
  if (!cleanDate) return res.status(400).json({ error: "Invalid date" });

  const client = createClient({
    url: process.env.KV_REDIS_URL,
  });

  client.on("error", (err) => console.log("Redis Client Error", err));

  try {
    await client.connect();

    const key = `daily:${cleanDate}:rankings`;

    // Simple rate limit: cap total rankings per day
    const currentLength = await client.lLen(key);
    if (currentLength >= MAX_RANKINGS_PER_DAY) {
      await client.disconnect();
      return res.status(429).json({ error: "Too many submissions today" });
    }

    const entry = JSON.stringify({
      name: cleanName,
      score: cleanScore,
      avatarIndex: cleanAvatar,
      date: cleanDate,
    });
    await client.lPush(key, entry);

    await client.disconnect();
    return res.status(200).json({ success: true });
  } catch (error) {
    if (client.isOpen) await client.disconnect();
    return res.status(500).json({ error: "Internal server error" });
  }
}
