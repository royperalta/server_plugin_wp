const express = require('express');
const { chromium } = require('playwright');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const FormData = require('form-data');
const axios = require('axios');
require('dotenv').config(); // Configurar dotenv para leer las variables de entorno
// Importar dependencias
const https = require('https'); // Importar módulo https
const http = require('http');     // Importar módulo http

const app = express();
app.use(cors());
app.use(express.json());
app.use('/output', express.static('output'));

// Asegúrate de que el directorio 'output' exista
const outputDir = './output';
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir);
}

app.post('/generate-image', async (req, res) => {
    const { imageUrl, title, logoUrl, category, categoryBgColor, categoryTextColor, postUrl,pageId,access_token } = req.body;

    try {
        const browser = await chromium.launch({ headless: true });
        const page = await browser.newPage();
        await page.setViewportSize({ width: 720, height: 1280 });

        await page.setContent(`
            <html>
                <head>
                    <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@600&display=swap" rel="stylesheet">
                    <style>
                        body {
                            display: flex;
                            flex-direction: column;
                            align-items: center;
                            justify-content: center;
                            background-color: white;
                            font-family: 'Poppins', sans-serif;
                            margin: 0;
                            height: 100vh;
                        }
                        .container {
                            position: relative;
                            width: 720px;
                            height: 1280px;
                            display: flex;
                            flex-direction: column;
                            align-items: center;
                            justify-content: center;
                        }
                        .background {
                            position: absolute;
                            top: 0;
                            left: 0;
                            width: 100%;
                            height: 100%;
                            background-image: url('${imageUrl}');
                            background-size: cover;
                            filter: blur(10px);
                            z-index: 1;
                        }
                        .image {
                            width: 95%;
                            max-height: 80%;
                            z-index: 2;
                            margin-top: 10px;
                        }
                        .logo {
                            position: absolute;
                            bottom: 20%;
                            left: 10px;
                            width: 100px;
                            border-radius: 5px;
                            z-index: 2;
                        }
                        .title { 
                            margin-top: 5px;
                            background: rgba(0, 0, 0, 0.7);
                            color: white;
                            padding: 8px;
                            font-size: 46px;
                            font-weight: 800;
                            text-align: center;
                            border-radius: 5px;
                            position: relative;
                            z-index: 2;
                            line-height: 1.2;
                        }
                        .category {
                            margin-top: 15px;
                            background: ${categoryBgColor};
                            color: ${categoryTextColor};
                            padding: 6px;
                            font-size: 32px;
                            font-weight: 500;
                            text-align: left;
                            border-radius: 5px;
                            position: relative;                            
                            z-index: 2;
                        }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="background"></div>
                        <div class="title">${title}</div>
                        <img class="image" src="${imageUrl}" alt="Imagen destacada" />
                        <img class="logo" src="${logoUrl}" alt="Logo" />
                        <div class="category">${category}</div>
                    </div>
                </body>
            </html>
        `);

        const imageBuffer = await page.screenshot();
        await browser.close();

        const uniqueId = uuidv4();
        const outputPath = path.join(outputDir, `image_${uniqueId}.png`);
        fs.writeFileSync(outputPath, imageBuffer);

        // Publicar en Facebook con la URL del post
        await postToFacebook(outputPath, title, postUrl,pageId,access_token);
        

        res.json({ imagePath: outputPath });
    } catch (error) {
        res.status(500).json({ error: 'Error al generar la imagen: ' + error.message });
    }
});

async function postToFacebook(imagePath, title, postUrl,pageId,access_token) {
    try {
        const formData = new FormData();
        formData.append('file', fs.createReadStream(imagePath)); // Crea un stream del archivo
        formData.append('message', title); // Solo el título como mensaje

        // Publicar la imagen en Facebook
        const response = await axios.post(`https://graph.facebook.com/v12.0/me/photos?access_token=${access_token}`, formData, {
            headers: {
                ...formData.getHeaders(),
            },
        });

        console.log('Imagen publicada en Facebook:', response.data);

        // Obtener el ID del post publicado
        const postId = response.data.id;

        // Ahora comentar el post con el enlace
        await axios.post(`https://graph.facebook.com/v12.0/${postId}/comments?access_token=${access_token}`, {
            message: `Más información: ${postUrl}` // El enlace del post
        });


        console.log('Comentario agregado al post:', postUrl);      

       
        // Publicar en "Your Story"
        await postToFacebookStory(imagePath, title, postUrl,pageId,access_token); // Aquí llamas a la función para publicar en las historias

    } catch (error) {
        console.error('Error al publicar en Facebook:', error.message);
    }
}


async function uploadPhoto(imagePath,pageId,access_token) {
    try {
        const formData = new FormData();
        formData.append('file', fs.createReadStream(imagePath)); // Crea un stream del archivo
        formData.append('published', 'false'); // La foto no se publicará inmediatamente

        // Cambia "me" por el ID de tu página
        const response = await axios.post(`https://graph.facebook.com/v12.0/${pageId}/photos?access_token=${access_token}`, formData, {
            headers: {
                ...formData.getHeaders(),
            },
        });

        console.log('Foto subida a Facebook:', response.data);
        return response.data.id; // Devuelve el ID de la foto
    } catch (error) {
        console.error('Error al subir la foto a Facebook:', error.response ? error.response.data : error.message);
        throw error; // Lanza el error para manejarlo en la función principal
    }
}



async function postToFacebookStory(imagePath, title, postUrl,pageId,access_token) {
    try {
        const photoId = await uploadPhoto(imagePath,pageId,access_token); // Subir la foto primero

        // Publicar la historia usando el photo_id
        const response = await axios.post(`https://graph.facebook.com/v12.0/${pageId}/photo_stories?access_token=${access_token}`, {
            photo_id: photoId, // Usa el ID de la foto
            link: postUrl, // Incluye el enlace
        });

        console.log('Historia publicada en Facebook:', response.data);
    } catch (error) {
        console.error('Error al publicar en la historia de Facebook:', error.response ? error.response.data : error.message);
    }
}



const PORT = process.env.PORT || 3700;

if (process.env.NODE_ENV === 'production') {  
    // Configuración HTTPS en producción
    const httpsOptions = {
        key: fs.readFileSync('/etc/letsencrypt/live/envivo.top/privkey.pem'), // Ruta a tu clave privada
        cert: fs.readFileSync('/etc/letsencrypt/live/envivo.top/fullchain.pem'), // Ruta a tu certificado
    };

    const httpsServer = https.createServer(httpsOptions, app);
    httpsServer.listen(PORT, () => {
        console.log('Servidor HTTPS corriendo en el puerto ' + PORT);
    });
} else {
    // Configuración HTTP en desarrollo
    const httpServer = http.createServer(app);
    httpServer.listen(PORT, () => {
        console.log('Servidor HTTP corriendo en el puerto ' + PORT);
    });
}