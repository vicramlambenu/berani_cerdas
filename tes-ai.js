require('dotenv').config();
const { GoogleGenerativeAI } = require("@google/generative-ai");

async function test() {
    try {
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel(
    { model: "gemini-pro" }, 
    { apiVersion: 'v1' }
);
        const result = await model.generateContent("Halo, apakah kamu aktif?");
        console.log("Respon AI:", result.response.text());
    } catch (err) {
        console.error("Error Detail:", err.message);
    }
}
test();