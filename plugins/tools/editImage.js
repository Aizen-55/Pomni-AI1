import axios from 'axios';
import FormData from 'form-data';
import sharp from 'sharp';

const client = axios.create({
  baseURL: 'https://emam-api-test.vercel.app/home/sections/Tools/api/imageEditPro'
});

const validRatios = ["1:1", "16:9", "3:2", "2:3", "4:5", "5:4", "9:16", "3:4", "4:3", "custom"];

async function uploadToImgbb(buffer) {
  const formData = new FormData();
  formData.append('source', buffer, { filename: `image-${Date.now()}.jpg` });
  formData.append('type', 'file');
  formData.append('action', 'upload');

  const config = {
    method: 'POST',
    url: 'https://imgbb.com/json',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
      'Accept': 'application/json',
      'Referer': 'https://imgbb.com/',
      'Origin': 'https://imgbb.com',
      ...formData.getHeaders()
    },
    data: formData
  };

  const { data: response } = await axios.request(config);
  return response.image.url;
}

async function convertWebpToJpeg(buffer) {
  return await sharp(buffer).jpeg().toBuffer();
}

let handler = async (m, { conn, text }) => {
  if (!text) return m.reply("النص الي هنفذو\nمثال: .صوره-تعديل اجعل لون البشرة اسود|1:1");
  if (!m.quoted || !m.quoted.mimetype || !m.quoted.mimetype.includes('image')) {
    return m.reply('الصوره الي هتعدلها');
  }

  m.reply('⏳ Processing...');

  try {
    let [prompt, size] = text.split('|');
    if (!prompt) prompt = text;

    let buffer = await m.quoted.download();
    
    if (m.quoted.mimetype === 'image/webp') {
      buffer = await convertWebpToJpeg(buffer);
    }
    
    const imageUrl = await uploadToImgbb(buffer);
    
    const payload = {
      prompt: prompt,
      image: [imageUrl]
    };
    
    if (size && validRatios.includes(size)) payload.size = size;

    const createRes = await client.post('/process-image', payload, {
      headers: {
        'Content-Type': 'application/json'
      }
    });

    const { status, recordId, message } = createRes.data;
    
    if (!status || !recordId) {
      throw new Error(message || 'Failed to start processing');
    }

    let result = null;
    let error = null;
    let maxRetries = 40;
    let retries = 0;

    while (!result && !error && retries < maxRetries) {
      await new Promise(resolve => setTimeout(resolve, 3000));
      retries++;
      
      const getRes = await client.get(`/check-result?rid=${recordId}`, {
        responseType: 'arraybuffer'
      });
      
      const contentType = getRes.headers['content-type'];
      
      if (contentType?.includes('application/json')) {
        const jsonData = JSON.parse(Buffer.from(getRes.data).toString('utf-8'));
        if (jsonData.status === false && jsonData.message !== 'Processing not completed yet') {
          error = jsonData.message;
          break;
        }
      } else if (contentType?.includes('image')) {
        result = getRes.data;
        break;
      }
    }

    if (retries >= maxRetries) throw new Error('Max retries reached, no result');
    if (error) throw new Error(error);
    if (!result) throw new Error('No result obtained');

    await conn.sendMessage(m.chat, {
      image: result,
      caption: 'Done'
    }, { quoted: m });

  } catch (e) {
    m.reply(`Error: ${e.message}`);
  }
};

handler.usage = ["تعديل"];
handler.command = ["editimage", "تعديل"];
handler.category = "tools";

export default handler;